"""A small async GitHub REST client that respects rate limits.

What it does on every request:
1. If we already know the bucket (search or core) is empty, sleep until it resets.
2. Send the request, with If-None-Match when we have an ETag (a 304 is free).
3. Record X-RateLimit-Remaining / X-RateLimit-Reset from the response.
4. On a rate-limit response, wait (Retry-After or reset time) and retry.
5. On 5xx or network errors, retry with exponential backoff and full jitter.
6. Give up after `max_retries` and raise, so the sync run can record the error.

`sleep`, `clock` and `rand` are injectable so tests run instantly and deterministically.
"""

import asyncio
import logging
import random
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

import httpx

log = logging.getLogger(__name__)

API_URL = "https://api.github.com"
BACKOFF_BASE_S = 1.0
BACKOFF_CAP_S = 30.0


class GitHubError(Exception):
    def __init__(self, status: int | None, message: str):
        super().__init__(f"GitHub {status}: {message}")
        self.status = status
        self.message = message


class RateLimitExceeded(GitHubError):
    """Raised when waiting for the limit to reset would take longer than we allow."""


@dataclass
class RateBucket:
    remaining: int | None = None
    reset_at: float | None = None  # unix seconds


@dataclass
class GitHubResponse:
    status: int
    data: Any
    etag: str | None

    @property
    def not_modified(self) -> bool:
        return self.status == 304


