"""create semester constraints

Revision ID: 20260207_0007
Revises: 20260207_0006
Create Date: 2026-02-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260207_0007"
down_revision = "20260207_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "semester_constraints",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("term_number", sa.Integer(), nullable=False),
        sa.Column("earliest_start_time", sa.String(length=5), nullable=False),
        sa.Column("latest_end_time", sa.String(length=5), nullable=False),
        sa.Column("max_hours_per_day", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("max_hours_per_week", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("min_break_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_consecutive_hours", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("term_number", name="uq_semester_constraints_term"),
    )


def downgrade() -> None:
    op.drop_table("semester_constraints")
