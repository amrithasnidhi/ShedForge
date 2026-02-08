"""add faculty preferred subjects and user section mapping

Revision ID: 20260209_0018
Revises: 20260209_0017
Create Date: 2026-02-09 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "20260209_0018"
down_revision = "20260209_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "faculty",
        sa.Column("preferred_subject_codes", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.add_column(
        "users",
        sa.Column("section_name", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "section_name")
    op.drop_column("faculty", "preferred_subject_codes")
