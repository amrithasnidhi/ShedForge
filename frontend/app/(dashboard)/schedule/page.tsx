"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  Loader2,
  Redo2,
  RefreshCw,
  Send,
  Sparkles,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listPrograms, type Program } from "@/lib/academic-api";
import { getProgramConstraint, type ProgramDailyTimeSlot } from "@/lib/constraints-api";
import { WeeklyTimetableGrid, type WeeklyGridResolvedSlot, type WeeklyGridRow } from "@/components/timetable/weekly-timetable-grid";
import {
  LUNCH_END_TIME,
  LUNCH_START_TIME,
  isCanonicalLunchRange,
  isRemovedLegacySlotRange,
  overlapsCanonicalLunchWindow,
} from "@/components/timetable/weekly-grid-utils";
import { useOfficialTimetable } from "@/hooks/use-official-timetable";
import { parseTimeToMinutes } from "@/lib/schedule-template";
import {
  analyzeTimetableConflicts,
  decideTimetableChangeRequest,
  fetchLatestGeneratedDraftSnapshot,
  listTimetableChangeRequests,
  publishOfficialTimetable,
  publishTimetableDistribution,
  resolveAllTimetableConflicts,
  reviewTimetableConflicts,
  type OfficialTimetablePayload,
  type TimetableChangeRequest,
} from "@/lib/timetable-api";
import { loadGeneratedDraft } from "@/lib/generated-draft-store";
import { downloadTimetablePdf, downloadTimetableXlsx } from "@/lib/timetable-export";
import type { Conflict, Course, Faculty, Room, TimeSlot, TimetableConflictReview } from "@/lib/timetable-types";

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ROOM_ONLY_CONFLICT_TYPES = new Set(["room_conflict", "room-overlap", "room_capacity", "capacity", "room_type"]);
const MAX_HISTORY_STEPS = 50;

type ExportFormat = "pdf" | "xlsx";

interface ConflictPopupState {
  payload: OfficialTimetablePayload;
  slotId: string;
  message: string;
  conflictTypeLabels: string[];
  availableRooms: Room[];
  selectedRoomId: string;
  anchorX: number;
  anchorY: number;
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

function toUiError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "Cannot reach backend API. Start backend and verify NEXT_PUBLIC_API_BASE_URL.";
    }
    return error.message;
  }
  return "Unexpected request failure.";
}

function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function safeVibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  navigator.vibrate(pattern);
}

