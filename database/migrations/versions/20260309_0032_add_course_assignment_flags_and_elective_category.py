"""add course assignment flags and elective category

Revision ID: 20260309_0032
Revises: 20260309_0031
Create Date: 2026-03-09 23:10:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "20260309_0032"
down_revision = "20260309_0031"
branch_labels = None
depends_on = None


def _column_exists(inspector: object, table_name: str, column_name: str) -> bool:
    return column_name in {item["name"] for item in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _column_exists(inspector, "courses", "assign_faculty"):
        op.add_column(
            "courses",
            sa.Column("assign_faculty", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        )
    if not _column_exists(inspector, "courses", "assign_classroom"):
        op.add_column(
            "courses",
            sa.Column("assign_classroom", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        )
    if not _column_exists(inspector, "courses", "default_room_id"):
        op.add_column("courses", sa.Column("default_room_id", sa.String(length=36), nullable=True))
    if not _column_exists(inspector, "courses", "elective_category"):
        op.add_column("courses", sa.Column("elective_category", sa.String(length=120), nullable=True))

    op.execute(
        """
        UPDATE courses
        SET assign_faculty = FALSE,
            assign_classroom = FALSE
        WHERE CAST(type AS TEXT) = 'elective'
        """
    )
    op.execute(
        """
        UPDATE courses
        SET faculty_id = NULL
        WHERE assign_faculty = FALSE
        """
    )
    op.execute(
        """
        UPDATE courses
        SET default_room_id = NULL
        WHERE assign_classroom = FALSE
        """
    )

    inspector = sa.inspect(bind)
    if _column_exists(inspector, "courses", "assign_faculty"):
        op.alter_column("courses", "assign_faculty", server_default=None)
    if _column_exists(inspector, "courses", "assign_classroom"):
        op.alter_column("courses", "assign_classroom", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _column_exists(inspector, "courses", "elective_category"):
        op.drop_column("courses", "elective_category")
    if _column_exists(inspector, "courses", "default_room_id"):
        op.drop_column("courses", "default_room_id")
    if _column_exists(inspector, "courses", "assign_classroom"):
        op.drop_column("courses", "assign_classroom")
    if _column_exists(inspector, "courses", "assign_faculty"):
        op.drop_column("courses", "assign_faculty")
