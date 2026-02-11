"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Send,
  Upload,
} from "lucide-react";

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
import {
  listProgramSections,
  listProgramTerms,
  listPrograms,
  type Program,
  type ProgramSection,
  type ProgramTerm,
} from "@/lib/academic-api";
import {
  type GenerateTimetableCycleResponse,
  type GenerateTimetableResponse,
  type GeneratedAlternative,
  type GeneratedCycleSolution,
  type GenerationCycle,
} from "@/lib/generator-api";
import {
  DEFAULT_SCHEDULE_POLICY,
  DEFAULT_WORKING_HOURS,
  fetchSchedulePolicy,
  fetchWorkingHours,
  type SchedulePolicyUpdate,
  type WorkingHoursEntry,
} from "@/lib/settings-api";
import { generateICSContent } from "@/lib/ics";
import { buildTemplateDays, buildTemplateTimeSlots, parseTimeToMinutes, sortTimes } from "@/lib/schedule-template";
import { downloadTimetableCsv } from "@/lib/timetable-csv";
import { downloadTimetableExcel, type TimetableExcelRow } from "@/lib/timetable-excel";
import {
  // decideTimetableConflict,
  fetchOfficialFacultyMappings,
  fetchTimetableConflicts,
  publishOfflineTimetable,
  publishOfflineTimetableAll,
  publishOfficialTimetable,
  type FacultyCourseSectionMapping,
} from "@/lib/timetable-api";
import { AlternativesViewer } from "@/components/alternatives/alternatives-viewer";
import type { Conflict, Course, Faculty, Room, TimeSlot } from "@/lib/timetable-types";
import { useOfficialTimetable } from "@/hooks/use-official-timetable";
import {
  buildCycleTermDraftSnapshot,
  buildSingleDraftSnapshot,
  clearGeneratedDraft,
  loadGeneratedDraft,
  saveGeneratedDraft,
  type GeneratedDraftSnapshot,
} from "@/lib/generated-draft-store";
import { loadGeneratedResults } from "@/lib/generated-results-store";

const ALL = "all";
const TERM_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const DAY_SEQUENCE = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_ORDER = new Map(DAY_SEQUENCE.map((day, index) => [day, index]));

type ExportFormat = "pdf" | "excel" | "png" | "csv" | "ics" | "json";
type ScheduleGenerationMode = "single" | GenerationCycle;

interface Filters {
  department: string;
  programId: string;
  semester: string;
  section: string;
  roomId: string;
  facultyId: string;
}

interface ResolvedSlot {
  slot: TimeSlot;
  course: Course | undefined;
  room: Room | undefined;
  faculty: Faculty | undefined;
}

interface FilterParams {
  slots: TimeSlot[];
  filters: Filters;
  payloadProgramId?: string;
  payloadTermNumber?: number;
  fallbackDepartment?: string;
  facultyById: Map<string, Faculty>;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function toTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function daySort(left: string, right: string): number {
  const leftIndex = DAY_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = DAY_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER;
  if (leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }
  return left.localeCompare(right);
}

function sectionSort(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function slotSort(left: TimeSlot, right: TimeSlot): number {
  const dayCompare = daySort(left.day, right.day);
  if (dayCompare !== 0) {
    return dayCompare;
  }
  const timeCompare = parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime);
  if (timeCompare !== 0) {
    return timeCompare;
  }
  const sectionCompare = sectionSort(left.section, right.section);
  if (sectionCompare !== 0) {
    return sectionCompare;
  }
  return (left.batch ?? "").localeCompare(right.batch ?? "", undefined, { numeric: true, sensitivity: "base" });
}

function applyFilters(params: FilterParams): TimeSlot[] {
  const {
    slots,
    filters,
    payloadProgramId,
    payloadTermNumber,
    fallbackDepartment,
    facultyById,
  } = params;

  if (filters.programId !== ALL && payloadProgramId && filters.programId !== payloadProgramId) {
    return [];
  }

  if (filters.semester !== ALL && payloadTermNumber !== undefined && Number(filters.semester) !== payloadTermNumber) {
    return [];
  }

  const expectedSection = normalize(filters.section === ALL ? "" : filters.section);
  const expectedRoom = filters.roomId === ALL ? "" : filters.roomId;
  const expectedFaculty = filters.facultyId === ALL ? "" : filters.facultyId;
  const expectedDepartment = normalize(filters.department === ALL ? "" : filters.department);
  const fallbackDepartmentNormalized = normalize(fallbackDepartment);

  return slots
    .filter((slot) => {
      if (expectedSection && normalize(slot.section) !== expectedSection) {
        return false;
      }
      if (expectedRoom && slot.roomId !== expectedRoom) {
        return false;
      }
      if (expectedFaculty && slot.facultyId !== expectedFaculty) {
        return false;
      }
      if (expectedDepartment) {
        const slotFacultyDepartment = normalize(facultyById.get(slot.facultyId)?.department);
        if (slotFacultyDepartment) {
          return slotFacultyDepartment === expectedDepartment;
        }
        return fallbackDepartmentNormalized === expectedDepartment;
      }
      return true;
    })
    .sort(slotSort);
}

function resolveSlotSessionType(
  slot: TimeSlot,
  course: Course | undefined,
): "theory" | "tutorial" | "lab" {
  if (slot.sessionType) {
    return slot.sessionType;
  }
  return course?.type === "lab" ? "lab" : "theory";
}

function getCourseCardClass(type: Course["type"] | undefined, sessionType: "theory" | "tutorial" | "lab"): string {
  if (sessionType === "tutorial") {
    return "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200";
  }
  if (type === "lab") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200";
  }
  if (type === "elective") {
    return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
  }
  return "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200";
}

function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function buildFileName(filters: Filters): string {
  const parts = ["timetable"];
  if (filters.semester !== ALL) {
    parts.push(`sem-${filters.semester}`);
  }
  if (filters.section !== ALL) {
    parts.push(`section-${sanitizeFileName(filters.section)}`);
  }
  if (filters.roomId !== ALL) {
    parts.push(`room-${sanitizeFileName(filters.roomId)}`);
  }
  if (filters.facultyId !== ALL) {
    parts.push(`faculty-${sanitizeFileName(filters.facultyId)}`);
  }
  if (filters.department !== ALL) {
    parts.push(`dept-${sanitizeFileName(filters.department)}`);
  }
  return parts.join("_");
}

