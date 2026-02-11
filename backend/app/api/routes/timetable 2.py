from collections import defaultdict
from copy import deepcopy
from html import escape
import logging
from math import sqrt

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_roles
from app.models.faculty import Faculty
from app.models.institution_settings import InstitutionSettings
from app.models.notification import NotificationType
from app.models.program_structure import (
    ElectiveConflictPolicy,
    ProgramCourse,
    ProgramElectiveGroup,
    ProgramElectiveGroupMember,
    ProgramSection,
    ProgramSharedLectureGroup,
    ProgramSharedLectureGroupMember,
    ProgramTerm,
)
from app.models.room import Room
from app.models.semester_constraint import SemesterConstraint
from app.models.timetable_conflict_decision import ConflictDecision, TimetableConflictDecision
from app.models.timetable import OfficialTimetable
from app.models.timetable_generation import TimetableGenerationSettings
from app.models.timetable_version import TimetableVersion
from app.models.user import User, UserRole
from app.schemas.version import TimetableTrendPoint, TimetableVersionCompare, TimetableVersionOut
from app.schemas.insights import (
    ConflictDecisionIn,
    ConflictDecisionOut,
    ConstraintStatus,
    DailyWorkloadEntry,
    OptimizationSummary,
    PerformanceTrendEntry,
    TimetableAnalytics,
    TimetableConflict,
    WorkloadChartEntry,
)
from app.schemas.settings import (
    DEFAULT_SCHEDULE_POLICY,
    DEFAULT_WORKING_HOURS,
    BreakWindowEntry,
    SchedulePolicyUpdate,
    WorkingHoursEntry,
    parse_time_to_minutes,
)
from app.schemas.timetable import (
    FacultyCourseSectionAssignment,
    FacultyCourseSectionMappingOut,
    OfflinePublishFilters,
    OfflinePublishRequest,
    OfflinePublishResponse,
    OfficialTimetablePayload,
)
from app.services.audit import log_activity
from app.services.email import EmailDeliveryError, send_email
from app.services.notifications import create_notification, notify_all_users, notify_users

router = APIRouter()
logger = logging.getLogger(__name__)

DAY_SHORT_MAP = {
    "Mon": "Monday",
    "Tue": "Tuesday",
    "Wed": "Wednesday",
    "Thu": "Thursday",
    "Fri": "Friday",
    "Sat": "Saturday",
    "Sun": "Sunday",
}


def normalize_day(value: str) -> str:
    return DAY_SHORT_MAP.get(value, value)


def slots_overlap(start_a: int, end_a: int, start_b: int, end_b: int) -> bool:
    return start_a < end_b and start_b < end_a


def load_working_hours(db: Session) -> dict[str, WorkingHoursEntry]:
    record = db.get(InstitutionSettings, 1)
    if record is None:
        entries = DEFAULT_WORKING_HOURS
    else:
        entries = [WorkingHoursEntry.model_validate(entry) for entry in record.working_hours]
    return {entry.day: entry for entry in entries}


def load_schedule_policy(db: Session) -> SchedulePolicyUpdate:
    record = db.get(InstitutionSettings, 1)
    if record is None:
        return DEFAULT_SCHEDULE_POLICY

    period_minutes = record.period_minutes or DEFAULT_SCHEDULE_POLICY.period_minutes
    lab_contiguous_slots = record.lab_contiguous_slots or DEFAULT_SCHEDULE_POLICY.lab_contiguous_slots
    break_windows = record.break_windows or [item.model_dump() for item in DEFAULT_SCHEDULE_POLICY.breaks]
    return SchedulePolicyUpdate(
        period_minutes=period_minutes,
        lab_contiguous_slots=lab_contiguous_slots,
        breaks=break_windows,
    )


def slot_overlaps_break(slot_start: int, slot_end: int, breaks: list[BreakWindowEntry]) -> BreakWindowEntry | None:
    for break_entry in breaks:
        break_start = parse_time_to_minutes(break_entry.start_time)
        break_end = parse_time_to_minutes(break_entry.end_time)
        if slot_start < break_end and slot_end > break_start:
            return break_entry
    return None


def build_teaching_segments(
    day_start: int,
    day_end: int,
    period_minutes: int,
    breaks: list[BreakWindowEntry],
) -> list[tuple[int, int]]:
    break_windows = sorted(
        (
            (parse_time_to_minutes(item.start_time), parse_time_to_minutes(item.end_time))
            for item in breaks
            if parse_time_to_minutes(item.end_time) > day_start and parse_time_to_minutes(item.start_time) < day_end
        ),
        key=lambda item: item[0],
    )
    segments: list[tuple[int, int]] = []
    cursor = day_start
    break_index = 0

    while cursor + period_minutes <= day_end:
        while break_index < len(break_windows) and break_windows[break_index][1] <= cursor:
            break_index += 1

        if break_index < len(break_windows):
            break_start, break_end = break_windows[break_index]
            if break_start <= cursor < break_end:
                cursor = break_end
                continue
            if cursor < break_start < cursor + period_minutes:
                cursor = break_end
                continue

        next_cursor = cursor + period_minutes
        segments.append((cursor, next_cursor))
        cursor = next_cursor

    return segments


def is_slot_aligned_with_segments(slot_start: int, slot_end: int, segments: list[tuple[int, int]]) -> bool:
    if slot_end <= slot_start:
        return False
    by_start = {start: end for start, end in segments}
    cursor = slot_start
    while cursor < slot_end:
        next_boundary = by_start.get(cursor)
        if next_boundary is None:
            return False
        cursor = next_boundary
    return cursor == slot_end


def load_semester_constraint(db: Session, term_number: int) -> SemesterConstraint | None:
    return (
        db.execute(select(SemesterConstraint).where(SemesterConstraint.term_number == term_number))
        .scalars()
        .first()
    )


def enforce_semester_constraints(
    payload: OfficialTimetablePayload,
    constraint: SemesterConstraint,
    force: bool = False,
) -> None:
    allowed_start = parse_time_to_minutes(constraint.earliest_start_time)
    allowed_end = parse_time_to_minutes(constraint.latest_end_time)
    max_day_minutes = constraint.max_hours_per_day * 60
    max_week_minutes = constraint.max_hours_per_week * 60
    max_consecutive_minutes = constraint.max_consecutive_hours * 60

    section_windows: dict[str, set[tuple[str, int, int]]] = defaultdict(set)

    for slot in payload.timetable_data:
        slot_start = parse_time_to_minutes(slot.startTime)
        slot_end = parse_time_to_minutes(slot.endTime)
        if slot_start < allowed_start or slot_end > allowed_end:
            if not force:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Timeslot {slot.id} on {slot.day} must be within "
                        f"{constraint.earliest_start_time}-{constraint.latest_end_time}"
                    ),
                )
        section_windows[slot.section].add((slot.day, slot_start, slot_end))

    for section_name, windows in section_windows.items():
        total_week_minutes = sum(end - start for _, start, end in windows)
        if total_week_minutes > max_week_minutes:
            if not force:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Weekly scheduled hours exceed semester constraints "
                        f"for section {section_name}"
                    ),
                )

        day_slots: dict[str, list[tuple[int, int]]] = defaultdict(list)
        for day, start, end in windows:
            day_slots[day].append((start, end))

        for day, slots in day_slots.items():
            slots.sort(key=lambda item: item[0])
            day_total = sum(end - start for start, end in slots)
            if day_total > max_day_minutes:
                if not force:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Daily scheduled hours exceed semester constraints on {day} for section {section_name}",
                    )

            prev_end = None
            consecutive_start = None
            consecutive_end = None
            for start, end in slots:
                if prev_end is not None:
                    gap = start - prev_end
                    if gap < 0:
                        if not force:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Timeslots overlap on {day} for section {section_name}",
                            )
                    if gap < constraint.min_break_minutes:
                        if not force:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=(
                                    f"Section {section_name} on {day} must allow at least "
                                    f"{constraint.min_break_minutes} minutes break between classes"
                                ),
                            )
                if consecutive_start is None or prev_end is None or start != prev_end:
                    consecutive_start = start
                    consecutive_end = end
                else:
                    consecutive_end = end

                if consecutive_end - consecutive_start > max_consecutive_minutes:
                    if not force:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Consecutive classes exceed limit on {day} for section {section_name}",
                        )

                prev_end = end


def load_shared_lecture_groups(
    *,
    db: Session,
    program_id: str,
    term_number: int,
) -> list[tuple[str, str, set[str]]]:
    groups = (
        db.execute(
            select(ProgramSharedLectureGroup).where(
                ProgramSharedLectureGroup.program_id == program_id,
                ProgramSharedLectureGroup.term_number == term_number,
            )
        )
        .scalars()
        .all()
    )
    if not groups:
        return []

    group_ids = [group.id for group in groups]
    members_by_group: dict[str, set[str]] = defaultdict(set)
    for member in db.execute(
        select(ProgramSharedLectureGroupMember).where(
            ProgramSharedLectureGroupMember.group_id.in_(group_ids)
        )
    ).scalars():
        members_by_group[member.group_id].add(member.section_name)

    result: list[tuple[str, str, set[str]]] = []
    for group in groups:
        sections = members_by_group.get(group.id, set())
        if len(sections) >= 2:
            result.append((group.name, group.course_id, sections))
    return result


def build_shared_group_lookup(
    groups: list[tuple[str, str, set[str]]],
) -> dict[str, list[set[str]]]:
    lookup: dict[str, list[set[str]]] = defaultdict(list)
    for _, course_id, sections in groups:
        lookup[course_id].append(set(sections))
    return lookup


def sections_share_shared_lecture(
    *,
    course_id: str,
    section_a: str,
    section_b: str,
    shared_groups_by_course: dict[str, list[set[str]]],
) -> bool:
    for sections in shared_groups_by_course.get(course_id, []):
        if section_a in sections and section_b in sections:
            return True
    return False


def is_shared_lecture_overlap_event(
    *,
    slot: object,
    other: object,
    slot_start: int,
    slot_end: int,
    other_start: int,
    other_end: int,
    shared_groups_by_course: dict[str, list[set[str]]],
) -> bool:
    if slot.courseId != other.courseId:
        return False
    if slot.section == other.section:
        return False
    if slot.roomId != other.roomId:
        return False
    if slot.facultyId != other.facultyId:
        return False
    if (slot.batch or "") != (other.batch or ""):
        return False
    if slot_start != other_start or slot_end != other_end:
        return False
    return sections_share_shared_lecture(
        course_id=slot.courseId,
        section_a=slot.section,
        section_b=other.section,
        shared_groups_by_course=shared_groups_by_course,
    )


def enforce_resource_conflicts(
    payload: OfficialTimetablePayload,
    course_by_id: dict[str, object],
    shared_groups_by_course: dict[str, list[set[str]]],
    force: bool = False,
) -> None:
    slots_by_day: dict[str, list] = defaultdict(list)
    for slot in payload.timetable_data:
        slots_by_day[slot.day].append(slot)

    for day, slots in slots_by_day.items():
        for i, slot in enumerate(slots):
            slot_start = parse_time_to_minutes(slot.startTime)
            slot_end = parse_time_to_minutes(slot.endTime)
            for other in slots[i + 1 :]:
                other_start = parse_time_to_minutes(other.startTime)
                other_end = parse_time_to_minutes(other.endTime)
                if slot_start >= other_end or other_start >= slot_end:
                    continue

                allow_shared_lecture = is_shared_lecture_overlap_event(
                    slot=slot,
                    other=other,
                    slot_start=slot_start,
                    slot_end=slot_end,
                    other_start=other_start,
                    other_end=other_end,
                    shared_groups_by_course=shared_groups_by_course,
                )

                if slot.roomId == other.roomId and not allow_shared_lecture:
                    if not force:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Room conflict on {day} for room {slot.roomId}",
                        )
                if slot.facultyId == other.facultyId and not allow_shared_lecture:
                    if not force:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Faculty conflict on {day} for faculty {slot.facultyId}",
                        )

                if slot.section == other.section:
                    course = course_by_id[slot.courseId]
                    other_course = course_by_id[other.courseId]
                    allow_parallel_lab = (
                        getattr(course, "type", None) == "lab"
                        and getattr(other_course, "type", None) == "lab"
                        and slot.courseId == other.courseId
                        and slot.batch
                        and other.batch
                        and slot.batch != other.batch
                    )
                    if not allow_parallel_lab:
                        if not force:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Section conflict on {day} for section {slot.section}",
                            )


