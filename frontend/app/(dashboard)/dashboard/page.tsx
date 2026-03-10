"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BellRing,
  BookOpen,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Download,
  FileBarChart2,
  FileImage,
  FileText,
  Gauge,
  GitPullRequestArrow,
  MessageSquareWarning,
  RefreshCw,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOfficialTimetable } from "@/hooks/use-official-timetable";
import { fetchSystemAnalytics, type SystemAnalyticsPayload } from "@/lib/analytics-api";
import { listPrograms, type Program } from "@/lib/academic-api";
import { listFeedback, type FeedbackItem } from "@/lib/feedback-api";
import { listIssues, type Issue } from "@/lib/issue-api";
import {
  listLeaveRequests,
  listSubstituteOffers,
  updateLeaveRequestStatus,
  type LeaveRequest,
  type LeaveSubstituteOffer,
} from "@/lib/leave-api";
import { fetchHealth } from "@/lib/health-api";
import { generateICSContent } from "@/lib/ics";
import { parseTimeToMinutes } from "@/lib/schedule-template";
import { fetchTimetableAnalytics, fetchTimetableConflicts, type TimetableAnalyticsPayload } from "@/lib/timetable-api";
import { getProgramConstraint, type ProgramDailyTimeSlot } from "@/lib/constraints-api";
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
import type { Course, Faculty, Room, TimeSlot } from "@/lib/timetable-types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type WeeklyFilterType = "class" | "teacher" | "classroom";

interface ClassFilterOption {
  key: string;
  semesterNumber: number | null;
  section: string;
  label: string;
}

function buildDashboardRows(slots: TimeSlot[], dailySlots: ProgramDailyTimeSlot[]): WeeklyGridRow[] {
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

function buildDashboardCellEntries(
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
      return leftCode.localeCompare(rightCode, undefined, { numeric: true, sensitivity: "base" });
    });
  }

  return output;
}

function toTitleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildCountMap(items: Array<{ label: string; value: number }>): Record<string, number> {
  const output: Record<string, number> = {};
  for (const item of items) {
    output[item.label] = item.value;
  }
  return output;
}

function toLocalDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export default function DashboardPage() {
  const { data: timetablePayload, hasOfficial, isLoading: timetableLoading, error: timetableError } = useOfficialTimetable();
  const { timetableData, courseData, roomData, facultyData } = timetablePayload;

  const [healthStatus, setHealthStatus] = useState<"ok" | "error" | "loading">("loading");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("all");
  const [systemAnalytics, setSystemAnalytics] = useState<SystemAnalyticsPayload | null>(null);
  const [systemAnalyticsError, setSystemAnalyticsError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<TimetableAnalyticsPayload | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [conflictPreview, setConflictPreview] = useState<Array<{ id: string; description: string; severity: "hard" | "soft" }>>([]);
  const [leavePreview, setLeavePreview] = useState<LeaveRequest[]>([]);
  const [swapPreview, setSwapPreview] = useState<LeaveSubstituteOffer[]>([]);
  const [feedbackPreview, setFeedbackPreview] = useState<FeedbackItem[]>([]);
  const [issuePreview, setIssuePreview] = useState<Issue[]>([]);
  const [overlayError, setOverlayError] = useState<string | null>(null);
  const [leaveActionBusyId, setLeaveActionBusyId] = useState<string | null>(null);
  const [weeklyFilterType, setWeeklyFilterType] = useState<WeeklyFilterType>("class");
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedClassroomId, setSelectedClassroomId] = useState("");
  const [programDailySlots, setProgramDailySlots] = useState<ProgramDailyTimeSlot[]>([]);

  const selectedProgram = useMemo(
    () => programs.find((program) => program.id === selectedProgramId) ?? null,
    [programs, selectedProgramId],
  );

  const isProgramInCurrentTimetable = useMemo(() => {
    const payloadProgramId = timetablePayload.programId;
    if (selectedProgramId === "all") {
      return true;
    }
    if (!payloadProgramId) {
      return true;
    }
    return payloadProgramId === selectedProgramId;
  }, [selectedProgramId, timetablePayload.programId]);

  const scopedTimetableData = isProgramInCurrentTimetable ? timetableData : [];
  const scopedCourseData = isProgramInCurrentTimetable ? courseData : [];
  const scopedRoomData = isProgramInCurrentTimetable ? roomData : [];
  const scopedFacultyData = isProgramInCurrentTimetable ? facultyData : [];

  const activeConstraintProgramId = useMemo(() => {
    if (selectedProgramId !== "all") {
      return selectedProgramId;
    }
    return timetablePayload.programId ?? "";
  }, [selectedProgramId, timetablePayload.programId]);

  const courseById = useMemo(() => {
    return new Map(scopedCourseData.map((course) => [course.id, course]));
  }, [scopedCourseData]);

  const roomById = useMemo(() => {
    return new Map(scopedRoomData.map((room) => [room.id, room]));
  }, [scopedRoomData]);

  const facultyById = useMemo(() => {
    return new Map(scopedFacultyData.map((faculty) => [faculty.id, faculty]));
  }, [scopedFacultyData]);

  const classOptions = useMemo(() => {
    const options = new Map<string, ClassFilterOption>();
    for (const slot of scopedTimetableData) {
      const course = courseById.get(slot.courseId);
      const semesterNumber = typeof course?.semesterNumber === "number" && course.semesterNumber > 0
        ? course.semesterNumber
        : (timetablePayload.termNumber ?? null);
      const section = (slot.section || "Unassigned").trim() || "Unassigned";
      const key = `${semesterNumber ?? "unknown"}::${section.toUpperCase()}`;
      if (!options.has(key)) {
        const semesterLabel = semesterNumber ? `Semester ${semesterNumber}` : "Semester ?";
        options.set(key, {
          key,
          semesterNumber,
          section,
          label: `${semesterLabel} • Section ${section}`,
        });
      }
    }

    return Array.from(options.values()).sort((left, right) => {
      const leftSemester = left.semesterNumber ?? Number.MAX_SAFE_INTEGER;
      const rightSemester = right.semesterNumber ?? Number.MAX_SAFE_INTEGER;
      if (leftSemester !== rightSemester) {
        return leftSemester - rightSemester;
      }
      return left.section.localeCompare(right.section, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [courseById, scopedTimetableData, timetablePayload.termNumber]);

  const teacherOptions = useMemo(() => {
    return [...scopedFacultyData].sort((left, right) => left.name.localeCompare(right.name));
  }, [scopedFacultyData]);

  const classroomOptions = useMemo(() => {
    return [...scopedRoomData].sort((left, right) => left.name.localeCompare(right.name));
  }, [scopedRoomData]);

  useEffect(() => {
    if (!classOptions.length) {
      setSelectedClassKey("");
      return;
    }
    if (!classOptions.some((option) => option.key === selectedClassKey)) {
      setSelectedClassKey(classOptions[0].key);
    }
  }, [classOptions, selectedClassKey]);

  useEffect(() => {
    if (!teacherOptions.length) {
      setSelectedTeacherId("");
      return;
    }
    if (!teacherOptions.some((option) => option.id === selectedTeacherId)) {
      setSelectedTeacherId(teacherOptions[0].id);
    }
  }, [selectedTeacherId, teacherOptions]);

  useEffect(() => {
    if (!classroomOptions.length) {
      setSelectedClassroomId("");
      return;
    }
    if (!classroomOptions.some((option) => option.id === selectedClassroomId)) {
      setSelectedClassroomId(classroomOptions[0].id);
    }
  }, [classroomOptions, selectedClassroomId]);

  useEffect(() => {
    let isActive = true;
    if (!activeConstraintProgramId) {
      setProgramDailySlots([]);
      return () => {
        isActive = false;
      };
    }
    getProgramConstraint(activeConstraintProgramId)
      .then((constraint) => {
        if (!isActive) {
          return;
        }
        setProgramDailySlots(
          [...(constraint.daily_time_slots ?? [])].sort((left, right) =>
            left.start_time.localeCompare(right.start_time),
          ),
        );
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        setProgramDailySlots([]);
      });
    return () => {
      isActive = false;
    };
  }, [activeConstraintProgramId]);

  const activeFilterLabel = weeklyFilterType === "class" ? "Class" : weeklyFilterType === "teacher" ? "Teacher" : "Classroom";
  const activeFilterValue = weeklyFilterType === "class" ? selectedClassKey : weeklyFilterType === "teacher" ? selectedTeacherId : selectedClassroomId;

  const filteredWeeklySlots = useMemo(() => {
    const sanitize = (slots: TimeSlot[]): TimeSlot[] =>
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

    if (weeklyFilterType === "class") {
      const selected = classOptions.find((option) => option.key === selectedClassKey);
      if (!selected) {
        return [];
      }
      return sanitize(scopedTimetableData.filter((slot) => {
        const course = courseById.get(slot.courseId);
        const semesterNumber = typeof course?.semesterNumber === "number" && course.semesterNumber > 0
          ? course.semesterNumber
          : (timetablePayload.termNumber ?? null);
        const section = (slot.section ?? "").trim();
        return semesterNumber === selected.semesterNumber && section.localeCompare(selected.section, undefined, { sensitivity: "base" }) === 0;
      }));
    }

    if (weeklyFilterType === "teacher") {
      if (!selectedTeacherId) {
        return [];
      }
      return sanitize(scopedTimetableData.filter((slot) => {
        return slot.facultyId === selectedTeacherId || (slot.assistantFacultyIds ?? []).includes(selectedTeacherId);
      }));
    }

    if (!selectedClassroomId) {
      return [];
    }
    return sanitize(scopedTimetableData.filter((slot) => slot.roomId === selectedClassroomId));
  }, [
    classOptions,
    courseById,
    selectedClassKey,
    selectedClassroomId,
    selectedTeacherId,
    scopedTimetableData,
    timetablePayload.termNumber,
    weeklyFilterType,
  ]);

  const days = useMemo(() => {
    const uniqueDays = Array.from(new Set(filteredWeeklySlots.map((slot) => slot.day)));
    const ordered = DAY_ORDER.filter((day) => uniqueDays.includes(day));
    return ordered.length ? ordered : DAY_ORDER.slice(0, 5);
  }, [filteredWeeklySlots]);

  const weeklyRows = useMemo(
    () => buildDashboardRows(filteredWeeklySlots, programDailySlots),
    [filteredWeeklySlots, programDailySlots],
  );

  const weeklyCellEntries = useMemo(
    () => buildDashboardCellEntries(filteredWeeklySlots, courseById, facultyById, roomById),
    [courseById, facultyById, filteredWeeklySlots, roomById],
  );

  useEffect(() => {
    let isActive = true;
    fetchHealth()
      .then((data) => {
        if (!isActive) return;
        setHealthStatus(data.status === "ok" ? "ok" : "error");
      })
      .catch(() => {
        if (!isActive) return;
        setHealthStatus("error");
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    fetchTimetableAnalytics()
      .then((data) => {
        if (!isActive) return;
        setAnalytics(data);
        setAnalyticsError(null);
      })
      .catch((error) => {
        if (!isActive) return;
        const message = error instanceof Error ? error.message : "Unable to load analytics";
        setAnalyticsError(message);
      });

    return () => {
      isActive = false;
    };
  }, [hasOfficial]);

  useEffect(() => {
    let isActive = true;
    listPrograms()
      .then((items) => {
        if (!isActive) return;
        setPrograms(items);
      })
      .catch(() => {
        if (!isActive) return;
        setPrograms([]);
      });

    Promise.all([
      fetchTimetableConflicts(),
      listLeaveRequests("pending"),
      listSubstituteOffers(undefined, { scope: "all" }),
      listFeedback(),
      listIssues(),
    ])
      .then(([conflictReport, leaves, swaps, feedback, issues]) => {
        if (!isActive) return;
        setConflictPreview(
          conflictReport.conflicts
            .filter((conflict) => !conflict.resolved)
            .slice(0, 5)
            .map((conflict) => ({
              id: conflict.id,
              description: conflict.description || toTitleCase(conflict.conflict_type),
              severity: conflict.severity,
            })),
        );
        setLeavePreview(leaves.slice(0, 6));
        setSwapPreview(
          swaps
            .sort((left, right) => (right.updated_at ?? right.created_at).localeCompare(left.updated_at ?? left.created_at))
            .slice(0, 8),
        );
        setFeedbackPreview(feedback.slice(0, 5));
        setIssuePreview(issues.slice(0, 5));
        setOverlayError(null);
      })
      .catch((error) => {
        if (!isActive) return;
        setOverlayError(error instanceof Error ? error.message : "Unable to load dashboard queues");
      });

    return () => {
      isActive = false;
    };
  }, [hasOfficial]);

  useEffect(() => {
    let isActive = true;
    fetchSystemAnalytics(14, {
      programId: selectedProgramId === "all" ? undefined : selectedProgramId,
    })
      .then((payload) => {
        if (!isActive) return;
        setSystemAnalytics(payload);
        setSystemAnalyticsError(null);
      })
      .catch((error) => {
        if (!isActive) return;
        setSystemAnalyticsError(error instanceof Error ? error.message : "Unable to load system analytics");
      });
    return () => {
      isActive = false;
    };
  }, [hasOfficial, selectedProgramId]);

  const roomUtilizationPercent = systemAnalytics?.utilization.roomUtilizationPercent ?? 0;
  const facultyUtilizationPercent = systemAnalytics?.utilization.facultyUtilizationPercent ?? 0;
  const sectionCoveragePercent = systemAnalytics?.utilization.sectionCoveragePercent ?? 0;
  const totalRoomCapacity = systemAnalytics?.capacity.totalRoomCapacity ?? 0;
  const sectionCapacity = systemAnalytics?.capacity.configuredSectionCapacity ?? 0;
  const scheduledStudentSeats = systemAnalytics?.capacity.scheduledStudentSeats ?? 0;

  const metricDefinitionByKey = useMemo(() => {
    const output = new Map<string, { formula: string; definition: string; numerator: number; denominator: number }>();
    for (const item of systemAnalytics?.metricDefinitions ?? []) {
      output.set(item.key, {
        formula: item.formula,
        definition: item.definition,
        numerator: item.numerator,
        denominator: item.denominator,
      });
    }
    return output;
  }, [systemAnalytics?.metricDefinitions]);

  const operationsByType = useMemo(
    () => buildCountMap(systemAnalytics?.operations.notificationsByType ?? []),
    [systemAnalytics],
  );
  const operationsByLeaveStatus = useMemo(
    () => buildCountMap(systemAnalytics?.operations.leavesByStatus ?? []),
    [systemAnalytics],
  );
  const operationsByIssueStatus = useMemo(
    () => buildCountMap(systemAnalytics?.operations.issuesByStatus ?? []),
    [systemAnalytics],
  );
  const operationsByFeedbackStatus = useMemo(
    () => buildCountMap(systemAnalytics?.operations.feedbackByStatus ?? []),
    [systemAnalytics],
  );

  const loadOverlayQueues = useCallback(async () => {
    try {
      const [conflictReport, leaves, swaps, feedback, issues] = await Promise.all([
        fetchTimetableConflicts(),
        listLeaveRequests("pending"),
        listSubstituteOffers(undefined, { scope: "all" }),
        listFeedback(),
        listIssues(),
      ]);

      setConflictPreview(
        conflictReport.conflicts
          .filter((conflict) => !conflict.resolved)
          .slice(0, 5)
          .map((conflict) => ({
            id: conflict.id,
            description: conflict.description || toTitleCase(conflict.conflict_type),
            severity: conflict.severity,
          })),
      );
      setLeavePreview(leaves.slice(0, 6));
      setSwapPreview(
        swaps
          .sort((left, right) => (right.updated_at ?? right.created_at).localeCompare(left.updated_at ?? left.created_at))
          .slice(0, 8),
      );
      setFeedbackPreview(feedback.slice(0, 5));
      setIssuePreview(issues.slice(0, 5));
      setOverlayError(null);
    } catch (error) {
      setOverlayError(error instanceof Error ? error.message : "Unable to load dashboard queues");
    }
  }, []);

  const handleLeaveDecision = useCallback(
    async (leaveId: string, status: "approved" | "rejected") => {
      setLeaveActionBusyId(`${leaveId}:${status}`);
      try {
        await updateLeaveRequestStatus(leaveId, { status });
        await loadOverlayQueues();
      } catch (decisionError) {
        setOverlayError(decisionError instanceof Error ? decisionError.message : "Unable to update leave request");
      } finally {
        setLeaveActionBusyId(null);
      }
    },
    [loadOverlayQueues],
  );

  const handleExportCalendar = () => {
    const icsContent = generateICSContent(scopedTimetableData, {
      courses: scopedCourseData,
      rooms: scopedRoomData,
      faculty: scopedFacultyData,
    });
    const blob = new Blob([icsContent], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timetable.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Live operational view from published timetable data</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={healthStatus === "ok" ? "secondary" : "destructive"}>
            {healthStatus === "loading" ? "Backend: Checking..." : `Backend: ${healthStatus}`}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 bg-transparent">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCalendar}>
                <CalendarCheck className="h-4 w-4 mr-2" />
                Export as .ics
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/schedule">
                  <FileImage className="h-4 w-4 mr-2" />
                  Export as PNG
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/schedule">
                  <FileText className="h-4 w-4 mr-2" />
                  Export as PDF
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-3xl font-semibold tracking-tight">System Analytics & Insights</CardTitle>
              <CardDescription className="mt-2 text-base">
                Resource health, user activity, and timetable optimization quality in one view
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-[220px] space-y-1">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Program Picker</Label>
                <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select program" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All programs</SelectItem>
                    {programs.map((program) => (
                      <SelectItem key={program.id} value={program.id}>
                        {program.code} • {program.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button asChild className="h-10">
                <Link href="/analytics">
                  Go Analytics
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isProgramInCurrentTimetable && hasOfficial ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              The published timetable is scoped to another program. Switch Program Picker to matching program or "All programs".
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card className="border-muted/80">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Programs</p>
                    <p className="mt-1 text-3xl font-semibold">{systemAnalytics?.inventory.programs ?? 0}</p>
                  </div>
                  <div className="rounded-full bg-primary/10 p-3">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-muted/80">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Courses</p>
                    <p className="mt-1 text-3xl font-semibold">{systemAnalytics?.inventory.courses ?? 0}</p>
                  </div>
                  <div className="rounded-full bg-primary/10 p-3">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-muted/80">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Faculty</p>
                    <p className="mt-1 text-3xl font-semibold">{systemAnalytics?.inventory.faculty ?? 0}</p>
                  </div>
                  <div className="rounded-full bg-primary/10 p-3">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-muted/80">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Rooms</p>
                    <p className="mt-1 text-3xl font-semibold">{systemAnalytics?.inventory.roomsTotal ?? 0}</p>
                  </div>
                  <div className="rounded-full bg-primary/10 p-3">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-muted/80">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Users ({systemAnalytics?.activity.windowDays ?? 14}d)</p>
                    <p className="mt-1 text-3xl font-semibold">{systemAnalytics?.activity.activeUsers ?? 0}</p>
                  </div>
                  <div className="rounded-full bg-emerald-500/15 p-3">
                    <Gauge className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-muted/80">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Unread Notifications</p>
                    <p className="mt-1 text-3xl font-semibold">{systemAnalytics?.operations.unreadNotifications ?? 0}</p>
                  </div>
                  <div className="rounded-full bg-amber-500/15 p-3">
                    <BellRing className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          {systemAnalyticsError ? <p className="text-xs text-destructive">{systemAnalyticsError}</p> : null}
        </CardContent>
      </Card>

      {systemAnalytics ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">Analysis Context</CardTitle>
            <CardDescription>Scope, snapshot health, and interpretation guardrails for dashboard metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Card className="border-muted/70">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Timetable Scope</p>
                  <p className="mt-1 text-base font-semibold">
                    {systemAnalytics.scope.timetableScoped ? "Scoped Snapshot Active" : "Snapshot Out Of Scope"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{systemAnalytics.scope.timetableScopeNote}</p>
                </CardContent>
              </Card>
              <Card className="border-muted/70">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Published Slots</p>
                  <p className="mt-1 text-2xl font-semibold">{systemAnalytics.timetable.totalSlots}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sections: {systemAnalytics.timetable.sections} • Courses: {systemAnalytics.timetable.courses}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-muted/70">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Snapshot Updated</p>
                  <p className="mt-1 text-base font-semibold">{toLocalDate(systemAnalytics.timetable.updatedAt)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Generated: {toLocalDate(systemAnalytics.generatedAt)}</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Resource Utilization</CardTitle>
              <CardDescription className="mt-1">Coverage across rooms, faculty assignments, and configured sections</CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs">
              {selectedProgramId === "all" ? "All Programs" : selectedProgram?.code ?? "Unknown Program"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Room Utilization</span>
              <span className="font-medium">{roomUtilizationPercent.toFixed(1)}%</span>
            </div>
            <Progress value={roomUtilizationPercent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {metricDefinitionByKey.get("room_utilization")?.definition ?? "Room usage against available room-time capacity."}
            </p>
            <p className="text-xs text-muted-foreground">
              Formula: {metricDefinitionByKey.get("room_utilization")?.formula ?? "N/A"}
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Faculty Utilization</span>
              <span className="font-medium">{facultyUtilizationPercent.toFixed(1)}%</span>
            </div>
            <Progress value={facultyUtilizationPercent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {metricDefinitionByKey.get("faculty_utilization")?.definition ?? "Assigned faculty load against configured faculty max-hours."}
            </p>
            <p className="text-xs text-muted-foreground">
              Formula: {metricDefinitionByKey.get("faculty_utilization")?.formula ?? "N/A"}
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Section Coverage</span>
              <span className="font-medium">{sectionCoveragePercent.toFixed(1)}%</span>
            </div>
            <Progress value={sectionCoveragePercent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {metricDefinitionByKey.get("section_coverage")?.definition ?? "Configured sections represented in published timetable."}
            </p>
            <p className="text-xs text-muted-foreground">
              Formula: {metricDefinitionByKey.get("section_coverage")?.formula ?? "N/A"}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Card className="border-muted/70">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total Room Capacity</p>
                <p className="mt-1 text-3xl font-semibold">{totalRoomCapacity}</p>
              </CardContent>
            </Card>
            <Card className="border-muted/70">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Configured Seat Capacity</p>
                <p className="mt-1 text-3xl font-semibold">{sectionCapacity}</p>
              </CardContent>
            </Card>
            <Card className="border-muted/70">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Scheduled Seat-Periods</p>
                <p className="mt-1 text-3xl font-semibold">{scheduledStudentSeats}</p>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-md border border-muted/70 bg-muted/20 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Data Scope</p>
            <p>{systemAnalytics?.scope.timetableScopeNote ?? "Analytics scope information unavailable."}</p>
            <p className="mt-1">
              Snapshot: {systemAnalytics?.generatedAt ? toLocalDate(systemAnalytics.generatedAt) : "N/A"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Operational Queries</CardTitle>
          <CardDescription>Current status distribution for notifications, leaves, issues, and feedback</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Notifications</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(operationsByType).map(([label, count]) => (
                <Badge key={label} variant="outline" className="text-sm">{toTitleCase(label)}: {count}</Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Leave Requests</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(operationsByLeaveStatus).map(([label, count]) => (
                <Badge key={label} className="text-sm" variant={label === "pending" ? "default" : "secondary"}>
                  {toTitleCase(label)}: {count}
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Issues</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(operationsByIssueStatus).map(([label, count]) => (
                <Badge key={label} variant="outline" className="text-sm">{toTitleCase(label)}: {count}</Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Feedback</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(operationsByFeedbackStatus).map(([label, count]) => (
                <Badge key={label} variant="outline" className="text-sm">{toTitleCase(label)}: {count}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-auto justify-between p-4 bg-transparent">
              <span className="flex items-center gap-2">
                <MessageSquareWarning className="h-4 w-4 text-destructive" />
                Active Conflicts
              </span>
              <Badge variant="destructive">{conflictPreview.length}</Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[360px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">Active Conflicts</p>
                <Link href="/conflicts" className="text-xs text-primary hover:underline">Open page</Link>
              </div>
              {conflictPreview.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active conflicts.</p>
              ) : (
                <div className="space-y-2">
                  {conflictPreview.map((conflict) => (
                    <div key={conflict.id} className="rounded-md border p-2 text-sm">
                      <p className="line-clamp-2">{conflict.description}</p>
                      <Badge variant={conflict.severity === "hard" ? "destructive" : "secondary"} className="mt-2">
                        {conflict.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-auto justify-between p-4 bg-transparent">
              <span className="flex items-center gap-2">
                <GitPullRequestArrow className="h-4 w-4 text-amber-600" />
                Leave Requests
              </span>
              <Badge variant="secondary">{leavePreview.length + swapPreview.filter((item) => item.status === "pending").length}</Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-[440px]">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">Leave Management Window</p>
                <Button variant="ghost" size="sm" onClick={() => void loadOverlayQueues()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending Leave Requests</p>
                {leavePreview.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending leave requests.</p>
                ) : (
                  <div className="space-y-2">
                    {leavePreview.map((leave) => (
                      <div key={leave.id} className="rounded-md border p-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{leave.leave_type.toUpperCase()} • {leave.leave_date}</p>
                          <Badge variant="secondary">{leave.status}</Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-muted-foreground">{leave.reason}</p>
                        {leave.substitute_assignment ? (
                          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                            Mapping: {leave.substitute_assignment.substitute_faculty_name ?? leave.substitute_assignment.substitute_faculty_id}
                          </p>
                        ) : null}
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => void handleLeaveDecision(leave.id, "approved")}
                            disabled={leaveActionBusyId === `${leave.id}:approved`}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleLeaveDecision(leave.id, "rejected")}
                            disabled={leaveActionBusyId === `${leave.id}:rejected`}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Swap Details & Mapping</p>
                {swapPreview.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No swap activity yet.</p>
                ) : (
                  <div className="space-y-2">
                    {swapPreview.map((swap) => (
                      <div key={swap.id} className="rounded-md border p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{swap.course_code ?? "Course"} • Section {swap.section ?? "-"}</p>
                          <Badge variant={swap.status === "accepted" ? "default" : "secondary"}>{swap.status}</Badge>
                        </div>
                        <p className="text-muted-foreground">
                          {swap.day ?? ""} {swap.startTime ?? ""}-{swap.endTime ?? ""} • Room {swap.room_name ?? "-"}
                        </p>
                        <p className="text-muted-foreground">
                          Absent: {swap.absent_faculty_name ?? swap.absent_faculty_id ?? "-"} → Substitute: {swap.substitute_faculty_name ?? swap.substitute_faculty_id}
                        </p>
                        <p className="text-muted-foreground">Updated: {toLocalDate(swap.updated_at ?? swap.created_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-auto justify-between p-4 bg-transparent">
              <span className="flex items-center gap-2">
                <FileBarChart2 className="h-4 w-4 text-primary" />
                Reports & Feedback
              </span>
              <Badge variant="secondary">{feedbackPreview.length + issuePreview.length}</Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[380px]">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">Reports & Feedback Queue</p>
                <div className="flex items-center gap-2 text-xs">
                  <Link href="/feedback" className="text-primary hover:underline">Feedback</Link>
                  <span className="text-muted-foreground">|</span>
                  <Link href="/issues" className="text-primary hover:underline">Issues</Link>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Latest Feedback</p>
                {feedbackPreview.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No feedback items.</p>
                ) : (
                  feedbackPreview.map((feedback) => (
                    <div key={feedback.id} className="rounded-md border p-2 text-sm">
                      <p className="line-clamp-1 font-medium">{feedback.subject}</p>
                      <p className="text-muted-foreground">{toTitleCase(feedback.status)} • {toTitleCase(feedback.priority)}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Latest Issues</p>
                {issuePreview.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No issue items.</p>
                ) : (
                  issuePreview.map((issue) => (
                    <div key={issue.id} className="rounded-md border p-2 text-sm">
                      <p className="line-clamp-1">{issue.description}</p>
                      <p className="text-muted-foreground">{toTitleCase(issue.status)} • {toTitleCase(issue.category)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {overlayError ? <p className="text-xs text-destructive">{overlayError}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Button asChild className="h-auto py-4 flex-col gap-2">
          <Link href="/generator">
            <Calendar className="h-5 w-5" />
            <span>Generate Timetable</span>
          </Link>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-2 bg-transparent" asChild>
          <Link href="/schedule">
            <RefreshCw className="h-5 w-5" />
            <span>Review Current</span>
          </Link>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-2 bg-transparent" asChild>
          <Link href="/versions">
            <BarChart3 className="h-5 w-5" />
            <span>Compare Versions</span>
          </Link>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-2 bg-transparent" asChild>
          <Link href="/conflicts">
            <AlertTriangle className="h-5 w-5" />
            <span>Resolve Conflicts</span>
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Button variant="outline" className="h-auto p-4 justify-start border-dashed hover:border-primary/50" asChild>
          <Link href="/faculty" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-medium">Manage Faculty</p>
              <p className="text-xs text-muted-foreground">Update teaching resources</p>
            </div>
            <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
          </Link>
        </Button>
        <Button variant="outline" className="h-auto p-4 justify-start border-dashed hover:border-primary/50" asChild>
          <Link href="/courses" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-medium">Manage Courses</p>
              <p className="text-xs text-muted-foreground">Maintain course catalog</p>
            </div>
            <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
          </Link>
        </Button>
        <Button variant="outline" className="h-auto p-4 justify-start border-dashed hover:border-primary/50" asChild>
          <Link href="/rooms" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-medium">Manage Rooms</p>
              <p className="text-xs text-muted-foreground">Control room inventory</p>
            </div>
            <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
          </Link>
        </Button>
      </div>

      {timetableLoading ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Loading published timetable...</CardContent>
        </Card>
      ) : null}

      {timetableError ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">{timetableError}</CardContent>
        </Card>
      ) : null}

      {!timetableLoading && !hasOfficial ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">No Published Timetable</CardTitle>
            <CardDescription>Generate and publish a timetable to unlock analytics and role views.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/generator">Open Generator</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {hasOfficial ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Optimization Summary</CardTitle>
                <CardDescription>Computed from the currently published timetable</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Constraint Satisfaction</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-semibold">
                        {analytics?.optimizationSummary.constraintSatisfaction ?? 0}%
                      </span>
                      <Progress value={analytics?.optimizationSummary.constraintSatisfaction ?? 0} className="flex-1" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Conflicts Detected</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-semibold">{analytics?.optimizationSummary.conflictsDetected ?? 0}</span>
                      {(analytics?.optimizationSummary.conflictsDetected ?? 0) > 0 ? (
                        <Badge variant="outline" className="text-warning border-warning">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Review needed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-success border-success">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          All clear
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Technique</p>
                    <span className="text-sm font-medium">{analytics?.optimizationSummary.optimizationTechnique ?? ""}</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Estimated Iterations</p>
                    <span className="text-2xl font-semibold">{analytics?.optimizationSummary.totalIterations ?? 0}</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
                  <span>Compute time: {analytics?.optimizationSummary.computeTime ?? ""}</span>
                  <span>Generated: {analytics?.optimizationSummary.lastGenerated ? new Date(analytics.optimizationSummary.lastGenerated).toLocaleString() : ""}</span>
                </div>
                {analyticsError ? <p className="text-xs text-destructive mt-3">{analyticsError}</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Constraint Intelligence</CardTitle>
                <CardDescription>Live status of enforced scheduling rules</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Constraint</TableHead>
                      <TableHead className="text-right">Satisfaction</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(analytics?.constraintData ?? []).map((constraint) => (
                      <TableRow key={constraint.name}>
                        <TableCell>
                          <span className="font-medium">{constraint.name}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="tabular-nums">{constraint.satisfaction}%</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="outline"
                            className={
                              constraint.status === "satisfied"
                                ? "text-success border-success"
                                : constraint.status === "partial"
                                  ? "text-warning border-warning"
                                  : "text-destructive border-destructive"
                            }
                          >
                            {constraint.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Faculty Workload Analytics</CardTitle>
              <CardDescription>Assigned weekly teaching load from published timetable</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  workload: {
                    label: "Workload Hours",
                    color: "oklch(0.25 0.08 250)",
                  },
                }}
                className="h-[280px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics?.workloadChartData ?? []} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.90 0.01 250)" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "oklch(0.50 0.02 250)" }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "oklch(0.50 0.02 250)" }} />
                    <ChartTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-lg border bg-background p-3 shadow-md">
                              <p className="font-medium">{data.fullName}</p>
                              <p className="text-sm text-muted-foreground">{data.department}</p>
                              <p className="text-sm mt-1">Workload: {data.workload}h / {data.max}h</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="workload" radius={[4, 4, 0, 0]}>
                      {(analytics?.workloadChartData ?? []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.overloaded ? "oklch(0.55 0.20 27)" : "oklch(0.25 0.08 250)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Weekly Timetable Grid</CardTitle>
              <CardDescription>View weekly schedule by one filter at a time: Class, Teacher, or Classroom.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 overflow-x-auto">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Filter Type</Label>
                  <Select
                    value={weeklyFilterType}
                    onValueChange={(value) => setWeeklyFilterType(value as WeeklyFilterType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="class">Class</SelectItem>
                      <SelectItem value="teacher">Teacher</SelectItem>
                      <SelectItem value="classroom">Classroom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{activeFilterLabel}</Label>
                  <Select
                    value={activeFilterValue}
                    onValueChange={(value) => {
                      if (weeklyFilterType === "class") {
                        setSelectedClassKey(value);
                        return;
                      }
                      if (weeklyFilterType === "teacher") {
                        setSelectedTeacherId(value);
                        return;
                      }
                      setSelectedClassroomId(value);
                    }}
                    disabled={
                      weeklyFilterType === "class"
                        ? !classOptions.length
                        : weeklyFilterType === "teacher"
                          ? !teacherOptions.length
                          : !classroomOptions.length
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${activeFilterLabel.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {weeklyFilterType === "class"
                        ? classOptions.map((option) => (
                          <SelectItem key={option.key} value={option.key}>
                            {option.label}
                          </SelectItem>
                        ))
                        : null}
                      {weeklyFilterType === "teacher"
                        ? teacherOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))
                        : null}
                      {weeklyFilterType === "classroom"
                        ? classroomOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))
                        : null}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {filteredWeeklySlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No timetable entries are available for the selected {activeFilterLabel.toLowerCase()}.
                </p>
              ) : null}

              {!weeklyRows.length || !days.length ? (
                <p className="text-sm text-muted-foreground">No timetable data available for the selected view.</p>
              ) : (
                <WeeklyTimetableGrid
                  days={days}
                  rows={weeklyRows}
                  cellEntries={weeklyCellEntries}
                  emptyMessage="No timetable entries for this filter selection."
                />
              )}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded border border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30" /> Theory / Tutorial (T)
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" /> Lab
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" /> Elective
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded border border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/50" /> Block
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50" /> Break
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" /> Lunch
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
