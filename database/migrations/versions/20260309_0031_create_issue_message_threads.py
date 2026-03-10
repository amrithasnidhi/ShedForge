"""create issue message threads

Revision ID: 20260309_0031
Revises: 20260309_0030
Create Date: 2026-03-09 23:30:00.000000

"""

from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa


revision = "20260309_0031"
down_revision = "20260309_0030"
branch_labels = None
depends_on = None


def _table_exists(inspector: object, table_name: str) -> bool:
    return table_name in set(inspector.get_table_names())


def _index_exists(inspector: object, table_name: str, index_name: str) -> bool:
    return index_name in {item["name"] for item in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _table_exists(inspector, "timetable_issue_messages"):
        op.create_table(
            "timetable_issue_messages",
            sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
            sa.Column("issue_id", sa.String(length=36), nullable=False),
            sa.Column("author_id", sa.String(length=36), nullable=False),
            sa.Column("author_role", sa.String(length=20), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "timetable_issue_messages"):
        if not _index_exists(inspector, "timetable_issue_messages", "ix_timetable_issue_messages_issue_id"):
            op.create_index(
                "ix_timetable_issue_messages_issue_id",
                "timetable_issue_messages",
                ["issue_id"],
                unique=False,
            )
        if not _index_exists(inspector, "timetable_issue_messages", "ix_timetable_issue_messages_author_id"):
            op.create_index(
                "ix_timetable_issue_messages_author_id",
                "timetable_issue_messages",
                ["author_id"],
                unique=False,
            )

    # Backfill one initial message for legacy issues so every issue has a conversation trail.
    rows = bind.execute(
        sa.text(
            """
            SELECT ti.id AS issue_id,
                   ti.reporter_id AS author_id,
                   COALESCE(u.role, 'student') AS author_role,
                   ti.description AS message,
                   ti.created_at AS created_at
            FROM timetable_issues ti
            LEFT JOIN users u ON u.id = ti.reporter_id
            WHERE NOT EXISTS (
                SELECT 1
                FROM timetable_issue_messages tim
                WHERE tim.issue_id = ti.id
            )
            """
        )
    ).mappings()

    for row in rows:
        bind.execute(
            sa.text(
                """
                INSERT INTO timetable_issue_messages (
                    id,
                    issue_id,
                    author_id,
                    author_role,
                    message,
                    created_at
                ) VALUES (
                    :id,
                    :issue_id,
                    :author_id,
                    :author_role,
                    :message,
                    :created_at
                )
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "issue_id": row["issue_id"],
                "author_id": row["author_id"],
                "author_role": row["author_role"],
                "message": row["message"],
                "created_at": row["created_at"],
            },
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _table_exists(inspector, "timetable_issue_messages"):
        if _index_exists(inspector, "timetable_issue_messages", "ix_timetable_issue_messages_author_id"):
            op.drop_index("ix_timetable_issue_messages_author_id", table_name="timetable_issue_messages")
            inspector = sa.inspect(bind)
        if _index_exists(inspector, "timetable_issue_messages", "ix_timetable_issue_messages_issue_id"):
            op.drop_index("ix_timetable_issue_messages_issue_id", table_name="timetable_issue_messages")
            inspector = sa.inspect(bind)
        op.drop_table("timetable_issue_messages")
