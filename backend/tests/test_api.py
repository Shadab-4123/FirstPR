"""HTTP-level tests: the real FastAPI app against the real test schema."""

import copy

import pytest
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import app
from app.sync.mapping import map_issue, map_repo
from app.sync.upsert import reclassify_issues, rescore_repo_health, upsert_issue, upsert_repo


@pytest.fixture
def client(db_session_factory):
    def override():
        with db_session_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def seed(db_session_factory, fixture):
    """Store issues the way the sync would; returns a function taking item overrides."""

    def add(**overrides) -> int:
        item = {**copy.deepcopy(fixture("search_issues_python.json")["items"][0]), **overrides}
        with db_session_factory() as db:
            repo_id = upsert_repo(db, map_repo(fixture("repo.json")), etag=None)
            issue_id = upsert_issue(db, map_issue(item, repo_id))
            rescore_repo_health(db)
            reclassify_issues(db)
            db.commit()
        return issue_id

    return add


def test_detail_returns_the_long_body_and_glance_facts(client, seed):
    body = "## What\n" + "Explain the parser. " * 100  # ~2,000 chars
    issue_id = seed(body=body)

    data = client.get(f"/api/v1/issues/{issue_id}").json()

    assert data["body"] == body and data["body_truncated"] is False
    assert len(data["body_excerpt"]) == 600  # the short preview is still there
    assert data["created_at"] and data["repo"]["full_name"]
    assert data["assignee_count"] == 0 and data["has_linked_pr"] is False
    assert data["score_breakdown"]["health"]["score"] is not None


def test_long_body_is_flagged_and_cut_on_a_whole_word(client, seed):
    issue_id = seed(body="parser " * 1000)  # 7,000 chars; we store 4,000
    data = client.get(f"/api/v1/issues/{issue_id}").json()
    assert data["body_truncated"] is True
    assert data["body"].endswith("parser …")  # never "pars"


def test_list_sends_only_a_short_excerpt(client, seed):
    seed(body="y" * 3000)
    items = client.get("/api/v1/issues").json()["items"]
    assert len(items) == 1 and len(items[0]["body_excerpt"]) == 600
    assert "body" not in items[0]


def test_missing_issue_is_a_clear_404(client):
    response = client.get("/api/v1/issues/999999")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_nul_characters_in_github_text_dont_break_storage(client, seed):
    """Seen in production: an issue body with \\u0000, which Postgres refuses."""
    issue_id = seed(title="Fix\x00 crash", body="before\x00after")
    data = client.get(f"/api/v1/issues/{issue_id}").json()
    assert data["title"] == "Fix crash" and data["body"] == "beforeafter"


def _labels(*names):
    return [{"name": n} for n in names]


def test_levels_summary_and_level_filter(client, seed):
    # A short, docs-pointing beginner issue (easy) and a help-wanted feature (not easy).
    easy = seed(id=1, number=1, labels=_labels("good first issue", "documentation"),
                title="Fix typo in README", body="See docs/index.md", comments=0)
    seed(id=2, number=2, labels=_labels("help wanted", "enhancement"),
         title="Add plugin system", body="We need a plugin API. " * 120, comments=12)

    levels = client.get("/api/v1/meta/levels").json()
    assert [lv["level"] for lv in levels] == ["new", "some", "experienced"]
    by_level = {lv["level"]: lv for lv in levels}
    assert by_level["new"]["total"] == 1
    assert by_level["new"]["kinds"] == [{"value": "docs", "count": 1}]
    assert by_level["experienced"]["total"] == 1

    new_items = client.get("/api/v1/issues", params={"level": "new"}).json()["items"]
    assert [i["id"] for i in new_items] == [easy]
    assert new_items[0]["level"] == "new" and new_items[0]["kind"] == "docs"
    feature = client.get("/api/v1/issues", params={"kind": "feature"}).json()["items"]
    assert len(feature) == 1 and feature[0]["level"] == "experienced"


def test_unknown_level_is_rejected(client):
    assert client.get("/api/v1/issues", params={"level": "wizard"}).status_code == 422
