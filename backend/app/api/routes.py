import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select, text
from sqlalchemy.orm import Session, joinedload

from app.api.queries import IssueFilters, issue_count, issue_search
from app.db.models import Issue, Repo, SyncRun
from app.db.session import get_db
from app.schemas.issue import (
    DifficultyBreakdown,
    ErrorResponse,
    FacetCount,
    FilterMeta,
    IssueOut,
    IssuePage,
    RepoSummary,
    ScoreBreakdown,
    Stats,
    SyncRunOut,
)
from app.scoring.difficulty import score_difficulty

router = APIRouter(prefix="/api/v1", responses={422: {"model": ErrorResponse}})
DB = Annotated[Session, Depends(get_db)]


def to_issue_out(issue: Issue) -> IssueOut:
    reasons = score_difficulty(issue.difficulty_signals).reasons if issue.difficulty_signals else []
    return IssueOut(
        id=issue.id,
        number=issue.number,
        title=issue.title,
        body_excerpt=issue.body_excerpt,
        html_url=issue.html_url,
        labels=issue.labels,
        comments_count=issue.comments_count,
        created_at=issue.created_at,
        updated_at=issue.updated_at,
        is_available=issue.is_available,
        unavailable_reason=issue.unavailable_reason,
        difficulty_label=issue.difficulty_label,  # type: ignore[arg-type]
        repo=RepoSummary.model_validate(issue.repo),
        score_breakdown=ScoreBreakdown(
            difficulty=DifficultyBreakdown(
                label=issue.difficulty_label,  # type: ignore[arg-type]
                score=issue.difficulty_score,
                reasons=reasons,
            )
        ),
    )


@router.get("/issues", response_model=IssuePage)
def list_issues(db: DB, filters: Annotated[IssueFilters, Query()]) -> IssuePage:
    rows = db.execute(issue_search(filters).options(joinedload(Issue.repo))).scalars().all()
    total = db.execute(issue_count(filters)).scalar_one()
    return IssuePage(
        items=[to_issue_out(i) for i in rows],
        page=filters.page,
        page_size=filters.page_size,
        total=total,
    )


@router.get("/issues/{issue_id}", response_model=IssueOut, responses={404: {"model": ErrorResponse}})
def get_issue(issue_id: int, db: DB) -> IssueOut:
    issue = db.get(Issue, issue_id, options=[joinedload(Issue.repo)])
    if issue is None:
        raise HTTPException(404, "Issue not found. It may have been closed and removed.")
    return to_issue_out(issue)


# Tiny in-process TTL cache: filter facets change only when a sync runs.
_cache: dict[str, tuple[float, Any]] = {}
CACHE_TTL_S = 60.0


def _cached(key: str, build):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_TTL_S:
        return hit[1]
    value = build()
    _cache[key] = (time.monotonic(), value)
    return value


@router.get("/meta/filters", response_model=FilterMeta)
def filter_meta(db: DB) -> FilterMeta:
    def build() -> FilterMeta:
        open_available = (Issue.state == "open") & Issue.is_available.is_(True)
        languages = db.execute(
            select(Repo.language, func.count(Issue.id).label("n"))
            .join(Issue, Issue.repo_id == Repo.id)
            .where(open_available, Repo.language.is_not(None))
            .group_by(Repo.language)
            .order_by(desc("n"))
        ).all()
        label = func.unnest(Issue.labels).label("label")
        labels_sub = select(label).where(open_available).subquery()
        labels = db.execute(
            select(labels_sub.c.label, func.count().label("n"))
            .group_by(labels_sub.c.label)
            .order_by(desc("n"))
            .limit(40)
        ).all()
        difficulties = db.execute(
            select(Issue.difficulty_label, func.count().label("n"))
            .where(open_available, Issue.difficulty_label.is_not(None))
            .group_by(Issue.difficulty_label)
        ).all()
        return FilterMeta(
            languages=[FacetCount(value=v, count=n) for v, n in languages],
            labels=[FacetCount(value=v, count=n) for v, n in labels],
            difficulties=[FacetCount(value=v, count=n) for v, n in difficulties],
        )

    return _cached("filters", build)


@router.get("/stats", response_model=Stats)
def stats(db: DB) -> Stats:
    def build() -> Stats:
        last = db.execute(
            select(SyncRun).where(SyncRun.status == "succeeded").order_by(desc(SyncRun.id)).limit(1)
        ).scalar_one_or_none()
        return Stats(
            issues_indexed=db.scalar(select(func.count(Issue.id))) or 0,
            issues_available=db.scalar(
                select(func.count(Issue.id)).where(
                    Issue.state == "open", Issue.is_available.is_(True)
                )
            ) or 0,
            repos_indexed=db.scalar(select(func.count(Repo.id))) or 0,
            last_sync=SyncRunOut.model_validate(last) if last else None,
        )

    return _cached("stats", build)


@router.get("/health")
def health(db: DB) -> dict[str, str]:
    db.execute(text("select 1"))
    return {"status": "ok"}
