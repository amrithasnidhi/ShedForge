"""create timetable conflict decisions

Revision ID: 20260210_0020
Revises: 20260210_0019
Create Date: 2026-02-10 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260210_0020"
down_revision = "20260210_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conflict_decision_enum = postgresql.ENUM("yes", "no", name="conflict_decision", create_type=False)
    conflict_decision_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "timetable_conflict_decisions",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("conflict_id", sa.String(length=255), nullable=False),
        sa.Column("decision", conflict_decision_enum, nullable=False),
        sa.Column("resolved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("conflict_snapshot", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("decided_by_id", sa.String(length=36), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_timetable_conflict_decisions_conflict_id",
        "timetable_conflict_decisions",
        ["conflict_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_timetable_conflict_decisions_conflict_id", table_name="timetable_conflict_decisions")
    op.drop_table("timetable_conflict_decisions")
    conflict_decision_enum = postgresql.ENUM("yes", "no", name="conflict_decision", create_type=False)
    conflict_decision_enum.drop(op.get_bind(), checkfirst=True)
