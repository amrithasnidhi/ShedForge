"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Edit, Trash2, Filter, RefreshCw, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useAuth } from "@/components/auth-provider";
import {
    createCourse,
    deleteCourse,
    listFaculty,
    listCourses,
    listPrograms,
    listRooms,
    updateCourse,
    type Course,
    type CourseType,
    type Faculty,
    type CourseUpdate,
    type Program,
    type Room,
} from "@/lib/academic-api";
import { fetchFullOfficialTimetable, publishOfficialTimetable, type OfficialTimetablePayload } from "@/lib/timetable-api";
import type { TimeSlot } from "@/lib/timetable-types";

const EMPTY_FORM_VALUES = {
    program_id: "inherit",
    code: "",
    name: "",
    type: "theory" as CourseType,
    credits: 3,
    sections: 1,
    hours_per_week: 3,
    duration_hours: 1,
    semester_number: 1,
    batch_year: 1,
    theory_hours: 3,
    tutorial_hours: 0,
    lab_hours: 0,
    batch_segregation: true,
    practical_contiguous_slots: 1,
    assign_faculty: true,
    assign_classroom: true,
    elective_category: "",
};
const COURSES_CACHE_KEY = "shedforge_courses_cache_v1";
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

function maxPracticalTogetherSlots(lectureHours: number, tutorialHours: number, practicalHours: number): number {
    void lectureHours;
    void tutorialHours;
    return Math.max(1, practicalHours);
}

