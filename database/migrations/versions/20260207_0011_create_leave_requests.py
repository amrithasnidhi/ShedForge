"""create leave requests

Revision ID: 20260207_0011
Revises: 20260207_0010
Create Date: 2026-02-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260207_0011"
down_revision = "20260207_0010"
branch_labels = None
depends_on = None


leave_type = sa.Enum("sick", "casual", "academic", "personal", name="leave_type")
leave_status = sa.Enum("pending", "approved", "rejected", name="leave_status")


def upgrade() -> None:
    op.create_table(
        "leave_requests",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("faculty_id", sa.String(length=36), nullable=True),
        sa.Column("leave_date", sa.Date(), nullable=False),
        sa.Column("leave_type", leave_type, nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", leave_status, nullable=False, server_default="pending"),
        sa.Column("admin_comment", sa.Text(), nullable=True),
        sa.Column("reviewed_by_id", sa.String(length=36), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_leave_requests_user_id", "leave_requests", ["user_id"], unique=False)
    op.create_index("ix_leave_requests_status", "leave_requests", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_leave_requests_status", table_name="leave_requests")
    op.drop_index("ix_leave_requests_user_id", table_name="leave_requests")
    op.drop_table("leave_requests")
    leave_status.drop(op.get_bind(), checkfirst=True)
    leave_type.drop(op.get_bind(), checkfirst=True)
