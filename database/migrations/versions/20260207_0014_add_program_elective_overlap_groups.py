"""add elective overlap groups for program structure

Revision ID: 20260207_0014
Revises: 20260207_0013
Create Date: 2026-02-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260207_0014"
down_revision = "20260207_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conflict_policy = sa.Enum("no_overlap", name="elective_conflict_policy")

    op.create_table(
        "program_elective_groups",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("program_id", sa.String(length=36), nullable=False),
        sa.Column("term_number", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("conflict_policy", conflict_policy, nullable=False, server_default="no_overlap"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "program_id",
            "term_number",
            "name",
            name="uq_program_elective_groups_program_term_name",
        ),
    )

    op.create_table(
        "program_elective_group_members",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("program_course_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "group_id",
            "program_course_id",
            name="uq_program_elective_group_members_group_course",
        ),
    )


def downgrade() -> None:
    op.drop_table("program_elective_group_members")
    op.drop_table("program_elective_groups")
    sa.Enum(name="elective_conflict_policy").drop(op.get_bind(), checkfirst=True)
