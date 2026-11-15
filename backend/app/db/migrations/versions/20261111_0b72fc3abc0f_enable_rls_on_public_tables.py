"""enable rls on public tables

Supabase exposes every table in the `public` schema through its auto-generated
Data API, reachable with the project's publishable key. Turning on Row Level
Security with *no policies* makes that API return nothing and reject writes.

Our backend is unaffected: it connects as the table owner (`postgres` on
Supabase, `firstpr` locally), and owners bypass RLS unless it is FORCEd.
On plain local Postgres this is harmless for the same reason.

Revision ID: 0b72fc3abc0f
Revises: 70e36a1197d2
Create Date: 2026-11-11 23:36:41.372523

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0b72fc3abc0f'
down_revision: Union[str, Sequence[str], None] = '70e36a1197d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("repos", "issues", "sync_runs", "alembic_version")


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
