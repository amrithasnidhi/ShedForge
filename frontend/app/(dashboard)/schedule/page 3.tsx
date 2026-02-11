"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Calendar as CalendarIcon, FileImage, FileText, CalendarCheck, FileSpreadsheet, X, Home } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { generateICSContent } from "@/lib/ics";
import { useOfficialTimetable } from "@/hooks/use-official-timetable";
import { publishOfficialTimetable } from "@/lib/timetable-api";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import {
    listProgramSections,
    listProgramTerms,
    listPrograms,
    type Program,
    type ProgramSection,
    type ProgramTerm,
} from "@/lib/academic-api";
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

function getCourseColor(type: string): string {
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

export default function SchedulePage() {
    const router = useRouter();
    const { user } = useAuth();
    const { data: timetablePayload, hasOfficial, isLoading: timetableLoading, error: timetableError, refresh } = useOfficialTimetable();
    const { timetableData, courseData, roomData, facultyData } = timetablePayload;
    // Selection State
    const [hasSelected, setHasSelected] = useState(false);
    const [selectedYear, setSelectedYear] = useState(() => {
        const start = new Date().getFullYear();
        const end = String((start + 1) % 100).padStart(2, "0");
        return `${start}-${end}`;
    });
    const [programs, setPrograms] = useState<Program[]>([]);
    const [programTerms, setProgramTerms] = useState<ProgramTerm[]>([]);
    const [programSections, setProgramSections] = useState<ProgramSection[]>([]);
    const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
    const [programsError, setProgramsError] = useState<string | null>(null);
    const [selectedBranch, setSelectedBranch] = useState("");
    const [selectedSemester, setSelectedSemester] = useState("");
    const [format, setFormat] = useState("html");

    // Existing Schedule State
    const [viewMode, setViewMode] = useState<"section" | "faculty" | "room">("section");
    const [selectedFacultyId, setSelectedFacultyId] = useState("");
    const [selectedRoomId, setSelectedRoomId] = useState("");
    const [versionLabel, setVersionLabel] = useState("");
    const scheduleRef = useRef<HTMLDivElement>(null);
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishError, setPublishError] = useState<string | null>(null);
    const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
    const [workingHours, setWorkingHours] = useState<WorkingHoursEntry[]>(DEFAULT_WORKING_HOURS);
    const [schedulePolicy, setSchedulePolicy] = useState<SchedulePolicyUpdate>(DEFAULT_SCHEDULE_POLICY);
    const [settingsError, setSettingsError] = useState<string | null>(null);
    const selectedProgram = programs.find((program) => program.id === selectedProgramId) ?? null;

    useEffect(() => {
        let isActive = true;
        listPrograms()
            .then((data) => {
                if (!isActive) return;
                setPrograms(data);
                if (data.length && !selectedProgramId) {
                    setSelectedProgramId(data[0].id);
                }
            })
            .catch((error) => {
                if (!isActive) return;
                const message = error instanceof Error ? error.message : "Unable to load programs";
                setProgramsError(message);
            });

        return () => {
            isActive = false;
        };
    }, []);

    useEffect(() => {
        if (!facultyData.length) {
            setSelectedFacultyId("");
        } else {
            setSelectedFacultyId((prev) => (prev && facultyData.some((item) => item.id === prev) ? prev : facultyData[0].id));
        }
        if (!roomData.length) {
            setSelectedRoomId("");
        } else {
            setSelectedRoomId((prev) => (prev && roomData.some((item) => item.id === prev) ? prev : roomData[0].id));
        }
    }, [facultyData, roomData]);

    const filteredTimetableData = useMemo(() => {
        if (viewMode === "faculty") {
            return selectedFacultyId ? timetableData.filter((slot) => slot.facultyId === selectedFacultyId) : timetableData;
        }
        if (viewMode === "room") {
            return selectedRoomId ? timetableData.filter((slot) => slot.roomId === selectedRoomId) : timetableData;
        }
        return selectedBranch ? timetableData.filter((slot) => slot.section === selectedBranch) : timetableData;
    }, [selectedBranch, selectedFacultyId, selectedRoomId, timetableData, viewMode]);

    useEffect(() => {
        if (!selectedProgramId) {
            setProgramTerms([]);
            setProgramSections([]);
            setSelectedSemester("");
            setSelectedBranch("");
            return;
        }

        let isActive = true;
        Promise.allSettled([listProgramTerms(selectedProgramId), listProgramSections(selectedProgramId)]).then(
            ([termsResult, sectionsResult]) => {
                if (!isActive) return;

                if (termsResult.status === "fulfilled") {
                    const terms = [...termsResult.value].sort((a, b) => a.term_number - b.term_number);
                    setProgramTerms(terms);
                    setSelectedSemester((prev) => {
                        if (terms.some((term) => String(term.term_number) === prev)) {
                            return prev;
                        }
                        return terms[0] ? String(terms[0].term_number) : "";
                    });
                } else {
                    setProgramTerms([]);
                    setSelectedSemester("");
                }

                if (sectionsResult.status === "fulfilled") {
                    const sections = [...sectionsResult.value].sort((a, b) => a.name.localeCompare(b.name));
                    setProgramSections(sections);
                    setSelectedBranch((prev) => {
                        if (sections.some((section) => section.name === prev)) {
                            return prev;
                        }
                        return sections[0]?.name ?? "";
                    });
                } else {
                    setProgramSections([]);
                    setSelectedBranch("");
                }
            },
        );

        return () => {
            isActive = false;
        };
    }, [selectedProgramId]);

    useEffect(() => {
        let isActive = true;
        Promise.allSettled([fetchWorkingHours(), fetchSchedulePolicy()])
            .then(([workingHoursResult, policyResult]) => {
                if (!isActive) return;
                if (workingHoursResult.status === "fulfilled") {
                    setWorkingHours(workingHoursResult.value.hours);
                }
                if (policyResult.status === "fulfilled") {
                    setSchedulePolicy(policyResult.value);
                }
                if (workingHoursResult.status !== "fulfilled" || policyResult.status !== "fulfilled") {
                    setSettingsError("Unable to load institutional slot settings; using available timetable data.");
                } else {
                    setSettingsError(null);
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
        const fromData = Array.from(new Set(filteredTimetableData.map((slot) => slot.day)));
        return fromData.length > 0 ? fromData : FALLBACK_DAYS;
    }, [filteredTimetableData, workingHours]);

    const timeSlots = useMemo(() => {
        const configured = buildTemplateTimeSlots(workingHours, schedulePolicy);
        if (configured.length > 0) {
            return configured;
        }
        const fromData = sortTimes(Array.from(new Set(filteredTimetableData.map((slot) => slot.startTime))));
        return fromData;
    }, [filteredTimetableData, schedulePolicy, workingHours]);

    const handleExportICS = () => {
        const icsContent = generateICSContent(filteredTimetableData, {
            courses: courseData,
            rooms: roomData,
            faculty: facultyData,
        });
        const blob = new Blob([icsContent], { type: "text/calendar" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "timetable.ics";
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportCSV = () => {
        downloadTimetableCsv("timetable.csv", filteredTimetableData, courseData, roomData, facultyData);
    };

    const handleExportPNG = async () => {
        if (!scheduleRef.current) return;
        try {
            const canvas = await html2canvas(scheduleRef.current, { scale: 2, backgroundColor: "white" });
            const url = canvas.toDataURL("image/png");
            const a = document.createElement("a");
            a.href = url;
            a.download = "timetable.png";
            a.click();
        } catch (error) {
            console.error("Error exporting PNG:", error);
        }
    };

    const handleExportPDF = async () => {
        if (!scheduleRef.current) return;
        try {
            const canvas = await html2canvas(scheduleRef.current, { scale: 2, backgroundColor: "white" });
            const imgData = canvas.toDataURL("image/png");
            const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
            const imgWidth = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
            pdf.save("timetable.pdf");
        } catch (error) {
            console.error("Error exporting PDF:", error);
        }
    };

    const handlePublish = async () => {
        setIsPublishing(true);
        setPublishError(null);
        setPublishSuccess(null);
        try {
            await publishOfficialTimetable({
                ...timetablePayload,
                termNumber: selectedSemester ? Number(selectedSemester) : timetablePayload.termNumber,
                programId: selectedProgramId ?? undefined,
            }, versionLabel);
            await refresh();
            setPublishSuccess("Official timetable published.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to publish timetable";
            setPublishError(message);
        } finally {
            setIsPublishing(false);
        }
    };

    const getSlotForDayTime = (day: string, time: string) => {
        return filteredTimetableData.find((slot) => slot.day === day && slot.startTime === time);
    };

    // Reset Selection
    const handleReset = () => {
        setHasSelected(false);
        // Reset defaults if needed
    };

    // If selection not made, show the "Amrita Style" selection card
    if (!hasSelected) {
        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-start pt-20 bg-background/50">
                {/* Header branding similar to reference */}
                <div className="text-center mb-10 space-y-2">
                    <h1 className="text-3xl font-serif text-[#C2185B] font-bold tracking-wide">
                        AMRITA VISHWA VIDYAPEETHAM
                    </h1>
                    <h2 className="text-xl font-serif text-foreground/80 font-bold uppercase tracking-wider">
                        Class Time Table
                    </h2>
                </div>

                {/* Selection Card */}
                <Card className="w-full max-w-4xl shadow-lg border-t-4 border-t-[#C2185B]">
                    <div className="flex justify-between items-center px-6 py-4 border-b">
                        <h3 className="text-[#C2185B] font-serif font-bold text-lg tracking-wide uppercase">
                            Make Your Selection
                        </h3>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-8 text-[#C2185B] border-[#C2185B]/20 hover:bg-[#C2185B]/5" onClick={() => router.push("/dashboard")}>
                                <Home className="h-3 w-3 mr-1" /> HOME
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-[#C2185B] border-[#C2185B]/20 hover:bg-[#C2185B]/5"
                                onClick={() => router.push("/dashboard")}
                            >
                                <X className="h-3 w-3 mr-1" /> CLOSE
                            </Button>
                        </div>
                    </div>

                    <CardContent className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                            {/* Year Selection */}
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Year</Label>
                                <Select value={selectedYear} onValueChange={setSelectedYear}>
                                    <SelectTrigger className="font-serif">
                                        <SelectValue placeholder="Year" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[0, 1, 2, 3].map((offset) => {
                                            const start = new Date().getFullYear() - offset;
                                            const end = String((start + 1) % 100).padStart(2, "0");
                                            const year = `${start}-${end}`;
                                            return (
                                                <SelectItem key={year} value={year}>
                                                    {year}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Program Selection */}
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Program</Label>
                                <Select
                                    value={selectedProgramId ?? ""}
                                    onValueChange={(value) => setSelectedProgramId(value)}
                                    disabled={!programs.length}
                                >
                                    <SelectTrigger className="font-serif">
                                        <SelectValue placeholder="Program" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {programs.length ? (
                                            programs.map((program) => (
                                                <SelectItem key={program.id} value={program.id}>
                                                    {program.name}
                                                </SelectItem>
                                            ))
                                        ) : (
                                            <SelectItem value="none" disabled>
                                                No programs available
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                                {programsError ? (
                                    <p className="text-xs text-destructive">{programsError}</p>
                                ) : null}
                            </div>

                            {/* Branch Selection */}
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Branch</Label>
                                <Select value={selectedBranch} onValueChange={setSelectedBranch} disabled={!programSections.length}>
                                    <SelectTrigger className="font-serif">
                                        <SelectValue placeholder="Branch" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {programSections.length ? (
                                            programSections.map((section) => (
                                                <SelectItem key={section.id} value={section.name}>
                                                    {section.name}
                                                </SelectItem>
                                            ))
                                        ) : (
                                            <SelectItem value="none" disabled>
                                                No sections available
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Semester Selection */}
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Semester</Label>
                                <Select value={selectedSemester} onValueChange={setSelectedSemester} disabled={!programTerms.length}>
                                    <SelectTrigger className="font-serif">
                                        <SelectValue placeholder="Sem" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {programTerms.length ? (
                                            programTerms.map((term) => (
                                                <SelectItem key={term.id} value={String(term.term_number)}>
                                                    {term.term_number}
                                                </SelectItem>
                                            ))
                                        ) : (
                                            <SelectItem value="none" disabled>
                                                No terms available
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="mt-8 flex flex-col md:flex-row items-center justify-center gap-6">
                            {/* Format Selection - Radio */}
                            <RadioGroup defaultValue="html" value={format} onValueChange={setFormat} className="flex gap-6">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="html" id="html" />
                                    <Label htmlFor="html" className="font-serif cursor-pointer">Web Format</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="pdf" id="pdf" />
                                    <Label htmlFor="pdf" className="font-serif cursor-pointer">PDF Format</Label>
                                </div>
                            </RadioGroup>
                        </div>

                        <div className="mt-8 flex justify-center">
                            <Button
                                onClick={() => setHasSelected(true)}
                                className="bg-[#C2185B] hover:bg-[#AD1457] text-white px-8 py-2 font-serif font-bold tracking-wide uppercase"
                            >
                                Show Timetable
                            </Button>
                        </div>


                    </CardContent>
                </Card>
            </div>
        );
    }

    // Default Schedule View (Revealed after selection)
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header with Back Button */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
                            ← Back to Selection
                        </Button>
                        <Badge variant="outline" className="text-[#C2185B] border-[#C2185B]/20 bg-[#C2185B]/5">
                            {selectedYear} • {selectedProgram?.name ?? "Program"} {selectedBranch || "Section"} • Sem {selectedSemester || "N/A"}
                        </Badge>
                    </div>
                    <h1 className="text-2xl font-semibold text-foreground mt-2">Class Time Table</h1>
                    <p className="text-xs text-muted-foreground mt-1">
                        {timetableLoading
                            ? "Loading official timetable..."
                            : hasOfficial
                                ? "Official timetable loaded."
                                : "Showing draft timetable (not yet published)."}
                    </p>
                    {timetableError ? (
                        <p className="text-xs text-destructive mt-1">{timetableError}</p>
                    ) : null}
                    {settingsError ? (
                        <p className="text-xs text-muted-foreground mt-1">{settingsError}</p>
                    ) : null}
                </div>

                <div className="flex gap-2">
                    {(user?.role === "admin" || user?.role === "scheduler") ? (
                        <>
                            <Input
                                className="w-[180px]"
                                placeholder="Version label (optional)"
                                value={versionLabel}
                                onChange={(event) => setVersionLabel(event.target.value)}
                            />
                            <Button variant="outline" onClick={handlePublish} disabled={isPublishing}>
                                {isPublishing ? "Publishing..." : "Publish Official"}
                            </Button>
                        </>
                    ) : null}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button>
                                <Download className="h-4 w-4 mr-2" />
                                Download
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
                    <Button variant="outline" onClick={handleReset}>Close</Button>
                </div>
            </div>

            {publishError ? (
                <p className="text-sm text-destructive">{publishError}</p>
            ) : null}
            {publishSuccess ? (
                <p className="text-sm text-emerald-600">{publishSuccess}</p>
            ) : null}

            {/* View Controls */}
            <Card>
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between py-4">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                            <span className="text-sm font-medium">View By:</span>
                        </div>
                        <Select value={viewMode} onValueChange={(value: "section" | "faculty" | "room") => setViewMode(value)}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="section">Section</SelectItem>
                                <SelectItem value="faculty">Faculty</SelectItem>
                                <SelectItem value="room">Room</SelectItem>
                            </SelectContent>
                        </Select>
                        {viewMode === "faculty" ? (
                            <Select value={selectedFacultyId} onValueChange={setSelectedFacultyId} disabled={!facultyData.length}>
                                <SelectTrigger className="w-[220px]">
                                    <SelectValue placeholder="Select faculty" />
                                </SelectTrigger>
                                <SelectContent>
                                    {facultyData.map((faculty) => (
                                        <SelectItem key={faculty.id} value={faculty.id}>
                                            {faculty.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : null}
                        {viewMode === "room" ? (
                            <Select value={selectedRoomId} onValueChange={setSelectedRoomId} disabled={!roomData.length}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select room" />
                                </SelectTrigger>
                                <SelectContent>
                                    {roomData.map((room) => (
                                        <SelectItem key={room.id} value={room.id}>
                                            {room.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Legend */}
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded bg-primary/30" />
                            <span className="text-xs text-muted-foreground">Theory</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded bg-accent/40" />
                            <span className="text-xs text-muted-foreground">Lab</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded bg-chart-4/40" />
                            <span className="text-xs text-muted-foreground">Elective</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Timetable Grid */}
            <div ref={scheduleRef}>
                <Card className="border-t-4 border-t-[#C2185B]">
                    <CardHeader>
                        <CardTitle className="text-lg font-serif">Weekly Schedule</CardTitle>
                        <CardDescription>
                            {viewMode === "section" && `Section ${selectedBranch || "N/A"}`}
                            {viewMode === "faculty" && (facultyData.find((item) => item.id === selectedFacultyId)?.name ?? "Faculty")}
                            {viewMode === "room" && (roomData.find((item) => item.id === selectedRoomId)?.name ?? "Room")}
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
                                        className="p-3 text-center font-bold text-sm bg-muted/50 rounded-lg text-[#C2185B]"
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
                                                const faculty = facultyData.find((f) => f.id === slot.facultyId);
                                                return (
                                                    <TooltipProvider key={`${day}-${time}`}>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <div
                                                                    className={`p-3 rounded-lg border text-sm cursor-pointer hover:shadow-md transition-shadow ${getCourseColor(
                                                                        course?.type || ""
                                                                    )}`}
                                                                >
                                                                    <p className="font-bold truncate text-[#C2185B]">{course?.code}</p>
                                                                    <p className="text-xs truncate mt-1 font-medium">{course?.name}</p>
                                                                    <p className="text-xs truncate opacity-70 mt-1">{room?.name}</p>
                                                                </div>
                                                            </TooltipTrigger>
                                                            <TooltipContent className="max-w-xs" side="top">
                                                                <div className="space-y-2">
                                                                    <div>
                                                                        <p className="font-semibold text-base">{course?.name}</p>
                                                                        <p className="text-sm text-muted-foreground">{course?.code}</p>
                                                                    </div>
                                                                    <div className="space-y-1 text-sm">
                                                                        <p><span className="font-medium">Instructor:</span> {faculty?.name}</p>
                                                                        <p><span className="font-medium">Room:</span> {room?.name}</p>
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
                                                    className="p-3 rounded-lg bg-muted/10 border border-transparent hover:border-muted/30 transition-colors"
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
