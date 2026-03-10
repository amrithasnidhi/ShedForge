"""Import BTCSE academic data from Excel files into ShedForge DB.

Usage:
  PYTHONPATH=backend python scripts/import_btcse_excels.py \
    --courses /Users/.../Course.xlsx \
    --faculty /Users/.../Faculty.xlsx \
    --rooms /Users/.../Rooms.xlsx \
    --students /Users/.../Students_E_Section.xlsx
"""

from __future__ import annotations

import argparse
import math
import re
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import delete, func, select

from app.core.security import get_password_hash
from app.db.bootstrap import ensure_runtime_schema_compatibility
from app.db.session import SessionLocal
from app.models.course import Course, CourseType
from app.models.faculty import Faculty
from app.models.program import Program, ProgramDegree
from app.models.program_structure import ProgramCourse, ProgramSection, ProgramTerm
from app.models.room import Room, RoomType
from app.models.user import User, UserRole


DEFAULT_PASSWORD = "ShedForge123!"
WORKING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]


def parse_bool(value: Any, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"yes", "y", "true", "1"}:
        return True
    if text in {"no", "n", "false", "0"}:
        return False
    return default


def parse_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        if math.isnan(value):  # type: ignore[arg-type]
            return default
        return int(round(float(value)))
    text = str(value).strip()
    if not text:
        return default
    try:
        return int(round(float(text)))
    except ValueError:
        return default


def parse_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        try:
            if math.isnan(value):  # type: ignore[arg-type]
                return default
        except TypeError:
            pass
        return float(value)
    text = str(value).strip()
    if not text:
        return default
    try:
        return float(text)
    except ValueError:
        return default


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() == "nan":
        return ""
    return text


def slugify(value: str) -> str:
    lowered = value.strip().lower()
    lowered = re.sub(r"[^a-z0-9]+", ".", lowered)
    lowered = re.sub(r"\.+", ".", lowered)
    return lowered.strip(".") or "user"


def parse_preferred_subjects(value: Any) -> list[str]:
    text = clean_text(value)
    if not text:
        return []
    parts = [item.strip().upper() for item in re.split(r"[;,|/]+", text) if item.strip()]
    output: list[str] = []
    seen: set[str] = set()
    for part in parts:
        if part in seen:
            continue
        seen.add(part)
        output.append(part)
    return output


def parse_semester_preferences(value: Any, preferred_subjects: list[str]) -> dict[str, list[str]]:
    text = clean_text(value)
    if not text or not preferred_subjects:
        return {}
    semesters = [item for item in re.split(r"[;,|/ ]+", text) if item]
    output: dict[str, list[str]] = {}
    for semester in semesters:
        sem = semester.strip()
        if not sem.isdigit():
            continue
        output.setdefault(sem, [])
        for code in preferred_subjects:
            if code not in output[sem]:
                output[sem].append(code)
    return output


def unique_email(base: str, domain: str, used: set[str]) -> str:
    candidate = f"{base}@{domain}".lower()
    idx = 2
    while candidate in used:
        candidate = f"{base}{idx}@{domain}".lower()
        idx += 1
    used.add(candidate)
    return candidate


def room_type_from_text(value: str) -> RoomType:
    text = value.strip().lower()
    if text == "lab" or "lab" in text:
        return RoomType.lab
    if text == "seminar":
        return RoomType.seminar
    return RoomType.lecture


def normalize_room_building(room_name: str, building: str) -> str:
    name = room_name.strip().lower()
    normalized_building = building.strip().lower()

    if re.match(r"^it\s*lab\s*[1-4]$", name):
        return "AB2"
    if name == "language lab":
        return "AB1"

    if normalized_building in {"g block", "ground flooe", "ground floor"}:
        return "Ground Floor"
    if normalized_building in {"block 1", "first floor"}:
        return "First Floor"
    if normalized_building in {"block 2", "second floor"}:
        return "Second Floor"
    if normalized_building in {"block 3", "third floor"}:
        return "Third Floor"
    return building or "Ground Floor"


