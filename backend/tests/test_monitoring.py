"""Sentry: off without a DSN, reports crashes with it, and never sends secrets."""

import secrets

import sentry_sdk
from fastapi.testclient import TestClient
from sentry_sdk.transport import Transport

from app.auth.sessions import COOKIE_NAME
from app.core.config import Settings
from app.core.monitoring import init_sentry, scrub
from app.main import create_app


class Capture(Transport):
    def __init__(self, options=None):
        super().__init__(options)
        self.events: list[dict] = []

    def capture_envelope(self, envelope):
        self.events += [e.payload.json for e in envelope.items if e.type == "event"]


def test_off_without_a_dsn():
    assert init_sentry(Settings(sentry_dsn=None), "api") is False


def test_scrub_drops_cookies_auth_headers_and_oauth_query():
    event = {"request": {
        "url": "https://x/api/v1/auth/github/callback", "query_string": "code=c&state=s",
        "cookies": {COOKIE_NAME: "tok"},
        "headers": {"Cookie": "a=b", "Authorization": "Bearer t", "User-Agent": "ua"},
    }}
    request = scrub(event)["request"]
    assert "cookies" not in request and "query_string" not in request
    assert request["headers"] == {"User-Agent": "ua"}


def test_scrub_drops_stack_frame_variables():
    event = {"exception": {"values": [{"stacktrace": {"frames": [
        {"function": "callback", "vars": {"token": "gho_secret"}}]}}]}}
    frame = scrub(event)["exception"]["values"][0]["stacktrace"]["frames"][0]
    assert frame == {"function": "callback"}


def test_search_query_is_kept_for_debugging():
    event = {"request": {"url": "https://x/api/v1/issues", "query_string": "q=parser"}}
    assert scrub(event)["request"]["query_string"] == "q=parser"


def test_a_crash_in_a_route_is_reported_without_the_session_cookie():
    transport = Capture()
    session = secrets.token_hex(16)  # random, so it can't match the test's own source lines
    try:
        assert init_sentry(Settings(sentry_dsn="https://key@sentry.invalid/1"), "api", transport)
        app = create_app()

        @app.get("/boom")
        def boom():
            raise RuntimeError("kaboom")

        client = TestClient(app, raise_server_exceptions=False)
        client.cookies.set(COOKIE_NAME, session)
        assert client.get("/boom").status_code == 500
        sentry_sdk.flush()
    finally:
        sentry_sdk.init()  # back to off for the other tests

    crashes = [e for e in transport.events
               if e.get("exception", {}).get("values", [{}])[-1].get("value") == "kaboom"]
    assert crashes, transport.events
    assert crashes[0]["tags"]["component"] == "api"
    assert session not in str(crashes[0])  # not in headers, cookies or frame variables
