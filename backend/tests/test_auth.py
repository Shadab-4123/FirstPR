"""GitHub sign-in: the happy path and the attacks it must stop. GitHub is mocked."""

from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest
import respx
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.auth.routes import STATE_COOKIE, TOKEN_URL, USER_URL, _unpack_state
from app.auth.sessions import COOKIE_NAME
from app.core.config import get_settings
from app.db.models import User, UserSession
from app.db.session import get_db
from app.main import app

PROFILE = {"id": 4242, "login": "octo-newbie", "name": "Octo", "avatar_url": "https://a/x.png"}


@pytest.fixture
def client(db_session_factory, monkeypatch):
    monkeypatch.setenv("GITHUB_CLIENT_ID", "cid")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "secret")
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("APP_URL", "https://firstpr.test")
    get_settings.cache_clear()

    def override():
        with db_session_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override
    # https: the cookies are Secure, so a client on plain http would never send them back.
    yield TestClient(app, base_url="https://testserver", follow_redirects=False)
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def _start_login(client, next_path="/explore"):
    resp = client.get("/api/v1/auth/github/login", params={"next": next_path})
    query = parse_qs(urlparse(resp.headers["location"]).query)
    return resp, query["state"][0]


def _mock_github(token="gho_secret_token"):
    respx.post(TOKEN_URL).respond(200, json={"access_token": token, "token_type": "bearer"})
    respx.get(USER_URL).respond(200, json=PROFILE)


def test_login_redirects_to_github_with_state_and_callback(client):
    resp, state = _start_login(client)
    assert resp.status_code == 302
    url = urlparse(resp.headers["location"])
    query = parse_qs(url.query)
    assert url.netloc == "github.com" and query["client_id"] == ["cid"]
    assert query["redirect_uri"] == ["https://firstpr.test/api/v1/auth/github/callback"]
    assert _unpack_state(client.cookies[STATE_COOKIE]) == (state, "/explore")


@pytest.mark.parametrize("evil", ["//evil.com", "https://evil.com", "/\\evil.com", "evil"])
def test_open_redirects_are_neutralised(client, evil):
    _start_login(client, next_path=evil)
    assert _unpack_state(client.cookies[STATE_COOKIE])[1] == "/"


@respx.mock
def test_callback_signs_in_and_stores_the_token_encrypted(client, db_session_factory):
    _, state = _start_login(client)
    _mock_github()
    resp = client.get("/api/v1/auth/github/callback", params={"code": "c0de", "state": state})

    assert resp.status_code == 302 and resp.headers["location"] == "/explore"
    assert COOKIE_NAME in client.cookies and STATE_COOKIE not in client.cookies
    me = client.get("/api/v1/auth/me").json()
    assert me["login"] == "octo-newbie"
    with db_session_factory() as db:
        user = db.execute(select(User)).scalar_one()
        session = db.execute(select(UserSession)).scalar_one()
    assert "gho_secret_token" not in user.access_token_encrypted  # encrypted at rest
    assert client.cookies[COOKIE_NAME] != session.token_hash  # only the hash is stored


@respx.mock
def test_state_mismatch_is_rejected(client, db_session_factory):
    """Login CSRF: an attacker's callback link must not sign the victim into their account."""
    _start_login(client)
    _mock_github()
    resp = client.get("/api/v1/auth/github/callback", params={"code": "c", "state": "forged"})
    assert resp.status_code == 400
    with db_session_factory() as db:
        assert db.execute(select(func.count()).select_from(User)).scalar() == 0


def test_callback_without_a_login_started_is_rejected(client):
    resp = client.get("/api/v1/auth/github/callback", params={"code": "c", "state": "s"})
    assert resp.status_code == 400


def test_cancel_on_github_returns_home(client):
    _, state = _start_login(client)
    resp = client.get("/api/v1/auth/github/callback",
                      params={"error": "access_denied", "state": state})
    assert resp.headers["location"] == "/?signin=cancelled"


@respx.mock
def test_signing_in_twice_updates_one_user(client, db_session_factory):
    for name in ("Octo", "Octo Renamed"):
        _, state = _start_login(client)
        respx.post(TOKEN_URL).respond(200, json={"access_token": "t"})
        respx.get(USER_URL).respond(200, json={**PROFILE, "name": name})
        client.get("/api/v1/auth/github/callback", params={"code": "c", "state": state})
    with db_session_factory() as db:
        users = db.execute(select(User)).scalars().all()
    assert len(users) == 1 and users[0].name == "Octo Renamed"


@respx.mock
def test_logout_ends_the_session_server_side(client, db_session_factory):
    _, state = _start_login(client)
    _mock_github()
    client.get("/api/v1/auth/github/callback", params={"code": "c", "state": state})
    stolen = client.cookies[COOKIE_NAME]

    assert client.post("/api/v1/auth/logout").status_code == 204
    client.cookies.set(COOKIE_NAME, stolen)  # replaying the old cookie must not work
    assert client.get("/api/v1/auth/me").status_code == 401


@respx.mock
def test_expired_session_is_not_accepted(client, db_session_factory):
    _, state = _start_login(client)
    _mock_github()
    client.get("/api/v1/auth/github/callback", params={"code": "c", "state": state})
    with db_session_factory() as db:
        db.query(UserSession).update({"expires_at": datetime.now(UTC) - timedelta(minutes=1)})
        db.commit()
    assert client.get("/api/v1/auth/me").status_code == 401


def test_sign_in_not_configured_is_a_clear_503(client, monkeypatch):
    monkeypatch.delenv("GITHUB_CLIENT_ID")
    get_settings.cache_clear()
    resp = client.get("/api/v1/auth/github/login")
    assert resp.status_code == 503 and "isn't configured" in resp.json()["error"]["message"]
