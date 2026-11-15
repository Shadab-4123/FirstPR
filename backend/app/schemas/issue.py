from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class RepoSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    description: str | None
    html_url: str
    language: str | None
    topics: list[str]
    stars: int
    pushed_at: datetime | None
    health_score: int | None


class DifficultyBreakdown(BaseModel):
    label: Literal["easy", "medium", "hard"] | None
    score: float | None
    reasons: list[str]
    method: Literal["baseline_heuristic"] = "baseline_heuristic"


class HealthBreakdown(BaseModel):
    score: int | None
    reasons: list[str]
    method: Literal["baseline_heuristic"] = "baseline_heuristic"


class ScoreBreakdown(BaseModel):
    difficulty: DifficultyBreakdown
    health: HealthBreakdown


class IssueOut(BaseModel):
    id: int
    number: int
    title: str
    body_excerpt: str
    html_url: str
    labels: list[str]
    comments_count: int
    created_at: datetime
    updated_at: datetime
    is_available: bool
    unavailable_reason: str | None
    difficulty_label: Literal["easy", "medium", "hard"] | None
    repo: RepoSummary
    score_breakdown: ScoreBreakdown


class IssuePage(BaseModel):
    items: list[IssueOut]
    page: int
    page_size: int
    total: int


class FacetCount(BaseModel):
    value: str
    count: int


class FilterMeta(BaseModel):
    languages: list[FacetCount]
    labels: list[FacetCount]
    difficulties: list[FacetCount]


class SyncRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    started_at: datetime
    finished_at: datetime | None
    status: str
    issues_upserted: int


class Stats(BaseModel):
    issues_indexed: int
    issues_available: int
    repos_indexed: int
    last_sync: SyncRunOut | None


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody
