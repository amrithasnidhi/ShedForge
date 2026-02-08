"""Seed ShedForge with university data for CSE timetable planning.

Run:
  PYTHONPATH=backend python scripts/seed_university_data.py
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable

from sqlalchemy import select

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.course import Course, CourseType
from app.models.faculty import Faculty
from app.models.institution_settings import InstitutionSettings
from app.models.program import Program, ProgramDegree
from app.models.program_structure import ProgramCourse, ProgramSection, ProgramTerm
from app.models.room import Room, RoomType
from app.models.semester_constraint import SemesterConstraint
from app.models.user import User, UserRole

DEPARTMENT = "Computer Science and Engineering"
WEEKDAY_AVAILABILITY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]


@dataclass(frozen=True)
class FacultySeed:
    name: str
    designation: str


FACULTY_SEED: list[FacultySeed] = [
    FacultySeed("Dr. Vidhya Balasubramanian", "Principal, Professor"),
    FacultySeed("Dr. Bagavathi Sivakumar P.", "Chairperson, Associate Professor"),
    FacultySeed("Dr. Harini N.", "Vice Chairperson, Associate Professor"),
    FacultySeed("Dr. R. Karthi", "Vice Chairperson, Associate Professor"),
    FacultySeed("Dr. Raghesh Krishnan K.", "Vice Chairperson, Assistant Professor (Sl. Gd.)"),
    FacultySeed("Dr. Shunmuga Velayutham C.", "Professor"),
    FacultySeed("Dr. Jeyakumar G.", "Professor"),
    FacultySeed("Dr. (Col.) Kumar P. N.", "Professor"),
    FacultySeed("Dr. Radhika N.", "Professor"),
    FacultySeed("Dr. Rajathilagam B.", "Principal"),
    FacultySeed("Dr. Anantha Narayanan V.", "Associate Professor"),
    FacultySeed("Dr. Gireeshkumar T.", "Professor"),
    FacultySeed("Dr. Gowtham R.", "Associate Professor, Research Head"),
    FacultySeed("Dr. Lalithamani N.", "Associate Professor"),
    FacultySeed("Dr. Padmavathi S.", "Associate Professor"),
    FacultySeed("Dr. Senthilkumar M.", "Associate Professor"),
    FacultySeed("Dr. Senthil Kumar T.", "Professor"),
    FacultySeed("Dr. Swapna T. R.", "Associate Professor"),
    FacultySeed("Dr. Thangavelu S.", "Associate Professor"),
    FacultySeed("Dr. Venkataraman D.", "Associate Professor"),
    FacultySeed("Dr. Aarthi R.", "Assistant Professor (Sl. Gd.)"),
    FacultySeed("Dr. Anbazhagan M.", "Assistant Professor (Sl. Gd.)"),
    FacultySeed("Dr. Bagyammal T.", "Assistant Professor (Sl. Gd.)"),
    FacultySeed("Dr. Dhanya M. Dhanalakshmy", "Assistant Professor (Sl. Gd.)"),
    FacultySeed("Dr. Govindarajan J.", "Assistant Professor (Sl. Gd.)"),
    FacultySeed("Dr. Prathilothamai M.", "Assistant Professor (Sl. Gd.)"),
    FacultySeed("Dr. T. Ramraj", "Assistant Professor (Sl. Gd.)"),
    FacultySeed("Dr. Ritwik M.", "Assistant Professor (Sl. Gd.)"),
    FacultySeed("Dr. Sabarish B. A.", "Assistant Professor (Sl. Gd.)"),
    FacultySeed("Dr. Shanmuga Priya S.", "Assistant Professor (Sl. Gd.)"),
    FacultySeed("Nalinadevi K.", "Assistant Professor (Sl. Gd.)"),
    FacultySeed("Dr. Bagavathi C.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Dr. T. Deepika", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Dr. Remyakrishnan P.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Dr. J.Uma", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Abirami K.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Anisha Radhakrishnan", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Baskar A.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Bharathi D.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Bindu K. R.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Dayanand V.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Malathi P.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Manjusha R.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Radhika G.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Ramya G. R.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Sathiya R. R.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Suchithra M.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Sujee R.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Sumesh A. K.", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Anupa Vijai", "Assistant Professor (Sr. Gd.)"),
    FacultySeed("Dr. Anuragi Arti Narayandas", "Assistant Professor"),
    FacultySeed("Dr Sruthi C J", "Assistant Professor"),
    FacultySeed("Dr. S.Vishnu", "Assistant Professor"),
    FacultySeed("Dr. Vishnuvarthan R", "Assistant Professor"),
    FacultySeed("Neethu MR", "Assistant Professor"),
    FacultySeed("Dr. Vandhana S.", "Assistant Professor"),
    FacultySeed("Divya Singh", "Assistant Professor"),
    FacultySeed("Rajeshwar Yadav", "Assistant Professor"),
    FacultySeed("Dr. Jayakrishnan Anandakrishnan", "Assistant Professor"),
    FacultySeed("Subathra P.", "Assistant Professor (OC)"),
    FacultySeed("Rahul Pawar", "Assistant Professor (OC)"),
    FacultySeed("Sriram S.", "Assistant Professor (OC)"),
    FacultySeed("Vedaj J Padman", "Assistant Professor (OC)"),
    FacultySeed("Krishna Priya G.", "Assistant Professor (OC)"),
    FacultySeed("Arjun P.K", "Assistant Professor (OC)"),
    FacultySeed("Rohini S", "Assistant Professor (OC)"),
]


SEMESTER_COURSES: dict[int, list[tuple[str, str, int, str]]] = {
    1: [
        ("23ENG101", "Technical Communication", 3, "theory"),
        ("23MAT107", "Calculus", 4, "theory"),
        ("23CSE101", "Computational Problem Solving", 4, "theory"),
        ("23EEE104", "Introduction to Electrical and Electronics Engineering", 3, "theory"),
        ("23EEE184", "Basic Electrical and Electronics Engineering Practice", 1, "lab"),
        ("23CSE102", "Computer Hardware Essentials", 2, "lab"),
        ("22ADM101", "Foundations of Indian Heritage", 2, "theory"),
        ("22AVP103", "Mastery Over Mind", 2, "theory"),
    ],
    2: [
        ("23MAT116", "Discrete Mathematics", 4, "theory"),
        ("23MAT117", "Linear Algebra", 4, "theory"),
        ("23CSE111", "Object Oriented Programming", 4, "theory"),
        ("23PHY115", "Modern Physics", 3, "theory"),
        ("23CSE113", "User Interface Design", 3, "theory"),
        ("23MEE115", "Manufacturing Practice", 1, "lab"),
        ("22ADM111", "Glimpses of Glorious India", 2, "theory"),
    ],
    3: [
        ("23MAT206", "Optimization Techniques", 4, "theory"),
        ("23ECE205", "Digital Electronics", 3, "theory"),
        ("23CSE201", "Procedural Programming using C", 4, "theory"),
        ("23CSE202", "Database Management Systems", 4, "theory"),
        ("23CSE203", "Data Structures and Algorithms", 5, "theory"),
        ("23ECE285", "Digital Electronics Laboratory", 1, "lab"),
        ("23LSE201", "Life Skills for Engineers I", 0, "theory"),
        ("23AVP201", "Amrita Value Programme I", 1, "theory"),
    ],
    4: [
        ("23MAT216", "Probability and Random Processes", 4, "theory"),
        ("23CSE211", "Design and Analysis of Algorithms", 4, "theory"),
        ("23CSE212", "Principles of Functional Languages", 3, "theory"),
        ("23CSE213", "Computer Organization and Architecture", 4, "theory"),
        ("23CSE214", "Operating Systems", 4, "theory"),
        ("23AVP202", "Amrita Value Programme II", 1, "theory"),
        ("23FE401", "Free Elective I", 2, "elective"),
        ("23LSE211", "Life Skills for Engineers II", 2, "theory"),
    ],
    5: [
        ("23CSE301", "Machine Learning", 4, "theory"),
        ("23PE501", "Professional Elective I", 3, "elective"),
        ("23CSE302", "Computer Networks", 5, "theory"),
        ("23CSE303", "Theory of Computation", 4, "theory"),
        ("23CSE304", "Embedded Systems", 4, "theory"),
        ("23PE502", "Professional Elective II", 3, "elective"),
        ("23LSE301", "Life Skills for Engineers III", 2, "theory"),
        ("23ENV300", "Environmental Science", 0, "theory"),
        ("23LIV390", "Live-in-Labs I", 3, "elective"),
    ],
    6: [
        ("23CSE311", "Software Engineering", 4, "theory"),
        ("23CSE312", "Distributed Systems", 4, "theory"),
        ("23CSE313", "Foundations of Cyber Security", 3, "theory"),
        ("23PE603", "Professional Elective III", 3, "elective"),
        ("23CSE314", "Compiler Design", 4, "theory"),
        ("23CSE399", "Project Phase-I", 3, "elective"),
        ("23LSE311", "Life Skills for Engineers IV", 2, "theory"),
        ("23LIV490", "Live-in-Labs II", 3, "elective"),
    ],
    7: [
        ("23PE701", "Professional Elective IV", 3, "elective"),
        ("23PE702", "Professional Elective V", 3, "elective"),
        ("23PE703", "Professional Elective VI", 3, "elective"),
        ("23FE702", "Free Elective II", 2, "elective"),
        ("23CSE401", "Fundamentals of Artificial Intelligence", 3, "theory"),
        ("23CSE498", "Project Phase II", 6, "elective"),
        ("23LAW300", "Indian Constitution", 0, "theory"),
    ],
    8: [
        ("23CSE499", "Project Phase III", 6, "elective"),
    ],
}


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", ".", value.strip().lower()).strip(".")
    cleaned = re.sub(r"\.+", ".", cleaned)
    return cleaned


def unique_email(base: str, taken: set[str]) -> str:
    if base not in taken:
        taken.add(base)
        return base
    i = 2
    while True:
        candidate = base.replace("@", f".{i}@")
        if candidate not in taken:
            taken.add(candidate)
            return candidate
        i += 1


def iter_faculty_ids(faculty_ids: list[str]) -> Iterable[str]:
    idx = 0
    while True:
        yield faculty_ids[idx % len(faculty_ids)]
        idx += 1


def ensure_admin(session) -> None:
    email = "admin@shedforge.local"
    existing = session.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing is not None:
        return
    admin = User(
        name="ShedForge Admin",
        email=email,
        hashed_password=get_password_hash("admin12345"),
        role=UserRole.admin,
        department=DEPARTMENT,
    )
    session.add(admin)


def seed_faculty(session) -> list[Faculty]:
    existing = list(session.execute(select(Faculty)).scalars())
    by_name = {item.name.lower(): item for item in existing}
    email_taken = {item.email for item in existing}

    seeded: list[Faculty] = []
    for row in FACULTY_SEED:
        found = by_name.get(row.name.lower())
        if found is None:
            email_local = slugify(row.name)
            email = unique_email(f"{email_local}@amrita.edu", email_taken)
            found = Faculty(
                name=row.name,
                designation=row.designation,
                email=email,
                department=DEPARTMENT,
                workload_hours=0,
                max_hours=20,
                availability=WEEKDAY_AVAILABILITY,
                availability_windows=[],
                avoid_back_to_back=False,
                preferred_min_break_minutes=0,
                preference_notes=None,
            )
            session.add(found)
        else:
            found.designation = row.designation
            found.department = found.department or DEPARTMENT
            if not found.availability:
                found.availability = WEEKDAY_AVAILABILITY
        seeded.append(found)
    return seeded


def seed_rooms(session) -> None:
    existing_rooms = {room.name: room for room in session.execute(select(Room)).scalars()}

    for floor in [1, 2, 3, 4]:
        for series in ["A", "B", "C", "D"]:
            for offset in [1, 2, 3]:
                room_name = f"{series}{floor}0{offset}"
                room = existing_rooms.get(room_name)
                if room is None:
                    room = Room(
                        name=room_name,
                        building="CSE Block",
                        capacity=65,
                        type=RoomType.lecture,
                        has_lab_equipment=False,
                        has_projector=True,
                        availability_windows=[],
                    )
                    session.add(room)
                else:
                    room.capacity = max(room.capacity, 60)
                    room.type = RoomType.lecture

    for idx in range(1, 6):
        room_name = f"LAB-{idx}"
        room = existing_rooms.get(room_name)
        if room is None:
            room = Room(
                name=room_name,
                building="CSE Block",
                capacity=70,
                type=RoomType.lab,
                has_lab_equipment=True,
                has_projector=True,
                availability_windows=[],
            )
            session.add(room)
        else:
            room.capacity = max(room.capacity, 70)
            room.type = RoomType.lab
            room.has_lab_equipment = True


def derive_hours_per_week(credits: int, session_type: str) -> int:
    if session_type == "lab":
        return 2
    if credits <= 0:
        return 1
    return max(1, min(6, credits))


def seed_program_and_courses(session, faculty_ids: list[str]) -> None:
    program = session.execute(select(Program).where(Program.code == "CSE")).scalar_one_or_none()
    if program is None:
        program = Program(
            name="B.Tech Computer Science and Engineering",
            code="CSE",
            department=DEPARTMENT,
            degree=ProgramDegree.BS,
            duration_years=4,
            sections=8,
            total_students=8 * 65,
        )
        session.add(program)
        session.flush()

    faculty_cycle = iter_faculty_ids(faculty_ids)
    existing_courses = {course.code: course for course in session.execute(select(Course)).scalars()}

    for term_number, course_rows in SEMESTER_COURSES.items():
        term = (
            session.execute(
                select(ProgramTerm).where(
                    ProgramTerm.program_id == program.id,
                    ProgramTerm.term_number == term_number,
                )
            )
            .scalars()
            .first()
        )
        credits_required = sum(max(0, credits) for _, _, credits, _ in course_rows)
        if term is None:
            term = ProgramTerm(
                program_id=program.id,
                term_number=term_number,
                name=f"Semester {term_number}",
                credits_required=credits_required,
            )
            session.add(term)
        else:
            term.credits_required = credits_required

        for section_name in ["A", "B", "C", "D", "E", "F", "G", "H"]:
            section = (
                session.execute(
                    select(ProgramSection).where(
                        ProgramSection.program_id == program.id,
                        ProgramSection.term_number == term_number,
                        ProgramSection.name == section_name,
                    )
                )
                .scalars()
                .first()
            )
            if section is None:
                session.add(
                    ProgramSection(
                        program_id=program.id,
                        term_number=term_number,
                        name=section_name,
                        capacity=65,
                    )
                )

        for code, name, credits, session_type in course_rows:
            course = existing_courses.get(code)
            faculty_id = next(faculty_cycle)
            course_type = CourseType(session_type)
            hours_per_week = derive_hours_per_week(credits, session_type)
            duration_hours = 2 if session_type == "lab" else 1
            if course is None:
                course = Course(
                    code=code,
                    name=name,
                    type=course_type,
                    credits=max(0, credits),
                    duration_hours=duration_hours,
                    sections=8,
                    hours_per_week=hours_per_week,
                    faculty_id=faculty_id,
                )
                session.add(course)
                session.flush()
                existing_courses[code] = course
            else:
                course.name = name
                course.type = course_type
                course.credits = max(0, credits)
                course.duration_hours = duration_hours
                course.sections = 8
                course.hours_per_week = hours_per_week
                course.faculty_id = course.faculty_id or faculty_id

            mapping = (
                session.execute(
                    select(ProgramCourse).where(
                        ProgramCourse.program_id == program.id,
                        ProgramCourse.term_number == term_number,
                        ProgramCourse.course_id == course.id,
                    )
                )
                .scalars()
                .first()
            )
            if mapping is None:
                session.add(
                    ProgramCourse(
                        program_id=program.id,
                        term_number=term_number,
                        course_id=course.id,
                        is_required=True,
                        lab_batch_count=2 if course_type == CourseType.lab else 1,
                        allow_parallel_batches=True,
                    )
                )
            else:
                mapping.is_required = True
                mapping.lab_batch_count = 2 if course_type == CourseType.lab else 1
                mapping.allow_parallel_batches = True


def seed_institution_settings(session) -> None:
    settings = session.get(InstitutionSettings, 1)
    working_hours = [
        {"day": "Monday", "start_time": "08:50", "end_time": "16:35", "enabled": True},
        {"day": "Tuesday", "start_time": "08:50", "end_time": "16:35", "enabled": True},
        {"day": "Wednesday", "start_time": "08:50", "end_time": "16:35", "enabled": True},
        {"day": "Thursday", "start_time": "08:50", "end_time": "16:35", "enabled": True},
        {"day": "Friday", "start_time": "08:50", "end_time": "16:35", "enabled": True},
        {"day": "Saturday", "start_time": "08:50", "end_time": "16:35", "enabled": False},
        {"day": "Sunday", "start_time": "08:50", "end_time": "16:35", "enabled": False},
    ]
    breaks = [
        {"name": "Short Break", "start_time": "10:30", "end_time": "10:45"},
        {"name": "Lunch Break", "start_time": "12:25", "end_time": "13:15"},
    ]

    if settings is None:
        settings = InstitutionSettings(
            id=1,
            working_hours=working_hours,
            period_minutes=50,
            lab_contiguous_slots=2,
            break_windows=breaks,
        )
        session.add(settings)
    else:
        settings.working_hours = working_hours
        settings.period_minutes = 50
        settings.lab_contiguous_slots = 2
        settings.break_windows = breaks


def seed_semester_constraints(session) -> None:
    for term_number in range(1, 9):
        record = (
            session.execute(select(SemesterConstraint).where(SemesterConstraint.term_number == term_number))
            .scalars()
            .first()
        )
        if record is None:
            record = SemesterConstraint(
                term_number=term_number,
                earliest_start_time="08:50",
                latest_end_time="16:35",
                max_hours_per_day=6,
                max_hours_per_week=30,
                min_break_minutes=0,
                max_consecutive_hours=3,
            )
            session.add(record)
        else:
            record.earliest_start_time = "08:50"
            record.latest_end_time = "16:35"
            record.max_hours_per_day = 6
            record.max_hours_per_week = 30
            record.min_break_minutes = 0
            record.max_consecutive_hours = 3


def main() -> None:
    session = SessionLocal()
    try:
        ensure_admin(session)
        faculties = seed_faculty(session)
        session.flush()

        faculty_ids = [item.id for item in faculties if item.id]
        if not faculty_ids:
            raise RuntimeError("Failed to create faculty seed data")

        seed_rooms(session)
        seed_program_and_courses(session, faculty_ids)
        seed_institution_settings(session)
        seed_semester_constraints(session)

        session.commit()
        print("University data seeding completed successfully.")
        print(f"Faculty records: {len(faculties)}")
        print("Program: B.Tech Computer Science and Engineering (CSE)")
        print("Infrastructure: 48 classrooms + 5 labs")
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
