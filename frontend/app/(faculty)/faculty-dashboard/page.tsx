"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calendar, Clock, BookOpen, User, MapPin, AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { timetableData, courseData, roomData, facultyData } from "@/lib/mock-data";

export default function FacultyDashboardPage() {
    const facultyId = "f1"; // Mocked logged-in faculty
    const faculty = facultyData.find((f) => f.id === facultyId);
    const today = "Monday"; // Mocked for demo

    // Filter for Faculty's classes for "today"
    const todaysClasses = timetableData
        .filter((slot) => slot.facultyId === facultyId && slot.day === today)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const workloadPercentage = faculty ? (faculty.workloadHours / faculty.maxHours) * 100 : 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Welcome, {faculty?.name}</h1>
                <p className="text-muted-foreground">
                    Department of {faculty?.department} • Today is {today}
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {/* Workload Stats */}
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-medium">Weekly Workload</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end justify-between mb-2">
                            <span className="text-2xl font-bold">{faculty?.workloadHours}h</span>
                            <span className="text-sm text-muted-foreground">of {faculty?.maxHours}h max</span>
                        </div>
                        <Progress value={workloadPercentage} className="h-2" />
                        <p className="text-xs text-muted-foreground mt-2">
                            You are at {Math.round(workloadPercentage)}% of your maximum teaching capacity.
                        </p>
                    </CardContent>
                </Card>

                {/* Notifications */}
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-medium">Notifications</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-start gap-3 pb-3 border-b">
                            <AlertTriangle className="h-4 w-4 text-warning mt-1" />
                            <div>
                                <p className="text-sm font-medium">Leave Request Pending</p>
                                <p className="text-xs text-muted-foreground">For next Friday (Feb 13)</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <CheckCircle2 className="h-4 w-4 text-success mt-1" />
                            <div>
                                <p className="text-sm font-medium">Schedule Finalized</p>
                                <p className="text-xs text-muted-foreground">Spring 2026 timetable is published.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Today's Schedule */}
            <Card>
                <CardHeader>
                    <CardTitle>Today's Teaching Schedule</CardTitle>
                    <CardDescription>Your assigned classes for {today}</CardDescription>
                </CardHeader>
                <CardContent>
                    {todaysClasses.length > 0 ? (
                        <div className="space-y-4">
                            {todaysClasses.map((slot, index) => {
                                const course = courseData.find((c) => c.id === slot.courseId);
                                const room = roomData.find((r) => r.id === slot.roomId);

                                return (
                                    <div key={index} className="flex items-center gap-6 p-4 rounded-lg border bg-card/50">
                                        <div className="flex flex-col items-center min-w-[80px]">
                                            <span className="text-lg font-bold">{slot.startTime}</span>
                                            <span className="text-xs text-muted-foreground">to {slot.endTime}</span>
                                        </div>

                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-semibold">{course?.name}</h3>
                                                <Badge variant="outline">{course?.code}</Badge>
                                                <Badge>{slot.section}</Badge>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                                <div className="flex items-center gap-1">
                                                    <MapPin className="h-3 w-3" />
                                                    <span>{room?.name} ({room?.building})</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    <span>{course?.duration}h duration</span>
                                                </div>
                                            </div>
                                        </div>

                                        <Button variant="ghost" size="sm">View Details</Button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                            <Calendar className="h-12 w-12 mb-4 opacity-20" />
                            <p>No classes scheduled for today.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
