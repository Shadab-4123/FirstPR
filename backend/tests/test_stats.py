"""The public stats page: index counts, sync freshness and model results."""

import copy
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

from app.db.models import Issue, SyncRun
from app.db.session import get_db
from app.main import app
from app.ml.card import PUBLISHED_RESULTS
from app.sync.mapping import map_issue, map_repo
from app.sync.upsert import upsert_issue, upsert_repo

REPO_ROOT = Path(__file__).parents[2]


@pytest.fixture
def client(db_session_factory):
    def override():
        with db_session_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_published_results_match_the_canonical_file():
    """The API's copy must be what ml/EVAL.md describes, never an older run."""
    assert PUBLISHED_RESULTS.read_text() == (REPO_ROOT / "ml" / "results.json").read_text()


def test_stats_counts_runs_and_model(client, db_session_factory, fixture):
    items = fixture("search_issues_python.json")["items"]
    now = datetime.now(UTC)
    with db_session_factory() as db:
        repo_id = upsert_repo(db, map_repo(fixture("repo.json")), etag=None)
        ids = [upsert_issue(db, map_issue(copy.deepcopy(item), repo_id)) for item in items[:3]]
        db.execute(update(Issue).where(Issue.id == ids[0])
                   .values(is_available=False, unavailable_reason="claimed"))
        db.execute(update(Issue).where(Issue.id == ids[1])
                   .values(difficulty_method="model_v1", level="new"))
        db.add_all([
            SyncRun(query="languages=python labels=good first issue", status="succeeded",
                    started_at=now - timedelta(hours=5), finished_at=now - timedelta(hours=4),
                    issues_upserted=40),
            SyncRun(query="recheck max=500", status="succeeded",
                    started_at=now - timedelta(hours=3), finished_at=now - timedelta(hours=2)),
            SyncRun(query="languages=go labels=help wanted", status="failed",
                    started_at=now - timedelta(hours=1)),
        ])
        db.commit()

    data = client.get("/api/v1/stats").json()

    assert data["issues_indexed"] == 3 and data["issues_available"] == 2
    assert data["hidden_by_reason"] == [{"value": "claimed", "count": 1}]
    assert data["model_scored"] == 1
    assert {"value": "new", "count": 1} in data["by_level"]
    assert data["by_language"][0]["count"] == 2
    # A failed run is listed but never counts as "last sync".
    assert [r["kind"] for r in data["recent_runs"]] == ["sync", "recheck", "sync"]
    assert data["recent_runs"][0]["status"] == "failed"
    assert data["last_sync"]["issues_upserted"] == 40
    assert data["last_recheck"]["kind"] == "recheck"

    model = data["model"]
    assert model["model"]["accuracy"] > model["heuristic"]["accuracy"]
    assert model["model"]["severe_error_rate"] < model["heuristic"]["severe_error_rate"]
    assert model["test_examples"] > 0 and len(model["test_period"]) == 2


def test_stats_without_any_data(client, db_session_factory):
    data = client.get("/api/v1/stats").json()
    assert data["issues_indexed"] == 0 and data["last_sync"] is None
    assert data["recent_runs"] == [] and data["hidden_by_reason"] == []
