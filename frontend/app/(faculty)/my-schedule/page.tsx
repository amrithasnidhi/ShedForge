"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Search, FileImage, FileText, CalendarCheck, FileSpreadsheet } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { generateICSContent } from "@/lib/ics";
import { useOfficialTimetable } from "@/hooks/use-official-timetable";
import { useAuth } from "@/components/auth-provider";
import {
    DEFAULT_SCHEDULE_POLICY,
    DEFAULT_WORKING_HOURS,
    fetchSchedulePolicy,
    fetchWorkingHours,
    type SchedulePolicyUpdate,
    type WorkingHoursEntry,
} from "@/lib/settings-api";
import { buildTemplateDays, buildTemplateTimeSlots, sortTimes } from "@/lib/schedule-template";
import { downloadTimetableCsv } from "@/lib/timetable-csv";

const FALLBACK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

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

function resolveSessionType(slot: { sessionType?: "theory" | "tutorial" | "lab" }, courseType?: string): "theory" | "tutorial" | "lab" {
    if (slot.sessionType) {
        return slot.sessionType;
    }
    return courseType === "lab" ? "lab" : "theory";
}

export default function FacultySchedulePage() {
    const { user } = useAuth();
    const { data: timetablePayload } = useOfficialTimetable();
    const { timetableData, courseData, roomData, facultyData } = timetablePayload;
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedSemester, setSelectedSemester] = useState<string>("all");
    const scheduleRef = useRef<HTMLDivElement>(null);
    const [workingHours, setWorkingHours] = useState<WorkingHoursEntry[]>(DEFAULT_WORKING_HOURS);
    const [schedulePolicy, setSchedulePolicy] = useState<SchedulePolicyUpdate>(DEFAULT_SCHEDULE_POLICY);

    const activeFaculty = useMemo(() => {
        const email = (user?.email ?? "").toLowerCase();
        return (
            facultyData.find((item) => item.email.toLowerCase() === email) ??
            facultyData[0] ??
            null
        );
    }, [facultyData, user?.email]);

    const myTimetable = useMemo(() => {
        if (!activeFaculty) {
            return timetableData;
        }
        return timetableData.filter((slot) => slot.facultyId === activeFaculty.id);
    }, [activeFaculty, timetableData]);

    const semesterOptions = useMemo(() => {
        const options = new Set<number>();
        for (const course of courseData) {
            if (typeof course.semesterNumber === "number" && Number.isFinite(course.semesterNumber)) {
                options.add(course.semesterNumber);
            }
        }
        if (typeof timetablePayload.termNumber === "number" && Number.isFinite(timetablePayload.termNumber)) {
            options.add(timetablePayload.termNumber);
        }
        return Array.from(options).sort((left, right) => left - right);
    }, [courseData, timetablePayload.termNumber]);

    useEffect(() => {
        if (!semesterOptions.length) {
            setSelectedSemester("all");
            return;
        }
        const defaultSemester = timetablePayload.termNumber ? String(timetablePayload.termNumber) : String(semesterOptions[0]);
        setSelectedSemester((previous) => {
            if (previous !== "all" && semesterOptions.includes(Number(previous))) {
                return previous;
            }
            return defaultSemester;
        });
    }, [semesterOptions, timetablePayload.termNumber]);

    const filteredTimetable = useMemo(() => {
        if (selectedSemester === "all") {
            return myTimetable;
        }
        const targetSemester = Number(selectedSemester);
        return myTimetable.filter((slot) => {
            const course = courseData.find((item) => item.id === slot.courseId);
            const slotSemester =
                typeof course?.semesterNumber === "number" ? course.semesterNumber : timetablePayload.termNumber ?? null;
            return slotSemester === targetSemester;
        });
    }, [courseData, myTimetable, selectedSemester, timetablePayload.termNumber]);

    useEffect(() => {
        let isActive = true;
        Promise.allSettled([fetchWorkingHours(), fetchSchedulePolicy()]).then(([hoursResult, policyResult]) => {
            if (!isActive) return;
            if (hoursResult.status === "fulfilled") {
                setWorkingHours(hoursResult.value.hours);
            }
            if (policyResult.status === "fulfilled") {
                setSchedulePolicy(policyResult.value);
            }
        });
        return () => {
            isActive = false;
        };
    }, []);

    const days = useMemo(() => {
        const configured = buildTemplateDays(workingHours);
        if (configured.length > 0) {
            return configured;
        }
        const fromData = Array.from(new Set(filteredTimetable.map((slot) => slot.day)));
        return fromData.length > 0 ? fromData : FALLBACK_DAYS;
    }, [filteredTimetable, workingHours]);

    const timeSlots = useMemo(() => {
        const configured = buildTemplateTimeSlots(workingHours, schedulePolicy);
        if (configured.length > 0) {
            return configured;
        }
        return sortTimes(Array.from(new Set(filteredTimetable.map((slot) => slot.startTime))));
    }, [filteredTimetable, schedulePolicy, workingHours]);

    const handleExportICS = () => {
        const icsContent = generateICSContent(filteredTimetable, {
            courses: courseData,
            rooms: roomData,
            faculty: facultyData,
        });
        const blob = new Blob([icsContent], { type: "text/calendar" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "my-schedule.ics";
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportCSV = () => {
        downloadTimetableCsv("my-schedule.csv", filteredTimetable, courseData, roomData, facultyData);
    };

    const handleExportPNG = async () => {
        if (!scheduleRef.current) return;

        try {
            const canvas = await html2canvas(scheduleRef.current, {
                scale: 2,
                backgroundColor: "white",
            });

            const url = canvas.toDataURL("image/png");
            const a = document.createElement("a");
            a.href = url;
            a.download = "my-schedule.png";
            a.click();
        } catch (error) {
            console.error("Error exporting PNG:", error);
        }
    };

    const handleExportPDF = async () => {
        if (!scheduleRef.current) return;

        try {
            const canvas = await html2canvas(scheduleRef.current, {
                scale: 2,
                backgroundColor: "white",
            });

            const imgData = canvas.toDataURL("image/png");
            const pdf = new jsPDF({
                orientation: "landscape",
                unit: "mm",
                format: "a4",
            });

            const imgWidth = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
            pdf.save("my-schedule.pdf");
        } catch (error) {
            console.error("Error exporting PDF:", error);
        }
    };

    const getSlotForDayTime = (day: string, time: string) => {
        return filteredTimetable.find((slot) => {
            if (slot.day !== day || slot.startTime !== time) return false;

            // Simple search filter
            if (searchTerm) {
                const course = courseData.find(c => c.id === slot.courseId);
                return course?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    course?.code.toLowerCase().includes(searchTerm.toLowerCase());
            }
            return true;
        });
    };

    if (!activeFaculty && filteredTimetable.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Faculty Profile Not Linked</CardTitle>
                    <CardDescription>
                        Ask an administrator to map your user email in Faculty Management to view your schedule.
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">My Teaching Schedule</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {activeFaculty?.name ?? user?.name ?? "Faculty"}
                        {selectedSemester !== "all"
                            ? ` - Semester ${selectedSemester}`
                            : timetablePayload.termNumber
                              ? ` - Term ${timetablePayload.termNumber}`
                              : ""}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Select value={selectedSemester} onValueChange={setSelectedSemester}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Semesters</SelectItem>
                            {semesterOptions.map((semester) => (
                                <SelectItem key={semester} value={String(semester)}>
                                    Semester {semester}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                           
                            className="pl-8 w-[200px]"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                <Download className="h-4 w-4 mr-2" />
                                Export
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={handleExportPNG}>
                                <FileImage className="h-4 w-4 mr-2" />
                                Save as PNG
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExportPDF}>
                                <FileText className="h-4 w-4 mr-2" />
                                Save as PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExportICS}>
                                <CalendarCheck className="h-4 w-4 mr-2" />
                                Save as .ics
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExportCSV}>
                                <FileSpreadsheet className="h-4 w-4 mr-2" />
                                Save as CSV
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Timetable Grid */}
            <div ref={scheduleRef}>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Weekly Schedule</CardTitle>
                        <CardDescription>
                            {selectedSemester === "all"
                                ? "Your assigned sections and rooms"
                                : `Your assigned sections and rooms for Semester ${selectedSemester}`}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <div className="min-w-[900px]">
                            <div className="grid gap-2" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
                                {/* Header row */}
                                <div className="p-3 font-medium text-sm text-muted-foreground" />
                                {days.map((day) => (
                                    <div
                                        key={day}
                                        className="p-3 text-center font-semibold text-sm bg-muted rounded-lg"
                                    >
                                        {day}
                                    </div>
                                ))}

                                {/* Time rows */}
                                {timeSlots.map((time) => (
                                    <div key={`row-${time}`} className="contents">
                                        <div className="p-3 text-sm text-muted-foreground font-medium text-right flex items-center justify-end">
                                            {time}
                                        </div>
                                        {days.map((day) => {
                                            const slot = getSlotForDayTime(day, time);
                                            if (slot) {
                                                const course = courseData.find((c) => c.id === slot.courseId);
                                                const room = roomData.find((r) => r.id === slot.roomId);
                                                const sessionType = resolveSessionType(slot, course?.type);

                                                return (
                                                    <TooltipProvider key={`${day}-${time}`}>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <div
                                                                    className={`p-3 rounded-lg border-2 text-sm cursor-pointer hover:shadow-md transition-shadow ${getCourseColor(
                                                                        course?.type || "",
                                                                        sessionType,
                                                                    )}`}
                                                                >
                                                                    <p className="font-semibold truncate">
                                                                        {course?.code}
                                                                        {sessionType === "tutorial" ? " (Tutorial)" : ""}
                                                                    </p>
                                                                    <p className="text-xs truncate mt-1 opacity-80">{room?.name}</p>
                                                                    <p className="text-xs font-medium mt-1">Sec: {slot.section}</p>
                                                                </div>
                                                            </TooltipTrigger>
                                                            <TooltipContent className="max-w-xs" side="top">
                                                                <div className="space-y-2">
                                                                    <div>
                                                                        <p className="font-semibold text-base">{course?.name}</p>
                                                                        <p className="text-sm text-muted-foreground">{course?.code}</p>
                                                                    </div>
                                                                    <div className="space-y-1 text-sm">
                                                                        <p>
                                                                            <span className="font-medium">Section:</span> {slot.section}
                                                                        </p>
                                                                        <p>
                                                                            <span className="font-medium">Room:</span> {room?.name}, {room?.building}
                                                                        </p>
                                                                        <p>
                                                                            <span className="font-medium">Type:</span>{" "}
                                                                            <Badge variant="outline" className="ml-1">
                                                                                {sessionType === "tutorial" ? "tutorial" : course?.type}
                                                                            </Badge>
                                                                        </p>
                                                                        <p className="text-xs text-muted-foreground pt-1">
                                                                            {slot.startTime} - {slot.endTime}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                );
                                            }
                                            return (
                                                <div
                                                    key={`${day}-${time}`}
                                                    className="p-3 rounded-lg bg-muted/30 border-2 border-transparent hover:border-muted transition-colors"
                                                />
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
