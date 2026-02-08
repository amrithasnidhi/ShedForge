"""create leave substitute offers

Revision ID: 20260210_0024
Revises: 20260210_0023
Create Date: 2026-02-10 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260210_0024"
down_revision = "20260210_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    status_enum = postgresql.ENUM(
        "pending",
        "accepted",
        "rejected",
        "expired",
        "superseded",
        "cancelled",
        "rescheduled",
        name="leave_substitute_offer_status",
        create_type=False,
    )
    status_enum.create(bind, checkfirst=True)

    table_name = "leave_substitute_offers"
    if not inspector.has_table(table_name):
        op.create_table(
            table_name,
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("leave_request_id", sa.String(length=36), nullable=False),
            sa.Column("slot_id", sa.String(length=36), nullable=False),
            sa.Column("substitute_faculty_id", sa.String(length=36), nullable=False),
            sa.Column("offered_by_id", sa.String(length=36), nullable=False),
            sa.Column("status", status_enum, nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("response_note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "leave_request_id",
                "slot_id",
                "substitute_faculty_id",
                name="uq_leave_substitute_offer_identity",
            ),
        )

    existing_indexes = {item["name"] for item in inspector.get_indexes(table_name)}
    index_specs = [
        ("ix_leave_substitute_offers_leave_request_id", ["leave_request_id"]),
        ("ix_leave_substitute_offers_slot_id", ["slot_id"]),
        ("ix_leave_substitute_offers_substitute_faculty_id", ["substitute_faculty_id"]),
        ("ix_leave_substitute_offers_status", ["status"]),
    ]
    for index_name, columns in index_specs:
        if index_name in existing_indexes:
            continue
        op.create_index(index_name, table_name, columns, unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_name = "leave_substitute_offers"

    if inspector.has_table(table_name):
        existing_indexes = {item["name"] for item in inspector.get_indexes(table_name)}
        for index_name in (
            "ix_leave_substitute_offers_status",
            "ix_leave_substitute_offers_substitute_faculty_id",
            "ix_leave_substitute_offers_slot_id",
            "ix_leave_substitute_offers_leave_request_id",
        ):
            if index_name in existing_indexes:
                op.drop_index(index_name, table_name=table_name)
        op.drop_table(table_name)

    status_enum = postgresql.ENUM(
        "pending",
        "accepted",
        "rejected",
        "expired",
        "superseded",
        "cancelled",
        "rescheduled",
        name="leave_substitute_offer_status",
        create_type=False,
    )
    status_enum.drop(bind, checkfirst=True)
