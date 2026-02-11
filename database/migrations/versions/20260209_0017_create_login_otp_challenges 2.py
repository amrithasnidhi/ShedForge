"""create login otp challenges table

Revision ID: 20260209_0017
Revises: 20260207_0016
Create Date: 2026-02-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "20260209_0017"
down_revision = "20260207_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "login_otp_challenges",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_login_otp_challenges_user_id", "login_otp_challenges", ["user_id"], unique=False)
    op.create_index("ix_login_otp_challenges_code_hash", "login_otp_challenges", ["code_hash"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_login_otp_challenges_code_hash", table_name="login_otp_challenges")
    op.drop_index("ix_login_otp_challenges_user_id", table_name="login_otp_challenges")
    op.drop_table("login_otp_challenges")
