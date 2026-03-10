"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Play,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  listPrograms,
  listProgramTerms,
  type Program,
  type ProgramTerm,
} from "@/lib/academic-api";
import {
  getGenerationJobStatus,
  startLiveTimetableCycleGeneration,
  startLiveTimetableGeneration,
  type GenerateTimetableCycleResponse,
  type GenerateTimetableResponse,
  type GenerationCycle,
  type GenerationJobEvent,
  type GenerationJobEventLevel,
  type GenerationJobStatusResponse,
} from "@/lib/generator-api";
import {
  buildCycleGeneratedResultsSnapshot,
  buildSingleGeneratedResultsSnapshot,
  saveGeneratedResults,
} from "@/lib/generated-results-store";
import { saveGeneratedDraft } from "@/lib/generated-draft-store";
import {
  analyzeTimetableConflicts,
  publishOfficialTimetable,
  resolveConflict,
} from "@/lib/timetable-api";
import { parseTimeToMinutes, sortTimes } from "@/lib/schedule-template";
import type { Conflict, OfficialTimetablePayload, ResolutionAction } from "@/lib/timetable-types";

const TERM_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TERMINAL_MAX_LINES = 350;
const DEFAULT_ALTERNATIVE_COUNT = 1;
const LIVE_JOB_MAX_DURATION_MS = Number(
  process.env.NEXT_PUBLIC_GENERATION_MAX_DURATION_MS ?? String(10 * 60 * 60 * 1000),
);
const LIVE_JOB_STALE_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_GENERATION_STALE_TIMEOUT_MS ?? "0",
);
const LIVE_JOB_MAX_CONSECUTIVE_POLL_ERRORS = 8;

type GeneratorMode = "single" | "odd" | "even";
type TerminalLevel = "info" | "success" | "warn" | "error";
type TimetableSlot = OfficialTimetablePayload["timetableData"][number];

type ConflictSuggestion = {
  id: string;
  label: string;
  detail: string;
  action: ResolutionAction;
};

type ManualResolvedConflict = {
  id: string;
  title: string;
  detail: string;
  at: string;
};

interface TerminalLine {
  id: number;
  level: TerminalLevel;
  at: string;
  message: string;
}

function toUiErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "Cannot reach backend API. Start backend and verify NEXT_PUBLIC_API_BASE_URL.";
    }
    return error.message;
  }
  return "Unexpected error while processing request.";
}

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.trunc(seconds));
  const hh = Math.floor(safe / 3600);
  const mm = Math.floor((safe % 3600) / 60);
  const ss = safe % 60;
  if (hh > 0) {
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function formatTerminalTimestamp(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function terminalLineTone(level: TerminalLevel): string {
  if (level === "success") {
    return "text-emerald-300";
  }
  if (level === "warn") {
    return "text-amber-300";
  }
  if (level === "error") {
    return "text-rose-300";
  }
  return "text-slate-200";
}

function touchSessionActivity(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem("lastActivity", String(Date.now()));
}

function stageLabel(rawStage: string | null | undefined): string {
  const normalized = (rawStage ?? "running").replace(/[._]+/g, " ").trim();
  if (!normalized) {
    return "Running";
  }
  return normalized[0].toUpperCase() + normalized.slice(1);
}

function normalizeLogMessage(message: string): string {
  return message
    .replace(/\bMOEA\b/gi, "optimizer")
    .replace(/genetic algorithm/gi, "parameter search")
    .replace(/simulated annealing/gi, "local refinement")
    .replace(/\bfitness\b/gi, "schedule quality");
}

function parseBackendDate(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metricSummary(metrics: Record<string, unknown>): string | null {
  const parts: string[] = [];
  const runtimeMs = metrics.runtime_ms;
  if (typeof runtimeMs === "number" && Number.isFinite(runtimeMs)) {
    parts.push(`Runtime ${Math.round(runtimeMs / 1000)}s`);
  }
  const term = metrics.term_number;
  if (typeof term === "number" && Number.isFinite(term)) {
    parts.push(`Semester ${term}`);
  }
  const bestHard = metrics.best_hard_conflicts;
  if (typeof bestHard === "number" && Number.isFinite(bestHard)) {
    parts.push(`Hard conflicts ${bestHard}`);
  }
  const alternatives = metrics.alternatives;
  if (typeof alternatives === "number" && Number.isFinite(alternatives)) {
    parts.push(`Alternatives ${alternatives}`);
  }
  const termination = metrics.termination_reason;
  if (typeof termination === "string" && termination.trim()) {
    parts.push(`Stop: ${termination.replace(/_/g, " ")}`);
  }
  return parts.length ? parts.join(" • ") : null;
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

function slotsOverlap(left: TimetableSlot, right: TimetableSlot): boolean {
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

function slotFacultyIds(slot: TimetableSlot): string[] {
  const ids = [slot.facultyId, ...(slot.assistantFacultyIds ?? [])]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

function conflictTitle(conflictType: string): string {
  const normalized = conflictType.trim().toLowerCase();
  switch (normalized) {
    case "faculty_conflict":
    case "faculty-overlap":
      return "Faculty overlap";
    case "section_conflict":
    case "section-overlap":
      return "Section overlap";
    case "room_conflict":
    case "room-overlap":
      return "Room overlap";
    case "room_capacity":
    case "capacity":
      return "Room capacity mismatch";
    case "room_type":
      return "Room type mismatch";
    case "faculty_availability":
    case "availability":
      return "Faculty availability mismatch";
    case "course_slot_coverage":
      return "Course hour mismatch";
    case "practical_contiguous":
      return "Practical block continuity";
    case "course-faculty-inconsistency":
      return "Course faculty mismatch";
    default:
      return normalized.replace(/[_-]+/g, " ");
  }
}

function conflictDescription(conflict: Conflict): string {
  const cleaned = (conflict.description ?? "")
    .replace(/\bMOEA\b/gi, "optimizer")
    .replace(/genetic algorithm/gi, "optimization")
    .replace(/simulated annealing/gi, "refinement")
    .replace(/\bfitness\b/gi, "schedule quality")
    .trim();

  if (cleaned) {
    return cleaned;
  }

  switch (conflict.conflict_type) {
    case "faculty_conflict":
    case "faculty-overlap":
      return "A faculty member has two classes scheduled at the same time.";
    case "room_conflict":
    case "room-overlap":
      return "A room is assigned to more than one class in the same time block.";
    case "section_conflict":
    case "section-overlap":
      return "A section has overlapping class assignments.";
    case "room_capacity":
    case "capacity":
      return "Assigned room capacity is lower than the student count for this class.";
    case "faculty_availability":
    case "availability":
      return "A class is outside the faculty member's availability window.";
    case "room_type":
      return "Assigned room type does not match the course requirement.";
    case "course_slot_coverage":
      return "Scheduled weekly slots do not match configured LTP requirements.";
    case "practical_contiguous":
      return "Practical periods for this course are fragmented and must be contiguous.";
    default:
      return "This schedule item violates one or more active constraints.";
  }
}

function findTargetSlot(conflict: Conflict, payload: OfficialTimetablePayload): TimetableSlot | null {
  const firstId = conflict.affected_slots?.[0];
  if (!firstId) {
    return null;
  }
  return payload.timetableData.find((slot) => slot.id === firstId) ?? null;
}

function sortedUniqueWindows(payload: OfficialTimetablePayload): Array<{ startTime: string; endTime: string; startMin: number }> {
  const unique = new Map<string, { startTime: string; endTime: string; startMin: number }>();
  for (const slot of payload.timetableData) {
    const startMin = parseTimeToMinutes(slot.startTime);
    if (!Number.isFinite(startMin)) {
      continue;
    }
    const key = `${slot.startTime}|${slot.endTime}`;
    if (!unique.has(key)) {
      unique.set(key, { startTime: slot.startTime, endTime: slot.endTime, startMin });
    }
  }
  return [...unique.values()].sort((left, right) => left.startMin - right.startMin);
}

function buildConflictSuggestions(conflict: Conflict, payload: OfficialTimetablePayload): ConflictSuggestion[] {
  const targetSlot = findTargetSlot(conflict, payload);
  if (!targetSlot) {
    return [];
  }

  const type = conflict.conflict_type.toLowerCase();
  const allSlots = payload.timetableData;
  const overlapSlots = allSlots.filter((slot) => slot.id !== targetSlot.id && slotsOverlap(slot, targetSlot));
  const suggestions: ConflictSuggestion[] = [];

  const pushSuggestion = (suggestion: ConflictSuggestion) => {
    suggestions.push(suggestion);
  };

  const roomData = payload.roomData;
  const currentRoom = roomData.find((room) => room.id === targetSlot.roomId);
  const studentCount = targetSlot.studentCount ?? 0;

  const buildRoomCandidates = () => {
    const blockedRoomIds = new Set(overlapSlots.map((slot) => slot.roomId));
    let candidates = roomData.filter((room) => room.id !== targetSlot.roomId && !blockedRoomIds.has(room.id));

    if (type === "room_capacity" || type === "capacity") {
      candidates = candidates.filter((room) => room.capacity >= studentCount);
    }
    if (type === "room_type" && currentRoom?.type) {
      candidates = candidates.filter((room) => room.type === currentRoom.type);
    }

    for (const room of candidates.slice(0, 5)) {
      pushSuggestion({
        id: `${conflict.id}-room-${room.id}`,
        label: `Move to room ${room.name}`,
        detail: `Reassign this class to ${room.name}${room.capacity ? ` (capacity ${room.capacity})` : ""}.`,
        action: {
          action_type: "change_room",
          description: `Move class to room ${room.name}`,
          target_slot_id: targetSlot.id,
          parameters: { new_room_id: room.id },
        },
      });
    }
  };

  const buildFacultyCandidates = () => {
    const occupiedFaculty = new Set(overlapSlots.flatMap((slot) => slotFacultyIds(slot)));
    const currentFacultyIds = new Set(slotFacultyIds(targetSlot));
    const candidates = payload.facultyData
      .filter((faculty) => !currentFacultyIds.has(faculty.id) && !occupiedFaculty.has(faculty.id))
      .slice(0, 5);

    for (const faculty of candidates) {
      pushSuggestion({
        id: `${conflict.id}-faculty-${faculty.id}`,
        label: `Assign ${faculty.name}`,
        detail: `Assign this slot to ${faculty.name} and avoid overlap in this time block.`,
        action: {
          action_type: "change_faculty",
          description: `Assign ${faculty.name}`,
          target_slot_id: targetSlot.id,
          parameters: { new_faculty_id: faculty.id },
        },
      });
    }
  };

  const buildMoveCandidates = () => {
    const windows = sortedUniqueWindows(payload);
    for (const day of DAY_ORDER) {
      for (const window of windows) {
        if (day === targetSlot.day && window.startTime === targetSlot.startTime && window.endTime === targetSlot.endTime) {
          continue;
        }

        const candidateSlot: TimetableSlot = {
          ...targetSlot,
          day,
          startTime: window.startTime,
          endTime: window.endTime,
        };

        const hasRoomConflict = allSlots.some(
          (slot) => slot.id !== targetSlot.id && slot.roomId === candidateSlot.roomId && slotsOverlap(slot, candidateSlot),
        );
        if (hasRoomConflict) {
          continue;
        }

        const hasSectionConflict = allSlots.some(
          (slot) => slot.id !== targetSlot.id && slot.section === candidateSlot.section && slotsOverlap(slot, candidateSlot),
        );
        if (hasSectionConflict) {
          continue;
        }

        const hasFacultyConflict = allSlots.some(
          (slot) => slot.id !== targetSlot.id && slotFacultyIds(slot).includes(candidateSlot.facultyId) && slotsOverlap(slot, candidateSlot),
        );
        if (hasFacultyConflict) {
          continue;
        }

        pushSuggestion({
          id: `${conflict.id}-move-${day}-${window.startTime}`,
          label: `Move to ${day} ${window.startTime}-${window.endTime}`,
          detail: `Relocate this class to ${day}, ${window.startTime} - ${window.endTime}.`,
          action: {
            action_type: "move_slot",
            description: `Move class to ${day} ${window.startTime}-${window.endTime}`,
            target_slot_id: targetSlot.id,
            parameters: {
              day,
              startTime: window.startTime,
              endTime: window.endTime,
              roomId: targetSlot.roomId,
            },
          },
        });

        if (suggestions.length >= 5) {
          return;
        }
      }
    }
  };

  if (type.includes("room") || type === "capacity") {
    buildRoomCandidates();
  }
  if (type.includes("faculty")) {
    buildFacultyCandidates();
  }
  if (type.includes("section") || type.includes("elective") || type.includes("coverage") || type.includes("practical")) {
    buildMoveCandidates();
  }

  if (!suggestions.length) {
    buildRoomCandidates();
  }
  if (!suggestions.length) {
    buildFacultyCandidates();
  }
  if (!suggestions.length) {
    buildMoveCandidates();
  }

  if (conflict.affected_slots.length >= 2) {
    const swapWithId = conflict.affected_slots[1];
    if (swapWithId) {
      suggestions.push({
        id: `${conflict.id}-swap-${swapWithId}`,
        label: "Swap with paired slot",
        detail: "Swap this slot with the paired conflicting slot to remove overlap.",
        action: {
          action_type: "swap_slot",
          description: "Swap conflicting slots",
          target_slot_id: targetSlot.id,
          parameters: { other_slot_id: swapWithId },
        },
      });
    }
  }

  const unique = new Map<string, ConflictSuggestion>();
  for (const suggestion of suggestions) {
    const key = `${suggestion.action.action_type}:${suggestion.action.target_slot_id}:${JSON.stringify(suggestion.action.parameters)}`;
    if (!unique.has(key)) {
      unique.set(key, suggestion);
    }
  }

  return [...unique.values()].slice(0, 5);
}

function suggestionMaps(conflicts: Conflict[], payload: OfficialTimetablePayload): {
  suggestionsById: Record<string, ConflictSuggestion[]>;
  selectedById: Record<string, string>;
} {
  const suggestionsById: Record<string, ConflictSuggestion[]> = {};
  const selectedById: Record<string, string> = {};

  for (const conflict of conflicts) {
    const suggestions = buildConflictSuggestions(conflict, payload);
    suggestionsById[conflict.id] = suggestions;
    if (suggestions.length) {
      selectedById[conflict.id] = suggestions[0].id;
    }
  }

  return { suggestionsById, selectedById };
}

function pickSeverityVariant(severity: Conflict["severity"]): "default" | "outline" | "secondary" {
  if (severity === "hard") {
    return "outline";
  }
  return "secondary";
}

function sessionLabel(slot: TimetableSlot): string {
  if (slot.sessionType === "tutorial") {
    return "(T)";
  }
  if (slot.sessionType === "lab") {
    return "(P)";
  }
  return "";
}

function WeeklyTimetableGrid({ payload }: { payload: OfficialTimetablePayload | null }) {
  const days = useMemo(() => {
    if (!payload) {
      return DAY_ORDER.slice(0, 5);
    }
    const found = new Set(payload.timetableData.map((slot) => slot.day));
    return DAY_ORDER.filter((day) => found.has(day));
  }, [payload]);

  const times = useMemo(() => {
    if (!payload) {
      return [] as string[];
    }
    return sortTimes([...new Set(payload.timetableData.map((slot) => slot.startTime))]);
  }, [payload]);

  const slotsByCell = useMemo(() => {
    const map = new Map<string, TimetableSlot[]>();
    if (!payload) {
      return map;
    }
    for (const slot of payload.timetableData) {
      const key = `${slot.day}|${slot.startTime}`;
      const existing = map.get(key) ?? [];
      existing.push(slot);
      map.set(key, existing);
    }
    return map;
  }, [payload]);

  const courseById = useMemo(() => {
    const map = new Map<string, OfficialTimetablePayload["courseData"][number]>();
    if (!payload) {
      return map;
    }
    for (const course of payload.courseData) {
      map.set(course.id, course);
    }
    return map;
  }, [payload]);

  const roomById = useMemo(() => {
    const map = new Map<string, OfficialTimetablePayload["roomData"][number]>();
    if (!payload) {
      return map;
    }
    for (const room of payload.roomData) {
      map.set(room.id, room);
    }
    return map;
  }, [payload]);

  if (!payload) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No generated timetable yet. Run the generator to preview the weekly grid.
      </div>
    );
  }

  if (!days.length || !times.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Timetable payload is empty for this selection.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="min-w-[980px]">
        <div className="grid gap-1 p-2" style={{ gridTemplateColumns: `90px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="p-2" />
          {days.map((day) => (
            <div key={day} className="rounded-md bg-muted p-2 text-center text-xs font-semibold">
              {day}
            </div>
          ))}

          {times.map((time) => (
            <div key={`row-${time}`} className="contents">
              <div className="p-2 text-right text-xs text-muted-foreground">{time}</div>
              {days.map((day) => {
                const entries = slotsByCell.get(`${day}|${time}`) ?? [];
                if (!entries.length) {
                  return <div key={`${day}-${time}`} className="min-h-[76px] rounded-md border border-transparent bg-muted/10" />;
                }

                return (
                  <div key={`${day}-${time}`} className="min-h-[76px] space-y-1 rounded-md border bg-background p-2 text-xs">
                    {entries.slice(0, 2).map((slot) => {
                      const course = courseById.get(slot.courseId);
                      const room = roomById.get(slot.roomId);
                      return (
                        <div key={slot.id} className="rounded-sm border bg-muted/20 p-1.5">
                          <p className="truncate font-semibold">
                            {course?.code ?? slot.courseId} {sessionLabel(slot)}
                          </p>
                          <p className="truncate text-muted-foreground">{slot.section}{slot.batch ? ` • ${slot.batch}` : ""}</p>
                          <p className="truncate text-muted-foreground">{room?.name ?? slot.roomId}</p>
                        </div>
                      );
                    })}
                    {entries.length > 2 ? <p className="text-[11px] text-muted-foreground">+{entries.length - 2} more</p> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function GeneratorPage() {
  const { user } = useAuth();
  const canGenerate = user?.role === "admin" || user?.role === "scheduler";

  const [programs, setPrograms] = useState<Program[]>([]);
  const [programTerms, setProgramTerms] = useState<ProgramTerm[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [mode, setMode] = useState<GeneratorMode>("single");
  const [selectedTerm, setSelectedTerm] = useState("1");
  const [runName, setRunName] = useState("");
  const [publishOnSuccess, setPublishOnSuccess] = useState(false);

  const [singleResult, setSingleResult] = useState<GenerateTimetableResponse | null>(null);
  const [cycleResult, setCycleResult] = useState<GenerateTimetableCycleResponse | null>(null);
  const [cyclePreviewTerm, setCyclePreviewTerm] = useState("");
  const [activeAlternativeRank, setActiveAlternativeRank] = useState("");

  const [isLoadingPrograms, setIsLoadingPrograms] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [liveStage, setLiveStage] = useState<string | null>(null);
  const [liveProgressPercent, setLiveProgressPercent] = useState<number | null>(null);
  const [livePreview, setLivePreview] = useState<GenerateTimetableResponse | null>(null);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState(0);
  const [previewSemesterFilter, setPreviewSemesterFilter] = useState("all");
  const [previewSectionFilter, setPreviewSectionFilter] = useState("all");

  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const terminalCounterRef = useRef(0);
  const terminalTailRef = useRef<HTMLDivElement | null>(null);

  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [suggestionsByConflict, setSuggestionsByConflict] = useState<Record<string, ConflictSuggestion[]>>({});
  const [selectedSuggestionByConflict, setSelectedSuggestionByConflict] = useState<Record<string, string>>({});
  const [applyBusyConflictId, setApplyBusyConflictId] = useState<string | null>(null);
  const [manualResolvedConflicts, setManualResolvedConflicts] = useState<ManualResolvedConflict[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const appendTerminalLine = useCallback((level: TerminalLevel, message: string) => {
    setTerminalLines((previous) => {
      const next = [
        ...previous,
        {
          id: terminalCounterRef.current + 1,
          at: formatTerminalTimestamp(),
          level,
          message,
        },
      ];
      terminalCounterRef.current += 1;
      return next.length > TERMINAL_MAX_LINES ? next.slice(next.length - TERMINAL_MAX_LINES) : next;
    });
  }, []);

  const clearTerminal = useCallback(() => {
    setTerminalLines([]);
    terminalCounterRef.current = 0;
  }, []);

  useEffect(() => {
    terminalTailRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [terminalLines]);

  useEffect(() => {
    let isActive = true;
    setIsLoadingPrograms(true);

    listPrograms()
      .then((loadedPrograms) => {
        if (!isActive) {
          return;
        }
        setPrograms(loadedPrograms);
        setSelectedProgramId((previous) => previous || loadedPrograms[0]?.id || "");
      })
      .catch((err: unknown) => {
        if (!isActive) {
          return;
        }
        setError(toUiErrorMessage(err));
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingPrograms(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedProgramId) {
      setProgramTerms([]);
      return;
    }
    let isActive = true;
    listProgramTerms(selectedProgramId)
      .then((terms) => {
        if (!isActive) {
          return;
        }
        setProgramTerms(terms);
      })
      .catch((err: unknown) => {
        if (!isActive) {
          return;
        }
        setError(toUiErrorMessage(err));
      });

    return () => {
      isActive = false;
    };
  }, [selectedProgramId]);

  useEffect(() => {
    if (!isGenerating || generationStartedAt === null) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setGenerationElapsedSeconds(Math.floor((Date.now() - generationStartedAt) / 1000));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [generationStartedAt, isGenerating]);

  useEffect(() => {
    if (!isGenerating || generationStartedAt === null) {
      return;
    }

    const heartbeatId = window.setInterval(() => {
      touchSessionActivity();
      const elapsedSeconds = Math.floor((Date.now() - generationStartedAt) / 1000);
      appendTerminalLine("info", `Generation in progress... elapsed ${formatElapsed(elapsedSeconds)}.`);
    }, 20000);

    return () => {
      window.clearInterval(heartbeatId);
    };
  }, [appendTerminalLine, generationStartedAt, isGenerating]);

  const activeCycleTermResult = useMemo(() => {
    if (mode === "single" || !cycleResult?.results.length) {
      return null;
    }
    const parsed = Number(cyclePreviewTerm);
    const fallback = cycleResult.results[0];
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return cycleResult.results.find((item) => item.term_number === parsed) ?? fallback;
  }, [cyclePreviewTerm, cycleResult?.results, mode]);

  const activeGenerationResponse = useMemo(() => {
    if (mode === "single") {
      return singleResult;
    }
    return activeCycleTermResult?.generation ?? null;
  }, [activeCycleTermResult?.generation, mode, singleResult]);

  useEffect(() => {
    if (!activeGenerationResponse?.alternatives.length) {
      setActiveAlternativeRank("");
      return;
    }
    if (
      activeAlternativeRank &&
      activeGenerationResponse.alternatives.some((alternative) => String(alternative.rank) === activeAlternativeRank)
    ) {
      return;
    }
    setActiveAlternativeRank(String(activeGenerationResponse.alternatives[0].rank));
  }, [activeAlternativeRank, activeGenerationResponse]);

  useEffect(() => {
    if (mode === "single") {
      setCyclePreviewTerm("");
      return;
    }
    if (!cycleResult?.results.length) {
      setCyclePreviewTerm("");
      return;
    }
    if (cyclePreviewTerm && cycleResult.results.some((item) => String(item.term_number) === cyclePreviewTerm)) {
      return;
    }
    setCyclePreviewTerm(String(cycleResult.results[0].term_number));
  }, [cyclePreviewTerm, cycleResult?.results, mode]);

  const activeAlternative = useMemo(() => {
    if (!activeGenerationResponse?.alternatives.length) {
      return null;
    }
    const rank = Number(activeAlternativeRank);
    if (!Number.isFinite(rank)) {
      return activeGenerationResponse.alternatives[0];
    }
    return (
      activeGenerationResponse.alternatives.find((alternative) => alternative.rank === rank) ??
      activeGenerationResponse.alternatives[0]
    );
  }, [activeAlternativeRank, activeGenerationResponse]);

  const activePayload = useMemo(() => activeAlternative?.payload ?? null, [activeAlternative]);

  const displayPayload = useMemo(() => {
    if (activePayload) {
      return activePayload;
    }
    return livePreview?.alternatives?.[0]?.payload ?? null;
  }, [activePayload, livePreview]);

  const previewSemesterByCourseId = useMemo(() => {
    const map = new Map<string, number>();
    if (!displayPayload) {
      return map;
    }
    for (const course of displayPayload.courseData) {
      if (typeof course.semesterNumber === "number" && Number.isFinite(course.semesterNumber)) {
        map.set(course.id, course.semesterNumber);
      }
    }
    return map;
  }, [displayPayload]);

  const previewSemesterOptions = useMemo(() => {
    if (!displayPayload) {
      return [] as string[];
    }
    const values = new Set<number>();
    for (const course of displayPayload.courseData) {
      if (typeof course.semesterNumber === "number" && Number.isFinite(course.semesterNumber)) {
        values.add(course.semesterNumber);
      }
    }
    if (typeof displayPayload.termNumber === "number" && Number.isFinite(displayPayload.termNumber)) {
      values.add(displayPayload.termNumber);
    }
    return [...values].sort((left, right) => left - right).map((item) => String(item));
  }, [displayPayload]);

  const previewSectionOptions = useMemo(() => {
    if (!displayPayload) {
      return [] as string[];
    }
    const sections = new Set<string>();
    for (const slot of displayPayload.timetableData) {
      const label = slot.section.trim();
      if (label) {
        sections.add(label);
      }
    }
    return [...sections].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  }, [displayPayload]);

  useEffect(() => {
    if (previewSemesterFilter !== "all" && !previewSemesterOptions.includes(previewSemesterFilter)) {
      setPreviewSemesterFilter("all");
    }
  }, [previewSemesterFilter, previewSemesterOptions]);

  useEffect(() => {
    if (previewSectionFilter !== "all" && !previewSectionOptions.includes(previewSectionFilter)) {
      setPreviewSectionFilter("all");
    }
  }, [previewSectionFilter, previewSectionOptions]);

  const filteredDisplayPayload = useMemo(() => {
    if (!displayPayload) {
      return null;
    }
    if (previewSemesterFilter === "all" && previewSectionFilter === "all") {
      return displayPayload;
    }

    const selectedSemester =
      previewSemesterFilter === "all" ? null : Number(previewSemesterFilter);

    const filteredSlots = displayPayload.timetableData.filter((slot) => {
      if (previewSectionFilter !== "all" && slot.section.trim() !== previewSectionFilter) {
        return false;
      }
      if (selectedSemester !== null) {
        const slotSemester = previewSemesterByCourseId.get(slot.courseId) ?? displayPayload.termNumber ?? null;
        if (slotSemester !== selectedSemester) {
          return false;
        }
      }
      return true;
    });

    const usedCourseIds = new Set(filteredSlots.map((slot) => slot.courseId));
    const usedRoomIds = new Set(filteredSlots.map((slot) => slot.roomId));
    const usedFacultyIds = new Set(filteredSlots.flatMap((slot) => slotFacultyIds(slot)));

    return {
      ...displayPayload,
      timetableData: filteredSlots,
      courseData: displayPayload.courseData.filter((course) => usedCourseIds.has(course.id)),
      roomData: displayPayload.roomData.filter((room) => usedRoomIds.has(room.id)),
      facultyData: displayPayload.facultyData.filter((faculty) => usedFacultyIds.has(faculty.id)),
    };
  }, [
    displayPayload,
    previewSectionFilter,
    previewSemesterByCourseId,
    previewSemesterFilter,
  ]);

  const autoResolvedConflicts = useMemo(() => {
    if (mode === "single") {
      return singleResult?.auto_resolved_conflicts ?? [];
    }
    return activeCycleTermResult?.generation.auto_resolved_conflicts ?? [];
  }, [activeCycleTermResult?.generation.auto_resolved_conflicts, mode, singleResult?.auto_resolved_conflicts]);

  const persistDraftSnapshot = useCallback(
    (payload: OfficialTimetablePayload, hardConflicts: number, fitness?: number, softPenalty?: number) => {
      const cleanName = runName.trim();
      if (!cleanName) {
        return;
      }

      const label = `${cleanName} • ${new Date().toISOString().replace("T", " ").slice(0, 19)}`;
      const termNumber = mode === "single"
        ? Number(selectedTerm)
        : (activeCycleTermResult?.term_number ?? payload.termNumber ?? undefined);

      saveGeneratedDraft({
        version: 1,
        mode: mode === "single" ? "single" : (mode as GenerationCycle),
        source: "generator",
        generated_at: new Date().toISOString(),
        program_id: selectedProgramId || payload.programId,
        term_number: termNumber,
        label,
        hard_conflicts: hardConflicts,
        soft_penalty: softPenalty ?? null,
        fitness: fitness ?? null,
        payload,
      });

      appendTerminalLine("success", `Saved generated timetable snapshot as ${label}.`);
    },
    [activeCycleTermResult?.term_number, appendTerminalLine, mode, runName, selectedProgramId, selectedTerm],
  );

  const refreshConflicts = useCallback(async (payload: OfficialTimetablePayload | null) => {
    if (!payload) {
      setConflicts([]);
      setSuggestionsByConflict({});
      setSelectedSuggestionByConflict({});
      setConflictError(null);
      return;
    }

    setConflictLoading(true);
    setConflictError(null);

    try {
      const report = await analyzeTimetableConflicts(payload);
      const unresolved = report.conflicts.filter((conflict) => !conflict.resolved);
      const { suggestionsById, selectedById } = suggestionMaps(unresolved, payload);

      setConflicts(unresolved);
      setSuggestionsByConflict(suggestionsById);
      setSelectedSuggestionByConflict(selectedById);
    } catch (err) {
      setConflictError(toUiErrorMessage(err));
    } finally {
      setConflictLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshConflicts(activePayload);
  }, [activePayload, refreshConflicts]);

  const applyUpdatedPayload = useCallback(
    (updatedPayload: OfficialTimetablePayload) => {
      const activeRank = Number(activeAlternativeRank);
      if (!Number.isFinite(activeRank) || !activeGenerationResponse) {
        return;
      }

      if (mode === "single") {
        setSingleResult((previous) => {
          if (!previous) {
            return previous;
          }
          return {
            ...previous,
            alternatives: previous.alternatives.map((alternative) => {
              if (alternative.rank !== activeRank) {
                return alternative;
              }
              return {
                ...alternative,
                payload: updatedPayload,
              };
            }),
          };
        });
        return;
      }

      const targetTerm = activeCycleTermResult?.term_number;
      if (!targetTerm) {
        return;
      }

      setCycleResult((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          results: previous.results.map((entry) => {
            if (entry.term_number !== targetTerm) {
              return entry;
            }
            return {
              ...entry,
              generation: {
                ...entry.generation,
                alternatives: entry.generation.alternatives.map((alternative) => {
                  if (alternative.rank !== activeRank) {
                    return alternative;
                  }
                  return {
                    ...alternative,
                    payload: updatedPayload,
                  };
                }),
              },
            };
          }),
        };
      });
    },
    [activeAlternativeRank, activeCycleTermResult?.term_number, activeGenerationResponse, mode],
  );

  const handleApplyConflictSuggestion = async (conflictId: string) => {
    if (!activePayload) {
      setError("No active timetable payload available for conflict resolution.");
      return;
    }

    const conflict = conflicts.find((item) => item.id === conflictId);
    if (!conflict) {
      return;
    }

    const selectedSuggestionId = selectedSuggestionByConflict[conflictId];
    const selectedSuggestion = (suggestionsByConflict[conflictId] ?? []).find(
      (item) => item.id === selectedSuggestionId,
    );

    if (!selectedSuggestion) {
      setError("Select a recommendation before applying.");
      return;
    }

    setApplyBusyConflictId(conflictId);
    setError(null);
    setSuccess(null);

    try {
      const updatedPayload = await resolveConflict(activePayload, selectedSuggestion.action);
      applyUpdatedPayload(updatedPayload);
      await refreshConflicts(updatedPayload);

      setManualResolvedConflicts((previous) => [
        {
          id: `${conflictId}-${Date.now()}`,
          title: conflictTitle(conflict.conflict_type),
          detail: selectedSuggestion.detail,
          at: formatTerminalTimestamp(),
        },
        ...previous,
      ].slice(0, 30));

      appendTerminalLine(
        "success",
        `Resolved ${conflictTitle(conflict.conflict_type)} using: ${selectedSuggestion.label}.`,
      );

      persistDraftSnapshot(
        updatedPayload,
        Math.max(0, conflicts.length - 1),
        activeAlternative?.fitness,
        activeAlternative?.soft_penalty,
      );

      setSuccess("Conflict recommendation applied and timetable updated.");
    } catch (err) {
      const message = toUiErrorMessage(err);
      appendTerminalLine("error", `Could not apply recommendation: ${message}`);
      setError(message);
    } finally {
      setApplyBusyConflictId(null);
    }
  };

  const handleGenerate = async () => {
    if (!selectedProgramId) {
      setError("Program is required.");
      return;
    }

    if (!runName.trim()) {
      setError("Name is required before running generation.");
      return;
    }

    if (mode === "single" && !selectedTerm) {
      setError("Semester is required for Single Cycle mode.");
      return;
    }

    const runDisplay = mode === "single" ? `Single Cycle - Semester ${selectedTerm}` : `${mode.toUpperCase()} Cycle`;

    clearTerminal();
    setError(null);
    setSuccess(null);
    setConflicts([]);
    setConflictError(null);
    setManualResolvedConflicts([]);
    setSuggestionsByConflict({});
    setSelectedSuggestionByConflict({});

    setIsGenerating(true);
    setGenerationStartedAt(Date.now());
    setGenerationElapsedSeconds(0);
    setLiveStage("queued");
    setLiveProgressPercent(0);
    setLivePreview(null);

    appendTerminalLine("info", `Run requested: ${runDisplay}.`);
    appendTerminalLine("info", `Name: ${runName.trim()}`);
    appendTerminalLine("info", "Pipeline: GA tuning -> MOEA exploration -> SA exploitation -> automatic conflict resolver.");

    try {
      let jobId = "";
      if (mode === "single") {
        const accepted = await startLiveTimetableGeneration({
          program_id: selectedProgramId,
          term_number: Number(selectedTerm),
          alternative_count: DEFAULT_ALTERNATIVE_COUNT,
          persist_official: false,
        });
        jobId = accepted.job_id;
      } else {
        const accepted = await startLiveTimetableCycleGeneration({
          program_id: selectedProgramId,
          cycle: mode,
          alternative_count: DEFAULT_ALTERNATIVE_COUNT,
          pareto_limit: 8,
          persist_official: false,
        });
        jobId = accepted.job_id;
      }

      setActiveJobId(jobId);
      appendTerminalLine("info", `Live job accepted: ${jobId}.`);

      let finalSnapshot: GenerationJobStatusResponse | null = null;
      let lastEventId = 0;
      const pollingStartedAt = Date.now();
      let lastSnapshotActivityAt = Date.now();
      let consecutivePollErrors = 0;
      let staleWarningIssued = false;

      while (true) {
        let snapshot: GenerationJobStatusResponse;
        try {
          snapshot = await getGenerationJobStatus(jobId, { since_event_id: lastEventId });
          consecutivePollErrors = 0;
        } catch (pollError) {
          consecutivePollErrors += 1;
          const message = toUiErrorMessage(pollError);
          if (consecutivePollErrors >= LIVE_JOB_MAX_CONSECUTIVE_POLL_ERRORS) {
            throw new Error(
              `Live status polling stopped after repeated failures (${consecutivePollErrors}). Last error: ${message}`,
            );
          }
          appendTerminalLine(
            "warn",
            `Status poll issue (${consecutivePollErrors}/${LIVE_JOB_MAX_CONSECUTIVE_POLL_ERRORS}): ${message}. Retrying...`,
          );
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, Math.min(5000, 1200 * consecutivePollErrors));
          });
          continue;
        }
        touchSessionActivity();

        const snapshotTimestamp = parseBackendDate(snapshot.updated_at) ?? Date.now();
        lastSnapshotActivityAt = Math.max(lastSnapshotActivityAt, snapshotTimestamp);

        setLiveStage(snapshot.stage ?? snapshot.status);
        if (typeof snapshot.progress_percent === "number") {
          setLiveProgressPercent(snapshot.progress_percent);
        }
        if (snapshot.latest_generation) {
          setLivePreview(snapshot.latest_generation);
        }

        for (const event of snapshot.events) {
          const progressText = typeof event.progress_percent === "number" ? `${event.progress_percent.toFixed(1)}% • ` : "";
          appendTerminalLine(
            event.level as TerminalLevel,
            `${progressText}${stageLabel(event.stage)}: ${normalizeLogMessage(event.message)}`,
          );

          const summary = metricSummary(event.metrics ?? {});
          if (summary) {
            appendTerminalLine("info", summary);
          }
        }

        lastEventId = Math.max(lastEventId, snapshot.last_event_id ?? 0);

        if (snapshot.status === "succeeded") {
          finalSnapshot = snapshot;
          break;
        }
        if (snapshot.status === "failed") {
          throw new Error(snapshot.error_message || snapshot.message || "Generation failed.");
        }
        if (snapshot.result && typeof snapshot.progress_percent === "number" && snapshot.progress_percent >= 100) {
          appendTerminalLine(
            "warn",
            "Result payload detected at 100% before explicit completion status. Finalizing from available result.",
          );
          finalSnapshot = snapshot;
          break;
        }

        const now = Date.now();
        if (Number.isFinite(LIVE_JOB_STALE_TIMEOUT_MS) && LIVE_JOB_STALE_TIMEOUT_MS > 0) {
          const staleMs = now - lastSnapshotActivityAt;
          if (staleMs > LIVE_JOB_STALE_TIMEOUT_MS) {
            if (!staleWarningIssued) {
              appendTerminalLine(
                "warn",
                `Generation status has been stale for ${formatElapsed(Math.floor(staleMs / 1000))}. Continuing to wait for backend completion.`,
              );
              staleWarningIssued = true;
            }
            lastSnapshotActivityAt = now;
          }
        }
        if (Number.isFinite(LIVE_JOB_MAX_DURATION_MS) && LIVE_JOB_MAX_DURATION_MS > 0) {
          const totalMs = now - pollingStartedAt;
          if (totalMs > LIVE_JOB_MAX_DURATION_MS) {
            throw new Error(
              `Generation monitor exceeded wall-time guard (${formatElapsed(Math.floor(totalMs / 1000))}). Stopping cleanly.`,
            );
          }
        }

        const waitMs = Math.max(500, Math.min(5000, snapshot.next_poll_after_ms ?? 1200));
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, waitMs);
        });
      }

      if (!finalSnapshot?.result) {
        throw new Error("Generation completed without a result payload.");
      }

      if (mode === "single") {
        const response = finalSnapshot.result as GenerateTimetableResponse;
        if (!response.alternatives.length) {
          throw new Error("No alternatives were produced.");
        }

        setSingleResult(response);
        setCycleResult(null);
        setActiveAlternativeRank(String(response.alternatives[0].rank));
        saveGeneratedResults(
          buildSingleGeneratedResultsSnapshot({
            programId: selectedProgramId,
            termNumber: Number(selectedTerm),
            response,
          }),
        );

        const best = response.alternatives[0];
        persistDraftSnapshot(best.payload, best.hard_conflicts, best.fitness, best.soft_penalty);

        appendTerminalLine("success", `Generation complete. Best hard conflicts: ${best.hard_conflicts}.`);
        appendTerminalLine("success", `Runtime ${Math.round(response.runtime_ms / 1000)}s.`);

        if (publishOnSuccess) {
          try {
            await publishOfficialTimetable(best.payload, runName.trim());
            appendTerminalLine("success", `Published as official timetable: ${runName.trim()}.`);
            setSuccess(`Generation complete and published as ${runName.trim()}.`);
          } catch (publishErr) {
            const message = toUiErrorMessage(publishErr);
            appendTerminalLine("warn", `Generated successfully, but publish failed: ${message}`);
            setSuccess(`Generation completed. Publish failed: ${message}`);
          }
        } else {
          setSuccess(`Generation completed. Saved as ${runName.trim()}.`);
        }
      } else {
        const response = finalSnapshot.result as GenerateTimetableCycleResponse;
        if (!response.results.length) {
          throw new Error("No cycle results were returned.");
        }

        setCycleResult(response);
        setSingleResult(null);
        setCyclePreviewTerm(String(response.results[0].term_number));
        setActiveAlternativeRank(String(response.results[0].generation.alternatives[0]?.rank ?? 1));

        saveGeneratedResults(
          buildCycleGeneratedResultsSnapshot({
            mode,
            programId: selectedProgramId,
            response,
          }),
        );

        const firstGeneration = response.results[0].generation;
        const best = firstGeneration.alternatives[0];
        if (best) {
          persistDraftSnapshot(best.payload, best.hard_conflicts, best.fitness, best.soft_penalty);
        }

        appendTerminalLine("success", `Cycle generation complete for semesters ${response.term_numbers.join(", ")}.`);
        setSuccess(`Cycle generation completed and saved as ${runName.trim()}.`);

        if (publishOnSuccess) {
          appendTerminalLine("warn", "Auto publish for cycle mode is disabled. Review a semester and use Publish Selected.");
        }
      }
    } catch (err) {
      const message = toUiErrorMessage(err);
      appendTerminalLine("error", `Generation failed: ${message}`);
      setError(message);
    } finally {
      setIsGenerating(false);
      setActiveJobId(null);
      setGenerationStartedAt(null);
      setLiveStage(null);
      setLiveProgressPercent(null);
      setLivePreview(null);
      appendTerminalLine("info", "Run ended.");
    }
  };

  const handlePublishSelected = async () => {
    if (!activePayload) {
      setError("No generated timetable is available to publish.");
      return;
    }

    if (!runName.trim()) {
      setError("Name is required for publishing.");
      return;
    }

    if (conflicts.length > 0) {
      setError("Resolve remaining conflicts before publishing.");
      return;
    }

    setIsPublishing(true);
    setError(null);
    setSuccess(null);

    try {
      await publishOfficialTimetable(activePayload, runName.trim());
      appendTerminalLine("success", `Published selected timetable as ${runName.trim()}.`);
      setSuccess(`Published as ${runName.trim()}.`);
    } catch (err) {
      const message = toUiErrorMessage(err);
      appendTerminalLine("error", `Publish failed: ${message}`);
      setError(message);
    } finally {
      setIsPublishing(false);
    }
  };

  const activeProgramName = useMemo(() => {
    return programs.find((program) => program.id === selectedProgramId)?.name ?? "";
  }, [programs, selectedProgramId]);

  const activeTermCredits = useMemo(() => {
    if (mode !== "single") {
      return null;
    }
    const termNumber = Number(selectedTerm);
    if (!Number.isFinite(termNumber)) {
      return null;
    }
    return programTerms.find((term) => term.term_number === termNumber)?.credits_required ?? null;
  }, [mode, programTerms, selectedTerm]);

  if (!canGenerate) {
    return (
      <Card className="card-modern">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <AlertCircle className="mb-4 h-12 w-12 opacity-20" />
          <h3 className="text-lg font-semibold">Restricted Access</h3>
          <p>Only administrators and schedulers can run timetable generation.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Generator</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure one run, watch clear terminal logs, and resolve remaining conflicts directly in this page.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Generator Configuration</CardTitle>
          <CardDescription>Choose cycle mode, enter a mandatory name, and run generation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2 xl:col-span-1">
              <Label>Program</Label>
              <Select
                value={selectedProgramId}
                onValueChange={setSelectedProgramId}
                disabled={isLoadingPrograms || isGenerating}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select program" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 xl:col-span-1">
              <Label>Cycle</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as GeneratorMode)} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Cycle</SelectItem>
                  <SelectItem value="odd">Odd Cycle</SelectItem>
                  <SelectItem value="even">Even Cycle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 xl:col-span-1">
              <Label>Semester</Label>
              <Select value={selectedTerm} onValueChange={setSelectedTerm} disabled={mode !== "single" || isGenerating}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TERM_OPTIONS.map((term) => (
                    <SelectItem key={term} value={term}>
                      Semester {term}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 xl:col-span-1">
              <Label>Name *</Label>
              <Input
                value={runName}
                onChange={(event) => setRunName(event.target.value)}
                placeholder="Ex: Odd Cycle - 2026 Final"
                disabled={isGenerating}
              />
            </div>

            <div className="space-y-2 xl:col-span-1">
              <Label>Actions</Label>
              <div className="flex gap-2">
                <Button
                  onClick={() => void handleGenerate()}
                  disabled={
                    isGenerating ||
                    isLoadingPrograms ||
                    !selectedProgramId ||
                    !runName.trim() ||
                    (mode === "single" && !selectedTerm)
                  }
                  className="w-full"
                >
                  {isGenerating ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Running
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      Run Generator
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
            <div className="text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Program:</span> {activeProgramName || "-"}
              </p>
              {mode === "single" ? (
                <p>
                  <span className="font-medium text-foreground">Semester:</span> {selectedTerm}
                  {activeTermCredits ? ` • Credit target ${activeTermCredits}` : ""}
                </p>
              ) : (
                <p>
                  <span className="font-medium text-foreground">Scope:</span>{" "}
                  {mode === "odd" ? "Semesters 1, 3, 5, 7" : "Semesters 2, 4, 6, 8"}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={publishOnSuccess} onCheckedChange={setPublishOnSuccess} disabled={isGenerating} />
              <Label>Auto publish (single cycle only)</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TerminalSquare className="h-5 w-5" />
              Algorithm Terminal
            </CardTitle>
            <CardDescription>
              Plain-language, step-by-step execution logs from the live optimization run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isGenerating ? (
              <div className="mb-4 rounded-md border bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <p className="font-medium">{stageLabel(liveStage)}</p>
                  <Badge variant="outline">
                    {typeof liveProgressPercent === "number" ? `${liveProgressPercent.toFixed(1)}%` : "Starting"}
                  </Badge>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded bg-primary/15">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, liveProgressPercent ?? 0))}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Elapsed {formatElapsed(generationElapsedSeconds)}
                  {activeJobId ? ` • Job ${activeJobId.slice(0, 8)}` : ""}
                </p>
              </div>
            ) : null}

            <div className="rounded-lg border bg-slate-950 p-3 text-xs font-mono text-slate-200">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge variant="secondary" className="bg-slate-800 text-slate-200">
                  {isGenerating ? `running ${formatElapsed(generationElapsedSeconds)}` : "idle"}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  onClick={clearTerminal}
                  disabled={!terminalLines.length}
                >
                  Clear
                </Button>
              </div>
              <div className="max-h-[380px] overflow-y-auto rounded-md border border-slate-800 bg-slate-900 p-2">
                {terminalLines.length ? (
                  <div className="space-y-1">
                    {terminalLines.map((line) => (
                      <p key={line.id} className={`break-words ${terminalLineTone(line.level)}`}>
                        <span className="text-slate-500">[{line.at}]</span> {line.message}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400">No logs yet. Start a run to stream algorithm output.</p>
                )}
                <div ref={terminalTailRef} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Run Summary</CardTitle>
            <CardDescription>Selected output and quick publish controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-medium">{runName.trim() || "-"}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Mode</p>
                <p className="font-medium">{mode === "single" ? "Single Cycle" : `${mode.toUpperCase()} Cycle`}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Unresolved conflicts</p>
                <p className="font-medium">{conflicts.length}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Resolved this run</p>
                <p className="font-medium">{autoResolvedConflicts.length + manualResolvedConflicts.length}</p>
              </div>
            </div>

            {mode !== "single" && cycleResult?.results.length ? (
              <div className="space-y-2">
                <Label>Preview Semester</Label>
                <Select value={cyclePreviewTerm} onValueChange={setCyclePreviewTerm}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cycleResult.results.map((item) => (
                      <SelectItem key={item.term_number} value={String(item.term_number)}>
                        Semester {item.term_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {activeGenerationResponse?.alternatives.length ? (
              <div className="space-y-2">
                <Label>Alternative</Label>
                <Select value={activeAlternativeRank} onValueChange={setActiveAlternativeRank}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeGenerationResponse.alternatives.map((item) => (
                      <SelectItem key={item.rank} value={String(item.rank)}>
                        Alternative {item.rank} • Hard {item.hard_conflicts} • Soft {item.soft_penalty.toFixed(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => void refreshConflicts(activePayload)}
                disabled={!activePayload || conflictLoading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${conflictLoading ? "animate-spin" : ""}`} />
                Refresh Conflicts
              </Button>
              <Button
                onClick={() => void handlePublishSelected()}
                disabled={isPublishing || !activePayload || !runName.trim() || !!conflicts.length}
              >
                {isPublishing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Publishing
                  </span>
                ) : (
                  "Publish Selected"
                )}
              </Button>
            </div>
            {conflicts.length > 0 ? (
              <p className="text-xs text-amber-600">
                Publishing is blocked until all unresolved conflicts are handled.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Timetable Preview</CardTitle>
          <CardDescription>
            Live preview of generated timetable output. In multi-cycle mode, choose the semester above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Semester Filter</Label>
              <Select value={previewSemesterFilter} onValueChange={setPreviewSemesterFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All semesters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All semesters</SelectItem>
                  {previewSemesterOptions.map((semester) => (
                    <SelectItem key={semester} value={semester}>
                      Semester {semester}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Section Filter</Label>
              <Select value={previewSectionFilter} onValueChange={setPreviewSectionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sections</SelectItem>
                  {previewSectionOptions.map((section) => (
                    <SelectItem key={section} value={section}>
                      {section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <WeeklyTimetableGrid payload={filteredDisplayPayload} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conflicts Manager Moved</CardTitle>
          <CardDescription>
            Conflict review and resolution now runs from the Schedule workspace so it always uses the active saved timetable payload.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Open the Schedule page to view unresolved, auto-resolved, and manually resolved conflicts with full descriptions.</p>
          <p>Use Re-verify there after each run to refresh conflict status from the backend review engine.</p>
        </CardContent>
      </Card>
    </div>
  );
}
