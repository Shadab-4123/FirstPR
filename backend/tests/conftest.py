import json
import os
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"

# Point the app at the test database *before* anything imports app.db.session.
TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://firstpr@localhost:5433/firstpr_test"
)
os.environ["DATABASE_URL"] = TEST_DB_URL


@pytest.fixture
def fixture():
    def load(name: str):
        return json.loads((FIXTURES / name).read_text())

    return load


@pytest.fixture(scope="session")
def migrated_engine():
    """Run the real Alembic migrations once, so tests exercise the real schema."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, text

    engine = create_engine(TEST_DB_URL)
    with engine.begin() as conn:
        conn.execute(text("drop schema public cascade; create schema public"))
    cfg = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    cfg.attributes["database_url"] = TEST_DB_URL
    command.upgrade(cfg, "head")
    yield engine
    engine.dispose()


@pytest.fixture
def db_session_factory(migrated_engine):
    from sqlalchemy import text
    from sqlalchemy.orm import sessionmaker

    with migrated_engine.begin() as conn:
        conn.execute(text("truncate issues, repos, sync_runs restart identity cascade"))
    from app.api import routes

    routes._cache.clear()
    return sessionmaker(bind=migrated_engine, expire_on_commit=False)
