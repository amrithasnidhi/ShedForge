"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, BookOpen, User, MapPin } from "lucide-react";
import Link from "next/link";
import { timetableData, courseData, roomData, facultyData } from "@/lib/mock-data";

export default function StudentDashboardPage() {
    const today = "Monday"; // Mocked for demo

    // Filter for Section A classes for "today"
    const todaysClasses = timetableData
        .filter((slot) => slot.day === today && slot.section === "Section A")
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Welcome, Alex</h1>
                <p className="text-muted-foreground">
                    Here's your schedule for today, {today}.
                </p>
            </div>

            {/* Today's Schedule */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card className="col-span-2">
                    <CardHeader>
                        <CardTitle>Today's Classes</CardTitle>
                        <CardDescription>Section A - Computer Science</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {todaysClasses.length > 0 ? (
                            <div className="space-y-4">
                                {todaysClasses.map((slot, index) => {
                                    const course = courseData.find((c) => c.id === slot.courseId);
                                    const room = roomData.find((r) => r.id === slot.roomId);
                                    const faculty = facultyData.find((f) => f.id === slot.facultyId);

                                    return (
                                        <div key={index} className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                                            <div className="flex flex-col items-center justify-center min-w-[80px] h-full">
                                                <span className="text-sm font-medium text-muted-foreground">Start</span>
                                                <span className="text-lg font-bold">{slot.startTime}</span>
                                            </div>

                                            <div className="w-[2px] h-12 bg-border self-center" />

                                            <div className="flex-1 space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="font-semibold">{course?.name}</h3>
                                                    <Badge variant="secondary">{course?.type}</Badge>
                                                </div>
                                                <p className="text-sm text-muted-foreground">{course?.code}</p>
                                                <div className="flex items-center gap-4 text-sm text-muted-foreground pt-1">
                                                    <div className="flex items-center gap-1">
                                                        <User className="h-3 w-3" />
                                                        <span>{faculty?.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <MapPin className="h-3 w-3" />
                                                        <span>{room?.name}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                                <Calendar className="h-12 w-12 mb-4 opacity-20" />
                                <p>No classes scheduled for today.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Actions & Notifications */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Quick Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-2">
                            <Button asChild className="w-full justify-start" variant="outline">
                                <Link href="/my-timetable">
                                    <Calendar className="mr-2 h-4 w-4" />
                                    View Full Timetable
                                </Link>
                            </Button>
                            <Button asChild className="w-full justify-start" variant="outline">
                                <Link href="#">
                                    <BookOpen className="mr-2 h-4 w-4" />
                                    Course Catalog
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2 text-primary">
                                <Clock className="h-4 w-4" />
                                <CardTitle className="text-base text-primary">Upcoming Events</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <div className="pb-3 border-b border-primary/10">
                                    <p className="font-medium text-sm">Mid-Term Exams</p>
                                    <p className="text-xs text-muted-foreground">Starts next Monday</p>
                                </div>
                                <div>
                                    <p className="font-medium text-sm">Guest Lecture: AI Ethics</p>
                                    <p className="text-xs text-muted-foreground">Friday, 2:00 PM - Auditorium</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
