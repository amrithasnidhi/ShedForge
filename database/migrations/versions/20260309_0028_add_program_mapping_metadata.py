"""add program mapping metadata

Revision ID: 20260309_0028
Revises: 20260309_0027
Create Date: 2026-03-09 23:05:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260309_0028"
down_revision = "20260309_0027"
branch_labels = None
depends_on = None


def _column_exists(inspector: object, table_name: str, column_name: str) -> bool:
    return column_name in {item["name"] for item in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _column_exists(inspector, "programs", "default_section_capacity"):
        op.add_column(
            "programs",
            sa.Column("default_section_capacity", sa.Integer(), nullable=False, server_default="60"),
        )
    if not _column_exists(inspector, "programs", "home_building"):
        op.add_column("programs", sa.Column("home_building", sa.String(length=200), nullable=True))
    if not _column_exists(inspector, "programs", "course_mapping_enabled"):
        op.add_column(
            "programs",
            sa.Column("course_mapping_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        )
    if not _column_exists(inspector, "programs", "faculty_mapping_enabled"):
        op.add_column(
            "programs",
            sa.Column("faculty_mapping_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        )
    if not _column_exists(inspector, "programs", "student_mapping_enabled"):
        op.add_column(
            "programs",
            sa.Column("student_mapping_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        )
    if not _column_exists(inspector, "programs", "room_mapping_enabled"):
        op.add_column(
            "programs",
            sa.Column("room_mapping_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        )

    op.execute(
        sa.text(
            """
            UPDATE programs
            SET default_section_capacity = COALESCE(default_section_capacity, 60),
                course_mapping_enabled = COALESCE(course_mapping_enabled, TRUE),
                faculty_mapping_enabled = COALESCE(faculty_mapping_enabled, TRUE),
                student_mapping_enabled = COALESCE(student_mapping_enabled, TRUE),
                room_mapping_enabled = COALESCE(room_mapping_enabled, TRUE)
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _column_exists(inspector, "programs", "room_mapping_enabled"):
        op.drop_column("programs", "room_mapping_enabled")
    if _column_exists(inspector, "programs", "student_mapping_enabled"):
        op.drop_column("programs", "student_mapping_enabled")
    if _column_exists(inspector, "programs", "faculty_mapping_enabled"):
        op.drop_column("programs", "faculty_mapping_enabled")
    if _column_exists(inspector, "programs", "course_mapping_enabled"):
        op.drop_column("programs", "course_mapping_enabled")
    if _column_exists(inspector, "programs", "home_building"):
        op.drop_column("programs", "home_building")
    if _column_exists(inspector, "programs", "default_section_capacity"):
        op.drop_column("programs", "default_section_capacity")
