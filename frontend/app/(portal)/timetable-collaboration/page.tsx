"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Clock3, Loader2, RefreshCw, UserCheck, UserRound, Users2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  WeeklyTimetableGrid,
  type WeeklyGridResolvedSlot,
  type WeeklyGridRow,
} from "@/components/timetable/weekly-timetable-grid";
import {
  LUNCH_END_TIME,
  LUNCH_START_TIME,
  isCanonicalLunchRange,
  isRemovedLegacySlotRange,
  overlapsCanonicalLunchWindow,
} from "@/components/timetable/weekly-grid-utils";
import { useAuth } from "@/components/auth-provider";
import { listPrograms, type Program } from "@/lib/academic-api";
import { getProgramConstraint, type ProgramDailyTimeSlot } from "@/lib/constraints-api";
import { parseTimeToMinutes } from "@/lib/schedule-template";
import {
  TIMETABLE_UPDATED_EVENT,
  analyzeTimetableConflicts,
  decideTimetableChangeRequest,
  fetchFullOfficialTimetable,
  listTimetableChangeRequests,
  proposeTimetableChangeRequest,
  type OfficialTimetablePayload,
  type TimetableChangeRequest,
} from "@/lib/timetable-api";
import type { Course, Faculty, Room, TimeSlot } from "@/lib/timetable-types";

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ROOM_ONLY_CONFLICT_TYPES = new Set(["room_conflict", "room-overlap", "room_capacity", "capacity", "room_type"]);

function dayLabelFromIsoDate(isoDate: string): string | null {
  if (!isoDate) {
    return null;
  }
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return DAY_ORDER[parsed.getDay() - 1] ?? "Sunday";
}

type FilterKind = "semester-section" | "faculty" | "room";
type RequestKind = "slot_move" | "resource_reassign" | "extra_class";
type CollaborationChannel = "teacher_teacher" | "teacher_student" | "student_teacher" | "admin_workflow" | "other";
const KEEP_EXISTING_VALUE = "__keep_existing__";
const COLLABORATION_CHANNELS: CollaborationChannel[] = [
  "teacher_teacher",
  "teacher_student",
  "student_teacher",
  "admin_workflow",
  "other",
];

interface CollaborationActivity {
  request: TimetableChangeRequest;
  channel: CollaborationChannel;
  channelLabel: string;
  requesterLabel: string;
  approverLabel: string;
  requestKindLabel: string;
  affectedSummary: string;
  proposalSummary: string;
  statusSummary: string;
  decisionTimeline: string;
  turnaroundMinutes: number | null;
  pendingMinutes: number | null;
}

interface SemesterSectionOption {
  key: string;
  semester: number | null;
  section: string;
  label: string;
}

interface RoomSuggestion {
  slotId: string;
  day: string;
  startTime: string;
  endTime: string;
  roomId: string;
  roomName: string;
  message: string;
}

interface AlternativeSlotSuggestion {
  day: string;
  startTime: string;
  endTime: string;
}

