"""create official timetable

Revision ID: 20260207_0002
Revises: 20260207_0001
Create Date: 2026-02-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260207_0002"
down_revision = "20260207_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "official_timetable",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("updated_by_id", sa.String(length=36), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("official_timetable")
