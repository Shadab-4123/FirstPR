"""Is anyone already working on this issue?

An issue is available when it is open, unassigned, has no linked open PR, and
nobody recently said "I'll take this". The reason is returned (and stored) so
the UI can say *why* something was hidden.
"""

import re
from dataclasses import dataclass
from typing import Literal

UnavailableReason = Literal["closed", "assigned", "linked_pr", "claimed_in_comments"]

# Phrases people use to claim an issue. Kept deliberately narrow: a false
# "claimed" hides a good issue, which is worse than showing a taken one.
CLAIM_PATTERNS = re.compile(
    r"\b("
    r"i'?ll (take|work on|pick up|handle) (this|it)"
    r"|i('?m| am) (working|currently working) on (this|it)"
    r"|i('?d| would) like to work on (this|it)"
    r"|can i (take|work on|pick up) (this|it)"
    r"|assign (this|it) to me"
    r"|please assign me"
    r")",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Availability:
    available: bool
    reason: UnavailableReason | None = None


def is_claim_comment(text: str) -> bool:
    return bool(CLAIM_PATTERNS.search(text))


def check_availability(
    *,
    state: str,
    assignee_count: int,
    has_linked_pr: bool = False,
    recent_comments: list[str] | None = None,
) -> Availability:
    if state != "open":
        return Availability(False, "closed")
    if assignee_count > 0:
        return Availability(False, "assigned")
    if has_linked_pr:
        return Availability(False, "linked_pr")
    if recent_comments and any(is_claim_comment(c) for c in recent_comments):
        return Availability(False, "claimed_in_comments")
    return Availability(True)