def enforce_single_faculty_per_course_sections(
    payload: OfficialTimetablePayload,
    course_by_id: dict[str, object],
    faculty_by_id: dict[str, object],
    force: bool = False,
) -> None:
    faculty_ids_by_course_section: dict[tuple[str, str], set[str]] = defaultdict(set)

    for slot in payload.timetable_data:
        course = course_by_id.get(slot.courseId)
        if course is not None and getattr(course, "type", None) == "lab":
            continue
        faculty_ids_by_course_section[(slot.courseId, slot.section)].add(slot.facultyId)

    violations: list[str] = []
    for (course_id, section_name), faculty_ids in faculty_ids_by_course_section.items():
        if len(faculty_ids) <= 1:
            continue
        course = course_by_id.get(course_id)
        course_label = getattr(course, "code", course_id)
        faculty_labels = ", ".join(
            sorted(getattr(faculty_by_id.get(faculty_id), "name", faculty_id) for faculty_id in faculty_ids)
        )
        violations.append(f"{course_label} [section {section_name}] -> {faculty_labels}")

    if violations:
        if not force:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Each non-lab course must be assigned to one faculty within each section: "
                    + " | ".join(violations)
                ),
            )


def enforce_course_scheduling(
    payload: OfficialTimetablePayload,
    course_by_id: dict[str, object],
    room_by_id: dict[str, object],
    schedule_policy: SchedulePolicyUpdate,
    force: bool = False,
) -> None:
    period_minutes = schedule_policy.period_minutes
    lab_block_minutes = schedule_policy.period_minutes * schedule_policy.lab_contiguous_slots
    grouped: dict[tuple[str, str, str | None], list] = defaultdict(list)
    for slot in payload.timetable_data:
        course = course_by_id[slot.courseId]
        if getattr(course, "type", None) == "lab":
            if not slot.batch:
                if not force:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Lab timeslot {slot.id} must include a batch identifier",
                    )
            if slot.studentCount is None:
                if not force:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Lab timeslot {slot.id} must include studentCount for batch sizing",
                    )
            room = room_by_id[slot.roomId]
            if getattr(room, "type", None) != "lab":
                if not force:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Lab timeslot {slot.id} must be scheduled in a lab room",
                    )
            slot_duration = parse_time_to_minutes(slot.endTime) - parse_time_to_minutes(slot.startTime)
            if slot_duration != period_minutes:
                if not force:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Lab timeslot {slot.id} must span exactly one period "
                            f"({period_minutes} minutes)"
                        ),
                    )
        group_key = (
            slot.courseId,
            slot.section,
            slot.batch if getattr(course, "type", None) == "lab" else None,
        )
        grouped[group_key].append(slot)

    for (course_id, section, batch), slots in grouped.items():
        course = course_by_id[course_id]
        required_minutes = getattr(course, "hoursPerWeek", 0) * period_minutes
        total_minutes = 0
        slots_sorted = sorted(slots, key=lambda s: (s.day, parse_time_to_minutes(s.startTime)))
        for slot in slots_sorted:
            total_minutes += parse_time_to_minutes(slot.endTime) - parse_time_to_minutes(slot.startTime)

        if required_minutes and total_minutes != required_minutes:
            label = f"{course_id} section {section}"
            if batch:
                label += f" batch {batch}"
            if not force:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Scheduled duration for {label} must equal {required_minutes} minutes per week",
                )

        if getattr(course, "type", None) == "lab":
            if required_minutes % lab_block_minutes != 0:
                if not force:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Lab course {course_id} duration must align with lab block rules",
                    )
            expected_blocks = required_minutes // lab_block_minutes if required_minutes else 0
            blocks: list[int] = []
            current_day: str | None = None
            current_start: int | None = None
            current_end: int | None = None

            for slot in slots_sorted:
                slot_start = parse_time_to_minutes(slot.startTime)
                slot_end = parse_time_to_minutes(slot.endTime)
                if current_day != slot.day or current_end is None or slot_start != current_end:
                    if current_day is not None and current_start is not None and current_end is not None:
                        blocks.append(current_end - current_start)
                    current_day = slot.day
                    current_start = slot_start
                    current_end = slot_end
                else:
                    current_end = slot_end

            if current_day is not None and current_start is not None and current_end is not None:
                blocks.append(current_end - current_start)

            if expected_blocks and len(blocks) != expected_blocks:
                if not force:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Lab course {course_id} must be scheduled in {expected_blocks} contiguous block(s)",
                    )
            for block_length in blocks:
                if block_length != lab_block_minutes:
                    if not force:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=(
                                f"Lab course {course_id} must use contiguous blocks of "
                                f"{schedule_policy.lab_contiguous_slots} period(s)"
                            ),
                        )


def enforce_room_capacity(
    payload: OfficialTimetablePayload,
    room_by_id: dict[str, object],
    db: Session,
    force: bool = False,
) -> dict[str, int]:
    resolved_counts: dict[str, int] = {}
    for slot in payload.timetable_data:
        student_count = slot.studentCount
        if student_count is None and payload.program_id and payload.term_number is not None:
            section = (
                db.execute(
                    select(ProgramSection).where(
                        ProgramSection.program_id == payload.program_id,
                        ProgramSection.term_number == payload.term_number,
                        ProgramSection.name == slot.section,
                    )
                )
                .scalars()
                .first()
            )
            if section is not None:
                student_count = section.capacity

        if student_count is None:
            if not force:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"studentCount is required to validate room capacity for timeslot {slot.id}",
                )
            student_count = 0

        room = room_by_id[slot.roomId]
        if getattr(room, "capacity", 0) < student_count:
            if not force:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Room {room.name} capacity is insufficient for timeslot {slot.id}",
                )
        resolved_counts[slot.id] = student_count
    return resolved_counts


def enforce_program_credit_requirements(
    payload: OfficialTimetablePayload,
    course_by_id: dict[str, object],
    db: Session,
    force: bool = False,
) -> None:
    if not payload.program_id or payload.term_number is None:
        return

    term = (
        db.execute(
            select(ProgramTerm).where(
                ProgramTerm.program_id == payload.program_id,
                ProgramTerm.term_number == payload.term_number,
            )
        )
        .scalars()
        .first()
    )
    if term is None:
        if not force:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Program term not configured for credit requirements",
            )
        return

    program_courses = (
        db.execute(
            select(ProgramCourse).where(
                ProgramCourse.program_id == payload.program_id,
                ProgramCourse.term_number == payload.term_number,
            )
        )
        .scalars()
        .all()
    )
    if not program_courses:
        return

    program_course_ids = {course.course_id for course in program_courses}
    required_course_ids = {course.course_id for course in program_courses if course.is_required}
    scheduled_course_ids = {slot.courseId for slot in payload.timetable_data}

    missing_required = required_course_ids - scheduled_course_ids
    if missing_required:
        if not force:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing required courses for term: {', '.join(sorted(missing_required))}",
            )

    extra_courses = scheduled_course_ids - program_course_ids
    if extra_courses:
        if not force:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Scheduled courses not part of program term: {', '.join(sorted(extra_courses))}",
            )

    total_credits = 0
    for course_id in scheduled_course_ids:
        course = course_by_id.get(course_id)
        if course is not None:
            total_credits += getattr(course, "credits", 0)

    if term.credits_required > 0 and total_credits != term.credits_required:
        if not force:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Scheduled credits ({total_credits}) must exactly match "
                    f"program term requirement ({term.credits_required})"
                ),
            )


def enforce_section_credit_aligned_minutes(
    payload: OfficialTimetablePayload,
    db: Session,
    schedule_policy: SchedulePolicyUpdate,
    force: bool = False,
) -> None:
    if not payload.program_id or payload.term_number is None:
        return

    term = (
        db.execute(
            select(ProgramTerm).where(
                ProgramTerm.program_id == payload.program_id,
                ProgramTerm.term_number == payload.term_number,
            )
        )
        .scalars()
        .first()
    )
    if term is None or term.credits_required <= 0:
        return

    mapped_course_ids = (
        db.execute(
            select(ProgramCourse.course_id).where(
                ProgramCourse.program_id == payload.program_id,
                ProgramCourse.term_number == payload.term_number,
            )
        )
        .scalars()
        .all()
    )
    payload_hours_by_course = {
        course.id: max(0, int(getattr(course, "hoursPerWeek", 0)))
        for course in payload.course_data
    }
    configured_hours = sum(payload_hours_by_course.get(course_id, 0) for course_id in mapped_course_ids)
    if configured_hours <= 0:
        configured_hours = sum(payload_hours_by_course.values())

    expected_hours = configured_hours
    if term.credits_required > 0 and term.credits_required == configured_hours:
        expected_hours = term.credits_required
    elif expected_hours <= 0 and term.credits_required > 0:
        expected_hours = term.credits_required
    if expected_hours <= 0:
        return

    expected_minutes = expected_hours * schedule_policy.period_minutes
    section_windows: dict[str, set[tuple[str, int, int]]] = defaultdict(set)
    for slot in payload.timetable_data:
        start = parse_time_to_minutes(slot.startTime)
        end = parse_time_to_minutes(slot.endTime)
        if end <= start:
            continue
        section_windows[slot.section].add((slot.day, start, end))

    configured_sections = (
        db.execute(
            select(ProgramSection.name).where(
                ProgramSection.program_id == payload.program_id,
                ProgramSection.term_number == payload.term_number,
            )
        )
        .scalars()
        .all()
    )
    section_names = set(configured_sections) if configured_sections else set(section_windows.keys())
    if not section_names:
        return

    for section_name in sorted(section_names):
        minutes = sum(end - start for _, start, end in section_windows.get(section_name, set()))
        if minutes != expected_minutes:
            if not force:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Section {section_name} has {minutes} scheduled minutes per week, "
                        f"but semester target is {expected_minutes} minutes "
                        f"({expected_hours} hourly credits x {schedule_policy.period_minutes} minutes)."
                    ),
                )


