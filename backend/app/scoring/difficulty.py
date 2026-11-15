"""Baseline difficulty heuristic.

This is model #1 from the blueprint: a hand-written formula. It exists so the
week-3 ML model has something honest to beat. Every number here is a guess,
and the README must say so until EVAL.md proves otherwise.

Design: `extract_signals` turns raw issue text into numbers (stored as JSONB),
and `score_difficulty` turns those numbers into a score. Keeping the two apart
means we can change the formula and re-score every row without re-crawling.
"""

import re
from dataclasses import dataclass, field
from typing import Literal

DifficultyLabel = Literal["easy", "medium", "hard"]

EASY_LABEL_HINTS = ("documentation", "docs", "typo", "beginner", "easy", "starter", "trivial")
HARD_LABEL_HINTS = ("refactor", "performance", "security", "breaking", "architecture")

_CODE_FENCE = re.compile(r"```")
# Things that look like a file path: src/utils/date.py, ./lib/foo.ts
_FILE_PATH = re.compile(r"(?:[\w.-]+/)+[\w.-]+\.\w{1,6}\b")

_INLINE_CODE = re.compile(r"`[^`\n]+`")  # `parse_date()`, `--verbose`
_CHECKBOX = re.compile(r"^\s*[-*] \[[ xX]\]", re.MULTILINE)  # task-list items
_LINK = re.compile(r"https?://")
# Same cap as the training data (app/ml/collect.py), so live and training text match.
MAX_BODY_CHARS = 8000

EASY_MAX = 0.35
MEDIUM_MAX = 0.60


def extract_signals(
    body: str | None, labels: list[str], comments_count: int, title: str = ""
) -> dict[str, int]:
    """Numbers describing an issue, from what's visible while it is open.

    Used twice, so it must stay deterministic and identical in both places:
    by the sync on live issues, and by app/ml to build training features.
    """
    body = (body or "")[:MAX_BODY_CHARS]
    lowered = [label.lower() for label in labels]
    return {
        "body_length": len(body),
        "title_length": len(title),
        "inline_code": len(_INLINE_CODE.findall(body)),
        "checklist_items": len(_CHECKBOX.findall(body)),
        "links": len(_LINK.findall(body)),
        "label_count": len(labels),
        "code_blocks": len(_CODE_FENCE.findall(body)) // 2,
        "file_paths": len(set(_FILE_PATH.findall(body))),
        "comments": comments_count,
        "easy_labels": sum(any(h in label for h in EASY_LABEL_HINTS) for label in lowered),
        "hard_labels": sum(any(h in label for h in HARD_LABEL_HINTS) for label in lowered),
    }


@dataclass
class DifficultyResult:
    score: float  # 0 (trivial) .. 1 (hard)
    label: DifficultyLabel
    reasons: list[str] = field(default_factory=list)


def score_difficulty(signals: dict[str, int]) -> DifficultyResult:
    score = 0.30
    reasons: list[str] = []

    body_length = signals.get("body_length", 0)
    if body_length > 1500:
        bump = min((body_length - 1500) / 6000, 0.20)
        score += bump
        reasons.append("long description")
    elif body_length < 80:
        # Very short issues are often vague, which is its own kind of hard.
        score += 0.05
        reasons.append("very short description")

    comments = signals.get("comments", 0)
    if comments >= 5:
        score += min(comments / 40, 0.20)
        reasons.append(f"{comments} comments of discussion")

    if signals.get("code_blocks", 0) >= 2:
        score += 0.05
        reasons.append("several code samples")

    file_paths = signals.get("file_paths", 0)
    if file_paths == 1:
        score -= 0.05
        reasons.append("points to a specific file")
    elif file_paths >= 4:
        score += 0.10
        reasons.append(f"touches {file_paths} files")

    if signals.get("easy_labels", 0):
        score -= 0.15
        reasons.append("labelled docs, typo or beginner")
    if signals.get("hard_labels", 0):
        score += 0.20
        reasons.append("labelled refactor, performance or security")

    score = round(max(0.0, min(1.0, score)), 3)
    label: DifficultyLabel
    if score < EASY_MAX:
        label = "easy"
    elif score < MEDIUM_MAX:
        label = "medium"
    else:
        label = "hard"
    return DifficultyResult(score=score, label=label, reasons=reasons)