function clonePayload(payload: OfficialTimetablePayload): OfficialTimetablePayload {
  return JSON.parse(JSON.stringify(payload)) as OfficialTimetablePayload;
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

function slotOverlaps(left: TimeSlot, right: TimeSlot): boolean {
  if (left.day !== right.day) {
    return false;
  }
  const leftStart = parseTimeToMinutes(left.startTime);
  const leftEnd = parseTimeToMinutes(left.endTime);
  const rightStart = parseTimeToMinutes(right.startTime);
  const rightEnd = parseTimeToMinutes(right.endTime);
  if (!Number.isFinite(leftStart) || !Number.isFinite(leftEnd) || !Number.isFinite(rightStart) || !Number.isFinite(rightEnd)) {
    return false;
  }
  return rangesOverlap(leftStart, leftEnd, rightStart, rightEnd);
}

function slotFacultyIds(slot: TimeSlot): string[] {
  const ids = [slot.facultyId, ...(slot.assistantFacultyIds ?? [])]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

function buildSemesterSectionOptions(payload: OfficialTimetablePayload): SemesterSectionOption[] {
  const courseById = new Map(payload.courseData.map((item) => [item.id, item]));
  const output = new Map<string, SemesterSectionOption>();

  for (const slot of payload.timetableData) {
    const course = courseById.get(slot.courseId);
    const semester = typeof course?.semesterNumber === "number" ? course.semesterNumber : (payload.termNumber ?? null);
    const section = (slot.section || "Unassigned").trim() || "Unassigned";
    const key = `${semester ?? "unknown"}|${section.toUpperCase()}`;
    if (output.has(key)) {
      continue;
    }
    output.set(key, {
      key,
      semester,
      section,
      label: `${semester ? `Semester ${semester}` : "Semester ?"} • Section ${section}`,
    });
  }

  return Array.from(output.values()).sort((left, right) => {
    const leftSemester = left.semester ?? Number.MAX_SAFE_INTEGER;
    const rightSemester = right.semester ?? Number.MAX_SAFE_INTEGER;
    if (leftSemester !== rightSemester) {
      return leftSemester - rightSemester;
    }
    return left.section.localeCompare(right.section, undefined, { numeric: true, sensitivity: "base" });
  });
}

function filterSlotsByKind(
  slots: TimeSlot[],
  filterKind: FilterKind,
  selectedSemesterSection: string,
  selectedFacultyId: string,
  selectedRoomId: string,
  payload: OfficialTimetablePayload,
): TimeSlot[] {
  if (filterKind === "faculty") {
    if (!selectedFacultyId) {
      return [];
    }
    return slots.filter((slot) => slot.facultyId === selectedFacultyId || (slot.assistantFacultyIds ?? []).includes(selectedFacultyId));
  }

  if (filterKind === "room") {
    if (!selectedRoomId) {
      return [];
    }
    return slots.filter((slot) => slot.roomId === selectedRoomId);
  }

  if (!selectedSemesterSection) {
    return [];
  }

  const [semesterRaw, sectionRaw] = selectedSemesterSection.split("|");
  const semesterFilter = semesterRaw && semesterRaw !== "unknown" ? Number(semesterRaw) : null;
  const sectionFilter = sectionRaw ?? "";
  const courseById = new Map(payload.courseData.map((item) => [item.id, item]));

  return slots.filter((slot) => {
    if (sectionFilter && slot.section.toUpperCase() !== sectionFilter.toUpperCase()) {
      return false;
    }
    if (semesterFilter === null) {
      return true;
    }
    const course = courseById.get(slot.courseId);
    const slotSemester = typeof course?.semesterNumber === "number" ? course.semesterNumber : payload.termNumber ?? null;
    return slotSemester === semesterFilter;
  });
}

function buildGridRows(slots: TimeSlot[], dailySlots: ProgramDailyTimeSlot[]): WeeklyGridRow[] {
  const rows = new Map<string, WeeklyGridRow>();

  for (const item of dailySlots) {
    if (isRemovedLegacySlotRange(item.start_time, item.end_time)) {
      continue;
    }
    const slotIsLunch = isCanonicalLunchRange(item.start_time, item.end_time);
    if (item.tag === "lunch" && !slotIsLunch) {
      continue;
    }
    if (overlapsCanonicalLunchWindow(item.start_time, item.end_time) && !slotIsLunch) {
      continue;
    }
    const key = `${item.start_time}|${item.end_time}`;
    rows.set(key, {
      startTime: item.start_time,
      endTime: item.end_time,
      tag: slotIsLunch ? "lunch" : item.tag,
      label: slotIsLunch ? "Lunch Break" : item.label ?? undefined,
    });
  }

  const lunchKey = `${LUNCH_START_TIME}|${LUNCH_END_TIME}`;
  if (!rows.has(lunchKey)) {
    rows.set(lunchKey, {
      startTime: LUNCH_START_TIME,
      endTime: LUNCH_END_TIME,
      tag: "lunch",
      label: "Lunch Break",
    });
  }

  for (const slot of slots) {
    if (isRemovedLegacySlotRange(slot.startTime, slot.endTime)) {
      continue;
    }
    const slotIsLunch = isCanonicalLunchRange(slot.startTime, slot.endTime);
    if (overlapsCanonicalLunchWindow(slot.startTime, slot.endTime) && !slotIsLunch) {
      continue;
    }
    const key = `${slot.startTime}|${slot.endTime}`;
    if (!rows.has(key)) {
      rows.set(key, {
        startTime: slot.startTime,
        endTime: slot.endTime,
        tag: slotIsLunch ? "lunch" : "teaching",
        label: slotIsLunch ? "Lunch Break" : undefined,
      });
    }
  }

  return Array.from(rows.values()).sort((left, right) => {
    const startDiff = parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime);
    if (startDiff !== 0) {
      return startDiff;
    }
    return parseTimeToMinutes(left.endTime) - parseTimeToMinutes(right.endTime);
  });
}

function buildCellEntries(
  slots: TimeSlot[],
  courseById: Map<string, Course>,
  facultyById: Map<string, Faculty>,
  roomById: Map<string, Room>,
): Record<string, WeeklyGridResolvedSlot[]> {
  const output: Record<string, WeeklyGridResolvedSlot[]> = {};

  for (const slot of slots) {
    const key = `${slot.day}|${slot.startTime}|${slot.endTime}`;
    if (!output[key]) {
      output[key] = [];
    }
    output[key].push({
      slot,
      course: courseById.get(slot.courseId),
      faculty: facultyById.get(slot.facultyId),
      room: roomById.get(slot.roomId),
    });
  }

  for (const key of Object.keys(output)) {
    output[key].sort((left, right) => {
      const leftCode = left.course?.code ?? left.slot.courseId;
      const rightCode = right.course?.code ?? right.slot.courseId;
      return leftCode.localeCompare(rightCode);
    });
  }

  return output;
}

function findAlternativeRoom(payload: OfficialTimetablePayload, slotId: string): Room | null {
  const targetSlot = payload.timetableData.find((slot) => slot.id === slotId);
  if (!targetSlot) {
    return null;
  }

  const roomById = new Map(payload.roomData.map((item) => [item.id, item]));
  const currentRoom = roomById.get(targetSlot.roomId);
  const studentCount = targetSlot.studentCount ?? 0;

  const sortedRooms = [...payload.roomData].sort((left, right) => {
    const leftGap = Math.max(0, left.capacity - studentCount);
    const rightGap = Math.max(0, right.capacity - studentCount);
    if (leftGap !== rightGap) {
      return leftGap - rightGap;
    }
    return left.name.localeCompare(right.name);
  });

  for (const room of sortedRooms) {
    if (room.id === targetSlot.roomId) {
      continue;
    }
    if (currentRoom && room.type !== currentRoom.type) {
      continue;
    }
    if (studentCount > 0 && room.capacity < studentCount) {
      continue;
    }
    const roomConflict = payload.timetableData.some((slot) => {
      if (slot.id === targetSlot.id) {
        return false;
      }
      if (slot.roomId !== room.id) {
        return false;
      }
      return slotOverlaps(slot, targetSlot);
    });
    if (!roomConflict) {
      return room;
    }
  }

  return null;
}

function findAlternativeTimeSlots(
  payload: OfficialTimetablePayload,
  slotId: string,
  dailySlots: ProgramDailyTimeSlot[],
  maxSuggestions = 4,
): AlternativeSlotSuggestion[] {
  const targetSlot = payload.timetableData.find((slot) => slot.id === slotId);
  if (!targetSlot) {
    return [];
  }
  const rows = buildGridRows(payload.timetableData, dailySlots).filter((row) => row.tag === "teaching");
  const suggestions: AlternativeSlotSuggestion[] = [];
  const targetFacultyIds = slotFacultyIds(targetSlot);

  for (const day of DAY_ORDER) {
    for (const row of rows) {
      if (day === targetSlot.day && row.startTime === targetSlot.startTime && row.endTime === targetSlot.endTime) {
        continue;
      }
      const probe: TimeSlot = {
        ...targetSlot,
        day,
        startTime: row.startTime,
        endTime: row.endTime,
      };
      const hasConflict = payload.timetableData.some((other) => {
        if (other.id === targetSlot.id) {
          return false;
        }
        if (!slotOverlaps(probe, other)) {
          return false;
        }

        const sectionConflict = other.section.trim().toLowerCase() === probe.section.trim().toLowerCase();
        const roomConflict = other.roomId === probe.roomId;
        const otherFacultyIds = slotFacultyIds(other);
        const facultyConflict = targetFacultyIds.some((id) => otherFacultyIds.includes(id));
        return sectionConflict || roomConflict || facultyConflict;
      });

      if (hasConflict) {
        continue;
      }

      suggestions.push({
        day,
        startTime: row.startTime,
        endTime: row.endTime,
      });
      if (suggestions.length >= maxSuggestions) {
        return suggestions;
      }
    }
  }
  return suggestions;
}

function toUiError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "Cannot reach backend API. Start backend and verify NEXT_PUBLIC_API_BASE_URL.";
    }
    return error.message;
  }
  return "Unexpected request failure.";
}

