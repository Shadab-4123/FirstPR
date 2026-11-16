"""Drop or recreate the six search indexes on the bench database, for a before/after load test.

A plain `alembic downgrade` can't do this any more: later migrations added columns
the API reads (level, kind, ...), and downgrading would remove them too. This runs
only the index migration's own downgrade()/upgrade(), so "before" and "after" use
the exact index definitions that production has, on an otherwise identical schema.

Usage (from backend/, with scripts/dev-db.sh running):
    python ../perf/load/indexes.py off
    python ../perf/load/indexes.py on

Refuses any database whose name doesn't end in "_bench".
"""

import importlib.util
import os
import sys
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import make_url

BENCH_URL = os.environ.get(
    "BENCH_DATABASE_URL", "postgresql+psycopg://firstpr@localhost:5433/firstpr_bench"
)
MIGRATION = next(
    (Path(__file__).resolve().parents[2] / "backend/app/db/migrations/versions")
    .glob("*_a36920872992_add_search_indexes.py")
)

INDEX_NAMES = {
    "ix_issues_repo_id", "ix_issues_open_updated", "ix_issues_open_created",
    "ix_repos_health", "ix_repos_language_lower", "ix_repos_stars",
}


def search_indexes(engine) -> list[str]:
    insp = inspect(engine)
    names = [ix["name"] for t in ("issues", "repos") for ix in insp.get_indexes(t)]
    return sorted(n for n in names if n in INDEX_NAMES)


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in ("on", "off"):
        sys.exit(__doc__)
    if not (make_url(BENCH_URL).database or "").endswith("_bench"):
        sys.exit(f"refusing: {BENCH_URL} is not a *_bench database")

    spec = importlib.util.spec_from_file_location("search_indexes", MIGRATION)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    engine = create_engine(BENCH_URL)
    present = search_indexes(engine)
    want_on = sys.argv[1] == "on"
    if bool(present) == want_on:
        print(f"already {sys.argv[1]}: {present or 'none'}")
        return
    with engine.begin() as conn, Operations.context(MigrationContext.configure(conn)):
        (migration.upgrade if want_on else migration.downgrade)()
    with engine.begin() as conn:
        conn.exec_driver_sql("ANALYZE issues; ANALYZE repos;")
    print(f"indexes {sys.argv[1]}: {search_indexes(engine) or 'none'}")


if __name__ == "__main__":
    main()
