"""Labels, filters and features for the difficulty model. Pure functions, no sklearn needed."""

import math
from datetime import UTC, datetime, timedelta

import pytest

from app.ml.dataset import (
    SIGNAL_KEYS,
    effort_band,
    example_features,
    feature_row,
    keep_example,
)
from app.scoring.difficulty import extract_signals

T0 = datetime(2026, 1, 1, tzinfo=UTC)


def example(**overrides):
    ex = {
        "issue_created_at": T0, "pr_created_at": T0 + timedelta(days=2),
        "lines_changed": 40, "files_changed": 2, "language": "Python",
        "raw": {"title": "Fix parser", "body": "See `src/parser.py`", "labels": ["bug"],
                "author_association": "MEMBER", "comments_pre_pr": [{"body": "on it"}],
                "comments_total": 9, "repo": {"stars": 1200, "forks": 80}},
    }
    return {**ex, **overrides}


@pytest.mark.parametrize(
    "lines, files, band",
    [(1, 1, "easy"), (20, 2, "easy"), (21, 1, "medium"), (5, 3, "medium"),
     (100, 5, "medium"), (101, 1, "hard"), (10, 6, "hard")],
)
def test_effort_band_boundaries(lines, files, band):
    assert effort_band(lines, files) == band


@pytest.mark.parametrize(
    "overrides, reason",
    [
        ({"pr_created_at": T0 + timedelta(minutes=20)}, "pr_within_an_hour"),
        ({"lines_changed": 0}, "lines_out_of_range"),
        ({"lines_changed": 12_000}, "lines_out_of_range"),  # lockfiles, vendored code
        ({}, None),
    ],
)
def test_filters(overrides, reason):
    assert keep_example(example(**overrides)) == reason


def test_features_use_only_comments_from_before_the_fix():
    """comments_total includes post-PR discussion; the model must only see pre-PR ones."""
    features = example_features(example())
    assert features["log_comments"] == pytest.approx(math.log1p(1))  # not log1p(9)


def test_feature_row_is_complete_and_finite():
    features = example_features(example())
    assert features["maintainer_authored"] == 1.0
    assert features["lang_Python"] == 1.0 and features["lang_other"] == 0.0
    assert all(math.isfinite(v) for v in features.values())


def test_unknown_language_goes_to_other():
    row = feature_row(extract_signals("", [], 0), author_association=None, stars=0, forks=0,
                      language="Zig")
    assert row["lang_other"] == 1.0 and row["maintainer_authored"] == 0.0


def test_signal_keys_match_what_the_sync_stores():
    """Serving reads Issue.difficulty_signals; if extract_signals changes, this catches drift."""
    assert set(extract_signals("x", [], 0)) == set(SIGNAL_KEYS)
