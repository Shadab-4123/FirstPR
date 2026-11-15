"""Train and evaluate the difficulty model against two baselines.

Protocol (why each step exists is in ml/EVAL.md):
1. Filter and label examples (app/ml/dataset.py).
2. Sort by when the issue closed. Oldest 80% = train, newest 20% = test.
   Splitting by time, not at random, means we never learn from the future.
3. Pick the model on a validation slice cut from the *end of the train period*.
   The test set is scored exactly once, after the choice is made.
4. Compare against: always guessing the most common band, and the hand-written
   heuristic the site uses today.

Usage (from backend/, with `pip install -e ".[ml]"`):
    DATABASE_URL=postgresql+psycopg://firstpr@localhost:5433/firstpr \
        python -m app.ml.train --out ../ml
"""

import argparse
import json
from collections import Counter
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import TrainingExample
from app.ml.dataset import (
    BANDS,
    effort_band,
    example_features,
    example_signals,
    keep_example,
)
from app.scoring.difficulty import score_difficulty

SEED = 42
TEST_SHARE = 0.20
VALIDATION_SHARE = 0.20  # of the train period
# Confidence buckets for the UI's note: how often is the model right when it's sure?
CONFIDENT_AT = 0.60


def load_examples(database_url: str) -> list[dict[str, Any]]:
    engine = create_engine(database_url)
    with Session(engine) as db:
        rows = db.execute(select(TrainingExample).order_by(TrainingExample.issue_closed_at))
        return [
            {c.name: getattr(r, c.name) for c in TrainingExample.__table__.columns}
            for r in rows.scalars()
        ]


def candidates() -> dict[str, Any]:
    return {
        "logistic_regression": make_pipeline(
            StandardScaler(),
            LogisticRegression(max_iter=2000, class_weight="balanced", random_state=SEED),
        ),
        "gradient_boosting": HistGradientBoostingClassifier(
            max_iter=300, learning_rate=0.05, max_leaf_nodes=15, l2_regularization=1.0,
            class_weight="balanced", random_state=SEED,
        ),
    }


def band_metrics(y_true: Sequence[str], y_pred: Sequence[str]) -> dict[str, Any]:
    # rows = actual band, columns = predicted band, both in BANDS order
    confusion = confusion_matrix(y_true, y_pred, labels=list(BANDS))
    return {
        "accuracy": round(accuracy_score(y_true, y_pred), 3),
        "macro_f1": round(f1_score(y_true, y_pred, labels=list(BANDS), average="macro"), 3),
        # Easy called hard, or hard called easy: the mistake that misleads a newcomer most.
        "severe_error_rate": round(float(confusion[0, 2] + confusion[2, 0]) / len(y_true), 3),
        "confusion": confusion.tolist(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the difficulty model")
    parser.add_argument("--out", type=Path, default=Path("../ml"))
    args = parser.parse_args()

    examples = load_examples(get_settings().database_url)
    dropped = Counter(r for ex in examples if (r := keep_example(ex)))
    kept = [ex for ex in examples if keep_example(ex) is None]  # still sorted by close time

    n_test = int(len(kept) * TEST_SHARE)
    train, test = kept[:-n_test], kept[-n_test:]
    n_val = int(len(train) * VALIDATION_SHARE)
    fit_part, val_part = train[:-n_val], train[-n_val:]

    def xy(rows: list[dict]) -> tuple[pd.DataFrame, list[str], np.ndarray]:
        x = pd.DataFrame([example_features(ex) for ex in rows])
        y: list[str] = [effort_band(ex["lines_changed"], ex["files_changed"]) for ex in rows]
        hours = np.array([ex["pr_merged_hours"] for ex in rows])
        return x, y, hours

    x_fit, y_fit, _ = xy(fit_part)
    x_val, y_val, _ = xy(val_part)
    x_train, y_train, h_train = xy(train)
    x_test, y_test, h_test = xy(test)

    # 1. Choose the model on validation only.
    val_scores = {}
    for name, model in candidates().items():
        model.fit(x_fit, y_fit)
        val_scores[name] = round(f1_score(y_val, model.predict(x_val), average="macro"), 3)
    chosen = max(val_scores, key=lambda n: val_scores[n])

    # 2. Refit the chosen model on the whole train period; score test once.
    model = candidates()[chosen]
    model.fit(x_train, y_train)
    pred = list(model.predict(x_test))
    proba = model.predict_proba(x_test).max(axis=1)
    confident = proba >= CONFIDENT_AT
    y_test_arr, pred_arr = np.array(y_test), np.array(pred)

    # 3. Baselines on the same test set.
    majority = Counter(y_train).most_common(1)[0][0]
    heuristic = [score_difficulty(example_signals(ex)).label for ex in test]

    # 4. Hours to merge: a weak target (mostly waiting time), reported for honesty.
    hours_model = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05,
                                                random_state=SEED)
    hours_model.fit(x_train, np.log1p(h_train))
    h_pred = np.expm1(hours_model.predict(x_test))
    h_median = float(np.median(h_train))

    def hour_errors(predicted: np.ndarray) -> dict[str, float]:
        err = np.abs(predicted - h_test)
        return {"mae_hours": round(float(err.mean()), 1),
                "median_abs_error_hours": round(float(np.median(err)), 1)}

    results = {
        "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "data": {
            "collected": len(examples), "dropped": dict(dropped), "used": len(kept),
            "train": len(train), "test": len(test),
            "train_period": [str(train[0]["issue_closed_at"].date()),
                             str(train[-1]["issue_closed_at"].date())],
            "test_period": [str(test[0]["issue_closed_at"].date()),
                            str(test[-1]["issue_closed_at"].date())],
            "test_band_counts": dict(Counter(y_test)),
        },
        "validation_macro_f1": val_scores,
        "chosen_model": chosen,
        "bands": {
            "majority_class": {"predicts": majority,
                               **band_metrics(y_test, [majority] * len(y_test))},
            "heuristic_baseline": band_metrics(y_test, heuristic),
            "model": band_metrics(y_test, pred),
        },
        "confidence": {
            "threshold": CONFIDENT_AT,
            "share_confident": round(float(confident.mean()), 3),
            "accuracy_when_confident": round(float((pred_arr == y_test_arr)[confident].mean()), 3)
            if confident.any() else None,
            "accuracy_when_unsure": round(float((pred_arr == y_test_arr)[~confident].mean()), 3)
            if (~confident).any() else None,
        },
        "hours": {"median_baseline": {"predicts": round(h_median, 1), **hour_errors(
            np.full_like(h_test, h_median))}, "model": hour_errors(h_pred)},
    }

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    joblib.dump(
        {"model": model, "hours_model": hours_model, "features": list(x_train.columns),
         "bands": list(BANDS), "chosen": chosen, "trained_at": results["trained_at"]},
        args.out / "difficulty_model.joblib",
    )
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
