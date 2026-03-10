"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  createCourse,
  listCourses,
  listFaculty,
  listPrograms,
  listRooms,
  updateCourse,
  type Course,
  type Faculty,
  type Program,
  type Room,
} from "@/lib/academic-api";
import {
  fetchFullOfficialTimetable,
  fetchTimetableVersionPayload,
  listTimetableVersions,
  publishOfficialTimetable,
  type OfficialTimetablePayload,
} from "@/lib/timetable-api";
import type { TimeSlot } from "@/lib/timetable-types";

const ELECTIVE_CATEGORY_OPTIONS = [
  "Professional Elective 1",
  "Professional Elective 2",
  "Professional Elective 3",
  "Professional Elective 4",
  "Professional Elective 5",
  "Open Elective",
  "Free Elective",
];

const EMPTY_ELECTIVE_FORM = {
  program_id: "inherit",
  code: "",
  name: "",
  elective_category: "Professional Elective 1",
  semester_number: 5,
  batch_year: 3,
  sections: 1,
  duration_hours: 1,
  theory_hours: 3,
  tutorial_hours: 0,
  lab_hours: 0,
  practical_contiguous_slots: 1,
  batch_segregation: false,
};

interface ManualAssignmentState {
  facultyId: string;
  roomId: string;
}

function deriveHoursPerWeek(lectureHours: number, tutorialHours: number, practicalHours: number): number {
  return Math.max(1, lectureHours + tutorialHours + practicalHours);
}

function computeRawCreditsFromLTP(lectureHours: number, tutorialHours: number, practicalHours: number): number {
  const raw = lectureHours + tutorialHours + practicalHours / 2;
  return Number(raw.toFixed(2));
}

function computeCreditsFromLTP(lectureHours: number, tutorialHours: number, practicalHours: number): number {
  const raw = computeRawCreditsFromLTP(lectureHours, tutorialHours, practicalHours);
  return Math.max(0, Math.floor(raw + 1e-9));
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }
  return hours * 60 + minutes;
}

function slotsOverlap(left: Pick<TimeSlot, "day" | "startTime" | "endTime">, right: Pick<TimeSlot, "day" | "startTime" | "endTime">): boolean {
  if (left.day !== right.day) {
    return false;
  }
  const leftStart = timeToMinutes(left.startTime);
  const leftEnd = timeToMinutes(left.endTime);
  const rightStart = timeToMinutes(right.startTime);
  const rightEnd = timeToMinutes(right.endTime);
  return leftStart < rightEnd && rightStart < leftEnd;
}

