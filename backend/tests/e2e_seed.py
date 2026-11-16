"""Loads the test fixtures into a throwaway database for the Playwright flow.

Usage (after `alembic upgrade head` on the same DATABASE_URL):
    DATABASE_URL=postgresql+psycopg://.../firstpr_e2e python tests/e2e_seed.py

Wipes the database first, so it refuses any database whose name doesn't end in
"_e2e": pointing it at Supabase by mistake must be impossible.
"""

import copy
import json
import os
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import make_url

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.db.session import SessionLocal  # noqa: E402
from app.sync.mapping import map_issue, map_repo  # noqa: E402
from app.sync.upsert import (  # noqa: E402
    reclassify_issues,
    rescore_repo_health,
    upsert_issue,
    upsert_repo,
)

FIXTURES = Path(__file__).parent / "fixtures"


def main() -> None:
    database = make_url(os.environ["DATABASE_URL"]).database or ""
    if not database.endswith("_e2e"):
        sys.exit(f"Refusing to wipe {database!r}: the e2e database name must end in _e2e")
    repo = json.loads((FIXTURES / "repo.json").read_text())
    items = json.loads((FIXTURES / "search_issues_python.json").read_text())["items"]
    with SessionLocal() as db:
        db.execute(text("truncate issues, repos, sync_runs, users, user_sessions, saved_issues "
                        "restart identity cascade"))
        repo_id = upsert_repo(db, map_repo(repo), etag=None)
        for item in items:
            upsert_issue(db, map_issue(copy.deepcopy(item), repo_id))
        rescore_repo_health(db)
        reclassify_issues(db)
        db.commit()
    print(f"Seeded {len(items)} issues into {database}")


if __name__ == "__main__":
    main()
