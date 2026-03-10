"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, Repeat2, School2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOfficialTimetable } from "@/hooks/use-official-timetable";
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

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const { data: timetablePayload, isLoading, error, refresh } = useOfficialTimetable();
  const { timetableData, courseData, roomData, facultyData } = timetablePayload;

  const [myRequests, setMyRequests] = useState<TimetableChangeRequest[]>([]);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);

  const todayName = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "long" }),
    [],
  );

  const selectedSection = useMemo(() => {
    const profileSection = (user?.section_name ?? "").trim();
    if (profileSection) {
      return profileSection;
    }
    const firstSection = timetableData.find((slot) => slot.section)?.section;
    return firstSection ?? "";
  }, [timetableData, user?.section_name]);

  const sectionSlots = useMemo(() => {
    if (!selectedSection) {
      return [];
    }
    return timetableData.filter((slot) => slot.section === selectedSection);
  }, [selectedSection, timetableData]);

  const todaySlots = useMemo(() => {
    return sectionSlots
      .filter((slot) => slot.day === todayName)
      .sort((left, right) => parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime));
  }, [sectionSlots, todayName]);

  const weeklyHours = useMemo(() => {
    const totalMinutes = sectionSlots.reduce((sum, slot) => {
      return sum + (parseTimeToMinutes(slot.endTime) - parseTimeToMinutes(slot.startTime));
    }, 0);
    return Math.max(0, Number((totalMinutes / 60).toFixed(1)));
  }, [sectionSlots]);

  const nextSlot = useMemo(() => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return todaySlots.find((slot) => parseTimeToMinutes(slot.endTime) >= currentMinutes) ?? null;
  }, [todaySlots]);

  const loadMyRequests = useCallback(async () => {
    setIsRefreshingFeed(true);
    try {
      const rows = await listTimetableChangeRequests({ mine: true });
      setMyRequests(rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
      setFeedError(null);
    } catch (loadError) {
      setFeedError(loadError instanceof Error ? loadError.message : "Unable to load change requests");
    } finally {
      setIsRefreshingFeed(false);
    }
  }, []);

  useEffect(() => {
    void loadMyRequests();
    const interval = window.setInterval(() => {
      void refresh();
      void loadMyRequests();
    }, FEED_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadMyRequests, refresh]);

  const pendingRequests = myRequests.filter((item) => item.status === "pending").length;
  const appliedRequests = myRequests.filter((item) => item.status === "applied").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Student Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.name ?? "Student"} • {selectedSection ? `Section ${selectedSection}` : "No section mapped"} • {todayName}
          </p>
        </div>
        <Button
          variant="outline"
          className="h-10 bg-transparent"
          onClick={() => {
            void refresh();
            void loadMyRequests();
          }}
          disabled={isRefreshingFeed}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingFeed ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {feedError ? <p className="text-sm text-destructive">{feedError}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Today&apos;s Classes</p>
            <p className="mt-1 text-3xl font-semibold">{todaySlots.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Weekly Hours</p>
            <p className="mt-1 text-3xl font-semibold">{weeklyHours}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Pending Change Requests</p>
            <p className="mt-1 text-3xl font-semibold">{pendingRequests}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Applied Requests</p>
            <p className="mt-1 text-3xl font-semibold">{appliedRequests}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Today&apos;s Section Timeline</CardTitle>
            <CardDescription>Current and upcoming classes for your section.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {nextSlot ? (
              <div className="rounded-md border bg-primary/5 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Next Class</p>
                <p className="mt-1 text-sm font-medium">
                  {nextSlot.day} {nextSlot.startTime}-{nextSlot.endTime}
                </p>
                <p className="text-xs text-muted-foreground">
                  {courseData.find((item) => item.id === nextSlot.courseId)?.code ?? nextSlot.courseId} • {roomData.find((item) => item.id === nextSlot.roomId)?.name ?? nextSlot.roomId}
                </p>
              </div>
            ) : null}

            {!todaySlots.length ? (
              <p className="text-sm text-muted-foreground">No classes scheduled for today.</p>
            ) : (
              <div className="space-y-2">
                {todaySlots.map((slot) => {
                  const course = courseData.find((item) => item.id === slot.courseId);
                  const room = roomData.find((item) => item.id === slot.roomId);
                  const faculty = facultyData.find((item) => item.id === slot.facultyId);
                  return (
                    <div key={slot.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {slot.startTime}-{slot.endTime} • {course?.code ?? slot.courseId}
                        </p>
                        <Badge variant="outline">{slot.section}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {faculty?.name ?? slot.facultyId} • {room?.name ?? slot.roomId}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild className="w-full justify-between">
                <Link href="/my-timetable">
                  Open Weekly Grid
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between bg-transparent">
                <Link href="/timetable-collaboration">
                  Propose Timetable Change
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Latest Change Notifications</CardTitle>
              <CardDescription>Recent updates on your submitted requests.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!myRequests.length ? (
                <p className="text-sm text-muted-foreground">No timetable change notifications yet.</p>
              ) : (
                myRequests.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-md border p-2 text-xs">
                    <p className="font-medium">
                      {item.proposal.day} {item.proposal.startTime}-{item.proposal.endTime}
                    </p>
                    <p className="text-muted-foreground">Slot {item.slotId}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <Badge variant={item.status === "applied" ? "default" : "secondary"}>{item.status}</Badge>
                      <span className="text-muted-foreground">{toLocalDate(item.updatedAt ?? item.createdAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardContent className="pt-5 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Repeat2 className="h-4 w-4 text-primary" />
                Approval workflow
              </p>
              <p className="mt-1">
                Student requests route to the responsible faculty first. Approved changes are automatically applied.
              </p>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardContent className="pt-5 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <School2 className="h-4 w-4 text-primary" />
                Live timetable refresh
              </p>
              <p className="mt-1">
                Dashboard auto-syncs every 30 seconds with published timetable updates.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {!selectedSection && !isLoading ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Your account is not mapped to a section yet. Contact admin to assign section mapping.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
