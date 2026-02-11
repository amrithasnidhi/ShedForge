"""add governance and preference features

Revision ID: 20260207_0012
Revises: 20260207_0011
Create Date: 2026-02-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260207_0012"
down_revision = "20260207_0011"
branch_labels = None
depends_on = None


notification_type = sa.Enum("timetable", "issue", "system", "workflow", name="notification_type")
issue_status = sa.Enum("open", "in_progress", "resolved", name="issue_status")
issue_category = sa.Enum("conflict", "capacity", "availability", "data", "other", name="issue_category")


def upgrade() -> None:
    op.add_column(
        "faculty",
        sa.Column("avoid_back_to_back", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "faculty",
        sa.Column("preferred_min_break_minutes", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "faculty",
        sa.Column("preference_notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "activity_logs",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("entity_type", sa.String(length=100), nullable=True),
        sa.Column("entity_id", sa.String(length=100), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "notifications",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("notification_type", notification_type, nullable=False, server_default="system"),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"], unique=False)

    op.create_table(
        "timetable_versions",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("summary", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_by_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_timetable_versions_label", "timetable_versions", ["label"], unique=False)

    op.create_table(
        "timetable_issues",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("reporter_id", sa.String(length=36), nullable=False),
        sa.Column("category", issue_category, nullable=False, server_default="other"),
        sa.Column("affected_slot_id", sa.String(length=100), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", issue_status, nullable=False, server_default="open"),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column("assigned_to_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("timetable_issues")
    op.drop_index("ix_timetable_versions_label", table_name="timetable_versions")
    op.drop_table("timetable_versions")
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_table("notifications")
    op.drop_table("activity_logs")

    op.drop_column("faculty", "preference_notes")
    op.drop_column("faculty", "preferred_min_break_minutes")
    op.drop_column("faculty", "avoid_back_to_back")

    issue_category.drop(op.get_bind(), checkfirst=True)
    issue_status.drop(op.get_bind(), checkfirst=True)
    notification_type.drop(op.get_bind(), checkfirst=True)