def course_type_from_row(row: pd.Series) -> CourseType:
    elective_category = clean_text(row.get("Elective Category"))
    type_text = clean_text(row.get("Type")).lower()
    l = parse_int(row.get("L"), 0)
    t = parse_int(row.get("T"), 0)
    p = parse_int(row.get("P"), 0)
    if elective_category or "elective" in type_text:
        return CourseType.elective
    if p > 0 and (l + t) == 0:
        return CourseType.lab
    return CourseType.theory


def compute_credits(l: int, t: int, p: int, provided: float) -> float:
    if provided > 0:
        return float(provided)
    computed = float(l + t + (p / 2.0))
    return float(max(0, math.floor(computed + 1e-9)))


def create_or_update_program(session, *, name: str, code: str, department: str, degree_text: str, duration: int, sections: int, total_students: int) -> Program:
    degree_map = {
        "b.tech": ProgramDegree.BS,
        "btech": ProgramDegree.BS,
        "bs": ProgramDegree.BS,
        "ms": ProgramDegree.MS,
        "phd": ProgramDegree.PhD,
    }
    degree = degree_map.get(degree_text.strip().lower(), ProgramDegree.BS)
    program = session.execute(select(Program).where(Program.code == code)).scalar_one_or_none()
    if program is None:
        program = Program(
            name=name,
            code=code,
            department=department,
            degree=degree,
            duration_years=duration,
            sections=sections,
            total_students=total_students,
            default_section_capacity=max(1, total_students // max(1, sections)),
            home_building="Academic Block",
            course_mapping_enabled=True,
            faculty_mapping_enabled=True,
            student_mapping_enabled=True,
            room_mapping_enabled=True,
        )
        session.add(program)
    else:
        program.name = name
        program.department = department
        program.degree = degree
        program.duration_years = duration
        program.sections = sections
        program.total_students = total_students
        program.default_section_capacity = max(1, total_students // max(1, sections))
        program.home_building = "Academic Block"
        program.course_mapping_enabled = True
        program.faculty_mapping_enabled = True
        program.student_mapping_enabled = True
        program.room_mapping_enabled = True
    session.flush()
    return program


def reset_program_scoped_data(session, program_id: str) -> None:
    session.execute(delete(ProgramCourse).where(ProgramCourse.program_id == program_id))
    session.execute(delete(ProgramSection).where(ProgramSection.program_id == program_id))
    session.execute(delete(ProgramTerm).where(ProgramTerm.program_id == program_id))
    session.execute(delete(Course).where(Course.program_id == program_id))
    session.execute(delete(Faculty).where(Faculty.program_id == program_id))
    session.execute(delete(Room).where(Room.program_id == program_id))
    session.execute(
        delete(User).where(
            User.program_id == program_id,
            User.role.in_([UserRole.faculty, UserRole.student]),
        )
    )


def seed_terms_and_sections(session, program_id: str, total_sections: int, semester_credits: dict[int, int]) -> None:
    section_names = [chr(ord("A") + i) for i in range(max(1, total_sections))]
    per_section_capacity = max(1, 480 // max(1, total_sections))
    for term in range(1, 9):
        term_row = ProgramTerm(
            program_id=program_id,
            term_number=term,
            name=f"Semester {term}",
            credits_required=semester_credits.get(term, 0),
        )
        session.add(term_row)
        for section_name in section_names:
            session.add(
                ProgramSection(
                    program_id=program_id,
                    term_number=term,
                    name=section_name,
                    capacity=per_section_capacity,
                )
            )


def import_courses(session, program: Program, courses_path: Path) -> tuple[int, dict[int, int]]:
    df = pd.read_excel(courses_path, sheet_name=0)
    created = 0
    semester_credits: dict[int, float] = {}
    for _, row in df.iterrows():
        code = clean_text(row.get("Course Code")).upper()
        name = clean_text(row.get("Course Name"))
        if not code or not name:
            continue
        semester = max(1, parse_int(row.get("Semester Number"), 1))
        batch_year = parse_int(row.get("Batch Year"), max(1, (semester + 1) // 2))
        sections = parse_int(row.get("Sections"), program.sections)
        l = max(0, parse_int(row.get("L"), 0))
        t = max(0, parse_int(row.get("T"), 0))
        p = max(0, parse_int(row.get("P"), 0))
        hours_per_week = max(1, l + t + p)
        course_type = course_type_from_row(row)
        credits = compute_credits(l, t, p, parse_float(row.get("Credits"), 0.0))
        batch_segregation = parse_bool(row.get("Batch Segregation (Yes/No)"), True)
        assign_faculty = parse_bool(row.get("Assign Faculty (Yes/No)"), True)
        assign_classroom = parse_bool(row.get("Assign Classroom (Yes/No)"), True)
        if course_type == CourseType.elective:
            assign_faculty = False
            assign_classroom = False
        practical_contiguous = parse_int(row.get("Practical Contiguous Slots"), 1)
        if p <= 0:
            practical_contiguous = 1
        else:
            practical_contiguous = max(1, min(practical_contiguous, p))
        elective_category = clean_text(row.get("Elective Category")) or None

        course = Course(
            program_id=program.id,
            code=code,
            name=name,
            type=course_type,
            credits=credits,
            duration_hours=1,
            sections=max(1, sections),
            hours_per_week=hours_per_week,
            semester_number=semester,
            batch_year=max(1, batch_year),
            theory_hours=l,
            lab_hours=p,
            tutorial_hours=t,
            batch_segregation=batch_segregation,
            practical_contiguous_slots=practical_contiguous,
            assign_faculty=assign_faculty,
            assign_classroom=assign_classroom,
            default_room_id=None,
            elective_category=elective_category,
            faculty_id=None,
        )
        session.add(course)
        session.flush()
        session.add(
            ProgramCourse(
                program_id=program.id,
                term_number=semester,
                course_id=course.id,
                is_required=(course_type != CourseType.elective),
                lab_batch_count=2 if (p > 0 and batch_segregation) else 1,
                allow_parallel_batches=True,
                prerequisite_course_ids=[],
            )
        )
        created += 1
        semester_credits[semester] = semester_credits.get(semester, 0.0) + credits

    semester_credits_int = {key: int(round(value)) for key, value in semester_credits.items()}
    return created, semester_credits_int


def import_faculty(session, program: Program, faculty_path: Path) -> int:
    df = pd.read_excel(faculty_path, sheet_name=0)
    created = 0
    used_emails = {
        item.lower()
        for item in session.execute(select(User.email)).scalars().all()
        if item
    }
    for _, row in df.iterrows():
        name = clean_text(row.get("Full Name"))
        if not name:
            continue
        email = clean_text(row.get("Email")).lower()
        if not email:
            email = unique_email(slugify(name), "btcse.edu", used_emails)
        designation = clean_text(row.get("Designation")) or "Faculty"
        department = clean_text(row.get("Department")) or program.department
        max_hours = max(1, parse_int(row.get("Maximum Weekly Hours"), 20))
        preferred_subjects = parse_preferred_subjects(row.get("Preferred Subjects"))
        semester_preferences = parse_semester_preferences(row.get("Preferred Semester"), preferred_subjects)

        faculty = Faculty(
            program_id=program.id,
            name=name,
            designation=designation,
            email=email,
            department=department,
            workload_hours=0,
            max_hours=max_hours,
            availability=WORKING_DAYS,
            availability_windows=[{"day": day, "start_time": "08:00", "end_time": "18:00"} for day in WORKING_DAYS],
            avoid_back_to_back=False,
            preferred_min_break_minutes=0,
            preference_notes=None,
            preferred_subject_codes=preferred_subjects,
            semester_preferences=semester_preferences,
        )
        session.add(faculty)

        session.add(
            User(
                name=name,
                email=email,
                hashed_password=get_password_hash(DEFAULT_PASSWORD),
                role=UserRole.faculty,
                program_id=program.id,
                department=department,
                section_name=None,
                semester_number=None,
                batch_year=None,
                roll_number=None,
                is_active=True,
            )
        )
        created += 1
    return created


def import_rooms(session, program: Program, rooms_path: Path) -> int:
    df = pd.read_excel(rooms_path, sheet_name=0)
    created = 0
    for _, row in df.iterrows():
        name = clean_text(row.get("Room Name"))
        if not name:
            continue
        building = normalize_room_building(
            name,
            clean_text(row.get("Building")) or "Ground Floor",
        )
        room_type = room_type_from_text(clean_text(row.get("Type")) or "lecture")
        capacity = 60
        has_lab = parse_bool(row.get("hasLabEquipment"), room_type == RoomType.lab)
        has_projector = parse_bool(row.get("hasProjector"), True)
        session.add(
            Room(
                program_id=program.id,
                name=name,
                building=building,
                capacity=capacity,
                type=room_type,
                has_lab_equipment=has_lab,
                has_projector=has_projector,
                availability_windows=[{"day": day, "start_time": "08:00", "end_time": "18:00"} for day in WORKING_DAYS],
            )
        )
        created += 1
    return created


def import_students(session, program: Program, students_path: Path) -> int:
    df = pd.read_excel(students_path, sheet_name=0)
    created = 0
    used_emails = {
        item.lower()
        for item in session.execute(select(User.email)).scalars().all()
        if item
    }
    for _, row in df.iterrows():
        name = clean_text(row.get("Name"))
        if not name:
            continue
        roll_number = clean_text(row.get("Roll Number"))
        email = clean_text(row.get("Email")).lower()
        if not email:
            base = slugify(roll_number or name)
            email = unique_email(base, "students.btcse.edu", used_emails)
        semester_number = max(1, parse_int(row.get("Semester Number"), 1))
        section_name = clean_text(row.get("Section Name")) or "E"
        batch_year = parse_int(row.get("Batch Year"), 1)
        session.add(
            User(
                name=name,
                email=email,
                hashed_password=get_password_hash(DEFAULT_PASSWORD),
                role=UserRole.student,
                program_id=program.id,
                department=program.department,
                section_name=section_name,
                semester_number=semester_number,
                batch_year=batch_year,
                roll_number=roll_number or None,
                is_active=True,
            )
        )
        created += 1
    return created


def main() -> None:
    parser = argparse.ArgumentParser(description="Import BTCSE data from Excel files")
    parser.add_argument("--courses", required=True, type=Path)
    parser.add_argument("--faculty", required=True, type=Path)
    parser.add_argument("--rooms", required=True, type=Path)
    parser.add_argument("--students", required=True, type=Path)
    args = parser.parse_args()

    ensure_runtime_schema_compatibility()
    session = SessionLocal()
    try:
        program = create_or_update_program(
            session,
            name="B.Tech Computer Science and Engineering",
            code="BTCSE",
            department="CSE",
            degree_text="B.Tech",
            duration=4,
            sections=8,
            total_students=480,
        )

        reset_program_scoped_data(session, program.id)
        session.flush()

        courses_count, semester_credits = import_courses(session, program, args.courses)
        seed_terms_and_sections(session, program.id, 8, semester_credits)
        faculty_count = import_faculty(session, program, args.faculty)
        rooms_count = import_rooms(session, program, args.rooms)
        students_count = import_students(session, program, args.students)

        session.commit()

        print("Import completed")
        print(f"Program: {program.code} ({program.name})")
        print(f"Courses: {courses_count}")
        print(f"Faculty: {faculty_count}")
        print(f"Rooms: {rooms_count}")
        print(f"Students: {students_count}")
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
