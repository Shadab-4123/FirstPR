from datetime import UTC, datetime, timedelta

import pytest

from app.scoring.health import score_repo_health

NOW = datetime(2026, 11, 15, tzinfo=UTC)


def health(**overrides):
    kwargs = {"archived": False, "pushed_at": NOW - timedelta(days=5), "stars": 500,
              "forks": 50, "has_contributing": None, "now": NOW}
    return score_repo_health(**{**kwargs, **overrides})


def test_archived_repo_scores_zero_whatever_else():
    result = health(archived=True, stars=100_000, forks=10_000, has_contributing=True)
    assert result.score == 0 and "archived" in result.reasons[0]


def test_big_active_documented_repo_scores_100():
    assert health(stars=50_000, forks=5_000, has_contributing=True).score == 100


@pytest.mark.parametrize("days, points", [(0, 40), (30, 40), (31, 30), (90, 30), (91, 15),
                                          (365, 5), (366, 0)])
def test_activity_points_step_down_at_boundaries(days, points):
    base = health(stars=0, forks=0, has_contributing=False, pushed_at=NOW)
    result = health(stars=0, forks=0, has_contributing=False,
                    pushed_at=NOW - timedelta(days=days))
    assert base.score - result.score == 40 - points


def test_recent_push_beats_popularity():
    """A small active repo is a better bet for a first PR than a famous dead one."""
    alive = health(stars=50, forks=5, pushed_at=NOW - timedelta(days=3))
    dead = health(stars=20_000, forks=2_000, pushed_at=NOW - timedelta(days=500))
    assert alive.score > dead.score


def test_stars_have_diminishing_returns():
    gain_low = health(stars=100).score - health(stars=10).score
    gain_high = health(stars=10_100).score - health(stars=10_000).score
    assert gain_low > gain_high == 0


def test_unknown_contributing_is_neutral_not_punished():
    unknown = health(has_contributing=None).score
    assert health(has_contributing=False).score < unknown < health(has_contributing=True).score


def test_missing_push_date_and_zero_counts_do_not_crash():
    result = health(pushed_at=None, stars=0, forks=0)
    assert 0 <= result.score <= 100
    assert "no push date known" in result.reasons


def test_score_always_in_range_and_explained():
    for stars in (0, 1, 999, 10**7):
        result = health(stars=stars, forks=stars)
        assert 0 <= result.score <= 100
        assert len(result.reasons) == 4  # activity, stars, forks, docs


def test_rescore_writes_scores_for_every_repo(db_session_factory, fixture):
    from sqlalchemy import select

    from app.db.models import Repo
    from app.sync.mapping import map_repo
    from app.sync.upsert import rescore_repo_health, upsert_repo

    with db_session_factory() as db:
        upsert_repo(db, map_repo(fixture("repo.json")), etag=None)
        upsert_repo(db, {**map_repo(fixture("repo.json")), "github_id": 1, "full_name": "a/b",
                         "archived": True}, etag=None)
        db.commit()
        assert rescore_repo_health(db) == 2
        scores = dict(db.execute(select(Repo.full_name, Repo.health_score)).all())
    assert scores["a/b"] == 0
    assert scores["andrewsiah/agentswarm-data-tasks"] is not None
