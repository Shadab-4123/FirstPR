"""GitHub client behaviour against mocked HTTP. No test here touches the network."""

import httpx
import pytest
import respx

from app.github.client import GitHubClient, GitHubError, RateLimitExceeded

BASE = "https://api.github.com"


class FakeTime:
    """Records sleeps instead of sleeping; advances a fake clock."""

    def __init__(self, now: float = 1_000_000.0):
        self.now = now
        self.sleeps: list[float] = []

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds

    def clock(self) -> float:
        return self.now


def make_client(fake: FakeTime, **kw) -> GitHubClient:
    return GitHubClient("test-token", sleep=fake.sleep, clock=fake.clock, rand=lambda: 1.0, **kw)


def rl_headers(remaining: int, reset: float, resource: str = "core") -> dict[str, str]:
    return {"X-RateLimit-Remaining": str(remaining), "X-RateLimit-Reset": str(int(reset)),
            "X-RateLimit-Resource": resource}


@respx.mock
async def test_search_returns_recorded_payload(fixture):
    payload = fixture("search_issues_python.json")
    route = respx.get(f"{BASE}/search/issues").respond(
        200, json=payload, headers=rl_headers(29, 0, "search")
    )
    fake = FakeTime()
    async with make_client(fake) as gh:
        data = await gh.search_issues('label:"good first issue"')
    assert data["items"][0]["title"] == payload["items"][0]["title"]
    assert route.calls[0].request.headers["Authorization"] == "Bearer test-token"
    assert gh.buckets["search"].remaining == 29


@respx.mock
async def test_etag_sent_and_304_is_not_modified(fixture):
    route = respx.get(f"{BASE}/repos/o/r").respond(304, headers=rl_headers(4999, 0))
    async with make_client(FakeTime()) as gh:
        resp = await gh.get_repo("o/r", etag='W/"abc"')
    assert resp.not_modified
    assert route.calls[0].request.headers["If-None-Match"] == 'W/"abc"'


@respx.mock
async def test_retries_5xx_with_backoff_then_succeeds(fixture):
    respx.get(f"{BASE}/repos/o/r").mock(side_effect=[
        httpx.Response(502), httpx.Response(503),
        httpx.Response(200, json=fixture("repo.json"), headers={"ETag": 'W/"x"'}),
    ])
    fake = FakeTime()
    async with make_client(fake) as gh:
        resp = await gh.get_repo("o/r")
    assert resp.status == 200 and resp.etag == 'W/"x"'
    assert fake.sleeps == [1.0, 2.0]  # base * 2**attempt, rand() fixed at 1.0


@respx.mock
async def test_network_error_is_retried():
    respx.get(f"{BASE}/repos/o/r").mock(side_effect=[
        httpx.ConnectTimeout("boom"), httpx.Response(200, json={"id": 1}),
    ])
    async with make_client(FakeTime()) as gh:
        assert (await gh.get_repo("o/r")).data == {"id": 1}


@respx.mock
async def test_gives_up_after_max_retries():
    route = respx.get(f"{BASE}/repos/o/r").respond(500)
    async with make_client(FakeTime(), max_retries=2) as gh:
        with pytest.raises(GitHubError) as exc:
            await gh.get_repo("o/r")
    assert exc.value.status == 500
    assert route.call_count == 3  # first try + 2 retries


@respx.mock
async def test_404_is_not_retried():
    route = respx.get(f"{BASE}/repos/o/gone").respond(404, json={"message": "Not Found"})
    async with make_client(FakeTime()) as gh:
        with pytest.raises(GitHubError) as exc:
            await gh.get_repo("o/gone")
    assert exc.value.status == 404 and route.call_count == 1


@respx.mock
async def test_primary_rate_limit_sleeps_until_reset():
    fake = FakeTime()
    reset = fake.now + 120
    respx.get(f"{BASE}/repos/o/r").mock(side_effect=[
        httpx.Response(403, json={"message": "API rate limit exceeded"},
                       headers=rl_headers(0, reset)),
        httpx.Response(200, json={"id": 1}, headers=rl_headers(4999, reset + 3600)),
    ])
    async with make_client(fake) as gh:
        await gh.get_repo("o/r")
    assert fake.sleeps == [121.0]


@respx.mock
async def test_secondary_limit_honours_retry_after():
    fake = FakeTime()
    respx.get(f"{BASE}/repos/o/r").mock(side_effect=[
        httpx.Response(429, headers={"Retry-After": "7"}),
        httpx.Response(200, json={"id": 1}),
    ])
    async with make_client(fake) as gh:
        await gh.get_repo("o/r")
    assert fake.sleeps == [7.0]


@respx.mock
async def test_empty_bucket_waits_before_next_request():
    fake = FakeTime()
    respx.get(f"{BASE}/repos/o/a").respond(200, json={}, headers=rl_headers(0, fake.now + 30))
    respx.get(f"{BASE}/repos/o/b").respond(200, json={}, headers=rl_headers(4999, fake.now + 9e3))
    async with make_client(fake) as gh:
        await gh.get_repo("o/a")
        assert fake.sleeps == []
        await gh.get_repo("o/b")
    assert fake.sleeps == [31.0]


@respx.mock
async def test_refuses_to_wait_longer_than_max():
    fake = FakeTime()
    respx.get(f"{BASE}/repos/o/r").respond(
        403, json={"message": "API rate limit exceeded"}, headers=rl_headers(0, fake.now + 3600)
    )
    async with make_client(fake, max_wait_s=60) as gh:
        with pytest.raises(RateLimitExceeded):
            await gh.get_repo("o/r")
    assert fake.sleeps == []