def enforce_shared_lecture_constraints(
    payload: OfficialTimetablePayload,
    shared_groups: list[tuple[str, str, set[str]]],
    shared_groups_by_course: dict[str, list[set[str]]],
    room_by_id: dict[str, object],
    student_counts_by_slot: dict[str, int],
    force: bool = False,
) -> None:
    if not shared_groups:
        return

    slots_by_course_section: dict[tuple[str, str], list[tuple[str, str, str, str, str]]] = defaultdict(list)
    for slot in payload.timetable_data:
        slots_by_course_section[(slot.courseId, slot.section)].append(
            (slot.day, slot.startTime, slot.endTime, slot.roomId, slot.facultyId)
        )

    for group_name, course_id, sections in shared_groups:
        baseline_signatures: list[tuple[str, str, str, str, str]] | None = None
        for section_name in sorted(sections):
            signatures = sorted(slots_by_course_section.get((course_id, section_name), []))
            if baseline_signatures is None:
                baseline_signatures = signatures
                continue
            if signatures != baseline_signatures:
                if not force:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Shared lecture group '{group_name}' requires synchronized slots for course {course_id} "
                            f"across sections: {', '.join(sorted(sections))}"
                        ),
                    )

    grouped_events: dict[tuple[str, str, str, str, str], list] = defaultdict(list)
    for slot in payload.timetable_data:
        if slot.courseId not in shared_groups_by_course:
            continue
        grouped_events[(slot.day, slot.startTime, slot.endTime, slot.courseId, slot.roomId)].append(slot)

    for event_slots in grouped_events.values():
        if len(event_slots) < 2:
            continue
        sample = event_slots[0]
        matched_sections = set()
        for slot in event_slots[1:]:
            sample_start = parse_time_to_minutes(sample.startTime)
            sample_end = parse_time_to_minutes(sample.endTime)
            slot_start = parse_time_to_minutes(slot.startTime)
            slot_end = parse_time_to_minutes(slot.endTime)
            if is_shared_lecture_overlap_event(
                slot=sample,
                other=slot,
                slot_start=sample_start,
                slot_end=sample_end,
                other_start=slot_start,
                other_end=slot_end,
                shared_groups_by_course=shared_groups_by_course,
            ):
                matched_sections.add(sample.section)
                matched_sections.add(slot.section)

        if len(matched_sections) < 2:
            continue

        room = room_by_id[sample.roomId]
        total_students = sum(
            student_counts_by_slot.get(slot.id, 0)
            for slot in event_slots
            if slot.section in matched_sections
        )
        if total_students > getattr(room, "capacity", 0):
            if not force:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Shared lecture event for course {sample.courseId} exceeds room capacity in room {sample.roomId}"
                    ),
                )


def load_elective_overlap_pairs(
    *,
    db: Session,
    program_id: str,
    term_number: int,
) -> set[tuple[str, str]]:
    groups = (
        db.execute(
            select(ProgramElectiveGroup).where(
                ProgramElectiveGroup.program_id == program_id,
                ProgramElectiveGroup.term_number == term_number,
                ProgramElectiveGroup.conflict_policy == ElectiveConflictPolicy.no_overlap,
            )
        )
        .scalars()
        .all()
    )
    if not groups:
        return set()

    group_ids = [group.id for group in groups]
    rows = (
        db.execute(
            select(ProgramElectiveGroupMember.group_id, ProgramCourse.course_id)
            .join(ProgramCourse, ProgramCourse.id == ProgramElectiveGroupMember.program_course_id)
            .where(ProgramElectiveGroupMember.group_id.in_(group_ids))
        )
        .all()
    )
    courses_by_group: dict[str, set[str]] = defaultdict(set)
    for group_id, course_id in rows:
        courses_by_group[group_id].add(course_id)

    conflict_pairs: set[tuple[str, str]] = set()
    for course_ids in courses_by_group.values():
        ordered = sorted(course_ids)
        for index, left in enumerate(ordered):
            for right in ordered[index + 1 :]:
                conflict_pairs.add((left, right))
    return conflict_pairs


def courses_conflict_in_elective_group(
    course_a: str,
    course_b: str,
    conflict_pairs: set[tuple[str, str]],
) -> bool:
    left, right = sorted((course_a, course_b))
    return (left, right) in conflict_pairs


def enforce_elective_overlap_constraints(
    payload: OfficialTimetablePayload,
    db: Session,
    force: bool = False,
) -> None:
    if not payload.program_id or payload.term_number is None:
        return

    conflict_pairs = load_elective_overlap_pairs(
        db=db,
        program_id=payload.program_id,
        term_number=payload.term_number,
    )
    if not conflict_pairs:
        return

    violations: set[str] = set()
    slots_by_day: dict[str, list] = defaultdict(list)
    for slot in payload.timetable_data:
        slots_by_day[slot.day].append(slot)

    for day, slots in slots_by_day.items():
        for index, slot in enumerate(slots):
            start = parse_time_to_minutes(slot.startTime)
            end = parse_time_to_minutes(slot.endTime)
            for other in slots[index + 1 :]:
                if slot.courseId == other.courseId:
                    continue
                other_start = parse_time_to_minutes(other.startTime)
                other_end = parse_time_to_minutes(other.endTime)
                if not slots_overlap(start, end, other_start, other_end):
                    continue
                if not courses_conflict_in_elective_group(slot.courseId, other.courseId, conflict_pairs):
                    continue
                left, right = sorted((slot.courseId, other.courseId))
                violations.add(
                    f"{day} {slot.startTime}-{slot.endTime}: {left}({slot.section}) vs {right}({other.section})"
                )

    if violations:
        if not force:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Elective overlap constraints violated: " + " | ".join(sorted(violations)),
            )


def enforce_prerequisite_constraints(
    payload: OfficialTimetablePayload,
    db: Session,
    force: bool = False,
) -> None:
    if not payload.program_id or payload.term_number is None:
        return

    current_program_courses = (
        db.execute(
            select(ProgramCourse).where(
                ProgramCourse.program_id == payload.program_id,
                ProgramCourse.term_number == payload.term_number,
            )
        )
        .scalars()
        .all()
    )
    if not current_program_courses:
        return

    completed_course_ids = set(
        db.execute(
            select(ProgramCourse.course_id).where(
                ProgramCourse.program_id == payload.program_id,
                ProgramCourse.term_number < payload.term_number,
            )
        )
        .scalars()
        .all()
    )

    violations: list[str] = []
    for program_course in current_program_courses:
        prerequisite_ids = set(program_course.prerequisite_course_ids or [])
        missing = sorted(prerequisite_ids - completed_course_ids)
        if missing:
            violations.append(f"{program_course.course_id} -> {', '.join(missing)}")

    if violations:
        if not force:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Prerequisite constraints are not satisfied: " + " | ".join(violations),
            )


def enforce_faculty_overload_preferences(
    payload: OfficialTimetablePayload,
    db: Session,
    force: bool = False,
) -> None:
    faculty_ids = {slot.facultyId for slot in payload.timetable_data}
    if not faculty_ids:
        return

    faculty_records = {
        item.id: item
        for item in db.execute(select(Faculty).where(Faculty.id.in_(faculty_ids))).scalars().all()
    }

    slots_by_faculty_day: dict[tuple[str, str], list] = defaultdict(list)
    for slot in payload.timetable_data:
        slots_by_faculty_day[(slot.facultyId, slot.day)].append(slot)

    for (faculty_id, day), slots in slots_by_faculty_day.items():
        faculty = faculty_records.get(faculty_id)
        if faculty is None:
            continue
        ordered = sorted(slots, key=lambda item: parse_time_to_minutes(item.startTime))
        previous_end: int | None = None
        consecutive_count = 0
        for slot in ordered:
            start = parse_time_to_minutes(slot.startTime)
            end = parse_time_to_minutes(slot.endTime)
            if previous_end is not None:
                gap = start - previous_end
                if gap == 0:
                    consecutive_count += 1
                else:
                    consecutive_count = 0
                if gap < faculty.preferred_min_break_minutes:
                    if not force:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=(
                                f"Faculty {faculty.name} requires at least "
                                f"{faculty.preferred_min_break_minutes} minutes break on {day}"
                            ),
                        )
                if faculty.avoid_back_to_back and gap == 0 and consecutive_count >= 1:
                    if not force:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Faculty {faculty.name} is configured to avoid back-to-back classes on {day}",
                        )
            previous_end = end


def _slot_fingerprints(payload: OfficialTimetablePayload) -> set[tuple[str, str, str, str, str, str, str, str]]:
    return {
        (
            slot.day,
            slot.startTime,
            slot.endTime,
            slot.courseId,
            slot.roomId,
            slot.facultyId,
            slot.section,
            slot.batch or "",
        )
        for slot in payload.timetable_data
    }


def _resolve_impacted_schedule_users(
    db: Session,
    old_payload: OfficialTimetablePayload | None,
    new_payload: OfficialTimetablePayload,
) -> tuple[set[str], set[str]]:
    old_slots = _slot_fingerprints(old_payload) if old_payload else set()
    new_slots = _slot_fingerprints(new_payload)
    changed_slots = old_slots.symmetric_difference(new_slots)
    if not changed_slots:
        return set(), set()

    affected_sections = {
        section.strip().upper()
        for _, _, _, _, _, _, section, _ in changed_slots
        if section and section.strip()
    }
    affected_faculty_ids = {faculty_id for _, _, _, _, _, faculty_id, _, _ in changed_slots}

    faculty_emails: set[str] = set()
    for p_load in [p for p in (old_payload, new_payload) if p]:
        faculty_emails.update(
            item.email.strip().lower()
            for item in p_load.faculty_data
            if item.id in affected_faculty_ids and item.email and item.email.strip()
        )

    faculty_user_ids: set[str] = set()
    if faculty_emails:
        faculty_user_ids = set(
            db.execute(
                select(User.id).where(
                    User.role == UserRole.faculty,
                    func.lower(User.email).in_(faculty_emails),
                )
            ).scalars()
        )

    student_user_ids: set[str] = set()
    if affected_sections:
        students = list(
            db.execute(
                select(User.id, User.section_name).where(User.role == UserRole.student)
            ).all()
        )
        for user_id, section_name in students:
            normalized = (section_name or "").strip().upper()
            if normalized in affected_sections:
                student_user_ids.add(user_id)

    return faculty_user_ids, student_user_ids


def _version_summary(payload: OfficialTimetablePayload, conflicts: list[TimetableConflict]) -> dict:
    return {
        "program_id": payload.program_id,
        "term_number": payload.term_number,
        "slots": len(payload.timetable_data),
        "conflicts": len(conflicts),
    }


def _next_version_label(db: Session) -> str:
    versions = db.execute(select(TimetableVersion.label)).scalars().all()
    numeric = []
    for label in versions:
        if not label.startswith("v"):
            continue
        suffix = label[1:]
        if suffix.isdigit():
            numeric.append(int(suffix))
    next_index = (max(numeric) + 1) if numeric else 1
    return f"v{next_index}"


def _availability_windows_by_day(windows: list[dict]) -> dict[str, list[tuple[int, int]]]:
    normalized: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for window in windows:
        day = normalize_day(str(window.get("day", "")).strip())
        start_time = window.get("start_time")
        end_time = window.get("end_time")
        if not day or not start_time or not end_time:
            continue
        try:
            start_min = parse_time_to_minutes(start_time)
            end_min = parse_time_to_minutes(end_time)
        except ValueError:
            continue
        if end_min <= start_min:
            continue
        normalized[day].append((start_min, end_min))
    return normalized


