from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_error_handlers
from app.api.routes import router
from app.core.config import get_settings
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="FirstPR API",
        version="0.1.0",
        description="Search open-source issues that are open, unclaimed and beginner-sized.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,  # only our frontend, never "*"
        allow_methods=["GET", "PUT"],
        allow_headers=["Content-Type"],
        allow_credentials=True,
    )
    register_error_handlers(app)
    app.include_router(router)
    return app


app = create_app()
