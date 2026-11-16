"""Sign in with GitHub (OAuth App web flow).

1. /login     sets a one-time `state` cookie and sends the browser to GitHub.
2. GitHub     asks the user to approve, then redirects to /callback?code&state.
3. /callback  checks `state` matches the cookie (stops login CSRF), swaps the code
              for a token server-side, fetches the profile, stores the user with the
              token encrypted, and sets the session cookie.

No scopes are requested: public profile and public repos are all FirstPR reads.
At sign-in the public repos are read once to guess languages and level (app/skills).
"""

import base64
import logging
import secrets
from datetime import UTC, datetime
from typing import Annotated
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.auth.crypto import encrypt_token
from app.auth.sessions import COOKIE_NAME, SESSION_DAYS, OptionalUser, create_session, end_session
from app.core.config import Settings, get_settings
from app.db.models import User
from app.db.session import get_db
from app.skills.github import refresh_skills

log = logging.getLogger("firstpr.auth")

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
TOKEN_URL = "https://github.com/login/oauth/access_token"
USER_URL = "https://api.github.com/user"
STATE_COOKIE = "firstpr_oauth_state"
STATE_MAX_AGE_S = 600  # the user has 10 minutes to approve on GitHub


class Me(BaseModel):
    login: str
    name: str | None
    avatar_url: str | None


def _safe_next(path: str | None) -> str:
    """Only same-site paths: "/explore" yes, "//evil.com" or "https://evil.com" no."""
    if not path or not path.startswith("/") or path.startswith("//") or "\\" in path:
        return "/"
    return path


def _pack_state(state: str, next_path: str) -> str:
    """state + where to land, in characters cookies never need to quote."""
    encoded = base64.urlsafe_b64encode(next_path.encode()).decode().rstrip("=")
    return f"{state}.{encoded}"


def _unpack_state(cookie: str | None) -> tuple[str, str]:
    state, _, encoded = (cookie or "").partition(".")
    try:
        next_path = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode()
    except (ValueError, UnicodeDecodeError):
        next_path = "/"
    return state, _safe_next(next_path)


def _callback_url(settings: Settings) -> str:
    return f"{settings.app_url}/api/v1/auth/github/callback"


def _cookie_kwargs() -> dict:
    # Secure: HTTPS only (browsers also allow it on http://localhost for development).
    # SameSite=Lax: sent when following a link to us, not on cross-site POSTs.
    return {"httponly": True, "secure": True, "samesite": "lax", "path": "/"}


def _require_oauth(settings: Settings) -> tuple[str, str]:
    if not (settings.github_client_id and settings.github_client_secret):
        raise HTTPException(503, "GitHub sign-in isn't configured on this server yet.")
    return settings.github_client_id, settings.github_client_secret


@router.get("/github/login")
def login(settings: Annotated[Settings, Depends(get_settings)], next: str = "/") -> Response:
    client_id, _ = _require_oauth(settings)
    state = secrets.token_urlsafe(24)
    params = {"client_id": client_id, "redirect_uri": _callback_url(settings), "state": state,
              "scope": "", "allow_signup": "true"}
    response = RedirectResponse(f"{AUTHORIZE_URL}?{urlencode(params)}", status_code=302)
    # Where to land afterwards travels inside the state cookie, not in a URL GitHub echoes.
    response.set_cookie(STATE_COOKIE, _pack_state(state, _safe_next(next)),
                        max_age=STATE_MAX_AGE_S, **_cookie_kwargs())
    return response


@router.get("/github/callback")
async def callback(
    request: Request, db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    code: str | None = None, state: str | None = None, error: str | None = None,
) -> Response:
    client_id, client_secret = _require_oauth(settings)
    saved_state, next_path = _unpack_state(request.cookies.get(STATE_COOKIE))
    if error:  # the user pressed Cancel on GitHub
        return _finish("/?signin=cancelled")
    if not code or not state or not saved_state or not secrets.compare_digest(state, saved_state):
        raise HTTPException(400, "Sign-in expired or was tampered with. Please try again.")

    async with httpx.AsyncClient(timeout=15) as http:
        token_resp = await http.post(
            TOKEN_URL, headers={"Accept": "application/json"},
            data={"client_id": client_id, "client_secret": client_secret, "code": code,
                  "redirect_uri": _callback_url(settings)},
        )
        token = token_resp.json().get("access_token") if token_resp.is_success else None
        if not token:
            raise HTTPException(400, "GitHub didn't accept the sign-in. Please try again.")
        user_resp = await http.get(USER_URL, headers={"Authorization": f"Bearer {token}",
                                                      "Accept": "application/vnd.github+json"})
        if not user_resp.is_success:
            raise HTTPException(502, "Couldn't read your GitHub profile. Please try again.")
        profile = user_resp.json()
        user_id = _store_user(db, profile, token)
        try:  # nice to have: never let it block signing in
            await refresh_skills(db, http, user_id, token, profile["login"])
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            log.warning("skill inference failed at sign-in", extra={"error": repr(exc)})

    response = _finish(next_path)
    response.set_cookie(COOKIE_NAME, create_session(db, user_id),
                        max_age=SESSION_DAYS * 24 * 3600, **_cookie_kwargs())
    return response


def _store_user(db: Session, profile: dict, token: str) -> int:
    values = {"github_id": profile["id"], "login": profile["login"], "name": profile.get("name"),
              "avatar_url": profile.get("avatar_url"),
              "access_token_encrypted": encrypt_token(token), "last_login_at": datetime.now(UTC)}
    stmt = insert(User).values(**values)
    user_id = db.execute(
        stmt.on_conflict_do_update(
            index_elements=[User.github_id],
            set_={k: stmt.excluded[k] for k in values if k != "github_id"},
        ).returning(User.id)
    ).scalar_one()
    db.commit()
    return user_id


def _finish(path: str) -> RedirectResponse:
    response = RedirectResponse(path, status_code=302)
    response.delete_cookie(STATE_COOKIE, path="/")  # one-time use
    return response


@router.get("/me", response_model=Me, responses={401: {"description": "Not signed in"}})
def me(user: OptionalUser) -> Me:
    if user is None:
        raise HTTPException(401, "Not signed in.")
    return Me(login=user.login, name=user.name, avatar_url=user.avatar_url)


@router.post("/logout", status_code=204)
def logout(request: Request, db: Annotated[Session, Depends(get_db)]) -> Response:
    if token := request.cookies.get(COOKIE_NAME):
        end_session(db, token)
    response = Response(status_code=204)
    response.delete_cookie(COOKIE_NAME, path="/")
    return response