def _build_conflicts(payload: OfficialTimetablePayload, db: Session | None = None) -> list[TimetableConflict]:
    conflicts: list[TimetableConflict] = []
    seen_pairs: set[tuple[str, str, str]] = set()
    seen_single: set[tuple[str, str]] = set()

    course_map = {course.id: course for course in payload.course_data}
    faculty_map = {faculty.id: faculty for faculty in payload.faculty_data}
    room_map = {room.id: room for room in payload.room_data}
    shared_groups_by_course: dict[str, list[set[str]]] = {}
    if db is not None and payload.program_id and payload.term_number is not None:
        shared_groups = load_shared_lecture_groups(
            db=db,
            program_id=payload.program_id,
            term_number=payload.term_number,
        )
        shared_groups_by_course = build_shared_group_lookup(shared_groups)

    slots_by_day: dict[str, list] = defaultdict(list)
    for slot in payload.timetable_data:
        slots_by_day[slot.day].append(slot)

    for day, slots in slots_by_day.items():
        for index, slot in enumerate(slots):
            start = parse_time_to_minutes(slot.startTime)
            end = parse_time_to_minutes(slot.endTime)
            for other in slots[index + 1 :]:
                other_start = parse_time_to_minutes(other.startTime)
                other_end = parse_time_to_minutes(other.endTime)
                if not slots_overlap(start, end, other_start, other_end):
                    continue

                slot_pair = tuple(sorted((slot.id, other.id)))
                allow_shared_lecture = is_shared_lecture_overlap_event(
                    slot=slot,
                    other=other,
                    slot_start=start,
                    slot_end=end,
                    other_start=other_start,
                    other_end=other_end,
                    shared_groups_by_course=shared_groups_by_course,
                )

                if slot.roomId == other.roomId and not allow_shared_lecture:
                    conflict_key = ("room-overlap", slot_pair[0], slot_pair[1])
                    if conflict_key not in seen_pairs:
                        seen_pairs.add(conflict_key)
                        room_name = room_map.get(slot.roomId).name if slot.roomId in room_map else slot.roomId
                        conflicts.append(
                            TimetableConflict(
                                id=f"room-{slot_pair[0]}-{slot_pair[1]}",
                                type="room-overlap",
                                severity="high",
                                description=f"Room {room_name} is double-booked on {day}.",
                                affectedSlots=list(slot_pair),
                                resolution="Move one class to another room or non-overlapping time slot.",
                            )
                        )

                if slot.facultyId == other.facultyId and not allow_shared_lecture:
                    conflict_key = ("faculty-overlap", slot_pair[0], slot_pair[1])
                    if conflict_key not in seen_pairs:
                        seen_pairs.add(conflict_key)
                        faculty_name = (
                            faculty_map.get(slot.facultyId).name if slot.facultyId in faculty_map else slot.facultyId
                        )
                        conflicts.append(
                            TimetableConflict(
                                id=f"faculty-{slot_pair[0]}-{slot_pair[1]}",
                                type="faculty-overlap",
                                severity="high",
                                description=f"{faculty_name} is assigned to overlapping sessions on {day}.",
                                affectedSlots=list(slot_pair),
                                resolution="Reassign one session to another faculty member or time slot.",
                            )
                        )

                if slot.section == other.section:
                    course_a = course_map.get(slot.courseId)
                    course_b = course_map.get(other.courseId)
                    is_parallel_lab = (
                        course_a is not None
                        and course_b is not None
                        and course_a.type == "lab"
                        and course_b.type == "lab"
                        and slot.courseId == other.courseId
                        and slot.batch
                        and other.batch
                        and slot.batch != other.batch
                    )
                    if not is_parallel_lab:
                        conflict_key = ("section-overlap", slot_pair[0], slot_pair[1])
                        if conflict_key not in seen_pairs:
                            seen_pairs.add(conflict_key)
                            conflicts.append(
                                TimetableConflict(
                                    id=f"section-{slot_pair[0]}-{slot_pair[1]}",
                                    type="section-overlap",
                                    severity="high",
                                    description=f"Section {slot.section} has overlapping classes on {day}.",
                                    affectedSlots=list(slot_pair),
                                    resolution="Move one class so section sessions do not overlap.",
                                )
                            )

    if db is not None and payload.program_id and payload.term_number is not None:
        conflict_pairs = load_elective_overlap_pairs(
            db=db,
            program_id=payload.program_id,
            term_number=payload.term_number,
        )
        if conflict_pairs:
            for day, slots in slots_by_day.items():
                for index, slot in enumerate(slots):
                    start = parse_time_to_minutes(slot.startTime)
                    end = parse_time_to_minutes(slot.endTime)
                    for other in slots[index + 1 :]:
                        if slot.courseId == other.courseId:
                            continue
                        if not courses_conflict_in_elective_group(slot.courseId, other.courseId, conflict_pairs):
                            continue
                        other_start = parse_time_to_minutes(other.startTime)
                        other_end = parse_time_to_minutes(other.endTime)
                        if not slots_overlap(start, end, other_start, other_end):
                            continue

                        slot_pair = tuple(sorted((slot.id, other.id)))
                        conflict_key = ("elective-overlap", slot_pair[0], slot_pair[1])
                        if conflict_key not in seen_pairs:
                            seen_pairs.add(conflict_key)
                            conflicts.append(
                                TimetableConflict(
                                    id=f"elective-{slot_pair[0]}-{slot_pair[1]}",
                                    type="elective-overlap",
                                    severity="medium",
                                    description=(
                                        f"Elective courses {slot.courseId} and {other.courseId} overlap on {day} "
                                        "for a configured elective group."
                                    ),
                                    affectedSlots=list(slot_pair),
                                    resolution=(
                                        "Move one elective to a different time slot to avoid overlap "
                                        "for eligible student groups."
                                    ),
                                )
                            )

    faculty_ids_by_course_section: dict[tuple[str, str], set[str]] = defaultdict(set)
    slot_ids_by_course_section: dict[tuple[str, str], list[str]] = defaultdict(list)
    for slot in payload.timetable_data:
        course = course_map.get(slot.courseId)
        if course is not None and getattr(course, "type", None) == "lab":
            continue
        key = (slot.courseId, slot.section)
        faculty_ids_by_course_section[key].add(slot.facultyId)
        slot_ids_by_course_section[key].append(slot.id)

    for (course_id, section_name), faculty_ids in faculty_ids_by_course_section.items():
        if len(faculty_ids) <= 1:
            continue
        key = ("course-faculty-inconsistency", course_id, section_name)
        if key in seen_single:
            continue
        seen_single.add(key)
        course = course_map.get(course_id)
        course_label = course.code if course is not None else course_id
        faculty_labels = ", ".join(
            sorted(faculty_map.get(faculty_id).name if faculty_id in faculty_map else faculty_id for faculty_id in faculty_ids)
        )
        conflicts.append(
            TimetableConflict(
                id=f"course-faculty-{course_id}-{section_name}",
                type="course-faculty-inconsistency",
                severity="high",
                description=(
                    f"Course {course_label} in section {section_name} is assigned to multiple faculty: "
                    f"{faculty_labels}."
                ),
                affectedSlots=sorted(slot_ids_by_course_section.get((course_id, section_name), [])),
                resolution="Assign one faculty member to this course within the section.",
            )
        )

    for slot in payload.timetable_data:
        room = room_map.get(slot.roomId)
        if room is not None and slot.studentCount is not None and slot.studentCount > room.capacity:
            key = ("capacity", slot.id)
            if key not in seen_single:
                seen_single.add(key)
                conflicts.append(
                    TimetableConflict(
                        id=f"capacity-{slot.id}",
                        type="capacity",
                        severity="medium",
                        description=(
                            f"Room {room.name} capacity ({room.capacity}) is below "
                            f"student count ({slot.studentCount}) for slot {slot.id}."
                        ),
                        affectedSlots=[slot.id],
                        resolution="Assign a larger room or reduce section/batch size for this slot.",
                    )
                )

    faculty_windows = {item.id: _availability_windows_by_day(getattr(item, "availability_windows", [])) for item in payload.faculty_data}
    room_windows = {item.id: _availability_windows_by_day(getattr(item, "availability_windows", [])) for item in payload.room_data}

    for slot in payload.timetable_data:
        start = parse_time_to_minutes(slot.startTime)
        end = parse_time_to_minutes(slot.endTime)
        day = slot.day

        faculty = faculty_map.get(slot.facultyId)
        if faculty is not None:
            if faculty.availability:
                allowed_days = {normalize_day(item) for item in faculty.availability}
                if day not in allowed_days:
                    key = ("availability", f"faculty-day-{slot.id}")
                    if key not in seen_single:
                        seen_single.add(key)
                        conflicts.append(
                            TimetableConflict(
                                id=f"availability-faculty-day-{slot.id}",
                                type="availability",
                                severity="medium",
                                description=f"{faculty.name} is scheduled on unavailable day {day}.",
                                affectedSlots=[slot.id],
                                resolution="Move the class to a day marked available by the faculty member.",
                            )
                        )

            day_windows = faculty_windows.get(faculty.id, {}).get(day, [])
            if day_windows and not any(window_start <= start and end <= window_end for window_start, window_end in day_windows):
                key = ("availability", f"faculty-window-{slot.id}")
                if key not in seen_single:
                    seen_single.add(key)
                    conflicts.append(
                        TimetableConflict(
                            id=f"availability-faculty-window-{slot.id}",
                            type="availability",
                            severity="medium",
                            description=f"{faculty.name} is scheduled outside configured availability window on {day}.",
                            affectedSlots=[slot.id],
                            resolution="Shift class timing to match the faculty availability window.",
                        )
                    )

        room = room_map.get(slot.roomId)
        if room is not None:
            day_windows = room_windows.get(room.id, {}).get(day, [])
            if day_windows and not any(window_start <= start and end <= window_end for window_start, window_end in day_windows):
                key = ("availability", f"room-window-{slot.id}")
                if key not in seen_single:
                    seen_single.add(key)
                    conflicts.append(
                        TimetableConflict(
                            id=f"availability-room-window-{slot.id}",
                            type="availability",
                            severity="medium",
                            description=f"Room {room.name} is scheduled outside configured availability window on {day}.",
                            affectedSlots=[slot.id],
                            resolution="Move session to a room-available window or a different room.",
                        )
                    )

    return conflicts


def _slot_duration_minutes(slot: object) -> int:
    return parse_time_to_minutes(slot.endTime) - parse_time_to_minutes(slot.startTime)


def _room_matches_course_type(room: object, course: object | None) -> bool:
    if course is None:
        return True
    if getattr(course, "type", None) == "lab":
        return getattr(room, "type", None) == "lab"
    return True


def _faculty_available_for_window(
    *,
    faculty_payload: object,
    faculty_record: Faculty | None,
    day: str,
    start: int,
    end: int,
) -> bool:
    availability = (
        list(getattr(faculty_record, "availability", []))
        if faculty_record is not None
        else list(getattr(faculty_payload, "availability", []))
    )
    if availability:
        allowed_days = {normalize_day(item) for item in availability}
        if day not in allowed_days:
            return False

    windows = list(getattr(faculty_record, "availability_windows", [])) if faculty_record is not None else []
    if windows:
        by_day = _availability_windows_by_day(windows)
        day_windows = by_day.get(day, [])
        if not day_windows:
            return False
        if not any(window_start <= start and end <= window_end for window_start, window_end in day_windows):
            return False
    return True


def _room_available_for_window(
    *,
    room_record: object | None,
    day: str,
    start: int,
    end: int,
) -> bool:
    windows = list(getattr(room_record, "availability_windows", [])) if room_record is not None else []
    if not windows:
        return True
    by_day = _availability_windows_by_day(windows)
    day_windows = by_day.get(day, [])
    if not day_windows:
        return False
    return any(window_start <= start and end <= window_end for window_start, window_end in day_windows)


def _is_parallel_lab_allowed(slot: object, other: object, course_map: dict[str, object]) -> bool:
    course_a = course_map.get(slot.courseId)
    course_b = course_map.get(other.courseId)
    return (
        course_a is not None
        and course_b is not None
        and getattr(course_a, "type", None) == "lab"
        and getattr(course_b, "type", None) == "lab"
        and slot.courseId == other.courseId
        and slot.batch
        and other.batch
        and slot.batch != other.batch
    )


