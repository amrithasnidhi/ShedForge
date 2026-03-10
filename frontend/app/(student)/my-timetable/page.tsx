"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, RefreshCw, School } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { WeeklyTimetableGrid } from "@/components/timetable/weekly-timetable-grid";
import {
  buildWeeklyGridCellEntries,
  buildWeeklyGridDays,
  buildWeeklyGridRows,
} from "@/components/timetable/weekly-grid-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOfficialTimetable } from "@/hooks/use-official-timetable";
import { getProgramConstraint, type ProgramDailyTimeSlot } from "@/lib/constraints-api";
import { parseTimeToMinutes } from "@/lib/schedule-template";
import { listTimetableChangeRequests } from "@/lib/timetable-api";
import type { TimetableChangeRequest } from "@/lib/timetable-types";

const FEED_REFRESH_MS = 30_000;

function toLocalDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export default function StudentTimetablePage() {
  const { user } = useAuth();
  const { data: timetablePayload, hasOfficial, isLoading, error, refresh } = useOfficialTimetable();
  const { timetableData, courseData, roomData, facultyData } = timetablePayload;

  const [selectedSection, setSelectedSection] = useState("");
  const [selectedSemester, setSelectedSemester] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dailySlots, setDailySlots] = useState<ProgramDailyTimeSlot[]>([]);
  const [requestFeed, setRequestFeed] = useState<TimetableChangeRequest[]>([]);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);

  const sectionOptions = useMemo(() => {
    return Array.from(
      new Set(
        timetableData
          .map((slot) => slot.section?.trim())
          .filter((item): item is string => Boolean(item)),
      ),
    ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }));
  }, [timetableData]);

  useEffect(() => {
    const profileSection = (user?.section_name ?? "").trim();
    if (profileSection && sectionOptions.includes(profileSection)) {
      setSelectedSection(profileSection);
      return;
    }
    if (sectionOptions.length && !sectionOptions.includes(selectedSection)) {
      setSelectedSection(sectionOptions[0]);
      return;
    }
    if (!sectionOptions.length) {
      setSelectedSection("");
    }
  }, [sectionOptions, selectedSection, user?.section_name]);

  const semesterOptions = useMemo(() => {
    const courseById = new Map(courseData.map((item) => [item.id, item]));
    const values = new Set<number>();
    for (const slot of timetableData) {
      if (selectedSection && slot.section !== selectedSection) {
        continue;
      }
      const semester = courseById.get(slot.courseId)?.semesterNumber;
      if (typeof semester === "number" && Number.isFinite(semester)) {
        values.add(semester);
      }
    }
    return Array.from(values).sort((left, right) => left - right);
  }, [courseData, selectedSection, timetableData]);

  useEffect(() => {
    if (!semesterOptions.length) {
      setSelectedSemester("all");
      return;
    }
    setSelectedSemester((previous) => {
      if (previous !== "all" && semesterOptions.includes(Number(previous))) {
        return previous;
      }
      return String(semesterOptions[0]);
    });
  }, [semesterOptions]);

  useEffect(() => {
    let isActive = true;
    const programId = timetablePayload.programId;
    if (!programId) {
      setDailySlots([]);
      return () => {
        isActive = false;
      };
    }
    getProgramConstraint(programId)
      .then((constraint) => {
        if (!isActive) {
          return;
        }
        setDailySlots(
          [...(constraint.daily_time_slots ?? [])].sort((left, right) =>
            parseTimeToMinutes(left.start_time) - parseTimeToMinutes(right.start_time),
          ),
        );
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        setDailySlots([]);
      });
    return () => {
      isActive = false;
    };
  }, [timetablePayload.programId]);

  const filteredSlots = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const courseById = new Map(courseData.map((item) => [item.id, item]));
    const roomById = new Map(roomData.map((item) => [item.id, item]));
    const facultyById = new Map(facultyData.map((item) => [item.id, item]));

    return timetableData.filter((slot) => {
      if (selectedSection && slot.section !== selectedSection) {
        return false;
      }
      const course = courseById.get(slot.courseId);
      if (selectedSemester !== "all" && course?.semesterNumber !== Number(selectedSemester)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const room = roomById.get(slot.roomId);
      const faculty = facultyById.get(slot.facultyId);
      return [
        course?.code ?? "",
        course?.name ?? "",
        slot.section ?? "",
        room?.name ?? "",
        faculty?.name ?? "",
      ].some((item) => item.toLowerCase().includes(query));
    });
  }, [courseData, facultyData, roomData, searchTerm, selectedSection, selectedSemester, timetableData]);

  const courseById = useMemo(() => new Map(courseData.map((item) => [item.id, item])), [courseData]);
  const roomById = useMemo(() => new Map(roomData.map((item) => [item.id, item])), [roomData]);
  const facultyById = useMemo(() => new Map(facultyData.map((item) => [item.id, item])), [facultyData]);

  const gridRows = useMemo(() => buildWeeklyGridRows(filteredSlots, dailySlots), [dailySlots, filteredSlots]);
  const gridDays = useMemo(() => buildWeeklyGridDays(filteredSlots), [filteredSlots]);
  const cellEntries = useMemo(
    () => buildWeeklyGridCellEntries(filteredSlots, courseById, facultyById, roomById),
    [courseById, facultyById, filteredSlots, roomById],
  );

  const totalHours = useMemo(() => {
    const totalMinutes = filteredSlots.reduce((sum, slot) => {
      return sum + (parseTimeToMinutes(slot.endTime) - parseTimeToMinutes(slot.startTime));
    }, 0);
    return Math.max(0, Number((totalMinutes / 60).toFixed(1)));
  }, [filteredSlots]);

  const practicalSessions = useMemo(() => {
    return filteredSlots.filter((slot) => slot.sessionType === "lab").length;
  }, [filteredSlots]);

  const loadChangeRequests = useCallback(async () => {
    setIsRefreshingFeed(true);
    try {
      const rows = await listTimetableChangeRequests({ mine: true });
      setRequestFeed(
        [...rows]
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, 12),
      );
      setFeedError(null);
    } catch (loadError) {
      setFeedError(loadError instanceof Error ? loadError.message : "Unable to load change requests");
    } finally {
      setIsRefreshingFeed(false);
    }
  }, []);

  useEffect(() => {
    void loadChangeRequests();
    const interval = window.setInterval(() => {
      void refresh();
      void loadChangeRequests();
    }, FEED_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadChangeRequests, refresh]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Student Weekly Timetable</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.name ?? "Student"} • {selectedSection ? `Section ${selectedSection}` : "No section selected"}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[180px] space-y-1">
            <Label>Section</Label>
            <Select value={selectedSection} onValueChange={setSelectedSection} disabled={!sectionOptions.length}>
              <SelectTrigger>
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                {sectionOptions.map((section) => (
                  <SelectItem key={section} value={section}>
                    {section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[180px] space-y-1">
            <Label>Semester</Label>
            <Select value={selectedSemester} onValueChange={setSelectedSemester}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All semesters</SelectItem>
                {semesterOptions.map((semester) => (
                  <SelectItem key={semester} value={String(semester)}>
                    Semester {semester}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[280px] space-y-1">
            <Label>Search</Label>
            <Input
              placeholder="Course, faculty or room..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <Button
            variant="outline"
            className="h-10 bg-transparent"
            onClick={() => {
              void refresh();
              void loadChangeRequests();
            }}
            disabled={isRefreshingFeed}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingFeed ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Total Sessions</p>
            <p className="mt-1 text-3xl font-semibold">{filteredSlots.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Weekly Hours</p>
            <p className="mt-1 text-3xl font-semibold">{totalHours}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Practical Sessions</p>
            <p className="mt-1 text-3xl font-semibold">{practicalSessions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Faculty Count</p>
            <p className="mt-1 text-3xl font-semibold">
              {new Set(filteredSlots.map((slot) => slot.facultyId)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[2.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Weekly Timetable Grid</CardTitle>
            <CardDescription>Read-friendly timetable with teaching blocks, breaks, and lunch slots.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <WeeklyTimetableGrid
              days={gridDays}
              rows={gridRows}
              cellEntries={cellEntries}
              emptyMessage="No timetable entries are available for this filter."
            />
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <Badge variant="outline">Blue: Theory / Tutorial</Badge>
              <Badge variant="outline">Green: Lab / Practical</Badge>
              <Badge variant="outline">Amber: Elective / Lunch</Badge>
              <Badge variant="outline">Gray: Break / Blocked</Badge>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Timetable Change Notifications</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadChangeRequests()}
                  disabled={isRefreshingFeed}
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshingFeed ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <CardDescription>Track your requested changes and approval results.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {feedError ? <p className="text-xs text-destructive">{feedError}</p> : null}
              {!requestFeed.length ? (
                <p className="text-sm text-muted-foreground">No timetable change notifications yet.</p>
              ) : (
                requestFeed.slice(0, 6).map((request) => (
                  <div key={request.id} className="rounded-md border p-3 text-xs">
                    <p className="font-medium">
                      {request.proposal.day} {request.proposal.startTime}-{request.proposal.endTime}
                    </p>
                    <p className="text-muted-foreground">Slot {request.slotId}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <Badge variant={request.status === "applied" ? "default" : "secondary"}>
                        {request.status}
                      </Badge>
                      <span className="text-muted-foreground">{toLocalDate(request.updatedAt ?? request.createdAt)}</span>
                    </div>
                    {request.resolutionNote ? (
                      <p className="mt-2 text-muted-foreground">{request.resolutionNote}</p>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardContent className="pt-5">
              <p className="text-sm font-medium">Need a timetable change?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Propose a change request. Faculty/CR approval flow is handled automatically.
              </p>
              <Button asChild className="mt-3 w-full">
                <Link href="/timetable-collaboration">
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Open Change Request Desk
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardContent className="pt-5 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <School className="h-4 w-4 text-primary" />
                Live Update Sync
              </p>
              <p className="mt-1">
                This page auto-refreshes timetable and change status every 30 seconds.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {!hasOfficial && !isLoading ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No published timetable is available yet.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
