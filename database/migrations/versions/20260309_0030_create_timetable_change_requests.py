"""create timetable change requests

Revision ID: 20260309_0030
Revises: 20260309_0029
Create Date: 2026-03-09 21:15:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260309_0030"
down_revision = "20260309_0029"
branch_labels = None
depends_on = None


STATUS_ENUM = sa.Enum(
    "pending",
    "approved",
    "rejected",
    "applied",
    name="timetable_change_request_status",
)


def _table_exists(inspector: object, table_name: str) -> bool:
    return table_name in set(inspector.get_table_names())


def _index_exists(inspector: object, table_name: str, index_name: str) -> bool:
    return index_name in {item["name"] for item in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _table_exists(inspector, "timetable_change_requests"):
        op.create_table(
            "timetable_change_requests",
            sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
            sa.Column("program_id", sa.String(length=36), nullable=True),
            sa.Column("term_number", sa.Integer(), nullable=True),
            sa.Column("slot_id", sa.String(length=36), nullable=False),
            sa.Column("requested_by_id", sa.String(length=36), nullable=False),
            sa.Column("requested_by_role", sa.String(length=20), nullable=False),
            sa.Column("approver_user_id", sa.String(length=36), nullable=True),
            sa.Column("approver_role", sa.String(length=20), nullable=True),
            sa.Column("status", STATUS_ENUM, nullable=False, server_default="pending"),
            sa.Column("proposal", sa.JSON(), nullable=False),
            sa.Column("request_note", sa.Text(), nullable=True),
            sa.Column("decision_note", sa.Text(), nullable=True),
            sa.Column("resolution_note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        )

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "timetable_change_requests"):
        if not _index_exists(inspector, "timetable_change_requests", "ix_tcr_program_id"):
            op.create_index("ix_tcr_program_id", "timetable_change_requests", ["program_id"], unique=False)
        if not _index_exists(inspector, "timetable_change_requests", "ix_tcr_term_number"):
            op.create_index("ix_tcr_term_number", "timetable_change_requests", ["term_number"], unique=False)
        if not _index_exists(inspector, "timetable_change_requests", "ix_tcr_slot_id"):
            op.create_index("ix_tcr_slot_id", "timetable_change_requests", ["slot_id"], unique=False)
        if not _index_exists(inspector, "timetable_change_requests", "ix_tcr_requested_by_id"):
            op.create_index("ix_tcr_requested_by_id", "timetable_change_requests", ["requested_by_id"], unique=False)
        if not _index_exists(inspector, "timetable_change_requests", "ix_tcr_approver_user_id"):
            op.create_index("ix_tcr_approver_user_id", "timetable_change_requests", ["approver_user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _table_exists(inspector, "timetable_change_requests"):
        for index_name in (
            "ix_tcr_approver_user_id",
            "ix_tcr_requested_by_id",
            "ix_tcr_slot_id",
            "ix_tcr_term_number",
            "ix_tcr_program_id",
        ):
            if _index_exists(inspector, "timetable_change_requests", index_name):
                op.drop_index(index_name, table_name="timetable_change_requests")
                inspector = sa.inspect(bind)
        op.drop_table("timetable_change_requests")

    if bind.dialect.name == "postgresql":
        STATUS_ENUM.drop(bind, checkfirst=True)
