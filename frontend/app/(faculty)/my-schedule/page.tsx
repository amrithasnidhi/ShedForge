"use client";

import { useRef, useState } from "react";
import { Download, Search, FileImage, FileText, CalendarCheck } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { timetableData, courseData, roomData, facultyData, generateICSContent } from "@/lib/mock-data";

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

export default function FacultySchedulePage() {
    const [searchTerm, setSearchTerm] = useState("");
    const scheduleRef = useRef<HTMLDivElement>(null);

    const facultyId = "f1"; // Mocked logged-in faculty (Dr. Sarah Mitchell)

    // Filter for this Faculty only
    const myTimetable = timetableData.filter(slot => slot.facultyId === facultyId);

    const handleExportICS = () => {
        const icsContent = generateICSContent(myTimetable);
        const blob = new Blob([icsContent], { type: "text/calendar" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "my-schedule.ics";
        a.click();
        URL.revokeObjectURL(url);
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
        return myTimetable.find((slot) => {
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">My Teaching Schedule</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Dr. Sarah Mitchell - Spring 2026
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Search course..."
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
                            Your assigned sections and rooms
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

                                                return (
                                                    <TooltipProvider key={`${day}-${time}`}>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <div
                                                                    className={`p-3 rounded-lg border-2 text-sm cursor-pointer hover:shadow-md transition-shadow ${getCourseColor(
                                                                        course?.type || ""
                                                                    )}`}
                                                                >
                                                                    <p className="font-semibold truncate">{course?.code}</p>
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
                                                                                {course?.type}
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
