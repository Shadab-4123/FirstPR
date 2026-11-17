"""For you: issues ranked by the signed-in user's languages and level."""

from datetime import UTC, datetime, timedelta
from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.orm import joinedload

from app.api.routes import DB, to_issue_out
from app.auth.crypto import decrypt_token
from app.auth.sessions import CurrentUser
from app.db.models import Issue
from app.schemas.issue import ErrorResponse
from app.schemas.saved import (
    ContributionCalendar,
    RecommendedIssue,
    RecommendedPage,
    SkillProfile,
)
from app.scoring.classify import Level
from app.skills.contributions import GitHubUnavailable, calendar_for
from app.skills.github import GitHubTokenRejected, refresh_skills
from app.skills.rank import language_weights, match_reasons, recommended, recommended_count

router = APIRouter(prefix="/api/v1/me", tags=["for you"],
                   responses={401: {"model": ErrorResponse}, 422: {"model": ErrorResponse}})

REFRESH_COOLDOWN = timedelta(minutes=1)  # GitHub's search API allows 30 calls a minute


def _profile_out(skills: dict | None, updated_at: datetime | None) -> SkillProfile | None:
    if not skills or updated_at is None:
        return None
    return SkillProfile(**skills, updated_at=updated_at)


@router.get("/recommended", response_model=RecommendedPage)
def recommended_issues(
    db: DB, user: CurrentUser,
    level: Annotated[Level | None, Query(description="Defaults to the inferred level")] = None,
    page: Annotated[int, Query(ge=1, le=100)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> RecommendedPage:
    skills = user.skills
    chosen: Level = level or (skills or {}).get("level") or "new"
    now = datetime.now(UTC)
    rows = db.execute(
        recommended(language_weights(skills), chosen, page, page_size, now)
        .options(joinedload(Issue.repo))
    ).all()
    items = [
        RecommendedIssue(**to_issue_out(issue).model_dump(), match=round(match, 3),
                         match_reasons=match_reasons(issue, skills, chosen, now))
        for issue, match in rows
    ]
    return RecommendedPage(
        profile=_profile_out(skills, user.skills_updated_at), level=chosen, items=items,
        page=page, page_size=page_size, total=db.execute(recommended_count()).scalar_one(),
    )


@router.post("/profile/refresh", response_model=SkillProfile,
             responses={409: {"model": ErrorResponse}, 502: {"model": ErrorResponse}})
async def refresh_profile(db: DB, user: CurrentUser) -> SkillProfile:
    """Read public repos and merged PRs again (also for accounts made before this existed)."""
    if user.skills_updated_at and datetime.now(UTC) - user.skills_updated_at < REFRESH_COOLDOWN:
        return _profile_out(user.skills, user.skills_updated_at)  # type: ignore[return-value]
    if not user.access_token_encrypted:
        raise HTTPException(409, "Sign out and sign in again so FirstPR can read GitHub.")
    token = decrypt_token(user.access_token_encrypted)
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            await refresh_skills(db, http, user.id, token, user.login)
    except GitHubTokenRejected:
        raise HTTPException(
            409, "GitHub no longer accepts FirstPR's access. Sign out and sign in again."
        ) from None
    except httpx.HTTPError:
        raise HTTPException(502, "Couldn't reach GitHub. Try again in a minute.") from None
    db.refresh(user)
    return _profile_out(user.skills, user.skills_updated_at)  # type: ignore[return-value]


@router.get("/contributions", response_model=ContributionCalendar,
            responses={409: {"model": ErrorResponse}, 502: {"model": ErrorResponse}})
async def contributions(user: CurrentUser) -> ContributionCalendar:
    """The signed-in user's GitHub contribution calendar for the last year."""
    if not user.access_token_encrypted:
        raise HTTPException(409, "Sign out and sign in again so FirstPR can read GitHub.")
    token = decrypt_token(user.access_token_encrypted)
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            calendar = await calendar_for(user.id, http, token, user.login)
    except GitHubTokenRejected:
        raise HTTPException(
            409, "GitHub no longer accepts FirstPR's access. Sign out and sign in again."
        ) from None
    except (httpx.HTTPError, GitHubUnavailable):
        raise HTTPException(
            502, "Couldn't read your activity from GitHub. Try again in a minute."
        ) from None
    return ContributionCalendar(**calendar)
