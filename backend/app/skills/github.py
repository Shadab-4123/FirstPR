"""Reads the public activity infer.py needs, with the user's own token (their rate
limit, not ours). Two requests: one page of repos, one search count."""

from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.db.models import User
from app.skills.infer import build_profile

API = "https://api.github.com"
REPOS_PER_PAGE = 100  # the 100 most recently pushed are plenty to see a pattern


class GitHubTokenRejected(Exception):
    """The stored token no longer works (revoked or the app was unauthorised)."""


async def fetch_activity(http: httpx.AsyncClient, token: str, login: str
                         ) -> tuple[list[dict[str, Any]], int]:
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    repos = await http.get(f"{API}/users/{login}/repos", headers=headers,
                           params={"type": "owner", "sort": "pushed",
                                   "per_page": REPOS_PER_PAGE})
    # Merged PRs in repos the user doesn't own: contributions to other projects.
    prs = await http.get(f"{API}/search/issues", headers=headers,
                         params={"q": f"is:pr is:merged author:{login} -user:{login}",
                                 "per_page": 1})
    for resp in (repos, prs):
        if resp.status_code == 401:
            raise GitHubTokenRejected
        resp.raise_for_status()
    return repos.json(), int(prs.json().get("total_count", 0))


async def refresh_skills(db: Session, http: httpx.AsyncClient, user_id: int, token: str,
                         login: str) -> dict[str, Any]:
    repos, merged = await fetch_activity(http, token, login)
    now = datetime.now(UTC)
    profile = build_profile(repos, merged, now)
    db.execute(update(User).where(User.id == user_id)
               .values(skills=profile, skills_updated_at=now))
    db.commit()
    return profile
