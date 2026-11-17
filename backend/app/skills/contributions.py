"""The contribution calendar GitHub shows on a profile: the last year, day by day.

Read with the user's own token (any token can read public data; FirstPR asks for no
scopes). One GraphQL request. Private contributions count only if the user has turned
on "include private contributions" in their GitHub settings, exactly as on GitHub.
"""

import time
from typing import Any

import httpx

from app.skills.github import API, GitHubTokenRejected

GRAPHQL = f"{API}/graphql"
CACHE_SECONDS = 30 * 60  # the calendar changes slowly; page refreshes shouldn't hit GitHub

QUERY = """
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}
"""

# GitHub's own quartile buckets, so the shades match what people see on their profile.
LEVELS = {"NONE": 0, "FIRST_QUARTILE": 1, "SECOND_QUARTILE": 2, "THIRD_QUARTILE": 3,
          "FOURTH_QUARTILE": 4}

_cache: dict[int, tuple[float, dict[str, Any]]] = {}


class GitHubUnavailable(Exception):
    """GitHub answered, but not with a calendar (an outage or an unknown user)."""


async def fetch_calendar(http: httpx.AsyncClient, token: str, login: str) -> dict[str, Any]:
    resp = await http.post(GRAPHQL, json={"query": QUERY, "variables": {"login": login}},
                           headers={"Authorization": f"Bearer {token}"})
    if resp.status_code == 401:
        raise GitHubTokenRejected
    resp.raise_for_status()
    body = resp.json()
    user = (body.get("data") or {}).get("user")
    if body.get("errors") or not user:
        raise GitHubUnavailable
    calendar = user["contributionsCollection"]["contributionCalendar"]
    return {
        "total": calendar["totalContributions"],
        "weeks": [
            [{"date": d["date"], "count": d["contributionCount"],
              "level": LEVELS.get(d["contributionLevel"], 0)}
             for d in week["contributionDays"]]
            for week in calendar["weeks"]
        ],
    }


async def calendar_for(user_id: int, http: httpx.AsyncClient, token: str, login: str,
                       now: float | None = None) -> dict[str, Any]:
    """The calendar, from a 30-minute in-process cache when possible."""
    now = time.monotonic() if now is None else now
    hit = _cache.get(user_id)
    if hit and now - hit[0] < CACHE_SECONDS:
        return hit[1]
    calendar = await fetch_calendar(http, token, login)
    _cache[user_id] = (now, calendar)
    return calendar
