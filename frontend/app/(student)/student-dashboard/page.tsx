"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Bell, User, MapPin } from "lucide-react";
import Link from "next/link";
import { useOfficialTimetable } from "@/hooks/use-official-timetable";
import { useAuth } from "@/components/auth-provider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSelectedSection } from "@/hooks/use-selected-section";

function resolveSessionType(slot: { sessionType?: "theory" | "tutorial" | "lab" }, courseType?: string): "theory" | "tutorial" | "lab" {
  if (slot.sessionType) {
    return slot.sessionType;
  }
  return courseType === "lab" ? "lab" : "theory";
}

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const { data: timetablePayload } = useOfficialTimetable();
  const { timetableData, courseData, roomData, facultyData } = timetablePayload;

  const today = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "long" }),
    [],
  );

  const profileSection = (user?.section_name ?? "").trim();
  const allSections = useMemo(() => {
    if (profileSection) {
      return [profileSection];
    }
    return timetableData.map((slot) => slot.section);
  }, [profileSection, timetableData]);
  const { selectedSection, setSelectedSection, sectionOptions } = useSelectedSection(allSections);

  const todaysClasses = useMemo(() => {
    const effectiveSection = (selectedSection || profileSection).trim().toUpperCase();
    return timetableData
      .filter(
        (slot) =>
          slot.day === today &&
          (!effectiveSection || slot.section.trim().toUpperCase() === effectiveSection),
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [profileSection, selectedSection, timetableData, today]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Welcome, {user?.name ?? "Student"}</h1>
        <p className="text-muted-foreground">Here&apos;s your schedule for today, {today}.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-2">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Today&apos;s Classes</CardTitle>
                <CardDescription>{selectedSection ? `Section ${selectedSection}` : "No section configured"}</CardDescription>
              </div>
              <div className="w-full sm:w-[220px]">
                <Select
                  value={selectedSection}
                  onValueChange={setSelectedSection}
                  disabled={!sectionOptions.length}
                >
                  <SelectTrigger>
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent>
                    {sectionOptions.map((section) => (
                      <SelectItem key={section} value={section}>
                        Section {section}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {todaysClasses.length > 0 ? (
              <div className="space-y-4">
                {todaysClasses.map((slot) => {
                  const course = courseData.find((item) => item.id === slot.courseId);
                  const room = roomData.find((item) => item.id === slot.roomId);
                  const faculty = facultyData.find((item) => item.id === slot.facultyId);
                  const sessionType = resolveSessionType(slot, course?.type);

                  return (
                    <div key={slot.id} className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                      <div className="flex flex-col items-center justify-center min-w-[80px] h-full">
                        <span className="text-sm font-medium text-muted-foreground">Start</span>
                        <span className="text-lg font-bold">{slot.startTime}</span>
                      </div>

                      <div className="w-[2px] h-12 bg-border self-center" />

                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold">{course?.name}</h3>
                          <Badge variant="secondary">{sessionType === "tutorial" ? "tutorial" : course?.type}</Badge>
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
                <Link href="/notifications">
                  <Bell className="mr-2 h-4 w-4" />
                  View Notifications
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-primary">
                <Clock className="h-4 w-4" />
                <CardTitle className="text-base text-primary">Schedule Status</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This view is synced with the currently published official timetable.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
