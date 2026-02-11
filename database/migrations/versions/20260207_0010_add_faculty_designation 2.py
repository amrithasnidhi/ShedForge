"""add faculty designation

Revision ID: 20260207_0010
Revises: 20260207_0009
Create Date: 2026-02-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260207_0010"
down_revision = "20260207_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "faculty",
        sa.Column("designation", sa.String(length=200), nullable=False, server_default="Faculty"),
    )


def downgrade() -> None:
    op.drop_column("faculty", "designation")
