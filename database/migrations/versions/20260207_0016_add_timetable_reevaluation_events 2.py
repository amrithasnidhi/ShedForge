"""add timetable reevaluation events for curriculum changes

Revision ID: 20260207_0016
Revises: 20260207_0015
Create Date: 2026-02-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260207_0016"
down_revision = "20260207_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    status_enum = sa.Enum("pending", "resolved", "dismissed", name="reevaluation_status")

    op.create_table(
        "timetable_reevaluation_events",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("program_id", sa.String(length=36), nullable=False),
        sa.Column("term_number", sa.Integer(), nullable=True),
        sa.Column("change_type", sa.String(length=80), nullable=False),
        sa.Column("entity_type", sa.String(length=80), nullable=False),
        sa.Column("entity_id", sa.String(length=36), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("status", status_enum, nullable=False, server_default="pending"),
        sa.Column("triggered_by_id", sa.String(length=36), nullable=True),
        sa.Column("triggered_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("resolved_by_id", sa.String(length=36), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_note", sa.String(length=500), nullable=True),
    )
    op.create_index(
        "ix_timetable_reevaluation_events_program_term_status",
        "timetable_reevaluation_events",
        ["program_id", "term_number", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_timetable_reevaluation_events_program_term_status", table_name="timetable_reevaluation_events")
    op.drop_table("timetable_reevaluation_events")
    sa.Enum(name="reevaluation_status").drop(op.get_bind(), checkfirst=True)
