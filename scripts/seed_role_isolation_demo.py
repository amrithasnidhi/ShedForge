"""Seed temporary demo accounts and an official timetable for role-isolation checks.

Run:
  PYTHONPATH=backend python scripts/seed_role_isolation_demo.py
"""

from __future__ import annotations

import os
from typing import Iterable

from sqlalchemy import select

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.faculty import Faculty
from app.models.timetable import OfficialTimetable
from app.models.user import User, UserRole

DEFAULT_PASSWORD = os.getenv("DEMO_PASSWORD", "DemoPass123!")
DEPARTMENT = "CSE"
WEEKDAY_AVAILABILITY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]


def _env_email(key: str, default: str) -> str:
    value = os.getenv(key, "").strip()
    return value or default


DEMO_ACCOUNTS = {
    "admin": {
        "name": "Demo Admin",
        "email": _env_email("DEMO_ADMIN_EMAIL", "shedforgebusiness+admin.demo@gmail.com"),
        "role": UserRole.admin,
        "department": "Administration",
        "section_name": None,
    },
    "faculty_1": {
        "name": "Demo Faculty One",
        "email": _env_email("DEMO_FACULTY1_EMAIL", "shedforgebusiness+faculty1.demo@gmail.com"),
        "role": UserRole.faculty,
        "department": DEPARTMENT,
        "section_name": None,
    },
    "faculty_2": {
        "name": "Demo Faculty Two",
        "email": _env_email("DEMO_FACULTY2_EMAIL", "shedforgebusiness+faculty2.demo@gmail.com"),
        "role": UserRole.faculty,
        "department": DEPARTMENT,
        "section_name": None,
    },
    "student_a": {
        "name": "Demo Student A",
        "email": _env_email("DEMO_STUDENTA_EMAIL", "shedforgebusiness+studenta.demo@gmail.com"),
        "role": UserRole.student,
        "department": DEPARTMENT,
        "section_name": "A",
    },
    "student_b": {
        "name": "Demo Student B",
        "email": _env_email("DEMO_STUDENTB_EMAIL", "shedforgebusiness+studentb.demo@gmail.com"),
        "role": UserRole.student,
        "department": DEPARTMENT,
        "section_name": "B",
    },
}


def _upsert_user(
    *,
    name: str,
    email: str,
    role: UserRole,
    department: str | None,
    section_name: str | None,
) -> User:
    with SessionLocal() as session:
        existing = session.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if existing is None:
            existing = User(
                name=name,
                email=email,
                hashed_password=get_password_hash(DEFAULT_PASSWORD),
                role=role,
                department=department,
                section_name=section_name,
                is_active=True,
            )
            session.add(existing)
        else:
            existing.name = name
            existing.role = role
            existing.department = department
            existing.section_name = section_name
            existing.is_active = True
        session.commit()
        session.refresh(existing)
        return existing


def _upsert_faculty_profile(*, name: str, email: str, department: str | None) -> Faculty:
    with SessionLocal() as session:
        existing = session.execute(select(Faculty).where(Faculty.email == email)).scalar_one_or_none()
        if existing is None:
            existing = Faculty(
                name=name,
                designation="Assistant Professor",
                email=email,
                department=department or DEPARTMENT,
                workload_hours=0,
                max_hours=20,
                availability=WEEKDAY_AVAILABILITY,
                availability_windows=[],
                avoid_back_to_back=False,
                preferred_min_break_minutes=0,
                preference_notes="Demo account for timetable access tests",
                preferred_subject_codes=[],
            )
            session.add(existing)
        else:
            existing.name = name
            existing.department = department or DEPARTMENT
            if not existing.availability:
                existing.availability = WEEKDAY_AVAILABILITY
            if existing.availability_windows is None:
                existing.availability_windows = []
            if existing.preferred_subject_codes is None:
                existing.preferred_subject_codes = []
        session.commit()
        session.refresh(existing)
        return existing