function formatRoleLabel(role: string | null | undefined): string {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "faculty") return "Teacher";
  if (value === "student") return "Student";
  if (value === "scheduler") return "Scheduler";
  if (value === "admin") return "Admin";
  return value ? value[0].toUpperCase() + value.slice(1) : "Unknown";
}

function formatRequestKindLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "slot_move").trim().toLowerCase();
  if (normalized === "resource_reassign") return "Resource Reassign";
  if (normalized === "extra_class") return "Extra Class";
  return "Move Slot";
}

function formatDateTimeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function minutesBetween(fromIso: string | null | undefined, toIso: string | null | undefined): number | null {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const diff = Math.round((to.getTime() - from.getTime()) / 60000);
  return diff >= 0 ? diff : null;
}

function formatMinutesAsDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function channelLabel(channel: CollaborationChannel): string {
  if (channel === "teacher_teacher") return "Teacher ↔ Teacher";
  if (channel === "teacher_student") return "Teacher → Student";
  if (channel === "student_teacher") return "Student → Teacher";
  if (channel === "admin_workflow") return "Admin/Scheduler Workflow";
  return "Other";
}

function classifyCollaborationChannel(
  request: TimetableChangeRequest,
  sourceSlot: TimeSlot | undefined,
): CollaborationChannel {
  const requesterRole = request.requestedByRole;
  const approverRole = request.approverRole ?? null;
  const targetFacultyId = request.proposal.facultyId ?? null;
  const sourceFacultyId = sourceSlot?.facultyId ?? null;
  const teacherReassignRequested = Boolean(
    targetFacultyId && (!sourceFacultyId || targetFacultyId !== sourceFacultyId),
  );

  if (teacherReassignRequested) {
    return "teacher_teacher";
  }
  if (requesterRole === "faculty" && approverRole === "student") {
    return "teacher_student";
  }
  if (requesterRole === "student" && approverRole === "faculty") {
    return "student_teacher";
  }
  if (
    requesterRole === "admin"
    || requesterRole === "scheduler"
    || approverRole === "admin"
    || approverRole === "scheduler"
  ) {
    return "admin_workflow";
  }
  return "other";
}

