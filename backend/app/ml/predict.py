"""Score live issues with the trained difficulty model (ml/difficulty_model.joblib).

Runs inside the sync, never in the API: the API only reads the stored label,
confidence and reasons, so it doesn't need scikit-learn.

Why each prediction is explainable: the model is a logistic regression, so every
feature's push toward a band is just weight x (standardised) value. The biggest
pushes toward the predicted band become the reasons shown on the issue page.
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

log = logging.getLogger("firstpr.ml.predict")

METHOD = "model_v1"  # stored in issues.difficulty_method; bump when the model changes
DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[3] / "ml" / "difficulty_model.joblib"
MAX_REASONS = 3
MIN_PUSH = 0.10  # ignore features that barely moved the prediction

# Only reasons about the issue itself are shown. Title length, repo size and language
# are real signals in the model, but as explanations they confuse more than they help
# ("short, specific title" -> hard), so they're left out of what users see.
HIDDEN_FROM_REASONS = {"log_title_length", "log_stars", "log_forks"}

# Plain-language reason for a feature, depending on whether its value is high or low
# for this issue (relative to the training data). None = don't mention it.
PHRASES: dict[str, tuple[str | None, str | None]] = {
    "log_body_length": ("long, detailed description", "short description"),
    "code_blocks": ("includes code samples", None),
    "inline_code": ("names specific functions or code", "doesn't point at specific code"),
    "file_paths": ("mentions several files", None),
    "checklist_items": ("has a task checklist", None),
    "links": ("links to related material", None),
    "log_comments": ("a lot of discussion already", "little discussion so far"),
    "label_count": ("many labels", "few labels"),
    "easy_labels": ("labelled docs, typo or beginner", None),
    "hard_labels": ("labelled refactor, performance or security", None),
    "maintainer_authored": ("written by a maintainer", "written by a community member"),
}


@dataclass(frozen=True)
class Prediction:
    label: str  # easy / medium / hard
    confidence: float  # probability of that label, 0..1
    hours: float  # see ml/EVAL.md: mostly waiting time; never shown as "time to fix"
    reasons: list[str]


class DifficultyModel:
    def __init__(self, bundle: dict[str, Any]):
        self.classifier = bundle["model"]
        self.hours_model = bundle["hours_model"]
        self.features: list[str] = bundle["features"]
        self._scaler, self._logreg = self.classifier[0], self.classifier[-1]

    @classmethod
    def load(cls, path: Path | None = None) -> "DifficultyModel | None":
        """None (with a warning) if scikit-learn or the file is missing: callers fall
        back to the heuristic, so local dev works without the `ml` extras."""
        try:
            import joblib
        except ImportError:
            log.warning("scikit-learn not installed; using the heuristic for difficulty")
            return None
        if path is None:
            from app.core.config import get_settings

            configured = get_settings().difficulty_model_path
            path = Path(configured) if configured else DEFAULT_MODEL_PATH
        if not path.exists():
            log.warning("model file missing; using the heuristic", extra={"path": str(path)})
            return None
        return cls(joblib.load(path))

    def predict(self, rows: list[dict[str, float]]) -> list[Prediction]:
        if not rows:
            return []
        import numpy as np
        import pandas as pd

        x = pd.DataFrame(rows)[self.features]  # same column order as training
        proba = self.classifier.predict_proba(x)
        hours = np.expm1(self.hours_model.predict(x))
        scaled = self._scaler.transform(x)
        classes = list(self._logreg.classes_)
        out = []
        for i in range(len(rows)):
            best = int(proba[i].argmax())
            pushes = self._logreg.coef_[best] * scaled[i]
            out.append(Prediction(
                label=classes[best], confidence=round(float(proba[i][best]), 3),
                hours=round(float(hours[i]), 1),
                reasons=self._reasons(pushes, scaled[i]),
            ))
        return out

    def _reasons(self, pushes: Any, scaled_row: Any) -> list[str]:
        reasons: list[str] = []
        for j in sorted(range(len(pushes)), key=lambda k: -pushes[k]):
            if pushes[j] < MIN_PUSH or len(reasons) == MAX_REASONS:
                break
            name = self.features[j]
            if name in HIDDEN_FROM_REASONS or name.startswith("lang_"):
                continue
            high, low = PHRASES.get(name, (None, None))
            phrase = high if scaled_row[j] > 0 else low
            if phrase:
                reasons.append(phrase)
        return reasons

