"""create leave substitute assignments

Revision ID: 20260210_0019
Revises: 20260209_0018
Create Date: 2026-02-10 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "20260210_0019"
down_revision = "20260209_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "leave_substitute_assignments",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("leave_request_id", sa.String(length=36), nullable=False),
        sa.Column("substitute_faculty_id", sa.String(length=36), nullable=False),
        sa.Column("assigned_by_id", sa.String(length=36), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_leave_substitute_assignments_leave_request_id",
        "leave_substitute_assignments",
        ["leave_request_id"],
        unique=True,
    )
    op.create_index(
        "ix_leave_substitute_assignments_substitute_faculty_id",
        "leave_substitute_assignments",
        ["substitute_faculty_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_leave_substitute_assignments_substitute_faculty_id",
        table_name="leave_substitute_assignments",
    )
    op.drop_index(
        "ix_leave_substitute_assignments_leave_request_id",
        table_name="leave_substitute_assignments",
    )
    op.drop_table("leave_substitute_assignments")
