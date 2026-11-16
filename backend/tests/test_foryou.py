"""For you: ranking by the user's languages and level, and refreshing the profile."""

import copy
from datetime import UTC, datetime

import pytest
import respx
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.auth.crypto import encrypt_token
from app.auth.sessions import COOKIE_NAME, create_session
from app.core.config import get_settings
from app.db.models import Issue, User
from app.db.session import get_db
from app.main import app
from app.skills.github import API
from app.sync.mapping import map_issue, map_repo
from app.sync.upsert import upsert_issue, upsert_repo

PYTHON_DEV = {"languages": [{"name": "Python", "share": 0.7}, {"name": "Go", "share": 0.3}],
              "level": "new", "merged_prs": 0, "repos_counted": 12}


@pytest.fixture
def client(db_session_factory, monkeypatch):
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    get_settings.cache_clear()

    def override():
        with db_session_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override
    yield TestClient(app, base_url="https://testserver")
    app.dependency_overrides.clear()
    get_settings.cache_clear()


@pytest.fixture
def sign_in(db_session_factory, client):
    def login(skills=None, token="gho_t") -> int:
        with db_session_factory() as db:
            user = User(github_id=7, login="dev", skills=skills,
                        skills_updated_at=datetime.now(UTC) if skills else None,
                        access_token_encrypted=encrypt_token(token))
            db.add(user)
            db.commit()
            client.cookies.set(COOKIE_NAME, create_session(db, user.id))
            return user.id

    return login


@pytest.fixture
def seed(db_session_factory, fixture):
    """seed(language, level) -> issue id, each in its own repo."""
    counter = iter(range(1, 100))

    def add(language: str, level: str = "new", available: bool = True) -> int:
        n = next(counter)
        repo = {**copy.deepcopy(fixture("repo.json")), "id": 1000 + n,
                "full_name": f"org/{language.lower()}-{n}", "language": language}
        item = {**copy.deepcopy(fixture("search_issues_python.json")["items"][0]),
                "id": 5000 + n, "number": n}
        with db_session_factory() as db:
            repo_id = upsert_repo(db, map_repo(repo), etag=None)
            row = map_issue(item, repo_id, repo_stars=repo["stargazers_count"])
            issue_id = upsert_issue(db, row)
            db.execute(update(Issue).where(Issue.id == issue_id)
                       .values(level=level, is_available=available))
            db.commit()
        return issue_id

    return add


def test_signed_out_is_401(client):
    assert client.get("/api/v1/me/recommended").status_code == 401
    assert client.post("/api/v1/me/profile/refresh").status_code == 401


def test_your_main_language_and_level_come_first(client, sign_in, seed):
    rust = seed("Rust")
    go = seed("Go")
    python_hard = seed("Python", level="experienced")
    python = seed("Python")
    sign_in(PYTHON_DEV)

    data = client.get("/api/v1/me/recommended").json()
    order = [i["id"] for i in data["items"]]
    assert order[0] == python and order[-1] == rust
    assert order.index(go) < order.index(rust)
    assert order.index(python) < order.index(python_hard)  # same language, wrong level
    top = data["items"][0]
    assert "Python, your main language" in top["match_reasons"]
    assert "Right for your level" in top["match_reasons"]
    assert 0 < data["items"][-1]["match"] < top["match"] <= 1
    assert data["level"] == "new" and data["profile"]["languages"][0]["name"] == "Python"


def test_choosing_another_level_reranks(client, sign_in, seed):
    seed("Python")
    hard = seed("Python", level="experienced")
    sign_in(PYTHON_DEV)
    data = client.get("/api/v1/me/recommended", params={"level": "experienced"}).json()
    assert data["level"] == "experienced" and data["items"][0]["id"] == hard


def test_taken_issues_are_never_recommended(client, sign_in, seed):
    seed("Python", available=False)
    free = seed("Go")
    sign_in(PYTHON_DEV)
    data = client.get("/api/v1/me/recommended").json()
    assert [i["id"] for i in data["items"]] == [free] and data["total"] == 1


def test_without_a_profile_it_still_lists_issues(client, sign_in, seed):
    seed("Python")
    sign_in(None)
    data = client.get("/api/v1/me/recommended").json()
    assert data["profile"] is None and data["level"] == "new" and len(data["items"]) == 1


def _mock_activity(repos_status=200, merged=4):
    respx.get(f"{API}/users/dev/repos").respond(
        repos_status, json=[{"language": "TypeScript", "pushed_at": "2026-10-01T00:00:00Z",
                             "fork": False}] if repos_status == 200 else {})
    respx.get(f"{API}/search/issues").respond(200, json={"total_count": merged})


@respx.mock
def test_refresh_reads_github_and_stores_the_profile(client, sign_in, db_session_factory):
    user_id = sign_in(None)
    _mock_activity(merged=4)
    profile = client.post("/api/v1/me/profile/refresh").json()
    assert profile["languages"] == [{"name": "TypeScript", "share": 1.0}]
    assert profile["level"] == "some" and profile["merged_prs"] == 4
    search = respx.calls.last.request.url.params["q"]
    assert search == "is:pr is:merged author:dev -user:dev"  # contributions elsewhere only
    with db_session_factory() as db:
        assert db.get(User, user_id).skills["level"] == "some"


@respx.mock
def test_refresh_with_a_revoked_token_asks_to_sign_in_again(client, sign_in):
    sign_in(None)
    _mock_activity(repos_status=401)
    resp = client.post("/api/v1/me/profile/refresh")
    assert resp.status_code == 409 and "sign in again" in resp.json()["error"]["message"]


@respx.mock
def test_refresh_twice_in_a_minute_does_not_call_github_again(client, sign_in):
    sign_in(PYTHON_DEV)  # just refreshed
    route = respx.get(f"{API}/users/dev/repos")
    assert client.post("/api/v1/me/profile/refresh").status_code == 200
    assert not route.called


def test_level_query_is_validated(client, sign_in):
    sign_in(None)
    assert client.get("/api/v1/me/recommended", params={"level": "guru"}).status_code == 422


def test_the_token_never_leaks(client, sign_in, db_session_factory):
    sign_in(PYTHON_DEV)
    body = client.get("/api/v1/me/recommended").text
    assert "gho_t" not in body and "access_token" not in body
    with db_session_factory() as db:
        assert db.execute(select(User.login)).scalar_one() == "dev"
