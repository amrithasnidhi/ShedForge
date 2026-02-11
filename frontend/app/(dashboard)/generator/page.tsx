"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FlaskConical, RefreshCw, Save, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listCourses,
  listProgramCourses,
  listProgramSections,
  listProgramTerms,
  listPrograms,
  type Course,
  type Program,
  type ProgramCourse,
  type ProgramSection,
  type ProgramTerm,
} from "@/lib/academic-api";
import {
  createSlotLock,
  deleteSlotLock,
  fetchGenerationSettings,
  generateTimetable,
  generateTimetableCycle,
  type GenerationCycle,
  type GeneratedCycleSolution,
  type GeneratedCycleTermResult,
  listReevaluationEvents,
  listSlotLocks,
  type GenerationSolverStrategy,
  type OccupancyMatrix,
  runCurriculumReevaluation,
  updateGenerationSettings,
  type GenerateTimetableResponse,
  type GenerationSettings,
  type ReevaluationEvent,
  type SlotLock,
} from "@/lib/generator-api";
import { generateICSContent } from "@/lib/ics";
import { parseTimeToMinutes, sortTimes } from "@/lib/schedule-template";
import { publishOfficialTimetable, type OfficialTimetablePayload } from "@/lib/timetable-api";
import { downloadTimetableCsv } from "@/lib/timetable-csv";
import {
  buildCycleTermDraftSnapshot,
  buildSingleDraftSnapshot,
  loadGeneratedDraft,
  saveGeneratedDraft,
} from "@/lib/generated-draft-store";
import {
  buildCycleGeneratedResultsSnapshot,
  buildSingleGeneratedResultsSnapshot,
  loadGeneratedResults,
  saveGeneratedResults,
} from "@/lib/generated-results-store";

const TERM_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MANDATORY_LUNCH_START_MINUTES = parseTimeToMinutes("13:15");
const MANDATORY_LUNCH_END_MINUTES = parseTimeToMinutes("14:05");
const LAB_CONTIGUOUS_SLOTS = 2;
const TERMINAL_MAX_LINES = 300;
type ExportFormat = "csv" | "ics" | "json";
type ExportScope = "full" | "day" | "section" | "faculty";

type TerminalLevel = "info" | "success" | "warn" | "error";

interface TerminalLine {
  id: number;
  level: TerminalLevel;
  at: string;
  message: string;
}

interface ConstraintComplianceCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

interface ConstraintComplianceSummary {
  total: number;
  passed: number;
  checks: ConstraintComplianceCheck[];
}

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.trunc(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function toUiErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "Cannot reach backend API. Verify backend is running and NEXT_PUBLIC_API_BASE_URL is correct.";
    }
    return error.message;
  }
  return "Unexpected error while processing request.";
}

function formatTerminalTimestamp(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

function makeSafeFileNamePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "all";
}

function getCourseColor(type: string, sessionType?: string): string {
  if (sessionType === "tutorial") {
    return "bg-primary/10 border-primary/30 text-primary";
  }
  switch (type) {
    case "theory":
      return "bg-primary/10 border-primary/30 text-primary";
    case "lab":
      return "bg-accent/20 border-accent/40 text-accent-foreground";
    case "elective":
      return "bg-chart-4/20 border-chart-4/40 text-foreground";
    default:
      return "bg-muted";
  }
}

function resolveSessionType(
  slot: OfficialTimetablePayload["timetableData"][number],
  course: OfficialTimetablePayload["courseData"][number] | undefined,
): "theory" | "tutorial" | "lab" {
  if (slot.sessionType) {
    return slot.sessionType;
  }
  return course?.type === "lab" ? "lab" : "theory";
}

function buildConstraintComplianceSummary({
  payload,
  hardConflicts,
  programTerms,
  configuredSectionCount,
}: {
  payload: OfficialTimetablePayload;
  hardConflicts: number;
  programTerms: ProgramTerm[];
  configuredSectionCount: number;
}): ConstraintComplianceSummary {
  const checks: ConstraintComplianceCheck[] = [];
  const slots = payload.timetableData;
  const hardConflictCount = Math.max(0, hardConflicts);

  const slotDurations = slots
    .map((slot) => parseTimeToMinutes(slot.endTime) - parseTimeToMinutes(slot.startTime))
    .filter((value) => Number.isFinite(value) && value > 0);
  const periodMinutes = slotDurations.length ? Math.min(...slotDurations) : 50;
  const labBlockMinutes = periodMinutes * LAB_CONTIGUOUS_SLOTS;

  const facultyMinutes = new Map<string, number>();
  for (const slot of slots) {
    const start = parseTimeToMinutes(slot.startTime);
    const end = parseTimeToMinutes(slot.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }
    facultyMinutes.set(slot.facultyId, (facultyMinutes.get(slot.facultyId) ?? 0) + (end - start));
  }
  const overloadedFaculty = payload.facultyData
    .filter((faculty) => {
      const maxMinutes = Math.max(0, faculty.maxHours) * 60;
      if (!maxMinutes) return false;
      return (facultyMinutes.get(faculty.id) ?? 0) > maxMinutes;
    })
    .map((faculty) => faculty.name);
  checks.push({
    id: "staff-capacity",
    label: "Staff workload <= max capacity",
    passed: overloadedFaculty.length === 0,
    detail:
      overloadedFaculty.length === 0
        ? `All faculty assignments are within configured weekly max-hours limits. Hard conflicts: ${hardConflictCount}.`
        : `Overloaded faculty: ${overloadedFaculty.slice(0, 3).join(", ")}${overloadedFaculty.length > 3 ? "..." : ""}.`,
  });

  const termNumber = payload.termNumber ?? null;
  const configuredWeeklyHours = payload.courseData.reduce((sum, course) => sum + Math.max(0, course.hoursPerWeek ?? 0), 0);
  const termCredits = termNumber
    ? (programTerms.find((term) => term.term_number === termNumber)?.credits_required ?? 0)
    : 0;
  const expectedWeeklyHours =
    termCredits > 0 && termCredits === configuredWeeklyHours ? termCredits : configuredWeeklyHours;
  const expectedMinutes = expectedWeeklyHours * periodMinutes;

  const sectionWindows = new Map<string, Set<string>>();
  for (const slot of slots) {
    const key = `${slot.day}|${slot.startTime}|${slot.endTime}`;
    const existing = sectionWindows.get(slot.section) ?? new Set<string>();
    existing.add(key);
    sectionWindows.set(slot.section, existing);
  }
  const sectionMinuteRows = [...sectionWindows.entries()].map(([section, windows]) => ({
    section,
    minutes: [...windows].reduce((sum, windowKey) => {
      const [, startTime, endTime] = windowKey.split("|");
      const start = parseTimeToMinutes(startTime);
      const end = parseTimeToMinutes(endTime);
      return Number.isFinite(start) && Number.isFinite(end) && end > start ? sum + (end - start) : sum;
    }, 0),
  }));
  const mismatchedSections = sectionMinuteRows.filter((row) => row.minutes !== expectedMinutes);
  checks.push({
    id: "student-credit-load",
    label: "Student weekly hours match semester credit load",
    passed: expectedMinutes === 0 ? true : mismatchedSections.length === 0,
    detail:
      expectedMinutes === 0
        ? "No expected weekly-minute target could be resolved from current course setup."
        : mismatchedSections.length === 0
          ? `All sections match ${expectedMinutes} minutes/week (${expectedWeeklyHours} credit-hours × ${periodMinutes}m).`
          : `Mismatched sections: ${mismatchedSections.slice(0, 3).map((item) => `${item.section}(${item.minutes}m)`).join(", ")}${mismatchedSections.length > 3 ? "..." : ""}.`,
  });

  const lunchViolations = slots.filter((slot) => {
    const start = parseTimeToMinutes(slot.startTime);
    const end = parseTimeToMinutes(slot.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return false;
    }
    return rangesOverlap(start, end, MANDATORY_LUNCH_START_MINUTES, MANDATORY_LUNCH_END_MINUTES);
  });
  checks.push({
    id: "mandatory-lunch",
    label: "Mandatory lunch break 13:15-14:05 respected",
    passed: lunchViolations.length === 0,
    detail:
      lunchViolations.length === 0
        ? "No slot overlaps the mandatory lunch break window."
        : `${lunchViolations.length} slot(s) overlap lunch break.`,
  });

  const uniqueDays = new Set(slots.map((slot) => slot.day));
  const uniqueTimes = new Set(slots.map((slot) => slot.startTime));
  const maxCells = uniqueDays.size * uniqueTimes.size;
  const hasDetectedFreeCells = sectionMinuteRows.some((row) => {
    const windows = sectionWindows.get(row.section);
    return windows ? windows.size < maxCells : false;
  });
  checks.push({
    id: "free-hours-allowed",
    label: "Free hours are permitted (non-slot-filling)",
    passed: true,
    detail: hasDetectedFreeCells
      ? "Detected free timetable cells; scheduler is not forcing full-slot occupancy."
      : "Policy allows free hours; full occupancy is optional, not required.",
  });

  const roomById = new Map(payload.roomData.map((room) => [room.id, room]));
  const courseById = new Map(payload.courseData.map((course) => [course.id, course]));
  const labTheoryIssues: string[] = [];
  for (const course of payload.courseData) {
    const expectedSplit = (course.theoryHours ?? 0) + (course.labHours ?? 0) + (course.tutorialHours ?? 0);
    if (expectedSplit > 0 && expectedSplit !== course.hoursPerWeek) {
      labTheoryIssues.push(`${course.code} split!=hours/week`);
    }
    if (course.credits !== course.hoursPerWeek) {
      labTheoryIssues.push(`${course.code} credits!=hours/week`);
    }
    if (expectedSplit > 0 && course.credits !== expectedSplit) {
      labTheoryIssues.push(`${course.code} credits!=split`);
    }
    if (course.type === "lab") {
      if ((course.labHours ?? 0) <= 0 || (course.theoryHours ?? 0) > 0 || (course.tutorialHours ?? 0) > 0) {
        labTheoryIssues.push(`${course.code} invalid lab/theory split`);
      }
    } else if ((course.labHours ?? 0) > 0) {
      labTheoryIssues.push(`${course.code} non-lab with labHours`);
    }
  }
  const groupedCourseSlots = new Map<string, typeof slots>();
  for (const slot of slots) {
    const course = courseById.get(slot.courseId);
    const key = `${slot.courseId}|${slot.section}|${course?.type === "lab" ? (slot.batch ?? "__missing__") : "__single__"}`;
    const existing = groupedCourseSlots.get(key) ?? [];
    existing.push(slot);
    groupedCourseSlots.set(key, existing);
  }
  for (const [groupKey, groupSlots] of groupedCourseSlots.entries()) {
    const [courseId, section, batchKey] = groupKey.split("|");
    const course = courseById.get(courseId);
    if (!course) continue;
    const totalMinutes = groupSlots.reduce((sum, slot) => {
      const start = parseTimeToMinutes(slot.startTime);
      const end = parseTimeToMinutes(slot.endTime);
      return Number.isFinite(start) && Number.isFinite(end) && end > start ? sum + (end - start) : sum;
    }, 0);
    const expectedMinutesForCourse = Math.max(0, course.hoursPerWeek) * periodMinutes;
    if (expectedMinutesForCourse > 0 && totalMinutes !== expectedMinutesForCourse) {
      labTheoryIssues.push(`${course.code}/${section}${batchKey !== "__single__" ? `-${batchKey}` : ""} minutes mismatch`);
    }
    if (course.type === "lab") {
      if (!groupSlots.every((slot) => Boolean(slot.batch))) {
        labTheoryIssues.push(`${course.code}/${section} missing lab batch`);
      }
      if (!groupSlots.every((slot) => roomById.get(slot.roomId)?.type === "lab")) {
        labTheoryIssues.push(`${course.code}/${section} not in lab room`);
      }
      const byDay = new Map<string, typeof groupSlots>();
      for (const slot of groupSlots) {
        const existing = byDay.get(slot.day) ?? [];
        existing.push(slot);
        byDay.set(slot.day, existing);
      }
      for (const daySlots of byDay.values()) {
        const ordered = [...daySlots].sort((left, right) => parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime));
        let blockStart = -1;
        let blockEnd = -1;
        for (const slot of ordered) {
          const start = parseTimeToMinutes(slot.startTime);
          const end = parseTimeToMinutes(slot.endTime);
          if (blockStart < 0 || blockEnd < 0 || start !== blockEnd) {
            if (blockStart >= 0 && blockEnd > blockStart && blockEnd - blockStart !== labBlockMinutes) {
              labTheoryIssues.push(`${course.code}/${section} non-2-slot lab block`);
            }
            blockStart = start;
            blockEnd = end;
          } else {
            blockEnd = end;
          }
        }
        if (blockStart >= 0 && blockEnd > blockStart && blockEnd - blockStart !== labBlockMinutes) {
          labTheoryIssues.push(`${course.code}/${section} non-2-slot lab block`);
        }
      }
    } else if (groupSlots.some((slot) => roomById.get(slot.roomId)?.type === "lab")) {
      labTheoryIssues.push(`${course.code}/${section} theory scheduled in lab room`);
    }
  }
  checks.push({
    id: "lab-theory-credit-split",
    label: "Lab/Theory split and credit-hour class counts",
    passed: labTheoryIssues.length === 0,
    detail:
      labTheoryIssues.length === 0
        ? "Course split and slot allocations align with configured weekly hours."
        : `Issues: ${labTheoryIssues.slice(0, 3).join(", ")}${labTheoryIssues.length > 3 ? "..." : ""}.`,
  });

  const payloadSectionCount = new Set(slots.map((slot) => slot.section)).size;
  const hasSemesterDropdown = Boolean(programTerms.length || TERM_OPTIONS.length);
  const hasSectionDropdown = payloadSectionCount > 0 || configuredSectionCount > 0;
  checks.push({
    id: "visualization-dropdown-coverage",
    label: "Section/Semester visualization dropdown coverage",
    passed: hasSemesterDropdown && hasSectionDropdown,
    detail:
      hasSemesterDropdown && hasSectionDropdown
        ? "Semester and section selectors are available for alternate timetable review."
        : "Missing section or semester selector data for this generated context.",
  });

  const passed = checks.filter((item) => item.passed).length;
  return {
    total: checks.length,
    passed,
    checks,
  };
}

