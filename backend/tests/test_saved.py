"""My issues: save, move through statuses, remove; and only ever your own rows."""

import copy

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.auth.sessions import COOKIE_NAME, create_session
from app.db.models import Issue, User
from app.db.session import get_db
from app.main import app
from app.sync.mapping import map_issue, map_repo
from app.sync.upsert import upsert_issue, upsert_repo


@pytest.fixture
def client(db_session_factory):
    def override():
        with db_session_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override
    yield TestClient(app, base_url="https://testserver")  # session cookie is Secure
    app.dependency_overrides.clear()


@pytest.fixture
def sign_in(db_session_factory, client):
    """Creates a GitHub user with a live session and puts its cookie on the client."""

    def login(github_id: int = 1) -> None:
        with db_session_factory() as db:
            user = db.execute(select(User).where(User.github_id == github_id)).scalar_one_or_none()
            if user is None:
                user = User(github_id=github_id, login=f"user{github_id}")
                db.add(user)
                db.commit()
            token = create_session(db, user.id)
        client.cookies.set(COOKIE_NAME, token)

    return login


@pytest.fixture
def issue_id(db_session_factory, fixture) -> int:
    item = copy.deepcopy(fixture("search_issues_python.json")["items"][0])
    with db_session_factory() as db:
        repo_id = upsert_repo(db, map_repo(fixture("repo.json")), etag=None)
        new_id = upsert_issue(db, map_issue(item, repo_id))
        db.commit()
    return new_id


def test_signed_out_is_a_401_everywhere(client, issue_id):
    assert client.get("/api/v1/me/saved").status_code == 401
    assert client.put(f"/api/v1/me/saved/{issue_id}", json={}).status_code == 401
    assert client.delete(f"/api/v1/me/saved/{issue_id}").status_code == 401


def test_save_then_track_to_merged(client, sign_in, issue_id):
    sign_in()
    saved = client.put(f"/api/v1/me/saved/{issue_id}", json={})
    assert saved.status_code == 200 and saved.json()["status"] == "saved"
    assert saved.json()["issue"]["id"] == issue_id and saved.json()["issue_state"] == "open"

    for status in ("working", "pr_opened", "merged"):
        moved = client.put(f"/api/v1/me/saved/{issue_id}", json={"status": status}).json()
        assert moved["status"] == status
        assert moved["saved_at"] == saved.json()["saved_at"]  # first save date is kept

    items = client.get("/api/v1/me/saved").json()
    assert [i["status"] for i in items] == ["merged"]  # moving never duplicates


def test_unknown_status_is_rejected(client, sign_in, issue_id):
    sign_in()
    resp = client.put(f"/api/v1/me/saved/{issue_id}", json={"status": "done"})
    assert resp.status_code == 422


def test_saving_a_missing_issue_is_a_404(client, sign_in):
    sign_in()
    assert client.put("/api/v1/me/saved/999999", json={}).status_code == 404


def test_remove_is_idempotent(client, sign_in, issue_id):
    sign_in()
    client.put(f"/api/v1/me/saved/{issue_id}", json={})
    assert client.delete(f"/api/v1/me/saved/{issue_id}").status_code == 204
    assert client.delete(f"/api/v1/me/saved/{issue_id}").status_code == 204
    assert client.get("/api/v1/me/saved").json() == []


def test_users_see_and_change_only_their_own(client, sign_in, issue_id):
    sign_in(github_id=1)
    client.put(f"/api/v1/me/saved/{issue_id}", json={"status": "working"})

    sign_in(github_id=2)  # someone else, same issue
    assert client.get("/api/v1/me/saved").json() == []
    client.delete(f"/api/v1/me/saved/{issue_id}")  # must not remove user 1's row
    client.put(f"/api/v1/me/saved/{issue_id}", json={"status": "saved"})

    sign_in(github_id=1)
    assert [i["status"] for i in client.get("/api/v1/me/saved").json()] == ["working"]


def test_saved_issue_survives_closing_on_github(client, sign_in, issue_id, db_session_factory):
    sign_in()
    client.put(f"/api/v1/me/saved/{issue_id}", json={"status": "pr_opened"})
    with db_session_factory() as db:  # what the re-check does when the issue closes
        db.execute(update(Issue).where(Issue.id == issue_id)
                   .values(state="closed", is_available=False, unavailable_reason="closed"))
        db.commit()
    [item] = client.get("/api/v1/me/saved").json()
    assert item["issue_state"] == "closed" and item["status"] == "pr_opened"


def test_most_recently_changed_comes_first(client, sign_in, issue_id, fixture,
                                           db_session_factory):
    other = copy.deepcopy(fixture("search_issues_python.json")["items"][1])
    with db_session_factory() as db:
        repo_id = db.get(Issue, issue_id).repo_id
        other_id = upsert_issue(db, map_issue(other, repo_id))
        db.commit()
    sign_in()
    client.put(f"/api/v1/me/saved/{issue_id}", json={})
    client.put(f"/api/v1/me/saved/{other_id}", json={})
    client.put(f"/api/v1/me/saved/{issue_id}", json={"status": "working"})
    assert [i["issue"]["id"] for i in client.get("/api/v1/me/saved").json()] == [issue_id, other_id]