function formatCredits(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
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

export default function CoursesPage() {
    const { user } = useAuth();
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
    const canManage = user?.role === "admin" || user?.role === "scheduler";
    const [searchQuery, setSearchQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [selectedProgramId, setSelectedProgramId] = useState<string>("all");
    const [programs, setPrograms] = useState<Program[]>([]);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [courses, setCourses] = useState<Course[]>([]);
    const [faculty, setFaculty] = useState<Faculty[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [officialPayload, setOfficialPayload] = useState<OfficialTimetablePayload | null>(null);
    const [assignmentValues, setAssignmentValues] = useState<Record<string, ManualAssignmentState>>({});
    const [assignmentError, setAssignmentError] = useState<string | null>(null);
    const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
    const [assigningCourseId, setAssigningCourseId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRetrying, setIsRetrying] = useState(false);
    const [loadedFromCache, setLoadedFromCache] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formValues, setFormValues] = useState({
        ...EMPTY_FORM_VALUES,
    });
    const [editCourse, setEditCourse] = useState<Course | null>(null);
    const [editFormValues, setEditFormValues] = useState<CourseUpdate>({
        ...EMPTY_FORM_VALUES,
    });

    const loadCourses = useCallback(async () => {
        setError(null);
        try {
            const data = await listCourses(selectedProgramId === "all" ? undefined : selectedProgramId);
            setCourses(data);
            setLoadedFromCache(false);
            if (typeof window !== "undefined") {
                window.localStorage.setItem(COURSES_CACHE_KEY, JSON.stringify(data));
            }
        } catch (err) {
            const rawMessage = err instanceof Error ? err.message : "Unable to load courses";
            let cachedCourses: Course[] = [];
            if (typeof window !== "undefined") {
                const cached = window.localStorage.getItem(COURSES_CACHE_KEY);
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached) as Course[];
                        if (Array.isArray(parsed)) {
                            cachedCourses = parsed;
                        }
                    } catch {
                        cachedCourses = [];
                    }
                }
            }
            if (cachedCourses.length > 0) {
                setCourses(cachedCourses);
                setLoadedFromCache(true);
            }
            const message = rawMessage === "Failed to fetch"
                ? `Unable to reach backend API at ${apiBaseUrl}. Start backend and verify CORS/auth.`
                : rawMessage;
            setError(message);
        } finally {
            setIsLoading(false);
            setIsRetrying(false);
        }
    }, [apiBaseUrl, selectedProgramId]);

    const retryLoadCourses = async () => {
        setIsRetrying(true);
        await loadCourses();
    };

    useEffect(() => {
        void loadCourses();
    }, [loadCourses]);

    useEffect(() => {
        const loadPrograms = async () => {
            try {
                const items = await listPrograms();
                setPrograms(items);
            } catch {
                setPrograms([]);
            }
        };
        void loadPrograms();
    }, []);

    useEffect(() => {
        const loadAssignmentResources = async () => {
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
        };
        void loadAssignmentResources();
    }, [selectedProgramId]);

    useEffect(() => {
        const loadOfficialPayload = async () => {
            try {
                const payload = await fetchFullOfficialTimetable();
                if (!payload) {
                    setOfficialPayload(null);
                    return;
                }
                if (selectedProgramId !== "all" && payload.programId && payload.programId !== selectedProgramId) {
                    setOfficialPayload(null);
                    return;
                }
                setOfficialPayload(payload);
            } catch {
                setOfficialPayload(null);
            }
        };
        void loadOfficialPayload();
    }, [selectedProgramId]);

    const syncDerivedValues = <T extends {
        theory_hours: number;
        tutorial_hours: number;
        lab_hours: number;
        practical_contiguous_slots?: number;
        batch_segregation?: boolean;
    }>(values: T) => {
        const hours_per_week = deriveHoursPerWeek(values.theory_hours, values.tutorial_hours, values.lab_hours);
        const credits = computeCreditsFromLTP(values.theory_hours, values.tutorial_hours, values.lab_hours);
        const practical_contiguous_slots = values.lab_hours > 0
            ? Math.min(
                Math.max(1, values.practical_contiguous_slots ?? 1),
                maxPracticalTogetherSlots(values.theory_hours, values.tutorial_hours, values.lab_hours),
            )
            : 1;
        return {
            ...values,
            hours_per_week,
            credits,
            practical_contiguous_slots,
        };
    };

    const handleAddCourse = async () => {
        setError(null);
        try {
            const resolvedProgramId =
                formValues.program_id === "inherit"
                    ? (selectedProgramId === "all" ? undefined : selectedProgramId)
                    : formValues.program_id;
            const normalized = syncDerivedValues(formValues);
            const created = await createCourse({
                ...normalized,
                program_id: resolvedProgramId,
                assign_faculty: normalized.assign_faculty,
                assign_classroom: normalized.assign_classroom,
                elective_category: normalized.elective_category.trim() || null,
                faculty_id: null,
                default_room_id: null,
            });
            setCourses((prev) => [...prev, created]);
            setIsAddDialogOpen(false);
            setFormValues({ ...EMPTY_FORM_VALUES });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to create course";
            setError(message);
        }
    };

    const handleDeleteCourse = async (courseId: string) => {
        if (!window.confirm("Delete this course?")) {
            return;
        }
        setError(null);
        try {
            await deleteCourse(courseId);
            setCourses((prev) => prev.filter((course) => course.id !== courseId));
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to delete course";
            setError(message);
        }
    };

    const openEditCourse = (course: Course) => {
        setEditCourse(course);
        setEditFormValues({
            program_id: course.program_id,
            code: course.code,
            name: course.name,
            type: course.type,
            credits: course.credits,
            sections: course.sections,
            hours_per_week: course.hours_per_week,
            duration_hours: course.duration_hours,
            semester_number: course.semester_number,
            batch_year: course.batch_year,
            theory_hours: course.theory_hours,
            lab_hours: course.lab_hours,
            tutorial_hours: course.tutorial_hours,
            batch_segregation: course.batch_segregation,
            practical_contiguous_slots: course.practical_contiguous_slots,
            assign_faculty: course.assign_faculty,
            assign_classroom: course.assign_classroom,
            elective_category: course.elective_category ?? "",
            default_room_id: course.default_room_id ?? null,
            faculty_id: course.faculty_id ?? null,
        });
        setIsEditDialogOpen(true);
    };

    const handleUpdateCourse = async () => {
        if (!editCourse) {
            return;
        }
        setError(null);
        try {
            const normalized = syncDerivedValues({
                    program_id: editFormValues.program_id ?? editCourse.program_id,
                    code: editFormValues.code ?? "",
                    name: editFormValues.name ?? "",
                    type: (editFormValues.type ?? "theory") as CourseType,
                    credits: Number(editFormValues.credits ?? 0),
                    sections: Number(editFormValues.sections ?? 1),
                    hours_per_week: Number(editFormValues.hours_per_week ?? 1),
                    duration_hours: Number(editFormValues.duration_hours ?? 1),
                    semester_number: Number(editFormValues.semester_number ?? 1),
                    batch_year: Number(editFormValues.batch_year ?? 1),
                    theory_hours: Number(editFormValues.theory_hours ?? 0),
                    tutorial_hours: Number(editFormValues.tutorial_hours ?? 0),
                    lab_hours: Number(editFormValues.lab_hours ?? 0),
                    batch_segregation: Boolean(editFormValues.batch_segregation ?? true),
                    practical_contiguous_slots: Number(editFormValues.practical_contiguous_slots ?? 1),
                    assign_faculty: Boolean(editFormValues.assign_faculty ?? true),
                    assign_classroom: Boolean(editFormValues.assign_classroom ?? true),
                    elective_category: String(editFormValues.elective_category ?? ""),
                    faculty_id: editFormValues.faculty_id ?? null,
                    default_room_id: editFormValues.default_room_id ?? null,
                });
            const updated = await updateCourse(editCourse.id, {
                ...normalized,
                elective_category: (normalized.elective_category ?? "").trim() || null,
            });
            setCourses((prev) => prev.map((course) => (course.id === updated.id ? updated : course)));
            setIsEditDialogOpen(false);
            setEditCourse(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to update course";
            setError(message);
        }
    };

    const nonElectiveCourses = useMemo(
        () => courses.filter((course) => course.type !== "elective"),
        [courses],
    );
    const filteredCourses = nonElectiveCourses.filter((course) => {
        const matchesSearch =
            course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            course.code.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === "all" || course.type === typeFilter;
        return matchesSearch && matchesType;
    });

    const courseTypes = useMemo(() => Array.from(new Set(nonElectiveCourses.map((c) => c.type))), [nonElectiveCourses]);
    const programById = useMemo(() => new Map(programs.map((program) => [program.id, program])), [programs]);
    const theoryCourses = nonElectiveCourses.filter((c) => c.type === "theory").length;
    const labCourses = nonElectiveCourses.filter((c) => c.type === "lab").length;
    const attentionNeededCourses = useMemo(
        () => courses.filter((course) => !course.assign_faculty || !course.assign_classroom),
        [courses],
    );
    const electiveCatalog = useMemo(
        () => courses.filter((course) => course.type === "elective"),
        [courses],
    );
    const electivesByCategory = useMemo(() => {
        const grouped = new Map<string, Course[]>();
        for (const course of electiveCatalog) {
            const category = course.elective_category?.trim() || "Uncategorized";
            const bucket = grouped.get(category) ?? [];
            bucket.push(course);
            grouped.set(category, bucket);
        }
        return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
    }, [electiveCatalog]);

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
            return faculty;
        }
        const targetSlots = officialCourseSlots.get(course.id) ?? [];
        if (targetSlots.length === 0) {
            return faculty;
        }
        const nonTargetSlots = officialPayload.timetableData.filter((slot) => slot.courseId !== course.id);
        const uniqueWindows = new Map<string, { day: string; startTime: string; endTime: string }>();
        for (const slot of targetSlots) {
            const key = `${slot.day}|${slot.startTime}|${slot.endTime}`;
            if (!uniqueWindows.has(key)) {
                uniqueWindows.set(key, {
                    day: slot.day,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                });
            }
        }
        const windowDurations = Array.from(uniqueWindows.values()).map((window) => {
            return Math.max(0, timeToMinutes(window.endTime) - timeToMinutes(window.startTime));
        });
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
            return rooms;
        }
        const targetSlots = officialCourseSlots.get(course.id) ?? [];
        if (targetSlots.length === 0) {
            return rooms;
        }
        const nonTargetSlots = officialPayload.timetableData.filter((slot) => slot.courseId !== course.id);
        const maxStudentCount = Math.max(0, ...targetSlots.map((slot) => slot.studentCount ?? 0));
        const uniqueWindows = new Map<string, { day: string; startTime: string; endTime: string }>();
        for (const slot of targetSlots) {
            const key = `${slot.day}|${slot.startTime}|${slot.endTime}`;
            if (!uniqueWindows.has(key)) {
                uniqueWindows.set(key, {
                    day: slot.day,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                });
            }
        }
        return rooms.filter((room) => {
            if (course.type === "lab" && room.type !== "lab") {
                return false;
            }
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

    const applyAssignmentToCourse = useCallback(async (course: Course, preferredFacultyId?: string, preferredRoomId?: string) => {
        setAssignmentError(null);
        setAssignmentMessage(null);
        setAssigningCourseId(course.id);
        try {
            const availableFaculty = availableFacultyForCourse(course);
            const availableRooms = availableRoomsForCourse(course);
            const manual = getManualAssignment(course);

            const nextFacultyId = preferredFacultyId ?? manual.facultyId;
            const nextRoomId = preferredRoomId ?? manual.roomId;

            if (!course.assign_faculty && !nextFacultyId) {
                throw new Error("Select a faculty member before applying assignment.");
            }
            if (!course.assign_classroom && !nextRoomId) {
                throw new Error("Select a classroom before applying assignment.");
            }
            if (!course.assign_faculty && nextFacultyId && !availableFaculty.some((member) => member.id === nextFacultyId)) {
                throw new Error("Selected faculty is not available in one or more fixed slots.");
            }
            if (!course.assign_classroom && nextRoomId && !availableRooms.some((room) => room.id === nextRoomId)) {
                throw new Error("Selected classroom is not available in one or more fixed slots.");
            }

            let nextPayload = officialPayload;
            if (nextPayload) {
                const cloned = JSON.parse(JSON.stringify(nextPayload)) as OfficialTimetablePayload;
                let touched = false;
                for (const slot of cloned.timetableData) {
                    if (slot.courseId !== course.id) {
                        continue;
                    }
                    if (!course.assign_faculty && nextFacultyId) {
                        slot.facultyId = nextFacultyId;
                        touched = true;
                    }
                    if (!course.assign_classroom && nextRoomId) {
                        slot.roomId = nextRoomId;
                        touched = true;
                    }
                }
                const courseRow = cloned.courseData.find((entry) => entry.id === course.id);
                if (courseRow) {
                    if (!course.assign_faculty && nextFacultyId) {
                        courseRow.facultyId = nextFacultyId;
                    }
                }
                if (touched) {
                    await publishOfficialTimetable(cloned, `Manual assignment • ${course.code}`, false);
                    setOfficialPayload(cloned);
                    nextPayload = cloned;
                }
            }

            const updated = await updateCourse(course.id, {
                assign_faculty: course.assign_faculty ? true : Boolean(nextFacultyId),
                assign_classroom: course.assign_classroom ? true : Boolean(nextRoomId),
                faculty_id: course.assign_faculty ? course.faculty_id ?? null : (nextFacultyId || null),
                default_room_id: course.assign_classroom ? course.default_room_id ?? null : (nextRoomId || null),
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
                nextPayload
                    ? `Updated ${course.code}: timetable and course assignment synchronized.`
                    : `Updated ${course.code}: course assignment saved.`,
            );
        } catch (err) {
            setAssignmentError(err instanceof Error ? err.message : "Unable to apply assignment.");
        } finally {
            setAssigningCourseId(null);
        }
    }, [availableFacultyForCourse, availableRoomsForCourse, getManualAssignment, officialPayload]);

    const autoAllotElectiveCourse = useCallback(async (course: Course) => {
        const targetSlots = officialCourseSlots.get(course.id) ?? [];
        if (targetSlots.length === 0) {
            setAssignmentError(`No generated timetable slots found for ${course.code}. Generate timetable first, then retry allotment.`);
            return;
        }
        const availableFaculty = availableFacultyForCourse(course);
        const availableRooms = availableRoomsForCourse(course);
        if (availableFaculty.length === 0 || availableRooms.length === 0) {
            setAssignmentError(`No conflict-free faculty/classroom combination available for ${course.code}.`);
            return;
        }
        const rankedFaculty = [...availableFaculty].sort((left, right) => {
            const leftMinutes = assignedMinutesByFaculty.get(left.id) ?? 0;
            const rightMinutes = assignedMinutesByFaculty.get(right.id) ?? 0;
            return leftMinutes - rightMinutes;
        });
        const selectedFaculty = rankedFaculty[0];
        const selectedRoom = availableRooms[0];
        await applyAssignmentToCourse(course, selectedFaculty.id, selectedRoom.id);
    }, [applyAssignmentToCourse, assignedMinutesByFaculty, availableFacultyForCourse, availableRoomsForCourse, officialCourseSlots]);

    return (
        <div className="mx-auto w-full max-w-[1720px] space-y-6 px-1">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Course Management</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage courses, sections, and scheduling requirements
                    </p>
                </div>
                {canManage && (
                    <>
                        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                            <DialogTrigger asChild>
                                <Button>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Course
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Add New Course</DialogTitle>
                                    <DialogDescription>
                                        Enter course details and scheduling requirements
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="course-program">Associated Program</Label>
                                        <Select
                                            value={formValues.program_id}
                                            onValueChange={(value) =>
                                                setFormValues((prev) => ({ ...prev, program_id: value }))
                                            }
                                        >
                                            <SelectTrigger id="course-program">
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
                                        <Label htmlFor="code">Course Code</Label>
                                        <Input
                                            id="code"
                                           
                                            value={formValues.code}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, code: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="courseName">Course Name</Label>
                                        <Input
                                            id="courseName"
                                           
                                            value={formValues.name}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, name: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="type">Course Type</Label>
                                        <Select
                                            value={formValues.type}
                                            onValueChange={(value) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    type: value as CourseType,
                                                }))
                                            }
                                        >
                                            <SelectTrigger id="type">
                                                <SelectValue/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="theory">Theory</SelectItem>
                                                <SelectItem value="lab">Lab</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="credits">Credits</Label>
                                        <Input
                                            id="credits"
                                            type="number"
                                            step="0.5"
                                            value={formValues.credits}
                                            readOnly
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Raw formula: L + T + (P / 2). Institutional designation is applied (e.g., 2-0-3 {"->"} 3 credits).
                                        </p>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="semesterNumber">Semester Number</Label>
                                        <Input
                                            id="semesterNumber"
                                            type="number"
                                            value={formValues.semester_number}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    semester_number: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="batchYear">Batch Year (1-4)</Label>
                                        <Input
                                            id="batchYear"
                                            type="number"
                                            value={formValues.batch_year}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    batch_year: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="theoryHours">L (Lecture Hours / Week)</Label>
                                        <Input
                                            id="theoryHours"
                                            type="number"
                                            value={formValues.theory_hours}
                                            onChange={(event) =>
                                                setFormValues((prev) =>
                                                    syncDerivedValues({
                                                        ...prev,
                                                        theory_hours: Math.max(0, Number(event.target.value)),
                                                    }),
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="tutorialHours">T (Tutorial Hours / Week)</Label>
                                        <Input
                                            id="tutorialHours"
                                            type="number"
                                            value={formValues.tutorial_hours}
                                            onChange={(event) =>
                                                setFormValues((prev) =>
                                                    syncDerivedValues({
                                                        ...prev,
                                                        tutorial_hours: Math.max(0, Number(event.target.value)),
                                                    }),
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="labHours">P (Practical Hours / Week)</Label>
                                        <Input
                                            id="labHours"
                                            type="number"
                                            value={formValues.lab_hours}
                                            onChange={(event) =>
                                                setFormValues((prev) =>
                                                    syncDerivedValues({
                                                        ...prev,
                                                        lab_hours: Math.max(0, Number(event.target.value)),
                                                    }),
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="batchSegregation">Batch Segregation (Yes/No)</Label>
                                        <Select
                                            value={formValues.batch_segregation ? "yes" : "no"}
                                            onValueChange={(value) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    batch_segregation: value === "yes",
                                                }))
                                            }
                                        >
                                            <SelectTrigger id="batchSegregation">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="yes">Yes</SelectItem>
                                                <SelectItem value="no">No</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="practicalTogether">Contiguous or Together (Practical)</Label>
                                        <Input
                                            id="practicalTogether"
                                            type="number"
                                            min={1}
                                            max={maxPracticalTogetherSlots(formValues.theory_hours, formValues.tutorial_hours, formValues.lab_hours)}
                                            value={formValues.practical_contiguous_slots}
                                            onChange={(event) =>
                                                setFormValues((prev) =>
                                                    syncDerivedValues({
                                                        ...prev,
                                                        practical_contiguous_slots: Math.max(1, Number(event.target.value)),
                                                    }),
                                                )
                                            }
                                            disabled={formValues.lab_hours <= 0}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Applies only to Practical (P). Lecture (L) and Tutorial (T) are always
                                            scheduled as single slots. Maximum allowed: {maxPracticalTogetherSlots(formValues.theory_hours, formValues.tutorial_hours, formValues.lab_hours)}.
                                        </p>
                                    </div>
                                    <div className="grid gap-2 md:grid-cols-2">
                                        <div className="grid gap-2">
                                            <Label htmlFor="assignFaculty">Assign Faculty (Yes/No)</Label>
                                            <Select
                                                value={formValues.assign_faculty ? "yes" : "no"}
                                                onValueChange={(value) =>
                                                    setFormValues((prev) => ({ ...prev, assign_faculty: value === "yes" }))
                                                }
                                            >
                                                <SelectTrigger id="assignFaculty">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="yes">Yes</SelectItem>
                                                    <SelectItem value="no">No</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="assignClassroom">Assign Classroom (Yes/No)</Label>
                                            <Select
                                                value={formValues.assign_classroom ? "yes" : "no"}
                                                onValueChange={(value) =>
                                                    setFormValues((prev) => ({ ...prev, assign_classroom: value === "yes" }))
                                                }
                                            >
                                                <SelectTrigger id="assignClassroom">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="yes">Yes</SelectItem>
                                                    <SelectItem value="no">No</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="duration">Duration (hours)</Label>
                                        <Input
                                            id="duration"
                                            type="number"
                                           
                                            value={formValues.duration_hours}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    duration_hours: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="sections">Number of Sections</Label>
                                        <Input
                                            id="sections"
                                            type="number"
                                           
                                            value={formValues.sections}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    sections: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="hoursPerWeek">Hours per Week</Label>
                                        <Input
                                            id="hoursPerWeek"
                                            type="number"
                                            value={formValues.hours_per_week}
                                            readOnly
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleAddCourse}>Add Course</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Edit Course</DialogTitle>
                                    <DialogDescription>Update course details and requirements</DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-program">Associated Program</Label>
                                        <Select
                                            value={editFormValues.program_id ?? selectedProgramId}
                                            onValueChange={(value) =>
                                                setEditFormValues((prev) => ({ ...prev, program_id: value }))
                                            }
                                        >
                                            <SelectTrigger id="edit-program">
                                                <SelectValue placeholder="Select a program" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {programs.map((program) => (
                                                    <SelectItem key={program.id} value={program.id}>
                                                        {program.code} - {program.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-code">Course Code</Label>
                                        <Input
                                            id="edit-code"
                                            value={editFormValues.code ?? ""}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({ ...prev, code: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-courseName">Course Name</Label>
                                        <Input
                                            id="edit-courseName"
                                            value={editFormValues.name ?? ""}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({ ...prev, name: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-type">Course Type</Label>
                                        <Select
                                            value={(editFormValues.type ?? "theory") as CourseType}
                                            onValueChange={(value) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    type: value as CourseType,
                                                }))
                                            }
                                        >
                                            <SelectTrigger id="edit-type">
                                                <SelectValue/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="theory">Theory</SelectItem>
                                                <SelectItem value="lab">Lab</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-credits">Credits</Label>
                                        <Input
                                            id="edit-credits"
                                            type="number"
                                            step="0.5"
                                            value={editFormValues.credits ?? 0}
                                            readOnly
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Raw formula: L + T + (P / 2). Institutional designation is applied (e.g., 2-0-3 {"->"} 3 credits).
                                        </p>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-semester-number">Semester Number</Label>
                                        <Input
                                            id="edit-semester-number"
                                            type="number"
                                            value={editFormValues.semester_number ?? 1}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    semester_number: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-batch-year">Batch Year (1-4)</Label>
                                        <Input
                                            id="edit-batch-year"
                                            type="number"
                                            value={editFormValues.batch_year ?? 1}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    batch_year: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-theory-hours">L (Lecture Hours / Week)</Label>
                                        <Input
                                            id="edit-theory-hours"
                                            type="number"
                                            value={editFormValues.theory_hours ?? 0}
                                            onChange={(event) =>
                                                setEditFormValues((prev) =>
                                                    syncDerivedValues({
                                                        ...prev,
                                                        theory_hours: Math.max(0, Number(event.target.value)),
                                                        tutorial_hours: Number(prev.tutorial_hours ?? 0),
                                                        lab_hours: Number(prev.lab_hours ?? 0),
                                                        practical_contiguous_slots: Number(prev.practical_contiguous_slots ?? 1),
                                                    }),
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-tutorial-hours">T (Tutorial Hours / Week)</Label>
                                        <Input
                                            id="edit-tutorial-hours"
                                            type="number"
                                            value={editFormValues.tutorial_hours ?? 0}
                                            onChange={(event) =>
                                                setEditFormValues((prev) =>
                                                    syncDerivedValues({
                                                        ...prev,
                                                        theory_hours: Number(prev.theory_hours ?? 0),
                                                        tutorial_hours: Math.max(0, Number(event.target.value)),
                                                        lab_hours: Number(prev.lab_hours ?? 0),
                                                        practical_contiguous_slots: Number(prev.practical_contiguous_slots ?? 1),
                                                    }),
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-lab-hours">P (Practical Hours / Week)</Label>
                                        <Input
                                            id="edit-lab-hours"
                                            type="number"
                                            value={editFormValues.lab_hours ?? 0}
                                            onChange={(event) =>
                                                setEditFormValues((prev) =>
                                                    syncDerivedValues({
                                                        ...prev,
                                                        theory_hours: Number(prev.theory_hours ?? 0),
                                                        tutorial_hours: Number(prev.tutorial_hours ?? 0),
                                                        lab_hours: Math.max(0, Number(event.target.value)),
                                                        practical_contiguous_slots: Number(prev.practical_contiguous_slots ?? 1),
                                                    }),
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-batch-segregation">Batch Segregation (Yes/No)</Label>
                                        <Select
                                            value={(editFormValues.batch_segregation ?? true) ? "yes" : "no"}
                                            onValueChange={(value) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    batch_segregation: value === "yes",
                                                }))
                                            }
                                        >
                                            <SelectTrigger id="edit-batch-segregation">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="yes">Yes</SelectItem>
                                                <SelectItem value="no">No</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-practical-together">Contiguous or Together (Practical)</Label>
                                        <Input
                                            id="edit-practical-together"
                                            type="number"
                                            min={1}
                                            max={maxPracticalTogetherSlots(
                                                Number(editFormValues.theory_hours ?? 0),
                                                Number(editFormValues.tutorial_hours ?? 0),
                                                Number(editFormValues.lab_hours ?? 0),
                                            )}
                                            value={editFormValues.practical_contiguous_slots ?? 1}
                                            onChange={(event) =>
                                                setEditFormValues((prev) =>
                                                    syncDerivedValues({
                                                        ...prev,
                                                        theory_hours: Number(prev.theory_hours ?? 0),
                                                        tutorial_hours: Number(prev.tutorial_hours ?? 0),
                                                        lab_hours: Number(prev.lab_hours ?? 0),
                                                        practical_contiguous_slots: Math.max(1, Number(event.target.value)),
                                                    }),
                                                )
                                            }
                                            disabled={Number(editFormValues.lab_hours ?? 0) <= 0}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Applies only to Practical (P). Lecture (L) and Tutorial (T) are always
                                            scheduled as single slots. Maximum allowed: {maxPracticalTogetherSlots(
                                                Number(editFormValues.theory_hours ?? 0),
                                                Number(editFormValues.tutorial_hours ?? 0),
                                                Number(editFormValues.lab_hours ?? 0),
                                            )}.
                                        </p>
                                    </div>
                                    <div className="grid gap-2 md:grid-cols-2">
                                        <div className="grid gap-2">
                                            <Label htmlFor="edit-assign-faculty">Assign Faculty (Yes/No)</Label>
                                            <Select
                                                value={(editFormValues.assign_faculty ?? true) ? "yes" : "no"}
                                                onValueChange={(value) =>
                                                    setEditFormValues((prev) => ({
                                                        ...prev,
                                                        assign_faculty: value === "yes",
                                                    }))
                                                }
                                            >
                                                <SelectTrigger id="edit-assign-faculty">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="yes">Yes</SelectItem>
                                                    <SelectItem value="no">No</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="edit-assign-classroom">Assign Classroom (Yes/No)</Label>
                                            <Select
                                                value={(editFormValues.assign_classroom ?? true) ? "yes" : "no"}
                                                onValueChange={(value) =>
                                                    setEditFormValues((prev) => ({
                                                        ...prev,
                                                        assign_classroom: value === "yes",
                                                    }))
                                                }
                                            >
                                                <SelectTrigger id="edit-assign-classroom">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="yes">Yes</SelectItem>
                                                    <SelectItem value="no">No</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-duration">Duration (hours)</Label>
                                        <Input
                                            id="edit-duration"
                                            type="number"
                                            value={editFormValues.duration_hours ?? 1}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    duration_hours: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-sections">Number of Sections</Label>
                                        <Input
                                            id="edit-sections"
                                            type="number"
                                            value={editFormValues.sections ?? 1}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    sections: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-hoursPerWeek">Hours per Week</Label>
                                        <Input
                                            id="edit-hoursPerWeek"
                                            type="number"
                                            value={editFormValues.hours_per_week ?? 1}
                                            readOnly
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleUpdateCourse}>Save Changes</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </>
                )}
            </div>

            {error ? (
                <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-destructive">Failed to load course data</p>
                            <p className="text-xs text-destructive/90">{error}</p>
                            {loadedFromCache ? (
                                <p className="text-xs text-muted-foreground">Showing last cached data. Retry to sync with backend.</p>
                            ) : null}
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        className="sm:min-w-[140px]"
                        onClick={() => void retryLoadCourses()}
                        disabled={isRetrying}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
                        Retry
                    </Button>
                </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total Courses</CardDescription>
                        <CardTitle className="text-3xl">{nonElectiveCourses.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Theory Courses</CardDescription>
                        <CardTitle className="text-3xl">{theoryCourses}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Lab Courses</CardDescription>
                        <CardTitle className="text-3xl">{labCourses}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Elective Operations Moved</CardTitle>
                    <CardDescription>
                        Elective creation, post-scheduling allotment, and pending elective assignment are now managed from the dedicated Elective page.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        Open <span className="font-medium text-foreground">Electives</span> from the left sidebar to add elective options and run faculty/classroom assignment on fixed slots after scheduling.
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Course Catalog</CardTitle>
                    <CardDescription>Search and filter courses</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by code or course name"
                                className="pl-10"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                            <SelectTrigger className="w-full lg:w-[260px]">
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
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="w-full lg:w-[220px]">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {courseTypes.map((type) => (
                                    <SelectItem key={type} value={type}>
                                        {type.charAt(0).toUpperCase() + type.slice(1)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto rounded-md">
                        <Table className="min-w-[1500px]">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[130px] whitespace-nowrap">Code</TableHead>
                                    <TableHead className="min-w-[280px]">Course Name</TableHead>
                                    <TableHead className="w-[130px] whitespace-nowrap">Type</TableHead>
                                    <TableHead className="w-[100px] whitespace-nowrap text-right">Semester</TableHead>
                                    <TableHead className="w-[90px] whitespace-nowrap text-right">Batch</TableHead>
                                    <TableHead className="w-[90px] whitespace-nowrap text-right">Credits</TableHead>
                                    <TableHead className="w-[120px] whitespace-nowrap">LTP (L/T/P)</TableHead>
                                    <TableHead className="w-[220px] whitespace-nowrap">Batch Segregation (Yes/No)</TableHead>
                                    <TableHead className="w-[190px] whitespace-nowrap text-right">Contiguous or Together</TableHead>
                                    <TableHead className="w-[190px] whitespace-nowrap">Assign Faculty (Yes/No)</TableHead>
                                    <TableHead className="w-[210px] whitespace-nowrap">Assign Classroom (Yes/No)</TableHead>
                                    <TableHead className="w-[100px] whitespace-nowrap text-right">Sections</TableHead>
                                    <TableHead className="w-[120px] whitespace-nowrap text-right">Hours/Week</TableHead>
                                    <TableHead className="w-[110px] whitespace-nowrap text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={14} className="text-center text-sm text-muted-foreground">
                                            Loading courses...
                                        </TableCell>
                                    </TableRow>
                                ) : error && courses.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={14} className="text-center text-sm text-destructive">
                                            Unable to fetch course data from backend.
                                        </TableCell>
                                    </TableRow>
                                ) : filteredCourses.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={14} className="text-center text-sm text-muted-foreground">
                                            No courses found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredCourses.map((course) => (
                                        <TableRow key={course.id}>
                                            <TableCell className="font-mono font-medium whitespace-nowrap">{course.code}</TableCell>
                                            <TableCell className="max-w-[340px] truncate" title={course.name}>{course.name}</TableCell>
                                            <TableCell>
                                                {course.type === "theory" && (
                                                    <Badge variant="outline" className="text-primary border-primary">
                                                        Theory
                                                    </Badge>
                                                )}
                                                {course.type === "lab" && (
                                                    <Badge variant="outline" className="text-accent border-accent">
                                                        Lab
                                                    </Badge>
                                                )}
                                                {course.type === "elective" && (
                                                    <Badge variant="outline" className="text-chart-4 border-chart-4">
                                                        Elective
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{course.semester_number}</TableCell>
                                            <TableCell className="text-right tabular-nums">Y{course.batch_year}</TableCell>
                                            <TableCell className="text-right tabular-nums">{formatCredits(course.credits)}</TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {course.theory_hours}/{course.tutorial_hours}/{course.lab_hours}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {course.batch_segregation ? "Yes" : "No"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {course.lab_hours > 0 ? course.practical_contiguous_slots : "—"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={course.assign_faculty ? "outline" : "destructive"}>
                                                    {course.assign_faculty ? "Yes" : "No"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={course.assign_classroom ? "outline" : "destructive"}>
                                                    {course.assign_classroom ? "Yes" : "No"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{course.sections}</TableCell>
                                            <TableCell className="text-right tabular-nums">{course.hours_per_week}</TableCell>
                                            <TableCell className="text-right">
                                                {canManage && (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => openEditCourse(course)}
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                            <span className="sr-only">Edit</span>
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-destructive"
                                                            onClick={() => handleDeleteCourse(course.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                            <span className="sr-only">Delete</span>
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