export default function TimetableCollaborationPage() {
  const { user } = useAuth();
  const canPropose = user?.role === "student" || user?.role === "faculty";

  const [programs, setPrograms] = useState<Program[]>([]);
  const [payload, setPayload] = useState<OfficialTimetablePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [filterKind, setFilterKind] = useState<FilterKind>("semester-section");
  const [selectedSemesterSection, setSelectedSemesterSection] = useState("");
  const [selectedFacultyId, setSelectedFacultyId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [requestKind, setRequestKind] = useState<RequestKind>("slot_move");
  const [targetFacultyId] = useState<string>(KEEP_EXISTING_VALUE);
  const [targetRoomId] = useState<string>(KEEP_EXISTING_VALUE);
  const [targetSection] = useState<string>(KEEP_EXISTING_VALUE);
  const [selectedInterchangeDate, setSelectedInterchangeDate] = useState("");
  const [selectedClassSlotId, setSelectedClassSlotId] = useState("");
  const [selectedInterchangeTeacherId, setSelectedInterchangeTeacherId] = useState("");
  const [proposalNote, setProposalNote] = useState("");
  const [dailySlots, setDailySlots] = useState<ProgramDailyTimeSlot[]>([]);
  const [changeRequests, setChangeRequests] = useState<TimetableChangeRequest[]>([]);
  const [roomSuggestion, setRoomSuggestion] = useState<RoomSuggestion | null>(null);
  const [decisionBusyId, setDecisionBusyId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<"all" | CollaborationChannel>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | TimetableChangeRequest["status"]>("all");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadPayload = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchFullOfficialTimetable();
      setPayload(data);
      setError(null);
    } catch (err) {
      setError(toUiError(err));
      setPayload(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadChangeRequests = useCallback(async () => {
    if (!user) {
      setChangeRequests([]);
      return;
    }
    try {
      const mine = user.role === "student" || user.role === "faculty";
      const data = await listTimetableChangeRequests({ mine });
      setChangeRequests(data);
    } catch (err) {
      setError(toUiError(err));
    }
  }, [user]);

  useEffect(() => {
    listPrograms().then(setPrograms).catch(() => setPrograms([]));
  }, []);

  useEffect(() => {
    void loadPayload();
  }, [loadPayload]);

  useEffect(() => {
    void loadChangeRequests();
  }, [loadChangeRequests]);

  useEffect(() => {
    const onTimetableUpdated = () => {
      void loadPayload();
      void loadChangeRequests();
    };
    window.addEventListener(TIMETABLE_UPDATED_EVENT, onTimetableUpdated as EventListener);
    return () => {
      window.removeEventListener(TIMETABLE_UPDATED_EVENT, onTimetableUpdated as EventListener);
    };
  }, [loadChangeRequests, loadPayload]);

  const activeProgramId = payload?.programId ?? "";

  useEffect(() => {
    if (!activeProgramId) {
      setDailySlots([]);
      return;
    }
    getProgramConstraint(activeProgramId)
      .then((constraint) => {
        const sorted = [...(constraint.daily_time_slots ?? [])].sort((left, right) =>
          parseTimeToMinutes(left.start_time) - parseTimeToMinutes(right.start_time),
        );
        setDailySlots(sorted);
      })
      .catch(() => setDailySlots([]));
  }, [activeProgramId]);

  const programById = useMemo(() => new Map(programs.map((item) => [item.id, item])), [programs]);
  const activeProgram = activeProgramId ? programById.get(activeProgramId) : undefined;

  const courseById = useMemo(() => new Map((payload?.courseData ?? []).map((item) => [item.id, item])), [payload?.courseData]);
  const facultyById = useMemo(() => new Map((payload?.facultyData ?? []).map((item) => [item.id, item])), [payload?.facultyData]);
  const roomById = useMemo(() => new Map((payload?.roomData ?? []).map((item) => [item.id, item])), [payload?.roomData]);

  const semesterSectionOptions = useMemo(() => (payload ? buildSemesterSectionOptions(payload) : []), [payload]);

  useEffect(() => {
    if (!semesterSectionOptions.length) {
      setSelectedSemesterSection("");
      return;
    }
    if (!semesterSectionOptions.some((item) => item.key === selectedSemesterSection)) {
      setSelectedSemesterSection(semesterSectionOptions[0].key);
    }
  }, [semesterSectionOptions, selectedSemesterSection]);

  const facultyOptions = useMemo(
    () => [...(payload?.facultyData ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    [payload?.facultyData],
  );

  useEffect(() => {
    if (!facultyOptions.length) {
      setSelectedFacultyId("");
      return;
    }
    if (!facultyOptions.some((item) => item.id === selectedFacultyId)) {
      setSelectedFacultyId(facultyOptions[0].id);
    }
  }, [facultyOptions, selectedFacultyId]);

  const roomOptions = useMemo(
    () => [...(payload?.roomData ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    [payload?.roomData],
  );
  useEffect(() => {
    if (!roomOptions.length) {
      setSelectedRoomId("");
      return;
    }
    if (!roomOptions.some((item) => item.id === selectedRoomId)) {
      setSelectedRoomId(roomOptions[0].id);
    }
  }, [roomOptions, selectedRoomId]);

  const filteredSlots = useMemo(() => {
    if (!payload) {
      return [] as TimeSlot[];
    }
    return filterSlotsByKind(
      payload.timetableData,
      filterKind,
      selectedSemesterSection,
      selectedFacultyId,
      selectedRoomId,
      payload,
    ).filter((slot) => {
      if (isRemovedLegacySlotRange(slot.startTime, slot.endTime)) {
        return false;
      }
      const slotIsLunch = isCanonicalLunchRange(slot.startTime, slot.endTime);
      if (overlapsCanonicalLunchWindow(slot.startTime, slot.endTime) && !slotIsLunch) {
        return false;
      }
      return true;
    });
  }, [filterKind, payload, selectedFacultyId, selectedRoomId, selectedSemesterSection]);

  const rows = useMemo(() => buildGridRows(filteredSlots, dailySlots), [dailySlots, filteredSlots]);

  const days = useMemo(() => {
    const values = new Set(filteredSlots.map((slot) => slot.day));
    const ordered = DAY_ORDER.filter((day) => values.has(day));
    return ordered.length ? ordered : DAY_ORDER.slice(0, 5);
  }, [filteredSlots]);

  const cellEntries = useMemo(
    () => buildCellEntries(filteredSlots, courseById, facultyById, roomById),
    [courseById, facultyById, filteredSlots, roomById],
  );

  const submitProposal = useCallback(async (
    proposal: {
      slotId: string;
      day: string;
      startTime: string;
      endTime: string;
      roomId?: string;
      facultyId?: string;
      section?: string;
      requestKind?: RequestKind;
    },
  ) => {
    if (!canPropose) {
      setError("Only students and faculty can submit timetable change requests.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await proposeTimetableChangeRequest({
        ...proposal,
        roomId: proposal.roomId,
        facultyId: proposal.facultyId,
        section: proposal.section,
        requestKind: proposal.requestKind,
        note: proposalNote.trim() || undefined,
      });
      const approver = response.approverRole ? response.approverRole.toUpperCase() : "APPROVER";
      setSuccess(`Change request submitted. Awaiting ${approver} approval.`);
      await loadChangeRequests();
    } catch (err) {
      setError(toUiError(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [canPropose, loadChangeRequests, proposalNote]);

  const handleMoveSlot = useCallback(async (
    params: { slotId: string; targetDay: string; targetStartTime: string; targetEndTime: string },
  ) => {
    if (!payload) {
      return;
    }

    const sourceSlot = payload.timetableData.find((slot) => slot.id === params.slotId);
    if (!sourceSlot) {
      return;
    }

    if (
      sourceSlot.day === params.targetDay
      && sourceSlot.startTime === params.targetStartTime
      && sourceSlot.endTime === params.targetEndTime
    ) {
      return;
    }

    const candidatePayload = clonePayload(payload);
    const candidateSlot = candidatePayload.timetableData.find((slot) => slot.id === params.slotId);
    if (!candidateSlot) {
      setError("Selected class slot is no longer available.");
      return;
    }

    const resolvedRoomId = targetRoomId !== KEEP_EXISTING_VALUE ? targetRoomId : sourceSlot.roomId;
    const resolvedFacultyId = targetFacultyId !== KEEP_EXISTING_VALUE ? targetFacultyId : sourceSlot.facultyId;
    const resolvedSection = targetSection !== KEEP_EXISTING_VALUE ? targetSection : sourceSlot.section;

    const previewSlotId = requestKind === "extra_class" ? `preview-extra-${sourceSlot.id}` : sourceSlot.id;
    if (requestKind === "extra_class") {
      candidatePayload.timetableData.push({
        ...sourceSlot,
        id: previewSlotId,
        day: params.targetDay,
        startTime: params.targetStartTime,
        endTime: params.targetEndTime,
        roomId: resolvedRoomId,
        facultyId: resolvedFacultyId,
        section: resolvedSection,
      });
    } else {
      candidateSlot.day = params.targetDay;
      candidateSlot.startTime = params.targetStartTime;
      candidateSlot.endTime = params.targetEndTime;
      candidateSlot.roomId = resolvedRoomId;
      candidateSlot.facultyId = resolvedFacultyId;
      candidateSlot.section = resolvedSection;
    }

    setError(null);
    setSuccess(null);

    try {
      const report = await analyzeTimetableConflicts(candidatePayload);
      const impacted = report.conflicts.filter(
        (item) => !item.resolved && item.affected_slots.includes(previewSlotId),
      );

      if (!impacted.length) {
        await submitProposal({
          slotId: params.slotId,
          day: params.targetDay,
          startTime: params.targetStartTime,
          endTime: params.targetEndTime,
          roomId: resolvedRoomId,
          facultyId: resolvedFacultyId,
          section: resolvedSection,
          requestKind,
        });
        return;
      }

      const roomOnly = impacted.every((item) => ROOM_ONLY_CONFLICT_TYPES.has(item.conflict_type));
      if (!roomOnly) {
        const alternatives = findAlternativeTimeSlots(candidatePayload, previewSlotId, dailySlots);
        const alternativeText = alternatives.length
          ? ` Suggested free slots: ${alternatives.map((item) => `${item.day} ${item.startTime}-${item.endTime}`).join(" | ")}.`
          : "";
        setError(`Move blocked: this target slot creates section/faculty conflicts.${alternativeText}`);
        return;
      }

      const alternativeRoom = findAlternativeRoom(candidatePayload, params.slotId);
      if (!alternativeRoom) {
        setError("Move blocked: room conflict found and no alternate free room is available.");
        return;
      }

      setRoomSuggestion({
        slotId: params.slotId,
        day: params.targetDay,
        startTime: params.targetStartTime,
        endTime: params.targetEndTime,
        roomId: alternativeRoom.id,
        roomName: alternativeRoom.name,
        message: `Only room conflict found. Suggested room: ${alternativeRoom.name}. Confirm to send this proposal.`,
      });
    } catch (err) {
      setError(toUiError(err));
    }
  }, [payload, requestKind, submitProposal, targetFacultyId, targetRoomId, targetSection]);

  const handleDecision = useCallback(async (requestId: string, decision: "approve" | "reject") => {
    setDecisionBusyId(requestId);
    setError(null);
    setSuccess(null);
    try {
      const result = await decideTimetableChangeRequest(requestId, decision);
      setSuccess(result.message);
      await loadChangeRequests();
      await loadPayload();
    } catch (err) {
      setError(toUiError(err));
    } finally {
      setDecisionBusyId(null);
    }
  }, [loadChangeRequests, loadPayload]);

  const pending = useMemo(
    () => changeRequests.filter((item) => item.status === "pending"),
    [changeRequests],
  );

  const collaborationActivities = useMemo(() => {
    if (!payload) {
      return [] as CollaborationActivity[];
    }
    const sourceSlotById = new Map(payload.timetableData.map((slot) => [slot.id, slot]));
    const nowIso = new Date().toISOString();

    const rows = changeRequests.map((request) => {
      const sourceSlot = sourceSlotById.get(request.slotId);
      const sourceCourse = sourceSlot ? courseById.get(sourceSlot.courseId) : undefined;
      const sourceFaculty = sourceSlot ? facultyById.get(sourceSlot.facultyId) : undefined;
      const sourceRoom = sourceSlot ? roomById.get(sourceSlot.roomId) : undefined;

      const targetFaculty = request.proposal.facultyId ? facultyById.get(request.proposal.facultyId) : undefined;
      const targetRoom = request.proposal.roomId ? roomById.get(request.proposal.roomId) : undefined;
      const targetSection = (request.proposal.section || sourceSlot?.section || "—").trim() || "—";
      const channel = classifyCollaborationChannel(request, sourceSlot);

      const requesterRoleLabel = formatRoleLabel(request.requestedByRole);
      const approverRoleLabel = formatRoleLabel(request.approverRole);
      const requesterLabel = request.requestedByName?.trim()
        ? `${request.requestedByName} (${requesterRoleLabel})`
        : requesterRoleLabel;
      const approverLabel = request.approverName?.trim()
        ? `${request.approverName} (${approverRoleLabel})`
        : approverRoleLabel;

      const startTarget = `${request.proposal.day} ${request.proposal.startTime}-${request.proposal.endTime}`;
      const proposalParts = [startTarget];
      if (targetFaculty) {
        proposalParts.push(`Teacher: ${targetFaculty.name}`);
      } else if (request.proposal.facultyId) {
        proposalParts.push(`Teacher: ${request.proposal.facultyId}`);
      }
      if (targetRoom) {
        proposalParts.push(`Room: ${targetRoom.name}`);
      } else if (request.proposal.roomId) {
        proposalParts.push(`Room: ${request.proposal.roomId}`);
      }
      proposalParts.push(`Section: ${targetSection}`);

      const affectedSummary = sourceSlot
        ? `${sourceCourse?.code ?? sourceSlot.courseId} • ${sourceCourse?.name ?? "Course"} • ${sourceSlot.day} ${sourceSlot.startTime}-${sourceSlot.endTime} • ${sourceRoom?.name ?? sourceSlot.roomId} • Teacher: ${sourceFaculty?.name ?? sourceSlot.facultyId}`
        : `${request.slotId} • Source slot not found in current timetable snapshot`;

      const statusSummary = request.status === "pending"
        ? "Awaiting approver decision"
        : request.status === "applied"
          ? "Approved and applied to timetable"
          : request.status === "approved"
            ? "Approved"
            : "Rejected";

      const completionTime = request.appliedAt ?? request.decidedAt ?? null;
      const turnaroundMinutes = minutesBetween(request.createdAt, completionTime);
      const pendingMinutes = request.status === "pending" ? minutesBetween(request.createdAt, nowIso) : null;

      return {
        request,
        channel,
        channelLabel: channelLabel(channel),
        requesterLabel,
        approverLabel,
        requestKindLabel: formatRequestKindLabel(request.proposal.requestKind),
        affectedSummary,
        proposalSummary: proposalParts.join(" • "),
        statusSummary,
        decisionTimeline: [
          `Created: ${formatDateTimeLabel(request.createdAt)}`,
          request.decidedAt ? `Decided: ${formatDateTimeLabel(request.decidedAt)}` : null,
          request.appliedAt ? `Applied: ${formatDateTimeLabel(request.appliedAt)}` : null,
        ].filter(Boolean).join(" | "),
        turnaroundMinutes,
        pendingMinutes,
      } satisfies CollaborationActivity;
    });

    rows.sort((left, right) => {
      const leftTime = Date.parse(left.request.createdAt);
      const rightTime = Date.parse(right.request.createdAt);
      if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
      return rightTime - leftTime;
    });
    return rows;
  }, [changeRequests, courseById, facultyById, payload, roomById]);

  const filteredActivities = useMemo(() => {
    return collaborationActivities.filter((item) => {
      if (channelFilter !== "all" && item.channel !== channelFilter) {
        return false;
      }
      if (statusFilter !== "all" && item.request.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [channelFilter, collaborationActivities, statusFilter]);

  const channelCounts = useMemo(() => {
    const counts = new Map<CollaborationChannel, number>();
    for (const channel of COLLABORATION_CHANNELS) {
      counts.set(channel, 0);
    }
    for (const item of collaborationActivities) {
      counts.set(item.channel, (counts.get(item.channel) ?? 0) + 1);
    }
    return counts;
  }, [collaborationActivities]);

  const statusCounts = useMemo(() => {
    const counts: Record<TimetableChangeRequest["status"], number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      applied: 0,
    };
    for (const item of collaborationActivities) {
      counts[item.request.status] += 1;
    }
    return counts;
  }, [collaborationActivities]);

  const avgTurnaroundMinutes = useMemo(() => {
    const resolved = collaborationActivities
      .map((item) => item.turnaroundMinutes)
      .filter((value): value is number => value !== null);
    if (!resolved.length) {
      return null;
    }
    const sum = resolved.reduce((acc, item) => acc + item, 0);
    return Math.round(sum / resolved.length);
  }, [collaborationActivities]);

  const pendingOver24Hours = useMemo(() => {
    return collaborationActivities.filter((item) => item.request.status === "pending" && (item.pendingMinutes ?? 0) >= 24 * 60).length;
  }, [collaborationActivities]);

  const viewScopeLabel = useMemo(() => {
    if (filterKind === "faculty") {
      const faculty = facultyById.get(selectedFacultyId);
      return faculty ? `Faculty: ${faculty.name}` : "Faculty view";
    }
    if (filterKind === "room") {
      const room = roomById.get(selectedRoomId);
      return room ? `Room: ${room.name}` : "Room view";
    }
    const option = semesterSectionOptions.find((item) => item.key === selectedSemesterSection);
    return option ? option.label : "Semester-Section view";
  }, [facultyById, filterKind, roomById, selectedFacultyId, selectedRoomId, selectedSemesterSection, semesterSectionOptions]);

  const derivedFacultyIdsForUser = useMemo(() => {
    if (!user || user.role !== "faculty" || !payload) {
      return [] as string[];
    }
    const ids = new Set<string>();
    const email = String(user.email ?? "").trim().toLowerCase();
    const name = String(user.name ?? "").trim().toLowerCase();
    for (const faculty of payload.facultyData) {
      const facultyEmail = String(faculty.email ?? "").trim().toLowerCase();
      const facultyName = String(faculty.name ?? "").trim().toLowerCase();
      if ((email && facultyEmail && facultyEmail === email) || (name && facultyName && facultyName === name)) {
        ids.add(faculty.id);
      }
    }
    return [...ids];
  }, [payload, user]);

  const selectedInterchangeDay = useMemo(
    () => dayLabelFromIsoDate(selectedInterchangeDate),
    [selectedInterchangeDate],
  );

  const myClassesOnSelectedDate = useMemo(() => {
    if (!payload || !selectedInterchangeDay || !user) {
      return [] as Array<{ slot: TimeSlot; course?: Course; semester: number | null }>;
    }
    const sectionName = String(user.section_name ?? "").trim().toLowerCase();
    const rows: Array<{ slot: TimeSlot; course?: Course; semester: number | null }> = [];
    for (const slot of payload.timetableData) {
      if (slot.day !== selectedInterchangeDay) {
        continue;
      }
      if (isRemovedLegacySlotRange(slot.startTime, slot.endTime)) {
        continue;
      }
      const slotIsLunch = isCanonicalLunchRange(slot.startTime, slot.endTime);
      if (overlapsCanonicalLunchWindow(slot.startTime, slot.endTime) && !slotIsLunch) {
        continue;
      }
      if (slotIsLunch) {
        continue;
      }
      const assignedFacultyIds = slotFacultyIds(slot);
      const isMine = user.role === "faculty"
        ? derivedFacultyIdsForUser.some((id) => assignedFacultyIds.includes(id))
        : user.role === "student"
          ? sectionName.length > 0 && slot.section.trim().toLowerCase() === sectionName
          : false;
      if (!isMine) {
        continue;
      }
      const course = courseById.get(slot.courseId);
      rows.push({
        slot,
        course,
        semester: typeof course?.semesterNumber === "number" ? course.semesterNumber : payload.termNumber ?? null,
      });
    }
    rows.sort((left, right) => parseTimeToMinutes(left.slot.startTime) - parseTimeToMinutes(right.slot.startTime));
    return rows;
  }, [courseById, derivedFacultyIdsForUser, payload, selectedInterchangeDay, user]);

  useEffect(() => {
    if (!myClassesOnSelectedDate.length) {
      setSelectedClassSlotId("");
      return;
    }
    if (!myClassesOnSelectedDate.some((item) => item.slot.id === selectedClassSlotId)) {
      setSelectedClassSlotId(myClassesOnSelectedDate[0].slot.id);
    }
  }, [myClassesOnSelectedDate, selectedClassSlotId]);

  const selectedClassSlot = useMemo(
    () => myClassesOnSelectedDate.find((item) => item.slot.id === selectedClassSlotId) ?? null,
    [myClassesOnSelectedDate, selectedClassSlotId],
  );

  const interchangeTeacherOptions = useMemo(() => {
    if (!payload || !selectedClassSlot) {
      return [] as Faculty[];
    }
    const sourceSlot = selectedClassSlot.slot;
    const sourceSemester = selectedClassSlot.semester;
    const sourceSection = sourceSlot.section.trim().toLowerCase();
    const sourceFaculty = sourceSlot.facultyId;
    const sourceCourseId = sourceSlot.courseId;

    const candidates = new Set<string>();
    for (const slot of payload.timetableData) {
      if (slot.id === sourceSlot.id) {
        continue;
      }
      if (slot.courseId === sourceCourseId) {
        continue;
      }
      if (slot.section.trim().toLowerCase() !== sourceSection) {
        continue;
      }
      const course = courseById.get(slot.courseId);
      const semester = typeof course?.semesterNumber === "number" ? course.semesterNumber : payload.termNumber ?? null;
      if (semester !== sourceSemester) {
        continue;
      }
      const facultyId = String(slot.facultyId ?? "").trim();
      if (!facultyId || facultyId === sourceFaculty || facultyId.startsWith("nr-f-")) {
        continue;
      }
      candidates.add(facultyId);
    }

    const available: Faculty[] = [];
    for (const facultyId of candidates) {
      const faculty = facultyById.get(facultyId);
      if (!faculty) {
        continue;
      }
      const noFacultyName = faculty.name.trim().toLowerCase().includes("no faculty required");
      if (noFacultyName) {
        continue;
      }
      const hasConflict = payload.timetableData.some((slot) => {
        if (slot.id === sourceSlot.id || slot.day !== sourceSlot.day) {
          return false;
        }
        if (!slotOverlaps(sourceSlot, slot)) {
          return false;
        }
        return slotFacultyIds(slot).includes(facultyId);
      });
      if (!hasConflict) {
        available.push(faculty);
      }
    }

    available.sort((left, right) => left.name.localeCompare(right.name));
    return available;
  }, [courseById, facultyById, payload, selectedClassSlot]);

  useEffect(() => {
    if (!interchangeTeacherOptions.length) {
      setSelectedInterchangeTeacherId("");
      return;
    }
    if (!interchangeTeacherOptions.some((item) => item.id === selectedInterchangeTeacherId)) {
      setSelectedInterchangeTeacherId(interchangeTeacherOptions[0].id);
    }
  }, [interchangeTeacherOptions, selectedInterchangeTeacherId]);

  const handleApplyInterchangeRequest = useCallback(async () => {
    if (!selectedClassSlot) {
      setError("Choose a date and one of your classes first.");
      return;
    }
    if (!selectedInterchangeTeacherId) {
      setError("No conflict-free teacher option found for this class.");
      return;
    }
    await submitProposal({
      slotId: selectedClassSlot.slot.id,
      day: selectedClassSlot.slot.day,
      startTime: selectedClassSlot.slot.startTime,
      endTime: selectedClassSlot.slot.endTime,
      roomId: selectedClassSlot.slot.roomId,
      section: selectedClassSlot.slot.section,
      requestKind: "resource_reassign",
      facultyId: selectedInterchangeTeacherId,
    });
  }, [selectedClassSlot, selectedInterchangeTeacherId, submitProposal]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">Loading timetable collaboration workspace...</CardContent>
      </Card>
    );
  }

  if (!payload) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Timetable Collaboration</CardTitle>
          <CardDescription>Official timetable is not available yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{error ?? "Publish a timetable from Generator first."}</p>
          <Button variant="outline" onClick={() => void loadPayload()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reload
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <AlertDialog open={Boolean(roomSuggestion)} onOpenChange={(open) => !open && setRoomSuggestion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alternative Room Suggestion</AlertDialogTitle>
            <AlertDialogDescription>{roomSuggestion?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!roomSuggestion) {
                  return;
                }
                void submitProposal({
                  slotId: roomSuggestion.slotId,
                  day: roomSuggestion.day,
                  startTime: roomSuggestion.startTime,
                  endTime: roomSuggestion.endTime,
                  roomId: roomSuggestion.roomId,
                  facultyId: targetFacultyId !== KEEP_EXISTING_VALUE ? targetFacultyId : undefined,
                  section: targetSection !== KEEP_EXISTING_VALUE ? targetSection : undefined,
                  requestKind,
                });
                setRoomSuggestion(null);
              }}
            >
              Confirm & Send Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Timetable Collaboration</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Students and faculty can view class, faculty, and room timetables and submit change requests through structured approvals.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>View Scope</CardTitle>
            <CardDescription>
              Choose the timetable view context: Semester-Section, Faculty, or Room.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[240px_1fr]">
            <div className="lg:col-span-2 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">View Scope:</span> choose Semester-Section, Faculty, or Room.
            </div>
            <div className="space-y-2">
              <Label>Filter Type</Label>
              <Select value={filterKind} onValueChange={(value) => setFilterKind(value as FilterKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semester-section">Semester-Section</SelectItem>
                  <SelectItem value="faculty">Faculty</SelectItem>
                  <SelectItem value="room">Room</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                {filterKind === "semester-section" ? "Semester-Section" : filterKind === "faculty" ? "Faculty" : "Room"}
              </Label>
              {filterKind === "semester-section" ? (
                <Select value={selectedSemesterSection} onValueChange={setSelectedSemesterSection}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select semester and section" />
                  </SelectTrigger>
                  <SelectContent>
                    {semesterSectionOptions.map((option) => (
                      <SelectItem key={option.key} value={option.key}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {filterKind === "faculty" ? (
                <Select value={selectedFacultyId} onValueChange={setSelectedFacultyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select faculty" />
                  </SelectTrigger>
                  <SelectContent>
                    {facultyOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {filterKind === "room" ? (
                <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select room" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>

            <div className="lg:col-span-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">Program: {activeProgram?.name ?? "N/A"}</Badge>
              <Badge variant="outline">View scope: {viewScopeLabel}</Badge>
              <Badge variant="outline">Slots in view: {filteredSlots.length}</Badge>
            </div>
          </CardContent>
        </Card>

        {canPropose ? (
          <Card>
            <CardHeader>
              <CardTitle>Apply Change Request</CardTitle>
              <CardDescription>
                Pick a date, choose your class, and request interchange with a conflict-free teacher from the same semester and section.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={selectedInterchangeDate}
                  onChange={(event) => setSelectedInterchangeDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Your Classes On Selected Date</Label>
                <Select value={selectedClassSlotId} onValueChange={setSelectedClassSlotId} disabled={!myClassesOnSelectedDate.length}>
                  <SelectTrigger>
                    <SelectValue placeholder={selectedInterchangeDate ? "Select class slot" : "Pick a date first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {myClassesOnSelectedDate.map((item) => {
                      const code = item.course?.code ?? item.slot.courseId;
                      const semesterLabel = item.semester ? `Sem ${item.semester}` : "Sem ?";
                      return (
                        <SelectItem key={item.slot.id} value={item.slot.id}>
                          {`${item.slot.day} ${item.slot.startTime}-${item.slot.endTime} • ${code} • ${semesterLabel} • Sec ${item.slot.section}`}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Interchange Teacher (Conflict-Free)</Label>
                <Select
                  value={selectedInterchangeTeacherId}
                  onValueChange={setSelectedInterchangeTeacherId}
                  disabled={!selectedClassSlot || !interchangeTeacherOptions.length}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedClassSlot ? "Select teacher" : "Choose class first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {interchangeTeacherOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Request Type</Label>
                <Select value={requestKind} onValueChange={(value) => setRequestKind(value as RequestKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="resource_reassign">Interchange</SelectItem>
                    <SelectItem value="slot_move">Move Slot</SelectItem>
                    <SelectItem value="extra_class">Request Extra Class</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2 xl:col-span-4">
                <Label>Request Note (Optional)</Label>
                <Input
                  value={proposalNote}
                  onChange={(event) => setProposalNote(event.target.value)}
                  placeholder="Mention reason for this change request"
                  maxLength={300}
                />
              </div>

              <div className="md:col-span-2 xl:col-span-4 flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void handleApplyInterchangeRequest()}
                  disabled={!selectedClassSlot || !selectedInterchangeTeacherId || isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting
                    </span>
                  ) : (
                    "Apply Interchange Request"
                  )}
                </Button>
                <Badge variant="outline">Day: {selectedInterchangeDay ?? "—"}</Badge>
                <Badge variant="outline">Classes found: {myClassesOnSelectedDate.length}</Badge>
                <Badge variant="outline">Eligible teachers: {interchangeTeacherOptions.length}</Badge>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Collaboration Activity Analysis</CardTitle>
            <CardDescription>
              Tracks all timetable coordination flows: teacher ↔ teacher reassignments, teacher → student approvals, and student → teacher requests.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border bg-card p-4">
                <p className="text-sm text-muted-foreground">Teacher ↔ Teacher</p>
                <p className="mt-1 text-2xl font-semibold">{channelCounts.get("teacher_teacher") ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Faculty reassignment or swap-oriented change requests.</p>
              </div>
              <div className="rounded-md border bg-card p-4">
                <p className="text-sm text-muted-foreground">Teacher → Student</p>
                <p className="mt-1 text-2xl font-semibold">{channelCounts.get("teacher_student") ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Teacher-initiated requests waiting for class-side approval.</p>
              </div>
              <div className="rounded-md border bg-card p-4">
                <p className="text-sm text-muted-foreground">Student → Teacher</p>
                <p className="mt-1 text-2xl font-semibold">{channelCounts.get("student_teacher") ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Student-initiated requests waiting for faculty approval.</p>
              </div>
              <div className="rounded-md border bg-card p-4">
                <p className="text-sm text-muted-foreground">Pending &gt; 24h</p>
                <p className="mt-1 text-2xl font-semibold">{pendingOver24Hours}</p>
                <p className="mt-1 text-xs text-muted-foreground">Requests needing follow-up to avoid workflow delay.</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Clock3 className="h-4 w-4" />
                  Average Turnaround
                </div>
                <p className="mt-1 text-lg font-semibold">{formatMinutesAsDuration(avgTurnaroundMinutes)}</p>
                <p className="text-xs text-muted-foreground">From request creation to decision/application.</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <UserCheck className="h-4 w-4" />
                  Applied
                </div>
                <p className="mt-1 text-lg font-semibold">{statusCounts.applied}</p>
                <p className="text-xs text-muted-foreground">Approved and committed into official timetable.</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Users2 className="h-4 w-4" />
                  Pending
                </div>
                <p className="mt-1 text-lg font-semibold">{statusCounts.pending}</p>
                <p className="text-xs text-muted-foreground">Awaiting decision from the assigned approver.</p>
              </div>
            </div>

            <div className="rounded-md border">
              <div className="grid grid-cols-[minmax(170px,1fr)_repeat(4,minmax(88px,1fr))] border-b bg-muted/30 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>Channel</span>
                <span className="text-center">Pending</span>
                <span className="text-center">Applied</span>
                <span className="text-center">Rejected</span>
                <span className="text-center">Approved</span>
              </div>
              <div className="divide-y">
                {COLLABORATION_CHANNELS.map((channel) => {
                  const related = collaborationActivities.filter((item) => item.channel === channel);
                  const counts = {
                    pending: related.filter((item) => item.request.status === "pending").length,
                    applied: related.filter((item) => item.request.status === "applied").length,
                    rejected: related.filter((item) => item.request.status === "rejected").length,
                    approved: related.filter((item) => item.request.status === "approved").length,
                  };
                  return (
                    <div key={channel} className="grid grid-cols-[minmax(170px,1fr)_repeat(4,minmax(88px,1fr))] items-center px-3 py-2 text-sm">
                      <span className="font-medium">{channelLabel(channel)}</span>
                      <span className="text-center">{counts.pending}</span>
                      <span className="text-center">{counts.applied}</span>
                      <span className="text-center">{counts.rejected}</span>
                      <span className="text-center">{counts.approved}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Weekly Timetable Grid</CardTitle>
            <CardDescription>
              Approved interchange requests are reflected here automatically in the latest weekly view.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyTimetableGrid
              days={days}
              rows={rows}
              cellEntries={cellEntries}
              interactive={false}
              onMoveSlot={(params) => void handleMoveSlot(params)}
              emptyMessage="No timetable rows available for this filter selection."
            />
            {!canPropose ? (
              <p className="mt-3 text-xs text-muted-foreground">Only students and faculty can submit change requests from this page.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Collaboration Activity Log</CardTitle>
            <CardDescription>
              Structured timeline of proposals, approvals, and applied changes across teacher-student workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[220px_220px_1fr]">
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select value={channelFilter} onValueChange={(value) => setChannelFilter(value as "all" | CollaborationChannel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All channels</SelectItem>
                    {COLLABORATION_CHANNELS.map((channel) => (
                      <SelectItem key={channel} value={channel}>
                        {channelLabel(channel)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | TimetableChangeRequest["status"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="applied">Applied</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Button variant="outline" size="sm" onClick={() => void loadChangeRequests()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
                <Badge variant="outline">Visible: {filteredActivities.length}</Badge>
                <Badge variant="outline">Total: {changeRequests.length}</Badge>
                <Badge variant="outline">Pending: {pending.length}</Badge>
              </div>
            </div>

            {filteredActivities.length ? (
              <div className="max-h-[34rem] space-y-2 overflow-y-auto">
                {filteredActivities.slice(0, 60).map((item) => (
                  <div key={item.request.id} className="rounded-md border bg-background p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">Request {item.request.id.slice(0, 8)}</p>
                        <Badge variant="outline">{item.channelLabel}</Badge>
                        <Badge variant={item.request.status === "pending" ? "secondary" : item.request.status === "applied" ? "default" : "outline"}>
                          {item.request.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.turnaroundMinutes !== null ? `Turnaround: ${formatMinutesAsDuration(item.turnaroundMinutes)}` : `Open for: ${formatMinutesAsDuration(item.pendingMinutes)}`}
                      </div>
                    </div>

                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <div className="rounded-md border bg-muted/20 p-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workflow</p>
                        <p className="mt-1 flex items-center gap-1 text-sm">
                          <UserRound className="h-4 w-4 text-muted-foreground" />
                          {item.requesterLabel}
                          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                          {item.approverLabel}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.requestKindLabel}</p>
                      </div>
                      <div className="rounded-md border bg-muted/20 p-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                        <p className="mt-1 text-sm">{item.statusSummary}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.decisionTimeline}</p>
                      </div>
                    </div>

                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Affected:</span> {item.affectedSummary}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Proposed:</span> {item.proposalSummary}
                    </p>
                    {item.request.requestNote ? (
                      <p className="mt-1 text-xs text-muted-foreground">Note: {item.request.requestNote}</p>
                    ) : null}
                    {item.request.resolutionNote ? (
                      <p className="mt-1 text-xs text-emerald-700">Resolution: {item.request.resolutionNote}</p>
                    ) : null}
                    {item.request.decisionNote ? (
                      <p className="mt-1 text-xs text-muted-foreground">Decision note: {item.request.decisionNote}</p>
                    ) : null}

                    {item.request.status === "pending" && item.request.approverUserId === user?.id ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => void handleDecision(item.request.id, "approve")}
                          disabled={decisionBusyId === item.request.id}
                        >
                          {decisionBusyId === item.request.id ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Applying
                            </span>
                          ) : (
                            "Approve & Apply"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleDecision(item.request.id, "reject")}
                          disabled={decisionBusyId === item.request.id}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No collaboration activities for the selected filters.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
