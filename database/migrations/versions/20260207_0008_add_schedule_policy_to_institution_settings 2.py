"""add schedule policy to institution settings

Revision ID: 20260207_0008
Revises: 20260207_0007
Create Date: 2026-02-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260207_0008"
down_revision = "20260207_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "institution_settings",
        sa.Column("period_minutes", sa.Integer(), nullable=False, server_default="50"),
    )
    op.add_column(
        "institution_settings",
        sa.Column("lab_contiguous_slots", sa.Integer(), nullable=False, server_default="2"),
    )
    op.add_column(
        "institution_settings",
        sa.Column("break_windows", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )


def downgrade() -> None:
    op.drop_column("institution_settings", "break_windows")
    op.drop_column("institution_settings", "lab_contiguous_slots")
    op.drop_column("institution_settings", "period_minutes")
