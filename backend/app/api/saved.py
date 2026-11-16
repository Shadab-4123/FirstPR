"""My issues: save an issue and track it from "saved" to "merged".

Every route needs a signed-in user and only ever touches that user's rows.
Cross-site forgery is blocked twice: the session cookie is SameSite=Lax (not sent
on cross-site PUT/DELETE), and a JSON PUT from another origin needs a CORS
preflight that only our own frontend passes.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import joinedload

from app.api.routes import DB, to_issue_out
from app.auth.sessions import CurrentUser
from app.db.models import Issue, SavedIssue
from app.schemas.issue import ErrorResponse
from app.schemas.saved import SavedIssueOut, SaveRequest

router = APIRouter(
    prefix="/api/v1/me/saved", tags=["saved"],
    responses={401: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)


def _out(saved: SavedIssue) -> SavedIssueOut:
    return SavedIssueOut(
        status=saved.status,  # type: ignore[arg-type]
        saved_at=saved.created_at, updated_at=saved.updated_at,
        issue_state=saved.issue.state, issue=to_issue_out(saved.issue),
    )


def _load(db: DB, user_id: int, issue_id: int | None = None):
    stmt = (
        select(SavedIssue)
        .where(SavedIssue.user_id == user_id)
        .options(joinedload(SavedIssue.issue).joinedload(Issue.repo))
        .order_by(SavedIssue.updated_at.desc())
    )
    if issue_id is not None:
        stmt = stmt.where(SavedIssue.issue_id == issue_id)
    return db.execute(stmt).scalars()


@router.get("", response_model=list[SavedIssueOut])
def list_saved(db: DB, user: CurrentUser) -> list[SavedIssueOut]:
    """Most recently changed first."""
    return [_out(s) for s in _load(db, user.id)]


@router.put("/{issue_id}", response_model=SavedIssueOut,
            responses={404: {"model": ErrorResponse}})
def save_issue(issue_id: int, body: SaveRequest, db: DB, user: CurrentUser) -> SavedIssueOut:
    """Save an issue, or move it to another status. Safe to repeat."""
    if db.get(Issue, issue_id) is None:
        raise HTTPException(404, "Issue not found.")
    now = datetime.now(UTC)
    stmt = insert(SavedIssue).values(
        user_id=user.id, issue_id=issue_id, status=body.status, created_at=now, updated_at=now
    )
    db.execute(stmt.on_conflict_do_update(
        index_elements=[SavedIssue.user_id, SavedIssue.issue_id],
        set_={"status": stmt.excluded.status, "updated_at": now},
    ))
    db.commit()
    return _out(_load(db, user.id, issue_id).one())


@router.delete("/{issue_id}", status_code=204)
def unsave_issue(issue_id: int, db: DB, user: CurrentUser) -> Response:
    """Remove from My issues. Removing something that isn't saved is not an error."""
    db.execute(delete(SavedIssue).where(SavedIssue.user_id == user.id,
                                        SavedIssue.issue_id == issue_id))
    db.commit()
    return Response(status_code=204)
