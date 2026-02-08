from __future__ import annotations

from collections import Counter
from datetime import datetime, time, timedelta, timezone
import json
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_roles
from app.core.config import get_settings
from app.models.activity_log import ActivityLog
from app.models.course import Course
from app.models.faculty import Faculty
from app.models.feedback import FeedbackItem, FeedbackStatus
from app.models.leave_request import LeaveRequest, LeaveStatus
from app.models.notification import Notification, NotificationType
from app.models.program import Program
from app.models.program_structure import ProgramSection, ProgramTerm
from app.models.room import Room
from app.models.timetable import OfficialTimetable
from app.models.timetable_issue import IssueStatus, TimetableIssue
from app.models.user import User, UserRole
from app.schemas.system_analytics import (
    ActivityAnalyticsOut,
    CapacitySnapshotOut,
    DailyCountPoint,
    LabeledCount,
    OperationsSnapshotOut,
    ResourceInventoryOut,
    SystemAnalyticsOut,
    TimetableSnapshotOut,
    UtilizationSnapshotOut,
)
from app.schemas.timetable import OfficialTimetablePayload
from app.services.audit import log_activity
from app.services.notifications import notify_all_users

router = APIRouter()
settings = get_settings()


def _enum_label(value: object) -> str:
    if hasattr(value, "value"):
        return str(getattr(value, "value"))
    return str(value)


def _to_labeled_counts(counter: dict[str, int], limit: int | None = None) -> list[LabeledCount]:
    ordered = sorted(counter.items(), key=lambda item: (-item[1], item[0]))
    if limit is not None:
        ordered = ordered[:limit]
    return [LabeledCount(label=label, value=value) for label, value in ordered]


