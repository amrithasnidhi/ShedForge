"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calendar, Clock, MapPin, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useOfficialTimetable } from "@/hooks/use-official-timetable";
import { useAuth } from "@/components/auth-provider";

function resolveSessionType(slot: { sessionType?: "theory" | "tutorial" | "lab" }, courseType?: string): "theory" | "tutorial" | "lab" {
  if (slot.sessionType) {
    return slot.sessionType;
  }
  return courseType === "lab" ? "lab" : "theory";
}

export default function FacultyDashboardPage() {
  const { user } = useAuth();
  const { data: timetablePayload } = useOfficialTimetable();
  const { timetableData, courseData, roomData, facultyData } = timetablePayload;

  const today = useMemo(() => new Date().toLocaleDateString("en-US", { weekday: "long" }), []);
  const faculty = useMemo(() => {
    const email = (user?.email ?? "").toLowerCase();
    return (
      facultyData.find((item) => item.email.toLowerCase() === email) ??
      facultyData[0] ??
      null
    );
  }, [facultyData, user?.email]);

  const myTimetable = useMemo(() => {
    if (!faculty) {
      return timetableData;
    }
    return timetableData.filter((slot) => slot.facultyId === faculty.id);
  }, [faculty, timetableData]);

  const todaysClasses = useMemo(() => {
    return myTimetable.filter((slot) => slot.day === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [myTimetable, today]);

  const weeklyMinutes = myTimetable.reduce((sum, slot) => {
    const [sH, sM] = slot.startTime.split(":").map(Number);
    const [eH, eM] = slot.endTime.split(":").map(Number);
    return sum + (eH * 60 + eM) - (sH * 60 + sM);
  }, 0);
  const assignedHours = Number((weeklyMinutes / 60).toFixed(1));
  const maxHours = Math.max(faculty?.maxHours ?? 1, 1);
  const workloadPercentage = Math.min(100, (assignedHours / maxHours) * 100);

  if (!faculty && myTimetable.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Welcome, {user?.name ?? "Faculty"}</h1>
          <p className="text-muted-foreground">Profile mapping required before schedule data can be shown.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Faculty Profile Not Linked</CardTitle>
            <CardDescription>
              Ask an administrator to add your email in Faculty Management so timetable and workload data can sync.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Welcome, {faculty?.name ?? user?.name ?? "Faculty"}</h1>
        <p className="text-muted-foreground">Department of {faculty?.department ?? user?.department ?? ""} • Today is {today}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Weekly Workload</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-bold">{assignedHours}h</span>
              <span className="text-sm text-muted-foreground">of {maxHours}h max</span>
            </div>
            <Progress value={workloadPercentage} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              You are at {Math.round(workloadPercentage)}% of your configured maximum teaching capacity.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 pb-3 border-b">
              <AlertTriangle className="h-4 w-4 text-warning mt-1" />
              <div>
                <p className="text-sm font-medium">Daily Assignment Count</p>
                <p className="text-xs text-muted-foreground">{todaysClasses.length} class(es) scheduled for today</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-success mt-1" />
              <div>
                <p className="text-sm font-medium">Official Timetable</p>
                <p className="text-xs text-muted-foreground">Data shown from current published timetable.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Teaching Schedule</CardTitle>
          <CardDescription>Your assigned classes for {today}</CardDescription>
        </CardHeader>
        <CardContent>
          {todaysClasses.length > 0 ? (
            <div className="space-y-4">
              {todaysClasses.map((slot) => {
                const course = courseData.find((item) => item.id === slot.courseId);
                const room = roomData.find((item) => item.id === slot.roomId);
                const sessionType = resolveSessionType(slot, course?.type);

                return (
                  <div key={slot.id} className="flex items-center gap-6 p-4 rounded-lg border bg-card/50">
                    <div className="flex flex-col items-center min-w-[80px]">
                      <span className="text-lg font-bold">{slot.startTime}</span>
                      <span className="text-xs text-muted-foreground">to {slot.endTime}</span>
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{course?.name}</h3>
                        <Badge variant="outline">{course?.code}</Badge>
                        <Badge variant="secondary">{sessionType === "tutorial" ? "Tutorial" : course?.type}</Badge>
                        <Badge>{slot.section}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{room?.name} ({room?.building})</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{slot.startTime} - {slot.endTime}</span>
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
