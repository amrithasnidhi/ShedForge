"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, RefreshCw, Repeat2 } from "lucide-react";
import Link from "next/link";

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
import { getMyFacultyProfile, type Faculty } from "@/lib/academic-api";
import { getProgramConstraint, type ProgramDailyTimeSlot } from "@/lib/constraints-api";
import { listSubstituteOffers, type LeaveSubstituteOffer } from "@/lib/leave-api";
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

export default function FacultySchedulePage() {
  const { user } = useAuth();
  const { data: timetablePayload, hasOfficial, isLoading, error, refresh } = useOfficialTimetable();
  const { timetableData, courseData, roomData, facultyData } = timetablePayload;

  const [selectedSemester, setSelectedSemester] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dailySlots, setDailySlots] = useState<ProgramDailyTimeSlot[]>([]);
  const [swapFeed, setSwapFeed] = useState<LeaveSubstituteOffer[]>([]);
  const [changeFeed, setChangeFeed] = useState<TimetableChangeRequest[]>([]);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [myFacultyProfile, setMyFacultyProfile] = useState<Faculty | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);

  useEffect(() => {
    let isActive = true;
    setIsProfileLoading(true);
    getMyFacultyProfile()
      .then((profile) => {
        if (!isActive) {
          return;
        }
        setMyFacultyProfile(profile);
        setProfileError(null);
      })
      .catch((loadError) => {
        if (!isActive) {
          return;
        }
        setMyFacultyProfile(null);
        setProfileError(loadError instanceof Error ? loadError.message : "Unable to load faculty profile");
      })
      .finally(() => {
        if (!isActive) {
          return;
        }
        setIsProfileLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, []);

  const activeFaculty = useMemo(() => {
    if (myFacultyProfile) {
      return facultyData.find((item) => item.id === myFacultyProfile.id) ?? myFacultyProfile;
    }
    const email = (user?.email ?? "").toLowerCase();
    return facultyData.find((item) => item.email.toLowerCase() === email) ?? null;
  }, [facultyData, myFacultyProfile, user?.email]);

  const mySlots = useMemo(() => {
    if (!activeFaculty) {
      return [];
    }
    return timetableData.filter((slot) => {
      return slot.facultyId === activeFaculty.id || (slot.assistantFacultyIds ?? []).includes(activeFaculty.id);
    });
  }, [activeFaculty, timetableData]);

  const semesterOptions = useMemo(() => {
    const courseById = new Map(courseData.map((item) => [item.id, item]));
    const values = new Set<number>();
    for (const slot of mySlots) {
      const semester = courseById.get(slot.courseId)?.semesterNumber;
      if (typeof semester === "number" && Number.isFinite(semester)) {
        values.add(semester);
      }
    }
    return Array.from(values).sort((left, right) => left - right);
  }, [courseData, mySlots]);

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
    const roomById = new Map(roomData.map((item) => [item.id, item]));
    const courseById = new Map(courseData.map((item) => [item.id, item]));
    return mySlots.filter((slot) => {
      const course = courseById.get(slot.courseId);
      if (selectedSemester !== "all") {
        const targetSemester = Number(selectedSemester);
        if (course?.semesterNumber !== targetSemester) {
          return false;
        }
      }
      if (!query) {
        return true;
      }
      const room = roomById.get(slot.roomId);
      return [
        course?.code ?? "",
        course?.name ?? "",
        slot.section ?? "",
        slot.batch ?? "",
        room?.name ?? "",
        slot.day ?? "",
      ].some((item) => item.toLowerCase().includes(query));
    });
  }, [courseData, mySlots, roomData, searchTerm, selectedSemester]);

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

  const assistantSlots = useMemo(() => {
    if (!activeFaculty) {
      return 0;
    }
    return filteredSlots.filter((slot) => slot.facultyId !== activeFaculty.id).length;
  }, [activeFaculty, filteredSlots]);

  const todayName = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "long" }),
    [],
  );

  const todaysSlots = useMemo(() => {
    return filteredSlots
      .filter((slot) => slot.day === todayName)
      .sort((left, right) => parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime));
  }, [filteredSlots, todayName]);

  const loadFeeds = useCallback(async () => {
    setIsRefreshingFeed(true);
    try {
      const [swapResult, requestResult] = await Promise.all([
        listSubstituteOffers(undefined, { scope: "all" }),
        listTimetableChangeRequests({ mine: true }),
      ]);
      setSwapFeed(
        [...swapResult]
          .filter((item) => item.status !== "cancelled")
          .sort((left, right) => right.created_at.localeCompare(left.created_at))
          .slice(0, 10),
      );
      setChangeFeed(
        [...requestResult]
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, 10),
      );
      setFeedError(null);
    } catch (loadError) {
      setFeedError(loadError instanceof Error ? loadError.message : "Unable to load timetable change feed");
    } finally {
      setIsRefreshingFeed(false);
    }
  }, []);

  useEffect(() => {
    void loadFeeds();
    const interval = window.setInterval(() => {
      void loadFeeds();
      void refresh();
    }, FEED_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadFeeds, refresh]);

  if (!activeFaculty && !isLoading && !isProfileLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Faculty profile mapping required</CardTitle>
          <CardDescription>
            Your user email is not linked to a faculty record yet. Ask admin to map your faculty profile.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Faculty Weekly Timetable</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeFaculty?.name ?? user?.name ?? "Faculty"} • {todayName}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
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
            <Label>Search class/room</Label>
            <Input
              placeholder="Code, course, section, room..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <Button
            variant="outline"
            className="h-10 bg-transparent"
            onClick={() => {
              void refresh();
              void loadFeeds();
            }}
            disabled={isRefreshingFeed}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingFeed ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {profileError ? <p className="text-sm text-destructive">{profileError}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Assigned Sessions</p>
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
            <p className="text-sm text-muted-foreground">Assistant Sessions</p>
            <p className="mt-1 text-3xl font-semibold">{assistantSlots}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Today&apos;s Classes</p>
            <p className="mt-1 text-3xl font-semibold">{todaysSlots.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[2.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Weekly Timetable Grid</CardTitle>
            <CardDescription>Clear section-wise and room-wise teaching plan with break/lunch highlighting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <WeeklyTimetableGrid
              days={gridDays}
              rows={gridRows}
              cellEntries={cellEntries}
              emptyMessage="No faculty timetable entries are available for this selection."
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
            <CardHeader>
              <CardTitle className="text-base">Today&apos;s Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {!todaysSlots.length ? (
                <p className="text-sm text-muted-foreground">No classes scheduled for today.</p>
              ) : (
                <div className="space-y-3">
                  {todaysSlots.map((slot) => {
                    const course = courseById.get(slot.courseId);
                    const room = roomById.get(slot.roomId);
                    return (
                      <div key={slot.id} className="rounded-md border p-3">
                        <p className="text-sm font-medium">
                          {slot.startTime}-{slot.endTime}
                        </p>
                        <p className="text-sm">{course?.code ?? slot.courseId} • {slot.section}</p>
                        <p className="text-xs text-muted-foreground">{room?.name ?? slot.roomId}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Timetable Changes</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadFeeds()}
                  disabled={isRefreshingFeed}
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshingFeed ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <CardDescription>Swap updates and request decisions affecting your schedule.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {feedError ? <p className="text-xs text-destructive">{feedError}</p> : null}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Swap Activity</p>
                {swapFeed.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No swap activity yet.</p>
                ) : (
                  <div className="space-y-2">
                    {swapFeed.slice(0, 5).map((offer) => (
                      <div key={offer.id} className="rounded-md border p-2 text-xs">
                        <p className="font-medium">
                          {offer.course_code ?? "Course"} • {offer.section ?? "Section"}
                        </p>
                        <p className="text-muted-foreground">
                          {offer.day ?? "Day"} {offer.startTime ?? ""}-{offer.endTime ?? ""}
                        </p>
                        <div className="mt-1 flex items-center justify-between">
                          <Badge variant={offer.status === "accepted" ? "default" : "secondary"}>
                            {offer.status}
                          </Badge>
                          <span className="text-muted-foreground">{toLocalDate(offer.updated_at ?? offer.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Change Requests</p>
                {changeFeed.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No change requests yet.</p>
                ) : (
                  <div className="space-y-2">
                    {changeFeed.slice(0, 5).map((request) => (
                      <div key={request.id} className="rounded-md border p-2 text-xs">
                        <p className="font-medium">
                          Slot {request.slotId} • {request.proposal.day} {request.proposal.startTime}-{request.proposal.endTime}
                        </p>
                        <p className="text-muted-foreground">
                          Requested by {request.requestedByRole} • {toLocalDate(request.createdAt)}
                        </p>
                        <div className="mt-1 flex items-center justify-between">
                          <Badge variant={request.status === "applied" ? "default" : "secondary"}>
                            {request.status}
                          </Badge>
                          {request.resolutionNote ? (
                            <span className="line-clamp-1 text-muted-foreground">{request.resolutionNote}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardContent className="pt-5">
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <Repeat2 className="h-4 w-4 text-primary" />
                  Need leave or a class swap?
                </p>
                <p className="text-muted-foreground">
                  Use Leave & Swap to request leave, send swap requests to suggested faculty, and track approvals live.
                </p>
                <Button asChild className="mt-2 w-full">
                  <Link href="/leaves">
                    <CalendarClock className="mr-2 h-4 w-4" />
                    Open Leave & Swap
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {!hasOfficial ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No published timetable is available yet.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
