"""Idempotent writes: upsert on github_id, so re-running a sync never duplicates rows."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import Issue, Repo
from app.scoring.health import score_repo_health


def upsert_repo(db: Session, row: dict[str, Any], etag: str | None) -> int:
    values = {**row, "etag": etag, "fetched_at": datetime.now(UTC)}
    insert_stmt = insert(Repo).values(**values)
    stmt = insert_stmt.on_conflict_do_update(
        index_elements=[Repo.github_id],
        set_={k: insert_stmt.excluded[k] for k in values if k != "github_id"},
    ).returning(Repo.id)
    return db.execute(stmt).scalar_one()


def touch_repo(db: Session, repo_id: int) -> None:
    """A 304 means the repo is unchanged; just record that we checked."""
    db.execute(update(Repo).where(Repo.id == repo_id).values(fetched_at=datetime.now(UTC)))


# Owned by the re-check job (app/sync/recheck.py), which has the full picture:
# comments, linked PRs, labels. Search results only ever say "open and unassigned",
# so letting the sync overwrite these would wipe out a detected claim or linked PR.
RECHECK_OWNED = {"is_available", "unavailable_reason", "has_linked_pr"}


def upsert_issue(db: Session, row: dict[str, Any]) -> int:
    values = {**row, "last_seen_at": datetime.now(UTC)}
    insert_stmt = insert(Issue).values(**values)
    stmt = insert_stmt.on_conflict_do_update(
        index_elements=[Issue.github_id],
        set_={
            k: insert_stmt.excluded[k]
            for k in values
            if k != "github_id" and k not in RECHECK_OWNED
        },
    ).returning(Issue.id)
    return db.execute(stmt).scalar_one()


def rescore_repo_health(db: Session) -> int:
    """Recompute every repo's health score from stored columns. No GitHub calls.

    Run after each sync rather than at fetch time: "last push 20 days ago" becomes
    "50 days ago" even when the repo itself is unchanged (a 304).
    """
    now = datetime.now(UTC)
    rows = db.execute(
        select(Repo.id, Repo.archived, Repo.pushed_at, Repo.stars, Repo.forks,
               Repo.has_contributing)
    ).all()
    updates = [
        {
            "id": r.id,
            "health_score": score_repo_health(
                archived=r.archived, pushed_at=r.pushed_at, stars=r.stars, forks=r.forks,
                has_contributing=r.has_contributing, now=now,
            ).score,
            "health_updated_at": now,
        }
        for r in rows
    ]
    if updates:
        db.execute(update(Repo), updates)  # bulk UPDATE ... WHERE id = :id
    db.commit()
    return len(updates)