function summarizeOccupancyRows(
  matrix: Record<string, Record<string, number>>,
  labels: Record<string, string>,
): Array<{ entityId: string; entityLabel: string; totalBookings: number; peakLoad: number }> {
  return Object.entries(matrix)
    .map(([entityId, slots]) => {
      const counts = Object.values(slots);
      const totalBookings = counts.reduce((sum, value) => sum + value, 0);
      const peakLoad = counts.length ? Math.max(...counts) : 0;
      return {
        entityId,
        entityLabel: labels[entityId] ?? entityId,
        totalBookings,
        peakLoad,
      };
    })
    .sort((left, right) => {
      if (right.totalBookings !== left.totalBookings) {
        return right.totalBookings - left.totalBookings;
      }
      return left.entityLabel.localeCompare(right.entityLabel);
    });
}

function OccupancyMatrixPanel({
  matrix,
}: {
  matrix: OccupancyMatrix | null | undefined;
}) {
  if (!matrix) {
    return null;
  }

  const sectionRows = summarizeOccupancyRows(matrix.section_matrix, {});
  const facultyRows = summarizeOccupancyRows(matrix.faculty_matrix, matrix.faculty_labels ?? {});
  const roomRows = summarizeOccupancyRows(matrix.room_matrix, matrix.room_labels ?? {});

  const renderMatrix = (
    title: string,
    rows: Array<{ entityId: string; entityLabel: string; totalBookings: number; peakLoad: number }>,
  ) => {
    if (!rows.length) {
      return (
        <div className="rounded-md border bg-background p-2 text-xs text-muted-foreground">
          {title}: no occupied slots
        </div>
      );
    }
    return (
      <div className="rounded-md border bg-background p-2">
        <p className="text-xs font-medium">{title}</p>
        <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
          {rows.map((row) => (
            <div key={row.entityId} className="flex items-center justify-between text-xs">
              <span className="truncate max-w-[60%]">{row.entityLabel}</span>
              <span className="text-muted-foreground">
                {row.totalBookings} slot(s) • peak {row.peakLoad}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mb-4 rounded-lg border bg-muted/20 p-3">
      <p className="text-sm font-medium">Occupancy Matrices</p>
      <p className="text-xs text-muted-foreground mt-1">
        Resource load snapshots across sections, faculty, and rooms for this generated alternative.
      </p>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        {renderMatrix("Sections", sectionRows)}
        {renderMatrix("Faculty", facultyRows)}
        {renderMatrix("Rooms", roomRows)}
      </div>
    </div>
  );
}

function ConstraintCompliancePanel({
  summary,
}: {
  summary: ConstraintComplianceSummary;
}) {
  return (
    <div className="mb-4 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Constraint Compliance Summary</p>
        <Badge variant={summary.passed === summary.total ? "default" : "outline"}>
          {summary.passed}/{summary.total} checks passed
        </Badge>
      </div>
      <div className="mt-2 space-y-2">
        {summary.checks.map((check) => (
          <div key={check.id} className="rounded-md border bg-background p-2 text-xs">
            <div className="flex items-center gap-2">
              {check.passed ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )}
              <p className="font-medium">{check.label}</p>
            </div>
            <p className="mt-1 text-muted-foreground">{check.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
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

export default function GeneratorPage() {
  const { user } = useAuth();
  const canGenerate = user?.role === "admin" || user?.role === "scheduler";

  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [selectedTerm, setSelectedTerm] = useState("1");
  const [generationCycle, setGenerationCycle] = useState<"single" | GenerationCycle>("single");
  const [alternativeCount, setAlternativeCount] = useState(3);
  const [cycleResults, setCycleResults] = useState<GeneratedCycleTermResult[]>([]);
  const [cycleParetoFront, setCycleParetoFront] = useState<GeneratedCycleSolution[]>([]);
  const [cycleSolutionRank, setCycleSolutionRank] = useState("");
  const [cyclePreviewTerm, setCyclePreviewTerm] = useState("");
  const [cycleParetoLimit, setCycleParetoLimit] = useState(12);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
  const [exportScope, setExportScope] = useState<ExportScope>("full");
  const [exportDay, setExportDay] = useState("");
  const [exportSection, setExportSection] = useState("");
  const [exportFacultyId, setExportFacultyId] = useState("");

  const [settings, setSettings] = useState<GenerationSettings | null>(null);
  const [results, setResults] = useState<GenerateTimetableResponse | null>(null);
  const [activeTab, setActiveTab] = useState("alt-1");
  const [publishOnSuccess, setPublishOnSuccess] = useState(false);
  const [sections, setSections] = useState<ProgramSection[]>([]);
  const [programTerms, setProgramTerms] = useState<ProgramTerm[]>([]);
  const [programCourses, setProgramCourses] = useState<ProgramCourse[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [slotLocks, setSlotLocks] = useState<SlotLock[]>([]);
  const [reevaluationEvents, setReevaluationEvents] = useState<ReevaluationEvent[]>([]);
  const [lockDay, setLockDay] = useState("Monday");
  const [lockStart, setLockStart] = useState("08:50");
  const [lockEnd, setLockEnd] = useState("09:40");
  const [lockSection, setLockSection] = useState("");
  const [lockCourseId, setLockCourseId] = useState("");
  const [lockBatch, setLockBatch] = useState("");
  const [lockNotes, setLockNotes] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState(0);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [isSavingLock, setIsSavingLock] = useState(false);
  const [lockLoading, setLockLoading] = useState(false);
  const [reevaluationLoading, setReevaluationLoading] = useState(false);
  const [isRunningReevaluation, setIsRunningReevaluation] = useState(false);
  const [isPublishingOfficial, setIsPublishingOfficial] = useState(false);
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const terminalCounterRef = useRef(0);
  const terminalTailRef = useRef<HTMLDivElement | null>(null);

  const appendTerminalLine = useCallback((level: TerminalLevel, message: string) => {
    setTerminalLines((previous) => {
      const next = [
        ...previous,
        {
          id: terminalCounterRef.current + 1,
          level,
          at: formatTerminalTimestamp(),
          message,
        },
      ];
      terminalCounterRef.current += 1;
      if (next.length <= TERMINAL_MAX_LINES) {
        return next;
      }
      return next.slice(next.length - TERMINAL_MAX_LINES);
    });
  }, []);

  const clearTerminal = useCallback(() => {
    setTerminalLines([]);
    terminalCounterRef.current = 0;
  }, []);

  useEffect(() => {
    const storedResults = loadGeneratedResults();
    if (storedResults) {
      if (storedResults.program_id) {
        setSelectedProgramId((previous) => previous || storedResults.program_id || "");
      }
      if (storedResults.term_number) {
        setSelectedTerm(String(storedResults.term_number));
      }

      if (storedResults.mode === "single" && storedResults.single?.alternatives?.length) {
        setGenerationCycle("single");
        setResults(storedResults.single);
        setCycleResults([]);
        setCycleParetoFront([]);
        setCycleSolutionRank("");
        setCyclePreviewTerm("");
        setActiveTab(`alt-${storedResults.single.alternatives[0].rank}`);
        setSuccess(`Loaded saved generated alternatives from previous session (${storedResults.single.alternatives.length} alternatives).`);
        return;
      }

      if (storedResults.mode !== "single" && storedResults.cycle?.results?.length) {
        const cycleResponse = storedResults.cycle;
        const paretoFront = cycleResponse.pareto_front ?? [];
        const selectedRank = cycleResponse.selected_solution_rank ?? paretoFront[0]?.rank;
        const selectedSolution = paretoFront.find((item) => item.rank === selectedRank) ?? paretoFront[0];
        const defaultTerm = selectedSolution?.terms[0];
        const firstResult = defaultTerm
          ? cycleResponse.results.find((item) => item.term_number === defaultTerm.term_number)
          : cycleResponse.results[0];

        setGenerationCycle(storedResults.mode);
        setCycleResults(cycleResponse.results);
        setCycleParetoFront(paretoFront);
        setCycleSolutionRank(selectedSolution ? String(selectedSolution.rank) : "");
        setCyclePreviewTerm(defaultTerm ? String(defaultTerm.term_number) : "");
        setResults(firstResult?.generation ?? null);
        setActiveTab(firstResult?.generation.alternatives[0] ? `alt-${firstResult.generation.alternatives[0].rank}` : "alt-1");
        setSuccess(`Loaded saved cycle solutions from previous session (${paretoFront.length} Pareto solutions).`);
        return;
      }
    }

    const stored = loadGeneratedDraft();
    if (!stored) {
      return;
    }
    if (stored.program_id) {
      setSelectedProgramId((previous) => previous || stored.program_id || "");
    }
    if (stored.term_number) {
      setSelectedTerm(String(stored.term_number));
    }
    if (!stored.payload?.timetableData?.length) {
      return;
    }
    setResults({
      alternatives: [
        {
          rank: 1,
          fitness: stored.fitness ?? 0,
          hard_conflicts: stored.hard_conflicts,
          soft_penalty: 0,
          payload: stored.payload,
          occupancy_matrix: null,
        },
      ],
      settings_used: {
        solver_strategy: "auto",
        population_size: 0,
        generations: 0,
        mutation_rate: 0,
        crossover_rate: 0,
        elite_count: 0,
        tournament_size: 0,
        stagnation_limit: 0,
        annealing_iterations: 0,
        annealing_initial_temperature: 0,
        annealing_cooling_rate: 0,
        random_seed: null,
        objective_weights: {
          room_conflict: 0,
          faculty_conflict: 0,
          section_conflict: 0,
          room_capacity: 0,
          room_type: 0,
          faculty_availability: 0,
          locked_slot: 0,
          semester_limit: 0,
          workload_overflow: 0,
          workload_underflow: 0,
          spread_balance: 0,
          faculty_subject_preference: 0,
        },
      },
      runtime_ms: 0,
    });
    setGenerationCycle(stored.mode === "single" ? "single" : stored.mode);
    setCycleResults([]);
    setCycleParetoFront([]);
    setCycleSolutionRank("");
    setCyclePreviewTerm("");
    setActiveTab("alt-1");
    setSuccess(`Loaded saved generated draft (${stored.label}) from previous session.`);
  }, []);

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
    terminalTailRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [terminalLines]);

  useEffect(() => {
    if (!isGenerating || generationStartedAt === null) {
      return;
    }
    const heartbeatId = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - generationStartedAt) / 1000);
      appendTerminalLine("info", `Optimization running... elapsed ${formatElapsed(elapsedSeconds)}`);
    }, 10000);
    return () => {
      window.clearInterval(heartbeatId);
    };
  }, [appendTerminalLine, generationStartedAt, isGenerating]);

  useEffect(() => {
    let isActive = true;
    Promise.allSettled([listPrograms(), fetchGenerationSettings()])
      .then(([programsResult, settingsResult]) => {
        if (!isActive) return;
        if (programsResult.status === "fulfilled") {
          setPrograms(programsResult.value);
          setSelectedProgramId((previous) => previous || programsResult.value[0]?.id || "");
        } else {
          setError(programsResult.reason instanceof Error ? programsResult.reason.message : "Unable to load programs");
        }
        if (settingsResult.status === "fulfilled") {
          setSettings(settingsResult.value);
        } else {
          setError(settingsResult.reason instanceof Error ? settingsResult.reason.message : "Unable to load generator settings");
        }
      })
      .finally(() => {
        if (!isActive) return;
        setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const selectedTermNumber = Number(selectedTerm);

  useEffect(() => {
    if (!selectedProgramId) {
      setSections([]);
      setProgramTerms([]);
      setProgramCourses([]);
      setCourses([]);
      setSlotLocks([]);
      setReevaluationEvents([]);
      setLockSection("");
      setLockCourseId("");
      return;
    }

    let isActive = true;
    Promise.allSettled([
      listProgramSections(selectedProgramId),
      listProgramTerms(selectedProgramId),
      listProgramCourses(selectedProgramId),
      listCourses(),
      listSlotLocks(selectedProgramId, selectedTermNumber),
      listReevaluationEvents({ program_id: selectedProgramId, term_number: selectedTermNumber, status: "pending" }),
    ]).then(([sectionsResult, termsResult, programCoursesResult, coursesResult, locksResult, eventsResult]) => {
      if (!isActive) return;

      if (sectionsResult.status === "fulfilled") {
        const data = sectionsResult.value;
        setSections(data);
        const termSections = data.filter((item) => item.term_number === selectedTermNumber);
        setLockSection((prev) => (prev && termSections.some((item) => item.name === prev) ? prev : (termSections[0]?.name ?? "")));
      }
      if (termsResult.status === "fulfilled") {
        setProgramTerms(termsResult.value);
      }
      if (programCoursesResult.status === "fulfilled") {
        const data = programCoursesResult.value;
        setProgramCourses(data);
        const termCourses = data.filter((item) => item.term_number === selectedTermNumber);
        setLockCourseId((prev) => (prev && termCourses.some((item) => item.course_id === prev) ? prev : (termCourses[0]?.course_id ?? "")));
      }
      if (coursesResult.status === "fulfilled") {
        setCourses(coursesResult.value);
      }
      if (locksResult.status === "fulfilled") {
        setSlotLocks(locksResult.value);
      }
      if (eventsResult.status === "fulfilled") {
        setReevaluationEvents(eventsResult.value);
      }
      if (
        sectionsResult.status !== "fulfilled" ||
        termsResult.status !== "fulfilled" ||
        programCoursesResult.status !== "fulfilled" ||
        coursesResult.status !== "fulfilled" ||
        locksResult.status !== "fulfilled" ||
        eventsResult.status !== "fulfilled"
      ) {
        setError("Some generator support data could not be loaded.");
      }
    });

    return () => {
      isActive = false;
    };
  }, [selectedProgramId, selectedTermNumber]);

  const activeAlternative = useMemo(() => {
    if (!results?.alternatives.length) return null;
    const rankFromTab = Number(activeTab.replace("alt-", ""));
    return results.alternatives.find((item) => item.rank === rankFromTab) ?? results.alternatives[0];
  }, [activeTab, results]);

  const activeCycleSolution = useMemo(() => {
    if (!cycleParetoFront.length) return null;
    const rank = Number(cycleSolutionRank);
    if (!Number.isFinite(rank) || rank <= 0) {
      return cycleParetoFront[0];
    }
    return cycleParetoFront.find((item) => item.rank === rank) ?? cycleParetoFront[0];
  }, [cycleParetoFront, cycleSolutionRank]);

  const activeCycleTermEntry = useMemo(() => {
    if (!activeCycleSolution?.terms.length) return null;
    if (!cyclePreviewTerm) {
      return activeCycleSolution.terms[0];
    }
    return activeCycleSolution.terms.find((item) => String(item.term_number) === cyclePreviewTerm) ?? activeCycleSolution.terms[0];
  }, [activeCycleSolution, cyclePreviewTerm]);

  const effectiveAlternative = useMemo(() => {
    if (generationCycle !== "single" && activeCycleTermEntry) {
      return {
        rank: activeCycleTermEntry.alternative_rank,
        fitness: activeCycleTermEntry.fitness,
        hard_conflicts: activeCycleTermEntry.hard_conflicts,
        soft_penalty: activeCycleTermEntry.soft_penalty,
        payload: activeCycleTermEntry.payload,
        occupancy_matrix: activeCycleTermEntry.occupancy_matrix ?? null,
      };
    }
    return activeAlternative;
  }, [activeAlternative, activeCycleTermEntry, generationCycle]);

  const displayDays = useMemo(() => {
    if (!effectiveAlternative) return DAY_ORDER.slice(0, 5);
    const days = Array.from(new Set(effectiveAlternative.payload.timetableData.map((slot) => slot.day)));
    return days.sort((left, right) => DAY_ORDER.indexOf(left) - DAY_ORDER.indexOf(right));
  }, [effectiveAlternative]);

  const displayTimes = useMemo(() => {
    if (!effectiveAlternative) return [];
    return sortTimes(Array.from(new Set(effectiveAlternative.payload.timetableData.map((slot) => slot.startTime))));
  }, [effectiveAlternative]);

  const exportPayload = useMemo(() => {
    if (generationCycle !== "single" && activeCycleTermEntry) {
      return activeCycleTermEntry.payload;
    }
    return activeAlternative?.payload ?? null;
  }, [activeAlternative, activeCycleTermEntry, generationCycle]);

  useEffect(() => {
    if (generationCycle === "single" && activeAlternative) {
      saveGeneratedDraft(
        buildSingleDraftSnapshot({
          source: "generator",
          mode: "single",
          programId: selectedProgramId,
          termNumber: Number(selectedTerm),
          alternative: activeAlternative,
        }),
      );
      return;
    }
    if (generationCycle !== "single" && activeCycleTermEntry) {
      saveGeneratedDraft(
        buildCycleTermDraftSnapshot({
          source: "generator",
          mode: generationCycle,
          programId: selectedProgramId,
          solutionRank: activeCycleSolution?.rank,
          term: activeCycleTermEntry,
        }),
      );
    }
  }, [
    activeAlternative,
    activeCycleSolution?.rank,
    activeCycleTermEntry,
    generationCycle,
    selectedProgramId,
    selectedTerm,
  ]);

  const activeWorkloadGapSuggestions = useMemo(() => {
    if (generationCycle !== "single") {
      const cycleSuggestions = activeCycleSolution?.workload_gap_suggestions ?? [];
      if (cycleSuggestions.length) {
        return cycleSuggestions;
      }
      return activeCycleTermEntry?.workload_gap_suggestions ?? [];
    }
    return activeAlternative?.workload_gap_suggestions ?? [];
  }, [activeAlternative, activeCycleSolution, activeCycleTermEntry, generationCycle]);

  const exportDays = useMemo(() => {
    if (!exportPayload) return [];
    const uniqueDays = Array.from(new Set(exportPayload.timetableData.map((slot) => slot.day)));
    return uniqueDays.sort((left, right) => DAY_ORDER.indexOf(left) - DAY_ORDER.indexOf(right));
  }, [exportPayload]);

  const exportSections = useMemo(() => {
    if (!exportPayload) return [];
    return Array.from(new Set(exportPayload.timetableData.map((slot) => slot.section))).sort((a, b) => a.localeCompare(b));
  }, [exportPayload]);

  const exportFacultyOptions = useMemo(() => {
    if (!exportPayload) return [];
    return [...exportPayload.facultyData]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => ({ id: item.id, name: item.name }));
  }, [exportPayload]);

  const scopedExportSlots = useMemo(() => {
    if (!exportPayload) return [];
    if (exportScope === "day") {
      return exportPayload.timetableData.filter((slot) => slot.day === exportDay);
    }
    if (exportScope === "section") {
      return exportPayload.timetableData.filter((slot) => slot.section === exportSection);
    }
    if (exportScope === "faculty") {
      return exportPayload.timetableData.filter((slot) => slot.facultyId === exportFacultyId);
    }
    return exportPayload.timetableData;
  }, [exportDay, exportFacultyId, exportPayload, exportScope, exportSection]);

  const handleExportGenerated = () => {
    if (!exportPayload) {
      setError("No generated timetable available to export.");
      return;
    }
    if (!scopedExportSlots.length) {
      setError("No timetable entries match the selected export filter.");
      return;
    }

    const termLabel = generationCycle === "single"
      ? `sem-${exportPayload.termNumber ?? selectedTerm}`
      : `cycle-sem-${activeCycleTermEntry?.term_number ?? exportPayload.termNumber ?? selectedTerm}`;
    const altLabel = generationCycle === "single"
      ? `alt-${activeAlternative?.rank ?? 1}`
      : `sol-${activeCycleSolution?.rank ?? 1}-alt-${activeCycleTermEntry?.alternative_rank ?? 1}`;
    const scopeLabel = exportScope === "full"
      ? "full"
      : exportScope === "day"
        ? `day-${makeSafeFileNamePart(exportDay)}`
        : exportScope === "section"
          ? `section-${makeSafeFileNamePart(exportSection)}`
          : `faculty-${makeSafeFileNamePart(exportFacultyOptions.find((item) => item.id === exportFacultyId)?.name ?? exportFacultyId)}`;
    const baseName = `generated-${termLabel}-${altLabel}-${scopeLabel}`;

    const normalizedSlots = scopedExportSlots.map((slot) => ({
      ...slot,
      batch: slot.batch ?? undefined,
      studentCount: slot.studentCount ?? undefined,
    }));

    if (exportFormat === "csv") {
      downloadTimetableCsv(
        `${baseName}.csv`,
        normalizedSlots,
        exportPayload.courseData,
        exportPayload.roomData,
        exportPayload.facultyData,
      );
    } else if (exportFormat === "ics") {
      const icsContent = generateICSContent(normalizedSlots, {
        courses: exportPayload.courseData,
        rooms: exportPayload.roomData,
        faculty: exportPayload.facultyData,
      });
      const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${baseName}.ics`;
      anchor.click();
      URL.revokeObjectURL(url);
    } else {
      const filteredCourseIds = new Set(normalizedSlots.map((slot) => slot.courseId));
      const filteredRoomIds = new Set(normalizedSlots.map((slot) => slot.roomId));
      const filteredFacultyIds = new Set(normalizedSlots.map((slot) => slot.facultyId));
      const exportJson = {
        metadata: {
          exported_at: new Date().toISOString(),
          source: generationCycle === "single" ? "single-generation" : "cycle-generation",
          term_number: exportPayload.termNumber ?? null,
          program_id: exportPayload.programId ?? null,
          scope: exportScope,
          format: "json",
          slot_count: normalizedSlots.length,
          cycle_solution_rank: activeCycleSolution?.rank ?? null,
          cycle_term: activeCycleTermEntry?.term_number ?? null,
          alternative_rank: generationCycle === "single" ? activeAlternative?.rank ?? null : activeCycleTermEntry?.alternative_rank ?? null,
        },
        payload: {
          programId: exportPayload.programId ?? null,
          termNumber: exportPayload.termNumber ?? null,
          facultyData: exportPayload.facultyData.filter((item) => filteredFacultyIds.has(item.id)),
          courseData: exportPayload.courseData.filter((item) => filteredCourseIds.has(item.id)),
          roomData: exportPayload.roomData.filter((item) => filteredRoomIds.has(item.id)),
          timetableData: normalizedSlots,
        },
      };
      const blob = new Blob([JSON.stringify(exportJson, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${baseName}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    setError(null);
    setSuccess(`Exported ${scopedExportSlots.length} slot(s) as ${exportFormat.toUpperCase()}.`);
  };

  const setNumeric = (field: keyof GenerationSettings, value: number) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  const setSolverStrategy = (value: GenerationSolverStrategy) => {
    if (!settings) return;
    setSettings({ ...settings, solver_strategy: value });
  };

  const setFloat = (field: keyof GenerationSettings, value: number) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: Number(value.toFixed(3)) });
  };

  const handleGenerate = async () => {
    if (!settings || !selectedProgramId) {
      setError("Program and generator settings are required.");
      return;
    }
    clearTerminal();
    const clampedAlternativeCount = Math.max(1, Math.min(5, Math.trunc(alternativeCount) || 3));
    setAlternativeCount(clampedAlternativeCount);
    appendTerminalLine(
      "info",
      `Run requested: ${generationCycle === "single" ? `single semester ${selectedTerm}` : `cycle ${generationCycle}`}`,
    );
    appendTerminalLine("info", `Solver strategy: ${settings.solver_strategy}`);
    appendTerminalLine("info", `Alternative count: ${clampedAlternativeCount}`);
    setError(null);
    setSuccess(null);
    setIsGenerating(true);
    setGenerationStartedAt(Date.now());
    setGenerationElapsedSeconds(0);
    try {
      const settingsOverride = {
        solver_strategy: settings.solver_strategy,
        population_size: settings.population_size,
        generations: settings.generations,
        mutation_rate: settings.mutation_rate,
        crossover_rate: settings.crossover_rate,
        elite_count: settings.elite_count,
        tournament_size: settings.tournament_size,
        stagnation_limit: settings.stagnation_limit,
        annealing_iterations: settings.annealing_iterations,
        annealing_initial_temperature: settings.annealing_initial_temperature,
        annealing_cooling_rate: settings.annealing_cooling_rate,
        random_seed: settings.random_seed ?? null,
        objective_weights: settings.objective_weights,
      };

      if (generationCycle === "single") {
        appendTerminalLine("info", `Submitting generation request for program ${selectedProgramId}, term ${selectedTerm}.`);
        const response = await generateTimetable({
          program_id: selectedProgramId,
          term_number: Number(selectedTerm),
          alternative_count: clampedAlternativeCount,
          persist_official: publishOnSuccess,
          settings_override: settingsOverride,
        });
        if (!response.alternatives.length) {
          throw new Error("Generator returned no alternatives.");
        }
        setResults(response);
        setCycleResults([]);
        setCycleParetoFront([]);
        setCycleSolutionRank("");
        setCyclePreviewTerm("");
        setActiveTab(`alt-${response.alternatives[0].rank}`);
        saveGeneratedResults(
          buildSingleGeneratedResultsSnapshot({
            programId: selectedProgramId,
            termNumber: Number(selectedTerm),
            response,
          }),
        );
        appendTerminalLine(
          "success",
          `Generation complete: ${response.alternatives.length} alternatives, runtime ${response.runtime_ms} ms.`,
        );
        appendTerminalLine(
          response.alternatives[0].hard_conflicts === 0 ? "success" : "warn",
          `Best alternative hard conflicts: ${response.alternatives[0].hard_conflicts}.`,
        );
        if (publishOnSuccess) {
          if (response.published_version_label) {
            setSuccess(`Generation completed and best timetable was published as official (${response.published_version_label}).`);
            appendTerminalLine("success", `Best alternative published as official timetable (${response.published_version_label}).`);
          } else if (response.publish_warning) {
            setSuccess(`Generation completed, but publish skipped: ${response.publish_warning}`);
            appendTerminalLine("warn", `Publish skipped: ${response.publish_warning}`);
          } else {
            setSuccess("Generation completed. Publish was requested but no publish confirmation was returned.");
            appendTerminalLine("warn", "Publish requested but backend did not confirm publication.");
          }
        } else {
          if (response.publish_warning) {
            setSuccess(`Generation completed with warnings: ${response.publish_warning}`);
            appendTerminalLine("warn", response.publish_warning);
          } else {
            setSuccess("Generation completed successfully.");
          }
        }
      } else {
        appendTerminalLine("info", `Submitting ${generationCycle} cycle generation request for program ${selectedProgramId}.`);
        const cycleResponse = await generateTimetableCycle({
          program_id: selectedProgramId,
          cycle: generationCycle,
          alternative_count: clampedAlternativeCount,
          pareto_limit: cycleParetoLimit,
          persist_official: publishOnSuccess,
          settings_override: settingsOverride,
        });
        if (!cycleResponse.results.length) {
          throw new Error("No cycle results returned by generator");
        }
        const paretoFront = cycleResponse.pareto_front ?? [];
        if (!paretoFront.length) {
          throw new Error("Cycle generation did not return Pareto-front alternatives");
        }
        setCycleResults(cycleResponse.results);
        setCycleParetoFront(paretoFront);
        const selectedRank = cycleResponse.selected_solution_rank ?? paretoFront[0].rank;
        const selectedSolution = paretoFront.find((item) => item.rank === selectedRank) ?? paretoFront[0];
        setCycleSolutionRank(String(selectedSolution.rank));
        const defaultTerm = selectedSolution.terms[0];
        setCyclePreviewTerm(defaultTerm ? String(defaultTerm.term_number) : "");
        const firstResult = cycleResponse.results[0];
        setResults(firstResult?.generation ?? null);
        if (defaultTerm) {
          setSelectedTerm(String(defaultTerm.term_number));
        }
        setActiveTab(firstResult?.generation.alternatives[0] ? `alt-${firstResult.generation.alternatives[0].rank}` : "alt-1");
        saveGeneratedResults(
          buildCycleGeneratedResultsSnapshot({
            mode: generationCycle,
            programId: selectedProgramId,
            response: cycleResponse,
          }),
        );
        appendTerminalLine(
          "success",
          `Cycle generation complete: terms ${cycleResponse.term_numbers.join(", ")}, ${paretoFront.length} Pareto solutions.`,
        );
        setSuccess(
          `Cycle generation completed for terms ${cycleResponse.term_numbers.join(", ")} with ${paretoFront.length} Pareto alternatives.` +
            (publishOnSuccess ? " Official timetable now points to the latest generated term." : ""),
        );
      }
    } catch (err) {
      const message = toUiErrorMessage(err);
      appendTerminalLine("error", `Generation failed: ${message}`);
      setError(message);
    } finally {
      setIsGenerating(false);
      setGenerationStartedAt(null);
      appendTerminalLine("info", "Run ended.");
    }
  };

  useEffect(() => {
    if (generationCycle === "single") {
      return;
    }
    if (!activeCycleSolution?.terms.length) {
      return;
    }
    if (!cyclePreviewTerm || !activeCycleSolution.terms.some((item) => String(item.term_number) === cyclePreviewTerm)) {
      const firstTerm = activeCycleSolution.terms[0];
      setCyclePreviewTerm(String(firstTerm.term_number));
      setSelectedTerm(String(firstTerm.term_number));
      return;
    }
    setSelectedTerm(cyclePreviewTerm);
  }, [activeCycleSolution, cyclePreviewTerm, generationCycle]);

  useEffect(() => {
    if (!cycleResults.length || !cyclePreviewTerm) {
      return;
    }
    const preview = cycleResults.find((item) => String(item.term_number) === cyclePreviewTerm);
    if (!preview) {
      return;
    }
    setResults(preview.generation);
    const firstRank = preview.generation.alternatives[0]?.rank ?? 1;
    setActiveTab(`alt-${firstRank}`);
  }, [cyclePreviewTerm, cycleResults]);

  useEffect(() => {
    if (!results?.alternatives.length) {
      return;
    }
    if (results.alternatives.some((alternative) => `alt-${alternative.rank}` === activeTab)) {
      return;
    }
    setActiveTab(`alt-${results.alternatives[0].rank}`);
  }, [activeTab, results]);

  const moveCycleSolution = (delta: number) => {
    if (!cycleParetoFront.length) return;
    const currentIndex = cycleParetoFront.findIndex((item) => String(item.rank) === cycleSolutionRank);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + delta + cycleParetoFront.length) % cycleParetoFront.length;
    const nextSolution = cycleParetoFront[nextIndex];
    setCycleSolutionRank(String(nextSolution.rank));
  };

  useEffect(() => {
    if (!cycleParetoFront.length) {
      return;
    }
    if (!cycleParetoFront.some((item) => String(item.rank) === cycleSolutionRank)) {
      setCycleSolutionRank(String(cycleParetoFront[0].rank));
    }
  }, [cycleParetoFront, cycleSolutionRank]);

  useEffect(() => {
    if (!exportPayload) {
      setExportDay("");
      setExportSection("");
      setExportFacultyId("");
      return;
    }
    if (!exportDays.includes(exportDay)) {
      setExportDay(exportDays[0] ?? "");
    }
    if (!exportSections.includes(exportSection)) {
      setExportSection(exportSections[0] ?? "");
    }
    if (!exportFacultyOptions.some((item) => item.id === exportFacultyId)) {
      setExportFacultyId(exportFacultyOptions[0]?.id ?? "");
    }
  }, [exportDay, exportDays, exportFacultyId, exportFacultyOptions, exportPayload, exportSection, exportSections]);

  useEffect(() => {
    if (exportScope !== "day") {
      return;
    }
    if (!exportDay && exportDays.length) {
      setExportDay(exportDays[0]);
    }
  }, [exportDay, exportDays, exportScope]);

  useEffect(() => {
    if (exportScope !== "section") {
      return;
    }
    if (!exportSection && exportSections.length) {
      setExportSection(exportSections[0]);
    }
  }, [exportScope, exportSection, exportSections]);

  useEffect(() => {
    if (exportScope !== "faculty") {
      return;
    }
    if (!exportFacultyId && exportFacultyOptions.length) {
      setExportFacultyId(exportFacultyOptions[0].id);
    }
  }, [exportFacultyId, exportFacultyOptions, exportScope]);

  const handleSaveDefaults = async () => {
    if (!settings) return;
    setError(null);
    setSuccess(null);
    setIsSavingDefaults(true);
    try {
      const saved = await updateGenerationSettings({
        solver_strategy: settings.solver_strategy,
        population_size: settings.population_size,
        generations: settings.generations,
        mutation_rate: settings.mutation_rate,
        crossover_rate: settings.crossover_rate,
        elite_count: settings.elite_count,
        tournament_size: settings.tournament_size,
        stagnation_limit: settings.stagnation_limit,
        annealing_iterations: settings.annealing_iterations,
        annealing_initial_temperature: settings.annealing_initial_temperature,
        annealing_cooling_rate: settings.annealing_cooling_rate,
        random_seed: settings.random_seed ?? null,
        objective_weights: settings.objective_weights,
      });
      setSettings(saved);
      setSuccess("Default generator settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save generator settings");
    } finally {
      setIsSavingDefaults(false);
    }
  };

  const termSections = useMemo(
    () => sections.filter((item) => item.term_number === selectedTermNumber).sort((a, b) => a.name.localeCompare(b.name)),
    [sections, selectedTermNumber],
  );

  const termProgramCourses = useMemo(
    () => programCourses.filter((item) => item.term_number === selectedTermNumber),
    [programCourses, selectedTermNumber],
  );

  const courseById = useMemo(() => {
    return new Map(courses.map((item) => [item.id, item]));
  }, [courses]);

  const activeCycleComplianceSummary = useMemo(() => {
    if (!activeCycleTermEntry) {
      return null;
    }
    return buildConstraintComplianceSummary({
      payload: activeCycleTermEntry.payload,
      hardConflicts: activeCycleTermEntry.hard_conflicts,
      programTerms,
      configuredSectionCount: sections.filter((item) => item.term_number === activeCycleTermEntry.term_number).length,
    });
  }, [activeCycleTermEntry, programTerms, sections]);

  const alternativeComplianceSummaryByRank = useMemo(() => {
    const summaryMap = new Map<number, ConstraintComplianceSummary>();
    if (!results?.alternatives.length) {
      return summaryMap;
    }
    for (const alternative of results.alternatives) {
      const termNumber = alternative.payload.termNumber ?? selectedTermNumber;
      summaryMap.set(
        alternative.rank,
        buildConstraintComplianceSummary({
          payload: alternative.payload,
          hardConflicts: alternative.hard_conflicts,
          programTerms,
          configuredSectionCount: sections.filter((item) => item.term_number === termNumber).length,
        }),
      );
    }
    return summaryMap;
  }, [programTerms, results, sections, selectedTermNumber]);

  const loadLocks = async () => {
    if (!selectedProgramId) {
      setSlotLocks([]);
      return;
    }
    setLockLoading(true);
    try {
      const data = await listSlotLocks(selectedProgramId, selectedTermNumber);
      setSlotLocks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load slot locks");
    } finally {
      setLockLoading(false);
    }
  };

  const loadReevaluation = async () => {
    if (!selectedProgramId) {
      setReevaluationEvents([]);
      return;
    }
    setReevaluationLoading(true);
    try {
      const data = await listReevaluationEvents({
        program_id: selectedProgramId,
        term_number: selectedTermNumber,
        status: "pending",
      });
      setReevaluationEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load reevaluation events");
    } finally {
      setReevaluationLoading(false);
    }
  };

  const handleCreateLock = async () => {
    if (!selectedProgramId || !lockSection || !lockCourseId) {
      setError("Program, section, and course are required to create a lock.");
      return;
    }
    setError(null);
    setIsSavingLock(true);
    try {
      const created = await createSlotLock({
        program_id: selectedProgramId,
        term_number: selectedTermNumber,
        day: lockDay,
        start_time: lockStart,
        end_time: lockEnd,
        section_name: lockSection,
        course_id: lockCourseId,
        batch: lockBatch.trim() || null,
        room_id: null,
        faculty_id: null,
        notes: lockNotes.trim() || null,
        is_active: true,
      });
      setSlotLocks((prev) => [created, ...prev]);
      setLockBatch("");
      setLockNotes("");
      setSuccess("Slot lock created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create slot lock");
    } finally {
      setIsSavingLock(false);
    }
  };

  const handleDeleteLock = async (lockId: string) => {
    setError(null);
    try {
      await deleteSlotLock(lockId);
      setSlotLocks((prev) => prev.filter((item) => item.id !== lockId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete slot lock");
    }
  };

  const handleRunReevaluation = async () => {
    if (!settings || !selectedProgramId) {
      setError("Program and generator settings are required.");
      return;
    }
    appendTerminalLine("info", `Selective re-evaluation requested for term ${selectedTermNumber}.`);
    setError(null);
    setSuccess(null);
    setIsRunningReevaluation(true);
    try {
      const clampedAlternativeCount = Math.max(1, Math.min(5, Math.trunc(alternativeCount) || 3));
      setAlternativeCount(clampedAlternativeCount);
      const response = await runCurriculumReevaluation({
        program_id: selectedProgramId,
        term_number: selectedTermNumber,
        alternative_count: clampedAlternativeCount,
        persist_official: publishOnSuccess,
        mark_resolved: true,
        settings_override: {
          solver_strategy: settings.solver_strategy,
          population_size: settings.population_size,
          generations: settings.generations,
          mutation_rate: settings.mutation_rate,
          crossover_rate: settings.crossover_rate,
          elite_count: settings.elite_count,
          tournament_size: settings.tournament_size,
          stagnation_limit: settings.stagnation_limit,
          annealing_iterations: settings.annealing_iterations,
          annealing_initial_temperature: settings.annealing_initial_temperature,
          annealing_cooling_rate: settings.annealing_cooling_rate,
          random_seed: settings.random_seed ?? null,
          objective_weights: settings.objective_weights,
        },
      });
      setResults(response.generation);
      const firstRank = response.generation.alternatives[0]?.rank ?? 1;
      setActiveTab(`alt-${firstRank}`);
      setReevaluationEvents([]);
      setSuccess(
        `Curriculum re-evaluation completed. Resolved ${response.resolved_events} change event(s), ${response.pending_events} pending.`,
      );
      appendTerminalLine(
        "success",
        `Re-evaluation complete. Resolved ${response.resolved_events} events, pending ${response.pending_events}.`,
      );
      await loadReevaluation();
    } catch (err) {
      const message = toUiErrorMessage(err);
      appendTerminalLine("error", `Re-evaluation failed: ${message}`);
      setError(message);
    } finally {
      setIsRunningReevaluation(false);
    }
  };

  const publishSelection = useMemo(() => {
    if (generationCycle !== "single" && activeCycleSolution && activeCycleTermEntry) {
      return {
        payload: activeCycleTermEntry.payload,
        hardConflicts: activeCycleTermEntry.hard_conflicts,
        label: `Cycle solution #${activeCycleSolution.rank}, semester ${activeCycleTermEntry.term_number}, alternative #${activeCycleTermEntry.alternative_rank}`,
      };
    }
    if (activeAlternative) {
      return {
        payload: activeAlternative.payload,
        hardConflicts: activeAlternative.hard_conflicts,
        label: `Alternative #${activeAlternative.rank}`,
      };
    }
    return null;
  }, [activeAlternative, activeCycleSolution, activeCycleTermEntry, generationCycle]);

  const handlePublishSelected = async (force = false) => {
    if (!publishSelection) {
      setError("No generated alternative available to publish.");
      return;
    }
    if (!force && publishSelection.hardConflicts > 0) {
      setIsPublishConfirmOpen(true);
      return;
    }
    setError(null);
    setSuccess(null);
    setIsPublishingOfficial(true);
    appendTerminalLine(
      "info",
      `Publishing selected timetable: ${publishSelection.label}${force ? " (forced with conflicts)." : "."}`,
    );
    try {
      await publishOfficialTimetable(publishSelection.payload, undefined, force);
      setSuccess(`Published ${publishSelection.label} as the official timetable.`);
      appendTerminalLine("success", `Published successfully: ${publishSelection.label}.`);
    } catch (err) {
      const message = toUiErrorMessage(err);
      setError(message);
      appendTerminalLine("error", `Publish failed: ${message}`);
    } finally {
      setIsPublishingOfficial(false);
      setIsPublishConfirmOpen(false);
    }
  };

  if (!canGenerate) {
    return (
      <Card className="card-modern">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <AlertCircle className="h-12 w-12 mb-4 opacity-20" />
          <h3 className="text-lg font-semibold">Restricted Access</h3>
          <p>Only administrators and schedulers can run timetable generation.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <AlertDialog open={isPublishConfirmOpen} onOpenChange={setIsPublishConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Publish With Hard Conflicts?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  The selected alternative still has <strong>{publishSelection?.hardConflicts ?? 0}</strong> hard
                  conflict(s).
                </p>
                <p>
                  Continue only if you intentionally want to publish this version and resolve remaining issues from the
                  Conflict Dashboard.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPublishingOfficial}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-warning hover:bg-warning/90 text-warning-foreground"
              onClick={() => void handlePublishSelected(true)}
              disabled={isPublishingOfficial}
            >
              {isPublishingOfficial ? "Publishing..." : "Publish Anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Timetable Generator</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Evolutionary scheduling with conflict-aware optimization and ranked alternatives.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={generationCycle} onValueChange={(value) => setGenerationCycle(value as "single" | GenerationCycle)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue/>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Single Semester</SelectItem>
              <SelectItem value="odd">Odd Cycle (1,3,5,7)</SelectItem>
              <SelectItem value="even">Even Cycle (2,4,6,8)</SelectItem>
              <SelectItem value="all">All Terms</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch checked={publishOnSuccess} onCheckedChange={setPublishOnSuccess} />
            <Label>Publish best result</Label>
          </div>
          <p className="hidden text-xs text-muted-foreground lg:block">
            Alternatives: {Math.max(1, Math.min(5, Math.trunc(alternativeCount) || 3))}
          </p>
          <Button
            variant="outline"
            onClick={() => void handlePublishSelected()}
            disabled={isGenerating || isPublishingOfficial || !publishSelection}
          >
            {isPublishingOfficial ? "Publishing..." : "Publish Selected"}
          </Button>
          <Button onClick={handleGenerate} disabled={isLoading || isGenerating || !selectedProgramId}>
            {isGenerating ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Generating...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                Run Evolution
              </span>
            )}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
      {isGenerating ? (
        <p className="text-sm text-muted-foreground">
          Algorithm running for {formatElapsed(generationElapsedSeconds)}. Keep this page open until alternatives are returned.
        </p>
      ) : null}

      {selectedProgramId ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Curriculum Change Impact</CardTitle>
            <CardDescription>
              {reevaluationEvents.length
                ? `${reevaluationEvents.length} pending curriculum change event(s) for this scope.`
                : "No pending curriculum change events for this scope."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {reevaluationEvents.length ? (
              <div className="space-y-2">
                {reevaluationEvents.slice(0, 5).map((event) => (
                  <div key={event.id} className="rounded-md border p-2 text-xs">
                    <p className="font-medium">{event.description}</p>
                    <p className="text-muted-foreground">
                      {event.change_type} • {event.entity_type}
                      {event.has_official_impact ? " • impacts official timetable" : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Re-evaluation not required right now.</p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void loadReevaluation()}
                disabled={reevaluationLoading || !selectedProgramId}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${reevaluationLoading ? "animate-spin" : ""}`} />
                Refresh Impacts
              </Button>
              <Button
                onClick={() => void handleRunReevaluation()}
                disabled={isRunningReevaluation || !reevaluationEvents.length}
              >
                {isRunningReevaluation ? "Re-evaluating..." : "Run Selective Re-evaluation"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Generation Scope</CardTitle>
              <CardDescription>Select the academic target to generate.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Program</Label>
                <Select value={selectedProgramId} onValueChange={setSelectedProgramId} disabled={!programs.length}>
                  <SelectTrigger>
                    <SelectValue/>
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
              <div className="space-y-2">
                <Label>Semester</Label>
                <Select
                  value={selectedTerm}
                  onValueChange={setSelectedTerm}
                  disabled={generationCycle !== "single"}
                >
                  <SelectTrigger>
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent>
                    {TERM_OPTIONS.map((term) => (
                      <SelectItem key={term} value={term}>
                        Semester {term}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {generationCycle !== "single" ? (
                  <p className="text-xs text-muted-foreground">
                    Semester selector is disabled for cycle generation mode.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Alternative Count</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={alternativeCount}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isFinite(value)) return;
                    const clamped = Math.max(1, Math.min(5, Math.trunc(value)));
                    setAlternativeCount(clamped);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Number of ranked alternatives to generate (1 to 5). Default is 3.
                </p>
              </div>
              {generationCycle !== "single" ? (
                <div className="space-y-2">
                  <Label>Pareto Front Size</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={cycleParetoLimit}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isFinite(value)) return;
                      const clamped = Math.max(1, Math.min(30, Math.trunc(value)));
                      setCycleParetoLimit(clamped);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum number of non-dominated cycle alternatives to keep.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Finalized Slot Locks</CardTitle>
              <CardDescription>Pin critical classes before running evolution.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Day</Label>
                  <Select value={lockDay} onValueChange={setLockDay}>
                    <SelectTrigger>
                      <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_ORDER.map((day) => (
                        <SelectItem key={day} value={day}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Section</Label>
                  <Select value={lockSection} onValueChange={setLockSection} disabled={!termSections.length}>
                    <SelectTrigger>
                      <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                      {termSections.map((section) => (
                        <SelectItem key={section.id} value={section.name}>
                          {section.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Start</Label>
                  <Input type="time" value={lockStart} onChange={(event) => setLockStart(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>End</Label>
                  <Input type="time" value={lockEnd} onChange={(event) => setLockEnd(event.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Course</Label>
                <Select value={lockCourseId} onValueChange={setLockCourseId} disabled={!termProgramCourses.length}>
                  <SelectTrigger>
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent>
                    {termProgramCourses.map((item) => (
                      <SelectItem key={item.id} value={item.course_id}>
                        {courseById.get(item.course_id)?.code ?? item.course_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Batch (optional)</Label>
                  <Input value={lockBatch} onChange={(event) => setLockBatch(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Note (optional)</Label>
                  <Input value={lockNotes} onChange={(event) => setLockNotes(event.target.value)} />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void loadLocks()} disabled={lockLoading || !selectedProgramId}>
                  {lockLoading ? "Loading..." : "Reload Locks"}
                </Button>
                <Button onClick={() => void handleCreateLock()} disabled={isSavingLock || !selectedProgramId}>
                  {isSavingLock ? "Saving..." : "Add Lock"}
                </Button>
              </div>

              <div className="space-y-2">
                {slotLocks.map((lock) => (
                  <div key={lock.id} className="border rounded-md p-2 flex items-center justify-between gap-2">
                    <div className="text-xs">
                      <p className="font-medium">
                        {lock.day} {lock.start_time}-{lock.end_time}
                      </p>
                      <p className="text-muted-foreground">
                        Section {lock.section_name} • {courseById.get(lock.course_id)?.code ?? lock.course_id}
                        {lock.batch ? ` • ${lock.batch}` : ""}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => void handleDeleteLock(lock.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {!slotLocks.length ? <p className="text-xs text-muted-foreground">No locks configured for this term.</p> : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Optimization Parameters</CardTitle>
              <CardDescription>Choose the solver strategy and tune search behavior.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Solver Strategy</Label>
                <Select
                  value={settings?.solver_strategy ?? "auto"}
                  onValueChange={(value) => setSolverStrategy(value as GenerationSolverStrategy)}
                  disabled={!settings}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (Hybrid + Annealing + GA fallback)</SelectItem>
                    <SelectItem value="hybrid">Hybrid Fast Search</SelectItem>
                    <SelectItem value="simulated_annealing">Simulated Annealing</SelectItem>
                    <SelectItem value="genetic">Classic Genetic Algorithm</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  `Auto` is recommended for production: quick hybrid search first, then annealing/GA fallback if needed.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Population Size</Label>
                  <span className="text-xs text-muted-foreground">{settings?.population_size ?? "-"}</span>
                </div>
                <Slider
                  value={[settings?.population_size ?? 120]}
                  onValueChange={(value) => setNumeric("population_size", value[0] ?? 120)}
                  min={20}
                  max={500}
                  step={10}
                  disabled={!settings}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Generations</Label>
                  <span className="text-xs text-muted-foreground">{settings?.generations ?? "-"}</span>
                </div>
                <Slider
                  value={[settings?.generations ?? 300]}
                  onValueChange={(value) => setNumeric("generations", value[0] ?? 300)}
                  min={20}
                  max={1000}
                  step={10}
                  disabled={!settings}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Mutation Rate</Label>
                  <Input
                    type="number"
                    min={0.001}
                    max={1}
                    step={0.01}
                    value={settings?.mutation_rate ?? 0.12}
                    onChange={(event) => setFloat("mutation_rate", Number(event.target.value))}
                    disabled={!settings}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Crossover Rate</Label>
                  <Input
                    type="number"
                    min={0.001}
                    max={1}
                    step={0.01}
                    value={settings?.crossover_rate ?? 0.8}
                    onChange={(event) => setFloat("crossover_rate", Number(event.target.value))}
                    disabled={!settings}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Elites</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={settings?.elite_count ?? 8}
                    onChange={(event) => setNumeric("elite_count", Number(event.target.value))}
                    disabled={!settings}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tournament Size</Label>
                  <Input
                    type="number"
                    min={2}
                    max={50}
                    value={settings?.tournament_size ?? 4}
                    onChange={(event) => setNumeric("tournament_size", Number(event.target.value))}
                    disabled={!settings}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Stagnation Limit</Label>
                <Input
                  type="number"
                  min={5}
                  max={1000}
                  value={settings?.stagnation_limit ?? 60}
                  onChange={(event) => setNumeric("stagnation_limit", Number(event.target.value))}
                  disabled={!settings}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Annealing Iterations</Label>
                  <Input
                    type="number"
                    min={100}
                    max={20000}
                    value={settings?.annealing_iterations ?? 900}
                    onChange={(event) => setNumeric("annealing_iterations", Number(event.target.value))}
                    disabled={!settings}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Annealing Start Temp</Label>
                  <Input
                    type="number"
                    min={0.1}
                    max={1000}
                    step={0.1}
                    value={settings?.annealing_initial_temperature ?? 6}
                    onChange={(event) => setFloat("annealing_initial_temperature", Number(event.target.value))}
                    disabled={!settings}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Annealing Cooling Rate</Label>
                  <Input
                    type="number"
                    min={0.8}
                    max={0.99999}
                    step={0.0001}
                    value={settings?.annealing_cooling_rate ?? 0.995}
                    onChange={(event) => setFloat("annealing_cooling_rate", Number(event.target.value))}
                    disabled={!settings}
                  />
                </div>
              </div>

              <Button
                variant="outline"
                onClick={handleSaveDefaults}
                disabled={!settings || isSavingDefaults}
                className="w-full"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSavingDefaults ? "Saving..." : "Save As Default"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle>Generation Output</CardTitle>
            <CardDescription>
              {generationCycle !== "single" && activeCycleSolution
                ? `Cycle solution #${activeCycleSolution.rank} runtime: ${activeCycleSolution.runtime_ms} ms`
                : results
                  ? `Runtime: ${results.runtime_ms} ms • Strategy: ${results.settings_used.solver_strategy}`
                  : "Run the generator to produce ranked timetable alternatives."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="mb-4 rounded-lg border bg-slate-950 p-3 text-xs font-mono text-slate-200">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-100">Algorithm Terminal</p>
                <div className="flex items-center gap-2">
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
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border border-slate-800 bg-slate-900 p-2">
                {terminalLines.length ? (
                  <div className="space-y-1">
                    {terminalLines.map((line) => (
                      <p key={line.id} className={`break-words ${terminalLineTone(line.level)}`}>
                        <span className="text-slate-500">[{line.at}]</span> {line.message}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400">No execution logs yet. Run the generator to stream status updates.</p>
                )}
                <div ref={terminalTailRef} />
              </div>
            </div>

            {exportPayload ? (
              <div className="mb-4 rounded-lg border bg-muted/20 p-3 space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1 min-w-[170px]">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Export Scope</Label>
                    <Select value={exportScope} onValueChange={(value) => setExportScope(value as ExportScope)}>
                      <SelectTrigger>
                        <SelectValue/>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full Timetable</SelectItem>
                        <SelectItem value="day">By Day</SelectItem>
                        <SelectItem value="section">By Section</SelectItem>
                        <SelectItem value="faculty">By Faculty</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {exportScope === "day" ? (
                    <div className="space-y-1 min-w-[170px]">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Day</Label>
                      <Select value={exportDay} onValueChange={setExportDay}>
                        <SelectTrigger>
                          <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                          {exportDays.map((day) => (
                            <SelectItem key={day} value={day}>
                              {day}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {exportScope === "section" ? (
                    <div className="space-y-1 min-w-[170px]">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Section</Label>
                      <Select value={exportSection} onValueChange={setExportSection}>
                        <SelectTrigger>
                          <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                          {exportSections.map((section) => (
                            <SelectItem key={section} value={section}>
                              {section}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {exportScope === "faculty" ? (
                    <div className="space-y-1 min-w-[220px]">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Faculty</Label>
                      <Select value={exportFacultyId} onValueChange={setExportFacultyId}>
                        <SelectTrigger>
                          <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                          {exportFacultyOptions.map((faculty) => (
                            <SelectItem key={faculty.id} value={faculty.id}>
                              {faculty.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="space-y-1 min-w-[140px]">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Format</Label>
                    <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as ExportFormat)}>
                      <SelectTrigger>
                        <SelectValue/>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="csv">CSV</SelectItem>
                        <SelectItem value="ics">ICS</SelectItem>
                        <SelectItem value="json">JSON</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleExportGenerated}
                    disabled={!scopedExportSlots.length}
                  >
                    Export
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Selected {scopedExportSlots.length} of {exportPayload.timetableData.length} slots for export.
                </p>
              </div>
            ) : null}
            {generationCycle !== "single" && cycleParetoFront.length ? (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="icon" onClick={() => moveCycleSolution(-1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" onClick={() => moveCycleSolution(1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <div className="space-y-1 min-w-[220px]">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Pareto Solution</Label>
                      <Select value={cycleSolutionRank} onValueChange={setCycleSolutionRank}>
                        <SelectTrigger>
                          <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                          {cycleParetoFront.map((solution) => (
                            <SelectItem key={solution.rank} value={String(solution.rank)}>
                              #{solution.rank} • Resource {solution.resource_penalty} • Preference {solution.faculty_preference_penalty.toFixed(1)} • Workload {(solution.workload_gap_penalty ?? 0).toFixed(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 min-w-[180px]">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Preview Term</Label>
                      <Select value={cyclePreviewTerm} onValueChange={setCyclePreviewTerm}>
                        <SelectTrigger>
                          <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                          {(activeCycleSolution?.terms ?? []).map((term) => (
                            <SelectItem key={term.term_number} value={String(term.term_number)}>
                              Semester {term.term_number}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {cycleParetoFront.map((solution) => (
                      <button
                        key={solution.rank}
                        type="button"
                        onClick={() => setCycleSolutionRank(String(solution.rank))}
                        className={`rounded-md border px-3 py-2 text-left text-xs transition ${
                          String(solution.rank) === cycleSolutionRank
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background hover:bg-muted/40"
                        }`}
                      >
                        <p className="font-medium">Solution #{solution.rank}</p>
                        <p className="text-muted-foreground">
                          Resource {solution.resource_penalty} • Preference {solution.faculty_preference_penalty.toFixed(1)} • Workload {(solution.workload_gap_penalty ?? 0).toFixed(1)} • Runtime {solution.runtime_ms} ms
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {activeCycleSolution && activeCycleTermEntry ? (
                  <>
                    <div className="p-4 rounded-lg border bg-muted/30 grid grid-cols-2 md:grid-cols-7 gap-3 text-center">
                      <div>
                        <p className="text-lg font-bold tracking-tight">#{activeCycleSolution.rank}</p>
                        <p className="text-xs text-muted-foreground">Solution</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold tracking-tight">{activeCycleTermEntry.term_number}</p>
                        <p className="text-xs text-muted-foreground">Semester</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold tracking-tight">{activeCycleSolution.resource_penalty}</p>
                        <p className="text-xs text-muted-foreground">Resource Objective</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold tracking-tight">{activeCycleSolution.faculty_preference_penalty.toFixed(1)}</p>
                        <p className="text-xs text-muted-foreground">Preference Objective</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold tracking-tight">{(activeCycleSolution.workload_gap_penalty ?? 0).toFixed(1)}</p>
                        <p className="text-xs text-muted-foreground">Workload Gap Objective</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold tracking-tight">{activeCycleTermEntry.fitness.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">Term Fitness</p>
                      </div>
                      <div>
                        <Badge variant={activeCycleTermEntry.hard_conflicts === 0 ? "default" : "outline"}>
                          {activeCycleTermEntry.hard_conflicts === 0 ? "Conflict Free" : "Needs Review"}
                        </Badge>
                      </div>
                    </div>

                    {activeWorkloadGapSuggestions.length ? (
                      <div className="mb-4 rounded-lg border bg-muted/20 p-3">
                        <p className="text-sm font-medium">Faculty Workload Bridge Suggestions</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Suggestions prioritize preferred subjects and conflict-free reallocations across sections and semesters.
                        </p>
                        <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                          {activeWorkloadGapSuggestions.slice(0, 5).map((item) => (
                            <div key={item.faculty_id} className="rounded-md border bg-background p-2 text-xs">
                              <p className="font-medium">
                                {item.faculty_name} • Gap {item.gap_hours.toFixed(1)}h (Assigned {item.assigned_hours.toFixed(1)}h / Target {item.target_hours.toFixed(1)}h)
                              </p>
                              {item.suggested_bridges.length ? (
                                <p className="text-muted-foreground mt-1">
                                  {item.suggested_bridges.slice(0, 3).map((bridge) => (
                                    `${bridge.course_code} ${bridge.section_name}${bridge.batch ? `-${bridge.batch}` : ""} (${bridge.weekly_hours.toFixed(1)}h${bridge.term_number ? `, S${bridge.term_number}` : ""}${bridge.feasible_without_conflict ? "" : ", overlap"})`
                                  )).join(" | ")}
                                </p>
                              ) : (
                                <p className="text-destructive mt-1">No conflict-free bridge currently available for this faculty.</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {activeCycleComplianceSummary ? (
                      <ConstraintCompliancePanel summary={activeCycleComplianceSummary} />
                    ) : null}

                    <OccupancyMatrixPanel matrix={activeCycleTermEntry.occupancy_matrix ?? null} />

                    <div className="overflow-x-auto">
                      <div className="min-w-[800px]">
                        <div className={`grid gap-1`} style={{ gridTemplateColumns: `80px repeat(${displayDays.length}, minmax(0, 1fr))` }}>
                          <div className="p-2" />
                          {displayDays.map((day) => (
                            <div key={day} className="p-2 text-center font-medium text-xs bg-muted rounded">
                              {day}
                            </div>
                          ))}

                          {displayTimes.map((time) => (
                            <div key={`row-${time}`} className="contents">
                              <div className="p-1.5 text-xs text-muted-foreground text-right">{time}</div>
                              {displayDays.map((day) => {
                                const slot = activeCycleTermEntry.payload.timetableData.find(
                                  (item) => item.day === day && item.startTime === time,
                                );
                                if (!slot) {
                                  return (
                                    <div key={`${day}-${time}`} className="p-1.5 rounded bg-muted/10 border border-transparent" />
                                  );
                                }
                                const course = activeCycleTermEntry.payload.courseData.find((item) => item.id === slot.courseId);
                                const room = activeCycleTermEntry.payload.roomData.find((item) => item.id === slot.roomId);
                                const faculty = activeCycleTermEntry.payload.facultyData.find((item) => item.id === slot.facultyId);
                                const sessionType = resolveSessionType(slot, course);
                                return (
                                  <div key={`${day}-${time}`} className={`p-1.5 rounded border text-xs ${getCourseColor(course?.type ?? "", sessionType)}`}>
                                    <p className="font-semibold truncate text-[11px]">
                                      {course?.code}
                                      {sessionType === "tutorial" ? " (Tutorial)" : ""}
                                    </p>
                                    <p className="truncate text-[10px] opacity-80">{room?.name}</p>
                                    <p className="truncate text-[10px] opacity-70">{faculty?.name}</p>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-full rounded-lg border border-dashed flex items-center justify-center text-sm text-muted-foreground">
                    No cycle preview available.
                  </div>
                )}
              </div>
            ) : !results ? (
              <div className="h-full rounded-lg border border-dashed flex items-center justify-center text-sm text-muted-foreground">
                No generated alternatives yet.
              </div>
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                <TabsList className="mb-4 w-full justify-start">
                  {results.alternatives.map((alternative) => (
                    <TabsTrigger key={alternative.rank} value={`alt-${alternative.rank}`} className="flex items-center gap-2">
                      Alt {alternative.rank}
                      {alternative.hard_conflicts === 0 ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {results.alternatives.map((alternative) => {
                  const payload = alternative.payload;
                  const courseById = new Map(payload.courseData.map((item) => [item.id, item]));
                  const roomById = new Map(payload.roomData.map((item) => [item.id, item]));
                  const facultyById = new Map(payload.facultyData.map((item) => [item.id, item]));

                  return (
                    <TabsContent key={alternative.rank} value={`alt-${alternative.rank}`} className="mt-0 flex-1 flex flex-col">
                      <div className="mb-4 p-4 rounded-lg border bg-muted/30 grid grid-cols-4 gap-4 text-center">
                        <div>
                          <p className="text-xl font-bold tracking-tight">{alternative.fitness.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">Fitness</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold tracking-tight">{alternative.hard_conflicts}</p>
                          <p className="text-xs text-muted-foreground">Hard Conflicts</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold tracking-tight">{alternative.soft_penalty.toFixed(1)}</p>
                          <p className="text-xs text-muted-foreground">Soft Penalty</p>
                        </div>
                        <div>
                          <Badge variant={alternative.hard_conflicts === 0 ? "default" : "outline"}>
                            {alternative.hard_conflicts === 0 ? "Publishable" : "Needs Review"}
                          </Badge>
                        </div>
                      </div>

                      {(alternative.workload_gap_suggestions?.length ?? 0) > 0 ? (
                        <div className="mb-4 rounded-lg border bg-muted/20 p-3">
                          <p className="text-sm font-medium">Faculty Workload Bridge Suggestions</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Suggested reallocations to close workload gaps while keeping the timetable conflict-aware.
                          </p>
                          <div className="mt-2 space-y-2 max-h-56 overflow-y-auto">
                            {(alternative.workload_gap_suggestions ?? []).slice(0, 5).map((item) => (
                              <div key={item.faculty_id} className="rounded-md border bg-background p-2 text-xs">
                                <p className="font-medium">
                                  {item.faculty_name} • Gap {item.gap_hours.toFixed(1)}h (Assigned {item.assigned_hours.toFixed(1)}h / Target {item.target_hours.toFixed(1)}h)
                                </p>
                                {item.suggested_bridges.length ? (
                                  <p className="text-muted-foreground mt-1">
                                    {item.suggested_bridges.slice(0, 3).map((bridge) => (
                                      `${bridge.course_code} ${bridge.section_name}${bridge.batch ? `-${bridge.batch}` : ""} (${bridge.weekly_hours.toFixed(1)}h${bridge.term_number ? `, S${bridge.term_number}` : ""}${bridge.feasible_without_conflict ? "" : ", overlap"})`
                                    )).join(" | ")}
                                  </p>
                                ) : (
                                  <p className="text-destructive mt-1">No conflict-free bridge currently available for this faculty.</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {alternativeComplianceSummaryByRank.get(alternative.rank) ? (
                        <ConstraintCompliancePanel summary={alternativeComplianceSummaryByRank.get(alternative.rank)!} />
                      ) : null}

                      <OccupancyMatrixPanel matrix={alternative.occupancy_matrix ?? null} />

                      <div className="overflow-x-auto flex-1">
                        <div className="min-w-[800px]">
                          <div className={`grid gap-1`} style={{ gridTemplateColumns: `80px repeat(${displayDays.length}, minmax(0, 1fr))` }}>
                            <div className="p-2" />
                            {displayDays.map((day) => (
                              <div key={day} className="p-2 text-center font-medium text-xs bg-muted rounded">
                                {day}
                              </div>
                            ))}

                            {displayTimes.map((time) => (
                              <div key={`row-${time}`} className="contents">
                                <div className="p-1.5 text-xs text-muted-foreground text-right">{time}</div>
                                {displayDays.map((day) => {
                                  const slot = payload.timetableData.find((item) => item.day === day && item.startTime === time);
                                  if (!slot) {
                                    return (
                                      <div key={`${day}-${time}`} className="p-1.5 rounded bg-muted/10 border border-transparent" />
                                    );
                                  }
                                  const course = courseById.get(slot.courseId);
                                  const room = roomById.get(slot.roomId);
                                  const faculty = facultyById.get(slot.facultyId);
                                  const sessionType = resolveSessionType(slot, course);
                                  return (
                                    <div key={`${day}-${time}`} className={`p-1.5 rounded border text-xs ${getCourseColor(course?.type ?? "", sessionType)}`}>
                                      <p className="font-semibold truncate text-[11px]">
                                        {course?.code}
                                        {sessionType === "tutorial" ? " (Tutorial)" : ""}
                                      </p>
                                      <p className="truncate text-[10px] opacity-80">{room?.name}</p>
                                      <p className="truncate text-[10px] opacity-70">{faculty?.name}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </>
  );
}
