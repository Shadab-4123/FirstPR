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
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.monitoring import init_sentry
from app.db.models import Repo, SyncRun
from app.github.client import GitHubClient, GitHubError
from app.ml.predict import DifficultyModel
from app.scoring.classify import BIG_REPO_STARS, BUG, HELP_WANTED
from app.sync.discover import (
    GOOD_FIRST_ISSUE,
    OPEN_UNCLAIMED,
    Window,
    batch_repo_queries,
    build_query,
    initial_windows,
    needs_split,
)
from app.sync.mapping import map_issue, map_repo, repo_full_name_from_url
from app.sync.runs import (
    Deadline,
    failure_reason,
    low_on_requests,
    mark_abandoned_runs,
    rotate_daily,
    stop_gracefully_on_sigterm,
)
from app.sync.scoring import rescore_issues
from app.sync.upsert import (
    rescore_repo_health,
    touch_repo,
    upsert_issue,
    upsert_repo,
)

log = logging.getLogger("firstpr.sync")

PER_PAGE = 100
MAX_PAGES = 10  # 10 x 100 = GitHub's 1,000-result cap
# Don't start another language with fewer GitHub requests than this left this hour.
MIN_REQUESTS_TO_START = 300


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
    client: GitHubClient, language: str, window: Window, label: str = GOOD_FIRST_ISSUE
) -> AsyncIterator[list[dict]]:
    """Yield pages of issues for one window, halving the window if it is over the cap."""
    query = build_query(language, window, label)
    first = await client.search_issues(query, page=1, per_page=PER_PAGE)
    if needs_split(first["total_count"], window):
        log.info("splitting window", extra={"window": str(window), "total": first["total_count"]})
        for half in window.split():
            async for page in iter_search_pages(client, language, half, label):
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


async def store_item(
    db: Session, client: GitHubClient, item: dict, *, min_stars: int, stats: SyncStats
) -> None:
    """Upsert one search result, after checking its repo is real, active and big enough."""
    if "pull_request" in item:
        return
    repo = await resolve_repo(db, client, repo_full_name_from_url(item["repository_url"]), stats)
    if repo is None or repo.archived:
        return
    if repo.stars < min_stars:
        stats.skipped_low_stars += 1
        return
    upsert_issue(db, map_issue(item, repo.id, repo_stars=repo.stars))
    stats.issues_upserted += 1


async def sync_language(
    db: Session, client: GitHubClient, language: str, *, limit: int, lookback_days: int,
    min_stars: int, stats: SyncStats, today: date | None = None, label: str = GOOD_FIRST_ISSUE,
) -> None:
    today = today or datetime.now(UTC).date()
    seen_here = 0  # `limit` is per (language, label), not shared across labels
    for window in initial_windows(today, lookback_days):
        async for items in iter_search_pages(client, language, window, label):
            for item in items:
                if seen_here >= limit:
                    db.commit()
                    return
                seen_here += 1
                stats.issues_seen += 1
                await store_item(db, client, item, min_stars=min_stars, stats=stats)
            db.commit()  # one page = one transaction; a crash loses at most a page


async def sync_big_repo_bugs(
    db: Session, client: GitHubClient, stats: SyncStats, *, min_stars: int = BIG_REPO_STARS,
) -> None:
    """Unassigned bugs in the big repos we already index: the "experienced" pool.

    Search can't filter by stars, so we name the repos (several per query) and take
    the 100 most recently updated bugs per query. One page each keeps this cheap.
    """
    names = db.execute(
        select(Repo.full_name)
        .where(Repo.stars >= min_stars, Repo.archived.is_(False))
        .order_by(Repo.stars.desc())
    ).scalars().all()
    base = f'label:"{BUG}" {OPEN_UNCLAIMED}'
    for query in batch_repo_queries(base, list(names)):
        data = await client.search_issues(query, page=1, per_page=PER_PAGE)
        for item in data["items"]:
            stats.issues_seen += 1
            await store_item(db, client, item, min_stars=min_stars, stats=stats)
        db.commit()


