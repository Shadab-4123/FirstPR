from datetime import date

import pytest

from app.sync.discover import Window, build_query, initial_windows, needs_split


def test_query_contains_all_qualifiers():
    q = build_query("python", Window(date(2026, 1, 1), date(2026, 1, 31)))
    assert 'label:"good first issue"' in q
    assert "is:issue" in q and "no:assignee" in q and "archived:false" in q
    assert "language:python" in q
    assert "created:2026-01-01..2026-01-31" in q


def test_language_with_space_is_quoted():
    assert 'language:"jupyter notebook"' in build_query("jupyter notebook", Window(
        date(2026, 1, 1), date(2026, 1, 1)))


@pytest.mark.parametrize("days", [2, 3, 30, 31])
def test_split_covers_window_exactly_without_overlap(days):
    w = Window(date(2026, 1, 1), date(2026, 1, days))
    left, right = w.split()
    assert left.start == w.start and right.end == w.end
    assert (right.start - left.end).days == 1
    assert left.days + right.days == w.days


def test_one_day_window_cannot_split():
    with pytest.raises(ValueError):
        Window(date(2026, 1, 1), date(2026, 1, 1)).split()


def test_initial_windows_are_newest_first_and_contiguous():
    windows = initial_windows(date(2026, 3, 31), lookback_days=75, chunk_days=30)
    assert windows[0].end == date(2026, 3, 31)
    assert sum(w.days for w in windows) == 75
    for newer, older in zip(windows, windows[1:], strict=False):
        assert (newer.start - older.end).days == 1


def test_needs_split_only_over_cap():
    w = Window(date(2026, 1, 1), date(2026, 1, 10))
    assert needs_split(1001, w)
    assert not needs_split(1000, w)
    assert not needs_split(5000, Window(date(2026, 1, 1), date(2026, 1, 1)))
