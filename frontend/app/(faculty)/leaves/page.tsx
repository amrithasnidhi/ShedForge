"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Shuffle,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOfficialTimetable } from "@/hooks/use-official-timetable";
import { getMyFacultyProfile, type Faculty } from "@/lib/academic-api";
import {
  createLeaveRequest,
  createLeaveSwapOffer,
  listLeaveRequests,
  listSubstituteOffers,
  respondToSubstituteOffer,
  type LeaveRequest,
  type LeaveSubstituteOffer,
  type LeaveType,
} from "@/lib/leave-api";
import { parseTimeToMinutes } from "@/lib/schedule-template";

const FEED_REFRESH_MS = 30_000;

function leaveDateToDayName(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleDateString("en-US", { weekday: "long" });
}

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

export default function FacultyLeaveAndSwapPage() {
  const { user } = useAuth();
  const { data: timetablePayload, refresh: refreshTimetable } = useOfficialTimetable();
  const { timetableData, courseData, roomData, facultyData } = timetablePayload;

  const [leaveDate, setLeaveDate] = useState("");
  const [leaveType, setLeaveType] = useState<LeaveType>("casual");
  const [reason, setReason] = useState("");
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [incomingOffers, setIncomingOffers] = useState<LeaveSubstituteOffer[]>([]);
  const [sentOffers, setSentOffers] = useState<LeaveSubstituteOffer[]>([]);
  const [selectedLeaveId, setSelectedLeaveId] = useState("");

  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [myFacultyProfile, setMyFacultyProfile] = useState<Faculty | null>(null);

  useEffect(() => {
    let isActive = true;
    setIsProfileLoading(true);
    getMyFacultyProfile()
      .then((profile) => {
        if (!isActive) {
          return;
        }
        setMyFacultyProfile(profile);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        setMyFacultyProfile(null);
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

  const selectedLeave = useMemo(() => {
    return leaveRequests.find((item) => item.id === selectedLeaveId) ?? null;
  }, [leaveRequests, selectedLeaveId]);

  const myPrimarySlots = useMemo(() => {
    if (!activeFaculty) {
      return [];
    }
    return timetableData.filter((slot) => slot.facultyId === activeFaculty.id);
  }, [activeFaculty, timetableData]);

  const impactedSlots = useMemo(() => {
    if (!selectedLeave || !activeFaculty) {
      return [];
    }
    const dayName = leaveDateToDayName(selectedLeave.leave_date);
    return myPrimarySlots
      .filter((slot) => slot.day === dayName)
      .sort((left, right) => parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime));
  }, [activeFaculty, myPrimarySlots, selectedLeave]);

  const sentBySlot = useMemo(() => {
    const output = new Map<string, LeaveSubstituteOffer[]>();
    for (const offer of sentOffers) {
      const key = `${offer.leave_request_id}|${offer.slot_id}`;
      if (!output.has(key)) {
        output.set(key, []);
      }
      output.get(key)?.push(offer);
    }
    return output;
  }, [sentOffers]);

  const suggestionsBySlot = useMemo(() => {
    const facultyById = new Map(facultyData.map((item) => [item.id, item]));
    const output = new Map<string, Array<{ id: string; name: string; courseCode: string }>>();

    for (const slot of impactedSlots) {
      const unique = new Map<string, { id: string; name: string; courseCode: string }>();
      for (const other of timetableData) {
        if (other.id === slot.id) {
          continue;
        }
        if (other.day !== slot.day || other.section !== slot.section) {
          continue;
        }
        if (other.courseId === slot.courseId) {
          continue;
        }
        if (other.facultyId === slot.facultyId) {
          continue;
        }
        const teacher = facultyById.get(other.facultyId);
        if (!teacher) {
          continue;
        }
        const course = courseData.find((item) => item.id === other.courseId);
        unique.set(teacher.id, {
          id: teacher.id,
          name: teacher.name,
          courseCode: course?.code ?? other.courseId,
        });
      }
      output.set(slot.id, Array.from(unique.values()).sort((left, right) => left.name.localeCompare(right.name)));
    }
    return output;
  }, [courseData, facultyData, impactedSlots, timetableData]);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [requests, received, sent] = await Promise.all([
        listLeaveRequests(),
        listSubstituteOffers(undefined, { scope: "received" }),
        listSubstituteOffers(undefined, { scope: "sent" }),
      ]);

      setLeaveRequests(requests);
      setIncomingOffers(received.sort((left, right) => right.created_at.localeCompare(left.created_at)));
      setSentOffers(sent.sort((left, right) => right.created_at.localeCompare(left.created_at)));
      setSelectedLeaveId((previous) => {
        if (previous && requests.some((item) => item.id === previous)) {
          return previous;
        }
        return requests[0]?.id ?? "";
      });
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load leave and swap data");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const interval = window.setInterval(() => {
      void loadData();
      void refreshTimetable();
    }, FEED_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadData, refreshTimetable]);

  const submitLeaveRequest = async () => {
    if (!leaveDate || reason.trim().length < 3) {
      setError("Leave date and reason are required.");
      return;
    }
    setIsSubmittingLeave(true);
    setSuccess(null);
    setError(null);
    try {
      await createLeaveRequest({
        leave_date: leaveDate,
        leave_type: leaveType,
        reason: reason.trim(),
      });
      setReason("");
      await loadData();
      setSuccess("Leave request submitted. You can now send swap requests for impacted classes.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit leave request");
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  const sendSwapRequest = async (slotId: string, substituteFacultyId: string) => {
    if (!selectedLeave) {
      setError("Select a leave request first.");
      return;
    }
    const actionKey = `send:${selectedLeave.id}:${slotId}:${substituteFacultyId}`;
    setActionBusyKey(actionKey);
    setError(null);
    setSuccess(null);
    try {
      await createLeaveSwapOffer(selectedLeave.id, {
        slot_id: slotId,
        substitute_faculty_id: substituteFacultyId,
      });
      await loadData();
      setSuccess("Swap request sent to the selected faculty.");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send swap request");
    } finally {
      setActionBusyKey(null);
    }
  };

  const respondSwapOffer = async (offerId: string, decision: "accept" | "reject") => {
    const actionKey = `respond:${offerId}:${decision}`;
    setActionBusyKey(actionKey);
    setError(null);
    setSuccess(null);
    try {
      await respondToSubstituteOffer(offerId, {
        decision,
      });
      await Promise.all([loadData(), refreshTimetable()]);
      setSuccess(
        decision === "accept"
          ? "Swap accepted. Timetable updated."
          : "Swap request rejected.",
      );
    } catch (respondError) {
      setError(respondError instanceof Error ? respondError.message : "Unable to process swap response");
    } finally {
      setActionBusyKey(null);
    }
  };

  const swapChangeFeed = useMemo(() => {
    return [...incomingOffers, ...sentOffers]
      .filter((offer) => ["accepted", "rejected", "rescheduled", "superseded"].includes(offer.status))
      .sort((left, right) => (right.updated_at ?? right.created_at).localeCompare(left.updated_at ?? left.created_at))
      .slice(0, 8);
  }, [incomingOffers, sentOffers]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Faculty Leave & Class Swap</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit leave, send swap requests with smart suggestions, and track all timetable updates.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-10 bg-transparent"
          onClick={() => {
            void loadData();
            void refreshTimetable();
          }}
          disabled={loadingData}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loadingData ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {!activeFaculty && !isProfileLoading ? (
        <p className="text-sm text-destructive">
          Faculty profile mapping is missing or not aligned with the active timetable payload.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{success}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">My Leave Requests</p>
            <p className="mt-1 text-3xl font-semibold">{leaveRequests.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Pending Leaves</p>
            <p className="mt-1 text-3xl font-semibold">
              {leaveRequests.filter((item) => item.status === "pending").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Incoming Swap Requests</p>
            <p className="mt-1 text-3xl font-semibold">
              {incomingOffers.filter((item) => item.status === "pending").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Sent Swap Requests</p>
            <p className="mt-1 text-3xl font-semibold">{sentOffers.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_1.85fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">New Leave Request</CardTitle>
              <CardDescription>Create leave and then start class swap requests for affected classes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Leave Date</Label>
                  <Input
                    type="date"
                    value={leaveDate}
                    onChange={(event) => setLeaveDate(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Leave Type</Label>
                  <Select value={leaveType} onValueChange={(value) => setLeaveType(value as LeaveType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="sick">Sick</SelectItem>
                      <SelectItem value="academic">Academic</SelectItem>
                      <SelectItem value="personal">Personal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Reason</Label>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Brief reason for leave"
                  rows={3}
                />
              </div>
              <Button onClick={() => void submitLeaveRequest()} disabled={isSubmittingLeave}>
                {isSubmittingLeave ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}
                Submit Leave Request
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">My Leave Requests</CardTitle>
              <CardDescription>Select one request to view impacted classes and swap suggestions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingData ? <p className="text-sm text-muted-foreground">Loading requests...</p> : null}
              {!loadingData && !leaveRequests.length ? (
                <p className="text-sm text-muted-foreground">No leave requests submitted yet.</p>
              ) : null}
              {leaveRequests.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded-md border p-3 text-left transition ${
                    selectedLeaveId === item.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                  }`}
                  onClick={() => setSelectedLeaveId(item.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{item.leave_type.toUpperCase()} • {item.leave_date}</p>
                    <Badge variant={item.status === "approved" ? "default" : item.status === "rejected" ? "destructive" : "secondary"}>
                      {item.status}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.reason}</p>
                  {item.substitute_assignment ? (
                    <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                      Substitute mapped: {item.substitute_assignment.substitute_faculty_name ?? item.substitute_assignment.substitute_faculty_id}
                    </p>
                  ) : null}
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Class Swap Suggestions</CardTitle>
              <CardDescription>
                Suggestions include teachers already handling the same section on the same day.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedLeave ? (
                <p className="text-sm text-muted-foreground">Select a leave request to view impacted slots.</p>
              ) : !impactedSlots.length ? (
                <p className="text-sm text-muted-foreground">No class slots are impacted for this leave date.</p>
              ) : (
                impactedSlots.map((slot) => {
                  const course = courseData.find((item) => item.id === slot.courseId);
                  const room = roomData.find((item) => item.id === slot.roomId);
                  const candidates = suggestionsBySlot.get(slot.id) ?? [];
                  const slotOffers = sentBySlot.get(`${selectedLeave.id}|${slot.id}`) ?? [];
                  return (
                    <div key={slot.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">
                          {slot.day} {slot.startTime}-{slot.endTime}
                        </p>
                        <Badge variant="outline">{course?.code ?? slot.courseId}</Badge>
                        <Badge variant="outline">Section {slot.section}</Badge>
                        <Badge variant="outline">{room?.name ?? slot.roomId}</Badge>
                      </div>

                      {slotOffers.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {slotOffers.slice(0, 3).map((offer) => (
                            <p key={offer.id} className="text-xs text-muted-foreground">
                              Swap sent to {offer.substitute_faculty_name ?? offer.substitute_faculty_id} • {offer.status}
                            </p>
                          ))}
                        </div>
                      ) : null}

                      {!candidates.length ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          No same-section/day candidates found for this slot.
                        </p>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {candidates.map((candidate) => {
                            const actionKey = `send:${selectedLeave.id}:${slot.id}:${candidate.id}`;
                            return (
                              <Button
                                key={`${slot.id}-${candidate.id}`}
                                size="sm"
                                variant="outline"
                                onClick={() => void sendSwapRequest(slot.id, candidate.id)}
                                disabled={actionBusyKey === actionKey}
                              >
                                {actionBusyKey === actionKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                {candidate.name} ({candidate.courseCode})
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Incoming Swap Requests</CardTitle>
                <CardDescription>Accept or reject requests sent to you.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!incomingOffers.length ? (
                  <p className="text-sm text-muted-foreground">No incoming swap requests.</p>
                ) : (
                  incomingOffers.slice(0, 8).map((offer) => (
                    <div key={offer.id} className="rounded-md border p-3 text-xs">
                      <p className="font-medium">{offer.course_code ?? "Course"} • Section {offer.section ?? "-"}</p>
                      <p className="text-muted-foreground">{offer.day ?? ""} {offer.startTime ?? ""}-{offer.endTime ?? ""}</p>
                      <p className="text-muted-foreground">Absent faculty: {offer.absent_faculty_name ?? offer.absent_faculty_id ?? "-"}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <Badge variant={offer.status === "pending" ? "secondary" : "outline"}>
                          {offer.status}
                        </Badge>
                        {offer.status === "pending" ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => void respondSwapOffer(offer.id, "accept")}
                              disabled={actionBusyKey === `respond:${offer.id}:accept`}
                            >
                              {actionBusyKey === `respond:${offer.id}:accept` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void respondSwapOffer(offer.id, "reject")}
                              disabled={actionBusyKey === `respond:${offer.id}:reject`}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sent Swap Requests</CardTitle>
                <CardDescription>Status of requests you sent to other faculty.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!sentOffers.length ? (
                  <p className="text-sm text-muted-foreground">No sent swap requests.</p>
                ) : (
                  sentOffers.slice(0, 8).map((offer) => (
                    <div key={offer.id} className="rounded-md border p-3 text-xs">
                      <p className="font-medium">{offer.course_code ?? "Course"} • Section {offer.section ?? "-"}</p>
                      <p className="text-muted-foreground">{offer.day ?? ""} {offer.startTime ?? ""}-{offer.endTime ?? ""}</p>
                      <p className="text-muted-foreground">
                        Requested faculty: {offer.substitute_faculty_name ?? offer.substitute_faculty_id}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <Badge variant={offer.status === "accepted" ? "default" : "secondary"}>{offer.status}</Badge>
                        <span className="text-muted-foreground">{toLocalDate(offer.updated_at ?? offer.created_at)}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timetable Changes</CardTitle>
              <CardDescription>All finalized swap updates that impacted timetable slots.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!swapChangeFeed.length ? (
                <p className="text-sm text-muted-foreground">No finalized timetable changes yet.</p>
              ) : (
                swapChangeFeed.map((entry) => (
                  <div key={entry.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={entry.status === "accepted" ? "default" : "outline"}>{entry.status}</Badge>
                      <p className="font-medium">{entry.course_code ?? "Course"} • {entry.section ?? "-"}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.day ?? ""} {entry.startTime ?? ""}-{entry.endTime ?? ""} • Room {entry.room_name ?? "-"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Updated {toLocalDate(entry.updated_at ?? entry.created_at)}
                    </p>
                    {entry.response_note ? (
                      <p className="mt-1 text-xs text-muted-foreground">{entry.response_note}</p>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="pt-5 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Shuffle className="h-4 w-4 text-primary" />
            Dynamic timetable update
          </p>
          <p className="mt-1">
            This screen auto-refreshes every 30 seconds so accepted swaps appear quickly for all affected faculty.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
