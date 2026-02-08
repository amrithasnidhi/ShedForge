"""add solver strategy fields to generation settings

Revision ID: 20260210_0023
Revises: 20260210_0022
Create Date: 2026-02-10 00:23:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "20260210_0023"
down_revision = "20260210_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "timetable_generation_settings",
        sa.Column("solver_strategy", sa.String(length=40), nullable=False, server_default="auto"),
    )
    op.add_column(
        "timetable_generation_settings",
        sa.Column("annealing_iterations", sa.Integer(), nullable=False, server_default="900"),
    )
    op.add_column(
        "timetable_generation_settings",
        sa.Column("annealing_initial_temperature", sa.Float(), nullable=False, server_default="6.0"),
    )
    op.add_column(
        "timetable_generation_settings",
        sa.Column("annealing_cooling_rate", sa.Float(), nullable=False, server_default="0.995"),
    )


def downgrade() -> None:
    op.drop_column("timetable_generation_settings", "annealing_cooling_rate")
    op.drop_column("timetable_generation_settings", "annealing_initial_temperature")
    op.drop_column("timetable_generation_settings", "annealing_iterations")
    op.drop_column("timetable_generation_settings", "solver_strategy")

