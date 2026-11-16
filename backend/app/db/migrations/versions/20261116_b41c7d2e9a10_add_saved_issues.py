"""add saved issues

Saved issues and their status (saved -> working -> pr_opened -> merged).
RLS on, no policies, like every public table.

Revision ID: b41c7d2e9a10
Revises: 9e7cf35af015
Create Date: 2026-11-16 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b41c7d2e9a10'
down_revision: Union[str, Sequence[str], None] = '9e7cf35af015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('saved_issues',
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('issue_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=12), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status IN ('saved', 'working', 'pr_opened', 'merged')",
                       name='ck_saved_issues_status'),
    sa.ForeignKeyConstraint(['issue_id'], ['issues.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'issue_id')
    )
    op.create_index(op.f('ix_saved_issues_issue_id'), 'saved_issues', ['issue_id'], unique=False)
    op.execute("ALTER TABLE saved_issues ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index(op.f('ix_saved_issues_issue_id'), table_name='saved_issues')
    op.drop_table('saved_issues')
