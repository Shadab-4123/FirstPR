"""Collect ground truth for the difficulty model into `training_examples`.

Each example is a closed good-first-issue fixed by a merged PR. The PR tells us
how much work the issue really took (files changed, lines changed, hours to merge).

Why GraphQL: one request returns 50 issues *with* their closing PRs, comments and
repo, at a cost of ~1 point out of 5,000/hour. The REST API would need about
three requests per issue (search, timeline, PR).

Leakage rule: `raw` keeps only what was visible while the issue was still open:
comments posted after the PR was opened usually discuss the fix, so they're dropped.

Usage (from backend/):
    python -m app.ml.collect --language python --per-language 600 --months 24
"""

import argparse
import asyncio
import logging
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.models import TrainingExample
from app.github.client import GitHubClient, GitHubError, RateLimitExceeded
from app.sync.discover import Window, needs_split

log = logging.getLogger("firstpr.ml.collect")

PAGE_SIZE = 50  # bodies + 30 comments each: keep responses a sane size
MAX_BODY_CHARS = 8000
MAX_COMMENT_CHARS = 1000

QUERY = """
query ($q: String!, $first: Int!, $cursor: String) {
  rateLimit { cost remaining resetAt }
  search(query: $q, type: ISSUE, first: $first, after: $cursor) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on Issue {
        databaseId number title body createdAt closedAt authorAssociation
        labels(first: 20) { nodes { name } }
        comments(first: 30) { totalCount nodes { createdAt authorAssociation body } }
        repository {
          nameWithOwner stargazerCount forkCount diskUsage
          primaryLanguage { name }
        }
        closedByPullRequestsReferences(first: 5, includeClosedPrs: false) {
          nodes { number merged mergedAt createdAt additions deletions changedFiles }
        }
      }
    }
  }
}
"""


def build_query(language: str, window: Window) -> str:
    lang = f'"{language}"' if " " in language else language
    return (
        'label:"good first issue" is:issue is:closed reason:completed linked:pr '
        f"language:{lang} closed:{window.start}..{window.end}"
    )


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def map_training_example(node: dict[str, Any], *, min_stars: int) -> tuple[dict | None, str]:
    """Turn one GraphQL issue node into a row, or (None, why_skipped)."""
    if not node.get("databaseId"):
        return None, "not_an_issue"
    repo = node["repository"]
    if repo["stargazerCount"] < min_stars:
        return None, "low_stars"  # same cut as the sync: toy repos aren't what we score

    merged = [p for p in node["closedByPullRequestsReferences"]["nodes"] if p and p["merged"]]
    if not merged:
        return None, "no_merged_pr"
    pr = min(merged, key=lambda p: p["mergedAt"])  # the PR that actually fixed it
    pr_created, pr_merged = _dt(pr["createdAt"]), _dt(pr["mergedAt"])
    issue_created = _dt(node["createdAt"])
    if pr_created < issue_created:
        return None, "pr_before_issue"  # issue filed after the fact to document a PR

    # Leakage guard: only comments that existed before anyone opened the fix.
    pre_pr_comments = [
        {"created_at": c["createdAt"], "author_association": c["authorAssociation"],
         "body": (c["body"] or "")[:MAX_COMMENT_CHARS]}
        for c in node["comments"]["nodes"]
        if c and _dt(c["createdAt"]) < pr_created
    ]
    language = (repo.get("primaryLanguage") or {}).get("name")

    return {
        "issue_github_id": node["databaseId"],
        "repo_full_name": repo["nameWithOwner"],
        "issue_number": node["number"],
        "language": language,
        "issue_created_at": issue_created,
        "issue_closed_at": _dt(node["closedAt"]),
        "raw": {
            "title": node["title"],
            "body": (node["body"] or "")[:MAX_BODY_CHARS],
            "labels": [label["name"] for label in node["labels"]["nodes"]],
            "author_association": node["authorAssociation"],
            "comments_pre_pr": pre_pr_comments,
            "comments_total": node["comments"]["totalCount"],
            # Repo numbers are as of collection time, not issue time: a known, small leak.
            "repo": {"stars": repo["stargazerCount"], "forks": repo["forkCount"],
                     "disk_kb": repo["diskUsage"], "language": language},
        },
        "pr_number": pr["number"],
        "pr_created_at": pr_created,
        "pr_merged_at": pr_merged,
        "files_changed": pr["changedFiles"],
        "lines_changed": pr["additions"] + pr["deletions"],
        "pr_merged_hours": round((pr_merged - issue_created).total_seconds() / 3600, 2),
    }, "ok"


