"""add generation input tables and fields

Revision ID: 20260207_0009
Revises: 20260207_0008
Create Date: 2026-02-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260207_0009"
down_revision = "20260207_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "faculty",
        sa.Column("availability_windows", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.add_column(
        "rooms",
        sa.Column("availability_windows", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.add_column(
        "program_courses",
        sa.Column("lab_batch_count", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "program_courses",
        sa.Column("allow_parallel_batches", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    op.create_table(
        "timetable_generation_settings",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("population_size", sa.Integer(), nullable=False, server_default="120"),
        sa.Column("generations", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("mutation_rate", sa.Float(), nullable=False, server_default="0.12"),
        sa.Column("crossover_rate", sa.Float(), nullable=False, server_default="0.8"),
        sa.Column("elite_count", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("tournament_size", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("stagnation_limit", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("random_seed", sa.Integer(), nullable=True),
        sa.Column("objective_weights", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "timetable_slot_locks",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("program_id", sa.String(length=36), nullable=False),
        sa.Column("term_number", sa.Integer(), nullable=False),
        sa.Column("day", sa.String(length=20), nullable=False),
        sa.Column("start_time", sa.String(length=5), nullable=False),
        sa.Column("end_time", sa.String(length=5), nullable=False),
        sa.Column("section_name", sa.String(length=50), nullable=False),
        sa.Column("course_id", sa.String(length=36), nullable=False),
        sa.Column("batch", sa.String(length=50), nullable=True),
        sa.Column("room_id", sa.String(length=36), nullable=True),
        sa.Column("faculty_id", sa.String(length=36), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "program_id",
            "term_number",
            "day",
            "start_time",
            "section_name",
            "course_id",
            "batch",
            name="uq_timetable_slot_locks_identity",
        ),
    )
    op.create_index("ix_timetable_slot_locks_program_id", "timetable_slot_locks", ["program_id"], unique=False)
    op.create_index("ix_timetable_slot_locks_term_number", "timetable_slot_locks", ["term_number"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_timetable_slot_locks_term_number", table_name="timetable_slot_locks")
    op.drop_index("ix_timetable_slot_locks_program_id", table_name="timetable_slot_locks")
    op.drop_table("timetable_slot_locks")
    op.drop_table("timetable_generation_settings")

    op.drop_column("program_courses", "allow_parallel_batches")
    op.drop_column("program_courses", "lab_batch_count")
    op.drop_column("rooms", "availability_windows")
    op.drop_column("faculty", "availability_windows")
