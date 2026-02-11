"""add academic cycle settings, semester preferences, and course credit split

Revision ID: 20260210_0022
Revises: 20260210_0021
Create Date: 2026-02-10 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "20260210_0022"
down_revision = "20260210_0021"
branch_labels = None
depends_on = None


def _column_exists(inspector, table_name: str, column_name: str) -> bool:
    return column_name in {item["name"] for item in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _column_exists(inspector, "faculty", "semester_preferences"):
        op.add_column(
            "faculty",
            sa.Column("semester_preferences", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        )

    if not _column_exists(inspector, "institution_settings", "academic_year"):
        op.add_column(
            "institution_settings",
            sa.Column("academic_year", sa.String(length=20), nullable=False, server_default="2026-2027"),
        )
    if not _column_exists(inspector, "institution_settings", "semester_cycle"):
        op.add_column(
            "institution_settings",
            sa.Column("semester_cycle", sa.String(length=10), nullable=False, server_default="odd"),
        )

    if not _column_exists(inspector, "courses", "semester_number"):
        op.add_column(
            "courses",
            sa.Column("semester_number", sa.Integer(), nullable=False, server_default="1"),
        )
    if not _column_exists(inspector, "courses", "batch_year"):
        op.add_column(
            "courses",
            sa.Column("batch_year", sa.Integer(), nullable=False, server_default="1"),
        )
    if not _column_exists(inspector, "courses", "theory_hours"):
        op.add_column(
            "courses",
            sa.Column("theory_hours", sa.Integer(), nullable=False, server_default="0"),
        )
    if not _column_exists(inspector, "courses", "lab_hours"):
        op.add_column(
            "courses",
            sa.Column("lab_hours", sa.Integer(), nullable=False, server_default="0"),
        )
    if not _column_exists(inspector, "courses", "tutorial_hours"):
        op.add_column(
            "courses",
            sa.Column("tutorial_hours", sa.Integer(), nullable=False, server_default="0"),
        )

    op.execute(
        """
        UPDATE courses
        SET theory_hours = CASE
                WHEN CAST(type AS TEXT) = 'lab' THEN 0
                ELSE hours_per_week
            END,
            lab_hours = CASE
                WHEN CAST(type AS TEXT) = 'lab' THEN hours_per_week
                ELSE 0
            END,
            tutorial_hours = 0
        WHERE theory_hours + lab_hours + tutorial_hours = 0
        """
    )

    if _column_exists(inspector, "faculty", "semester_preferences"):
        op.alter_column("faculty", "semester_preferences", server_default=None)
    if _column_exists(inspector, "institution_settings", "academic_year"):
        op.alter_column("institution_settings", "academic_year", server_default=None)
    if _column_exists(inspector, "institution_settings", "semester_cycle"):
        op.alter_column("institution_settings", "semester_cycle", server_default=None)
    if _column_exists(inspector, "courses", "semester_number"):
        op.alter_column("courses", "semester_number", server_default=None)
    if _column_exists(inspector, "courses", "batch_year"):
        op.alter_column("courses", "batch_year", server_default=None)
    if _column_exists(inspector, "courses", "theory_hours"):
        op.alter_column("courses", "theory_hours", server_default=None)
    if _column_exists(inspector, "courses", "lab_hours"):
        op.alter_column("courses", "lab_hours", server_default=None)
    if _column_exists(inspector, "courses", "tutorial_hours"):
        op.alter_column("courses", "tutorial_hours", server_default=None)


def downgrade() -> None:
    op.drop_column("courses", "tutorial_hours")
    op.drop_column("courses", "lab_hours")
    op.drop_column("courses", "theory_hours")
    op.drop_column("courses", "batch_year")
    op.drop_column("courses", "semester_number")
    op.drop_column("institution_settings", "semester_cycle")
    op.drop_column("institution_settings", "academic_year")
    op.drop_column("faculty", "semester_preferences")
