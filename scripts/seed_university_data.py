"""Seed comprehensive university data for ShedForge.

Run:
  PYTHONPATH=backend python scripts/seed_university_data.py
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass

from sqlalchemy import func, select

from app.core.security import get_password_hash
from app.db.bootstrap import ensure_runtime_schema_compatibility
from app.db.session import SessionLocal
from app.models.course import Course, CourseType
from app.models.faculty import Faculty
from app.models.institution_settings import InstitutionSettings
from app.models.program import Program, ProgramDegree
from app.models.program_structure import ProgramCourse, ProgramSection, ProgramTerm
from app.models.room import Room, RoomType
from app.models.semester_constraint import SemesterConstraint
from app.models.user import User, UserRole
from app.services.workload import constrained_max_hours

DEFAULT_PASSWORD = os.getenv("SEED_DEFAULT_PASSWORD", "ShedForge123!")
RESET_PASSWORDS = os.getenv("SEED_RESET_PASSWORDS", "true").strip().lower() in {"1", "true", "yes", "on"}
MOCK_EMAIL_DOMAIN = os.getenv("SEED_MOCK_EMAIL_DOMAIN", "university.edu").strip().lower() or "university.edu"
ACADEMIC_YEAR = os.getenv("SEED_ACADEMIC_YEAR", "2026-2027").strip() or "2026-2027"
SEMESTER_CYCLE = os.getenv("SEED_SEMESTER_CYCLE", "odd").strip().lower()
if SEMESTER_CYCLE not in {"odd", "even"}:
    SEMESTER_CYCLE = "odd"

DEPARTMENT = "CSE"
PROGRAM_CODE = "BTECH-CSE-2023"
PROGRAM_NAME = "B.Tech Computer Science and Engineering"
WORKING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
SECTION_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H"]
TERM_CREDIT_TARGETS = {
    1: 21,
    2: 21,
    3: 22,
    4: 24,
    5: 25,
    6: 23,
    7: 20,
    8: 6,
}

ADMIN_PROFILE = {
    "name": "Tejeshwar C D R",
    "email": "principal@university.edu",
    "role": UserRole.admin,
    "department": "Administration",
    "section_name": None,
}

REAL_TEACHER_PROFILE = {
    "name": "Dr. Suchithra M.",
    "email": "cdrtejeshwar@gmail.com",
    "designation": "Assistant Professor (Sr. Gd.)",
    "preferred_subject_codes": ["23CSE311", "23CSE214", "23CSE111"],
    "semester_preferences": {
        "2": ["23CSE111"],
        "4": ["23CSE214"],
        "6": ["23CSE311"],
    },
}

REAL_STUDENT_PROFILE = {
    "name": "Sanjay Anand M",
    "email": "sanjayanand190@gmail.com",
    "role": UserRole.student,
    "department": DEPARTMENT,
    "section_name": "A",
}


FACULTY_DESIGNATIONS: list[tuple[str, str]] = [
    ("Dr. Vidhya Balasubramanian", "Principal, Professor"),
    ("Dr. Bagavathi Sivakumar P.", "Chairperson, Associate Professor"),
    ("Dr. Harini N.", "Vice Chairperson, Associate Professor"),
    ("Dr. R. Karthi", "Vice Chairperson, Associate Professor"),
    ("Dr. Raghesh Krishnan K.", "Vice Chairperson, Assistant Professor (Sl. Gd.)"),
    ("Dr. Shunmuga Velayutham C.", "Professor"),
    ("Dr. Jeyakumar G.", "Professor"),
    ("Dr. (Col.) Kumar P. N.", "Professor"),
    ("Dr. Radhika N.", "Professor"),
    ("Dr. Rajathilagam B.", "Principal"),
    ("Dr. Anantha Narayanan V.", "Associate Professor"),
    ("Dr. Gireeshkumar T.", "Professor"),
    ("Dr. Gowtham R.", "Associate Professor, Research Head"),
    ("Dr. Lalithamani N.", "Associate Professor"),
    ("Dr. Padmavathi S.", "Associate Professor"),
    ("Dr. Senthilkumar M.", "Associate Professor"),
    ("Dr. Senthil Kumar T.", "Professor"),
    ("Dr. Swapna T. R.", "Associate Professor"),
    ("Dr. Thangavelu S.", "Associate Professor"),
    ("Dr. Venkataraman D.", "Associate Professor"),
    ("Dr. Aarthi R.", "Assistant Professor (Sl. Gd.)"),
    ("Dr. Anbazhagan M.", "Assistant Professor (Sl. Gd.)"),
    ("Dr. Bagyammal T.", "Assistant Professor (Sl. Gd.)"),
    ("Dr. Dhanya M. Dhanalakshmy", "Assistant Professor (Sl. Gd.)"),
    ("Dr. Govindarajan J.", "Assistant Professor (Sl. Gd.)"),
    ("Dr. Prathilothamai M.", "Assistant Professor (Sl. Gd.)"),
    ("Dr. T. Ramraj", "Assistant Professor (Sl. Gd.)"),
    ("Dr. Ritwik M.", "Assistant Professor (Sl. Gd.)"),
    ("Dr. Sabarish B. A.", "Assistant Professor (Sl. Gd.)"),
    ("Dr. Shanmuga Priya S.", "Assistant Professor (Sl. Gd.)"),
    ("Nalinadevi K.", "Assistant Professor (Sl. Gd.)"),
    ("Dr. Bagavathi C.", "Assistant Professor (Sr. Gd.)"),
    ("Dr. T. Deepika", "Assistant Professor (Sr. Gd.)"),
    ("Dr. Remyakrishnan P.", "Assistant Professor (Sr. Gd.)"),
    ("Dr. J.Uma", "Assistant Professor (Sr. Gd.)"),
    ("Abirami K.", "Assistant Professor (Sr. Gd.)"),
    ("Anisha Radhakrishnan", "Assistant Professor (Sr. Gd.)"),
    ("Baskar A.", "Assistant Professor (Sr. Gd.)"),
    ("Bharathi D.", "Assistant Professor (Sr. Gd.)"),
    ("Bindu K. R.", "Assistant Professor (Sr. Gd.)"),
    ("Dayanand V.", "Assistant Professor (Sr. Gd.)"),
    ("Malathi P.", "Assistant Professor (Sr. Gd.)"),
    ("Manjusha R.", "Assistant Professor (Sr. Gd.)"),
    ("Radhika G.", "Assistant Professor (Sr. Gd.)"),
    ("Ramya G. R.", "Assistant Professor (Sr. Gd.)"),
    ("Sathiya R. R.", "Assistant Professor (Sr. Gd.)"),
    ("Suchithra M.", "Assistant Professor (Sr. Gd.)"),
    ("Sujee R.", "Assistant Professor (Sr. Gd.)"),
    ("Sumesh A. K.", "Assistant Professor (Sr. Gd.)"),
    ("Anupa Vijai", "Assistant Professor (Sr. Gd.)"),
    ("Dr. Anuragi Arti Narayandas", "Assistant Professor"),
    ("Dr Sruthi C J", "Assistant Professor"),
    ("Dr. S.Vishnu", "Assistant Professor"),
    ("Dr. Vishnuvarthan R", "Assistant Professor"),
    ("Neethu MR", "Assistant Professor"),
    ("Dr. Vandhana S.", "Assistant Professor"),
    ("Divya Singh", "Assistant Professor"),
    ("Rajeshwar Yadav", "Assistant Professor"),
    ("Dr. Jayakrishnan Anandakrishnan", "Assistant Professor"),
    ("Subathra P.", "Assistant Professor (OC)"),
    ("Rahul Pawar", "Assistant Professor (OC)"),
    ("Sriram S.", "Assistant Professor (OC)"),
    ("Vedaj J Padman", "Assistant Professor (OC)"),
    ("Krishna Priya G.", "Assistant Professor (OC)"),
    ("Arjun P.K", "Assistant Professor (OC)"),
    ("Rohini S", "Assistant Professor (OC)"),
]


@dataclass(frozen=True)
class CurriculumItem:
    term: int
    code: str
    name: str
    l: int
    t: int
    p: int
    credits: int
    course_type: CourseType
    required: bool = True
    optional: bool = False


CURRICULUM: list[CurriculumItem] = [
    CurriculumItem(1, "23ENG101", "Technical Communication", 2, 0, 3, 3, CourseType.theory),
    CurriculumItem(1, "23MAT107", "Calculus", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(1, "23CSE101", "Computational Problem Solving", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(1, "23EEE104", "Introduction to Electrical and Electronics Engineering", 3, 0, 0, 3, CourseType.theory),
    CurriculumItem(1, "23EEE184", "Basic Electrical and Electronics Engineering Practice", 0, 0, 2, 1, CourseType.lab),
    CurriculumItem(1, "23CSE102", "Computer Hardware Essentials", 1, 0, 2, 2, CourseType.theory),
    CurriculumItem(1, "22ADM101", "Foundations of Indian Heritage", 2, 0, 1, 2, CourseType.theory),
    CurriculumItem(1, "22AVP103", "Mastery Over Mind", 1, 0, 2, 2, CourseType.theory),
    CurriculumItem(2, "23MAT116", "Discrete Mathematics", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(2, "23MAT117", "Linear Algebra", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(2, "23CSE111", "Object Oriented Programming", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(2, "23PHY115", "Modern Physics", 2, 1, 0, 3, CourseType.theory),
    CurriculumItem(2, "23CSE113", "User Interface Design", 2, 0, 2, 3, CourseType.theory),
    CurriculumItem(2, "23MEE115", "Manufacturing Practice", 0, 0, 3, 1, CourseType.lab),
    CurriculumItem(2, "22ADM111", "Glimpses of Glorious India", 2, 0, 1, 2, CourseType.theory),
    CurriculumItem(3, "23MAT206", "Optimization Techniques", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(3, "23ECE205", "Digital Electronics", 3, 0, 0, 3, CourseType.theory),
    CurriculumItem(3, "23CSE201", "Procedural Programming using C", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(3, "23CSE202", "Database Management Systems", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(3, "23CSE203", "Data Structures and Algorithms", 3, 1, 2, 5, CourseType.theory),
    CurriculumItem(3, "23ECE285", "Digital Electronics Laboratory", 0, 0, 3, 1, CourseType.lab),
    CurriculumItem(3, "23LSE201", "Life Skills for Engineers I", 1, 0, 2, 0, CourseType.theory),
    CurriculumItem(3, "23AVP201", "Amrita Value Programme I", 1, 0, 0, 1, CourseType.theory),
    CurriculumItem(4, "23MAT216", "Probability and Random Processes", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(4, "23CSE211", "Design and Analysis of Algorithms", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(4, "23CSE212", "Principles of Functional Languages", 2, 0, 2, 3, CourseType.theory),
    CurriculumItem(4, "23CSE213", "Computer Organization and Architecture", 3, 1, 0, 4, CourseType.theory),
    CurriculumItem(4, "23CSE214", "Operating Systems", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(4, "23AVP202", "Amrita Value Programme II", 1, 0, 0, 1, CourseType.theory),
    CurriculumItem(4, "23FRE401", "Free Elective I", 2, 0, 0, 2, CourseType.elective, required=False),
    CurriculumItem(4, "23LSE211", "Life Skills for Engineers II", 1, 0, 2, 2, CourseType.theory),
    CurriculumItem(5, "23CSE301", "Machine Learning", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(5, "23PE501", "Professional Elective I", 3, 0, 0, 3, CourseType.elective, required=False),
    CurriculumItem(5, "23CSE302", "Computer Networks", 3, 1, 2, 5, CourseType.theory),
    CurriculumItem(5, "23CSE303", "Theory of Computation", 3, 1, 0, 4, CourseType.theory),
    CurriculumItem(5, "23CSE304", "Embedded Systems", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(5, "23PE502", "Professional Elective II", 3, 0, 0, 3, CourseType.elective, required=False),
    CurriculumItem(5, "23LSE301", "Life Skills for Engineers III", 1, 0, 2, 2, CourseType.theory),
    CurriculumItem(5, "23ENV300", "Environmental Science", 2, 0, 0, 0, CourseType.theory),
    CurriculumItem(5, "23LIV390", "Live-in-Labs I (Optional)", 3, 0, 0, 3, CourseType.elective, required=False, optional=True),
    CurriculumItem(6, "23CSE311", "Software Engineering", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(6, "23CSE312", "Distributed Systems", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(6, "23CSE313", "Foundations of Cyber Security", 3, 0, 0, 3, CourseType.theory),
    CurriculumItem(6, "23PE603", "Professional Elective III", 3, 0, 0, 3, CourseType.elective, required=False),
    CurriculumItem(6, "23CSE314", "Compiler Design", 3, 0, 2, 4, CourseType.theory),
    CurriculumItem(6, "23CSE399", "Project Phase-I", 0, 0, 6, 3, CourseType.lab),
    CurriculumItem(6, "23LSE311", "Life Skills for Engineers IV", 1, 0, 2, 2, CourseType.theory),
    CurriculumItem(6, "23LIV490", "Live-in-Labs II (Optional)", 3, 0, 0, 3, CourseType.elective, required=False, optional=True),
    CurriculumItem(7, "23PE704", "Professional Elective IV", 3, 0, 0, 3, CourseType.elective, required=False),
    CurriculumItem(7, "23PE705", "Professional Elective V", 3, 0, 0, 3, CourseType.elective, required=False),
    CurriculumItem(7, "23PE706", "Professional Elective VI", 3, 0, 0, 3, CourseType.elective, required=False),
    CurriculumItem(7, "23FRE702", "Free Elective II", 2, 0, 0, 2, CourseType.elective, required=False),
    CurriculumItem(7, "23CSE401", "Fundamentals of Artificial Intelligence", 2, 0, 2, 3, CourseType.theory),
    CurriculumItem(7, "23CSE498", "Project - Phase II", 0, 0, 12, 6, CourseType.lab),
    CurriculumItem(7, "23LAW300", "Indian Constitution", 2, 0, 0, 0, CourseType.theory),
    CurriculumItem(8, "23CSE499", "Project - Phase III", 0, 0, 12, 6, CourseType.lab),
]


def normalize_email(value: str) -> str:
    return value.strip().lower()


def canonical_name(value: str) -> str:
    lowered = value.lower()
    lowered = lowered.replace("(col.)", " ")
    lowered = re.sub(r"\bdr\b\.?", " ", lowered)
    lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
    return " ".join(lowered.split())


def slugify_name(value: str) -> str:
    canonical = canonical_name(value)
    return canonical.replace(" ", ".")


def term_to_batch_year(term_number: int) -> int:
    return min(4, max(1, (term_number + 1) // 2))


def pick_mock_email(name: str, used_emails: set[str]) -> str:
    base = slugify_name(name) or "faculty"
    candidate = f"{base}@{MOCK_EMAIL_DOMAIN}"
    index = 2
    while candidate in used_emails:
        candidate = f"{base}{index}@{MOCK_EMAIL_DOMAIN}"
        index += 1
    used_emails.add(candidate)
    return candidate


def build_room_availability() -> list[dict]:
    return [
        {"day": day, "start_time": "08:50", "end_time": "16:35"}
        for day in WORKING_DAYS
    ]


def resolve_hour_split(item: CurriculumItem) -> tuple[int, int, int, int, int]:
    if item.course_type == CourseType.lab:
        raw_hours = max(2, item.l + item.t + item.p)
        if raw_hours % 2 != 0:
            raw_hours += 1
        return 0, raw_hours, 0, raw_hours, 2

    theory_hours = max(0, item.l)
    tutorial_hours = max(0, item.t + item.p)
    weekly_hours = theory_hours + tutorial_hours
    if weekly_hours <= 0:
        weekly_hours = max(1, item.credits if item.credits > 0 else 1)
        theory_hours = weekly_hours
        tutorial_hours = 0
    return theory_hours, 0, tutorial_hours, weekly_hours, 1


def upsert_user(
    session,
    *,
    name: str,
    email: str,
    role: UserRole,
    department: str | None,
    section_name: str | None,
) -> User:
    normalized_email = normalize_email(email)
    existing = session.execute(
        select(User).where(func.lower(User.email) == normalized_email)
    ).scalar_one_or_none()

    hashed_password = get_password_hash(DEFAULT_PASSWORD)
    if existing is None:
        existing = User(
            name=name,
            email=normalized_email,
            hashed_password=hashed_password,
            role=role,
            department=department,
            section_name=section_name if role == UserRole.student else None,
            is_active=True,
        )
        session.add(existing)
    else:
        existing.name = name
        existing.role = role
        existing.department = department
        existing.section_name = section_name if role == UserRole.student else None
        existing.is_active = True
        if RESET_PASSWORDS:
            existing.hashed_password = hashed_password
    session.flush()
    return existing


def upsert_faculty(
    session,
    *,
    name: str,
    designation: str,
    email: str,
    preferred_subject_codes: list[str],
    semester_preferences: dict[str, list[str]],
) -> Faculty:
    normalized_email = normalize_email(email)
    existing = session.execute(
        select(Faculty).where(func.lower(Faculty.email) == normalized_email)
    ).scalar_one_or_none()
    if existing is None:
        existing = session.execute(
            select(Faculty).where(func.lower(Faculty.name) == name.lower())
        ).scalar_one_or_none()

    max_hours = constrained_max_hours(designation, None)
    availability_windows = build_room_availability()

    if existing is None:
        existing = Faculty(
            name=name,
            designation=designation,
            email=normalized_email,
            department=DEPARTMENT,
            workload_hours=0,
            max_hours=max_hours,
            availability=WORKING_DAYS,
            availability_windows=availability_windows,
            avoid_back_to_back=False,
            preferred_min_break_minutes=0,
            preference_notes="Seeded faculty profile",
            preferred_subject_codes=preferred_subject_codes,
            semester_preferences=semester_preferences,
        )
        session.add(existing)
    else:
        existing.name = name
        existing.designation = designation
        existing.email = normalized_email
        existing.department = DEPARTMENT
        existing.max_hours = max_hours
        existing.availability = WORKING_DAYS
        existing.availability_windows = availability_windows
        existing.avoid_back_to_back = False
        existing.preferred_min_break_minutes = 0
        existing.preferred_subject_codes = preferred_subject_codes
        existing.semester_preferences = semester_preferences
    session.flush()
    return existing


def upsert_program(session) -> Program:
    program = session.execute(
        select(Program).where(Program.code == PROGRAM_CODE)
    ).scalar_one_or_none()
    if program is None:
        program = Program(
            name=PROGRAM_NAME,
            code=PROGRAM_CODE,
            department=DEPARTMENT,
            degree=ProgramDegree.BS,
            duration_years=4,
            sections=8,
            total_students=32 * 65,
        )
        session.add(program)
    else:
        program.name = PROGRAM_NAME
        program.department = DEPARTMENT
        program.degree = ProgramDegree.BS
        program.duration_years = 4
        program.sections = 8
        program.total_students = 32 * 65
    session.flush()
    return program


def upsert_terms_and_sections(session, program: Program) -> dict[int, ProgramTerm]:
    terms: dict[int, ProgramTerm] = {}
    for term_number in range(1, 9):
        term = session.execute(
            select(ProgramTerm).where(
                ProgramTerm.program_id == program.id,
                ProgramTerm.term_number == term_number,
            )
        ).scalar_one_or_none()
        term_name = f"Semester {term_number}"
        credits_required = TERM_CREDIT_TARGETS.get(term_number, 0)
        if term is None:
            term = ProgramTerm(
                program_id=program.id,
                term_number=term_number,
                name=term_name,
                credits_required=credits_required,
            )
            session.add(term)
        else:
            term.name = term_name
            term.credits_required = credits_required
        terms[term_number] = term

        for section_name in SECTION_NAMES:
            section = session.execute(
                select(ProgramSection).where(
                    ProgramSection.program_id == program.id,
                    ProgramSection.term_number == term_number,
                    ProgramSection.name == section_name,
                )
            ).scalar_one_or_none()
            if section is None:
                section = ProgramSection(
                    program_id=program.id,
                    term_number=term_number,
                    name=section_name,
                    capacity=65,
                )
                session.add(section)
            else:
                section.capacity = 65
    session.flush()
    return terms


def upsert_institution_settings(session) -> None:
    record = session.get(InstitutionSettings, 1)
    working_hours = [
        {"day": day, "start_time": "08:50", "end_time": "16:35", "enabled": day in WORKING_DAYS}
        for day in ALL_DAYS
    ]
    break_windows = [
        {"name": "Short Break", "start_time": "10:30", "end_time": "10:45"},
        {"name": "Lunch Break", "start_time": "12:25", "end_time": "13:15"},
    ]
    if record is None:
        record = InstitutionSettings(
            id=1,
            working_hours=working_hours,
            period_minutes=50,
            lab_contiguous_slots=2,
            break_windows=break_windows,
            academic_year=ACADEMIC_YEAR,
            semester_cycle=SEMESTER_CYCLE,
        )
        session.add(record)
    else:
        record.working_hours = working_hours
        record.period_minutes = 50
        record.lab_contiguous_slots = 2
        record.break_windows = break_windows
        record.academic_year = ACADEMIC_YEAR
        record.semester_cycle = SEMESTER_CYCLE


def upsert_semester_constraints(session) -> None:
    for term_number in range(1, 9):
        constraint = session.execute(
            select(SemesterConstraint).where(SemesterConstraint.term_number == term_number)
        ).scalar_one_or_none()
        values = {
            "earliest_start_time": "08:50",
            "latest_end_time": "16:35",
            "max_hours_per_day": 8,
            "max_hours_per_week": 40,
            "min_break_minutes": 0,
            "max_consecutive_hours": 4,
        }
        if constraint is None:
            constraint = SemesterConstraint(term_number=term_number, **values)
            session.add(constraint)
        else:
            for key, value in values.items():
                setattr(constraint, key, value)


def upsert_rooms(session) -> None:
    floor_labels = {
        1: "Ground Floor",
        2: "First Floor",
        3: "Second Floor",
        4: "Third Floor",
    }
    room_availability = build_room_availability()
    for floor in range(1, 5):
        for wing in ["A", "B", "C", "D"]:
            for index in range(1, 4):
                room_name = f"{wing}{floor}0{index}"
                room = session.execute(
                    select(Room).where(Room.name == room_name)
                ).scalar_one_or_none()
                capacity = [60, 65, 70][index - 1]
                if room is None:
                    room = Room(
                        name=room_name,
                        building=f"Academic Block - {floor_labels[floor]}",
                        capacity=capacity,
                        type=RoomType.lecture,
                        has_lab_equipment=False,
                        has_projector=True,
                        availability_windows=room_availability,
                    )
                    session.add(room)
                else:
                    room.building = f"Academic Block - {floor_labels[floor]}"
                    room.capacity = capacity
                    room.type = RoomType.lecture
                    room.has_lab_equipment = False
                    room.has_projector = True
                    room.availability_windows = room_availability

    for index in range(1, 6):
        room_name = f"LAB-{index}"
        room = session.execute(
            select(Room).where(Room.name == room_name)
        ).scalar_one_or_none()
        if room is None:
            room = Room(
                name=room_name,
                building="Academic Block - Laboratory Wing",
                capacity=70,
                type=RoomType.lab,
                has_lab_equipment=True,
                has_projector=True,
                availability_windows=room_availability,
            )
            session.add(room)
        else:
            room.building = "Academic Block - Laboratory Wing"
            room.capacity = 70
            room.type = RoomType.lab
            room.has_lab_equipment = True
            room.has_projector = True
            room.availability_windows = room_availability


def build_default_preferences() -> tuple[list[str], dict[str, int]]:
    preferred_pool: list[str] = []
    term_by_code: dict[str, int] = {}
    for item in CURRICULUM:
        if item.optional:
            continue
        term_by_code[item.code] = item.term
        if item.credits > 0 and item.course_type != CourseType.lab:
            preferred_pool.append(item.code)
    return preferred_pool, term_by_code


def upsert_courses_and_mappings(session, program: Program, faculty_by_key: dict[str, Faculty]) -> None:
    real_teacher_key = canonical_name(REAL_TEACHER_PROFILE["name"])
    real_teacher = faculty_by_key.get(real_teacher_key)
    preferred_real_codes = {code.upper() for code in REAL_TEACHER_PROFILE["preferred_subject_codes"]}

    for item in CURRICULUM:
        theory_hours, lab_hours, tutorial_hours, hours_per_week, duration_hours = resolve_hour_split(item)
        faculty_id = real_teacher.id if real_teacher and item.code.upper() in preferred_real_codes else None
        course = session.execute(
            select(Course).where(Course.code == item.code)
        ).scalar_one_or_none()
        if course is None:
            course = Course(
                code=item.code,
                name=item.name,
                type=item.course_type,
                credits=item.credits,
                duration_hours=duration_hours,
                sections=len(SECTION_NAMES),
                hours_per_week=hours_per_week,
                semester_number=item.term,
                batch_year=term_to_batch_year(item.term),
                theory_hours=theory_hours,
                lab_hours=lab_hours,
                tutorial_hours=tutorial_hours,
                faculty_id=faculty_id,
            )
            session.add(course)
        else:
            course.name = item.name
            course.type = item.course_type
            course.credits = item.credits
            course.duration_hours = duration_hours
            course.sections = len(SECTION_NAMES)
            course.hours_per_week = hours_per_week
            course.semester_number = item.term
            course.batch_year = term_to_batch_year(item.term)
            course.theory_hours = theory_hours
            course.lab_hours = lab_hours
            course.tutorial_hours = tutorial_hours
            course.faculty_id = faculty_id
        session.flush()

        mapping = session.execute(
            select(ProgramCourse).where(
                ProgramCourse.program_id == program.id,
                ProgramCourse.term_number == item.term,
                ProgramCourse.course_id == course.id,
            )
        ).scalar_one_or_none()
        required = item.required and not item.optional
        if mapping is None:
            mapping = ProgramCourse(
                program_id=program.id,
                term_number=item.term,
                course_id=course.id,
                is_required=required,
                lab_batch_count=2 if item.course_type == CourseType.lab else 1,
                allow_parallel_batches=True,
                prerequisite_course_ids=[],
            )
            session.add(mapping)
        else:
            mapping.is_required = required
            mapping.lab_batch_count = 2 if item.course_type == CourseType.lab else 1
            mapping.allow_parallel_batches = True
            if mapping.prerequisite_course_ids is None:
                mapping.prerequisite_course_ids = []


def seed_faculty_and_faculty_users(session) -> dict[str, Faculty]:
    used_emails = {normalize_email(ADMIN_PROFILE["email"]), normalize_email(REAL_STUDENT_PROFILE["email"])}
    preferred_pool, term_by_code = build_default_preferences()
    faculty_by_key: dict[str, Faculty] = {}
    real_teacher_key = canonical_name(REAL_TEACHER_PROFILE["name"])

    for index, (raw_name, designation) in enumerate(FACULTY_DESIGNATIONS):
        key = canonical_name(raw_name)
        if key == real_teacher_key:
            name = REAL_TEACHER_PROFILE["name"]
            email = normalize_email(REAL_TEACHER_PROFILE["email"])
            preferred_codes = list(REAL_TEACHER_PROFILE["preferred_subject_codes"])
            semester_preferences = {
                semester: list(codes)
                for semester, codes in REAL_TEACHER_PROFILE["semester_preferences"].items()
            }
            used_emails.add(email)
        else:
            name = raw_name
            email = pick_mock_email(name, used_emails)
            if preferred_pool:
                start = (index * 3) % len(preferred_pool)
                selected = [preferred_pool[(start + offset) % len(preferred_pool)] for offset in range(3)]
                preferred_codes = list(dict.fromkeys(code.upper() for code in selected))
            else:
                preferred_codes = []
            semester_preferences: dict[str, list[str]] = {}
            for code in preferred_codes:
                term = term_by_code.get(code)
                if term is None:
                    continue
                semester_preferences.setdefault(str(term), []).append(code)

        faculty = upsert_faculty(
            session,
            name=name,
            designation=designation,
            email=email,
            preferred_subject_codes=preferred_codes,
            semester_preferences=semester_preferences,
        )
        upsert_user(
            session,
            name=name,
            email=email,
            role=UserRole.faculty,
            department=DEPARTMENT,
            section_name=None,
        )
        faculty_by_key[key] = faculty

    return faculty_by_key


def seed_admin_and_students(session) -> None:
    upsert_user(
        session,
        name=ADMIN_PROFILE["name"],
        email=ADMIN_PROFILE["email"],
        role=ADMIN_PROFILE["role"],
        department=ADMIN_PROFILE["department"],
        section_name=ADMIN_PROFILE["section_name"],
    )

    upsert_user(
        session,
        name=REAL_STUDENT_PROFILE["name"],
        email=REAL_STUDENT_PROFILE["email"],
        role=REAL_STUDENT_PROFILE["role"],
        department=REAL_STUDENT_PROFILE["department"],
        section_name=REAL_STUDENT_PROFILE["section_name"],
    )

    for section in SECTION_NAMES:
        for index in range(1, 3):
            upsert_user(
                session,
                name=f"Mock Student {section}{index}",
                email=f"student.{section.lower()}{index}@{MOCK_EMAIL_DOMAIN}",
                role=UserRole.student,
                department=DEPARTMENT,
                section_name=section,
            )


def ensure_all_faculty_have_users(session) -> None:
    for faculty in session.execute(select(Faculty)).scalars():
        upsert_user(
            session,
            name=faculty.name,
            email=faculty.email,
            role=UserRole.faculty,
            department=faculty.department,
            section_name=None,
        )


def count_by_role(session) -> dict[str, int]:
    rows = session.execute(
        select(User.role, func.count(User.id)).group_by(User.role)
    ).all()
    return {role.value: int(count) for role, count in rows}


def main() -> None:
    ensure_runtime_schema_compatibility()
    with SessionLocal() as session:
        program = upsert_program(session)
        upsert_terms_and_sections(session, program)
        upsert_institution_settings(session)
        upsert_semester_constraints(session)
        upsert_rooms(session)

        faculty_by_key = seed_faculty_and_faculty_users(session)
        seed_admin_and_students(session)
        upsert_courses_and_mappings(session, program, faculty_by_key)
        ensure_all_faculty_have_users(session)

        session.commit()

        role_counts = count_by_role(session)
        faculty_count = session.execute(select(func.count(Faculty.id))).scalar_one()
        course_count = session.execute(select(func.count(Course.id))).scalar_one()
        room_count = session.execute(select(func.count(Room.id))).scalar_one()
        section_count = session.execute(select(func.count(ProgramSection.id))).scalar_one()
        mapping_count = session.execute(select(func.count(ProgramCourse.id))).scalar_one()

    print("University data seeded successfully.")
    print("")
    print(f"Program: {PROGRAM_NAME} ({PROGRAM_CODE})")
    print(f"Faculty records: {faculty_count}")
    print(f"Course records: {course_count}")
    print(f"Rooms (classrooms + labs): {room_count}")
    print(f"Program sections: {section_count}")
    print(f"Program-course mappings: {mapping_count}")
    print(f"User counts by role: {role_counts}")
    print("")
    print("Login credentials for seeded users (all use same password):")
    print(f"  Password: {DEFAULT_PASSWORD}")
    print(f"  Admin:   {ADMIN_PROFILE['email']}")
    print(f"  Teacher: {REAL_TEACHER_PROFILE['email']}")
    print(f"  Student: {REAL_STUDENT_PROFILE['email']}")


if __name__ == "__main__":
    main()