async def run_sync(
    session_factory: sessionmaker[Session], client: GitHubClient, languages: list[str], *,
    limit: int, lookback_days: int, min_stars: int,
    labels: tuple[str, ...] = (GOOD_FIRST_ISSUE, HELP_WANTED), big_repo_bugs: bool = True,
    difficulty_model: DifficultyModel | None = None, deadline: Deadline | None = None,
) -> SyncRun:
    """Fetch each language x label, then the big-repo bug pass, then rescore everything.

    With a deadline, no new language/label is started once it has passed (the one in progress
    finishes); the rescoring always runs, and the run still counts as succeeded.
    """
    deadline = deadline or Deadline(None)
    with session_factory() as db:
        if abandoned := mark_abandoned_runs(db):
            log.warning("marked abandoned runs as failed", extra={"count": abandoned})
        run = SyncRun(query=f"languages={','.join(languages)} labels={','.join(labels)} "
                            f"big_repo_bugs={big_repo_bugs} limit={limit} min_stars={min_stars}")
        db.add(run)
        db.commit()

        stats = SyncStats()
        try:
            skipped: list[str] = []
            for language in languages:
                for label in labels:
                    if deadline.passed() or low_on_requests(client, MIN_REQUESTS_TO_START):
                        skipped.append(f"{language}/{label}")
                        continue
                    await sync_language(
                        db, client, language, limit=limit, lookback_days=lookback_days,
                        min_stars=min_stars, stats=stats, label=label,
                    )
            if big_repo_bugs:
                if deadline.passed() or low_on_requests(client, MIN_REQUESTS_TO_START):
                    skipped.append("big-repo bugs")
                else:
                    await sync_big_repo_bugs(db, client, stats)
            if skipped:
                log.warning("time or request budget reached; skipped until the next run",
                            extra={"skipped": skipped})
            rescored = rescore_repo_health(db)
            # Difficulty (model), then level/type, which reads both difficulty and stars.
            counts = rescore_issues(db, difficulty_model)
            log.info("rescored", extra={"repos": rescored, **counts})
            run.status = "succeeded"
        # BaseException: also Ctrl+C and CI stopping the job, which must not leave "running".
        except BaseException as exc:  # record the failure, then re-raise for the exit code
            db.rollback()
            run.status = "failed"
            run.error = failure_reason(exc)
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
    parser = argparse.ArgumentParser(description="Sync open, unclaimed issues from GitHub")
    parser.add_argument("--language", action="append", dest="languages",
                        help="repeatable; default: python")
    parser.add_argument("--limit", type=int, default=200,
                        help="max issues to look at per language, per label")
    parser.add_argument("--beginner-only", action="store_true",
                        help='only "good first issue": skip "help wanted" and big-repo bugs')
    parser.add_argument("--lookback-days", type=int, default=180)
    parser.add_argument("--min-stars", type=int, default=10,
                        help="skip repos below this many stars (filters spam/toy repos)")
    parser.add_argument("--max-minutes", type=float, default=None,
                        help="stop starting new languages after this long (CI time budget)")
    args = parser.parse_args()
    stop_gracefully_on_sigterm()

    settings = get_settings()
    configure_logging(settings.log_level)
    init_sentry(settings, "sync")
    if not settings.github_token:
        log.warning("GITHUB_TOKEN not set: running unauthenticated (60 core / 10 search per hour"
                    " and minute). Expect long waits.")

    from app.db.session import SessionLocal

    labels = (GOOD_FIRST_ISSUE,) if args.beginner_only else (GOOD_FIRST_ISSUE, HELP_WANTED)

    async def _run() -> None:
        async with GitHubClient(
            settings.github_token, max_retries=settings.github_max_retries,
            max_wait_s=settings.github_max_rate_limit_wait_s,
        ) as client:
            # A different first language each day, so the budget doesn't always cut the same ones.
            languages = rotate_daily(args.languages or ["python"], date.today())
            await run_sync(
                SessionLocal, client, languages, limit=args.limit,
                lookback_days=args.lookback_days, min_stars=args.min_stars,
                labels=labels,
                big_repo_bugs=not args.beginner_only,
                difficulty_model=DifficultyModel.load(),
                deadline=Deadline(args.max_minutes),
            )

    asyncio.run(_run())


if __name__ == "__main__":
    main()
