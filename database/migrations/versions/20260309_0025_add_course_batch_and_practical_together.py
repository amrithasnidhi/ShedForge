"""add course batch segregation and practical contiguous slots

Revision ID: 20260309_0025
Revises: 20260210_0024
Create Date: 2026-03-09 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "20260309_0025"
down_revision = "20260210_0024"
branch_labels = None
depends_on = None


def _column_exists(inspector: object, table_name: str, column_name: str) -> bool:
    return column_name in {item["name"] for item in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _column_exists(inspector, "courses", "batch_segregation"):
        op.add_column(
            "courses",
            sa.Column("batch_segregation", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        )

    if not _column_exists(inspector, "courses", "practical_contiguous_slots"):
        op.add_column(
            "courses",
            sa.Column("practical_contiguous_slots", sa.Integer(), nullable=False, server_default="2"),
        )

    courses_columns = {item["name"]: item for item in inspector.get_columns("courses")}
    credits_column = courses_columns.get("credits")
    if credits_column is not None:
        credits_type_text = str(credits_column["type"]).upper()
        if "FLOAT" not in credits_type_text and "DOUBLE" not in credits_type_text and "REAL" not in credits_type_text:
            with op.batch_alter_table("courses") as batch_op:
                batch_op.alter_column(
                    "credits",
                    existing_type=sa.Integer(),
                    type_=sa.Float(),
                    existing_nullable=False,
                )

    op.execute(
        """
        UPDATE courses
        SET practical_contiguous_slots = 1
        WHERE COALESCE(lab_hours, 0) <= 0
        """
    )
    op.execute(
        """
        UPDATE courses
        SET practical_contiguous_slots = CASE
            WHEN COALESCE(lab_hours, 0) <= 0 THEN 1
            WHEN practical_contiguous_slots > COALESCE(lab_hours, 0) THEN COALESCE(lab_hours, 0)
            WHEN practical_contiguous_slots < 1 THEN 1
            ELSE practical_contiguous_slots
        END
        """
    )

    inspector = sa.inspect(bind)
    if _column_exists(inspector, "courses", "batch_segregation"):
        op.alter_column("courses", "batch_segregation", server_default=None)
    if _column_exists(inspector, "courses", "practical_contiguous_slots"):
        op.alter_column("courses", "practical_contiguous_slots", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    courses_columns = {item["name"]: item for item in inspector.get_columns("courses")}
    credits_column = courses_columns.get("credits")
    if credits_column is not None:
        credits_type_text = str(credits_column["type"]).upper()
        if "INTEGER" not in credits_type_text and "BIGINT" not in credits_type_text:
            with op.batch_alter_table("courses") as batch_op:
                batch_op.alter_column(
                    "credits",
                    existing_type=sa.Float(),
                    type_=sa.Integer(),
                    existing_nullable=False,
                )

    inspector = sa.inspect(bind)
    if _column_exists(inspector, "courses", "practical_contiguous_slots"):
        op.drop_column("courses", "practical_contiguous_slots")
    if _column_exists(inspector, "courses", "batch_segregation"):
        op.drop_column("courses", "batch_segregation")