def _resource_placement_conflicts(
    *,
    payload: OfficialTimetablePayload,
    slot_id: str,
    course_id: str,
    section: str,
    batch: str | None,
    day: str,
    start: int,
    end: int,
    room_id: str,
    faculty_id: str,
    course_map: dict[str, object],
    elective_pairs: set[tuple[str, str]],
) -> bool:
    for other in payload.timetable_data:
        if other.id == slot_id:
            continue
        if other.day != day:
            continue

        other_start = parse_time_to_minutes(other.startTime)
        other_end = parse_time_to_minutes(other.endTime)
        if not slots_overlap(start, end, other_start, other_end):
            continue

        if other.roomId == room_id:
            return True
        if other.facultyId == faculty_id:
            return True
        if other.section == section:
            probe = deepcopy(other.model_dump())
            probe["courseId"] = course_id
            probe["batch"] = batch
            probe_slot = type(other).model_validate(probe)
            if not _is_parallel_lab_allowed(probe_slot, other, course_map):
                return True
        if courses_conflict_in_elective_group(course_id, other.courseId, elective_pairs):
            return True
    return False


def _build_time_block_candidates(
    *,
    payload: OfficialTimetablePayload,
    db: Session,
    duration_minutes: int,
) -> list[tuple[str, int, int]]:
    if duration_minutes <= 0:
        return []
    schedule_policy = load_schedule_policy(db)
    if duration_minutes % schedule_policy.period_minutes != 0:
        return []

    working_hours = load_working_hours(db)
    candidates: list[tuple[str, int, int]] = []
    for day, entry in working_hours.items():
        if not entry.enabled:
            continue
        segments = build_teaching_segments(
            day_start=parse_time_to_minutes(entry.start_time),
            day_end=parse_time_to_minutes(entry.end_time),
            period_minutes=schedule_policy.period_minutes,
            breaks=schedule_policy.breaks,
        )
        for segment_start, _ in segments:
            segment_end = segment_start + duration_minutes
            if is_slot_aligned_with_segments(segment_start, segment_end, segments):
                candidates.append((day, segment_start, segment_end))
    return candidates


def _find_room_candidate(
    *,
    payload: OfficialTimetablePayload,
    slot: object,
    course_map: dict[str, object],
    db_room_map: dict[str, object],
    elective_pairs: set[tuple[str, str]],
    day: str,
    start: int,
    end: int,
    current_faculty_id: str,
) -> str | None:
    course = course_map.get(slot.courseId)
    ranked: list[tuple[int, int, str]] = []
    for room in payload.room_data:
        if room.id == slot.roomId:
            continue
        if not _room_matches_course_type(room, course):
            continue
        if slot.studentCount is not None and room.capacity < slot.studentCount:
            continue
        if not _room_available_for_window(
            room_record=db_room_map.get(room.id),
            day=day,
            start=start,
            end=end,
        ):
            continue
        if _resource_placement_conflicts(
            payload=payload,
            slot_id=slot.id,
            course_id=slot.courseId,
            section=slot.section,
            batch=slot.batch,
            day=day,
            start=start,
            end=end,
            room_id=room.id,
            faculty_id=current_faculty_id,
            course_map=course_map,
            elective_pairs=elective_pairs,
        ):
            continue
        capacity_delta = room.capacity - (slot.studentCount or 0)
        ranked.append((capacity_delta if capacity_delta >= 0 else 10_000, room.capacity, room.id))
    ranked.sort(key=lambda item: (item[0], item[1]))
    return ranked[0][2] if ranked else None


def _find_faculty_candidate(
    *,
    payload: OfficialTimetablePayload,
    slot: object,
    course_map: dict[str, object],
    db_faculty_map: dict[str, Faculty],
    elective_pairs: set[tuple[str, str]],
    day: str,
    start: int,
    end: int,
    current_room_id: str,
) -> str | None:
    course = course_map.get(slot.courseId)
    course_code = str(getattr(course, "code", "")).strip().upper()
    faculty_payload_map = {item.id: item for item in payload.faculty_data}
    assigned_minutes: dict[str, int] = defaultdict(int)
    for item in payload.timetable_data:
        assigned_minutes[item.facultyId] += _slot_duration_minutes(item)

    ranked: list[tuple[float, str]] = []
    for faculty_id, faculty_payload in faculty_payload_map.items():
        if faculty_id == slot.facultyId:
            continue
        faculty_record = db_faculty_map.get(faculty_id)
        if not _faculty_available_for_window(
            faculty_payload=faculty_payload,
            faculty_record=faculty_record,
            day=day,
            start=start,
            end=end,
        ):
            continue

        max_hours = (
            faculty_record.max_hours
            if faculty_record is not None
            else int(getattr(faculty_payload, "maxHours", 0))
        )
        projected_minutes = assigned_minutes.get(faculty_id, 0) + (end - start)
        if max_hours and projected_minutes > (max_hours * 60):
            continue

        if _resource_placement_conflicts(
            payload=payload,
            slot_id=slot.id,
            course_id=slot.courseId,
            section=slot.section,
            batch=slot.batch,
            day=day,
            start=start,
            end=end,
            room_id=current_room_id,
            faculty_id=faculty_id,
            course_map=course_map,
            elective_pairs=elective_pairs,
        ):
            continue

        preferred_codes = {
            str(item).strip().upper()
            for item in (
                faculty_record.preferred_subject_codes if faculty_record is not None else []
            )
            if str(item).strip()
        }
        preference_bonus = 100.0 if course_code and course_code in preferred_codes else 0.0
        department_bonus = 20.0 if getattr(faculty_payload, "department", None) == getattr(
            faculty_payload_map.get(slot.facultyId), "department", None
        ) else 0.0
        workload_balance = max(0.0, float(max_hours * 60 - assigned_minutes.get(faculty_id, 0)) / 60.0)
        score = preference_bonus + department_bonus + workload_balance
        ranked.append((score, faculty_id))

    ranked.sort(key=lambda item: item[0], reverse=True)
    return ranked[0][1] if ranked else None


def _apply_best_effort_resolution(
    *,
    payload: OfficialTimetablePayload,
    conflict: TimetableConflict,
    db: Session,
) -> tuple[OfficialTimetablePayload | None, str]:
    slots_by_id = {slot.id: slot for slot in payload.timetable_data}
    target_slot_id = conflict.affected_slots[-1] if conflict.affected_slots else None
    if target_slot_id is None or target_slot_id not in slots_by_id:
        return None, "Conflict has no actionable slot reference."

    slot = slots_by_id[target_slot_id]
    start = parse_time_to_minutes(slot.startTime)
    end = parse_time_to_minutes(slot.endTime)
    duration = end - start
    course_map = {course.id: course for course in payload.course_data}
    db_faculty_map = {item.id: item for item in db.execute(select(Faculty)).scalars().all()}
    db_room_map = {item.id: item for item in db.execute(select(Room)).scalars().all()}
    elective_pairs: set[tuple[str, str]] = set()
    if payload.program_id and payload.term_number is not None:
        elective_pairs = load_elective_overlap_pairs(
            db=db,
            program_id=payload.program_id,
            term_number=payload.term_number,
        )

    # 1) Prefer non-temporal changes first.
    if conflict.type in {"room-overlap", "capacity", "availability"}:
        replacement_room = _find_room_candidate(
            payload=payload,
            slot=slot,
            course_map=course_map,
            db_room_map=db_room_map,
            elective_pairs=elective_pairs,
            day=slot.day,
            start=start,
            end=end,
            current_faculty_id=slot.facultyId,
        )
        if replacement_room:
            slot.roomId = replacement_room
            return payload, "Resolved by assigning an alternate compatible room."

    if conflict.type in {"faculty-overlap", "availability"}:
        replacement_faculty = _find_faculty_candidate(
            payload=payload,
            slot=slot,
            course_map=course_map,
            db_faculty_map=db_faculty_map,
            elective_pairs=elective_pairs,
            day=slot.day,
            start=start,
            end=end,
            current_room_id=slot.roomId,
        )
        if replacement_faculty:
            slot.facultyId = replacement_faculty
            return payload, "Resolved by assigning an available faculty substitute."

    # 2) If still unresolved, move the slot to the nearest valid time block.
    candidate_blocks = _build_time_block_candidates(payload=payload, db=db, duration_minutes=duration)
    for day, candidate_start, candidate_end in candidate_blocks:
        if day == slot.day and candidate_start == start:
            continue

        candidate_room_id = slot.roomId
        candidate_faculty_id = slot.facultyId

        if not _room_available_for_window(
            room_record=db_room_map.get(candidate_room_id),
            day=day,
            start=candidate_start,
            end=candidate_end,
        ):
            replacement_room = _find_room_candidate(
                payload=payload,
                slot=slot,
                course_map=course_map,
                db_room_map=db_room_map,
                elective_pairs=elective_pairs,
                day=day,
                start=candidate_start,
                end=candidate_end,
                current_faculty_id=candidate_faculty_id,
            )
            if replacement_room is None:
                continue
            candidate_room_id = replacement_room

        faculty_payload = next((item for item in payload.faculty_data if item.id == candidate_faculty_id), None)
        if faculty_payload is None or not _faculty_available_for_window(
            faculty_payload=faculty_payload,
            faculty_record=db_faculty_map.get(candidate_faculty_id),
            day=day,
            start=candidate_start,
            end=candidate_end,
        ):
            replacement_faculty = _find_faculty_candidate(
                payload=payload,
                slot=slot,
                course_map=course_map,
                db_faculty_map=db_faculty_map,
                elective_pairs=elective_pairs,
                day=day,
                start=candidate_start,
                end=candidate_end,
                current_room_id=candidate_room_id,
            )
            if replacement_faculty is None:
                continue
            candidate_faculty_id = replacement_faculty

        if _resource_placement_conflicts(
            payload=payload,
            slot_id=slot.id,
            course_id=slot.courseId,
            section=slot.section,
            batch=slot.batch,
            day=day,
            start=candidate_start,
            end=candidate_end,
            room_id=candidate_room_id,
            faculty_id=candidate_faculty_id,
            course_map=course_map,
            elective_pairs=elective_pairs,
        ):
            continue

        slot.day = day
        slot.startTime = f"{candidate_start // 60:02d}:{candidate_start % 60:02d}"
        slot.endTime = f"{candidate_end // 60:02d}:{candidate_end % 60:02d}"
        slot.roomId = candidate_room_id
        slot.facultyId = candidate_faculty_id
        return payload, "Resolved by moving the slot to a conflict-free teaching block."

    return None, "No safe automatic resolution found; apply the recommendation manually."


def _load_conflict_decision_map(db: Session) -> dict[str, TimetableConflictDecision]:
    rows = db.execute(select(TimetableConflictDecision)).scalars().all()
    return {item.conflict_id: item for item in rows}


def _decision_snapshot_to_conflict(snapshot: dict) -> TimetableConflict | None:
    try:
        return TimetableConflict(
            id=str(snapshot.get("id", "")),
            type=str(snapshot.get("type", "availability")),
            severity=str(snapshot.get("severity", "low")),
            description=str(snapshot.get("description", "Resolved conflict")),
            affectedSlots=list(snapshot.get("affectedSlots", [])),
            resolution=str(snapshot.get("resolution", "Resolved")),
            resolved=True,
        )
    except Exception:
        return None


