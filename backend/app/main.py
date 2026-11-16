import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_error_handlers
from app.api.routes import router
from app.api.saved import router as saved_router
from app.auth.routes import router as auth_router
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging

log = logging.getLogger("firstpr.app")
SIGNIN_SETTINGS = ("github_client_id", "github_client_secret", "token_encryption_key", "app_url")


def _log_signin_config(settings: Settings) -> None:
    """Say at startup whether GitHub sign-in can work, naming (never showing) what's missing."""
    missing = [name.upper() for name in SIGNIN_SETTINGS if not getattr(settings, name)]
    if missing:
        log.warning("GitHub sign-in disabled: missing settings", extra={"missing": missing})
    else:
        log.info("GitHub sign-in enabled", extra={"app_url": settings.app_url})


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    _log_signin_config(settings)

    app = FastAPI(
        title="FirstPR API",
        version="0.1.0",
        description="Search open-source issues that are open, unclaimed and beginner-sized.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,  # only our frontend, never "*"
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
        allow_credentials=True,
    )
    register_error_handlers(app)
    app.include_router(router)
    app.include_router(auth_router)
    app.include_router(saved_router)
    return app


app = create_app()
