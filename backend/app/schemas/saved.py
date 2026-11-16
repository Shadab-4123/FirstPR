from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.issue import IssueOut

# The order is the journey: found it, started, opened a PR, PR merged.
SavedStatus = Literal["saved", "working", "pr_opened", "merged"]


class SaveRequest(BaseModel):
    status: SavedStatus = "saved"


class SavedIssueOut(BaseModel):
    status: SavedStatus
    saved_at: datetime
    updated_at: datetime
    issue_state: str  # "open", "closed" or "gone" (deleted or made private on GitHub)
    issue: IssueOut


class LanguageShare(BaseModel):
    name: str
    share: float  # 0..1 of the user's public repos, recent ones weighted more


class SkillProfile(BaseModel):
    """What FirstPR guessed from public GitHub activity, shown back so it can be judged."""

    languages: list[LanguageShare]
    level: Literal["new", "some", "experienced"]
    merged_prs: int  # PRs merged into repos the user doesn't own
    repos_counted: int
    updated_at: datetime


class RecommendedIssue(IssueOut):
    match: float  # 0..1, see app/skills/rank.py
    match_reasons: list[str]


class RecommendedPage(BaseModel):
    profile: SkillProfile | None  # None until GitHub has been read once
    level: Literal["new", "some", "experienced"]  # the level ranked for
    items: list[RecommendedIssue]
    page: int
    page_size: int
    total: int
