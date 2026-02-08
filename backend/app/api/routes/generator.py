from collections import defaultdict
import logging
from time import perf_counter
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_roles
from app.models.faculty import Faculty
from app.models.institution_settings import InstitutionSettings
from app.models.notification import NotificationType
from app.models.program_structure import ProgramTerm
from app.models.timetable import OfficialTimetable
from app.models.timetable_generation import (
    ReevaluationStatus,
    TimetableGenerationSettings,
    TimetableSlotLock,
)
from app.models.timetable_version import TimetableVersion
from app.models.user import User, UserRole
from app.schemas.generator import (
    FacultyWorkloadBridgeSuggestion,
    FacultyWorkloadGapSuggestion,
    GenerateTimetableRequest,
    GenerateTimetableCycleRequest,
    GenerateTimetableCycleResponse,
    GenerateTimetableResponse,
    GeneratedCycleSolution,
    GeneratedCycleSolutionTerm,
    GeneratedCycleTermResult,
    GenerationSettingsBase,
    GenerationSettingsOut,
    GenerationSettingsUpdate,
    OccupancyMatrix,
    ReevaluateTimetableRequest,
    ReevaluateTimetableResponse,
    ReevaluationEventOut,
    SlotLockCreate,
    SlotLockOut,
)
from app.schemas.settings import DEFAULT_ACADEMIC_CYCLE, parse_time_to_minutes
from app.services.audit import log_activity
from app.services.evolution_scheduler import EvolutionaryScheduler
from app.services.notifications import notify_all_users
from app.services.reevaluation import (
    list_reevaluation_events,
    official_scope_impacted,
    resolve_reevaluation_events,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def default_generation_settings() -> GenerationSettingsBase:
    return GenerationSettingsBase()


def load_generation_settings(db: Session) -> GenerationSettingsOut:
    record = db.get(TimetableGenerationSettings, 1)
    if record is None:
        defaults = default_generation_settings()
        return GenerationSettingsOut(id=1, **defaults.model_dump())
    return GenerationSettingsOut(
        id=record.id,
        solver_strategy=record.solver_strategy,
        population_size=record.population_size,
        generations=record.generations,
        mutation_rate=record.mutation_rate,
        crossover_rate=record.crossover_rate,
        elite_count=record.elite_count,
        tournament_size=record.tournament_size,
        stagnation_limit=record.stagnation_limit,
        annealing_iterations=record.annealing_iterations,
        annealing_initial_temperature=record.annealing_initial_temperature,
        annealing_cooling_rate=record.annealing_cooling_rate,
        random_seed=record.random_seed,
        objective_weights=record.objective_weights,
    )


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


def _run_generation(
    *,
    db: Session,
    settings: GenerationSettingsBase,
    payload: GenerateTimetableRequest,
    reserved_resource_slots: list[dict] | None = None,
) -> GenerateTimetableResponse:
    tuned_settings = _runtime_tuned_settings(settings)
    scheduler = EvolutionaryScheduler(
        db=db,
        program_id=payload.program_id,
        term_number=payload.term_number,
        settings=tuned_settings,
        reserved_resource_slots=reserved_resource_slots,
    )
    return scheduler.run(payload)


def _runtime_tuned_settings(settings: GenerationSettingsBase) -> GenerationSettingsBase:
    tuned = GenerationSettingsBase.model_validate(settings.model_dump())

    # Keep generation responsive for interactive admin workflows.
    tuned.population_size = min(tuned.population_size, 90)
    tuned.generations = min(tuned.generations, 110)
    tuned.stagnation_limit = min(tuned.stagnation_limit, 40)
    tuned.annealing_iterations = min(tuned.annealing_iterations, 1400)

    if tuned.solver_strategy in {"auto", "hybrid", "genetic"}:
        max_budget = 7_500
        budget = tuned.population_size * tuned.generations
        if budget > max_budget:
            tuned.generations = max(40, max_budget // max(20, tuned.population_size))

    return GenerationSettingsBase.model_validate(tuned.model_dump())


def _persist_payload_as_official(
    *,
    db: Session,
    current_user: User,
    payload_dict: dict,
    summary: dict,
    hard_conflicts: int = 0,
    version_label: str | None = None,
) -> str:
    if hard_conflicts > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Generated timetable still has hard conflicts; cannot persist as official",
        )

    record = db.get(OfficialTimetable, 1)
    if record is None:
        record = OfficialTimetable(id=1, payload=payload_dict, updated_by_id=current_user.id)
        db.add(record)
    else:
        record.payload = payload_dict
        record.updated_by_id = current_user.id

    resolved_label = version_label or _next_version_label(db)
    version = TimetableVersion(
        label=resolved_label,
        payload=payload_dict,
        summary=summary,
        created_by_id=current_user.id,
    )
    db.add(version)
    return resolved_label


def _persist_generated_official(
    *,
    db: Session,
    current_user: User,
    result: GenerateTimetableResponse,
    version_label: str | None = None,
) -> str:
    best = result.alternatives[0]
    payload_dict = best.payload.model_dump(by_alias=True)
    summary = {
        "program_id": best.payload.program_id,
        "term_number": best.payload.term_number,
        "slots": len(best.payload.timetable_data),
        "conflicts": best.hard_conflicts,
        "source": "generation",
    }
    return _persist_payload_as_official(
        db=db,
        current_user=current_user,
        payload_dict=payload_dict,
        summary=summary,
        hard_conflicts=best.hard_conflicts,
        version_label=version_label,
    )


def _ensure_conflict_free_result(result: GenerateTimetableResponse, *, context: str) -> None:
    best = result.alternatives[0]
    if best.hard_conflicts > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"{context} could not produce a conflict-free timetable. "
                f"Best candidate still has hard conflicts ({best.hard_conflicts})."
            ),
        )


