"""Repo health score: will someone actually review a beginner's PR here?

A hand-written, explainable formula, 0-100, built only from columns we already
store, so computing it costs no GitHub requests. Every weight below is a guess
to be revisited; the reasons list is returned so the UI can show its working.

Points (max 100):
  activity    40  how recently code was pushed (the strongest "alive" signal)
  popularity  25  stars, log scale: 10 -> 6, 100 -> 12, 1k -> 19, 10k+ -> 25
  community   15  forks, log scale: people have actually contributed before
  docs        20  CONTRIBUTING file (unknown = half, so missing data isn't punished)
An archived repo scores 0: nobody will merge anything.
"""

import math
from dataclasses import dataclass, field
from datetime import datetime

ACTIVITY_STEPS = ((30, 40), (90, 30), (180, 15), (365, 5))  # (max days since push, points)
POPULARITY_MAX, POPULARITY_FULL_AT = 25, 10_000
COMMUNITY_MAX, COMMUNITY_FULL_AT = 15, 1_000
DOCS_MAX = 20


@dataclass
class HealthResult:
    score: int  # 0..100
    reasons: list[str] = field(default_factory=list)


def _log_points(value: int, full_at: int, max_points: int) -> int:
    if value <= 0:
        return 0
    return round(max_points * min(1.0, math.log10(value + 1) / math.log10(full_at + 1)))


def score_repo_health(
    *,
    archived: bool,
    pushed_at: datetime | None,
    stars: int,
    forks: int,
    has_contributing: bool | None,
    now: datetime,
) -> HealthResult:
    if archived:
        return HealthResult(0, ["archived: read-only, nothing will be merged"])

    reasons: list[str] = []
    score = 0

    if pushed_at is None:
        reasons.append("no push date known")
    else:
        days = (now - pushed_at).days
        activity = next((pts for limit, pts in ACTIVITY_STEPS if days <= limit), 0)
        score += activity
        reasons.append(f"last push {days} days ago (+{activity})")

    popularity = _log_points(stars, POPULARITY_FULL_AT, POPULARITY_MAX)
    score += popularity
    reasons.append(f"{stars:,} stars (+{popularity})")

    community = _log_points(forks, COMMUNITY_FULL_AT, COMMUNITY_MAX)
    score += community
    reasons.append(f"{forks:,} forks (+{community})")

    if has_contributing is None:
        docs = DOCS_MAX // 2
        reasons.append(f"contributing guide not checked yet (+{docs})")
    elif has_contributing:
        docs = DOCS_MAX
        reasons.append(f"has a contributing guide (+{docs})")
    else:
        docs = 0
        reasons.append("no contributing guide (+0)")
    score += docs

    return HealthResult(score, reasons)
