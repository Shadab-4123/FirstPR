"""The GitHub contribution calendar on the Activity page. GitHub is mocked."""

import pytest
import respx
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.auth.crypto import encrypt_token
from app.auth.sessions import COOKIE_NAME, create_session
from app.core.config import get_settings
from app.db.models import User
from app.db.session import get_db
from app.main import app
from app.skills import contributions
from app.skills.contributions import GRAPHQL

URL = "/api/v1/me/contributions"


def _calendar(total=7):
    day = lambda d, n, level: {"date": d, "contributionCount": n, "contributionLevel": level}  # noqa: E731
    return {"data": {"user": {"contributionsCollection": {"contributionCalendar": {
        "totalContributions": total,
        "weeks": [
            {"contributionDays": [day("2026-11-08", 0, "NONE"),
                                  day("2026-11-09", 5, "FOURTH_QUARTILE")]},
            {"contributionDays": [day("2026-11-15", 2, "SECOND_QUARTILE")]},
        ],
    }}}}}


@pytest.fixture(autouse=True)
def empty_cache():
    contributions._cache.clear()
    yield
    contributions._cache.clear()


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
def signed_in(db_session_factory, client):
    with db_session_factory() as db:
        user = User(github_id=7, login="dev", access_token_encrypted=encrypt_token("gho_t"))
        db.add(user)
        db.commit()
        client.cookies.set(COOKIE_NAME, create_session(db, user.id))
    return client


def test_signed_out_gets_401(client):
    assert client.get(URL).status_code == 401


@respx.mock
def test_the_calendar_comes_back_as_weeks_of_days_with_githubs_shades(signed_in):
    route = respx.post(GRAPHQL).respond(200, json=_calendar())
    body = signed_in.get(URL).json()
    assert body["total"] == 7
    assert body["weeks"][0] == [{"date": "2026-11-08", "count": 0, "level": 0},
                                {"date": "2026-11-09", "count": 5, "level": 4}]
    sent = route.calls.last.request
    assert sent.headers["Authorization"] == "Bearer gho_t"
    assert b'"login":"dev"' in sent.content.replace(b" ", b"")
    assert "gho_t" not in signed_in.get(URL).text  # the token never reaches the browser


@respx.mock
def test_a_second_visit_is_served_from_the_cache(signed_in):
    route = respx.post(GRAPHQL).respond(200, json=_calendar())
    signed_in.get(URL)
    signed_in.get(URL)
    assert route.call_count == 1


@respx.mock
def test_a_revoked_token_asks_to_sign_in_again(signed_in):
    respx.post(GRAPHQL).respond(401)
    resp = signed_in.get(URL)
    assert resp.status_code == 409 and "sign in again" in resp.json()["error"]["message"]


@respx.mock
@pytest.mark.parametrize("reply", [
    {"status_code": 502},
    {"status_code": 200, "json": {"errors": [{"message": "Something went wrong"}]}},
])
def test_github_trouble_is_a_clear_502(signed_in, reply):
    respx.post(GRAPHQL).respond(**reply)
    resp = signed_in.get(URL)
    assert resp.status_code == 502 and "Try again" in resp.json()["error"]["message"]
