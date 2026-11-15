"""Build GitHub search queries and split them to get past the 1,000-result cap.

GitHub search returns at most 1,000 results per query no matter how many match.
For Python alone there are tens of thousands of open good-first-issues, so we
slice by created-date window and halve any window that still matches > 1,000.
"""

from dataclasses import dataclass
from datetime import date, timedelta

SEARCH_RESULT_CAP = 1000
# Open, unclaimed issues; the label decides which pool (beginner, help wanted, bug).
OPEN_UNCLAIMED = "state:open is:issue no:assignee archived:false"
GOOD_FIRST_ISSUE = "good first issue"
# GitHub rejects search queries longer than 256 characters.
MAX_QUERY_CHARS = 256


@dataclass(frozen=True)
class Window:
    start: date  # inclusive
    end: date  # inclusive

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1

    def split(self) -> tuple["Window", "Window"]:
        """Halve the window. Only valid when it spans at least two days."""
        if self.days < 2:
            raise ValueError("cannot split a one-day window")
        mid = self.start + timedelta(days=self.days // 2 - 1)
        return Window(self.start, mid), Window(mid + timedelta(days=1), self.end)


def build_query(language: str, window: Window, label: str = GOOD_FIRST_ISSUE) -> str:
    lang = f'"{language}"' if " " in language else language
    return (f'label:"{label}" {OPEN_UNCLAIMED} language:{lang} '
            f"created:{window.start}..{window.end}")


def batch_repo_queries(base: str, repos: list[str]) -> list[str]:
    """Pack `repo:` qualifiers into as few queries as fit GitHub's 256-char limit.

    Issue search can't filter by repo stars, so "bugs in big repos" means naming
    the big repos we already know, several per query.
    """
    queries: list[str] = []
    current = base
    for name in repos:
        qualifier = f" repo:{name}"
        if len(base) + len(qualifier) > MAX_QUERY_CHARS:
            continue  # absurdly long name; can't fit even alone
        if len(current) + len(qualifier) > MAX_QUERY_CHARS:
            queries.append(current)
            current = base
        current += qualifier
    if current != base:
        queries.append(current)
    return queries


def initial_windows(today: date, lookback_days: int, chunk_days: int = 30) -> list[Window]:
    """Newest-first windows of `chunk_days` covering the last `lookback_days`."""
    windows = []
    end = today
    earliest = today - timedelta(days=lookback_days - 1)
    while end >= earliest:
        start = max(earliest, end - timedelta(days=chunk_days - 1))
        windows.append(Window(start, end))
        end = start - timedelta(days=1)
    return windows


def needs_split(total_count: int, window: Window) -> bool:
    return total_count > SEARCH_RESULT_CAP and window.days >= 2
