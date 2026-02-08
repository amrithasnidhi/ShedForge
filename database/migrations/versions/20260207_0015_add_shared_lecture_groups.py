"""add shared lecture groups for section grouping

Revision ID: 20260207_0015
Revises: 20260207_0014
Create Date: 2026-02-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260207_0015"
down_revision = "20260207_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "program_shared_lecture_groups",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("program_id", sa.String(length=36), nullable=False),
        sa.Column("term_number", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("course_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "program_id",
            "term_number",
            "name",
            name="uq_program_shared_lecture_groups_program_term_name",
        ),
    )

    op.create_table(
        "program_shared_lecture_group_members",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("section_name", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "group_id",
            "section_name",
            name="uq_program_shared_lecture_group_members_group_section",
        ),
    )


def downgrade() -> None:
    op.drop_table("program_shared_lecture_group_members")
    op.drop_table("program_shared_lecture_groups")
