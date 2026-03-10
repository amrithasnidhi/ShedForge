"""create program constraints

Revision ID: 20260309_0029
Revises: 20260309_0028
Create Date: 2026-03-09 23:45:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260309_0029"
down_revision = "20260309_0028"
branch_labels = None
depends_on = None


def _table_exists(inspector: object, table_name: str) -> bool:
    return table_name in set(inspector.get_table_names())


def _index_exists(inspector: object, table_name: str, index_name: str) -> bool:
    return index_name in {item["name"] for item in inspector.get_indexes(table_name)}


def _constraint_exists(inspector: object, table_name: str, constraint_name: str) -> bool:
    return constraint_name in {
        item["name"]
        for item in inspector.get_unique_constraints(table_name)
        if item.get("name")
    }


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _table_exists(inspector, "program_constraints"):
        op.create_table(
            "program_constraints",
            sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
            sa.Column("program_id", sa.String(length=36), nullable=False),
            sa.Column("daily_time_slots", sa.JSON(), nullable=False),
            sa.Column("faculty_min_hours_per_week", sa.Integer(), nullable=False, server_default="14"),
            sa.Column("faculty_max_hours_per_week", sa.Integer(), nullable=False, server_default="20"),
            sa.Column("temporal_window_semesters", sa.Integer(), nullable=False, server_default="3"),
            sa.Column("auto_assign_research_slots", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("enforce_student_credit_load", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("enforce_ltp_split", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("enforce_lab_contiguous_blocks", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("program_id", name="uq_program_constraints_program"),
        )

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "program_constraints") and not _index_exists(
        inspector, "program_constraints", "ix_program_constraints_program_id"
    ):
        op.create_index(
            "ix_program_constraints_program_id",
            "program_constraints",
            ["program_id"],
            unique=False,
        )

    if _table_exists(inspector, "program_constraints"):
        bind.execute(
            sa.text(
                """
                UPDATE program_constraints
                SET faculty_min_hours_per_week = COALESCE(faculty_min_hours_per_week, 14),
                    faculty_max_hours_per_week = COALESCE(faculty_max_hours_per_week, 20),
                    temporal_window_semesters = COALESCE(temporal_window_semesters, 3),
                    auto_assign_research_slots = COALESCE(auto_assign_research_slots, TRUE),
                    enforce_student_credit_load = COALESCE(enforce_student_credit_load, TRUE),
                    enforce_ltp_split = COALESCE(enforce_ltp_split, TRUE),
                    enforce_lab_contiguous_blocks = COALESCE(enforce_lab_contiguous_blocks, TRUE)
                """
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _table_exists(inspector, "program_constraints"):
        if _index_exists(inspector, "program_constraints", "ix_program_constraints_program_id"):
            op.drop_index("ix_program_constraints_program_id", table_name="program_constraints")

        inspector = sa.inspect(bind)
        if _constraint_exists(inspector, "program_constraints", "uq_program_constraints_program"):
            op.drop_constraint("uq_program_constraints_program", "program_constraints", type_="unique")

        op.drop_table("program_constraints")
