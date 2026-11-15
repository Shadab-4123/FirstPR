"""Sync worker: copy good-first-issues from GitHub into Postgres.

Usage:
    python -m app.sync.run --language python --limit 200

Every page is committed on its own, and every write is an upsert, so a crashed
run can simply be started again.
"""

import argparse
import asyncio
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import CursorResult, select, update
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.models import Repo, SyncRun
from app.github.client import GitHubClient, GitHubError
from app.sync.discover import Window, build_query, initial_windows, needs_split
from app.sync.mapping import map_issue, map_repo, repo_full_name_from_url
from app.sync.upsert import touch_repo, upsert_issue, upsert_repo

log = logging.getLogger("firstpr.sync")

PER_PAGE = 100
MAX_PAGES = 10  # 10 x 100 = GitHub's 1,000-result cap


@dataclass
class RepoInfo:
    id: int
    stars: int
    archived: bool


@dataclass
class SyncStats:
    issues_seen: int = 0
    issues_upserted: int = 0
    repos_upserted: int = 0
    skipped_low_stars: int = 0
    repo_cache: dict[str, RepoInfo | None] = field(default_factory=dict)


async def iter_search_pages(
    client: GitHubClient, language: str, window: Window
) -> AsyncIterator[list[dict]]:
    """Yield pages of issues for one window, halving the window if it is over the cap."""
    query = build_query(language, window)
    first = await client.search_issues(query, page=1, per_page=PER_PAGE)
    if needs_split(first["total_count"], window):
        log.info("splitting window", extra={"window": str(window), "total": first["total_count"]})
        for half in window.split():
            async for page in iter_search_pages(client, language, half):
                yield page
        return

    yield first["items"]
    pages = min(MAX_PAGES, -(-first["total_count"] // PER_PAGE))
    for page_no in range(2, pages + 1):
        data = await client.search_issues(query, page=page_no, per_page=PER_PAGE)
        if not data["items"]:
            return
        yield data["items"]


async def resolve_repo(
    db: Session, client: GitHubClient, full_name: str, stats: SyncStats
) -> RepoInfo | None:
    """Fetch a repo once per run. Uses the stored ETag, so unchanged repos cost nothing."""
    if full_name in stats.repo_cache:
        return stats.repo_cache[full_name]

    existing = db.execute(select(Repo).where(Repo.full_name == full_name)).scalar_one_or_none()
    try:
        resp = await client.get_repo(full_name, etag=existing.etag if existing else None)
    except GitHubError as exc:
        if exc.status in (404, 451):  # deleted, private or blocked: skip its issues
            stats.repo_cache[full_name] = None
            return None
        raise

    if resp.not_modified and existing:
        touch_repo(db, existing.id)
        info = RepoInfo(existing.id, existing.stars, existing.archived)
    else:
        row = map_repo(resp.data)
        repo_id = upsert_repo(db, row, resp.etag)
        stats.repos_upserted += 1
        info = RepoInfo(repo_id, row["stars"], row["archived"])
    stats.repo_cache[full_name] = info
    return info


async def sync_language(
    db: Session, client: GitHubClient, language: str, *, limit: int, lookback_days: int,
    min_stars: int, stats: SyncStats, today: date | None = None,
) -> None:
    today = today or datetime.now(UTC).date()
    for window in initial_windows(today, lookback_days):
        async for items in iter_search_pages(client, language, window):
            for item in items:
                if stats.issues_seen >= limit:
                    db.commit()
                    return
                stats.issues_seen += 1
                if "pull_request" in item:
                    continue
                repo = await resolve_repo(
                    db, client, repo_full_name_from_url(item["repository_url"]), stats
                )
                if repo is None or repo.archived:
                    continue
                if repo.stars < min_stars:
                    stats.skipped_low_stars += 1
                    continue
                upsert_issue(db, map_issue(item, repo.id))
                stats.issues_upserted += 1
            db.commit()  # one page = one transaction; a crash loses at most a page


ABANDONED_AFTER = timedelta(hours=3)


def mark_abandoned_runs(db: Session) -> int:
    """A run killed mid-way (Ctrl+C, machine off, CI timeout) never records its end.
    Without this it would stay "running" forever and confuse /stats."""
    result: CursorResult = db.execute(  # type: ignore[assignment]
        update(SyncRun)
        .where(SyncRun.status == "running",
               SyncRun.started_at < datetime.now(UTC) - ABANDONED_AFTER)
        .values(status="failed", error="abandoned: process stopped before finishing")
    )
    db.commit()
    return result.rowcount


async def run_sync(
    session_factory: sessionmaker[Session], client: GitHubClient, languages: list[str], *,
    limit: int, lookback_days: int, min_stars: int,
) -> SyncRun:
    with session_factory() as db:
        if abandoned := mark_abandoned_runs(db):
            log.warning("marked abandoned runs as failed", extra={"count": abandoned})
        run = SyncRun(query=f"languages={','.join(languages)} limit={limit} min_stars={min_stars}")
        db.add(run)
        db.commit()

        stats = SyncStats()
        try:
            for language in languages:
                lang_stats = SyncStats(repo_cache=stats.repo_cache)
                await sync_language(
                    db, client, language, limit=limit, lookback_days=lookback_days,
                    min_stars=min_stars, stats=lang_stats,
                )
                stats.issues_seen += lang_stats.issues_seen
                stats.issues_upserted += lang_stats.issues_upserted
                stats.repos_upserted += lang_stats.repos_upserted
                stats.skipped_low_stars += lang_stats.skipped_low_stars
            run.status = "succeeded"
        except Exception as exc:  # record the failure, then re-raise for the exit code
            db.rollback()
            run.status = "failed"
            run.error = f"{type(exc).__name__}: {exc}"[:2000]
            raise
        finally:
            run.finished_at = datetime.now(UTC)
            run.issues_seen = stats.issues_seen
            run.issues_upserted = stats.issues_upserted
            run.repos_upserted = stats.repos_upserted
            run.github_requests = client.requests_made
            run.rate_limit_remaining = client.buckets["core"].remaining
            db.add(run)
            db.commit()
            log.info(
                "sync finished",
                extra={
                    "status": run.status, "issues_seen": stats.issues_seen,
                    "issues_upserted": stats.issues_upserted,
                    "repos_upserted": stats.repos_upserted,
                    "skipped_low_stars": stats.skipped_low_stars,
                    "github_requests": client.requests_made,
                },
            )
        return run


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync good-first-issues from GitHub")
    parser.add_argument("--language", action="append", dest="languages",
                        help="repeatable; default: python")
    parser.add_argument("--limit", type=int, default=200, help="max issues to look at per language")
    parser.add_argument("--lookback-days", type=int, default=180)
    parser.add_argument("--min-stars", type=int, default=10,
                        help="skip repos below this many stars (filters spam/toy repos)")
    args = parser.parse_args()

    settings = get_settings()
    configure_logging(settings.log_level)
    if not settings.github_token:
        log.warning("GITHUB_TOKEN not set: running unauthenticated (60 core / 10 search per hour"
                    " and minute). Expect long waits.")

    from app.db.session import SessionLocal

    async def _run() -> None:
        async with GitHubClient(
            settings.github_token, max_retries=settings.github_max_retries,
            max_wait_s=settings.github_max_rate_limit_wait_s,
        ) as client:
            await run_sync(
                SessionLocal, client, args.languages or ["python"], limit=args.limit,
                lookback_days=args.lookback_days, min_stars=args.min_stars,
            )

    asyncio.run(_run())


if __name__ == "__main__":
    main()
