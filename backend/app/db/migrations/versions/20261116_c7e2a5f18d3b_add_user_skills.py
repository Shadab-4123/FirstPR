"""add user skills

Languages and level guessed from the user's public GitHub activity.

Revision ID: c7e2a5f18d3b
Revises: b41c7d2e9a10
Create Date: 2026-11-16 16:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'c7e2a5f18d3b'
down_revision: Union[str, Sequence[str], None] = 'b41c7d2e9a10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('skills', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('users', sa.Column('skills_updated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'skills_updated_at')
    op.drop_column('users', 'skills')
