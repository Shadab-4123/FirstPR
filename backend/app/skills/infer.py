"""What a user knows, guessed from public GitHub activity. Pure functions, no I/O.

Languages: each public repo's main language, weighted by how recently it was pushed
(a repo touched this year says more than one from 2019) and halved for forks (a fork
shows interest, not necessarily code written). Shares sum to 1.

Level: PRs merged into other people's repos. That's exactly the experience the levels
describe: 0 means your first PR is still ahead; 10+ means you know the routine.
"""

from datetime import datetime, timedelta
from typing import Any

from app.scoring.classify import Level

MAX_LANGUAGES = 5
MIN_SHARE = 0.05  # a language in one old repo out of thirty isn't a skill
SOME_AT = 1
EXPERIENCED_AT = 10


def _recency(pushed_at: str | None, now: datetime) -> float:
    if not pushed_at:
        return 0.2
    age = now - datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
    if age <= timedelta(days=365):
        return 1.0
    if age <= timedelta(days=3 * 365):
        return 0.5
    return 0.2


def infer_languages(repos: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    """[{"name": "Python", "share": 0.62}, ...], largest first."""
    weights: dict[str, float] = {}
    for repo in repos:
        language = repo.get("language")
        if not language:
            continue
        weight = _recency(repo.get("pushed_at"), now) * (0.5 if repo.get("fork") else 1.0)
        weights[language] = weights.get(language, 0.0) + weight
    total = sum(weights.values())
    if not total:
        return []
    shares = sorted(((n, w / total) for n, w in weights.items()), key=lambda x: (-x[1], x[0]))
    kept = [(n, s) for n, s in shares if s >= MIN_SHARE][:MAX_LANGUAGES]
    kept_total = sum(s for _, s in kept)
    return [{"name": n, "share": round(s / kept_total, 3)} for n, s in kept]


def level_from_merged_prs(merged: int) -> Level:
    if merged >= EXPERIENCED_AT:
        return "experienced"
    if merged >= SOME_AT:
        return "some"
    return "new"


def build_profile(repos: list[dict[str, Any]], merged_prs: int, now: datetime) -> dict[str, Any]:
    """What's stored on the user row and shown back to them."""
    return {
        "languages": infer_languages(repos, now),
        "level": level_from_merged_prs(merged_prs),
        "merged_prs": merged_prs,
        "repos_counted": len(repos),
    }
