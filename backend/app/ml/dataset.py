"""Turn training_examples rows into (features, targets), the same way for training and serving.

Everything here is a pure function of one example, so it can be unit-tested and so
the live sync can build the identical feature row for an open issue later.

Filtering rules (each one is in EVAL.md with its count):
- PR opened less than an hour after the issue: the author was almost certainly
  documenting work already in progress, not leaving a task for someone else.
- 0 lines changed, or more than 5,000: empty or generated changes (lockfiles,
  vendored code), not human effort.

Bands, from the merged PR (cutoffs sit near the data's tertiles, rounded so they
can be explained in one sentence):
  easy    <= 20 lines and <= 2 files
  hard    >  100 lines or > 5 files
  medium  everything else
"""

import math
from datetime import timedelta
from typing import Any, Literal

from app.scoring.difficulty import extract_signals

Band = Literal["easy", "medium", "hard"]
BANDS: tuple[Band, ...] = ("easy", "medium", "hard")

MIN_PICKUP = timedelta(hours=1)
MAX_LINES = 5000
EASY_MAX_LINES, EASY_MAX_FILES = 20, 2
HARD_MIN_LINES, HARD_MIN_FILES = 100, 5

# One-hot columns; anything else is "other". Matches the languages the sync covers.
LANGUAGES = ("Python", "JavaScript", "TypeScript", "Go", "Rust", "Java", "C++", "C#", "Ruby",
             "PHP")
MAINTAINER_ROLES = {"OWNER", "MEMBER", "COLLABORATOR"}


def keep_example(ex: dict[str, Any]) -> str | None:
    """None if the example is usable, else the reason it's dropped."""
    if ex["pr_created_at"] - ex["issue_created_at"] < MIN_PICKUP:
        return "pr_within_an_hour"
    if not 1 <= ex["lines_changed"] <= MAX_LINES:
        return "lines_out_of_range"
    return None


def effort_band(lines_changed: int, files_changed: int) -> Band:
    if lines_changed <= EASY_MAX_LINES and files_changed <= EASY_MAX_FILES:
        return "easy"
    if lines_changed > HARD_MIN_LINES or files_changed > HARD_MIN_FILES:
        return "hard"
    return "medium"


SIGNAL_KEYS = ("body_length", "title_length", "code_blocks", "inline_code", "file_paths",
               "checklist_items", "links", "comments", "label_count", "easy_labels",
               "hard_labels")


def feature_row(
    signals: dict[str, int], *, author_association: str | None, stars: int, forks: int,
    language: str | None,
) -> dict[str, float]:
    """Numbers the model sees. Only things knowable while the issue is open.

    `signals` comes from extract_signals(): at training time from the stored issue text,
    on live issues from Issue.difficulty_signals, which the sync computes from the full
    body. Same function both ways, so training and serving can't drift apart.
    """
    row: dict[str, float] = {
        # Lengths and counts are heavy-tailed; log keeps a 20k-char body from dominating.
        "log_body_length": math.log1p(signals["body_length"]),
        "log_title_length": math.log1p(signals["title_length"]),
        "code_blocks": signals["code_blocks"],
        "inline_code": signals["inline_code"],
        "file_paths": signals["file_paths"],
        "checklist_items": signals["checklist_items"],
        "links": signals["links"],
        "log_comments": math.log1p(signals["comments"]),
        "label_count": signals["label_count"],
        "easy_labels": signals["easy_labels"],
        "hard_labels": signals["hard_labels"],
        "maintainer_authored": float(author_association in MAINTAINER_ROLES),
        "log_stars": math.log1p(stars),
        "log_forks": math.log1p(forks),
    }
    for lang in LANGUAGES:
        row[f"lang_{lang}"] = float(language == lang)
    row["lang_other"] = float(language not in LANGUAGES)
    return row


def example_signals(ex: dict[str, Any]) -> dict[str, int]:
    """Text signals for a training example; also what the heuristic baseline sees."""
    raw = ex["raw"]
    # Only comments posted before the fix existed (collect.py drops the rest).
    return extract_signals(raw["body"], raw["labels"], len(raw["comments_pre_pr"]),
                           title=raw["title"])


def example_features(ex: dict[str, Any]) -> dict[str, float]:
    raw = ex["raw"]
    return feature_row(
        example_signals(ex), author_association=raw.get("author_association"),
        stars=raw["repo"]["stars"], forks=raw["repo"]["forks"], language=ex["language"],
    )
