"""scope core academic entities by program

Revision ID: 20260309_0026
Revises: 20260309_0025
Create Date: 2026-03-09 18:00:00.000000

"""

from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa


revision = "20260309_0026"
down_revision = "20260309_0025"
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

    if not _column_exists(inspector, "courses", "program_id"):
        op.add_column("courses", sa.Column("program_id", sa.String(length=36), nullable=True))
    if not _column_exists(inspector, "faculty", "program_id"):
        op.add_column("faculty", sa.Column("program_id", sa.String(length=36), nullable=True))
    if not _column_exists(inspector, "users", "program_id"):
        op.add_column("users", sa.Column("program_id", sa.String(length=36), nullable=True))
    if not _column_exists(inspector, "users", "semester_number"):
        op.add_column("users", sa.Column("semester_number", sa.Integer(), nullable=True))
    if not _column_exists(inspector, "users", "batch_year"):
        op.add_column("users", sa.Column("batch_year", sa.Integer(), nullable=True))
    if not _column_exists(inspector, "users", "roll_number"):
        op.add_column("users", sa.Column("roll_number", sa.String(length=64), nullable=True))

    program_courses = sa.table(
        "program_courses",
        sa.column("course_id", sa.String()),
        sa.column("program_id", sa.String()),
    )
    courses = sa.table(
        "courses",
        sa.column("id", sa.String()),
        sa.column("program_id", sa.String()),
        sa.column("faculty_id", sa.String()),
    )
    faculty = sa.table(
        "faculty",
        sa.column("id", sa.String()),
        sa.column("email", sa.String()),
        sa.column("program_id", sa.String()),
    )
    users = sa.table(
        "users",
        sa.column("id", sa.String()),
        sa.column("email", sa.String()),
        sa.column("role", sa.String()),
        sa.column("program_id", sa.String()),
    )

    course_program_map: dict[str, str] = {}
    for row in bind.execute(sa.select(program_courses.c.course_id, program_courses.c.program_id)):
        course_id = str(row.course_id)
        program_id = str(row.program_id)
        if course_id not in course_program_map:
            course_program_map[course_id] = program_id
    for course_id, program_id in course_program_map.items():
        bind.execute(
            courses.update()
            .where(courses.c.id == course_id)
            .where(courses.c.program_id.is_(None))
            .values(program_id=program_id)
        )
    bind.execute(
        courses.update()
        .where(courses.c.program_id.is_(None))
        .values(program_id=default_program_id)
    )

    faculty_program_map: dict[str, str] = {}
    for row in bind.execute(
        sa.select(courses.c.faculty_id, courses.c.program_id).where(courses.c.faculty_id.is_not(None))
    ):
        faculty_id = str(row.faculty_id)
        program_id = str(row.program_id)
        if faculty_id not in faculty_program_map:
            faculty_program_map[faculty_id] = program_id
    for faculty_id, program_id in faculty_program_map.items():
        bind.execute(
            faculty.update()
            .where(faculty.c.id == faculty_id)
            .where(faculty.c.program_id.is_(None))
            .values(program_id=program_id)
        )
    bind.execute(
        faculty.update()
        .where(faculty.c.program_id.is_(None))
        .values(program_id=default_program_id)
    )

    faculty_email_to_program: dict[str, str] = {
        str(row.email).strip().lower(): str(row.program_id)
        for row in bind.execute(sa.select(faculty.c.email, faculty.c.program_id))
        if row.email
    }
    for row in bind.execute(sa.select(users.c.id, users.c.email, users.c.role, users.c.program_id)):
        if row.program_id is not None:
            continue
        role = str(row.role)
        if role not in {"faculty", "student"}:
            continue
        email = str(row.email).strip().lower() if row.email else ""
        program_id = faculty_email_to_program.get(email, default_program_id)
        bind.execute(users.update().where(users.c.id == row.id).values(program_id=program_id))

    op.alter_column("courses", "program_id", existing_type=sa.String(length=36), nullable=False)
    op.alter_column("faculty", "program_id", existing_type=sa.String(length=36), nullable=False)

    inspector = sa.inspect(bind)
    if _index_exists(inspector, "courses", "ix_courses_code"):
        op.drop_index("ix_courses_code", table_name="courses")
    op.create_index("ix_courses_code", "courses", ["code"], unique=False)

    inspector = sa.inspect(bind)
    if not _constraint_exists(inspector, "courses", "uq_courses_program_code"):
        op.create_unique_constraint("uq_courses_program_code", "courses", ["program_id", "code"])

    inspector = sa.inspect(bind)
    if not _index_exists(inspector, "courses", "ix_courses_program_id"):
        op.create_index("ix_courses_program_id", "courses", ["program_id"], unique=False)
    if not _index_exists(inspector, "faculty", "ix_faculty_program_id"):
        op.create_index("ix_faculty_program_id", "faculty", ["program_id"], unique=False)
    if not _index_exists(inspector, "users", "ix_users_program_id"):
        op.create_index("ix_users_program_id", "users", ["program_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _constraint_exists(inspector, "courses", "uq_courses_program_code"):
        op.drop_constraint("uq_courses_program_code", "courses", type_="unique")

    inspector = sa.inspect(bind)
    if _index_exists(inspector, "courses", "ix_courses_program_id"):
        op.drop_index("ix_courses_program_id", table_name="courses")
    if _index_exists(inspector, "faculty", "ix_faculty_program_id"):
        op.drop_index("ix_faculty_program_id", table_name="faculty")
    if _index_exists(inspector, "users", "ix_users_program_id"):
        op.drop_index("ix_users_program_id", table_name="users")

    inspector = sa.inspect(bind)
    if _index_exists(inspector, "courses", "ix_courses_code"):
        op.drop_index("ix_courses_code", table_name="courses")
    op.create_index("ix_courses_code", "courses", ["code"], unique=True)

    inspector = sa.inspect(bind)
    if _column_exists(inspector, "users", "roll_number"):
        op.drop_column("users", "roll_number")
    if _column_exists(inspector, "users", "batch_year"):
        op.drop_column("users", "batch_year")
    if _column_exists(inspector, "users", "semester_number"):
        op.drop_column("users", "semester_number")
    if _column_exists(inspector, "users", "program_id"):
        op.drop_column("users", "program_id")

    inspector = sa.inspect(bind)
    if _column_exists(inspector, "faculty", "program_id"):
        op.drop_column("faculty", "program_id")
    if _column_exists(inspector, "courses", "program_id"):
        op.drop_column("courses", "program_id")
