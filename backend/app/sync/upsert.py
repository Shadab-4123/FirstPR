"""Idempotent writes: upsert on github_id, so re-running a sync never duplicates rows."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import Issue, Repo


def upsert_repo(db: Session, row: dict[str, Any], etag: str | None) -> int:
    values = {**row, "etag": etag, "fetched_at": datetime.now(UTC)}
    stmt = insert(Repo).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Repo.github_id],
        set_={k: stmt.excluded[k] for k in values if k != "github_id"},
    ).returning(Repo.id)
    return db.execute(stmt).scalar_one()


def touch_repo(db: Session, repo_id: int) -> None:
    """A 304 means the repo is unchanged; just record that we checked."""
    db.execute(update(Repo).where(Repo.id == repo_id).values(fetched_at=datetime.now(UTC)))


def upsert_issue(db: Session, row: dict[str, Any]) -> int:
    now = datetime.now(UTC)
    values = {**row, "last_seen_at": now, "last_checked_at": now}
    stmt = insert(Issue).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Issue.github_id],
        set_={k: stmt.excluded[k] for k in values if k != "github_id"},
    ).returning(Issue.id)
    return db.execute(stmt).scalar_one()
