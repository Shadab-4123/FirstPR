"""Re-check issues we already have, so the index never shows closed or taken ones.

The sync only *adds* issues: GitHub search returns open, unassigned issues, so an
issue that gets closed or assigned simply stops appearing and its row would stay
"open" forever. This job visits stored open issues, oldest-checked first:

1. GET the issue with its stored ETag. 304 = unchanged since last check, and a
   304 doesn't count against the rate limit, so a daily pass is cheap.
2. If it changed and is still open + unassigned + labelled, also fetch recent
   comments ("I'll take this") and the timeline (open PRs that reference it).
3. Recompute availability from all of that and store it, with the reason.
4. 404 / 410 / 301 means deleted, hidden or transferred: mark it gone.

Usage:
    python -m app.sync.recheck --max 1500
"""

import argparse
import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session, joinedload, sessionmaker

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.models import Issue, SyncRun
from app.github.client import GitHubClient, GitHubError
from app.ml.predict import DifficultyModel
from app.scoring.availability import check_availability, has_open_linked_pr
from app.sync.mapping import BODY_EXCERPT_CHARS, map_issue
from app.sync.scoring import rescore_issues

log = logging.getLogger("firstpr.recheck")

CLAIM_LOOKBACK = timedelta(days=30)  # an "I'll take this" from last year doesn't count
GONE_STATUSES = (301, 404, 410)
COMMIT_EVERY = 50


@dataclass
class RecheckStats:
    checked: int = 0
    unchanged: int = 0
    updated: int = 0
    newly_unavailable: int = 0
    gone: int = 0


def issues_to_check(db: Session, limit: int) -> list[Issue]:
    """Open issues (available or not: an assigned one can be freed), never-checked first."""
    stmt = (
        select(Issue)
        .options(joinedload(Issue.repo))
        .where(Issue.state == "open")
        .order_by(Issue.last_checked_at.asc().nulls_first(), Issue.id)
        .limit(limit)
    )
    return list(db.execute(stmt).scalars())


async def recheck_issue(
    db: Session, client: GitHubClient, issue: Issue, stats: RecheckStats, now: datetime
) -> None:
    full_name = issue.repo.full_name
    was_available = issue.is_available
    stats.checked += 1

    # Issues stored before BODY_EXCERPT_CHARS grew still hold a short body. Asking
    # without the ETag makes GitHub send the issue again instead of a 304; once
    # stored in full, the ETag is used as normal. A one-time cost per issue.
    full_length = (issue.difficulty_signals or {}).get("body_length", 0)
    body_is_short = len(issue.body_excerpt) < min(full_length, BODY_EXCERPT_CHARS)
    try:
        resp = await client.get_issue(
            full_name, issue.number, etag=None if body_is_short else issue.etag
        )
    except GitHubError as exc:
        if exc.status not in GONE_STATUSES:
            raise
        db.execute(
            update(Issue).where(Issue.id == issue.id).values(
                state="gone", is_available=False, unavailable_reason="closed",
                last_checked_at=now,
            )
        )
        stats.gone += 1
        return

    if resp.not_modified:
        db.execute(update(Issue).where(Issue.id == issue.id).values(last_checked_at=now))
        stats.unchanged += 1
        return

    row = map_issue(resp.data, issue.repo_id)
    has_linked_pr = False
    recent_comments: list[str] = []
    # Extra calls only when they could still change the answer.
    worth_digging = (
        row["state"] == "open" and row["assignee_count"] == 0
        and check_availability(state="open", assignee_count=0, labels=row["labels"]).available
    )
    if worth_digging:
        timeline = await client.get_issue_timeline(full_name, issue.number)
        has_linked_pr = has_open_linked_pr(timeline)
        if row["comments_count"] > 0:
            since = (now - CLAIM_LOOKBACK).isoformat()
            comments = await client.get_issue_comments(full_name, issue.number, since=since)
            recent_comments = [c.get("body") or "" for c in comments]

    availability = check_availability(
        state=row["state"], assignee_count=row["assignee_count"], has_linked_pr=has_linked_pr,
        recent_comments=recent_comments, labels=row["labels"],
    )
    row.pop("github_id")
    row.pop("repo_id")
    row.update(
        is_available=availability.available, unavailable_reason=availability.reason,
        has_linked_pr=has_linked_pr, etag=resp.etag, last_checked_at=now,
    )
    db.execute(update(Issue).where(Issue.id == issue.id).values(**row))
    stats.updated += 1
    if was_available and not availability.available:
        stats.newly_unavailable += 1
        log.info("issue no longer available", extra={
            "issue": f"{full_name}#{issue.number}", "reason": availability.reason})


async def run_recheck(
    session_factory: sessionmaker[Session], client: GitHubClient, *, max_issues: int,
    difficulty_model: DifficultyModel | None = None,
) -> SyncRun:
    with session_factory() as db:
        run = SyncRun(query=f"recheck max={max_issues}")
        db.add(run)
        db.commit()
        stats = RecheckStats()
        try:
            now = datetime.now(UTC)
            for i, issue in enumerate(issues_to_check(db, max_issues), start=1):
                await recheck_issue(db, client, issue, stats, now)
                if i % COMMIT_EVERY == 0:
                    db.commit()  # a crash loses at most COMMIT_EVERY checks
            rescore_issues(db, difficulty_model)  # text, labels or comments may have changed
            run.status = "succeeded"
        except Exception as exc:
            db.rollback()
            run.status = "failed"
            run.error = f"{type(exc).__name__}: {exc}"[:2000]
            raise
        finally:
            run.finished_at = datetime.now(UTC)
            run.issues_seen = stats.checked
            run.issues_upserted = stats.updated + stats.gone
            run.github_requests = client.requests_made
            run.rate_limit_remaining = client.buckets["core"].remaining
            db.add(run)
            db.commit()
            log.info("recheck finished", extra={"status": run.status, **stats.__dict__,
                                                 "github_requests": client.requests_made})
        return run


def main() -> None:
    parser = argparse.ArgumentParser(description="Re-check stored issues against GitHub")
    parser.add_argument("--max", type=int, default=1500, dest="max_issues",
                        help="max issues to check this run (oldest-checked first)")
    args = parser.parse_args()

    settings = get_settings()
    configure_logging(settings.log_level)
    from app.db.session import SessionLocal

    async def _run() -> None:
        async with GitHubClient(
            settings.github_token, max_retries=settings.github_max_retries,
            max_wait_s=settings.github_max_rate_limit_wait_s,
        ) as client:
            await run_recheck(SessionLocal, client, max_issues=args.max_issues,
                              difficulty_model=DifficultyModel.load())

    asyncio.run(_run())


if __name__ == "__main__":
    main()
