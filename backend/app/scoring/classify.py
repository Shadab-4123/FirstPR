"""Sort issues into contributor levels and contribution types.

Two simple, documented rules, so the UI can say *why* an issue is in a level:

Level: who is this issue a good fit for?
  new          "good first issue" AND estimated easy or medium: maintainers marked it
               for newcomers and the size estimate doesn't flag it as large. (Medium is
               included because the model leans toward "hard", see ml/EVAL.md: requiring
               "easy" would hide most genuinely small issues.)
  some         "good first issue" estimated hard or not estimated, or "help wanted"
               estimated easy.
  experienced  "help wanted" rated medium or hard, or a "bug" in a 1,000+ star repo
               (big codebases, triage norms, reviewers with high standards).

Type: what kind of work is it? Taken from labels first, then the title, using
the first rule that matches, in the order below (a "docs bug" is docs work).

Both are pure functions of stored columns, so the sync can recompute them for
every issue after each run whenever these rules change.
"""

import re
from typing import Literal

Level = Literal["new", "some", "experienced"]
Kind = Literal["docs", "tests", "translation", "performance", "bug", "feature", "other"]

LEVELS: tuple[Level, ...] = ("new", "some", "experienced")
KINDS: tuple[Kind, ...] = ("docs", "tests", "translation", "performance", "bug", "feature",
                           "other")

GOOD_FIRST_ISSUE = "good first issue"
HELP_WANTED = "help wanted"
BUG = "bug"
# The labels the sync searches for. An issue that loses all of them is no longer
# something maintainers are asking outsiders to pick up.
TRACKED_LABELS = (GOOD_FIRST_ISSUE, HELP_WANTED, BUG)
BIG_REPO_STARS = 1000

# Order matters: the first kind whose pattern matches wins.
_KIND_PATTERNS: tuple[tuple[Kind, re.Pattern[str]], ...] = (
    ("translation", re.compile(r"\b(translat\w*|i18n|l10n|locali[sz]\w*)\b")),
    ("docs", re.compile(r"\b(docs?|documentation|readme|typo)\b")),
    ("tests", re.compile(r"\b(tests?|testing|coverage|unit[- ]?tests?)\b")),
    ("performance", re.compile(r"\b(perf|performance|optimi[sz]\w*|slow|speed)\b")),
    ("bug", re.compile(r"\b(bug|fix|crash\w*|error|broken|regression)\b")),
    ("feature", re.compile(r"\b(feature|enhancement|feat|new|add|support)\b")),
)
# Conventional-commit style titles: "docs: ...", "fix(parser): ..."
_TITLE_PREFIX = re.compile(r"^\s*(\w+)(\([^)]*\))?!?:")


def _normalised(labels: list[str]) -> set[str]:
    return {label.strip().lower() for label in labels}


def has_tracked_label(labels: list[str]) -> bool:
    return bool(_normalised(labels) & set(TRACKED_LABELS))


def contributor_level(labels: list[str], difficulty: str | None, repo_stars: int) -> Level:
    names = _normalised(labels)
    if GOOD_FIRST_ISSUE in names:
        return "new" if difficulty in ("easy", "medium") else "some"
    if HELP_WANTED in names:
        return "some" if difficulty == "easy" else "experienced"
    if BUG in names and repo_stars >= BIG_REPO_STARS:
        return "experienced"
    return "some"  # shouldn't happen for synced issues; the middle is the safe guess


def contribution_kind(labels: list[str], title: str) -> Kind:
    # Labels are the maintainers' own classification, so they win over the title.
    # "good first issue" / "help wanted" say who it's for, not what the work is.
    label_text = " ".join(_normalised(labels) - {GOOD_FIRST_ISSUE, HELP_WANTED})
    for kind, pattern in _KIND_PATTERNS:
        if pattern.search(label_text):
            return kind
    prefix = _TITLE_PREFIX.match(title)
    title_text = (prefix.group(1) if prefix else title).lower()
    for kind, pattern in _KIND_PATTERNS:
        if pattern.search(title_text):
            return kind
    return "other"
