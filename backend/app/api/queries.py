"""Turns validated search filters into one SQL query. Kept separate from the
route so it can be unit-tested and EXPLAIN ANALYZE'd on its own."""

from datetime import UTC, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import Select, desc, func, select

from app.db.models import Issue, Repo

SortKey = Literal["relevance", "newest", "updated", "stars"]
Difficulty = Literal["easy", "medium", "hard"]


class IssueFilters(BaseModel):
    language: str | None = Field(None, max_length=60)
    labels: list[str] = Field(default_factory=list, max_length=10)
    min_stars: int = Field(0, ge=0)
    difficulty: list[Difficulty] = Field(default_factory=list)
    available_only: bool = True
    updated_within_days: int | None = Field(None, ge=1, le=365)
    q: str | None = Field(None, max_length=200)
    sort: SortKey = "relevance"
    page: int = Field(1, ge=1, le=1000)
    page_size: int = Field(20, ge=1, le=50)


def filtered_issues(f: IssueFilters) -> Select:
    """All WHERE clauses, no ordering or paging. Shared by the list and the count."""
    stmt = select(Issue).join(Repo, Issue.repo_id == Repo.id).where(Issue.state == "open")
    if f.available_only:
        stmt = stmt.where(Issue.is_available.is_(True))
    if f.language:
        stmt = stmt.where(func.lower(Repo.language) == f.language.lower())
    if f.labels:
        stmt = stmt.where(Issue.labels.contains(f.labels))  # labels @> ARRAY[...]
    if f.min_stars:
        stmt = stmt.where(Repo.stars >= f.min_stars)
    if f.difficulty:
        stmt = stmt.where(Issue.difficulty_label.in_(f.difficulty))
    if f.updated_within_days:
        since = datetime.now(UTC) - timedelta(days=f.updated_within_days)
        stmt = stmt.where(Issue.updated_at >= since)
    if f.q:
        stmt = stmt.where(Issue.search_vector.op("@@")(_tsquery(f.q)))
    return stmt


def _tsquery(q: str):
    # websearch_to_tsquery accepts user syntax ("date parser" -regex) and never errors.
    return func.websearch_to_tsquery("english", q)


def issue_search(f: IssueFilters) -> Select:
    stmt = filtered_issues(f)
    if f.sort == "relevance" and f.q:
        stmt = stmt.order_by(desc(func.ts_rank(Issue.search_vector, _tsquery(f.q))))
    elif f.sort == "newest":
        stmt = stmt.order_by(desc(Issue.created_at))
    elif f.sort == "stars":
        stmt = stmt.order_by(desc(Repo.stars))
    else:  # "updated", or "relevance" without a text query
        stmt = stmt.order_by(desc(Issue.updated_at))
    return (
        stmt.order_by(desc(Issue.id))  # stable tiebreak so pages never overlap
        .limit(f.page_size)
        .offset((f.page - 1) * f.page_size)
    )


def issue_count(f: IssueFilters) -> Select:
    return select(func.count()).select_from(filtered_issues(f).subquery())