def _build_payload(faculty_one: Faculty, faculty_two: Faculty) -> dict:
    return {
        "facultyData": [
            {
                "id": faculty_one.id,
                "name": faculty_one.name,
                "department": faculty_one.department,
                "workloadHours": 0,
                "maxHours": 20,
                "availability": WEEKDAY_AVAILABILITY,
                "email": faculty_one.email,
            },
            {
                "id": faculty_two.id,
                "name": faculty_two.name,
                "department": faculty_two.department,
                "workloadHours": 0,
                "maxHours": 20,
                "availability": WEEKDAY_AVAILABILITY,
                "email": faculty_two.email,
            },
        ],
        "courseData": [
            {
                "id": "c-demo-a",
                "code": "CSE-DEMO-A",
                "name": "Demo Course A",
                "type": "theory",
                "credits": 3,
                "facultyId": faculty_one.id,
                "duration": 1,
                "hoursPerWeek": 1,
            },
            {
                "id": "c-demo-b",
                "code": "CSE-DEMO-B",
                "name": "Demo Course B",
                "type": "theory",
                "credits": 3,
                "facultyId": faculty_two.id,
                "duration": 1,
                "hoursPerWeek": 1,
            },
        ],
        "roomData": [
            {
                "id": "r-demo-a",
                "name": "A101",
                "capacity": 70,
                "type": "lecture",
                "building": "Main",
            },
            {
                "id": "r-demo-b",
                "name": "A102",
                "capacity": 70,
                "type": "lecture",
                "building": "Main",
            },
        ],
        "timetableData": [
            {
                "id": "slot-demo-a1",
                "day": "Monday",
                "startTime": "08:50",
                "endTime": "09:40",
                "courseId": "c-demo-a",
                "roomId": "r-demo-a",
                "facultyId": faculty_one.id,
                "section": "A",
                "studentCount": 60,
            },
            {
                "id": "slot-demo-b1",
                "day": "Tuesday",
                "startTime": "09:40",
                "endTime": "10:30",
                "courseId": "c-demo-b",
                "roomId": "r-demo-b",
                "facultyId": faculty_two.id,
                "section": "B",
                "studentCount": 60,
            },
        ],
    }


def _publish(payload: dict, admin_user_id: str) -> None:
    with SessionLocal() as session:
        record = session.get(OfficialTimetable, 1)
        if record is None:
            record = OfficialTimetable(id=1, payload=payload, updated_by_id=admin_user_id)
            session.add(record)
        else:
            record.payload = payload
            record.updated_by_id = admin_user_id
        session.commit()


def _print_accounts(items: Iterable[tuple[str, User]]) -> None:
    print("\nDemo accounts ready:")
    for label, user in items:
        section = f", section={user.section_name}" if user.section_name else ""
        print(f"  - {label}: {user.email} | role={user.role.value}{section}")
    print(f"\nPassword for all demo accounts: {DEFAULT_PASSWORD}")
    print("\nExpected isolation after login:")
    print("  - faculty_1 sees only section A slots for Demo Faculty One")
    print("  - faculty_2 sees only section B slots for Demo Faculty Two")
    print("  - student_a sees only section A slots")
    print("  - student_b sees only section B slots")


def main() -> None:
    created_users: dict[str, User] = {}
    for key, item in DEMO_ACCOUNTS.items():
        created_users[key] = _upsert_user(
            name=item["name"],
            email=item["email"],
            role=item["role"],
            department=item["department"],
            section_name=item["section_name"],
        )

    faculty_one = _upsert_faculty_profile(
        name=created_users["faculty_1"].name,
        email=created_users["faculty_1"].email,
        department=created_users["faculty_1"].department,
    )
    faculty_two = _upsert_faculty_profile(
        name=created_users["faculty_2"].name,
        email=created_users["faculty_2"].email,
        department=created_users["faculty_2"].department,
    )

    payload = _build_payload(faculty_one, faculty_two)
    _publish(payload, created_users["admin"].id)
    _print_accounts(created_users.items())


if __name__ == "__main__":
    main()
