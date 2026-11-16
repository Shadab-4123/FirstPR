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
    # model_v1: the trained model (ml/EVAL.md). baseline_heuristic: the hand-written
    # formula, used until the model can score the issue.
    method: Literal["model_v1", "baseline_heuristic"] = "baseline_heuristic"
    confidence: float | None = None  # model only: probability of `label`, 0..1


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
    level: Literal["new", "some", "experienced"] | None
    kind: Literal["docs", "tests", "translation", "performance", "bug", "feature", "other"] | None
    repo: RepoSummary
    score_breakdown: ScoreBreakdown


class IssueDetail(IssueOut):
    """Everything the overview page needs to judge an issue before opening GitHub."""

    body: str  # markdown, up to BODY_EXCERPT_CHARS
    body_truncated: bool  # true when the issue on GitHub is longer than `body`
    author_association: str | None  # e.g. MEMBER: a maintainer wrote it
    assignee_count: int
    has_linked_pr: bool
    last_checked_at: datetime | None  # when we last confirmed it's still free


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


class LevelSummary(BaseModel):
    level: Literal["new", "some", "experienced"]
    total: int
    kinds: list[FacetCount]  # issue count per contribution type, largest first


class SyncRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    started_at: datetime
    finished_at: datetime | None
    status: str
    issues_upserted: int
    # "sync" finds new issues; "recheck" confirms stored ones are still free.
    kind: Literal["sync", "recheck"] = "sync"
    issues_seen: int = 0


class MethodScores(BaseModel):
    accuracy: float
    macro_f1: float
    severe_error_rate: float  # easy called hard or hard called easy; lower is better


class ModelStats(BaseModel):
    """Test-set results from ml/results.json; the full write-up is ml/EVAL.md."""

    trained_at: datetime
    examples_used: int
    test_examples: int
    test_period: list[str]  # [first day, last day]; test issues are newer than training ones
    model: MethodScores
    heuristic: MethodScores  # the hand-written formula used before the model
    majority: MethodScores  # always guessing the most common size
    majority_predicts: str
    share_confident: float
    accuracy_when_confident: float


class Stats(BaseModel):
    issues_indexed: int
    issues_available: int
    repos_indexed: int
    last_sync: SyncRunOut | None  # last finished run that looked for new issues
    last_recheck: SyncRunOut | None = None
    recent_runs: list[SyncRunOut] = []  # newest first
    model_scored: int = 0  # available issues sized by the model (the rest: heuristic)
    hidden_by_reason: list[FacetCount] = []  # why indexed issues aren't shown as free
    by_level: list[FacetCount] = []  # available issues
    by_language: list[FacetCount] = []  # available issues, top languages
    model: ModelStats | None = None


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody
