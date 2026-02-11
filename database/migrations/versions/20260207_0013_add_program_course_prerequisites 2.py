"""add prerequisite mapping to program courses

Revision ID: 20260207_0013
Revises: 20260207_0012
Create Date: 2026-02-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260207_0013"
down_revision = "20260207_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "program_courses",
        sa.Column("prerequisite_course_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )


def downgrade() -> None:
    op.drop_column("program_courses", "prerequisite_course_ids")