def _merge_conflicts_with_decisions(
    *,
    conflicts: list[TimetableConflict],
    decisions: dict[str, TimetableConflictDecision],
) -> list[TimetableConflict]:
    merged: list[TimetableConflict] = []
    existing_ids: set[str] = set()
    for conflict in conflicts:
        decision = decisions.get(conflict.id)
        if decision is not None and decision.decision == ConflictDecision.yes and decision.resolved:
            conflict.resolved = True
        merged.append(conflict)
        existing_ids.add(conflict.id)

    for decision in decisions.values():
        if decision.decision != ConflictDecision.yes or not decision.resolved:
            continue
        if decision.conflict_id in existing_ids:
            continue
        recovered = _decision_snapshot_to_conflict(decision.conflict_snapshot or {})
        if recovered is not None:
            merged.append(recovered)

    return merged


def _status_from_score(score: float) -> str:
    if score >= 95:
        return "satisfied"
    if score >= 70:
        return "partial"
    return "violated"


def _build_constraint_metrics(payload: OfficialTimetablePayload, conflicts: list[TimetableConflict]) -> list[ConstraintStatus]:
    total_slots = max(1, len(payload.timetable_data))
    by_type: dict[str, int] = defaultdict(int)
    for conflict in conflicts:
        by_type[conflict.type] += 1

    availability_score = max(0.0, 100.0 - (by_type.get("availability", 0) * 100.0 / total_slots))
    capacity_score = max(0.0, 100.0 - (by_type.get("capacity", 0) * 100.0 / total_slots))
    overlap_score = max(
        0.0,
        100.0
        - (
            (
                by_type.get("faculty-overlap", 0)
                + by_type.get("room-overlap", 0)
                + by_type.get("section-overlap", 0)
                + by_type.get("elective-overlap", 0)
                + by_type.get("course-faculty-inconsistency", 0)
            )
            * 100.0
            / total_slots
        ),
    )

    lab_slots = [
        slot
        for slot in payload.timetable_data
        if (course := next((item for item in payload.course_data if item.id == slot.courseId), None)) is not None
        and course.type == "lab"
    ]
    lab_groups: dict[tuple[str, str, str], list] = defaultdict(list)
    for slot in lab_slots:
        batch = slot.batch or "default"
        lab_groups[(slot.courseId, slot.section, batch)].append(slot)
    lab_violations = 0
    for slots in lab_groups.values():
        by_day: dict[str, list] = defaultdict(list)
        for slot in slots:
            by_day[slot.day].append(slot)
        for day_slots in by_day.values():
            if len(day_slots) <= 1:
                continue
            ordered = sorted(day_slots, key=lambda item: parse_time_to_minutes(item.startTime))
            for left, right in zip(ordered, ordered[1:]):
                if parse_time_to_minutes(left.endTime) != parse_time_to_minutes(right.startTime):
                    lab_violations += 1
    lab_score = max(0.0, 100.0 - (lab_violations * 100.0 / max(1, len(lab_slots))))

    faculty_minutes: dict[str, int] = defaultdict(int)
    faculty_max: dict[str, int] = {}
    for faculty in payload.faculty_data:
        faculty_max[faculty.id] = faculty.maxHours * 60
    for slot in payload.timetable_data:
        faculty_minutes[slot.facultyId] += parse_time_to_minutes(slot.endTime) - parse_time_to_minutes(slot.startTime)

    workload_hours = [minutes / 60.0 for minutes in faculty_minutes.values()]
    if workload_hours:
        average = sum(workload_hours) / len(workload_hours)
        std_dev = sqrt(sum((value - average) ** 2 for value in workload_hours) / len(workload_hours))
    else:
        std_dev = 0.0
    overload_penalty = 0.0
    for faculty_id, minutes in faculty_minutes.items():
        max_minutes = faculty_max.get(faculty_id, 0)
        if max_minutes and minutes > max_minutes:
            overload_penalty += (minutes - max_minutes) / 60.0
    workload_score = max(0.0, 100.0 - (std_dev * 10.0) - (overload_penalty * 4.0))

    metrics = [
        ConstraintStatus(
            name="Faculty Availability",
            description="Sessions are assigned within faculty availability settings.",
            satisfaction=round(availability_score, 1),
            status=_status_from_score(availability_score),
        ),
        ConstraintStatus(
            name="Room Capacity",
            description="Room assignments satisfy expected student capacity.",
            satisfaction=round(capacity_score, 1),
            status=_status_from_score(capacity_score),
        ),
        ConstraintStatus(
            name="Conflict-Free Allocation",
            description="No faculty, room, or section overlaps exist in the timetable.",
            satisfaction=round(overlap_score, 1),
            status=_status_from_score(overlap_score),
        ),
        ConstraintStatus(
            name="Lab Continuity",
            description="Lab sessions remain contiguous and unsplit in scheduled blocks.",
            satisfaction=round(lab_score, 1),
            status=_status_from_score(lab_score),
        ),
        ConstraintStatus(
            name="Workload Balance",
            description="Faculty workload remains balanced and under configured limits.",
            satisfaction=round(workload_score, 1),
            status=_status_from_score(workload_score),
        ),
    ]
    return metrics


def _build_workload_chart(payload: OfficialTimetablePayload) -> list[WorkloadChartEntry]:
    faculty_minutes: dict[str, int] = defaultdict(int)
    for slot in payload.timetable_data:
        faculty_minutes[slot.facultyId] += parse_time_to_minutes(slot.endTime) - parse_time_to_minutes(slot.startTime)

    entries: list[WorkloadChartEntry] = []
    for faculty in payload.faculty_data:
        assigned_hours = faculty_minutes.get(faculty.id, 0) / 60.0
        short_name = faculty.name.split(" ")[-1] if faculty.name else faculty.id
        entries.append(
            WorkloadChartEntry(
                id=faculty.id,
                name=short_name,
                fullName=faculty.name,
                department=faculty.department,
                workload=round(assigned_hours, 2),
                max=float(faculty.maxHours),
                overloaded=assigned_hours > faculty.maxHours,
            )
        )
    return entries


def _build_daily_workload(payload: OfficialTimetablePayload) -> list[DailyWorkloadEntry]:
    day_faculty_minutes: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for slot in payload.timetable_data:
        duration = parse_time_to_minutes(slot.endTime) - parse_time_to_minutes(slot.startTime)
        day_faculty_minutes[slot.day][slot.facultyId] += duration

    ordered_days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    daily: list[DailyWorkloadEntry] = []
    for day in ordered_days:
        faculty_map = day_faculty_minutes.get(day)
        if not faculty_map:
            continue
        loads = {faculty_id: round(minutes / 60.0, 2) for faculty_id, minutes in faculty_map.items()}
        total = round(sum(loads.values()), 2)
        daily.append(DailyWorkloadEntry(day=day, loads=loads, total=total))
    return daily


def _semester_label(payload: OfficialTimetablePayload) -> str:
    if payload.term_number is None:
        return "Current"
    return f"Term {payload.term_number}"


def _build_analytics(payload: OfficialTimetablePayload, conflicts: list[TimetableConflict], db: Session) -> TimetableAnalytics:
    constraint_data = _build_constraint_metrics(payload, conflicts)
    workload_chart_data = _build_workload_chart(payload)
    daily_workload_data = _build_daily_workload(payload)
    overall_satisfaction = round(
        sum(item.satisfaction for item in constraint_data) / max(1, len(constraint_data)),
        1,
    )

    generation_settings = db.get(TimetableGenerationSettings, 1)
    total_iterations = 0
    if generation_settings is not None:
        total_iterations = generation_settings.population_size * generation_settings.generations
    compute_time = "N/A"
    if total_iterations:
        # Coarse estimate for dashboard visibility only.
        compute_time = f"~{max(1, total_iterations // 2500)} sec"

    record = db.get(OfficialTimetable, 1)
    last_generated = record.updated_at.isoformat() if record is not None and record.updated_at is not None else None

    optimization_summary = OptimizationSummary(
        constraintSatisfaction=overall_satisfaction,
        conflictsDetected=len(conflicts),
        optimizationTechnique="Evolutionary Algorithm",
        alternativesGenerated=1,
        lastGenerated=last_generated,
        totalIterations=total_iterations,
        computeTime=compute_time,
    )

    performance_trend_data = [
        PerformanceTrendEntry(
            semester=_semester_label(payload),
            satisfaction=overall_satisfaction,
            conflicts=len(conflicts),
        )
    ]

    return TimetableAnalytics(
        optimizationSummary=optimization_summary,
        constraintData=constraint_data,
        workloadChartData=workload_chart_data,
        dailyWorkloadData=daily_workload_data,
        performanceTrendData=performance_trend_data,
    )


def _load_official_payload(db: Session) -> OfficialTimetablePayload:
    record = db.get(OfficialTimetable, 1)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Official timetable not found")
    return OfficialTimetablePayload.model_validate(record.payload)


def _slice_payload_by_slots(
    payload: OfficialTimetablePayload,
    slots: list[object],
) -> OfficialTimetablePayload:
    selected_slots = list(slots)
    course_ids = {slot.courseId for slot in selected_slots}
    room_ids = {slot.roomId for slot in selected_slots}
    faculty_ids = {slot.facultyId for slot in selected_slots}

    return OfficialTimetablePayload.model_validate(
        {
            "programId": payload.program_id,
            "termNumber": payload.term_number,
            "facultyData": [
                item.model_dump(by_alias=True)
                for item in payload.faculty_data
                if item.id in faculty_ids
            ],
            "courseData": [
                item.model_dump(by_alias=True)
                for item in payload.course_data
                if item.id in course_ids
            ],
            "roomData": [
                item.model_dump(by_alias=True)
                for item in payload.room_data
                if item.id in room_ids
            ],
            "timetableData": [slot.model_dump(by_alias=True) for slot in selected_slots],
        }
    )


def _scope_official_payload_for_user(
    payload: OfficialTimetablePayload,
    user: User,
    db: Session,
) -> OfficialTimetablePayload:
    if user.role in {UserRole.admin, UserRole.scheduler}:
        return payload

    if user.role == UserRole.student:
        section = (user.section_name or "").strip().upper()
        if not section:
            return _slice_payload_by_slots(payload, [])
        return _slice_payload_by_slots(
            payload,
            [slot for slot in payload.timetable_data if slot.section.strip().upper() == section],
        )

    if user.role == UserRole.faculty:
        user_email = (user.email or "").strip().lower()
        faculty_ids = {
            item.id
            for item in payload.faculty_data
            if (item.email or "").strip().lower() == user_email
        }
        if not faculty_ids and user_email:
            faculty_match = (
                db.execute(
                    select(Faculty.id).where(func.lower(Faculty.email) == user_email)
                )
                .scalars()
                .first()
            )
            if faculty_match:
                faculty_ids.add(faculty_match)

        if not faculty_ids:
            return _slice_payload_by_slots(payload, [])

        return _slice_payload_by_slots(
            payload,
            [slot for slot in payload.timetable_data if slot.facultyId in faculty_ids],
        )

    return _slice_payload_by_slots(payload, [])




ORDERED_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
DAY_ORDER = {day: index for index, day in enumerate(ORDERED_DAYS)}


def _matches_offline_filters(payload: OfficialTimetablePayload, filters: OfflinePublishFilters | None) -> bool:
    if filters is None:
        return True
    if filters.program_id:
        if payload.program_id is None:
            return False
        if filters.program_id != payload.program_id:
            return False
    if filters.term_number is not None:
        if payload.term_number is None:
            return False
        if filters.term_number != payload.term_number:
            return False
    return True


