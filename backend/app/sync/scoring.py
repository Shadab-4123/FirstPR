"""Recompute every open issue's difficulty (model) and level/type, after each sync or re-check.

Order matters: level depends on the difficulty label, so difficulty goes first.

An issue can only be scored by the model when its stored text signals are complete.
Rows saved before extract_signals() gained new keys lack some of them:
- if the stored body is the whole body, the signals are recomputed from it;
- otherwise the issue keeps the heuristic estimate until the re-check stores its
  full text, and `difficulty_method` says which method produced the label.
"""

import logging
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db.models import Issue, Repo
from app.ml.dataset import SIGNAL_KEYS, feature_row
from app.ml.predict import METHOD, DifficultyModel
from app.scoring.difficulty import extract_signals, score_difficulty
from app.sync.upsert import reclassify_issues

log = logging.getLogger("firstpr.scoring")

HEURISTIC = "baseline_heuristic"


def complete_signals(issue: Any) -> dict[str, int] | None:
    """Signals the model can use, or None if this issue's text is too incomplete."""
    signals = issue.difficulty_signals or {}
    if all(key in signals for key in SIGNAL_KEYS):
        return signals
    full_length = signals.get("body_length", 0)
    if len(issue.body_excerpt) >= full_length:  # we hold the whole body: recompute exactly
        return extract_signals(issue.body_excerpt, issue.labels, issue.comments_count,
                               title=issue.title)
    return None


def rescore_difficulty(db: Session, model: DifficultyModel | None) -> dict[str, int]:
    rows = db.execute(
        select(Issue.id, Issue.title, Issue.body_excerpt, Issue.labels, Issue.comments_count,
               Issue.author_association, Issue.difficulty_signals, Repo.stars, Repo.forks,
               Repo.language)
        .join(Repo, Issue.repo_id == Repo.id)
        .where(Issue.state == "open")
    ).all()

    scorable, updates = [], []
    for r in rows:
        signals = complete_signals(r) if model else None
        if signals is None:
            result = score_difficulty(r.difficulty_signals or {})
            updates.append({"id": r.id, "difficulty_label": result.label,
                            "difficulty_method": HEURISTIC, "difficulty_confidence": None,
                            "difficulty_reasons": result.reasons, "est_hours": None})
        else:
            scorable.append((r, signals))

    if model and scorable:
        features = [
            feature_row(signals, author_association=r.author_association, stars=r.stars,
                        forks=r.forks, language=r.language)
            for r, signals in scorable
        ]
        for (r, signals), p in zip(scorable, model.predict(features), strict=True):
            updates.append({"id": r.id, "difficulty_signals": signals,
                            "difficulty_label": p.label, "difficulty_method": METHOD,
                            "difficulty_confidence": p.confidence,
                            "difficulty_reasons": p.reasons, "est_hours": p.hours})

    if updates:
        db.execute(update(Issue), updates)
    db.commit()
    counts = {"model": len(scorable) if model else 0, "heuristic": len(rows) - len(scorable)}
    log.info("difficulty rescored", extra=counts)
    return counts


def rescore_issues(db: Session, model: DifficultyModel | None) -> dict[str, int]:
    counts = rescore_difficulty(db, model)
    counts["classified"] = reclassify_issues(db)
    return counts
