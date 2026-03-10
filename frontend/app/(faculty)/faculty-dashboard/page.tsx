"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, Repeat2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOfficialTimetable } from "@/hooks/use-official-timetable";
import { getMyFacultyProfile, type Faculty } from "@/lib/academic-api";
import { listLeaveRequests, listSubstituteOffers, type LeaveSubstituteOffer } from "@/lib/leave-api";
import { parseTimeToMinutes } from "@/lib/schedule-template";
import { listTimetableChangeRequests } from "@/lib/timetable-api";

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

export default function FacultyDashboardPage() {
  const { user } = useAuth();
  const { data: timetablePayload, isLoading, error, refresh } = useOfficialTimetable();
  const { timetableData, courseData, roomData, facultyData } = timetablePayload;

  const [pendingLeaves, setPendingLeaves] = useState(0);
  const [pendingIncomingSwaps, setPendingIncomingSwaps] = useState(0);
  const [pendingChangeApprovals, setPendingChangeApprovals] = useState(0);
  const [recentSwapChanges, setRecentSwapChanges] = useState<LeaveSubstituteOffer[]>([]);
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

  const todayName = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "long" }),
    [],
  );

  const mySlots = useMemo(() => {
    if (!activeFaculty) {
      return [];
    }
    return timetableData.filter((slot) => {
      return slot.facultyId === activeFaculty.id || (slot.assistantFacultyIds ?? []).includes(activeFaculty.id);
    });
  }, [activeFaculty, timetableData]);

  const todaySlots = useMemo(() => {
    return mySlots
      .filter((slot) => slot.day === todayName)
      .sort((left, right) => parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime));
  }, [mySlots, todayName]);

  const totalHours = useMemo(() => {
    const minutes = mySlots.reduce((sum, slot) => {
      return sum + (parseTimeToMinutes(slot.endTime) - parseTimeToMinutes(slot.startTime));
    }, 0);
    return Math.max(0, Number((minutes / 60).toFixed(1)));
  }, [mySlots]);

  const nextSlot = useMemo(() => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return todaySlots.find((slot) => parseTimeToMinutes(slot.endTime) >= currentMinutes) ?? null;
  }, [todaySlots]);

  const loadFeeds = useCallback(async () => {
    setIsRefreshingFeed(true);
    try {
      const [leaves, incomingOffers, myRequests] = await Promise.all([
        listLeaveRequests(),
        listSubstituteOffers(undefined, { scope: "received" }),
        listTimetableChangeRequests({ status: "pending", mine: true }),
      ]);

      setPendingLeaves(leaves.filter((item) => item.status === "pending").length);
      setPendingIncomingSwaps(incomingOffers.filter((item) => item.status === "pending").length);
      setPendingChangeApprovals(myRequests.filter((item) => item.status === "pending").length);

      const recent = incomingOffers
        .filter((item) => ["accepted", "rejected", "rescheduled", "superseded"].includes(item.status))
        .sort((left, right) => (right.updated_at ?? right.created_at).localeCompare(left.updated_at ?? left.created_at))
        .slice(0, 6);
      setRecentSwapChanges(recent);
      setFeedError(null);
    } catch (loadError) {
      setFeedError(loadError instanceof Error ? loadError.message : "Unable to load dashboard activity");
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
            Ask admin to map your account email to faculty details to unlock dashboard operations.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Faculty Operations Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeFaculty?.name ?? user?.name ?? "Faculty"} • Today: {todayName}
          </p>
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

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {profileError ? <p className="text-sm text-destructive">{profileError}</p> : null}
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
            <p className="mt-1 text-3xl font-semibold">{totalHours}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Pending Leave Requests</p>
            <p className="mt-1 text-3xl font-semibold">{pendingLeaves}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Pending Swap Actions</p>
            <p className="mt-1 text-3xl font-semibold">{pendingIncomingSwaps}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Today&apos;s Schedule</CardTitle>
            <CardDescription>Next classes and rooms for the current day.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {nextSlot ? (
              <div className="rounded-md border bg-primary/5 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Next Class</p>
                <p className="mt-1 text-sm font-medium">
                  {nextSlot.day} {nextSlot.startTime}-{nextSlot.endTime}
                </p>
                <p className="text-xs text-muted-foreground">
                  {courseData.find((item) => item.id === nextSlot.courseId)?.code ?? nextSlot.courseId} • Section {nextSlot.section} • {roomData.find((item) => item.id === nextSlot.roomId)?.name ?? nextSlot.roomId}
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
                  const isAssistant = slot.facultyId !== activeFaculty?.id;
                  return (
                    <div key={slot.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {slot.startTime}-{slot.endTime} • {course?.code ?? slot.courseId}
                        </p>
                        <Badge variant="outline">{slot.section}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {room?.name ?? slot.roomId}
                        {isAssistant ? " • Assistant assignment" : ""}
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
                <Link href="/my-schedule">
                  Open Weekly Grid
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between bg-transparent">
                <Link href="/leaves">
                  Leave & Swap Center
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between bg-transparent">
                <Link href="/timetable-collaboration">
                  Timetable Change Desk
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Swap Changes</CardTitle>
              <CardDescription>Accepted/rejected updates you should be aware of.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!recentSwapChanges.length ? (
                <p className="text-sm text-muted-foreground">No recent swap updates.</p>
              ) : (
                recentSwapChanges.map((item) => (
                  <div key={item.id} className="rounded-md border p-2 text-xs">
                    <p className="font-medium">{item.course_code ?? "Course"} • Section {item.section ?? "-"}</p>
                    <p className="text-muted-foreground">{item.day ?? ""} {item.startTime ?? ""}-{item.endTime ?? ""}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <Badge variant={item.status === "accepted" ? "default" : "secondary"}>
                        {item.status}
                      </Badge>
                      <span className="text-muted-foreground">{toLocalDate(item.updated_at ?? item.created_at)}</span>
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
                Class change approvals pending
              </p>
              <p className="mt-1">
                {pendingChangeApprovals} request(s) are waiting for your action in collaboration desk.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