def _filter_payload_for_offline_publish(
    payload: OfficialTimetablePayload,
    filters: OfflinePublishFilters | None,
) -> OfficialTimetablePayload:
    if filters is None:
        return payload
    if not _matches_offline_filters(payload, filters):
        return _slice_payload_by_slots(payload, [])

    department = filters.department.strip().lower() if filters.department else None
    section_name = filters.section_name.strip().upper() if filters.section_name else None
    faculty_id = filters.faculty_id
    faculty_department = {
        item.id: item.department.strip().lower()
        for item in payload.faculty_data
        if item.department and item.department.strip()
    }

    scoped_slots: list[object] = []
    for slot in payload.timetable_data:
        if section_name and slot.section.strip().upper() != section_name:
            continue
        if faculty_id and slot.facultyId != faculty_id:
            continue
        if department:
            slot_department = faculty_department.get(slot.facultyId)
            if slot_department != department:
                continue
        scoped_slots.append(slot)
    return _slice_payload_by_slots(payload, scoped_slots)


def _sort_timetable_slots(slots: list[object]) -> list[object]:
    return sorted(
        slots,
        key=lambda slot: (
            DAY_ORDER.get(slot.day, 99),
            parse_time_to_minutes(slot.startTime),
            slot.section,
            slot.batch or "",
            slot.id,
        ),
    )


def _build_timetable_email_content(
    *,
    user: User,
    payload: OfficialTimetablePayload,
    scope_label: str,
) -> tuple[str, str]:
    sorted_slots = _sort_timetable_slots(payload.timetable_data)
    course_by_id = {item.id: item for item in payload.course_data}
    room_by_id = {item.id: item for item in payload.room_data}
    faculty_by_id = {item.id: item for item in payload.faculty_data}

    lines: list[str] = [
        f"Hello {user.name},",
        "",
        f"Your ShedForge timetable is attached below ({scope_label}).",
        "",
    ]
    row_html: list[str] = []
    for slot in sorted_slots:
        course = course_by_id.get(slot.courseId)
        room = room_by_id.get(slot.roomId)
        faculty = faculty_by_id.get(slot.facultyId)
        batch = f" Batch {slot.batch}" if slot.batch else ""
        lines.append(
            (
                f"- {slot.day} {slot.startTime}-{slot.endTime} | "
                f"{course.code if course else slot.courseId} {course.name if course else ''} | "
                f"Section {slot.section}{batch} | "
                f"Room {room.name if room else slot.roomId} | "
                f"Faculty {faculty.name if faculty else slot.facultyId}"
            )
        )
        row_html.append(
            "<tr>"
            f"<td>{escape(slot.day)}</td>"
            f"<td>{escape(slot.startTime)} - {escape(slot.endTime)}</td>"
            f"<td>{escape(course.code if course else slot.courseId)}</td>"
            f"<td>{escape(course.name if course else '')}</td>"
            f"<td>{escape(slot.section)}</td>"
            f"<td>{escape(slot.batch or '')}</td>"
            f"<td>{escape(room.name if room else slot.roomId)}</td>"
            f"<td>{escape(faculty.name if faculty else slot.facultyId)}</td>"
            "</tr>"
        )

    if not sorted_slots:
        lines.append("- No timetable entries found for your profile in this scope.")

    lines.extend(
        [
            "",
            "Regards,",
            "ShedForge Scheduler",
        ]
    )

    html_content = (
        "<html><body>"
        f"<p>Hello {escape(user.name)},</p>"
        f"<p>Your ShedForge timetable is available for <strong>{escape(scope_label)}</strong>.</p>"
        "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;'>"
        "<thead><tr>"
        "<th>Day</th><th>Time</th><th>Course Code</th><th>Course</th>"
        "<th>Section</th><th>Batch</th><th>Room</th><th>Faculty</th>"
        "</tr></thead>"
        "<tbody>"
        + ("".join(row_html) if row_html else "<tr><td colspan='8'>No timetable entries in this scope.</td></tr>")
        + "</tbody></table>"
        "<p>Regards,<br/>ShedForge Scheduler</p>"
        "</body></html>"
    )

    return "\n".join(lines), html_content


def _send_offline_timetable_emails(
    *,
    db: Session,
    payload: OfficialTimetablePayload,
    filters: OfflinePublishFilters | None,
) -> OfflinePublishResponse:
    filtered_payload = _filter_payload_for_offline_publish(payload, filters)
    users = list(
        db.execute(
            select(User).where(
                User.is_active.is_(True),
                User.role.in_([UserRole.faculty, UserRole.student]),
            )
        ).scalars()
    )

    scope_label_parts: list[str] = []
    if filters and filters.term_number is not None:
        scope_label_parts.append(f"Semester {filters.term_number}")
    elif filtered_payload.term_number is not None:
        scope_label_parts.append(f"Semester {filtered_payload.term_number}")
    if filters and filters.section_name:
        scope_label_parts.append(f"Section {filters.section_name}")
    if filters and filters.department:
        scope_label_parts.append(filters.department)
    if filters and filters.faculty_id:
        scope_label_parts.append("Faculty-specific")
    scope_label = ", ".join(scope_label_parts) if scope_label_parts else "Current timetable"

    attempted = 0
    sent = 0
    skipped = 0
    failed = 0
    recipients: list[str] = []
    failed_recipients: list[str] = []

    for user in users:
        if not user.email:
            skipped += 1
            continue

        user_payload = _scope_official_payload_for_user(filtered_payload, user, db)
        if not user_payload.timetable_data:
            skipped += 1
            continue

        attempted += 1
        text_content, html_content = _build_timetable_email_content(
            user=user,
            payload=user_payload,
            scope_label=scope_label,
        )
        try:
            send_email(
                to_email=user.email,
                subject="ShedForge Timetable (Offline Copy)",
                text_content=text_content,
                html_content=html_content,
            )
            recipients.append(user.email)
            sent += 1
            create_notification(
                db,
                user_id=user.id,
                title="Timetable Sent by Email",
                message=f"Your timetable was emailed ({scope_label}).",
                notification_type=NotificationType.timetable,
                recipient=user,
                deliver_email=False,
            )
        except EmailDeliveryError:
            failed += 1
            failed_recipients.append(user.email)

    message = (
        f"Offline publish completed. Sent: {sent}, Failed: {failed}, Skipped: {skipped}."
    )
    return OfflinePublishResponse(
        attempted=attempted,
        sent=sent,
        skipped=skipped,
        failed=failed,
        recipients=recipients,
        failed_recipients=failed_recipients,
        message=message,
    )


@router.get("/official", response_model=OfficialTimetablePayload)
def get_official_timetable(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OfficialTimetablePayload:
    payload = _load_official_payload(db)
    return _scope_official_payload_for_user(payload, current_user, db)


@router.get("/official/faculty-mapping", response_model=list[FacultyCourseSectionMappingOut])
def get_official_faculty_mapping(
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler, UserRole.faculty)),
    db: Session = Depends(get_db),
) -> list[FacultyCourseSectionMappingOut]:
    payload = _load_official_payload(db)
    if current_user.role == UserRole.faculty:
        scoped_payload = _scope_official_payload_for_user(payload, current_user, db)
    else:
        scoped_payload = payload

    faculty_by_id = {item.id: item for item in scoped_payload.faculty_data}
    course_by_id = {item.id: item for item in scoped_payload.course_data}
    room_by_id = {item.id: item for item in scoped_payload.room_data}

    assignments_by_faculty: dict[str, list[FacultyCourseSectionAssignment]] = defaultdict(list)
    assigned_minutes_by_faculty: dict[str, int] = defaultdict(int)

    for slot in scoped_payload.timetable_data:
        faculty = faculty_by_id.get(slot.facultyId)
        course = course_by_id.get(slot.courseId)
        room = room_by_id.get(slot.roomId)
        if faculty is None or course is None or room is None:
            continue

        start_min = parse_time_to_minutes(slot.startTime)
        end_min = parse_time_to_minutes(slot.endTime)
        assigned_minutes_by_faculty[slot.facultyId] += max(0, end_min - start_min)

        assignments_by_faculty[slot.facultyId].append(
            FacultyCourseSectionAssignment(
                course_id=course.id,
                course_code=course.code,
                course_name=course.name,
                section=slot.section,
                batch=slot.batch,
                day=slot.day,
                startTime=slot.startTime,
                endTime=slot.endTime,
                room_id=room.id,
                room_name=room.name,
            )
        )

    output: list[FacultyCourseSectionMappingOut] = []
    for faculty_id, assignments in assignments_by_faculty.items():
        faculty = faculty_by_id.get(faculty_id)
        if faculty is None:
            continue
        assignments.sort(
            key=lambda item: (
                DAY_ORDER.get(item.day, 99),
                parse_time_to_minutes(item.start_time),
                item.course_code,
                item.section,
                item.batch or "",
            )
        )
        output.append(
            FacultyCourseSectionMappingOut(
                faculty_id=faculty.id,
                faculty_name=faculty.name,
                faculty_email=faculty.email,
                total_assigned_hours=round(assigned_minutes_by_faculty.get(faculty.id, 0) / 60.0, 2),
                assignments=assignments,
            )
        )

    output.sort(key=lambda item: item.faculty_name.lower())
    return output


