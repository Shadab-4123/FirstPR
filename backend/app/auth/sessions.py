"""Server-side sessions: random token in an HttpOnly cookie, its SHA-256 in the database.

Why not a signed cookie with the user id inside? Logout and "revoke all sessions"
would be impossible without a secret rotation; with a table, deleting a row is enough.
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import User, UserSession
from app.db.session import get_db

COOKIE_NAME = "firstpr_session"
SESSION_DAYS = 30


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user_id: int) -> str:
    """Returns the raw token for the cookie. Only its hash is stored."""
    token = secrets.token_urlsafe(32)  # 256 bits
    db.add(UserSession(token_hash=_hash(token), user_id=user_id,
                       expires_at=datetime.now(UTC) + timedelta(days=SESSION_DAYS)))
    db.commit()
    return token


def end_session(db: Session, token: str) -> None:
    db.execute(delete(UserSession).where(UserSession.token_hash == _hash(token)))
    db.commit()


def user_for_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    return db.execute(
        select(User)
        .join(UserSession, UserSession.user_id == User.id)
        .where(UserSession.token_hash == _hash(token),
               UserSession.expires_at > datetime.now(UTC))
    ).scalar_one_or_none()


def optional_user(request: Request, db: Annotated[Session, Depends(get_db)]) -> User | None:
    return user_for_token(db, request.cookies.get(COOKIE_NAME))


def current_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise HTTPException(401, "Sign in with GitHub to do that.")
    return user


OptionalUser = Annotated[User | None, Depends(optional_user)]
CurrentUser = Annotated[User, Depends(current_user)]
