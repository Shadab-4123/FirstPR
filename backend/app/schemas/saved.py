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
