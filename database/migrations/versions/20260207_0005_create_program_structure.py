"""create program structure

Revision ID: 20260207_0005
Revises: 20260207_0004
Create Date: 2026-02-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260207_0005"
down_revision = "20260207_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "program_terms",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("program_id", sa.String(length=36), nullable=False),
        sa.Column("term_number", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("credits_required", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("program_id", "term_number", name="uq_program_terms_program_term"),
    )

    op.create_table(
        "program_sections",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("program_id", sa.String(length=36), nullable=False),
        sa.Column("term_number", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "program_id",
            "term_number",
            "name",
            name="uq_program_sections_program_term_name",
        ),
    )

    op.create_table(
        "program_courses",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("program_id", sa.String(length=36), nullable=False),
        sa.Column("term_number", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.String(length=36), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "program_id",
            "term_number",
            "course_id",
            name="uq_program_courses_program_term_course",
        ),
    )


def downgrade() -> None:
    op.drop_table("program_courses")
    op.drop_table("program_sections")
    op.drop_table("program_terms")
