"""create feedback system

Revision ID: 20260210_0021
Revises: 20260210_0020
Create Date: 2026-02-10 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260210_0021"
down_revision = "20260210_0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'feedback'")

    feedback_category = postgresql.ENUM(
        "timetable",
        "technical",
        "usability",
        "account",
        "suggestion",
        "grievance",
        "other",
        name="feedback_category",
        create_type=False,
    )
    feedback_priority = postgresql.ENUM(
        "low",
        "medium",
        "high",
        "urgent",
        name="feedback_priority",
        create_type=False,
    )
    feedback_status = postgresql.ENUM(
        "open",
        "under_review",
        "awaiting_user",
        "resolved",
        "closed",
        name="feedback_status",
        create_type=False,
    )
    feedback_category.create(op.get_bind(), checkfirst=True)
    feedback_priority.create(op.get_bind(), checkfirst=True)
    feedback_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "feedback_items",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("reporter_id", sa.String(length=36), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("category", feedback_category, nullable=False, server_default="other"),
        sa.Column("priority", feedback_priority, nullable=False, server_default="medium"),
        sa.Column("status", feedback_status, nullable=False, server_default="open"),
        sa.Column("assigned_admin_id", sa.String(length=36), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("latest_message_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_feedback_items_reporter_id", "feedback_items", ["reporter_id"], unique=False)
    op.create_index("ix_feedback_items_status", "feedback_items", ["status"], unique=False)

    op.create_table(
        "feedback_messages",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("feedback_id", sa.String(length=36), nullable=False),
        sa.Column("author_id", sa.String(length=36), nullable=False),
        sa.Column("author_role", sa.String(length=20), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_feedback_messages_feedback_id", "feedback_messages", ["feedback_id"], unique=False)
    op.create_index("ix_feedback_messages_author_id", "feedback_messages", ["author_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_feedback_messages_author_id", table_name="feedback_messages")
    op.drop_index("ix_feedback_messages_feedback_id", table_name="feedback_messages")
    op.drop_table("feedback_messages")
    op.drop_index("ix_feedback_items_status", table_name="feedback_items")
    op.drop_index("ix_feedback_items_reporter_id", table_name="feedback_items")
    op.drop_table("feedback_items")

    feedback_status = postgresql.ENUM(name="feedback_status", create_type=False)
    feedback_priority = postgresql.ENUM(name="feedback_priority", create_type=False)
    feedback_category = postgresql.ENUM(name="feedback_category", create_type=False)
    feedback_status.drop(op.get_bind(), checkfirst=True)
    feedback_priority.drop(op.get_bind(), checkfirst=True)
    feedback_category.drop(op.get_bind(), checkfirst=True)

    # `notification_type.feedback` is intentionally left in place.