def _retain_conflict_free_alternatives(result: GenerateTimetableResponse, *, context: str) -> bool:
    conflict_free = [item for item in result.alternatives if item.hard_conflicts == 0]
    if not conflict_free:
        result.alternatives = sorted(
            result.alternatives,
            key=lambda item: (item.hard_conflicts, item.soft_penalty, -item.fitness),
        )
        for index, alternative in enumerate(result.alternatives, start=1):
            alternative.rank = index
        return False
    for index, alternative in enumerate(conflict_free, start=1):
        alternative.rank = index
    result.alternatives = conflict_free
    return True


def _resolve_cycle_term_numbers(
    *,
    db: Session,
    program_id: str,
    cycle: str,
    requested_terms: list[int] | None,
) -> list[int]:
    if cycle == "custom":
        if not requested_terms:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Custom cycle requires term_numbers")
        return sorted(requested_terms)

    configured_terms = sorted(
        db.execute(
            select(ProgramTerm.term_number).where(ProgramTerm.program_id == program_id)
        )
        .scalars()
        .all()
    )
    if not configured_terms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No program terms configured for this program",
        )

    if cycle == "odd":
        filtered = [item for item in configured_terms if item % 2 == 1]
    elif cycle == "even":
        filtered = [item for item in configured_terms if item % 2 == 0]
    else:
        filtered = configured_terms

    if not filtered:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No configured terms found for cycle '{cycle}'",
        )
    return filtered


def _resolve_default_cycle(db: Session) -> str:
    record = db.get(InstitutionSettings, 1)
    if record is None:
        return DEFAULT_ACADEMIC_CYCLE.semester_cycle
    configured = (record.semester_cycle or "").strip().lower()
    if configured in {"odd", "even"}:
        return configured
    return DEFAULT_ACADEMIC_CYCLE.semester_cycle


def _build_reserved_slots_from_payload(payload: object) -> list[dict]:
    slots: list[dict] = []
    for slot in payload.timetable_data:
        slots.append(
            {
                "day": slot.day,
                "start_time": slot.startTime,
                "end_time": slot.endTime,
                "room_id": slot.roomId,
                "faculty_id": slot.facultyId,
            }
        )
    return slots


def _is_no_feasible_placement_error(exc: HTTPException) -> bool:
    if exc.status_code != status.HTTP_400_BAD_REQUEST:
        return False
    detail = exc.detail
    if isinstance(detail, str):
        return "No feasible placement options" in detail
    if isinstance(detail, dict):
        return "No feasible placement options" in str(detail.get("detail", detail))
    return "No feasible placement options" in str(detail)


def _load_faculty_map(db: Session) -> dict[str, Faculty]:
    return {item.id: item for item in db.execute(select(Faculty)).scalars().all()}


def _resolve_preferred_codes_for_term(faculty: Faculty, term_number: int | None = None) -> set[str]:
    preferred = {
        str(code).strip().upper()
        for code in (faculty.preferred_subject_codes or [])
        if str(code).strip()
    }
    semester_preferences = faculty.semester_preferences or {}
    if term_number is None:
        for codes in semester_preferences.values():
            preferred.update(str(code).strip().upper() for code in (codes or []) if str(code).strip())
        return preferred

    term_specific = semester_preferences.get(str(term_number), [])
    preferred.update(str(code).strip().upper() for code in (term_specific or []) if str(code).strip())
    return preferred


def _load_faculty_preference_map(db: Session, term_number: int | None = None) -> dict[str, set[str]]:
    preference_map: dict[str, set[str]] = {}
    faculty_rows = list(db.execute(select(Faculty)).scalars())
    for faculty in faculty_rows:
        normalized = _resolve_preferred_codes_for_term(faculty, term_number)
        if normalized:
            preference_map[faculty.id] = normalized
    return preference_map


def _faculty_preference_penalty(payload: object, faculty_preference_map: dict[str, set[str]]) -> float:
    course_code_by_id = {
        course.id: course.code.strip().upper()
        for course in payload.course_data
        if course.code and course.code.strip()
    }
    penalty = 0.0
    for slot in payload.timetable_data:
        preferred_codes = faculty_preference_map.get(slot.facultyId)
        if not preferred_codes:
            continue
        course_code = course_code_by_id.get(slot.courseId, "")
        if not course_code or course_code not in preferred_codes:
            penalty += 1.0
    return penalty


def _faculty_target_hours(faculty: Faculty) -> float:
    if faculty.workload_hours > 0:
        return float(faculty.workload_hours)
    if faculty.max_hours > 0:
        return float(faculty.max_hours)
    return 0.0


def _time_ranges_overlap(start_a: int, end_a: int, start_b: int, end_b: int) -> bool:
    return start_a < end_b and start_b < end_a


