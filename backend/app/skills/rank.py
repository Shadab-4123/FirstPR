"""Ranks open, unclaimed issues for one user. Every point of the score has a reason
the UI can show, so "why is this first?" always has an answer.

    match = 0.55 language  (your share of that language / your top language's share)
          + 0.25 level     (1 for your level, 0.5 one step away)
          + 0.12 health    (repo health / 100; unknown counts as 50)
          + 0.08 fresh     (1 if updated within 30 days, 0.5 within 90)
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import Select, case, desc, func, literal, select

from app.db.models import Issue, Repo
from app.scoring.classify import LEVELS, Level

WEIGHTS = {"language": 0.55, "level": 0.25, "health": 0.12, "fresh": 0.08}
HEALTHY = 70
FRESH_DAYS, STALE_DAYS = 30, 90


def language_weights(profile: dict[str, Any] | None) -> dict[str, float]:
    """{"python": 1.0, "go": 0.4}: lower-cased name -> share relative to the top one."""
    languages = (profile or {}).get("languages") or []
    if not languages:
        return {}
    top = languages[0]["share"]
    return {lang["name"].lower(): lang["share"] / top for lang in languages}


def _level_fit(level: Level) -> dict[str, float]:
    i = LEVELS.index(level)
    return {lv: 1.0 if j == i else 0.5 if abs(j - i) == 1 else 0.0
            for j, lv in enumerate(LEVELS)}


def match_expression(languages: dict[str, float], level: Level, now: datetime):
    lang = func.lower(Repo.language)
    language_part = (
        case(*[(lang == name, weight) for name, weight in languages.items()], else_=0.0)
        if languages else literal(0.0)
    )
    fit = _level_fit(level)
    level_part = case(*[(Issue.level == lv, w) for lv, w in fit.items()], else_=0.0)
    health_part = func.coalesce(Repo.health_score, 50) / 100.0
    fresh_part = case((Issue.updated_at >= now - timedelta(days=FRESH_DAYS), 1.0),
                      (Issue.updated_at >= now - timedelta(days=STALE_DAYS), 0.5), else_=0.0)
    return (WEIGHTS["language"] * language_part + WEIGHTS["level"] * level_part
            + WEIGHTS["health"] * health_part + WEIGHTS["fresh"] * fresh_part)


def _candidates() -> Select:
    return (select(Issue).join(Repo, Issue.repo_id == Repo.id)
            .where(Issue.state == "open", Issue.is_available.is_(True)))


def recommended(languages: dict[str, float], level: Level, page: int, page_size: int,
                now: datetime | None = None) -> Select:
    """Rows of (Issue, match). Scans every available issue: a few thousand rows, ~ms."""
    score = match_expression(languages, level, now or datetime.now(UTC)).label("match")
    return (
        _candidates().add_columns(score)
        .order_by(desc("match"), desc(Issue.updated_at), desc(Issue.id))
        .limit(page_size).offset((page - 1) * page_size)
    )


def recommended_count() -> Select:
    return select(func.count()).select_from(_candidates().subquery())


def match_reasons(issue: Issue, profile: dict[str, Any] | None, level: Level,
                  now: datetime | None = None) -> list[str]:
    """Plain-language reasons, strongest first; mirrors the score above."""
    now = now or datetime.now(UTC)
    reasons = []
    names = [lang["name"] for lang in (profile or {}).get("languages") or []]
    repo_language = issue.repo.language
    if repo_language and repo_language.lower() in (n.lower() for n in names):
        if names[0].lower() == repo_language.lower():
            reasons.append(f"{repo_language}, your main language")
        else:
            reasons.append(f"{repo_language}, one of your languages")
    if issue.level == level:
        reasons.append("Right for your level")
    elif issue.level and LEVELS.index(issue.level) == LEVELS.index(level) + 1:  # type: ignore[arg-type]
        reasons.append("A step up from your level")
    if (issue.repo.health_score or 0) >= HEALTHY:
        reasons.append("Healthy, active repo")
    if issue.updated_at >= now - timedelta(days=FRESH_DAYS):
        reasons.append("Recently active")
    return reasons
