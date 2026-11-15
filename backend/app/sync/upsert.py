"""Idempotent writes: upsert on github_id, so re-running a sync never duplicates rows."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import Issue, Repo


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