def _build_workload_gap_suggestions(
    *,
    term_payloads: list[tuple[int, object]],
    faculty_map: dict[str, Faculty],
    max_faculty: int = 10,
    max_bridges: int = 6,
) -> list[FacultyWorkloadGapSuggestion]:
    if not term_payloads or not faculty_map:
        return []

    preferred_codes_by_faculty_term = {
        (item.id, term_number): _resolve_preferred_codes_for_term(item, term_number)
        for item in faculty_map.values()
        for term_number, _ in term_payloads
    }

    assigned_minutes_by_faculty: dict[str, int] = defaultdict(int)
    preferred_minutes_by_faculty: dict[str, int] = defaultdict(int)
    occupancy_by_faculty: dict[str, dict[int, dict[str, list[tuple[int, int]]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(list))
    )
    opportunities: list[dict] = []

    for term_number, payload in term_payloads:
        course_meta = {
            course.id: (course.code.strip().upper(), course.code, course.name)
            for course in payload.course_data
            if course.code and course.code.strip()
        }

        grouped: dict[tuple[int, str, str, str, str], dict] = {}
        for slot in payload.timetable_data:
            start_min = parse_time_to_minutes(slot.startTime)
            end_min = parse_time_to_minutes(slot.endTime)
            minutes = max(0, end_min - start_min)
            if minutes <= 0:
                continue

            assigned_minutes_by_faculty[slot.facultyId] += minutes
            occupancy_by_faculty[slot.facultyId][term_number][slot.day].append((start_min, end_min))

            course_code_upper, course_code_display, course_name = course_meta.get(
                slot.courseId,
                ("", slot.courseId, slot.courseId),
            )
            preferred_for_term = preferred_codes_by_faculty_term.get((slot.facultyId, term_number), set())
            if course_code_upper and course_code_upper in preferred_for_term:
                preferred_minutes_by_faculty[slot.facultyId] += minutes

            key = (
                term_number,
                slot.courseId,
                slot.section,
                slot.batch or "",
                slot.facultyId,
            )
            entry = grouped.get(key)
            if entry is None:
                entry = {
                    "term_number": term_number,
                    "course_id": slot.courseId,
                    "course_code": course_code_display,
                    "course_code_upper": course_code_upper,
                    "course_name": course_name,
                    "section_name": slot.section,
                    "batch": slot.batch,
                    "faculty_id": slot.facultyId,
                    "minutes": 0,
                    "intervals": set(),
                }
                grouped[key] = entry

            entry["minutes"] += minutes
            entry["intervals"].add((slot.day, start_min, end_min))

        opportunities.extend(grouped.values())

    suggestions: list[FacultyWorkloadGapSuggestion] = []
    for faculty in faculty_map.values():
        target_hours = _faculty_target_hours(faculty)
        if target_hours <= 0:
            continue

        assigned_minutes = assigned_minutes_by_faculty.get(faculty.id, 0)
        assigned_hours = assigned_minutes / 60.0
        gap_hours = target_hours - assigned_hours
        if gap_hours <= 0.01:
            continue

        preferred_codes = {
            code
            for (faculty_id, _term_number), codes in preferred_codes_by_faculty_term.items()
            if faculty_id == faculty.id
            for code in codes
        }
        if assigned_minutes == 0 and not preferred_codes:
            continue

        preferred_assigned_hours = preferred_minutes_by_faculty.get(faculty.id, 0) / 60.0

        candidate_bridges: list[dict] = []
        for option in opportunities:
            if option["faculty_id"] == faculty.id:
                continue

            intervals = list(option["intervals"])
            term_number = option["term_number"]
            existing_by_day = occupancy_by_faculty.get(faculty.id, {}).get(term_number, {})
            has_overlap = False
            for day, start_min, end_min in intervals:
                for occupied_start, occupied_end in existing_by_day.get(day, []):
                    if _time_ranges_overlap(start_min, end_min, occupied_start, occupied_end):
                        has_overlap = True
                        break
                if has_overlap:
                    break

            course_code_upper = option["course_code_upper"]
            preferred_for_bridge_term = preferred_codes_by_faculty_term.get((faculty.id, term_number), set())
            is_preferred_subject = bool(course_code_upper and course_code_upper in preferred_for_bridge_term)
            candidate_bridges.append(
                {
                    **option,
                    "feasible_without_conflict": not has_overlap,
                    "is_preferred_subject": is_preferred_subject,
                    "weekly_hours": option["minutes"] / 60.0,
                }
            )

        candidate_bridges.sort(
            key=lambda item: (
                not item["feasible_without_conflict"],
                not item["is_preferred_subject"],
                -item["weekly_hours"],
                item["term_number"],
                item["course_code"],
                item["section_name"],
                item["batch"] or "",
            )
        )

        bridge_rows: list[FacultyWorkloadBridgeSuggestion] = []
        covered_hours = 0.0
        for bridge in candidate_bridges:
            bridge_rows.append(
                FacultyWorkloadBridgeSuggestion(
                    term_number=bridge["term_number"],
                    course_id=bridge["course_id"],
                    course_code=bridge["course_code"],
                    course_name=bridge["course_name"],
                    section_name=bridge["section_name"],
                    batch=bridge["batch"],
                    weekly_hours=round(bridge["weekly_hours"], 2),
                    is_preferred_subject=bridge["is_preferred_subject"],
                    feasible_without_conflict=bridge["feasible_without_conflict"],
                )
            )
            if bridge["feasible_without_conflict"]:
                covered_hours += bridge["weekly_hours"]
            if len(bridge_rows) >= max_bridges or covered_hours >= gap_hours:
                break

        suggestions.append(
            FacultyWorkloadGapSuggestion(
                faculty_id=faculty.id,
                faculty_name=faculty.name,
                department=faculty.department,
                target_hours=round(target_hours, 2),
                assigned_hours=round(assigned_hours, 2),
                preferred_assigned_hours=round(preferred_assigned_hours, 2),
                gap_hours=round(max(0.0, gap_hours), 2),
                suggested_bridges=bridge_rows,
            )
        )

    suggestions.sort(
        key=lambda item: (
            -item.gap_hours,
            -(1 if item.suggested_bridges else 0),
            item.faculty_name.lower(),
        )
    )
    return suggestions[:max_faculty]


def _workload_gap_penalty(
    *,
    term_payloads: list[tuple[int, object]],
    faculty_map: dict[str, Faculty],
) -> float:
    if not term_payloads or not faculty_map:
        return 0.0

    assigned_minutes_by_faculty: dict[str, int] = defaultdict(int)
    for _term_number, payload in term_payloads:
        for slot in payload.timetable_data:
            start_min = parse_time_to_minutes(slot.startTime)
            end_min = parse_time_to_minutes(slot.endTime)
            if end_min <= start_min:
                continue
            assigned_minutes_by_faculty[slot.facultyId] += end_min - start_min

    total_gap_hours = 0.0
    for faculty in faculty_map.values():
        target_hours = _faculty_target_hours(faculty)
        if target_hours <= 0:
            continue
        assigned_hours = assigned_minutes_by_faculty.get(faculty.id, 0) / 60.0
        total_gap_hours += max(0.0, target_hours - assigned_hours)

    return round(total_gap_hours, 3)


def _build_occupancy_matrix(payload: object) -> OccupancyMatrix:
    section_matrix: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    faculty_matrix: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    room_matrix: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for slot in payload.timetable_data:
        slot_key = f"{slot.day}|{slot.startTime}-{slot.endTime}"
        section_matrix[slot.section][slot_key] += 1
        faculty_matrix[slot.facultyId][slot_key] += 1
        room_matrix[slot.roomId][slot_key] += 1

    faculty_labels = {item.id: item.name for item in payload.faculty_data}
    room_labels = {item.id: item.name for item in payload.room_data}

    return OccupancyMatrix(
        section_matrix={section: dict(values) for section, values in section_matrix.items()},
        faculty_matrix={faculty_id: dict(values) for faculty_id, values in faculty_matrix.items()},
        room_matrix={room_id: dict(values) for room_id, values in room_matrix.items()},
        faculty_labels=faculty_labels,
        room_labels=room_labels,
    )


def _attach_occupancy_matrices(generation: GenerateTimetableResponse) -> None:
    for alternative in generation.alternatives:
        alternative.occupancy_matrix = _build_occupancy_matrix(alternative.payload)


def _attach_workload_gap_suggestions(
    *,
    generation: GenerateTimetableResponse,
    term_number: int,
    faculty_map: dict[str, Faculty],
) -> None:
    for alternative in generation.alternatives:
        alternative.workload_gap_suggestions = _build_workload_gap_suggestions(
            term_payloads=[(term_number, alternative.payload)],
            faculty_map=faculty_map,
        )


def _cross_term_resource_overlap_count(terms: list[GeneratedCycleSolutionTerm]) -> int:
    room_usage: dict[tuple[str, str, str, str], int] = defaultdict(int)
    faculty_usage: dict[tuple[str, str, str, str], int] = defaultdict(int)

    for term in terms:
        for slot in term.payload.timetable_data:
            room_usage[(slot.day, slot.startTime, slot.endTime, slot.roomId)] += 1
            faculty_usage[(slot.day, slot.startTime, slot.endTime, slot.facultyId)] += 1

    room_overlap = sum(max(0, count - 1) for count in room_usage.values())
    faculty_overlap = sum(max(0, count - 1) for count in faculty_usage.values())
    return room_overlap + faculty_overlap


def _dominates(left: dict, right: dict) -> bool:
    return (
        left["resource_penalty"] <= right["resource_penalty"]
        and left["faculty_preference_penalty"] <= right["faculty_preference_penalty"]
        and left["workload_gap_penalty"] <= right["workload_gap_penalty"]
        and (
            left["resource_penalty"] < right["resource_penalty"]
            or left["faculty_preference_penalty"] < right["faculty_preference_penalty"]
            or left["workload_gap_penalty"] < right["workload_gap_penalty"]
        )
    )


def _pareto_prune(states: list[dict], *, limit: int) -> list[dict]:
    if not states:
        return []

    frontier: list[dict] = []
    for index, candidate in enumerate(states):
        dominated = False
        for other_index, other in enumerate(states):
            if index == other_index:
                continue
            if _dominates(other, candidate):
                dominated = True
                break
        if not dominated:
            frontier.append(candidate)

    frontier.sort(
        key=lambda item: (
            item["resource_penalty"],
            item["faculty_preference_penalty"],
            item["workload_gap_penalty"],
            item["hard_conflicts"],
            item["soft_penalty"],
            item["runtime_ms"],
        )
    )
    return frontier[:limit]


@router.get("/timetable/generation-settings", response_model=GenerationSettingsOut)
def get_generation_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GenerationSettingsOut:
    return load_generation_settings(db)


@router.put("/timetable/generation-settings", response_model=GenerationSettingsOut)
def update_generation_settings(
    payload: GenerationSettingsUpdate,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> GenerationSettingsOut:
    record = db.get(TimetableGenerationSettings, 1)
    data = payload.model_dump()
    if record is None:
        record = TimetableGenerationSettings(id=1, **data)
        db.add(record)
    else:
        for key, value in data.items():
            setattr(record, key, value)
    db.commit()
    db.refresh(record)
    return load_generation_settings(db)


@router.get("/timetable/locks", response_model=list[SlotLockOut])
def list_slot_locks(
    program_id: str = Query(min_length=1, max_length=36),
    term_number: int = Query(ge=1, le=20),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SlotLockOut]:
    return list(
        db.execute(
            select(TimetableSlotLock).where(
                TimetableSlotLock.program_id == program_id,
                TimetableSlotLock.term_number == term_number,
            )
        ).scalars()
    )


@router.post("/timetable/locks", response_model=SlotLockOut, status_code=status.HTTP_201_CREATED)
def create_slot_lock(
    payload: SlotLockCreate,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> SlotLockOut:
    lock = TimetableSlotLock(**payload.model_dump(), created_by_id=current_user.id)
    db.add(lock)
    db.commit()
    db.refresh(lock)
    return lock


@router.delete("/timetable/locks/{lock_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_slot_lock(
    lock_id: str,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> None:
    lock = db.get(TimetableSlotLock, lock_id)
    if lock is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slot lock not found")
    db.delete(lock)
    db.commit()


@router.post("/timetable/generate", response_model=GenerateTimetableResponse)
def generate_timetable(
    payload: GenerateTimetableRequest,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> GenerateTimetableResponse:
    started = perf_counter()
    logger.info(
        "TIMETABLE GENERATION START | user_id=%s | program_id=%s | term=%s | alternatives=%s | persist=%s",
        current_user.id,
        payload.program_id,
        payload.term_number,
        payload.alternative_count,
        payload.persist_official,
    )
    try:
        if payload.settings_override is not None:
            settings = payload.settings_override
        else:
            settings = load_generation_settings(db)
        logger.info(
            "TIMETABLE GENERATION STRATEGY | user_id=%s | program_id=%s | term=%s | strategy=%s",
            current_user.id,
            payload.program_id,
            payload.term_number,
            settings.solver_strategy,
        )

        result = _run_generation(
            db=db,
            settings=GenerationSettingsBase.model_validate(settings.model_dump()),
            payload=payload,
        )
        has_conflict_free = _retain_conflict_free_alternatives(result, context="Generation")
        if not has_conflict_free and result.alternatives:
            best = result.alternatives[0]
            result.publish_warning = (
                "Generation produced alternatives with unresolved hard conflicts. "
                f"Best candidate has {best.hard_conflicts} hard conflicts; review Conflict Dashboard before publishing."
            )
        _attach_occupancy_matrices(result)
        faculty_map = _load_faculty_map(db)
        _attach_workload_gap_suggestions(
            generation=result,
            term_number=payload.term_number,
            faculty_map=faculty_map,
        )

        if payload.persist_official:
            try:
                version_label = _persist_generated_official(
                    db=db,
                    current_user=current_user,
                    result=result,
                )
                result.published_version_label = version_label
                log_activity(
                    db,
                    user=current_user,
                    action="timetable.generate.publish",
                    entity_type="official_timetable",
                    entity_id="1",
                    details={
                        "program_id": payload.program_id,
                        "term_number": payload.term_number,
                        "version_label": version_label,
                    },
                )
                db.commit()
                try:
                    notify_all_users(
                        db,
                        title="Timetable Updated",
                        message=f"Official timetable updated from generated result ({version_label}).",
                        notification_type=NotificationType.timetable,
                        exclude_user_id=current_user.id,
                        deliver_email=True,
                    )
                    db.commit()
                except Exception:
                    db.rollback()
                    logger.exception(
                        "TIMETABLE GENERATION PUBLISH NOTIFICATION FAILED | user_id=%s | program_id=%s | term=%s | version=%s",
                        current_user.id,
                        payload.program_id,
                        payload.term_number,
                        version_label,
                    )
            except HTTPException as publish_exc:
                publish_detail = str(publish_exc.detail)
                if publish_exc.status_code == status.HTTP_400_BAD_REQUEST and "hard conflicts" in publish_detail.lower():
                    result.publish_warning = publish_detail
                    logger.warning(
                        "TIMETABLE GENERATION PUBLISH SKIPPED | user_id=%s | program_id=%s | term=%s | reason=%s",
                        current_user.id,
                        payload.program_id,
                        payload.term_number,
                        publish_detail,
                    )
                else:
                    raise

        elapsed_ms = int((perf_counter() - started) * 1000)
        logger.info(
            "TIMETABLE GENERATION COMPLETE | user_id=%s | program_id=%s | term=%s | alternatives=%s | best_hard_conflicts=%s | runtime_ms=%s | wall_ms=%s",
            current_user.id,
            payload.program_id,
            payload.term_number,
            len(result.alternatives),
            result.alternatives[0].hard_conflicts if result.alternatives else 0,
            result.runtime_ms,
            elapsed_ms,
        )
        return result
    except Exception:
        elapsed_ms = int((perf_counter() - started) * 1000)
        logger.exception(
            "TIMETABLE GENERATION FAILED | user_id=%s | program_id=%s | term=%s | wall_ms=%s",
            current_user.id,
            payload.program_id,
            payload.term_number,
            elapsed_ms,
        )
        raise


@router.post("/timetable/generate-cycle", response_model=GenerateTimetableCycleResponse)
def generate_timetable_cycle(
    payload: GenerateTimetableCycleRequest,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> GenerateTimetableCycleResponse:
    started = perf_counter()
    logger.info(
        "TIMETABLE CYCLE GENERATION START | user_id=%s | program_id=%s | cycle=%s | alternatives=%s | pareto_limit=%s | persist=%s",
        current_user.id,
        payload.program_id,
        payload.cycle,
        payload.alternative_count,
        payload.pareto_limit,
        payload.persist_official,
    )
    try:
        if payload.settings_override is not None:
            settings = payload.settings_override
        else:
            settings = load_generation_settings(db)
        logger.info(
            "TIMETABLE CYCLE GENERATION STRATEGY | user_id=%s | program_id=%s | cycle=%s | strategy=%s",
            current_user.id,
            payload.program_id,
            payload.cycle,
            settings.solver_strategy,
        )

        resolved_cycle = payload.cycle or _resolve_default_cycle(db)

        term_numbers = _resolve_cycle_term_numbers(
            db=db,
            program_id=payload.program_id,
            cycle=resolved_cycle,
            requested_terms=payload.term_numbers,
        )

        faculty_map = _load_faculty_map(db)
        initial_state = {
            "terms": [],
            "reserved_slots": [],
            "resource_penalty": 0,
            "faculty_preference_penalty": 0.0,
            "workload_gap_penalty": 0.0,
            "hard_conflicts": 0,
            "soft_penalty": 0.0,
            "runtime_ms": 0,
            "term_generation_map": {},
        }
        candidate_states = [initial_state]

        for term_number in term_numbers:
            term_preference_map = _load_faculty_preference_map(db, term_number)
            expanded_states: list[dict] = []
            for state_index, state in enumerate(candidate_states):
                generation_request = GenerateTimetableRequest(
                    program_id=payload.program_id,
                    term_number=term_number,
                    alternative_count=payload.alternative_count,
                    persist_official=False,
                    settings_override=None,
                )
                run_settings = GenerationSettingsBase.model_validate(settings.model_dump())
                if run_settings.random_seed is not None:
                    run_settings.random_seed = run_settings.random_seed + (term_number * 1000) + state_index

                relaxed_reserved_mode = False
                try:
                    generation_result = _run_generation(
                        db=db,
                        settings=run_settings,
                        payload=generation_request,
                        reserved_resource_slots=state["reserved_slots"],
                    )
                except HTTPException as exc:
                    if not state["reserved_slots"] or not _is_no_feasible_placement_error(exc):
                        raise
                    relaxed_reserved_mode = True
                    logger.warning(
                        "CYCLE TERM FALLBACK | user_id=%s | program_id=%s | term=%s | state_index=%s | reason=%s",
                        current_user.id,
                        payload.program_id,
                        term_number,
                        state_index,
                        exc.detail,
                    )
                    fallback_settings = GenerationSettingsBase.model_validate(run_settings.model_dump())
                    if fallback_settings.random_seed is not None:
                        fallback_settings.random_seed += 17
                    generation_result = _run_generation(
                        db=db,
                        settings=fallback_settings,
                        payload=generation_request,
                        reserved_resource_slots=[],
                    )
                _retain_conflict_free_alternatives(
                    generation_result,
                    context=f"Cycle generation term {term_number}",
                )
                _attach_occupancy_matrices(generation_result)

                viable_alternatives = sorted(
                    generation_result.alternatives,
                    key=lambda item: (item.hard_conflicts, item.soft_penalty, -item.fitness),
                )
                if not viable_alternatives:
                    continue

                for alternative in viable_alternatives:
                    term_solution = GeneratedCycleSolutionTerm(
                        term_number=term_number,
                        alternative_rank=alternative.rank,
                        fitness=alternative.fitness,
                        hard_conflicts=alternative.hard_conflicts,
                        soft_penalty=alternative.soft_penalty,
                        payload=alternative.payload,
                        occupancy_matrix=alternative.occupancy_matrix,
                    )
                    next_terms = [*state["terms"], term_solution]
                    overlap_penalty = _cross_term_resource_overlap_count(next_terms)
                    next_reserved_slots = [
                        *state["reserved_slots"],
                        *_build_reserved_slots_from_payload(alternative.payload),
                    ]
                    next_preference_penalty = state["faculty_preference_penalty"] + _faculty_preference_penalty(
                        alternative.payload,
                        term_preference_map,
                    )
                    next_hard_conflicts = state["hard_conflicts"] + alternative.hard_conflicts
                    next_soft_penalty = state["soft_penalty"] + alternative.soft_penalty
                    next_resource_penalty = next_hard_conflicts + overlap_penalty
                    next_workload_gap_penalty = _workload_gap_penalty(
                        term_payloads=[(item.term_number, item.payload) for item in next_terms],
                        faculty_map=faculty_map,
                    )
                    if relaxed_reserved_mode:
                        next_resource_penalty += max(1, overlap_penalty)
                    next_runtime_ms = state["runtime_ms"] + generation_result.runtime_ms
                    next_generation_map = {**state["term_generation_map"], term_number: generation_result}

                    expanded_states.append(
                        {
                            "terms": next_terms,
                            "reserved_slots": next_reserved_slots,
                            "resource_penalty": next_resource_penalty,
                            "faculty_preference_penalty": next_preference_penalty,
                            "workload_gap_penalty": next_workload_gap_penalty,
                            "hard_conflicts": next_hard_conflicts,
                            "soft_penalty": next_soft_penalty,
                            "runtime_ms": next_runtime_ms,
                            "term_generation_map": next_generation_map,
                        }
                    )

            if not expanded_states:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Cycle generation failed for term {term_number}: "
                        "no conflict-free alternatives could satisfy cross-term resource constraints."
                    ),
                )
            candidate_states = _pareto_prune(expanded_states, limit=payload.pareto_limit)

        if not candidate_states:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cycle generation could not produce any feasible Pareto-front alternatives",
            )

        candidate_states.sort(
            key=lambda item: (
                item["resource_penalty"],
                item["faculty_preference_penalty"],
                item["workload_gap_penalty"],
                item["hard_conflicts"],
                item["soft_penalty"],
                item["runtime_ms"],
            )
        )
        selected_state = candidate_states[0]
        pareto_front: list[GeneratedCycleSolution] = []
        for rank, state in enumerate(candidate_states, start=1):
            ordered_terms = sorted(state["terms"], key=lambda item: item.term_number)
            enriched_terms: list[GeneratedCycleSolutionTerm] = []
            for term in ordered_terms:
                term_suggestions = _build_workload_gap_suggestions(
                    term_payloads=[(term.term_number, term.payload)],
                    faculty_map=faculty_map,
                )
                enriched_terms.append(
                    GeneratedCycleSolutionTerm(
                        term_number=term.term_number,
                        alternative_rank=term.alternative_rank,
                        fitness=term.fitness,
                        hard_conflicts=term.hard_conflicts,
                        soft_penalty=term.soft_penalty,
                        payload=term.payload,
                        workload_gap_suggestions=term_suggestions,
                        occupancy_matrix=term.occupancy_matrix,
                    )
                )
            cycle_suggestions = _build_workload_gap_suggestions(
                term_payloads=[(term.term_number, term.payload) for term in ordered_terms],
                faculty_map=faculty_map,
            )
            pareto_front.append(
                GeneratedCycleSolution(
                    rank=rank,
                    resource_penalty=state["resource_penalty"],
                    faculty_preference_penalty=round(state["faculty_preference_penalty"], 3),
                    workload_gap_penalty=round(state["workload_gap_penalty"], 3),
                    hard_conflicts=state["hard_conflicts"],
                    soft_penalty=round(state["soft_penalty"], 3),
                    runtime_ms=state["runtime_ms"],
                    terms=enriched_terms,
                    workload_gap_suggestions=cycle_suggestions,
                )
            )

        published_labels_by_term: dict[int, str] = {}
        if payload.persist_official and selected_state["terms"]:
            selected_terms = sorted(selected_state["terms"], key=lambda item: item.term_number)
            published_labels: list[str] = []
            for term in selected_terms:
                payload_dict = term.payload.model_dump(by_alias=True)
                summary = {
                    "program_id": term.payload.program_id,
                    "term_number": term.term_number,
                    "slots": len(term.payload.timetable_data),
                    "conflicts": term.hard_conflicts,
                    "source": "generation-cycle",
                    "cycle": resolved_cycle,
                    "solution_rank": 1,
                    "term_alternative_rank": term.alternative_rank,
                    "resource_penalty": selected_state["resource_penalty"],
                    "faculty_preference_penalty": round(selected_state["faculty_preference_penalty"], 3),
                    "workload_gap_penalty": round(selected_state["workload_gap_penalty"], 3),
                }
                published_version_label = _persist_payload_as_official(
                    db=db,
                    current_user=current_user,
                    payload_dict=payload_dict,
                    summary=summary,
                    hard_conflicts=term.hard_conflicts,
                )
                published_labels_by_term[term.term_number] = published_version_label
                published_labels.append(published_version_label)

            latest_label = published_labels[-1] if published_labels else "latest"
            log_activity(
                db,
                user=current_user,
                action="timetable.generate.cycle.publish",
                entity_type="official_timetable",
                entity_id="1",
                details={
                    "program_id": payload.program_id,
                    "cycle": resolved_cycle,
                    "term_numbers": term_numbers,
                    "published_versions": published_labels,
                    "selected_solution_rank": 1,
                    "pareto_front_size": len(candidate_states),
                    "workload_gap_penalty": round(selected_state["workload_gap_penalty"], 3),
                },
            )
            db.commit()
            try:
                notify_all_users(
                    db,
                    title="Timetable Cycle Updated",
                    message=(
                        f"{resolved_cycle.capitalize()} cycle generated for terms {', '.join(str(item) for item in term_numbers)}. "
                        f"Published Pareto solution #1. Official timetable currently points to term {term_numbers[-1]} ({latest_label})."
                    ),
                    notification_type=NotificationType.timetable,
                    exclude_user_id=current_user.id,
                    deliver_email=True,
                )
                db.commit()
            except Exception:
                db.rollback()
                logger.exception(
                    "TIMETABLE CYCLE PUBLISH NOTIFICATION FAILED | user_id=%s | program_id=%s | cycle=%s | terms=%s",
                    current_user.id,
                    payload.program_id,
                    resolved_cycle,
                    ",".join(str(term) for term in term_numbers),
                )

        results: list[GeneratedCycleTermResult] = []
        selected_generation_map = selected_state["term_generation_map"]
        for term_number in term_numbers:
            generation_result = selected_generation_map.get(term_number)
            if generation_result is None:
                continue
            _attach_workload_gap_suggestions(
                generation=generation_result,
                term_number=term_number,
                faculty_map=faculty_map,
            )
            results.append(
                GeneratedCycleTermResult(
                    term_number=term_number,
                    generation=generation_result,
                    published_version_label=published_labels_by_term.get(term_number),
                )
            )

        elapsed_ms = int((perf_counter() - started) * 1000)
        logger.info(
            "TIMETABLE CYCLE GENERATION COMPLETE | user_id=%s | program_id=%s | cycle=%s | terms=%s | pareto=%s | selected_rank=%s | wall_ms=%s",
            current_user.id,
            payload.program_id,
            resolved_cycle,
            ",".join(str(term) for term in term_numbers),
            len(pareto_front),
            pareto_front[0].rank if pareto_front else None,
            elapsed_ms,
        )
        return GenerateTimetableCycleResponse(
            program_id=payload.program_id,
            cycle=resolved_cycle,
            term_numbers=term_numbers,
            results=results,
            pareto_front=pareto_front,
            selected_solution_rank=pareto_front[0].rank if pareto_front else None,
        )
    except Exception:
        elapsed_ms = int((perf_counter() - started) * 1000)
        logger.exception(
            "TIMETABLE CYCLE GENERATION FAILED | user_id=%s | program_id=%s | cycle=%s | wall_ms=%s",
            current_user.id,
            payload.program_id,
            payload.cycle,
            elapsed_ms,
        )
        raise


@router.get("/timetable/reevaluation/events", response_model=list[ReevaluationEventOut])
def get_reevaluation_events(
    program_id: str | None = Query(default=None, min_length=1, max_length=36),
    term_number: int | None = Query(default=None, ge=1, le=20),
    event_status: ReevaluationStatus | None = Query(default=None, alias="status"),
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> list[ReevaluationEventOut]:
    rows = list_reevaluation_events(
        db,
        program_id=program_id,
        term_number=term_number,
        status=event_status,
    )
    output: list[ReevaluationEventOut] = []
    for row in rows:
        output.append(
            ReevaluationEventOut(
                id=row.id,
                program_id=row.program_id,
                term_number=row.term_number,
                change_type=row.change_type,
                entity_type=row.entity_type,
                entity_id=row.entity_id,
                description=row.description,
                details=row.details or {},
                status=row.status,
                triggered_by_id=row.triggered_by_id,
                triggered_at=row.triggered_at,
                resolved_by_id=row.resolved_by_id,
                resolved_at=row.resolved_at,
                resolution_note=row.resolution_note,
                has_official_impact=official_scope_impacted(
                    db,
                    program_id=row.program_id,
                    term_number=row.term_number,
                ),
            )
        )
    return output


@router.post("/timetable/reevaluation/run", response_model=ReevaluateTimetableResponse)
def run_curriculum_reevaluation(
    payload: ReevaluateTimetableRequest,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> ReevaluateTimetableResponse:
    if payload.settings_override is not None:
        settings = payload.settings_override
    else:
        settings = load_generation_settings(db)

    generation_request = GenerateTimetableRequest(
        program_id=payload.program_id,
        term_number=payload.term_number,
        alternative_count=payload.alternative_count,
        persist_official=False,
        settings_override=None,
    )
    generation = _run_generation(
        db=db,
        settings=GenerationSettingsBase.model_validate(settings.model_dump()),
        payload=generation_request,
    )
    _attach_occupancy_matrices(generation)
    faculty_map = _load_faculty_map(db)
    _attach_workload_gap_suggestions(
        generation=generation,
        term_number=payload.term_number,
        faculty_map=faculty_map,
    )

    version_label: str | None = None
    if payload.persist_official:
        version_label = _persist_generated_official(
            db=db,
            current_user=current_user,
            result=generation,
        )

    resolved = []
    if payload.mark_resolved:
        resolved = resolve_reevaluation_events(
            db,
            program_id=payload.program_id,
            term_number=payload.term_number,
            resolved_by=current_user,
            resolution_note=payload.resolution_note
            or ("Re-evaluated and published" if payload.persist_official else "Re-evaluated"),
        )
        db.flush()

    pending_count = len(
        list_reevaluation_events(
            db,
            program_id=payload.program_id,
            term_number=payload.term_number,
            status=ReevaluationStatus.pending,
        )
    )

    log_activity(
        db,
        user=current_user,
        action="timetable.reevaluation.run",
        entity_type="program_term",
        entity_id=f"{payload.program_id}:{payload.term_number}",
        details={
            "persist_official": payload.persist_official,
            "resolved_events": len(resolved),
            "pending_events": pending_count,
            "version_label": version_label,
        },
    )

    db.commit()
    if payload.persist_official and version_label:
        try:
            notify_all_users(
                db,
                title="Timetable Re-evaluated",
                message=f"Curriculum-driven re-evaluation published ({version_label}).",
                notification_type=NotificationType.timetable,
                exclude_user_id=current_user.id,
                deliver_email=True,
            )
            db.commit()
        except Exception:
            db.rollback()
            logger.exception(
                "TIMETABLE REEVALUATION PUBLISH NOTIFICATION FAILED | user_id=%s | program_id=%s | term=%s | version=%s",
                current_user.id,
                payload.program_id,
                payload.term_number,
                version_label,
            )
    return ReevaluateTimetableResponse(
        generation=generation,
        resolved_events=len(resolved),
        pending_events=pending_count,
    )
