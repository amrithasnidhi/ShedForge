"""scope rooms by program

Revision ID: 20260309_0027
Revises: 20260309_0026
Create Date: 2026-03-09 22:10:00.000000

"""

from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa


revision = "20260309_0027"
down_revision = "20260309_0026"
branch_labels = None
depends_on = None


def _column_exists(inspector: object, table_name: str, column_name: str) -> bool:
    return column_name in {item["name"] for item in inspector.get_columns(table_name)}


def _index_exists(inspector: object, table_name: str, index_name: str) -> bool:
    return index_name in {item["name"] for item in inspector.get_indexes(table_name)}


def _constraint_exists(inspector: object, table_name: str, constraint_name: str) -> bool:
    return constraint_name in {
        item["name"]
        for item in inspector.get_unique_constraints(table_name)
        if item.get("name")
    }


def _ensure_default_program_id(bind: sa.Connection) -> str:
    existing_id = bind.execute(sa.text("SELECT id FROM programs LIMIT 1")).scalar_one_or_none()
    if existing_id is not None:
        return str(existing_id)

    program_id = str(uuid.uuid4())
    bind.execute(
        sa.text(
            """
            INSERT INTO programs (
                id,
                name,
                code,
                department,
                degree,
                duration_years,
                sections,
                total_students
            )
            VALUES (
                :id,
                :name,
                :code,
                :department,
                :degree,
                :duration_years,
                :sections,
                :total_students
            )
            """
        ),
        {
            "id": program_id,
            "name": "Default Program",
            "code": "DEFAULT-PROGRAM",
            "department": "General",
            "degree": "BS",
            "duration_years": 4,
            "sections": 1,
            "total_students": 0,
        },
    )
    return program_id


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    default_program_id = _ensure_default_program_id(bind)

    if not _column_exists(inspector, "rooms", "program_id"):
        op.add_column("rooms", sa.Column("program_id", sa.String(length=36), nullable=True))

    rooms = sa.table(
        "rooms",
        sa.column("program_id", sa.String()),
    )
    bind.execute(
        rooms.update()
        .where(rooms.c.program_id.is_(None))
        .values(program_id=default_program_id)
    )
    op.alter_column("rooms", "program_id", existing_type=sa.String(length=36), nullable=False)

    inspector = sa.inspect(bind)
    if _index_exists(inspector, "rooms", "ix_rooms_name"):
        op.drop_index("ix_rooms_name", table_name="rooms")
    op.create_index("ix_rooms_name", "rooms", ["name"], unique=False)

    inspector = sa.inspect(bind)
    if not _index_exists(inspector, "rooms", "ix_rooms_program_id"):
        op.create_index("ix_rooms_program_id", "rooms", ["program_id"], unique=False)

    inspector = sa.inspect(bind)
    if not _constraint_exists(inspector, "rooms", "uq_rooms_program_name"):
        op.create_unique_constraint("uq_rooms_program_name", "rooms", ["program_id", "name"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _constraint_exists(inspector, "rooms", "uq_rooms_program_name"):
        op.drop_constraint("uq_rooms_program_name", "rooms", type_="unique")

    inspector = sa.inspect(bind)
    if _index_exists(inspector, "rooms", "ix_rooms_program_id"):
        op.drop_index("ix_rooms_program_id", table_name="rooms")

    inspector = sa.inspect(bind)
    if _index_exists(inspector, "rooms", "ix_rooms_name"):
        op.drop_index("ix_rooms_name", table_name="rooms")
    op.create_index("ix_rooms_name", "rooms", ["name"], unique=True)

    inspector = sa.inspect(bind)
    if _column_exists(inspector, "rooms", "program_id"):
        op.drop_column("rooms", "program_id")