def _to_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@router.get("/system/info")
def system_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    has_timetable = db.get(OfficialTimetable, 1) is not None
    return {
        "name": settings.project_name,
        "api_prefix": settings.api_prefix,
        "help_sections": [
            "Authentication and roles",
            "Academic setup",
            "Generation and publishing",
            "Conflict resolution",
            "Reports and exports",
        ],
        "features": {
            "official_timetable_published": has_timetable,
            "generator_enabled": True,
            "issues_enabled": True,
            "notifications_enabled": True,
            "backups_enabled": True,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/system/analytics", response_model=SystemAnalyticsOut)
def system_analytics(
    days: int = Query(default=14, ge=1, le=90),
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> SystemAnalyticsOut:
    programs = int(db.execute(select(func.count(Program.id))).scalar_one() or 0)
    program_terms = int(db.execute(select(func.count(ProgramTerm.id))).scalar_one() or 0)
    program_sections = int(db.execute(select(func.count(ProgramSection.id))).scalar_one() or 0)
    courses = int(db.execute(select(func.count(Course.id))).scalar_one() or 0)
    faculty = int(db.execute(select(func.count(Faculty.id))).scalar_one() or 0)
    users_total = int(db.execute(select(func.count(User.id))).scalar_one() or 0)

    room_type_counts = {"lecture": 0, "lab": 0, "seminar": 0}
    room_capacity_by_type = {"lecture": 0, "lab": 0, "seminar": 0}
    for room_type, count in db.execute(select(Room.type, func.count(Room.id)).group_by(Room.type)).all():
        room_type_counts[_enum_label(room_type)] = int(count)
    for room_type, total_capacity in db.execute(
        select(Room.type, func.coalesce(func.sum(Room.capacity), 0)).group_by(Room.type)
    ).all():
        room_capacity_by_type[_enum_label(room_type)] = int(total_capacity or 0)
    rooms_total = sum(room_type_counts.values())

    users_by_role = {role.value: 0 for role in UserRole}
    for role, count in db.execute(select(User.role, func.count(User.id)).group_by(User.role)).all():
        users_by_role[_enum_label(role)] = int(count)

    configured_section_capacity = int(
        db.execute(select(func.coalesce(func.sum(ProgramSection.capacity), 0))).scalar_one() or 0
    )

    total_room_capacity = int(
        db.execute(select(func.coalesce(func.sum(Room.capacity), 0))).scalar_one() or 0
    )

    record = db.get(OfficialTimetable, 1)
    timetable_payload: OfficialTimetablePayload | None = None
    if record is not None:
        try:
            timetable_payload = OfficialTimetablePayload.model_validate(record.payload)
        except Exception:
            timetable_payload = None

    slots = timetable_payload.timetable_data if timetable_payload is not None else []
    scheduled_student_seats = sum(int(slot.studentCount or 0) for slot in slots)
    slot_days_counter = Counter(slot.day for slot in slots)
    timetable_sections = len({slot.section.strip().upper() for slot in slots if slot.section.strip()})
    timetable_faculty = len({slot.facultyId for slot in slots if slot.facultyId})
    timetable_rooms = len({slot.roomId for slot in slots if slot.roomId})
    timetable_courses = len({slot.courseId for slot in slots if slot.courseId})

    room_utilization_percent = round((timetable_rooms * 100.0 / rooms_total), 1) if rooms_total else 0.0
    faculty_utilization_percent = round((timetable_faculty * 100.0 / faculty), 1) if faculty else 0.0
    section_coverage_percent = round((timetable_sections * 100.0 / program_sections), 1) if program_sections else 0.0

    total_logs = int(db.execute(select(func.count(ActivityLog.id))).scalar_one() or 0)
    window_days = int(days)
    now = datetime.now(timezone.utc)
    start_date = (now - timedelta(days=window_days - 1)).date()
    window_start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)

    window_logs = list(
        db.execute(select(ActivityLog).where(ActivityLog.created_at >= window_start)).scalars()
    )
    recent_logs = list(
        db.execute(select(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(20)).scalars()
    )

    actions_by_day_counter: dict[str, int] = {}
    for offset in range(window_days):
        day = start_date + timedelta(days=offset)
        actions_by_day_counter[day.isoformat()] = 0

    top_actions_counter: Counter[str] = Counter()
    top_entities_counter: Counter[str] = Counter()
    active_user_ids: set[str] = set()

    for item in window_logs:
        created = _to_utc(item.created_at)
        if created is not None:
            key = created.date().isoformat()
            if key in actions_by_day_counter:
                actions_by_day_counter[key] += 1
        if item.action:
            top_actions_counter[item.action] += 1
        if item.entity_type:
            top_entities_counter[item.entity_type] += 1
        if item.user_id:
            active_user_ids.add(item.user_id)

    notification_type_counts = {item.value: 0 for item in NotificationType}
    for notif_type, count in db.execute(
        select(Notification.notification_type, func.count(Notification.id)).group_by(Notification.notification_type)
    ).all():
        notification_type_counts[_enum_label(notif_type)] = int(count)
    unread_notifications = int(
        db.execute(select(func.count(Notification.id)).where(Notification.is_read.is_(False))).scalar_one() or 0
    )

    leave_status_counts = {item.value: 0 for item in LeaveStatus}
    for leave_status, count in db.execute(
        select(LeaveRequest.status, func.count(LeaveRequest.id)).group_by(LeaveRequest.status)
    ).all():
        leave_status_counts[_enum_label(leave_status)] = int(count)

    issue_status_counts = {item.value: 0 for item in IssueStatus}
    for issue_status, count in db.execute(
        select(TimetableIssue.status, func.count(TimetableIssue.id)).group_by(TimetableIssue.status)
    ).all():
        issue_status_counts[_enum_label(issue_status)] = int(count)

    feedback_status_counts = {item.value: 0 for item in FeedbackStatus}
    for feedback_status, count in db.execute(
        select(FeedbackItem.status, func.count(FeedbackItem.id)).group_by(FeedbackItem.status)
    ).all():
        feedback_status_counts[_enum_label(feedback_status)] = int(count)

    return SystemAnalyticsOut(
        generatedAt=now.isoformat(),
        inventory=ResourceInventoryOut(
            programs=programs,
            programTerms=program_terms,
            programSections=program_sections,
            courses=courses,
            faculty=faculty,
            roomsTotal=rooms_total,
            lectureRooms=room_type_counts["lecture"],
            labRooms=room_type_counts["lab"],
            seminarRooms=room_type_counts["seminar"],
            usersTotal=users_total,
            usersByRole=users_by_role,
        ),
        timetable=TimetableSnapshotOut(
            isPublished=timetable_payload is not None,
            updatedAt=_to_utc(record.updated_at).isoformat() if record is not None and record.updated_at else None,
            totalSlots=len(slots),
            sections=timetable_sections,
            faculty=timetable_faculty,
            rooms=timetable_rooms,
            courses=timetable_courses,
            slotsByDay=dict(sorted(slot_days_counter.items())),
        ),
        utilization=UtilizationSnapshotOut(
            roomUtilizationPercent=room_utilization_percent,
            facultyUtilizationPercent=faculty_utilization_percent,
            sectionCoveragePercent=section_coverage_percent,
        ),
        capacity=CapacitySnapshotOut(
            totalRoomCapacity=total_room_capacity,
            lectureRoomCapacity=room_capacity_by_type["lecture"],
            labRoomCapacity=room_capacity_by_type["lab"],
            seminarRoomCapacity=room_capacity_by_type["seminar"],
            configuredSectionCapacity=configured_section_capacity,
            scheduledStudentSeats=scheduled_student_seats,
        ),
        activity=ActivityAnalyticsOut(
            windowDays=window_days,
            totalLogs=total_logs,
            actionsLastWindow=len(window_logs),
            activeUsers=len(active_user_ids),
            actionsByDay=[
                DailyCountPoint(date=day, value=count)
                for day, count in sorted(actions_by_day_counter.items())
            ],
            topActions=_to_labeled_counts(dict(top_actions_counter), limit=8),
            topEntities=_to_labeled_counts(dict(top_entities_counter), limit=8),
            recentLogs=recent_logs,
        ),
        operations=OperationsSnapshotOut(
            unreadNotifications=unread_notifications,
            notificationsByType=_to_labeled_counts(notification_type_counts),
            leavesByStatus=_to_labeled_counts(leave_status_counts),
            issuesByStatus=_to_labeled_counts(issue_status_counts),
            feedbackByStatus=_to_labeled_counts(feedback_status_counts),
        ),
    )


@router.post("/system/backup")
def trigger_backup(
    current_user: User = Depends(require_roles(UserRole.admin)),
    db: Session = Depends(get_db),
) -> dict:
    backup_dir = Path("database/backups")
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = backup_dir / f"shedforge-backup-{timestamp}.json"
    official = db.get(OfficialTimetable, 1)

    data = {
        "timestamp": timestamp,
        "programs": [item.id for item in db.execute(select(Program.id)).scalars()],
        "courses": [item.id for item in db.execute(select(Course.id)).scalars()],
        "rooms": [item.id for item in db.execute(select(Room.id)).scalars()],
        "faculty": [item.id for item in db.execute(select(Faculty.id)).scalars()],
        "official_timetable": official.payload if official else None,
    }
    backup_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    notify_all_users(
        db,
        title="System Backup Completed",
        message=f"Backup {backup_path.name} was created by {current_user.name}.",
        notification_type=NotificationType.system,
        deliver_email=True,
    )
    log_activity(
        db,
        user=current_user,
        action="system.backup",
        entity_type="backup",
        entity_id=backup_path.name,
        details={"path": str(backup_path)},
    )
    db.commit()
    return {"success": True, "backup_file": str(backup_path)}