async function exportElementToPng(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
  });
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${filename}.png`;
  link.click();
}

async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
  });

  const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const printableWidth = pageWidth - margin * 2;
  const printableHeight = pageHeight - margin * 2;

  const imageData = canvas.toDataURL("image/png");
  const imageWidth = printableWidth;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;

  let renderedHeight = 0;
  pdf.addImage(imageData, "PNG", margin, margin, imageWidth, imageHeight, undefined, "FAST");
  renderedHeight += printableHeight;

  while (renderedHeight < imageHeight) {
    pdf.addPage();
    const offsetY = margin - renderedHeight;
    pdf.addImage(imageData, "PNG", margin, offsetY, imageWidth, imageHeight, undefined, "FAST");
    renderedHeight += printableHeight;
  }

  pdf.save(`${filename}.pdf`);
}

function downloadBlob(contents: BlobPart, mimeType: string, filenameWithExtension: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filenameWithExtension;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildExcelRows(slots: ResolvedSlot[], semester: string): TimetableExcelRow[] {
  return slots.map((item) => ({
    day: item.slot.day,
    start_time: item.slot.startTime,
    end_time: item.slot.endTime,
    semester,
    section: item.slot.section,
    batch: item.slot.batch ?? "",
    course_code: item.course?.code ?? item.slot.courseId,
    course_name: item.course?.name ?? "",
    course_type:
      resolveSlotSessionType(item.slot, item.course) === "tutorial"
        ? "tutorial"
        : item.course?.type ?? resolveSlotSessionType(item.slot, item.course),
    faculty_name: item.faculty?.name ?? item.slot.facultyId,
    faculty_department: item.faculty?.department ?? "",
    room_name: item.room?.name ?? item.slot.roomId,
    building: item.room?.building ?? "",
    student_count: item.slot.studentCount ? String(item.slot.studentCount) : "",
  }));
}

export default function SchedulePage() {
  const router = useRouter();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "scheduler";

  const {
    data: officialPayload,
    hasOfficial,
    isLoading: timetableLoading,
    error: timetableError,
    refresh: refreshOfficial,
  } = useOfficialTimetable();

  const [filters, setFilters] = useState<Filters>({
    department: ALL,
    programId: ALL,
    semester: ALL,
    section: ALL,
    roomId: ALL,
    facultyId: ALL,
  });

  const [generationMode, setGenerationMode] = useState<ScheduleGenerationMode>("single");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationSuccess, setGenerationSuccess] = useState<string | null>(null);

  const [singleGeneration, setSingleGeneration] = useState<GenerateTimetableResponse | null>(null);
  const [cycleGeneration, setCycleGeneration] = useState<GenerateTimetableCycleResponse | null>(null);
  const [selectedAlternativeRank, setSelectedAlternativeRank] = useState("1");
  const [selectedCycleRank, setSelectedCycleRank] = useState("");
  const [selectedCycleTerm, setSelectedCycleTerm] = useState("");
  const [persistedDraft, setPersistedDraft] = useState<GeneratedDraftSnapshot | null>(null);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [programTerms, setProgramTerms] = useState<ProgramTerm[]>([]);
  const [programSections, setProgramSections] = useState<ProgramSection[]>([]);
  const [programError, setProgramError] = useState<string | null>(null);

  const [workingHours, setWorkingHours] = useState<WorkingHoursEntry[]>(DEFAULT_WORKING_HOURS);
  const [schedulePolicy, setSchedulePolicy] = useState<SchedulePolicyUpdate>(DEFAULT_SCHEDULE_POLICY);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [conflictsError, setConflictsError] = useState<string | null>(null);
  const [decisionBusyId, setDecisionBusyId] = useState<string | null>(null);
  const [conflictActionMessage, setConflictActionMessage] = useState<string | null>(null);

  const [versionLabel, setVersionLabel] = useState("");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);
  const [isPublishingOffline, setIsPublishingOffline] = useState(false);
  const [isPublishingOfflineAll, setIsPublishingOfflineAll] = useState(false);
  const [offlinePublishError, setOfflinePublishError] = useState<string | null>(null);
  const [offlinePublishSuccess, setOfflinePublishSuccess] = useState<string | null>(null);

  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [alternativesViewerOpen, setAlternativesViewerOpen] = useState(false);

  const [facultyMappings, setFacultyMappings] = useState<FacultyCourseSectionMapping[]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);

  const exportRef = useRef<HTMLDivElement>(null);

  const programById = useMemo(() => new Map(programs.map((program) => [program.id, program])), [programs]);

  const activeSingleAlternative = useMemo(() => {
    if (!singleGeneration?.alternatives.length) {
      return null;
    }
    const rank = Number(selectedAlternativeRank);
    if (!Number.isFinite(rank)) {
      return singleGeneration.alternatives[0];
    }
    return singleGeneration.alternatives.find((item) => item.rank === rank) ?? singleGeneration.alternatives[0];
  }, [selectedAlternativeRank, singleGeneration]);

  const cyclePareto = useMemo(() => cycleGeneration?.pareto_front ?? [], [cycleGeneration?.pareto_front]);

  const activeCycleSolution = useMemo<GeneratedCycleSolution | null>(() => {
    if (!cyclePareto.length) {
      return null;
    }
    const rank = Number(selectedCycleRank);
    if (!Number.isFinite(rank)) {
      return cyclePareto[0];
    }
    return cyclePareto.find((item) => item.rank === rank) ?? cyclePareto[0];
  }, [cyclePareto, selectedCycleRank]);

  const activeCycleTermEntry = useMemo(() => {
    if (!activeCycleSolution?.terms.length) {
      return null;
    }
    const matched = activeCycleSolution.terms.find((item) => String(item.term_number) === selectedCycleTerm);
    return matched ?? activeCycleSolution.terms[0];
  }, [activeCycleSolution, selectedCycleTerm]);

  const activeGeneratedAlternative = useMemo<GeneratedAlternative | null>(() => {
    if (generationMode === "single") {
      return activeSingleAlternative;
    }
    if (!activeCycleTermEntry) {
      return null;
    }
    return {
      rank: activeCycleTermEntry.alternative_rank,
      fitness: activeCycleTermEntry.fitness,
      hard_conflicts: activeCycleTermEntry.hard_conflicts,
      soft_penalty: activeCycleTermEntry.soft_penalty,
      payload: activeCycleTermEntry.payload,
      workload_gap_suggestions: activeCycleTermEntry.workload_gap_suggestions,
      occupancy_matrix: activeCycleTermEntry.occupancy_matrix,
    };
  }, [activeCycleTermEntry, activeSingleAlternative, generationMode]);

  const activeDraftPayload = activeGeneratedAlternative?.payload ?? persistedDraft?.payload ?? null;
  const activeDraftHardConflicts = activeGeneratedAlternative?.hard_conflicts ?? persistedDraft?.hard_conflicts ?? null;
  const activeDraftLabel = activeGeneratedAlternative
    ? generationMode === "single"
      ? `Alternative ${activeGeneratedAlternative.rank}`
      : `Cycle ${activeCycleSolution?.rank ?? "-"} • Semester ${activeCycleTermEntry?.term_number ?? "-"} • Alt ${activeGeneratedAlternative.rank}`
    : persistedDraft?.label ?? null;

  const showingGenerated = Boolean(activeDraftPayload);
  const displayPayload = activeDraftPayload ?? officialPayload;

  const courseData = displayPayload.courseData;
  const roomData = displayPayload.roomData;
  const facultyData = displayPayload.facultyData;
  const timetableData = displayPayload.timetableData;

  const courseById = useMemo(() => new Map(courseData.map((course) => [course.id, course])), [courseData]);
  const roomById = useMemo(() => new Map(roomData.map((room) => [room.id, room])), [roomData]);
  const facultyById = useMemo(() => new Map(facultyData.map((faculty) => [faculty.id, faculty])), [facultyData]);

  const activeProgram = filters.programId !== ALL ? programById.get(filters.programId) : undefined;
  const fallbackProgramDepartment = activeProgram?.department ?? programById.get(displayPayload.programId ?? "")?.department;

  const unresolvedConflictCount = conflicts.length;
  // const resolvedConflictCount = 0; // Deprecated
  const unresolvedConflicts = conflicts;
  const unresolvedConflictPreview = useMemo(() => unresolvedConflicts.slice(0, 4), [unresolvedConflicts]);

  const loadGeneratedAlternativesFromCache = (silent = false): boolean => {
    if (!silent) {
      setGenerationError(null);
      setGenerationSuccess(null);
    }

    const storedResults = loadGeneratedResults();
    if (storedResults) {
      setFilters((previous) => ({
        ...previous,
        programId:
          previous.programId === ALL && storedResults.program_id
            ? storedResults.program_id
            : previous.programId,
        semester:
          previous.semester === ALL && storedResults.term_number
            ? String(storedResults.term_number)
            : previous.semester,
      }));

      if (storedResults.mode === "single" && storedResults.single?.alternatives?.length) {
        const firstAlternative = storedResults.single.alternatives[0];
        setGenerationMode("single");
        setSingleGeneration(storedResults.single);
        setCycleGeneration(null);
        setSelectedAlternativeRank(String(firstAlternative.rank));
        setSelectedCycleRank("");
        setSelectedCycleTerm("");
        const snapshot = buildSingleDraftSnapshot({
          source: "schedule",
          mode: "single",
          programId: storedResults.program_id ?? firstAlternative.payload.programId,
          termNumber: storedResults.term_number ?? firstAlternative.payload.termNumber ?? null,
          alternative: firstAlternative,
        });
        setPersistedDraft(snapshot);
        saveGeneratedDraft(snapshot);
        if (!silent) {
          setGenerationSuccess(`Loaded ${storedResults.single.alternatives.length} generated alternative(s) from Generator.`);
        }
        return true;
      }

      if (storedResults.mode !== "single" && storedResults.cycle?.pareto_front?.length) {
        const cycleResponse = storedResults.cycle;
        const pareto = cycleResponse.pareto_front ?? [];
        const selectedRank = cycleResponse.selected_solution_rank ?? pareto[0]?.rank;
        const selectedSolution = pareto.find((item) => item.rank === selectedRank) ?? pareto[0];
        const selectedTerm = selectedSolution?.terms[0];

        setGenerationMode(storedResults.mode);
        setCycleGeneration(cycleResponse);
        setSingleGeneration(null);
        setSelectedCycleRank(selectedSolution ? String(selectedSolution.rank) : "");
        setSelectedCycleTerm(selectedTerm ? String(selectedTerm.term_number) : "");
        setSelectedAlternativeRank("1");
        if (selectedTerm) {
          const snapshot = buildCycleTermDraftSnapshot({
            source: "schedule",
            mode: storedResults.mode,
            programId: storedResults.program_id ?? selectedTerm.payload.programId,
            solutionRank: selectedSolution?.rank ?? null,
            term: selectedTerm,
          });
          setPersistedDraft(snapshot);
          saveGeneratedDraft(snapshot);
        }
        if (!silent) {
          setGenerationSuccess(`Loaded ${pareto.length} cycle solution(s) from Generator.`);
        }
        return true;
      }
    }

    const storedDraft = loadGeneratedDraft();
    if (storedDraft) {
      setGenerationMode(storedDraft.mode === "single" ? "single" : storedDraft.mode);
      setSingleGeneration(null);
      setCycleGeneration(null);
      setSelectedAlternativeRank("1");
      setSelectedCycleRank("");
      setSelectedCycleTerm("");
      setPersistedDraft(storedDraft);
      if (!silent) {
        setGenerationSuccess(`Loaded saved draft from previous session (${storedDraft.label}).`);
      }
      return true;
    }

    if (!silent) {
      setGenerationError("No generated alternatives found. Run generation from the Generator page.");
    }
    return false;
  };

  useEffect(() => {
    loadGeneratedAlternativesFromCache();
  }, []);

  useEffect(() => {
    let active = true;
    listPrograms()
      .then((items) => {
        if (!active) {
          return;
        }
        setPrograms(items);
        setProgramError(null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to load programs";
        setProgramError(message);
        setPrograms([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([fetchWorkingHours(), fetchSchedulePolicy()]).then(([workingResult, policyResult]) => {
      if (!active) {
        return;
      }
      if (workingResult.status === "fulfilled") {
        setWorkingHours(workingResult.value.hours);
      }
      if (policyResult.status === "fulfilled") {
        setSchedulePolicy(policyResult.value);
      }
      if (workingResult.status !== "fulfilled" || policyResult.status !== "fulfilled") {
        setSettingsError("Unable to load slot template settings. Schedule data is still available.");
      } else {
        setSettingsError(null);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const activeProgramIdForStructure = filters.programId !== ALL ? filters.programId : (displayPayload.programId ?? "");

  useEffect(() => {
    if (!activeProgramIdForStructure) {
      setProgramTerms([]);
      setProgramSections([]);
      return;
    }
    let active = true;
    Promise.allSettled([listProgramTerms(activeProgramIdForStructure), listProgramSections(activeProgramIdForStructure)]).then(
      ([termsResult, sectionsResult]) => {
        if (!active) {
          return;
        }
        setProgramTerms(
          termsResult.status === "fulfilled"
            ? [...termsResult.value].sort((left, right) => left.term_number - right.term_number)
            : [],
        );
        setProgramSections(
          sectionsResult.status === "fulfilled"
            ? [...sectionsResult.value].sort((left, right) => sectionSort(left.name, right.name))
            : [],
        );
      },
    );

    return () => {
      active = false;
    };
  }, [activeProgramIdForStructure]);

  useEffect(() => {
    if (!displayPayload.programId) {
      return;
    }
    setFilters((previous) => {
      if (previous.programId !== ALL) {
        return previous;
      }
      return { ...previous, programId: displayPayload.programId ?? ALL };
    });
  }, [displayPayload.programId]);

  useEffect(() => {
    if (!hasOfficial) {
      setConflicts([]);
      setConflictsError(null);
      return;
    }
    let active = true;
    setConflictsLoading(true);
    fetchTimetableConflicts()
      .then((report) => {
        if (!active) {
          return;
        }
        setConflicts(report.conflicts);
        setConflictsError(null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to load conflicts";
        setConflictsError(message);
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setConflictsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [hasOfficial]);

  useEffect(() => {
    if (!hasOfficial) {
      setFacultyMappings([]);
      setMappingError(null);
      return;
    }
    let active = true;
    setMappingLoading(true);
    fetchOfficialFacultyMappings()
      .then((items) => {
        if (!active) {
          return;
        }
        setFacultyMappings(items);
        setMappingError(null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to load faculty-course mapping";
        setMappingError(message);
        setFacultyMappings([]);
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setMappingLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hasOfficial, displayPayload.timetableData.length]);

  useEffect(() => {
    if (!cyclePareto.length) {
      setSelectedCycleRank("");
      setSelectedCycleTerm("");
      return;
    }
    if (!cyclePareto.some((item) => String(item.rank) === selectedCycleRank)) {
      setSelectedCycleRank(String(cyclePareto[0].rank));
    }
  }, [cyclePareto, selectedCycleRank]);

  useEffect(() => {
    if (!activeCycleSolution?.terms.length) {
      setSelectedCycleTerm("");
      return;
    }
    if (!activeCycleSolution.terms.some((item) => String(item.term_number) === selectedCycleTerm)) {
      setSelectedCycleTerm(String(activeCycleSolution.terms[0].term_number));
    }
  }, [activeCycleSolution, selectedCycleTerm]);

  useEffect(() => {
    if (generationMode === "single" && activeSingleAlternative) {
      const snapshot = buildSingleDraftSnapshot({
        source: "schedule",
        mode: "single",
        programId:
          activeSingleAlternative.payload.programId ??
          (filters.programId !== ALL ? filters.programId : undefined),
        termNumber:
          activeSingleAlternative.payload.termNumber ??
          (filters.semester !== ALL ? Number(filters.semester) : null),
        alternative: activeSingleAlternative,
      });
      setPersistedDraft(snapshot);
      saveGeneratedDraft(snapshot);
      return;
    }
    if (generationMode !== "single" && activeCycleTermEntry) {
      const snapshot = buildCycleTermDraftSnapshot({
        source: "schedule",
        mode: generationMode,
        programId:
          activeCycleTermEntry.payload.programId ??
          (filters.programId !== ALL ? filters.programId : undefined),
        solutionRank: activeCycleSolution?.rank,
        term: activeCycleTermEntry,
      });
      setPersistedDraft(snapshot);
      saveGeneratedDraft(snapshot);
    }
  }, [
    activeCycleSolution?.rank,
    activeCycleTermEntry,
    activeSingleAlternative,
    filters.programId,
    filters.semester,
    generationMode,
  ]);

  const departmentOptions = useMemo(() => {
    const options = new Set<string>();
    for (const program of programs) {
      if (program.department.trim()) {
        options.add(program.department.trim());
      }
    }
    for (const faculty of facultyData) {
      if (faculty.department.trim()) {
        options.add(faculty.department.trim());
      }
    }
    if (fallbackProgramDepartment?.trim()) {
      options.add(fallbackProgramDepartment.trim());
    }
    return Array.from(options).sort((left, right) => left.localeCompare(right));
  }, [programs, facultyData, fallbackProgramDepartment]);

  const visiblePrograms = useMemo(() => {
    if (filters.department === ALL) {
      return programs;
    }
    const selectedDepartment = normalize(filters.department);
    return programs.filter((program) => normalize(program.department) === selectedDepartment);
  }, [filters.department, programs]);

  useEffect(() => {
    if (filters.programId === ALL) {
      return;
    }
    if (visiblePrograms.some((program) => program.id === filters.programId)) {
      return;
    }
    setFilters((previous) => ({ ...previous, programId: ALL }));
  }, [filters.programId, visiblePrograms]);

  const semesterOptions = useMemo(() => {
    const options = new Set<string>();
    if (displayPayload.termNumber !== undefined && displayPayload.termNumber !== null) {
      options.add(String(displayPayload.termNumber));
    }
    for (const term of programTerms) {
      options.add(String(term.term_number));
    }
    for (const section of programSections) {
      options.add(String(section.term_number));
    }
    for (const term of TERM_OPTIONS) {
      options.add(term);
    }
    return Array.from(options).sort((left, right) => Number(left) - Number(right));
  }, [displayPayload.termNumber, programSections, programTerms]);

  useEffect(() => {
    if (filters.semester === ALL) {
      return;
    }
    if (semesterOptions.includes(filters.semester)) {
      return;
    }
    setFilters((previous) => ({ ...previous, semester: ALL }));
  }, [filters.semester, semesterOptions]);

  const sectionOptions = useMemo(() => {
    const options = new Set<string>();
    for (const slot of timetableData) {
      if (slot.section.trim()) {
        options.add(slot.section.trim());
      }
    }
    for (const section of programSections) {
      if (filters.semester !== ALL && String(section.term_number) !== filters.semester) {
        continue;
      }
      if (section.name.trim()) {
        options.add(section.name.trim());
      }
    }
    return Array.from(options).sort(sectionSort);
  }, [filters.semester, programSections, timetableData]);

  useEffect(() => {
    if (filters.section === ALL) {
      return;
    }
    if (sectionOptions.includes(filters.section)) {
      return;
    }
    setFilters((previous) => ({ ...previous, section: ALL }));
  }, [filters.section, sectionOptions]);

  const facultyOptions = useMemo(() => {
    const selectedDepartment = normalize(filters.department);
    return [...facultyData]
      .filter((faculty) => {
        if (!selectedDepartment) {
          return true;
        }
        return normalize(faculty.department) === selectedDepartment;
      })
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  }, [facultyData, filters.department]);

  useEffect(() => {
    if (filters.facultyId === ALL) {
      return;
    }
    if (facultyOptions.some((faculty) => faculty.id === filters.facultyId)) {
      return;
    }
    setFilters((previous) => ({ ...previous, facultyId: ALL }));
  }, [facultyOptions, filters.facultyId]);

  const roomOptions = useMemo(
    () =>
      [...roomData].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
    [roomData],
  );

  useEffect(() => {
    if (filters.roomId === ALL) {
      return;
    }
    if (roomOptions.some((room) => room.id === filters.roomId)) {
      return;
    }
    setFilters((previous) => ({ ...previous, roomId: ALL }));
  }, [filters.roomId, roomOptions]);

  const filteredSlots = useMemo(
    () =>
      applyFilters({
        slots: timetableData,
        filters,
        payloadProgramId: displayPayload.programId,
        payloadTermNumber: displayPayload.termNumber,
        fallbackDepartment: fallbackProgramDepartment,
        facultyById,
      }),
    [
      displayPayload.programId,
      displayPayload.termNumber,
      facultyById,
      fallbackProgramDepartment,
      filters,
      timetableData,
    ],
  );

  const resolvedSlots = useMemo<ResolvedSlot[]>(() => {
    return filteredSlots.map((slot) => ({
      slot,
      course: courseById.get(slot.courseId),
      room: roomById.get(slot.roomId),
      faculty: facultyById.get(slot.facultyId),
    }));
  }, [courseById, facultyById, filteredSlots, roomById]);

  const hasGeneratedButFilteredOut = useMemo(
    () => showingGenerated && timetableData.length > 0 && resolvedSlots.length === 0,
    [resolvedSlots.length, showingGenerated, timetableData.length],
  );

  const days = useMemo(() => {
    const configured = buildTemplateDays(workingHours);
    if (configured.length) {
      return configured;
    }
    const fromSlots = Array.from(new Set(resolvedSlots.map((item) => item.slot.day))).sort(daySort);
    return fromSlots.length ? fromSlots : DAY_SEQUENCE.slice(0, 5);
  }, [resolvedSlots, workingHours]);

  const startTimes = useMemo(() => {
    const configured = buildTemplateTimeSlots(workingHours, schedulePolicy);
    if (configured.length) {
      return configured;
    }
    const fromSlots = Array.from(new Set(resolvedSlots.map((item) => item.slot.startTime)));
    return sortTimes(fromSlots);
  }, [resolvedSlots, schedulePolicy, workingHours]);

  const cellMap = useMemo(() => {
    const map = new Map<string, ResolvedSlot[]>();
    for (const item of resolvedSlots) {
      const key = `${item.slot.day}|${item.slot.startTime}`;
      const existing = map.get(key) ?? [];
      existing.push(item);
      map.set(key, existing);
    }
    for (const values of map.values()) {
      values.sort((left, right) => slotSort(left.slot, right.slot));
    }
    return map;
  }, [resolvedSlots]);

  const rowEndByStart = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of resolvedSlots) {
      if (!map.has(item.slot.startTime)) {
        map.set(item.slot.startTime, item.slot.endTime);
      }
    }
    for (const start of startTimes) {
      if (map.has(start)) {
        continue;
      }
      const baseMinutes = parseTimeToMinutes(start);
      if (Number.isFinite(baseMinutes)) {
        map.set(start, toTimeString(baseMinutes + schedulePolicy.period_minutes));
      }
    }
    return map;
  }, [resolvedSlots, schedulePolicy.period_minutes, startTimes]);

  const statSections = useMemo(() => new Set(resolvedSlots.map((item) => item.slot.section)).size, [resolvedSlots]);
  const statFaculty = useMemo(() => new Set(resolvedSlots.map((item) => item.slot.facultyId)).size, [resolvedSlots]);
  const statRooms = useMemo(() => new Set(resolvedSlots.map((item) => item.slot.roomId)).size, [resolvedSlots]);

  const handleFilterChange = (field: keyof Filters, value: string) => {
    setFilters((previous) => ({ ...previous, [field]: value }));
  };

  const clearFilters = () => {
    setFilters({
      department: ALL,
      programId: displayPayload.programId ?? ALL,
      semester: ALL,
      section: ALL,
      roomId: ALL,
      facultyId: ALL,
    });
  };

  const refreshConflicts = async () => {
    if (!hasOfficial) {
      setConflicts([]);
      return;
    }
    setConflictsLoading(true);
    setConflictsError(null);
    try {
      const report = await fetchTimetableConflicts();
      setConflicts(report.conflicts);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load conflicts";
      setConflictsError(message);
    } finally {
      setConflictsLoading(false);
    }
  };

  /* 
  const handleConflictDecision = async (conflictId: string, decision: "yes" | "no") => {
    // Deprecated in favor of Conflict Dashboard
  }; 
  */

  const handleRefreshWorkspace = async () => {
    await refreshOfficial();
    await refreshConflicts();
  };

  const handleUseOfficialView = () => {
    setSingleGeneration(null);
    setCycleGeneration(null);
    setSelectedAlternativeRank("1");
    setSelectedCycleRank("");
    setSelectedCycleTerm("");
    setPersistedDraft(null);
    clearGeneratedDraft();
    setGenerationSuccess("Switched to official published timetable view.");
    setGenerationError(null);
  };

  const handleReloadGeneratedAlternatives = () => {
    loadGeneratedAlternativesFromCache();
  };

  const handleCycleMove = (delta: number) => {
    if (!cyclePareto.length) {
      return;
    }
    const currentIndex = cyclePareto.findIndex((item) => String(item.rank) === selectedCycleRank);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + delta + cyclePareto.length) % cyclePareto.length;
    setSelectedCycleRank(String(cyclePareto[nextIndex].rank));
  };

  const handlePublish = async (force: boolean = false) => {
    if (!canManage) {
      return;
    }
    const conflictCount = activeDraftHardConflicts ?? 0;
    if (!force && showingGenerated && conflictCount > 0) {
      setIsPublishConfirmOpen(true);
      return;
    }
    const payloadToPublish = activeDraftPayload ?? (hasOfficial ? officialPayload : null);
    if (!payloadToPublish || !payloadToPublish.timetableData.length) {
      setPublishError("No timetable payload available for publishing.");
      return;
    }

    setIsPublishing(true);
    setPublishError(null);
    setPublishSuccess(null);
    setOfflinePublishError(null);
    setOfflinePublishSuccess(null);

    try {
      await publishOfficialTimetable(payloadToPublish, versionLabel, force);
      const modeLabel = showingGenerated ? "selected generated schedule" : "official schedule";
      setPublishSuccess(`Published ${modeLabel} successfully.`);
      await refreshOfficial();
      await refreshConflicts();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to publish timetable";
      setPublishError(message);
    } finally {
      setIsPublishing(false);
      setIsPublishConfirmOpen(false);
    }
  };

  const handlePublishOffline = async () => {
    setIsPublishingOffline(true);
    setOfflinePublishError(null);
    setOfflinePublishSuccess(null);
    try {
      const result = await publishOfflineTimetable({
        department: filters.department !== ALL ? filters.department : undefined,
        programId: filters.programId !== ALL ? filters.programId : undefined,
        termNumber: filters.semester !== ALL ? Number(filters.semester) : undefined,
        sectionName: filters.section !== ALL ? filters.section : undefined,
        facultyId: filters.facultyId !== ALL ? filters.facultyId : undefined,
      });
      setOfflinePublishSuccess(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to publish timetable offline";
      setOfflinePublishError(message);
    } finally {
      setIsPublishingOffline(false);
    }
  };

  const handlePublishOfflineAll = async () => {
    setIsPublishingOfflineAll(true);
    setOfflinePublishError(null);
    setOfflinePublishSuccess(null);
    try {
      const result = await publishOfflineTimetableAll();
      setOfflinePublishSuccess(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to publish all timetables offline";
      setOfflinePublishError(message);
    } finally {
      setIsPublishingOfflineAll(false);
    }
  };

  const handleExport = async () => {
    setExportError(null);
    if (!resolvedSlots.length) {
      setExportError("No records to export for the selected filters.");
      return;
    }

    const filename = buildFileName(filters);
    const semesterLabel =
      filters.semester !== ALL ? filters.semester : displayPayload.termNumber ? String(displayPayload.termNumber) : "All";

    setIsExporting(true);
    try {
      if (exportFormat === "csv") {
        const normalizedSlots = resolvedSlots.map((item) => ({
          ...item.slot,
          batch: item.slot.batch ?? undefined,
          studentCount: item.slot.studentCount ?? undefined,
        }));
        downloadTimetableCsv(filename, normalizedSlots, courseData, roomData, facultyData);
      } else if (exportFormat === "ics") {
        const normalizedSlots = resolvedSlots.map((item) => ({
          ...item.slot,
          batch: item.slot.batch ?? undefined,
          studentCount: item.slot.studentCount ?? undefined,
        }));
        const icsContent = generateICSContent(normalizedSlots, {
          courses: courseData,
          rooms: roomData,
          faculty: facultyData,
        });
        downloadBlob(icsContent, "text/calendar;charset=utf-8", `${filename}.ics`);
      } else if (exportFormat === "json") {
        const filteredCourseIds = new Set(resolvedSlots.map((item) => item.slot.courseId));
        const filteredRoomIds = new Set(resolvedSlots.map((item) => item.slot.roomId));
        const filteredFacultyIds = new Set(resolvedSlots.map((item) => item.slot.facultyId));
        const exportJson = {
          metadata: {
            exported_at: new Date().toISOString(),
            format: "json",
            source: showingGenerated ? "generated-draft" : "official-timetable",
            scope: {
              department: filters.department,
              programId: filters.programId,
              termNumber: filters.semester === ALL ? null : Number(filters.semester),
              section: filters.section,
              roomId: filters.roomId,
              facultyId: filters.facultyId,
            },
            slot_count: resolvedSlots.length,
          },
          payload: {
            programId: displayPayload.programId ?? null,
            termNumber: displayPayload.termNumber ?? null,
            facultyData: facultyData.filter((item) => filteredFacultyIds.has(item.id)),
            courseData: courseData.filter((item) => filteredCourseIds.has(item.id)),
            roomData: roomData.filter((item) => filteredRoomIds.has(item.id)),
            timetableData: resolvedSlots.map((item) => item.slot),
          },
        };
        downloadBlob(JSON.stringify(exportJson, null, 2), "application/json;charset=utf-8", `${filename}.json`);
      } else if (exportFormat === "excel") {
        const rows = buildExcelRows(resolvedSlots, semesterLabel);
        const metadata: Array<[string, string]> = [
          ["Department", filters.department === ALL ? "All" : filters.department],
          ["Program", filters.programId === ALL ? "All" : (programById.get(filters.programId)?.name ?? filters.programId)],
          ["Semester", semesterLabel],
          ["Section", filters.section === ALL ? "All" : filters.section],
          ["Room", filters.roomId === ALL ? "All" : (roomById.get(filters.roomId)?.name ?? filters.roomId)],
          ["Faculty", filters.facultyId === ALL ? "All" : (facultyById.get(filters.facultyId)?.name ?? filters.facultyId)],
          ["Slots Exported", String(resolvedSlots.length)],
          ["Source", showingGenerated ? "Generated draft" : "Official timetable"],
        ];
        downloadTimetableExcel(filename, rows, metadata);
      } else {
        if (!exportRef.current) {
          throw new Error("Unable to access timetable preview for export.");
        }
        if (exportFormat === "png") {
          await exportElementToPng(exportRef.current, filename);
        } else {
          await exportElementToPdf(exportRef.current, filename);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed";
      setExportError(message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1720px] space-y-6 px-1">
      <AlertDialog open={isPublishConfirmOpen} onOpenChange={setIsPublishConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Publish with Conflicts?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-warning-foreground">
                  <p className="font-medium">Conflicts Detected: {activeDraftHardConflicts}</p>
                  <p className="text-xs pt-1">
                    The current draft contains unresolved hard conflicts. Publishing this timetable will make these
                    conflicts official and visible to faculty and students.
                  </p>
                </div>
                <p>Are you sure you want to proceed with publishing this version?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPublishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-warning hover:bg-warning/90 text-warning-foreground"
              onClick={() => void handlePublish(true)}
              disabled={isPublishing}
            >
              {isPublishing ? "Publishing..." : "Publish Anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Schedule Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Review generated alternatives, resolve conflicts, and publish from one workspace.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant={showingGenerated ? "default" : hasOfficial ? "secondary" : "outline"}>
              {showingGenerated ? "Reviewing generated draft" : hasOfficial ? "Official timetable loaded" : "No official timetable"}
            </Badge>
            {activeDraftLabel ? (
              <Badge variant="outline">
                {activeDraftLabel}
              </Badge>
            ) : null}
            {activeDraftHardConflicts !== null ? (
              <Badge variant={activeDraftHardConflicts > 0 ? "destructive" : "outline"}>
                Hard conflicts: {activeDraftHardConflicts}
              </Badge>
            ) : null}
            {timetableLoading ? <Badge variant="secondary">Refreshing official data...</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void handleRefreshWorkspace()} disabled={timetableLoading || conflictsLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {showingGenerated && hasOfficial ? (
            <Button variant="outline" onClick={handleUseOfficialView}>
              Use Official View
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => router.push("/conflicts")}>
            <AlertTriangle className="mr-2 h-4 w-4" />
            Conflict Dashboard
          </Button>
        </div>
      </div>

      {generationError ? <p className="text-sm text-destructive">{generationError}</p> : null}
      {generationSuccess ? <p className="text-sm text-emerald-600">{generationSuccess}</p> : null}
      {programError ? <p className="text-sm text-destructive">{programError}</p> : null}
      {settingsError ? <p className="text-sm text-muted-foreground">{settingsError}</p> : null}
      {timetableError ? <p className="text-sm text-destructive">{timetableError}</p> : null}
      {conflictsError ? <p className="text-sm text-destructive">{conflictsError}</p> : null}
      {hasGeneratedButFilteredOut ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Generated alternatives are available, but current filters hide all slots. Use `Reset Filters` to view the alternate timetable.
        </div>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(340px,380px)_minmax(0,1fr)]">
        <div className="space-y-6 xl:sticky xl:top-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step 1: Generate In Generator</CardTitle>
              <CardDescription>
                Generation settings and algorithm execution are managed only in the Generator workspace.
                Use this page to load generated alternatives, align them with filters, and publish.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" className="w-full" onClick={() => router.push("/generator")}>
                Open Generator Workspace
              </Button>
              <Button variant="outline" className="w-full" onClick={handleReloadGeneratedAlternatives}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reload Generated Alternatives
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step 2: Review Alternate Timetable</CardTitle>
              <CardDescription>Inspect generated alternatives and choose the best candidate.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {generationMode === "single" ? (
                singleGeneration?.alternatives.length ? (
                  <div className="space-y-2">
                    <Label>Alternative</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setAlternativesViewerOpen(true)}
                        disabled={!singleGeneration?.alternatives.length}
                      >
                        Compare Alternatives ({singleGeneration?.alternatives.length ?? 0})
                      </Button>
                      <Select value={selectedAlternativeRank} onValueChange={setSelectedAlternativeRank}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {singleGeneration.alternatives.map((alternative) => (
                            <SelectItem key={alternative.rank} value={String(alternative.rank)}>
                              Alt {alternative.rank} • Hard {alternative.hard_conflicts} • Score {alternative.fitness.toFixed(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No generated alternatives loaded. Use the Generator page, then reload here.</p>
                )
              ) : cyclePareto.length ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Pareto solution</Label>
                      <Select value={selectedCycleRank} onValueChange={setSelectedCycleRank}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {cyclePareto.map((solution) => (
                            <SelectItem key={solution.rank} value={String(solution.rank)}>
                              Solution {solution.rank} • Hard {solution.hard_conflicts}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Term preview</Label>
                      <Select value={selectedCycleTerm} onValueChange={setSelectedCycleTerm}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(activeCycleSolution?.terms ?? []).map((term) => (
                            <SelectItem key={`${term.term_number}-${term.alternative_rank}`} value={String(term.term_number)}>
                              Semester {term.term_number} • Alt {term.alternative_rank}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => handleCycleMove(-1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handleCycleMove(1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No cycle solutions loaded. Generate from the Generator page, then reload here.</p>
              )}

              {showingGenerated ? (
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    {activeDraftHardConflicts !== null ? (
                      <Badge variant={activeDraftHardConflicts > 0 ? "destructive" : "outline"}>
                        Hard conflicts: {activeDraftHardConflicts}
                      </Badge>
                    ) : null}
                    {activeGeneratedAlternative ? (
                      <>
                        <Badge variant="outline">Soft penalty: {activeGeneratedAlternative.soft_penalty.toFixed(2)}</Badge>
                        <Badge variant="outline">Fitness: {activeGeneratedAlternative.fitness.toFixed(2)}</Badge>
                      </>
                    ) : (
                      <Badge variant="outline">Loaded from saved draft cache</Badge>
                    )}
                    {activeDraftLabel ? <Badge variant="outline">{activeDraftLabel}</Badge> : null}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step 3: Resolve & Publish</CardTitle>
              <CardDescription>Finalize and distribute timetable updates.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Total Conflicts</span>
                  <span className="font-semibold">{unresolvedConflictCount}</span>
                </div>
                {/* 
                <div className="flex items-center justify-between text-sm">
                  <span>Resolved official conflicts</span>
                  <span className="font-semibold">{resolvedConflictCount}</span>
                </div> 
                */}
                <Button variant="outline" className="w-full" onClick={() => router.push("/conflicts")}>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Open Conflict Dashboard
                </Button>
              </div>

              {unresolvedConflictCount > 0 ? (
                <div className="space-y-2 rounded-lg border bg-background/40 p-3">
                  <div className="flex items-center gap-2 text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    <p className="text-sm font-semibold">Conflicts Detected</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Please use the dedicated Conflict Dashboard to review and resolve {unresolvedConflictCount} issues.
                  </p>
                  <Button variant="secondary" className="w-full" onClick={() => router.push("/conflicts")}>
                    Go to Conflict Dashboard
                  </Button>
                </div>
              ) : hasOfficial ? (
                <p className="text-xs text-emerald-600">No unresolved official conflicts. Timetable is publish-ready.</p>
              ) : null}

              <div className="space-y-2">
                <Label>Version label</Label>
                <Input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} />
              </div>

              <Button className="w-full" onClick={() => void handlePublish()} disabled={!canManage || isPublishing}>
                <Upload className="mr-2 h-4 w-4" />
                {isPublishing ? "Publishing..." : showingGenerated ? "Publish Selected Draft" : "Publish Official"}
              </Button>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => void handlePublishOffline()} disabled={isPublishingOffline}>
                  <Send className="mr-2 h-4 w-4" />
                  {isPublishingOffline ? "Publishing..." : "Publish Offline"}
                </Button>
                <Button variant="outline" onClick={() => void handlePublishOfflineAll()} disabled={isPublishingOfflineAll}>
                  <Send className="mr-2 h-4 w-4" />
                  {isPublishingOfflineAll ? "Publishing..." : "Publish All Offline"}
                </Button>
              </div>

              {publishError ? <p className="text-sm text-destructive">{publishError}</p> : null}
              {publishSuccess ? <p className="text-sm text-emerald-600">{publishSuccess}</p> : null}
              {conflictActionMessage ? <p className="text-sm text-emerald-600">{conflictActionMessage}</p> : null}
              {offlinePublishError ? <p className="text-sm text-destructive">{offlinePublishError}</p> : null}
              {offlinePublishSuccess ? <p className="text-sm text-emerald-600">{offlinePublishSuccess}</p> : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">View Filters and Export</CardTitle>
              <CardDescription>
                Access room, teacher, and section schedules by semester from one panel, then export in PDF, Excel, PNG, CSV, ICS, or JSON.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select value={filters.department} onValueChange={(value) => handleFilterChange("department", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All departments</SelectItem>
                      {departmentOptions.map((department) => (
                        <SelectItem key={department} value={department}>
                          {department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Program</Label>
                  <Select value={filters.programId} onValueChange={(value) => handleFilterChange("programId", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All programs</SelectItem>
                      {visiblePrograms.map((program) => (
                        <SelectItem key={program.id} value={program.id}>
                          {program.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Semester</Label>
                  <Select value={filters.semester} onValueChange={(value) => handleFilterChange("semester", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All semesters</SelectItem>
                      {semesterOptions.map((semester) => (
                        <SelectItem key={semester} value={semester}>
                          Semester {semester}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Section</Label>
                  <Select value={filters.section} onValueChange={(value) => handleFilterChange("section", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All sections</SelectItem>
                      {sectionOptions.map((section) => (
                        <SelectItem key={section} value={section}>
                          {section}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Room</Label>
                  <Select value={filters.roomId} onValueChange={(value) => handleFilterChange("roomId", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All rooms</SelectItem>
                      {roomOptions.map((room) => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Teacher</Label>
                  <Select value={filters.facultyId} onValueChange={(value) => handleFilterChange("facultyId", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All teachers</SelectItem>
                      {facultyOptions.map((faculty) => (
                        <SelectItem key={faculty.id} value={faculty.id}>
                          {faculty.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
                <div className="space-y-2">
                  <Label>Export format</Label>
                  <Select value={exportFormat} onValueChange={(value: ExportFormat) => setExportFormat(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="excel">Excel (.xls)</SelectItem>
                      <SelectItem value="png">PNG</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="ics">ICS (.ics)</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button variant="outline" className="w-full" onClick={clearFilters}>
                    Reset Filters
                  </Button>
                </div>
                <div className="flex items-end">
                  <Button className="w-full" onClick={() => void handleExport()} disabled={isExporting}>
                    <Download className="mr-2 h-4 w-4" />
                    {isExporting ? "Preparing..." : "Download"}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Rows: {resolvedSlots.length}</Badge>
                <Badge variant="outline">Sections: {statSections}</Badge>
                <Badge variant="outline">Teachers: {statFaculty}</Badge>
                <Badge variant="outline">Rooms: {statRooms}</Badge>
                <Badge variant="outline">Source: {showingGenerated ? "Generated draft" : "Official"}</Badge>
              </div>
              {exportError ? <p className="text-sm text-destructive">{exportError}</p> : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Visible Slots</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{resolvedSlots.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Conflict Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {unresolvedConflictCount > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                  <p className="text-sm">{unresolvedConflictCount > 0 ? `${unresolvedConflictCount} unresolved` : "No unresolved conflicts"}</p>
                </div>
                {conflictsLoading ? <p className="text-xs text-muted-foreground mt-1">Refreshing...</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Preview Mode</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">{showingGenerated ? "Generated Draft" : "Official Published"}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {showingGenerated
                    ? "Review before publishing."
                    : "Create alternatives in Generator, then reload them here."}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Faculty to Course-Section Mapping</CardTitle>
              <CardDescription>Official published assignment map of faculty to courses, sections, and slots.</CardDescription>
            </CardHeader>
            <CardContent>
              {mappingLoading ? (
                <p className="text-sm text-muted-foreground">Loading faculty mapping...</p>
              ) : mappingError ? (
                <p className="text-sm text-destructive">{mappingError}</p>
              ) : !facultyMappings.length ? (
                <p className="text-sm text-muted-foreground">No official faculty mapping available.</p>
              ) : (
                <div className="space-y-4">
                  {facultyMappings.map((mapping) => (
                    <div key={mapping.faculty_id} className="rounded-lg border bg-background/40 p-4">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold">{mapping.faculty_name}</p>
                          <p className="text-xs text-muted-foreground">{mapping.faculty_email}</p>
                        </div>
                        <Badge variant="secondary">{mapping.total_assigned_hours.toFixed(2)}h/week</Badge>
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-muted-foreground">
                              <th className="px-2 py-1 font-medium">Course</th>
                              <th className="px-2 py-1 font-medium">Section</th>
                              <th className="px-2 py-1 font-medium">Day</th>
                              <th className="px-2 py-1 font-medium">Time</th>
                              <th className="px-2 py-1 font-medium">Room</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mapping.assignments.map((assignment, index) => (
                              <tr key={`${mapping.faculty_id}-${assignment.course_id}-${assignment.day}-${assignment.startTime}-${index}`}>
                                <td className="px-2 py-1">{assignment.course_code}</td>
                                <td className="px-2 py-1">
                                  {assignment.section}
                                  {assignment.batch ? `-${assignment.batch}` : ""}
                                </td>
                                <td className="px-2 py-1">{assignment.day}</td>
                                <td className="px-2 py-1">
                                  {assignment.startTime} - {assignment.endTime}
                                </td>
                                <td className="px-2 py-1">{assignment.room_name}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div ref={exportRef}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Weekly Timetable Grid</CardTitle>
                <CardDescription>Filtered preview of the currently selected schedule.</CardDescription>
              </CardHeader>
              <CardContent>
                {!startTimes.length || !days.length ? (
                  <p className="text-sm text-muted-foreground">No timetable data available for the selected view.</p>
                ) : (
                  <div className="overflow-auto rounded-md border">
                    <table className="min-w-[1120px] w-full table-fixed border-collapse text-sm">
                      <thead>
                        <tr className="bg-muted/60">
                          <th className="sticky left-0 top-0 z-20 border-b bg-muted/60 px-3 py-2 text-left font-semibold">Time</th>
                          {days.map((day) => (
                            <th key={day} className="border-b px-3 py-2 text-center font-semibold">
                              {day}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {startTimes.map((startTime) => {
                          const endTime = rowEndByStart.get(startTime) ?? startTime;
                          return (
                            <tr key={startTime}>
                              <th className="sticky left-0 z-10 border-b bg-background px-3 py-3 text-left align-top font-medium text-muted-foreground">
                                {startTime} - {endTime}
                              </th>
                              {days.map((day) => {
                                const key = `${day}|${startTime}`;
                                const entries = cellMap.get(key) ?? [];
                                return (
                                  <td key={key} className="border-b px-2 py-2 align-top">
                                    {entries.length === 0 ? (
                                      <div className="min-h-[3.25rem] rounded-md border border-dashed border-muted/40 bg-muted/10" />
                                    ) : (
                                      <div className="space-y-2">
                                        {entries.map((item) => (
                                          <div
                                            key={item.slot.id}
                                            className={`min-h-[3.25rem] rounded-md border px-2 py-1 ${getCourseCardClass(
                                              item.course?.type,
                                              resolveSlotSessionType(item.slot, item.course),
                                            )}`}
                                          >
                                            <p className="text-xs font-semibold">
                                              {item.course?.code ?? item.slot.courseId}
                                              {resolveSlotSessionType(item.slot, item.course) === "tutorial" ? " (Tutorial)" : ""}
                                              {" • "}
                                              {item.slot.section}
                                            </p>
                                            <p className="text-xs">{item.course?.name ?? "Unknown course"}</p>
                                            <p className="text-xs opacity-80">
                                              {item.faculty?.name ?? item.slot.facultyId} • {item.room?.name ?? item.slot.roomId}
                                              {item.slot.batch ? ` • Batch ${item.slot.batch}` : ""}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded border border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30" /> Theory / Tutorial
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" /> Lab
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" /> Elective
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <AlternativesViewer
        isOpen={alternativesViewerOpen}
        onOpenChange={setAlternativesViewerOpen}
        alternatives={singleGeneration?.alternatives ?? []}
        currentRank={activeGeneratedAlternative?.rank ?? 0}
        onSelect={(alt) => {
          setSelectedAlternativeRank(String(alt.rank));
          setAlternativesViewerOpen(false);
        }}
        bestFitness={singleGeneration?.alternatives ? Math.max(...singleGeneration.alternatives.map(a => a.fitness)) : undefined}
      />
    </div>
  );
}
