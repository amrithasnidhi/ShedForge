from __future__ import annotations

import logging

from sqlalchemy import inspect, text

from app.db.base import Base
from app.db.session import engine

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS: dict[str, set[str]] = {
    "users": {"id", "email", "role", "section_name"},
    "faculty": {"id", "email", "preferred_subject_codes", "semester_preferences"},
    "courses": {
        "id",
        "code",
        "semester_number",
        "batch_year",
        "theory_hours",
        "lab_hours",
        "tutorial_hours",
    },
    "institution_settings": {"id", "academic_year", "semester_cycle"},
}


def _ensure_users_section_name_column() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "users" not in set(inspector.get_table_names()):
            return
        column_names = {item["name"] for item in inspector.get_columns("users")}
        if "section_name" in column_names:
            return
        connection.execute(text("ALTER TABLE users ADD COLUMN section_name VARCHAR(50)"))


def _ensure_faculty_preferred_subject_codes_column() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "faculty" not in set(inspector.get_table_names()):
            return
        column_names = {item["name"] for item in inspector.get_columns("faculty")}
        if "preferred_subject_codes" in column_names:
            return

        if connection.dialect.name == "postgresql":
            connection.execute(
                text(
                    "ALTER TABLE faculty "
                    "ADD COLUMN preferred_subject_codes JSONB NOT NULL DEFAULT '[]'::jsonb"
                )
            )
            return

        connection.execute(
            text(
                "ALTER TABLE faculty "
                "ADD COLUMN preferred_subject_codes JSON NOT NULL DEFAULT '[]'"
            )
        )


def _ensure_faculty_semester_preferences_column() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "faculty" not in set(inspector.get_table_names()):
            return
        column_names = {item["name"] for item in inspector.get_columns("faculty")}
        if "semester_preferences" in column_names:
            return
        if connection.dialect.name == "postgresql":
            connection.execute(
                text(
                    "ALTER TABLE faculty "
                    "ADD COLUMN semester_preferences JSONB NOT NULL DEFAULT '{}'::jsonb"
                )
            )
            return
        connection.execute(
            text(
                "ALTER TABLE faculty "
                "ADD COLUMN semester_preferences JSON NOT NULL DEFAULT '{}'"
            )
        )


def _ensure_course_credit_split_columns() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "courses" not in set(inspector.get_table_names()):
            return
        column_names = {item["name"] for item in inspector.get_columns("courses")}
        if "semester_number" not in column_names:
            connection.execute(
                text("ALTER TABLE courses ADD COLUMN semester_number INTEGER NOT NULL DEFAULT 1")
            )
        if "batch_year" not in column_names:
            connection.execute(
                text("ALTER TABLE courses ADD COLUMN batch_year INTEGER NOT NULL DEFAULT 1")
            )
        if "theory_hours" not in column_names:
            connection.execute(
                text("ALTER TABLE courses ADD COLUMN theory_hours INTEGER NOT NULL DEFAULT 0")
            )
        if "lab_hours" not in column_names:
            connection.execute(
                text("ALTER TABLE courses ADD COLUMN lab_hours INTEGER NOT NULL DEFAULT 0")
            )
        if "tutorial_hours" not in column_names:
            connection.execute(
                text("ALTER TABLE courses ADD COLUMN tutorial_hours INTEGER NOT NULL DEFAULT 0")
            )
        course_type_expression = "type::text" if connection.dialect.name == "postgresql" else "CAST(type AS TEXT)"
        connection.execute(
            text(
                "UPDATE courses "
                "SET theory_hours = CASE "
                f"WHEN {course_type_expression} = 'lab' THEN 0 "
                "WHEN theory_hours = 0 THEN hours_per_week "
                "ELSE theory_hours "
                "END, "
                "lab_hours = CASE "
                f"WHEN {course_type_expression} = 'lab' AND lab_hours = 0 THEN hours_per_week "
                "ELSE lab_hours "
                "END, "
                "tutorial_hours = COALESCE(tutorial_hours, 0) "
                "WHERE theory_hours + lab_hours + tutorial_hours = 0"
            )
        )


def _ensure_institution_cycle_columns() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "institution_settings" not in set(inspector.get_table_names()):
            return
        column_names = {item["name"] for item in inspector.get_columns("institution_settings")}
        if "academic_year" not in column_names:
            connection.execute(
                text(
                    "ALTER TABLE institution_settings "
                    "ADD COLUMN academic_year VARCHAR(20) NOT NULL DEFAULT '2026-2027'"
                )
            )
        if "semester_cycle" not in column_names:
            connection.execute(
                text(
                    "ALTER TABLE institution_settings "
                    "ADD COLUMN semester_cycle VARCHAR(10) NOT NULL DEFAULT 'odd'"
                )
            )


def _assert_required_columns() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())
        missing_tables = [name for name in REQUIRED_COLUMNS if name not in table_names]
        if missing_tables:
            raise RuntimeError(f"Missing required tables: {', '.join(sorted(missing_tables))}")

        missing_columns: list[str] = []
        for table_name, required in REQUIRED_COLUMNS.items():
            existing = {item["name"] for item in inspector.get_columns(table_name)}
            for column_name in sorted(required - existing):
                missing_columns.append(f"{table_name}.{column_name}")
        if missing_columns:
            raise RuntimeError(f"Missing required columns: {', '.join(missing_columns)}")


def ensure_runtime_schema_compatibility() -> None:
    try:
        # Ensure missing tables are present before additive compatibility patches.
        Base.metadata.create_all(bind=engine)
        _ensure_users_section_name_column()
        _ensure_faculty_preferred_subject_codes_column()
        _ensure_faculty_semester_preferences_column()
        _ensure_course_credit_split_columns()
        _ensure_institution_cycle_columns()
        _assert_required_columns()
    except Exception as exc:  # pragma: no cover - runtime environment dependent
        logger.exception("Runtime schema compatibility bootstrap failed")
        raise RuntimeError("Runtime schema compatibility bootstrap failed") from exc
