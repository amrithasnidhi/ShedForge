"""create academic entities

Revision ID: 20260207_0004
Revises: 20260207_0003
Create Date: 2026-02-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260207_0004"
down_revision = "20260207_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    program_degree = sa.Enum("BS", "MS", "PhD", name="program_degree")
    course_type = sa.Enum("theory", "lab", "elective", name="course_type")
    room_type = sa.Enum("lecture", "lab", "seminar", name="room_type")

    op.create_table(
        "programs",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("department", sa.String(length=200), nullable=False),
        sa.Column("degree", program_degree, nullable=False),
        sa.Column("duration_years", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("sections", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("total_students", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_programs_code", "programs", ["code"], unique=True)

    op.create_table(
        "courses",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("type", course_type, nullable=False),
        sa.Column("credits", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("duration_hours", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("sections", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("hours_per_week", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("faculty_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_courses_code", "courses", ["code"], unique=True)

    op.create_table(
        "rooms",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("building", sa.String(length=200), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("type", room_type, nullable=False),
        sa.Column("has_lab_equipment", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("has_projector", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_rooms_name", "rooms", ["name"], unique=True)

    op.create_table(
        "faculty",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("department", sa.String(length=200), nullable=False),
        sa.Column("workload_hours", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_hours", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("availability", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_faculty_email", "faculty", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_faculty_email", table_name="faculty")
    op.drop_table("faculty")
    op.drop_index("ix_rooms_name", table_name="rooms")
    op.drop_table("rooms")
    op.drop_index("ix_courses_code", table_name="courses")
    op.drop_table("courses")
    op.drop_index("ix_programs_code", table_name="programs")
    op.drop_table("programs")
    sa.Enum(name="room_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="course_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="program_degree").drop(op.get_bind(), checkfirst=True)