@router.post("/publish-offline", response_model=OfflinePublishResponse)
def publish_offline_timetable(
    payload: OfflinePublishRequest,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> OfflinePublishResponse:
    official_payload = _load_official_payload(db)
    result = _send_offline_timetable_emails(
        db=db,
        payload=official_payload,
        filters=payload.filters,
    )
    log_activity(
        db,
        user=current_user,
        action="timetable.publish_offline",
        entity_type="official_timetable",
        entity_id="1",
        details={
            "attempted": result.attempted,
            "sent": result.sent,
            "failed": result.failed,
            "skipped": result.skipped,
            "filters": payload.model_dump(by_alias=True),
        },
    )
    db.commit()
    return result


@router.post("/publish-offline/all", response_model=OfflinePublishResponse)
def publish_offline_timetable_all(
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> OfflinePublishResponse:
    official_payload = _load_official_payload(db)
    result = _send_offline_timetable_emails(
        db=db,
        payload=official_payload,
        filters=None,
    )
    log_activity(
        db,
        user=current_user,
        action="timetable.publish_offline_all",
        entity_type="official_timetable",
        entity_id="1",
        details={
            "attempted": result.attempted,
            "sent": result.sent,
            "failed": result.failed,
            "skipped": result.skipped,
        },
    )
    db.commit()
    return result


@router.get("/conflicts", response_model=list[TimetableConflict])
def get_timetable_conflicts(
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> list[TimetableConflict]:
    payload = _load_official_payload(db)
    conflicts = _build_conflicts(payload, db)
    decisions = _load_conflict_decision_map(db)
    return _merge_conflicts_with_decisions(conflicts=conflicts, decisions=decisions)


@router.post("/conflicts/analyze", response_model=list[TimetableConflict])
def analyze_timetable_conflicts(
    payload: OfficialTimetablePayload,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> list[TimetableConflict]:
    del current_user
    return _build_conflicts(payload, db)


@router.post("/conflicts/{conflict_id}/decision", response_model=ConflictDecisionOut)
def decide_timetable_conflict(
    conflict_id: str,
    payload: ConflictDecisionIn,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> ConflictDecisionOut:
    record = db.get(OfficialTimetable, 1)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Official timetable not found")

    official_payload = OfficialTimetablePayload.model_validate(record.payload)
    conflicts = _build_conflicts(official_payload, db)
    current = next((item for item in conflicts if item.id == conflict_id), None)

    decision = db.execute(
        select(TimetableConflictDecision).where(TimetableConflictDecision.conflict_id == conflict_id)
    ).scalar_one_or_none()
    if decision is None:
        decision = TimetableConflictDecision(conflict_id=conflict_id, decision=ConflictDecision.no, resolved=False)
        db.add(decision)

    if current is None:
        if decision.decision == ConflictDecision.yes and decision.resolved:
            return ConflictDecisionOut(
                conflict_id=conflict_id,
                decision=decision.decision.value,
                resolved=True,
                message="Conflict is already resolved.",
                published_version_label=None,
            )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conflict not found in current timetable")

    decision.note = payload.note
    decision.decided_by_id = current_user.id
    decision.decision = ConflictDecision(payload.decision)
    decision.conflict_snapshot = current.model_dump(by_alias=True)

    if payload.decision == "no":
        decision.resolved = False
        db.commit()
        return ConflictDecisionOut(
            conflict_id=conflict_id,
            decision=payload.decision,
            resolved=False,
            message="Recommendation skipped. Conflict remains active.",
            published_version_label=None,
        )

    working_payload = OfficialTimetablePayload.model_validate(official_payload.model_dump(by_alias=True))
    resolved_payload, resolution_message = _apply_best_effort_resolution(
        payload=working_payload,
        conflict=current,
        db=db,
    )
    if resolved_payload is None:
        decision.resolved = False
        db.commit()
        return ConflictDecisionOut(
            conflict_id=conflict_id,
            decision=payload.decision,
            resolved=False,
            message=resolution_message,
            published_version_label=None,
        )

    post_conflicts = _build_conflicts(resolved_payload, db)
    if any(item.id == conflict_id for item in post_conflicts):
        decision.resolved = False
        db.commit()
        return ConflictDecisionOut(
            conflict_id=conflict_id,
            decision=payload.decision,
            resolved=False,
            message="Automatic change did not fully resolve this conflict; manual action is required.",
            published_version_label=None,
        )

    record.payload = resolved_payload.model_dump(by_alias=True)
    record.updated_by_id = current_user.id

    version_label = _next_version_label(db)
    db.add(
        TimetableVersion(
            label=version_label,
            payload=resolved_payload.model_dump(by_alias=True),
            summary={
                "program_id": resolved_payload.program_id,
                "term_number": resolved_payload.term_number,
                "slots": len(resolved_payload.timetable_data),
                "source": "conflict-resolution",
                "resolved_conflict_id": conflict_id,
            },
            created_by_id=current_user.id,
        )
    )

    decision.resolved = True
    db.commit()
    return ConflictDecisionOut(
        conflict_id=conflict_id,
        decision=payload.decision,
        resolved=True,
        message=resolution_message,
        published_version_label=version_label,
    )


@router.get("/analytics", response_model=TimetableAnalytics)
def get_timetable_analytics(
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> TimetableAnalytics:
    payload = _load_official_payload(db)
    conflicts = _build_conflicts(payload, db)
    return _build_analytics(payload, conflicts, db)


@router.get("/versions", response_model=list[TimetableVersionOut])
def list_timetable_versions(
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> list[TimetableVersionOut]:
    return list(db.execute(select(TimetableVersion).order_by(TimetableVersion.created_at.desc())).scalars())


@router.get("/versions/compare", response_model=TimetableVersionCompare)
def compare_timetable_versions(
    from_id: str = Query(..., alias="from"),
    to_id: str = Query(..., alias="to"),
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> TimetableVersionCompare:
    from_version = db.get(TimetableVersion, from_id)
    to_version = db.get(TimetableVersion, to_id)
    if from_version is None or to_version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    from_payload = OfficialTimetablePayload.model_validate(from_version.payload)
    to_payload = OfficialTimetablePayload.model_validate(to_version.payload)
    from_slots = _slot_fingerprints(from_payload)
    to_slots = _slot_fingerprints(to_payload)

    added = to_slots - from_slots
    removed = from_slots - to_slots
    changed = min(len(added), len(removed))

    return TimetableVersionCompare(
        from_version_id=from_version.id,
        to_version_id=to_version.id,
        added_slots=len(added),
        removed_slots=len(removed),
        changed_slots=changed,
        from_label=from_version.label,
        to_label=to_version.label,
    )


@router.get("/trends", response_model=list[TimetableTrendPoint])
def timetable_trends(
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> list[TimetableTrendPoint]:
    versions = list(db.execute(select(TimetableVersion).order_by(TimetableVersion.created_at.asc())).scalars())
    trend_points: list[TimetableTrendPoint] = []
    for version in versions:
        payload = OfficialTimetablePayload.model_validate(version.payload)
        conflicts = _build_conflicts(payload, db)
        analytics = _build_analytics(payload, conflicts, db)
        trend_points.append(
            TimetableTrendPoint(
                version_id=version.id,
                label=version.label,
                created_at=version.created_at,
                constraint_satisfaction=analytics.optimization_summary.constraint_satisfaction,
                conflicts_detected=analytics.optimization_summary.conflicts_detected,
            )
        )
    return trend_points


@router.put("/official", response_model=OfficialTimetablePayload)
def upsert_official_timetable(
    payload: OfficialTimetablePayload,
    version_label: str | None = Query(default=None, alias="versionLabel", max_length=100),
    force: bool = Query(default=False),
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> OfficialTimetablePayload:
    course_by_id = {course.id: course for course in payload.course_data}
    faculty_by_id = {faculty.id: faculty for faculty in payload.faculty_data}
    room_by_id = {room.id: room for room in payload.room_data}
    shared_groups: list[tuple[str, str, set[str]]] = []
    shared_groups_by_course: dict[str, list[set[str]]] = {}
    if payload.program_id and payload.term_number is not None:
        shared_groups = load_shared_lecture_groups(
            db=db,
            program_id=payload.program_id,
            term_number=payload.term_number,
        )
        shared_groups_by_course = build_shared_group_lookup(shared_groups)

    working_hours = load_working_hours(db)
    schedule_policy = load_schedule_policy(db)
    period_minutes = schedule_policy.period_minutes
    day_segments: dict[str, list[tuple[int, int]]] = {}
    for day, hours_entry in working_hours.items():
        if not hours_entry.enabled:
            continue
        day_start = parse_time_to_minutes(hours_entry.start_time)
        day_end = parse_time_to_minutes(hours_entry.end_time)
        day_segments[day] = build_teaching_segments(
            day_start=day_start,
            day_end=day_end,
            period_minutes=period_minutes,
            breaks=schedule_policy.breaks,
        )

    for slot in payload.timetable_data:
        hours_entry = working_hours.get(slot.day)
        if hours_entry is None or not hours_entry.enabled:
            if not force:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Timeslot {slot.id} occurs on a non-working day ({slot.day})",
                )
        allowed_start = parse_time_to_minutes(hours_entry.start_time)
        allowed_end = parse_time_to_minutes(hours_entry.end_time)
        slot_start = parse_time_to_minutes(slot.startTime)
        slot_end = parse_time_to_minutes(slot.endTime)
        if slot_start < allowed_start or slot_end > allowed_end:
            if not force:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Timeslot {slot.id} on {slot.day} must be within working hours "
                        f"{hours_entry.start_time}-{hours_entry.end_time}"
                    ),
                )
        slot_duration = slot_end - slot_start
        if slot_duration % period_minutes != 0:
            if not force:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Timeslot {slot.id} must be a multiple of {period_minutes} minutes",
                )
        if not is_slot_aligned_with_segments(slot_start, slot_end, day_segments.get(slot.day, [])):
            if not force:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Timeslot {slot.id} must align to configured period boundaries and break windows",
                )
        overlapping_break = slot_overlaps_break(slot_start, slot_end, schedule_policy.breaks)
        if overlapping_break is not None:
            if not force:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Timeslot {slot.id} overlaps break '{overlapping_break.name}' "
                        f"({overlapping_break.start_time}-{overlapping_break.end_time})"
                    ),
                )

    if payload.term_number is None:
        has_constraints = db.execute(select(SemesterConstraint.id)).first() is not None
        if has_constraints:
            if not force:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="termNumber is required to validate semester constraints",
                )
    else:
        constraint = load_semester_constraint(db, payload.term_number)
        if constraint is not None:
            enforce_semester_constraints(payload, constraint, force=force)

    enforce_resource_conflicts(payload, course_by_id, shared_groups_by_course, force=force)
    enforce_course_scheduling(payload, course_by_id, room_by_id, schedule_policy, force=force)
    student_counts_by_slot = enforce_room_capacity(payload, room_by_id, db, force=force)
    enforce_shared_lecture_constraints(
        payload,
        shared_groups,
        shared_groups_by_course,
        room_by_id,
        student_counts_by_slot,
        force=force,
    )
    enforce_section_credit_aligned_minutes(payload, db, schedule_policy, force=force)
    enforce_program_credit_requirements(payload, course_by_id, db, force=force)
    enforce_elective_overlap_constraints(payload, db, force=force)
    enforce_prerequisite_constraints(payload, db, force=force)
    enforce_faculty_overload_preferences(payload, db, force=force)
    enforce_single_faculty_per_course_sections(payload, course_by_id, faculty_by_id, force=force)

    record = db.get(OfficialTimetable, 1)
    payload_dict = payload.model_dump(by_alias=True)
    old_payload = OfficialTimetablePayload.model_validate(record.payload) if record is not None else None
    if record is None:
        record = OfficialTimetable(id=1, payload=payload_dict, updated_by_id=current_user.id)
        db.add(record)
    else:
        record.payload = payload_dict
        record.updated_by_id = current_user.id

    conflicts = _build_conflicts(payload, db)
    analytics = _build_analytics(payload, conflicts, db)
    summary = analytics.model_dump(by_alias=True)
    version = TimetableVersion(
        label=(version_label.strip() if version_label else _next_version_label(db)),
        payload=payload_dict,
        summary=summary,
        created_by_id=current_user.id,
    )
    db.add(version)

    # Resolve all impacted users relative to current official version (if any)
    impacted_faculty_user_ids, impacted_student_user_ids = _resolve_impacted_schedule_users(
        db=db,
        old_payload=old_payload,
        new_payload=payload,
    )

    if old_payload is not None:
        old_slots = _slot_fingerprints(old_payload)
        new_slots = _slot_fingerprints(payload)
        added = len(new_slots - old_slots)
        removed = len(old_slots - new_slots)
        change_message = (
            f"Official timetable updated ({version.label}). Added {added} slot(s), removed {removed} slot(s)."
        )
    else:
        change_message = f"Official timetable published ({version.label})."
    log_activity(
        db,
        user=current_user,
        action="timetable.publish",
        entity_type="official_timetable",
        entity_id="1",
        details={"version_label": version.label, **summary},
    )

    db.commit()
    try:
        if impacted_faculty_user_ids:
            notify_users(
                db,
                user_ids=impacted_faculty_user_ids,
                title="Teaching Schedule Updated",
                message=(
                    f"The official timetable was updated ({version.label}). "
                    "Your assigned teaching slots have changed."
                ),
                notification_type=NotificationType.timetable,
                exclude_user_id=current_user.id,
                deliver_email=True,
            )
        if impacted_student_user_ids:
            notify_users(
                db,
                user_ids=impacted_student_user_ids,
                title="Class Schedule Updated",
                message=(
                    f"The official timetable was updated ({version.label}). "
                    "Your section schedule has changed."
                ),
                notification_type=NotificationType.timetable,
                exclude_user_id=current_user.id,
                deliver_email=True,
            )

        notify_all_users(
            db,
            title="Timetable Update",
            message=change_message,
            notification_type=NotificationType.timetable,
            exclude_user_id=current_user.id,
            deliver_email=True,
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "TIMETABLE PUBLISH NOTIFICATION FAILED | user_id=%s | program_id=%s | term=%s | version=%s",
            current_user.id,
            payload.program_id,
            payload.term_number,
            version.label,
        )
    db.refresh(record)
    return OfficialTimetablePayload.model_validate(record.payload)
