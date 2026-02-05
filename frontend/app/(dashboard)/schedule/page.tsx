"use client";

import { useRef, useState } from "react";
import { Download, Filter, Calendar as CalendarIcon, FileImage, FileText, CalendarCheck, Check, X, Home } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { timetableData, courseData, roomData, facultyData, generateICSContent } from "@/lib/mock-data";
import { useRouter } from "next/navigation";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const timeSlots = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

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

// Selection Options Mock Data
const academicYears = ["2026-27", "2025-26", "2024-25", "2023-24"];
const courses = ["B.Tech.", "M.Tech.", "B.Sc.", "M.Sc.", "B.A.", "M.A."];
const branches = ["CSE", "ECE", "EEE", "ME", "CE", "AI&DS", "CYS"];
const semesters = ["1", "2", "3", "4", "5", "6", "7", "8"];

export default function SchedulePage() {
    const router = useRouter();
    // Selection State
    const [hasSelected, setHasSelected] = useState(false);
    const [selectedYear, setSelectedYear] = useState("2025-26");
    const [selectedCourse, setSelectedCourse] = useState("B.Tech.");
    const [selectedBranch, setSelectedBranch] = useState("CSE");
    const [selectedSemester, setSelectedSemester] = useState("4");
    const [format, setFormat] = useState("html");

    // Existing Schedule State
    const [viewMode, setViewMode] = useState<"section" | "faculty" | "room">("section");
    const scheduleRef = useRef<HTMLDivElement>(null);

    const handleExportICS = () => {
        const icsContent = generateICSContent(timetableData);
        const blob = new Blob([icsContent], { type: "text/calendar" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "timetable.ics";
        a.click();
        URL.revokeObjectURL(url);
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

    const getSlotForDayTime = (day: string, time: string) => {
        return timetableData.find((slot) => slot.day === day && slot.startTime === time);
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
                                        {academicYears.map(year => (
                                            <SelectItem key={year} value={year}>{year}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Course Selection */}
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Course</Label>
                                <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                                    <SelectTrigger className="font-serif">
                                        <SelectValue placeholder="Course" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {courses.map(course => (
                                            <SelectItem key={course} value={course}>{course}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Branch Selection */}
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Branch</Label>
                                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                                    <SelectTrigger className="font-serif">
                                        <SelectValue placeholder="Branch" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {branches.map(branch => (
                                            <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Semester Selection */}
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Semester</Label>
                                <Select value={selectedSemester} onValueChange={setSelectedSemester}>
                                    <SelectTrigger className="font-serif">
                                        <SelectValue placeholder="Sem" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {semesters.map(sem => (
                                            <SelectItem key={sem} value={sem}>{sem}</SelectItem>
                                        ))}
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
                            {selectedYear} • {selectedCourse} {selectedBranch} • Sem {selectedSemester}
                        </Badge>
                    </div>
                    <h1 className="text-2xl font-semibold text-foreground mt-2">Class Time Table</h1>
                </div>

                <div className="flex gap-2">
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
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="outline" onClick={handleReset}>Close</Button>
                </div>
            </div>

            {/* View Controls */}
            <Card>
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between py-4">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                            <span className="text-sm font-medium">View By:</span>
                        </div>
                        <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="section">Section</SelectItem>
                                <SelectItem value="faculty">Faculty</SelectItem>
                                <SelectItem value="room">Room</SelectItem>
                            </SelectContent>
                        </Select>
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
                            {viewMode === "section" && `Section A - ${selectedBranch}`}
                            {viewMode === "faculty" && "All Faculty Members"}
                            {viewMode === "room" && "All Rooms"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <div className="min-w-[900px]">
                            <div className="grid grid-cols-[100px_repeat(5,1fr)] gap-2">
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