function sectionLabelFromIndex(index: number): string {
  if (index <= 0) {
    return `Section ${index}`;
  }
  let value = index;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function conflictLabel(conflictType: string): string {
  return conflictType.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function conflictResolutionDetail(conflict: Conflict): string {
  const explicitResolution = (conflict.resolution ?? "").trim();
  if (explicitResolution) {
    return explicitResolution;
  }
  const decisionNote = (conflict.decision_note ?? "").trim();
  if (decisionNote) {
    return decisionNote;
  }
  if (conflict.resolution_mode === "auto") {
    return "Resolved by automatic conflict resolver.";
  }
  if (conflict.resolution_mode === "manual") {
    return "Resolved manually by scheduler action.";
  }
  return "No resolution notes recorded yet.";
}

function isLunchReservedWindow(startTime: string, endTime: string): boolean {
  return overlapsCanonicalLunchWindow(startTime, endTime);
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

function buildScopedPayload(basePayload: OfficialTimetablePayload, slots: TimeSlot[]): OfficialTimetablePayload {
  const courseIds = new Set(slots.map((slot) => slot.courseId));
  const roomIds = new Set(slots.map((slot) => slot.roomId));
  const facultyIds = new Set<string>();
  for (const slot of slots) {
    for (const facultyId of slotFacultyIds(slot)) {
      facultyIds.add(facultyId);
    }
  }
  return {
    ...basePayload,
    timetableData: slots,
    courseData: basePayload.courseData.filter((item) => courseIds.has(item.id)),
    roomData: basePayload.roomData.filter((item) => roomIds.has(item.id)),
    facultyData: basePayload.facultyData.filter((item) => facultyIds.has(item.id)),
  };
}

function findAvailableRoomsForSlot(payload: OfficialTimetablePayload, slotId: string): Room[] {
  const targetSlot = payload.timetableData.find((slot) => slot.id === slotId);
  if (!targetSlot) {
    return [];
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

  const availableRooms: Room[] = [];
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
      availableRooms.push(room);
    }
  }

  return availableRooms;
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

      const hasBlockingConflict = payload.timetableData.some((other) => {
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

      if (hasBlockingConflict) {
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

export default function SchedulePage() {
  const {
    data: officialPayload,
    hasOfficial,
    isLoading,
    error: officialError,
    refresh: refreshOfficial,
  } = useOfficialTimetable();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [workingPayload, setWorkingPayload] = useState<OfficialTimetablePayload | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [latestDraftPayload, setLatestDraftPayload] = useState<OfficialTimetablePayload | null>(null);
  const [latestDraftLabel, setLatestDraftLabel] = useState<string | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [workspaceRefreshNonce, setWorkspaceRefreshNonce] = useState(0);

  const [selectedSemester, setSelectedSemester] = useState<string>("all");
  const [selectedSection, setSelectedSection] = useState<string>("all");
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>("all");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("all");
  const [publishSemester, setPublishSemester] = useState<string>("all");
  const [publishSection, setPublishSection] = useState<string>("all");
  const [publishFacultyId, setPublishFacultyId] = useState<string>("all");
  const [publishRoomId, setPublishRoomId] = useState<string>("all");

  const [dailySlots, setDailySlots] = useState<ProgramDailyTimeSlot[]>([]);

  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [publishLabel, setPublishLabel] = useState("");
  const [publishScopeMode, setPublishScopeMode] = useState<"all" | "filtered">("all");

  const [isApplyingMove, setIsApplyingMove] = useState(false);
  const [conflictPopup, setConflictPopup] = useState<ConflictPopupState | null>(null);
  const [undoStack, setUndoStack] = useState<OfficialTimetablePayload[]>([]);
  const [redoStack, setRedoStack] = useState<OfficialTimetablePayload[]>([]);

  const [changeRequests, setChangeRequests] = useState<TimetableChangeRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestDecisionBusyId, setRequestDecisionBusyId] = useState<string | null>(null);
  const [conflictReview, setConflictReview] = useState<TimetableConflictReview | null>(null);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [isResolveAllBusy, setIsResolveAllBusy] = useState(false);
  const [conflictReviewError, setConflictReviewError] = useState<string | null>(null);
  const [conflictReviewRefreshNonce, setConflictReviewRefreshNonce] = useState(0);

  const [isPublishing, setIsPublishing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    listPrograms()
      .then((items) => setPrograms(items))
      .catch(() => setPrograms([]));
  }, []);

  useEffect(() => {
    const pickLocalSnapshot = () => {
      const local = loadGeneratedDraft();
      if (!local) {
        return false;
      }
      setLatestDraftPayload(local.payload);
      setLatestDraftLabel(local.label);
      return true;
    };

    let isActive = true;
    setIsLoadingDraft(true);
    fetchLatestGeneratedDraftSnapshot()
      .then((snapshot) => {
        if (!isActive) {
          return;
        }
        if (!snapshot) {
          const hasLocal = pickLocalSnapshot();
          if (!hasLocal) {
            setLatestDraftPayload(null);
            setLatestDraftLabel(null);
          }
          return;
        }
        // Prefer backend snapshot when available so full cycle snapshots are not overridden
        // by a single-term local draft saved from the generator preview.
        setLatestDraftPayload(snapshot.payload);
        setLatestDraftLabel(snapshot.version.label);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        const hasLocal = pickLocalSnapshot();
        if (!hasLocal) {
          setLatestDraftPayload(null);
          setLatestDraftLabel(null);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingDraft(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [workspaceRefreshNonce]);

  const workspaceSeedPayload = latestDraftPayload ?? officialPayload;

  useEffect(() => {
    if (!workspaceSeedPayload) {
      setWorkingPayload(null);
      setIsDirty(false);
      setUndoStack([]);
      setRedoStack([]);
      setConflictPopup(null);
      return;
    }
    if (!isDirty) {
      setWorkingPayload(clonePayload(workspaceSeedPayload));
      setUndoStack([]);
      setRedoStack([]);
      setConflictPopup(null);
    }
  }, [isDirty, workspaceSeedPayload]);

  const activeProgramId = workingPayload?.programId ?? "";

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

  const loadChangeRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const data = await listTimetableChangeRequests();
      setChangeRequests(data);
    } catch (err) {
      setError(toUiError(err));
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChangeRequests();
  }, [loadChangeRequests]);

  useEffect(() => {
    if (!workingPayload) {
      setConflictReview(null);
      setConflictReviewError(null);
      setIsReviewLoading(false);
      return;
    }

    let isActive = true;
    const timer = window.setTimeout(() => {
      setIsReviewLoading(true);
      setConflictReviewError(null);
      reviewTimetableConflicts(workingPayload)
        .then((data) => {
          if (!isActive) {
            return;
          }
          setConflictReview(data);
        })
        .catch((err) => {
          if (!isActive) {
            return;
          }
          setConflictReview(null);
          setConflictReviewError(toUiError(err));
        })
        .finally(() => {
          if (isActive) {
            setIsReviewLoading(false);
          }
        });
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [conflictReviewRefreshNonce, workingPayload]);

  const programById = useMemo(() => new Map(programs.map((item) => [item.id, item])), [programs]);
  const activeProgram = activeProgramId ? programById.get(activeProgramId) : undefined;

  const courseById = useMemo(() => new Map((workingPayload?.courseData ?? []).map((item) => [item.id, item])), [workingPayload?.courseData]);
  const facultyById = useMemo(() => new Map((workingPayload?.facultyData ?? []).map((item) => [item.id, item])), [workingPayload?.facultyData]);
  const roomById = useMemo(() => new Map((workingPayload?.roomData ?? []).map((item) => [item.id, item])), [workingPayload?.roomData]);

  const semesterOptions = useMemo(() => {
    const values = new Set<number>();

    if (activeProgram && Number.isFinite(activeProgram.duration_years) && activeProgram.duration_years > 0) {
      const maxSemester = activeProgram.duration_years * 2;
      for (let semester = 1; semester <= maxSemester; semester += 1) {
        values.add(semester);
      }
    }

    if (workingPayload) {
      for (const course of workingPayload.courseData) {
        const semesterNumber = course.semesterNumber;
        if (typeof semesterNumber === "number" && Number.isFinite(semesterNumber) && semesterNumber > 0) {
          values.add(semesterNumber);
        }
      }
      for (const slot of workingPayload.timetableData) {
        const course = courseById.get(slot.courseId);
        const semesterNumber = typeof course?.semesterNumber === "number" && course.semesterNumber > 0
          ? course.semesterNumber
          : (workingPayload.termNumber ?? null);
        if (typeof semesterNumber === "number" && Number.isFinite(semesterNumber) && semesterNumber > 0) {
          values.add(semesterNumber);
        }
      }
    }

    return Array.from(values).sort((left, right) => left - right);
  }, [activeProgram, courseById, workingPayload]);

  useEffect(() => {
    if (selectedSemester === "all") {
      return;
    }
    if (!semesterOptions.includes(Number(selectedSemester))) {
      setSelectedSemester("all");
    }
  }, [selectedSemester, semesterOptions]);

  const facultyOptions = useMemo(
    () => [...(workingPayload?.facultyData ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    [workingPayload?.facultyData],
  );

  useEffect(() => {
    if (selectedFacultyId === "all") {
      return;
    }
    if (!facultyOptions.some((item) => item.id === selectedFacultyId)) {
      setSelectedFacultyId("all");
    }
  }, [facultyOptions, selectedFacultyId]);

  const roomOptions = useMemo(
    () => [...(workingPayload?.roomData ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    [workingPayload?.roomData],
  );

  const sectionOptions = useMemo(() => {
    const seen = new Set<string>();
    const output: string[] = [];
    const register = (value: string) => {
      const normalized = value.trim();
      if (!normalized) {
        return;
      }
      const key = normalized.toUpperCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      output.push(normalized);
    };

    if (activeProgram && Number.isFinite(activeProgram.sections) && activeProgram.sections > 0) {
      for (let index = 1; index <= activeProgram.sections; index += 1) {
        register(sectionLabelFromIndex(index));
      }
    }

    if (workingPayload) {
      for (const slot of workingPayload.timetableData) {
        register(String(slot.section || ""));
      }
    }

    output.sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }));
    return output;
  }, [activeProgram, workingPayload]);

  useEffect(() => {
    if (selectedSection === "all") {
      return;
    }
    if (!sectionOptions.some((item) => item.localeCompare(selectedSection, undefined, { sensitivity: "base" }) === 0)) {
      setSelectedSection("all");
    }
  }, [sectionOptions, selectedSection]);

  useEffect(() => {
    if (selectedRoomId === "all") {
      return;
    }
    if (!roomOptions.some((item) => item.id === selectedRoomId)) {
      setSelectedRoomId("all");
    }
  }, [roomOptions, selectedRoomId]);

  useEffect(() => {
    if (publishSemester === "all") {
      return;
    }
    if (!semesterOptions.includes(Number(publishSemester))) {
      setPublishSemester("all");
    }
  }, [publishSemester, semesterOptions]);

  useEffect(() => {
    if (publishSection === "all") {
      return;
    }
    if (!sectionOptions.some((item) => item.localeCompare(publishSection, undefined, { sensitivity: "base" }) === 0)) {
      setPublishSection("all");
    }
  }, [publishSection, sectionOptions]);

  useEffect(() => {
    if (publishFacultyId === "all") {
      return;
    }
    if (!facultyOptions.some((item) => item.id === publishFacultyId)) {
      setPublishFacultyId("all");
    }
  }, [facultyOptions, publishFacultyId]);

  useEffect(() => {
    if (publishRoomId === "all") {
      return;
    }
    if (!roomOptions.some((item) => item.id === publishRoomId)) {
      setPublishRoomId("all");
    }
  }, [publishRoomId, roomOptions]);

  const filteredSlots = useMemo(() => {
    if (!workingPayload) {
      return [] as TimeSlot[];
    }
    return workingPayload.timetableData.filter((slot) => {
      const course = courseById.get(slot.courseId);
      const slotSemester = typeof course?.semesterNumber === "number"
        ? String(course.semesterNumber)
        : (workingPayload.termNumber !== null && workingPayload.termNumber !== undefined
          ? String(workingPayload.termNumber)
          : null);
      if (selectedSemester !== "all" && slotSemester !== selectedSemester) {
        return false;
      }
      if (selectedSection !== "all" && slot.section.trim().toUpperCase() !== selectedSection.toUpperCase()) {
        return false;
      }
      if (selectedFacultyId !== "all" && slot.facultyId !== selectedFacultyId && !(slot.assistantFacultyIds ?? []).includes(selectedFacultyId)) {
        return false;
      }
      if (selectedRoomId !== "all" && slot.roomId !== selectedRoomId) {
        return false;
      }
      if (isRemovedLegacySlotRange(slot.startTime, slot.endTime)) {
        return false;
      }
      const slotIsLunch = isCanonicalLunchRange(slot.startTime, slot.endTime);
      if (overlapsCanonicalLunchWindow(slot.startTime, slot.endTime) && !slotIsLunch) {
        return false;
      }
      return true;
    });
  }, [courseById, selectedFacultyId, selectedRoomId, selectedSection, selectedSemester, workingPayload]);

  const formatScopeLabel = useCallback(
    (semester: string, section: string, facultyId: string, roomId: string): string => {
      const parts: string[] = [];
      if (semester !== "all") {
        parts.push(`Semester ${semester}`);
      }
      if (section !== "all") {
        parts.push(`Section ${section}`);
      }
      if (facultyId !== "all") {
        parts.push(`Faculty ${facultyById.get(facultyId)?.name ?? facultyId}`);
      }
      if (roomId !== "all") {
        parts.push(`Room ${roomById.get(roomId)?.name ?? roomId}`);
      }
      return parts.length ? parts.join(" • ") : "All Timetable Slots";
    },
    [facultyById, roomById],
  );

  const publishFilteredSlots = useMemo(() => {
    if (!workingPayload) {
      return [] as TimeSlot[];
    }
    return workingPayload.timetableData.filter((slot) => {
      const course = courseById.get(slot.courseId);
      const slotSemester = typeof course?.semesterNumber === "number"
        ? String(course.semesterNumber)
        : (workingPayload.termNumber !== null && workingPayload.termNumber !== undefined
          ? String(workingPayload.termNumber)
          : null);
      if (publishSemester !== "all" && slotSemester !== publishSemester) {
        return false;
      }
      if (publishSection !== "all" && slot.section.trim().toUpperCase() !== publishSection.toUpperCase()) {
        return false;
      }
      if (publishFacultyId !== "all" && slot.facultyId !== publishFacultyId && !(slot.assistantFacultyIds ?? []).includes(publishFacultyId)) {
        return false;
      }
      if (publishRoomId !== "all" && slot.roomId !== publishRoomId) {
        return false;
      }
      if (isRemovedLegacySlotRange(slot.startTime, slot.endTime)) {
        return false;
      }
      const slotIsLunch = isCanonicalLunchRange(slot.startTime, slot.endTime);
      if (overlapsCanonicalLunchWindow(slot.startTime, slot.endTime) && !slotIsLunch) {
        return false;
      }
      return true;
    });
  }, [courseById, publishFacultyId, publishRoomId, publishSection, publishSemester, workingPayload]);

  const viewScopeLabel = useMemo(
    () => formatScopeLabel(selectedSemester, selectedSection, selectedFacultyId, selectedRoomId),
    [formatScopeLabel, selectedFacultyId, selectedRoomId, selectedSection, selectedSemester],
  );
  const publishScopeLabel = useMemo(
    () => formatScopeLabel(publishSemester, publishSection, publishFacultyId, publishRoomId),
    [formatScopeLabel, publishFacultyId, publishRoomId, publishSection, publishSemester],
  );

  const publishSlots = useMemo(() => {
    if (!workingPayload) {
      return [] as TimeSlot[];
    }
    const sanitize = (slots: TimeSlot[]) =>
      slots.filter((slot) => {
        if (isRemovedLegacySlotRange(slot.startTime, slot.endTime)) {
          return false;
        }
        const slotIsLunch = isCanonicalLunchRange(slot.startTime, slot.endTime);
        if (overlapsCanonicalLunchWindow(slot.startTime, slot.endTime) && !slotIsLunch) {
          return false;
        }
        return true;
      });
    if (publishScopeMode === "all") {
      return sanitize(workingPayload.timetableData);
    }
    return sanitize(publishFilteredSlots);
  }, [publishFilteredSlots, publishScopeMode, workingPayload]);

  const publishPayload = useMemo(() => {
    if (!workingPayload) {
      return null;
    }
    return buildScopedPayload(workingPayload, publishSlots);
  }, [publishSlots, workingPayload]);

  const days = useMemo(() => {
    const values = new Set(filteredSlots.map((slot) => slot.day));
    const ordered = DAY_ORDER.filter((day) => values.has(day));
    return ordered.length ? ordered : DAY_ORDER.slice(0, 5);
  }, [filteredSlots]);

  const rows = useMemo(() => buildGridRows(filteredSlots, dailySlots), [dailySlots, filteredSlots]);

  const cellEntries = useMemo(
    () => buildCellEntries(filteredSlots, courseById, facultyById, roomById),
    [courseById, facultyById, filteredSlots, roomById],
  );

  const pendingRequests = useMemo(
    () => changeRequests.filter((item) => item.status === "pending"),
    [changeRequests],
  );

  const recentRequests = useMemo(
    () => [...changeRequests].slice(0, 8),
    [changeRequests],
  );

  const pendingReviewConflicts = useMemo(
    () => conflictReview?.pendingConflicts ?? [],
    [conflictReview?.pendingConflicts],
  );
  const autoResolvedReviewConflicts = useMemo(
    () => conflictReview?.autoResolvedConflicts ?? [],
    [conflictReview?.autoResolvedConflicts],
  );
  const manualResolvedReviewConflicts = useMemo(
    () => conflictReview?.manuallyResolvedConflicts ?? [],
    [conflictReview?.manuallyResolvedConflicts],
  );
  const resolvedReviewCount = autoResolvedReviewConflicts.length + manualResolvedReviewConflicts.length;

  const applyPayload = useCallback(
    (
      payload: OfficialTimetablePayload,
      message: string,
      options?: { trackHistory?: boolean },
    ) => {
      setWorkingPayload((current) => {
        if (options?.trackHistory !== false && current) {
          setUndoStack((previous) => [...previous.slice(-(MAX_HISTORY_STEPS - 1)), clonePayload(current)]);
          setRedoStack([]);
        }
        return clonePayload(payload);
      });
      setIsDirty(true);
      setError(null);
      setConflictPopup(null);
      setSuccess(message);
    },
    [],
  );

  const handleUndo = useCallback(() => {
    if (!workingPayload || !undoStack.length) {
      return;
    }
    const previousPayload = undoStack[undoStack.length - 1];
    setUndoStack((previous) => previous.slice(0, -1));
    setRedoStack((previous) => [...previous.slice(-(MAX_HISTORY_STEPS - 1)), clonePayload(workingPayload)]);
    setWorkingPayload(clonePayload(previousPayload));
    setConflictPopup(null);
    setIsDirty(true);
    setError(null);
    setSuccess("Undid last timetable change.");
    safeVibrate([10, 20, 10]);
  }, [undoStack, workingPayload]);

  const handleRedo = useCallback(() => {
    if (!workingPayload || !redoStack.length) {
      return;
    }
    const nextPayload = redoStack[redoStack.length - 1];
    setRedoStack((previous) => previous.slice(0, -1));
    setUndoStack((previous) => [...previous.slice(-(MAX_HISTORY_STEPS - 1)), clonePayload(workingPayload)]);
    setWorkingPayload(clonePayload(nextPayload));
    setConflictPopup(null);
    setIsDirty(true);
    setError(null);
    setSuccess("Reapplied timetable change.");
    safeVibrate(18);
  }, [redoStack, workingPayload]);

  const handleMoveSlot = useCallback(async (
    params: {
      slotId: string;
      targetDay: string;
      targetStartTime: string;
      targetEndTime: string;
      dropClientX?: number;
      dropClientY?: number;
    },
  ) => {
    if (!workingPayload || isApplyingMove) {
      return;
    }

    const sourceSlot = workingPayload.timetableData.find((slot) => slot.id === params.slotId);
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

    if (isLunchReservedWindow(params.targetStartTime, params.targetEndTime)) {
      setError("1:15 PM to 2:05 PM is always reserved as lunch break. Drop the class in another teaching slot.");
      safeVibrate([30, 20, 30]);
      return;
    }

    setIsApplyingMove(true);
    setError(null);
    setSuccess(null);
    setConflictPopup(null);

    try {
      const candidatePayload = clonePayload(workingPayload);
      const candidateSlot = candidatePayload.timetableData.find((slot) => slot.id === params.slotId);
      if (!candidateSlot) {
        throw new Error("Selected class slot is no longer available.");
      }

      candidateSlot.day = params.targetDay;
      candidateSlot.startTime = params.targetStartTime;
      candidateSlot.endTime = params.targetEndTime;
      candidateSlot.roomId = sourceSlot.roomId;
      candidateSlot.facultyId = sourceSlot.facultyId;
      candidateSlot.section = sourceSlot.section;

      const report = await analyzeTimetableConflicts(candidatePayload);
      const impacted = report.conflicts.filter(
        (item) => !item.resolved && item.affected_slots.includes(params.slotId),
      );

      if (!impacted.length) {
        applyPayload(candidatePayload, "Class moved successfully.");
        safeVibrate(16);
        return;
      }

      const roomOnly = impacted.every((item) => ROOM_ONLY_CONFLICT_TYPES.has(item.conflict_type));
      const alternatives = findAlternativeTimeSlots(candidatePayload, params.slotId, dailySlots);
      const alternativeText = alternatives.length
        ? ` Suggested free slots: ${alternatives.map((item) => `${item.day} ${item.startTime}-${item.endTime}`).join(" | ")}.`
        : "";
      const availableRooms = roomOnly ? findAvailableRoomsForSlot(candidatePayload, params.slotId) : [];
      const slotConflictTypes = [...new Set(impacted.map((item) => item.conflict_type))];

      const fallbackX = typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.6) : 420;
      const fallbackY = typeof window !== "undefined" ? Math.floor(window.innerHeight * 0.4) : 240;

      setConflictPopup({
        payload: candidatePayload,
        slotId: params.slotId,
        conflictTypeLabels: slotConflictTypes,
        availableRooms,
        selectedRoomId: availableRooms[0]?.id ?? "",
        anchorX: params.dropClientX ?? fallbackX,
        anchorY: params.dropClientY ?? fallbackY,
        message: roomOnly
          ? (
              availableRooms.length
                ? "Room-related conflict detected. Select a free room below to keep this class at the same time."
                : `Room-related conflict detected, but no free room is currently available.${alternativeText}`
            )
          : `Move blocked by scheduling conflicts (faculty/section overlap or restricted constraints).${alternativeText}`,
      });
    } catch (err) {
      setError(toUiError(err));
      safeVibrate([30, 20, 30]);
    } finally {
      setIsApplyingMove(false);
    }
  }, [applyPayload, dailySlots, isApplyingMove, workingPayload]);

  const handleDownload = () => {
    if (!workingPayload) {
      setError("No timetable is loaded for download.");
      return;
    }
    if (!filteredSlots.length) {
      setError("No slots available in current view to download.");
      return;
    }

    const scopeLabel = viewScopeLabel;
    const filename = `schedule-${sanitizeFileName(scopeLabel)}.${exportFormat}`;
    const semesterLabel = selectedSemester === "all" ? "All Semesters" : `Semester ${selectedSemester}`;
    const payload = {
      filename,
      title: "TIMETABLE",
      subtitle: `Generated from ShedForge Schedule Workspace • ${new Date().toLocaleString()}`,
      viewLabel: "Filtered View",
      scopeLabel,
      semesterLabel,
      sourceLabel: isDirty ? "Draft edits" : "Official timetable",
      departmentLabel: activeProgram?.department ?? "N/A",
      programLabel: activeProgram?.name ?? "N/A",
      slots: filteredSlots,
      courses: workingPayload.courseData,
      rooms: workingPayload.roomData,
      faculty: workingPayload.facultyData,
    };

    if (exportFormat === "pdf") {
      downloadTimetablePdf(payload);
    } else {
      void downloadTimetableXlsx(payload);
    }
    setError(null);
    setSuccess(`Downloaded ${scopeLabel} timetable as ${exportFormat.toUpperCase()}.`);
  };

  const handlePublishAndDistribute = async (force = false) => {
    if (!publishPayload) {
      setError("No timetable available to publish.");
      return;
    }
    if (!publishSlots.length) {
      setError("No timetable slots in selected publish scope.");
      return;
    }

    setIsPublishing(true);
    setError(null);
    setSuccess(null);
    try {
      if (!force) {
        const report = await analyzeTimetableConflicts(publishPayload);
        const hardUnresolved = report.conflicts.filter((item) => !item.resolved && item.severity === "hard");
        if (hardUnresolved.length) {
          const topItems = hardUnresolved.slice(0, 3);
          const detail = topItems
            .map((item, index) => `${index + 1}. ${item.description || conflictLabel(item.conflict_type)}`)
            .join("  ");
          throw new Error(
            `Cannot publish: ${hardUnresolved.length} unresolved hard conflict(s) remain. ${detail}`,
          );
        }
      }

      await publishOfficialTimetable(publishPayload, publishLabel.trim() || undefined, force);
      const distribution = await publishTimetableDistribution();
      if (!force) {
        const review = await reviewTimetableConflicts(publishPayload);
        setConflictReview(review);
      } else {
        setConflictReviewRefreshNonce((previous) => previous + 1);
      }
      await refreshOfficial();
      await loadChangeRequests();
      setUndoStack([]);
      setRedoStack([]);
      setIsDirty(false);
      const scopeLabel = publishScopeMode === "all" ? "all timetable slots" : publishScopeLabel;
      if (force) {
        setSuccess(
          `Published anyway for ${scopeLabel} (force mode) and distributed role-wise. Sent ${distribution.sent}, failed ${distribution.failed}, skipped ${distribution.skipped}.`,
        );
      } else {
        setSuccess(
          `Published ${scopeLabel} and distributed role-wise. Sent ${distribution.sent}, failed ${distribution.failed}, skipped ${distribution.skipped}.`,
        );
      }
    } catch (err) {
      const base = toUiError(err);
      try {
        const review = await reviewTimetableConflicts(publishPayload);
        setConflictReview(review);
        const pending = review.pendingConflicts.slice(0, 3);
        const mismatches = review.constraintMismatches.slice(0, 2);
        const pendingText = pending.length
          ? ` Pending: ${pending.map((item, index) => `${index + 1}. ${item.description || conflictLabel(item.conflict_type)}`).join("  ")}`
          : "";
        const mismatchText = mismatches.length
          ? ` Constraint mismatches: ${mismatches.join(" | ")}`
          : "";
        setError(`${base}${pendingText}${mismatchText}`);
      } catch {
        setError(base);
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const handleApplyConflictResolution = async () => {
    if (!conflictPopup) {
      return;
    }
    const nextPayload = clonePayload(conflictPopup.payload);
    const targetSlot = nextPayload.timetableData.find((slot) => slot.id === conflictPopup.slotId);
    if (!targetSlot) {
      setConflictPopup(null);
      setError("Unable to apply resolution: slot not found.");
      safeVibrate([30, 20, 30]);
      return;
    }

    if (conflictPopup.selectedRoomId) {
      targetSlot.roomId = conflictPopup.selectedRoomId;
    }

    setIsApplyingMove(true);
    try {
      const report = await analyzeTimetableConflicts(nextPayload);
      const unresolved = report.conflicts.filter((item) => !item.resolved && item.affected_slots.includes(conflictPopup.slotId));
      if (unresolved.length) {
        throw new Error("Selected resolution still causes conflicts. Try another room or move the class elsewhere.");
      }
      const resolvedRoomName = conflictPopup.availableRooms.find((room) => room.id === conflictPopup.selectedRoomId)?.name;
      applyPayload(
        nextPayload,
        resolvedRoomName
          ? `Class moved successfully using room ${resolvedRoomName}.`
          : "Class moved successfully after resolving the conflict.",
      );
      safeVibrate([10, 20, 10]);
    } catch (err) {
      setError(toUiError(err));
      safeVibrate([30, 20, 30]);
    } finally {
      setIsApplyingMove(false);
    }
  };

  const handleResolveAllConflicts = useCallback(async () => {
    if (!workingPayload) {
      setError("No schedule payload is loaded for conflict resolution.");
      return;
    }

    setIsResolveAllBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await resolveAllTimetableConflicts({
        payload: workingPayload,
        scope: "all",
        promoteOfficial: true,
        note: "Bulk auto-resolution from Schedule workspace.",
      });

      const nextPayload = clonePayload(result.resolvedPayload);
      setWorkingPayload(nextPayload);
      setConflictPopup(null);
      setUndoStack([]);
      setRedoStack([]);
      setIsDirty(false);
      setWorkspaceRefreshNonce((previous) => previous + 1);

      const latestReview = await reviewTimetableConflicts(nextPayload);
      setConflictReview(latestReview);
      setConflictReviewError(null);
      await refreshOfficial();
      await loadChangeRequests();

      const mismatchText = result.constraintMismatches.length
        ? ` Constraint mismatches: ${result.constraintMismatches.length}.`
        : "";
      const promotedText = result.promotedVersionLabel
        ? ` Promoted as ${result.promotedVersionLabel}.`
        : "";
      setSuccess(
        `Auto Resolve All completed. Resolved ${result.resolvedCount} conflict(s), remaining ${result.remainingConflicts.length}.${mismatchText}${promotedText}`,
      );
    } catch (err) {
      setError(toUiError(err));
    } finally {
      setIsResolveAllBusy(false);
    }
  }, [loadChangeRequests, refreshOfficial, workingPayload]);

  const handleDecideRequest = async (requestId: string, decision: "approve" | "reject") => {
    setRequestDecisionBusyId(requestId);
    setError(null);
    setSuccess(null);
    try {
      const result = await decideTimetableChangeRequest(requestId, decision);
      await loadChangeRequests();
      await refreshOfficial();
      setSuccess(result.message);
    } catch (err) {
      setError(toUiError(err));
    } finally {
      setRequestDecisionBusyId(null);
    }
  };

  if (isLoading || (!hasOfficial && isLoadingDraft)) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading schedule workspace...
        </CardContent>
      </Card>
    );
  }

  if (!workingPayload) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Schedule Workspace</CardTitle>
          <CardDescription>No official or generated draft timetable is currently available.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {officialError
              ?? "Run Generator first. Generated snapshots are auto-saved and become available here even before publish."}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setWorkspaceRefreshNonce((previous) => previous + 1);
              void refreshOfficial();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Reload
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {conflictPopup ? (
        <div
          className="fixed z-50 w-[min(92vw,360px)] rounded-xl border bg-background p-4 shadow-2xl"
          style={{ left: `${conflictPopup.anchorX + 10}px`, top: `${conflictPopup.anchorY + 10}px` }}
          role="dialog"
          aria-label="Conflict resolution popup"
        >
          <p className="text-sm font-semibold">Conflict detected</p>
          <p className="mt-1 text-xs text-muted-foreground">{conflictPopup.message}</p>
          {conflictPopup.conflictTypeLabels.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {conflictPopup.conflictTypeLabels.map((item) => (
                <Badge key={item} variant="secondary" className="text-[10px]">
                  {item}
                </Badge>
              ))}
            </div>
          ) : null}
          {conflictPopup.availableRooms.length ? (
            <div className="mt-3 space-y-2">
              <Label className="text-xs">Alternative Classroom</Label>
              <Select
                value={conflictPopup.selectedRoomId}
                onValueChange={(value) => {
                  setConflictPopup((current) => (current ? { ...current, selectedRoomId: value } : current));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {conflictPopup.availableRooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setConflictPopup(null);
                setSuccess("Change ignored. Slot reverted to previous position.");
              }}
            >
              Ignore & Revert
            </Button>
            <Button
              size="sm"
              disabled={!conflictPopup.availableRooms.length || !conflictPopup.selectedRoomId || isApplyingMove}
              onClick={() => void handleApplyConflictResolution()}
            >
              Apply
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Schedule Workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fast drag-and-drop timetable editing with conflict-aware validation, instant feedback, and role-wise publishing.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>View</CardTitle>
            <CardDescription>
              Use these filters only for viewing and downloading the timetable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2">
                <Label>Semester</Label>
                <Select value={selectedSemester} onValueChange={setSelectedSemester}>
                  <SelectTrigger>
                    <SelectValue placeholder="All semesters" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All semesters</SelectItem>
                    {semesterOptions.map((semester) => (
                      <SelectItem key={semester} value={String(semester)}>
                        Semester {semester}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section</Label>
                <Select value={selectedSection} onValueChange={setSelectedSection}>
                  <SelectTrigger>
                    <SelectValue placeholder="All sections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sections</SelectItem>
                    {sectionOptions.map((section) => (
                      <SelectItem key={section} value={section}>
                        Section {section}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Faculty</Label>
                <Select value={selectedFacultyId} onValueChange={setSelectedFacultyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All faculty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All faculty</SelectItem>
                    {facultyOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Classroom</Label>
                <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All classrooms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classrooms</SelectItem>
                    {roomOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Download Format</Label>
                <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as ExportFormat)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="xlsx">XLSX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="outline">{viewScopeLabel}</Badge>
              <Button variant="outline" onClick={handleDownload} disabled={!filteredSlots.length}>
                <Download className="mr-2 h-4 w-4" />
                Download View
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Publish</CardTitle>
            <CardDescription>
              Configure publish scope filters. You can publish the entire timetable or only the filtered scope.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div className="space-y-2">
                <Label>Publish Scope</Label>
                <Select value={publishScopeMode} onValueChange={(value) => setPublishScopeMode(value as "all" | "filtered")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All timetable slots</SelectItem>
                    <SelectItem value="filtered">Filtered slots only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Semester</Label>
                <Select value={publishSemester} onValueChange={setPublishSemester}>
                  <SelectTrigger>
                    <SelectValue placeholder="All semesters" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All semesters</SelectItem>
                    {semesterOptions.map((semester) => (
                      <SelectItem key={semester} value={String(semester)}>
                        Semester {semester}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section</Label>
                <Select value={publishSection} onValueChange={setPublishSection}>
                  <SelectTrigger>
                    <SelectValue placeholder="All sections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sections</SelectItem>
                    {sectionOptions.map((section) => (
                      <SelectItem key={section} value={section}>
                        Section {section}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Faculty</Label>
                <Select value={publishFacultyId} onValueChange={setPublishFacultyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All faculty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All faculty</SelectItem>
                    {facultyOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Classroom</Label>
                <Select value={publishRoomId} onValueChange={setPublishRoomId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All classrooms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classrooms</SelectItem>
                    {roomOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Publish Label</Label>
                <Input
                  value={publishLabel}
                  onChange={(event) => setPublishLabel(event.target.value)}
                  placeholder="Ex: Mid-Semester Revision • Odd Cycle"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">
                  Publish Target: {publishScopeMode === "all" ? "All Slots" : `${publishSlots.length} Filtered Slots`}
                </Badge>
                <Badge variant="outline">{publishScopeLabel}</Badge>
              </div>
              <Button onClick={() => void handlePublishAndDistribute()} disabled={isPublishing || !publishSlots.length}>
                {isPublishing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Publishing
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Publish & Distribute
                  </span>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => void handlePublishAndDistribute(true)}
                disabled={isPublishing || !publishSlots.length}
              >
                {isPublishing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Publishing
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Publish Anyway
                  </span>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Editing Controls</CardTitle>
            <CardDescription>
              Drag any class slot to a teaching cell. View filters are applied directly to the weekly grid.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleUndo} disabled={!undoStack.length}>
                <Undo2 className="mr-2 h-4 w-4" />
                Undo
              </Button>
              <Button variant="outline" size="sm" onClick={handleRedo} disabled={!redoStack.length}>
                <Redo2 className="mr-2 h-4 w-4" />
                Redo
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">Slots in view: {filteredSlots.length}</Badge>
              <Badge variant="outline">Undo: {undoStack.length}</Badge>
              <Badge variant="outline">Redo: {redoStack.length}</Badge>
              <Badge variant="outline">
                Working Mode: {isDirty ? "Draft edits" : hasOfficial ? "Official baseline" : "Generated draft baseline"}
              </Badge>
              {!hasOfficial && latestDraftLabel ? (
                <Badge variant="outline">Draft Source: {latestDraftLabel}</Badge>
              ) : null}
              <Badge variant="secondary">Lunch Locked: 1:15 PM - 2:05 PM</Badge>
              <Badge variant="outline">Program: {activeProgram?.name ?? "N/A"}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Weekly Timetable Grid</CardTitle>
            <CardDescription>
              Unified timetable view. Use Class, Teacher, or Room filters from the View section.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyTimetableGrid
              days={days}
              rows={rows}
              cellEntries={cellEntries}
              interactive
              onMoveSlot={(params) => void handleMoveSlot(params)}
              emptyMessage="No timetable rows available for this filtered view."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Conflicts & Resolution</CardTitle>
                <CardDescription>
                  Full conflict audit for the active schedule payload, including unresolved, auto-resolved, and manually resolved items.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConflictReviewRefreshNonce((previous) => previous + 1)}
                disabled={isReviewLoading || !workingPayload}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isReviewLoading ? "animate-spin" : ""}`} />
                Re-verify
              </Button>
              <Button
                size="sm"
                onClick={() => void handleResolveAllConflicts()}
                disabled={isResolveAllBusy || !workingPayload}
              >
                {isResolveAllBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Auto Resolve All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">
                Payload: {workingPayload ? `${workingPayload.timetableData.length} slots` : "Not loaded"}
              </Badge>
              {conflictReview ? <Badge variant="outline">Review Source: {conflictReview.source}</Badge> : null}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Unresolved conflicts</p>
                <p className="text-xl font-semibold">{pendingReviewConflicts.length}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Resolved conflicts</p>
                <p className="text-xl font-semibold">{resolvedReviewCount}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Auto-resolved</p>
                <p className="text-xl font-semibold">{autoResolvedReviewConflicts.length}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Manually resolved</p>
                <p className="text-xl font-semibold">{manualResolvedReviewConflicts.length}</p>
              </div>
            </div>

            {conflictReviewError ? (
              <p className="text-sm text-destructive">{conflictReviewError}</p>
            ) : null}

            {conflictReview?.constraintMismatches?.length ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800">Constraint mismatches detected</p>
                <ul className="mt-2 space-y-1 text-xs text-amber-900">
                  {conflictReview.constraintMismatches.slice(0, 8).map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-3">
                <p className="text-sm font-medium">Unresolved Conflicts</p>
                {!workingPayload ? (
                  <div className="rounded-md border p-4 text-sm text-muted-foreground">
                    No schedule payload loaded yet. Generate and save a timetable first, then re-verify conflicts.
                  </div>
                ) : isReviewLoading ? (
                  <div className="rounded-md border p-4 text-sm text-muted-foreground">Analyzing conflicts...</div>
                ) : pendingReviewConflicts.length ? (
                  pendingReviewConflicts.map((conflict, index) => (
                    <div key={`${conflict.id}-${index}`} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{conflictLabel(conflict.conflict_type)}</p>
                        <Badge variant={conflict.severity === "hard" ? "outline" : "secondary"}>
                          {conflict.severity === "hard" ? "Hard" : "Soft"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{conflict.description || "No description provided."}</p>
                      {conflict.affected_slots.length ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Affected slots: {conflict.affected_slots.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
                    No unresolved conflicts for the current schedule payload.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Resolved Conflicts</p>

                <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Automatic Resolver</p>
                  {!workingPayload ? (
                    <p className="text-xs text-muted-foreground">Load a timetable payload to see resolver history.</p>
                  ) : autoResolvedReviewConflicts.length ? (
                    <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                      {autoResolvedReviewConflicts.map((conflict, index) => (
                        <div key={`${conflict.id}-${index}`} className="rounded-md border bg-background p-2 text-xs">
                          <p className="font-medium">{conflictLabel(conflict.conflict_type)}</p>
                          <p className="mt-1 text-muted-foreground">{conflict.description || "No description provided."}</p>
                          <p className="mt-1 text-emerald-700">{conflictResolutionDetail(conflict)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No auto-resolved conflicts reported for this payload.</p>
                  )}
                </div>

                <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Manual Actions</p>
                  {!workingPayload ? (
                    <p className="text-xs text-muted-foreground">Load a timetable payload to see manual resolutions.</p>
                  ) : manualResolvedReviewConflicts.length ? (
                    <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                      {manualResolvedReviewConflicts.map((conflict, index) => (
                        <div key={`${conflict.id}-${index}`} className="rounded-md border bg-background p-2 text-xs">
                          <p className="font-medium">{conflictLabel(conflict.conflict_type)}</p>
                          <p className="mt-1 text-muted-foreground">{conflict.description || "No description provided."}</p>
                          <p className="mt-1 text-indigo-700">{conflictResolutionDetail(conflict)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No manually resolved conflicts recorded yet.</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Change Requests
            </CardTitle>
            <CardDescription>
              Student proposals go to faculty for approval. Faculty proposals go to class representative approval.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">Pending: {pendingRequests.length}</Badge>
              <Badge variant="outline">Total: {changeRequests.length}</Badge>
              <Button variant="outline" size="sm" onClick={() => void loadChangeRequests()} disabled={requestsLoading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${requestsLoading ? "animate-spin" : ""}`} />
                Refresh Requests
              </Button>
            </div>

            {pendingRequests.length ? (
              <div className="space-y-3">
                {pendingRequests.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Request {item.id.slice(0, 8)}</p>
                      <Badge variant="outline">Pending Approval</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {item.requestedByRole} requested slot <span className="font-mono">{item.slotId}</span> to
                      {" "}{item.proposal.day} {item.proposal.startTime}-{item.proposal.endTime}
                      {item.proposal.requestKind ? ` • ${item.proposal.requestKind.replaceAll("_", " ")}` : ""}
                      {item.proposal.roomId ? ` • room ${item.proposal.roomId}` : ""}
                      {item.proposal.facultyId ? ` • teacher ${item.proposal.facultyId}` : ""}
                      {item.proposal.section ? ` • section ${item.proposal.section}` : ""}.
                    </p>
                    {item.requestNote ? (
                      <p className="mt-1 text-xs text-muted-foreground">Note: {item.requestNote}</p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => void handleDecideRequest(item.id, "approve")}
                        disabled={requestDecisionBusyId === item.id}
                      >
                        {requestDecisionBusyId === item.id ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Applying
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            Approve & Apply
                          </span>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleDecideRequest(item.id, "reject")}
                        disabled={requestDecisionBusyId === item.id}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No pending change requests.</p>
            )}

            {recentRequests.length ? (
              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <p className="text-sm font-medium">Recent Requests</p>
                <div className="max-h-52 space-y-2 overflow-y-auto">
                  {recentRequests.map((item) => (
                    <div key={item.id} className="rounded-md border bg-background p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{item.id.slice(0, 8)}</p>
                        <Badge variant={item.status === "applied" ? "default" : "secondary"}>{item.status}</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {item.requestedByRole}
                        {" -> "}
                        {item.approverRole ?? "approver"}
                        {" • "}
                        {item.proposal.day} {item.proposal.startTime}-{item.proposal.endTime}
                        {item.proposal.requestKind ? ` • ${item.proposal.requestKind.replaceAll("_", " ")}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