def save_examples(db: Session, rows: list[dict]) -> int:
    if not rows:
        return 0
    # RETURNING counts what was really inserted; rowcount is -1 for multi-row inserts.
    stmt = (
        insert(TrainingExample)
        .values(rows)
        .on_conflict_do_nothing(index_elements=[TrainingExample.issue_github_id])
        .returning(TrainingExample.id)
    )
    inserted = len(db.execute(stmt).all())
    db.commit()
    return inserted


def monthly_windows(today: date, months: int) -> list[Window]:
    """Newest-first ~30-day windows going back `months` months."""
    windows, end = [], today
    for _ in range(months):
        start = end - timedelta(days=29)
        windows.append(Window(start, end))
        end = start - timedelta(days=1)
    return windows


async def collect_window(
    client: GitHubClient, db: Session, language: str, window: Window, *, min_stars: int,
    budget: int, skipped: Counter,
) -> int:
    """Collect up to `budget` examples from one window, halving it if it's over the cap."""
    query, cursor, saved = build_query(language, window), None, 0
    while saved < budget:
        data = await client.graphql(QUERY, {"q": query, "first": PAGE_SIZE, "cursor": cursor})
        search = data["search"]
        if cursor is None and needs_split(search["issueCount"], window):
            # Share the budget between the halves, or the first (older) half takes it all
            # and the sample covers a few days instead of the whole window. Whatever the
            # first half can't fill rolls over to the second.
            older, newer = window.split()
            saved += await collect_window(client, db, language, older, min_stars=min_stars,
                                          budget=budget // 2, skipped=skipped)
            saved += await collect_window(client, db, language, newer, min_stars=min_stars,
                                          budget=budget - saved, skipped=skipped)
            return saved
        rows = []
        for node in search["nodes"]:
            row, why = map_training_example(node, min_stars=min_stars)
            skipped[why] += 1
            if row:
                rows.append(row)
        saved += save_examples(db, rows[: budget - saved])
        if not search["pageInfo"]["hasNextPage"]:
            break
        cursor = search["pageInfo"]["endCursor"]
    return saved


async def collect(
    session_factory: sessionmaker[Session], client: GitHubClient, languages: list[str], *,
    per_language: int, months: int, min_stars: int, today: date | None = None,
) -> dict[str, int]:
    today = today or datetime.now(UTC).date()
    totals: dict[str, int] = {}
    with session_factory() as db:
        for language in languages:
            skipped: Counter = Counter()
            saved = 0
            # An equal share per month, so the data spans the whole period: the time-based
            # train/test split needs old *and* new examples. A quiet month that can't fill
            # its share passes the remainder on to the next (older) one.
            windows = monthly_windows(today, months)
            for i, window in enumerate(windows):
                months_left = len(windows) - i
                share = -(-(per_language - saved) // months_left)  # ceiling division
                try:
                    saved += await collect_window(client, db, language, window,
                                                  min_stars=min_stars, budget=share,
                                                  skipped=skipped)
                except RateLimitExceeded:
                    raise  # waiting won't help within this run; stop cleanly
                except GitHubError as exc:
                    # One bad window (e.g. a 502 that outlasted the retries) shouldn't
                    # throw away an hour of collecting. Its share rolls to later windows.
                    db.rollback()
                    skipped["window_failed"] += 1
                    log.warning("window failed, skipping", extra={
                        "language": language, "window": f"{window.start}..{window.end}",
                        "error": str(exc)})
            totals[language] = saved
            log.info("language done", extra={"language": language, "saved": saved,
                                             **{f"seen_{k}": v for k, v in skipped.items()}})
    return totals


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect difficulty-model training data")
    parser.add_argument("--language", action="append", dest="languages", required=True)
    parser.add_argument("--per-language", type=int, default=600)
    parser.add_argument("--months", type=int, default=24, help="how far back to look")
    parser.add_argument("--min-stars", type=int, default=10)
    args = parser.parse_args()

    settings = get_settings()
    configure_logging(settings.log_level)
    if not settings.github_token:
        raise SystemExit("GITHUB_TOKEN is required: GitHub's GraphQL API rejects anonymous calls")
    from app.db.session import SessionLocal

    async def _run() -> None:
        async with GitHubClient(
            settings.github_token, max_retries=settings.github_max_retries,
            max_wait_s=settings.github_max_rate_limit_wait_s,
        ) as client:
            totals = await collect(SessionLocal, client, args.languages,
                                   per_language=args.per_language, months=args.months,
                                   min_stars=args.min_stars)
            log.info("collection finished", extra={"totals": totals,
                                                   "github_requests": client.requests_made})

    asyncio.run(_run())


if __name__ == "__main__":
    main()