export default function ElectivesPage() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "scheduler";

  const [selectedProgramId, setSelectedProgramId] = useState<string>("all");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [officialPayload, setOfficialPayload] = useState<OfficialTimetablePayload | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const [assigningCourseId, setAssigningCourseId] = useState<string | null>(null);

  const [assignmentValues, setAssignmentValues] = useState<Record<string, ManualAssignmentState>>({});

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formValues, setFormValues] = useState({ ...EMPTY_ELECTIVE_FORM });

  const loadPrograms = useCallback(async () => {
    try {
      const items = await listPrograms();
      setPrograms(items);
    } catch {
      setPrograms([]);
    }
  }, []);

  const loadElectives = useCallback(async () => {
    setError(null);
    try {
      const data = await listCourses(selectedProgramId === "all" ? undefined : selectedProgramId);
      setCourses(data.filter((item) => item.type === "elective"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load electives.");
      setCourses([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedProgramId]);

  const loadResources = useCallback(async () => {
    try {
      const [facultyData, roomData] = await Promise.all([
        listFaculty(selectedProgramId === "all" ? undefined : selectedProgramId),
        listRooms(selectedProgramId === "all" ? undefined : selectedProgramId),
      ]);
      setFaculty(facultyData);
      setRooms(roomData);
    } catch {
      setFaculty([]);
      setRooms([]);
    }
  }, [selectedProgramId]);

  const loadOfficialSnapshot = useCallback(async () => {
    try {
      let payload = await fetchFullOfficialTimetable();
      if (!payload) {
        const versions = await listTimetableVersions();
        if (versions.length > 0) {
          const latest = versions[versions.length - 1];
          payload = await fetchTimetableVersionPayload(latest.id);
        }
      }
      if (!payload) {
        setOfficialPayload(null);
      } else if (selectedProgramId !== "all" && payload.programId && payload.programId !== selectedProgramId) {
        setOfficialPayload(null);
      } else {
        setOfficialPayload(payload);
      }
    } catch {
      setOfficialPayload(null);
    }
  }, [selectedProgramId]);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([loadElectives(), loadResources(), loadOfficialSnapshot()]);
    setIsRefreshing(false);
  }, [loadElectives, loadOfficialSnapshot, loadResources]);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const officialCourseSlots = useMemo(() => {
    const mapped = new Map<string, TimeSlot[]>();
    for (const slot of officialPayload?.timetableData ?? []) {
      const list = mapped.get(slot.courseId) ?? [];
      list.push(slot);
      mapped.set(slot.courseId, list);
    }
    return mapped;
  }, [officialPayload]);

  const assignedMinutesByFaculty = useMemo(() => {
    const minutesByFaculty = new Map<string, number>();
    for (const slot of officialPayload?.timetableData ?? []) {
      const start = timeToMinutes(slot.startTime);
      const end = timeToMinutes(slot.endTime);
      const duration = Math.max(0, end - start);
      minutesByFaculty.set(slot.facultyId, (minutesByFaculty.get(slot.facultyId) ?? 0) + duration);
    }
    return minutesByFaculty;
  }, [officialPayload]);

  const electivesByCategory = useMemo(() => {
    const grouped = new Map<string, Course[]>();
    for (const course of courses) {
      const category = (course.elective_category ?? "").trim() || "Uncategorized";
      const bucket = grouped.get(category) ?? [];
      bucket.push(course);
      grouped.set(category, bucket);
    }
    return Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, items]) => [
        category,
        [...items].sort((left, right) => left.code.localeCompare(right.code)),
      ] as const);
  }, [courses]);

  const pendingCount = useMemo(
    () => courses.filter((item) => !item.assign_faculty || !item.assign_classroom).length,
    [courses],
  );

  const hasScheduledTimetable = Boolean(officialPayload && officialPayload.timetableData.length > 0);

  const getManualAssignment = useCallback(
    (course: Course): ManualAssignmentState => {
      return assignmentValues[course.id] ?? {
        facultyId: course.faculty_id ?? "",
        roomId: course.default_room_id ?? "",
      };
    },
    [assignmentValues],
  );

  const setManualAssignment = useCallback((courseId: string, patch: Partial<ManualAssignmentState>) => {
    setAssignmentValues((prev) => {
      const existing = prev[courseId] ?? { facultyId: "", roomId: "" };
      return { ...prev, [courseId]: { ...existing, ...patch } };
    });
  }, []);

  const availableFacultyForCourse = useCallback((course: Course): Faculty[] => {
    if (!officialPayload) {
      return [];
    }
    const targetSlots = officialCourseSlots.get(course.id) ?? [];
    if (targetSlots.length === 0) {
      return [];
    }
    const nonTargetSlots = officialPayload.timetableData.filter((slot) => slot.courseId !== course.id);
    const uniqueWindows = new Map<string, { day: string; startTime: string; endTime: string }>();
    for (const slot of targetSlots) {
      const key = `${slot.day}|${slot.startTime}|${slot.endTime}`;
      if (!uniqueWindows.has(key)) {
        uniqueWindows.set(key, { day: slot.day, startTime: slot.startTime, endTime: slot.endTime });
      }
    }
    const windowDurations = Array.from(uniqueWindows.values()).map((window) =>
      Math.max(0, timeToMinutes(window.endTime) - timeToMinutes(window.startTime)),
    );
    const targetDurationMinutes = windowDurations.reduce((total, value) => total + value, 0);

    return faculty.filter((member) => {
      const conflict = nonTargetSlots.some(
        (slot) =>
          slot.facultyId === member.id &&
          Array.from(uniqueWindows.values()).some((window) => slotsOverlap(slot, window)),
      );
      if (conflict) {
        return false;
      }
      const currentMinutes = assignedMinutesByFaculty.get(member.id) ?? 0;
      const maxMinutes = Math.max(0, Number(member.max_hours ?? 0) * 60);
      return maxMinutes === 0 || currentMinutes + targetDurationMinutes <= maxMinutes;
    });
  }, [assignedMinutesByFaculty, faculty, officialCourseSlots, officialPayload]);

  const availableRoomsForCourse = useCallback((course: Course): Room[] => {
    if (!officialPayload) {
      return [];
    }
    const targetSlots = officialCourseSlots.get(course.id) ?? [];
    if (targetSlots.length === 0) {
      return [];
    }
    const nonTargetSlots = officialPayload.timetableData.filter((slot) => slot.courseId !== course.id);
    const maxStudentCount = Math.max(0, ...targetSlots.map((slot) => slot.studentCount ?? 0));
    const uniqueWindows = new Map<string, { day: string; startTime: string; endTime: string }>();
    for (const slot of targetSlots) {
      const key = `${slot.day}|${slot.startTime}|${slot.endTime}`;
      if (!uniqueWindows.has(key)) {
        uniqueWindows.set(key, { day: slot.day, startTime: slot.startTime, endTime: slot.endTime });
      }
    }
    return rooms.filter((room) => {
      if (maxStudentCount > 0 && room.capacity < maxStudentCount) {
        return false;
      }
      return !nonTargetSlots.some(
        (slot) =>
          slot.roomId === room.id &&
          Array.from(uniqueWindows.values()).some((window) => slotsOverlap(slot, window)),
      );
    });
  }, [officialCourseSlots, officialPayload, rooms]);

  const applyAssignmentToCourse = useCallback(
    async (course: Course, preferredFacultyId?: string, preferredRoomId?: string) => {
      setAssignmentError(null);
      setAssignmentMessage(null);
      setAssigningCourseId(course.id);
      try {
        if (!officialPayload) {
          throw new Error("Generate timetable first. Elective assignment is enabled only after scheduling.");
        }

        const targetSlots = officialCourseSlots.get(course.id) ?? [];
        if (targetSlots.length === 0) {
          throw new Error(`No fixed timetable slots found for ${course.code}.`);
        }

        const availableFaculty = availableFacultyForCourse(course);
        const availableRooms = availableRoomsForCourse(course);
        const manual = getManualAssignment(course);

        const nextFacultyId = preferredFacultyId ?? manual.facultyId;
        const nextRoomId = preferredRoomId ?? manual.roomId;

        if (!nextFacultyId) {
          throw new Error("Select a faculty member before assigning.");
        }
        if (!nextRoomId) {
          throw new Error("Select a classroom before assigning.");
        }

        if (!availableFaculty.some((member) => member.id === nextFacultyId)) {
          throw new Error("Selected faculty is not available in one or more fixed slots.");
        }
        if (!availableRooms.some((room) => room.id === nextRoomId)) {
          throw new Error("Selected classroom is not available in one or more fixed slots.");
        }

        const cloned = JSON.parse(JSON.stringify(officialPayload)) as OfficialTimetablePayload;
        let touched = false;
        for (const slot of cloned.timetableData) {
          if (slot.courseId !== course.id) {
            continue;
          }
          slot.facultyId = nextFacultyId;
          slot.roomId = nextRoomId;
          touched = true;
        }
        const courseRow = cloned.courseData.find((entry) => entry.id === course.id);
        if (courseRow) {
          courseRow.facultyId = nextFacultyId;
        }
        if (touched) {
          await publishOfficialTimetable(cloned, `Elective allotment • ${course.code}`, false);
          setOfficialPayload(cloned);
        }

        const updated = await updateCourse(course.id, {
          assign_faculty: true,
          assign_classroom: true,
          faculty_id: nextFacultyId,
          default_room_id: nextRoomId,
        });
        setCourses((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        setAssignmentValues((prev) => ({
          ...prev,
          [course.id]: {
            facultyId: updated.faculty_id ?? "",
            roomId: updated.default_room_id ?? "",
          },
        }));
        setAssignmentMessage(
          `${course.code} assigned successfully. Timetable, faculty view, and room occupancy are updated immediately.`,
        );
      } catch (err) {
        setAssignmentError(err instanceof Error ? err.message : "Unable to assign elective resources.");
      } finally {
        setAssigningCourseId(null);
      }
    },
    [availableFacultyForCourse, availableRoomsForCourse, getManualAssignment, officialCourseSlots, officialPayload],
  );

  const autoAllotElectiveCourse = useCallback(async (course: Course) => {
    const targetSlots = officialCourseSlots.get(course.id) ?? [];
    if (targetSlots.length === 0) {
      setAssignmentError(`No fixed timetable slots found for ${course.code}. Generate timetable first.`);
      return;
    }
    const availableFaculty = availableFacultyForCourse(course);
    const availableRooms = availableRoomsForCourse(course);
    if (availableFaculty.length === 0 || availableRooms.length === 0) {
      setAssignmentError(`No conflict-safe faculty/classroom combination available for ${course.code}.`);
      return;
    }
    const rankedFaculty = [...availableFaculty].sort((left, right) => {
      const leftMinutes = assignedMinutesByFaculty.get(left.id) ?? 0;
      const rightMinutes = assignedMinutesByFaculty.get(right.id) ?? 0;
      return leftMinutes - rightMinutes;
    });
    await applyAssignmentToCourse(course, rankedFaculty[0].id, availableRooms[0].id);
  }, [applyAssignmentToCourse, assignedMinutesByFaculty, availableFacultyForCourse, availableRoomsForCourse, officialCourseSlots]);

  const handleCreateElective = async () => {
    setError(null);
    try {
      const resolvedProgramId =
        formValues.program_id === "inherit"
          ? (selectedProgramId === "all" ? undefined : selectedProgramId)
          : formValues.program_id;
      if (!resolvedProgramId) {
        throw new Error("Select a program filter or choose an explicit program before creating an elective.");
      }

      const hours_per_week = deriveHoursPerWeek(
        formValues.theory_hours,
        formValues.tutorial_hours,
        formValues.lab_hours,
      );
      const credits = computeCreditsFromLTP(
        formValues.theory_hours,
        formValues.tutorial_hours,
        formValues.lab_hours,
      );
      const practical_contiguous_slots = formValues.lab_hours > 0
        ? Math.max(1, Math.min(formValues.practical_contiguous_slots, formValues.lab_hours))
        : 1;

      const created = await createCourse({
        program_id: resolvedProgramId,
        code: formValues.code.trim(),
        name: formValues.name.trim(),
        type: "elective",
        credits,
        duration_hours: formValues.duration_hours,
        sections: formValues.sections,
        hours_per_week,
        semester_number: formValues.semester_number,
        batch_year: formValues.batch_year,
        theory_hours: formValues.theory_hours,
        tutorial_hours: formValues.tutorial_hours,
        lab_hours: formValues.lab_hours,
        batch_segregation: formValues.batch_segregation,
        practical_contiguous_slots,
        assign_faculty: false,
        assign_classroom: false,
        default_room_id: null,
        elective_category: formValues.elective_category.trim() || "Uncategorized",
        faculty_id: null,
      });
      setCourses((prev) => [...prev, created]);
      setIsAddDialogOpen(false);
      setFormValues({ ...EMPTY_ELECTIVE_FORM });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create elective.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1720px] space-y-6 px-1">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Elective Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add elective options and run second-pass faculty/classroom assignment on fixed timetable slots.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void refreshAll()} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canManage ? (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Elective
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[620px]">
                <DialogHeader>
                  <DialogTitle>Add Elective Course</DialogTitle>
                  <DialogDescription>
                    Create an elective option. Faculty and classroom will be allotted after timetable slots are fixed.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2 sm:grid-cols-2">
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="elective-program">Associated Program</Label>
                    <Select
                      value={formValues.program_id}
                      onValueChange={(value) => setFormValues((prev) => ({ ...prev, program_id: value }))}
                    >
                      <SelectTrigger id="elective-program">
                        <SelectValue placeholder="Select a program" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">Use selected page filter</SelectItem>
                        {programs.map((program) => (
                          <SelectItem key={program.id} value={program.id}>
                            {program.code} - {program.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="elective-code">Course Code</Label>
                    <Input
                      id="elective-code"
                      value={formValues.code}
                      onChange={(event) => setFormValues((prev) => ({ ...prev, code: event.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="elective-name">Course Name</Label>
                    <Input
                      id="elective-name"
                      value={formValues.name}
                      onChange={(event) => setFormValues((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="elective-category">Elective Category</Label>
                    <Select
                      value={formValues.elective_category}
                      onValueChange={(value) => setFormValues((prev) => ({ ...prev, elective_category: value }))}
                    >
                      <SelectTrigger id="elective-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {ELECTIVE_CATEGORY_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="elective-semester">Semester</Label>
                    <Input
                      id="elective-semester"
                      type="number"
                      value={formValues.semester_number}
                      onChange={(event) =>
                        setFormValues((prev) => ({ ...prev, semester_number: Math.max(1, Number(event.target.value)) }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="elective-batch">Batch Year</Label>
                    <Input
                      id="elective-batch"
                      type="number"
                      value={formValues.batch_year}
                      onChange={(event) =>
                        setFormValues((prev) => ({ ...prev, batch_year: Math.max(1, Number(event.target.value)) }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="elective-sections">Sections</Label>
                    <Input
                      id="elective-sections"
                      type="number"
                      value={formValues.sections}
                      onChange={(event) =>
                        setFormValues((prev) => ({ ...prev, sections: Math.max(1, Number(event.target.value)) }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="elective-duration">Duration (hours)</Label>
                    <Input
                      id="elective-duration"
                      type="number"
                      value={formValues.duration_hours}
                      onChange={(event) =>
                        setFormValues((prev) => ({ ...prev, duration_hours: Math.max(1, Number(event.target.value)) }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="elective-l">L (Lecture / Week)</Label>
                    <Input
                      id="elective-l"
                      type="number"
                      value={formValues.theory_hours}
                      onChange={(event) =>
                        setFormValues((prev) => ({ ...prev, theory_hours: Math.max(0, Number(event.target.value)) }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="elective-t">T (Tutorial / Week)</Label>
                    <Input
                      id="elective-t"
                      type="number"
                      value={formValues.tutorial_hours}
                      onChange={(event) =>
                        setFormValues((prev) => ({ ...prev, tutorial_hours: Math.max(0, Number(event.target.value)) }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="elective-p">P (Practical / Week)</Label>
                    <Input
                      id="elective-p"
                      type="number"
                      value={formValues.lab_hours}
                      onChange={(event) =>
                        setFormValues((prev) => ({
                          ...prev,
                          lab_hours: Math.max(0, Number(event.target.value)),
                          practical_contiguous_slots: Math.max(
                            1,
                            Math.min(Math.max(1, Number(prev.practical_contiguous_slots)), Math.max(1, Number(event.target.value))),
                          ),
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="elective-credits">Credits</Label>
                    <Input
                      id="elective-credits"
                      value={computeCreditsFromLTP(formValues.theory_hours, formValues.tutorial_hours, formValues.lab_hours)}
                      readOnly
                    />
                    <p className="text-xs text-muted-foreground">Computed as L + T + (P / 2), then institution rule is applied.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => void handleCreateElective()}>Save Elective</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {assignmentError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {assignmentError}
        </div>
      ) : null}
      {assignmentMessage ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
          {assignmentMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Elective Courses</CardDescription>
            <CardTitle className="text-3xl">{courses.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Pending Assignment</CardDescription>
            <CardTitle className="text-3xl">{pendingCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Assigned</CardDescription>
            <CardTitle className="text-3xl">{Math.max(0, courses.length - pendingCount)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Scheduled Snapshot</CardDescription>
            <CardTitle className="text-lg">{hasScheduledTimetable ? "Available" : "Not Available"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Program Scope</CardTitle>
          <CardDescription>Select a program. Assignment is enabled only after timetable scheduling creates fixed slots.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
            <SelectTrigger className="w-full max-w-[380px]">
              <SelectValue placeholder="Program" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Programs</SelectItem>
              {programs.map((program) => (
                <SelectItem key={program.id} value={program.id}>
                  {program.code} - {program.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!hasScheduledTimetable ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Generate timetable first. After slots are fixed, use Assign/Auto Assign to allocate faculty and classroom without changing time slots.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Elective Assignment</CardTitle>
          <CardDescription>
            Add electives by category and assign resources on fixed slots. Assignment updates class, faculty, and room timetables immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading electives...</p>
          ) : electivesByCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No electives configured for the selected scope.</p>
          ) : (
            electivesByCategory.map(([category, categoryCourses]) => (
              <div key={`elective-category-${category}`} className="rounded-lg border p-4">
                <p className="text-sm font-semibold">{category}</p>
                <div className="mt-3 space-y-3">
                  {categoryCourses.map((course) => {
                    const slots = officialCourseSlots.get(course.id) ?? [];
                    const manual = getManualAssignment(course);
                    const availableFaculty = availableFacultyForCourse(course);
                    const availableRooms = availableRoomsForCourse(course);
                    const canAssign = hasScheduledTimetable && slots.length > 0;

                    return (
                      <div key={course.id} className="rounded-md border p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">{course.code} • {course.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Semester {course.semester_number} • Slots found: {slots.length}
                            </p>
                            {slots.length > 0 ? (
                              <p className="text-xs text-muted-foreground">
                                {slots
                                  .slice(0, 3)
                                  .map((slot) => `${slot.day} ${slot.startTime}-${slot.endTime}`)
                                  .join(" • ")}
                                {slots.length > 3 ? " • ..." : ""}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={course.assign_faculty ? "outline" : "destructive"}>
                              Faculty {course.assign_faculty ? "Assigned" : "Pending"}
                            </Badge>
                            <Badge variant={course.assign_classroom ? "outline" : "destructive"}>
                              Room {course.assign_classroom ? "Assigned" : "Pending"}
                            </Badge>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Faculty</Label>
                            <Select
                              value={manual.facultyId || "__none__"}
                              onValueChange={(value) =>
                                setManualAssignment(course.id, { facultyId: value === "__none__" ? "" : value })
                              }
                              disabled={!canAssign}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select faculty" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Unassigned</SelectItem>
                                {availableFaculty.map((member) => (
                                  <SelectItem key={member.id} value={member.id}>
                                    {member.name} • Max {member.max_hours}h/week
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Available for fixed slots: {availableFaculty.length}</p>
                          </div>
                          <div className="space-y-2">
                            <Label>Classroom</Label>
                            <Select
                              value={manual.roomId || "__none__"}
                              onValueChange={(value) =>
                                setManualAssignment(course.id, { roomId: value === "__none__" ? "" : value })
                              }
                              disabled={!canAssign}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select classroom" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Unassigned</SelectItem>
                                {availableRooms.map((room) => (
                                  <SelectItem key={room.id} value={room.id}>
                                    {room.name} • Capacity {room.capacity}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Available for fixed slots: {availableRooms.length}</p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void autoAllotElectiveCourse(course)}
                            disabled={!canAssign || assigningCourseId === course.id}
                          >
                            {assigningCourseId === course.id ? "Assigning..." : "Auto Assign"}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => void applyAssignmentToCourse(course)}
                            disabled={!canAssign || assigningCourseId === course.id}
                          >
                            {assigningCourseId === course.id ? "Assigning..." : "Assign"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