class GitHubClient:
    def __init__(
        self,
        token: str | None = None,
        *,
        base_url: str = API_URL,
        max_retries: int = 5,
        max_wait_s: float = 900.0,
        timeout_s: float = 20.0,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        clock: Callable[[], float] = time.time,
        rand: Callable[[], float] = random.random,
    ):
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "firstpr-sync",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self._http = httpx.AsyncClient(
            base_url=base_url, headers=headers, timeout=timeout_s, transport=transport
        )
        self.max_retries = max_retries
        self.max_wait_s = max_wait_s
        self._sleep = sleep
        self._clock = clock
        self._rand = rand
        self.buckets: dict[str, RateBucket] = {"core": RateBucket(), "search": RateBucket()}
        self.requests_made = 0

    async def __aenter__(self) -> "GitHubClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self._http.aclose()

    # ---- public API -------------------------------------------------------

    async def search_issues(self, query: str, *, page: int = 1, per_page: int = 100) -> Any:
        resp = await self.request(
            "GET",
            "/search/issues",
            params={"q": query, "sort": "updated", "order": "desc", "per_page": per_page,
                    "page": page},
            resource="search",
        )
        return resp.data

    async def get_repo(self, full_name: str, *, etag: str | None = None) -> GitHubResponse:
        return await self.request("GET", f"/repos/{full_name}", etag=etag)

    async def get_issue(
        self, full_name: str, number: int, *, etag: str | None = None
    ) -> GitHubResponse:
        return await self.request("GET", f"/repos/{full_name}/issues/{number}", etag=etag)

    async def get_issue_comments(self, full_name: str, number: int, *, since: str) -> Any:
        """Comments created or edited after `since` (ISO 8601), oldest first, max 100."""
        resp = await self.request(
            "GET", f"/repos/{full_name}/issues/{number}/comments",
            params={"since": since, "per_page": 100},
        )
        return resp.data

    async def get_issue_timeline(self, full_name: str, number: int) -> Any:
        """First 100 timeline events: enough for a beginner issue's cross-references."""
        resp = await self.request(
            "GET", f"/repos/{full_name}/issues/{number}/timeline", params={"per_page": 100}
        )
        return resp.data

    async def graphql(self, query: str, variables: dict[str, Any]) -> Any:
        """One GraphQL call. GitHub answers 200 even for query errors, so check `errors`.

        GraphQL has its own rate-limit bucket (points per hour, not requests), and
        it needs a token: unauthenticated GraphQL calls are rejected.
        """
        resp = await self.request(
            "POST", "/graphql", json={"query": query, "variables": variables},
            resource="graphql",
        )
        body = resp.data
        if body.get("errors"):
            messages = "; ".join(e.get("message", "?") for e in body["errors"])
            # RATE_LIMITED comes back as a GraphQL error, not an HTTP status.
            if any(e.get("type") == "RATE_LIMITED" for e in body["errors"]):
                raise RateLimitExceeded(200, messages)
            raise GitHubError(200, f"GraphQL: {messages}")
        return body["data"]

    # ---- core request loop -----------------------------------------------

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        etag: str | None = None,
        resource: str = "core",
    ) -> GitHubResponse:
        headers = {"If-None-Match": etag} if etag else {}
        last_error: GitHubError | None = None

        for attempt in range(self.max_retries + 1):
            await self._wait_for_bucket(resource)
            try:
                resp = await self._http.request(
                    method, path, params=params, json=json, headers=headers
                )
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = GitHubError(None, f"network error: {type(exc).__name__}")
                await self._backoff(attempt, path, reason=last_error.message)
                continue

            self.requests_made += 1
            self._record_rate_limit(resp, resource)

            if resp.status_code == 304:
                return GitHubResponse(304, None, etag)
            if resp.is_success:
                return GitHubResponse(resp.status_code, resp.json(), resp.headers.get("ETag"))

            if self._is_rate_limited(resp):
                wait = self._rate_limit_wait(resp, resource)
                if wait > self.max_wait_s:
                    raise RateLimitExceeded(resp.status_code, f"limit resets in {wait:.0f}s")
                log.warning("rate limited, waiting", extra={"path": path, "wait_s": round(wait)})
                await self._sleep(wait)
                last_error = GitHubError(resp.status_code, "rate limited")
                continue

            if resp.status_code >= 500:
                last_error = GitHubError(resp.status_code, "server error")
                await self._backoff(attempt, path, reason=last_error.message)
                continue

            # 4xx that is not a rate limit: retrying will not help.
            raise GitHubError(resp.status_code, _error_message(resp))

        raise last_error or GitHubError(None, "retries exhausted")

    # ---- helpers -----------------------------------------------------------

    async def _wait_for_bucket(self, resource: str) -> None:
        bucket = self.buckets.setdefault(resource, RateBucket())
        if bucket.remaining == 0 and bucket.reset_at is not None:
            wait = bucket.reset_at - self._clock() + 1
            if wait > 0:
                if wait > self.max_wait_s:
                    raise RateLimitExceeded(None, f"{resource} limit resets in {wait:.0f}s")
                log.info("bucket empty, sleeping", extra={"resource": resource, "wait_s": wait})
                await self._sleep(wait)
                bucket.remaining = None  # unknown until the next response tells us

    def _record_rate_limit(self, resp: httpx.Response, resource: str) -> None:
        name = resp.headers.get("X-RateLimit-Resource", resource)
        bucket = self.buckets.setdefault(name, RateBucket())
        remaining = resp.headers.get("X-RateLimit-Remaining")
        reset = resp.headers.get("X-RateLimit-Reset")
        if remaining is not None:
            bucket.remaining = int(remaining)
        if reset is not None:
            bucket.reset_at = float(reset)

    @staticmethod
    def _is_rate_limited(resp: httpx.Response) -> bool:
        if resp.status_code == 429:
            return True
        if resp.status_code != 403:
            return False
        if resp.headers.get("X-RateLimit-Remaining") == "0" or "Retry-After" in resp.headers:
            return True
        return "rate limit" in resp.text.lower()  # secondary limits say so in the body

    def _rate_limit_wait(self, resp: httpx.Response, resource: str) -> float:
        retry_after = resp.headers.get("Retry-After")
        if retry_after is not None:
            return float(retry_after)
        bucket = self.buckets.get(resource)
        if bucket and bucket.reset_at:
            return max(bucket.reset_at - self._clock() + 1, 1.0)
        return 60.0  # GitHub's documented fallback for secondary limits

    async def _backoff(self, attempt: int, path: str, *, reason: str) -> None:
        if attempt >= self.max_retries:
            return  # loop ends; caller raises
        delay = self._rand() * min(BACKOFF_CAP_S, BACKOFF_BASE_S * 2**attempt)
        log.warning(
            "retrying", extra={"path": path, "attempt": attempt + 1, "delay_s": round(delay, 2),
                               "reason": reason}
        )
        await self._sleep(delay)


def _error_message(resp: httpx.Response) -> str:
    try:
        return str(resp.json().get("message", resp.text[:200]))
    except ValueError:
        return resp.text[:200]
