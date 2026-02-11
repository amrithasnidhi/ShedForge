"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  createLeaveRequest,
  listLeaveRequests,
  listSubstituteOffers,
  respondToSubstituteOffer,
  type LeaveRequest,
  type LeaveSubstituteOffer,
  type LeaveStatus,
  type LeaveType,
} from "@/lib/leave-api";

export default function LeavesPage() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [leaveType, setLeaveType] = useState<LeaveType>("sick");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState<LeaveRequest[]>([]);
  const [offers, setOffers] = useState<LeaveSubstituteOffer[]>([]);
  const [offerActionId, setOfferActionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listLeaveRequests();
      setHistory(data);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unable to load leave requests";
      setError(detail);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  const loadOffers = async () => {
    try {
      const data = await listSubstituteOffers("pending");
      setOffers(data);
    } catch {
      // Keep leave request interactions available even when offers endpoint is unavailable.
      setOffers([]);
    }
  };

  useEffect(() => {
    void loadOffers();
  }, []);

  const handleSubmit = async () => {
    if (!date || !reason.trim()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        leave_date: date.toISOString().split("T")[0],
        leave_type: leaveType,
        reason: reason.trim(),
      };
      const created = await createLeaveRequest(payload);
      setHistory((prev) => [created, ...prev]);
      setReason("");
      setMessage("Leave request submitted successfully.");
      void loadOffers();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unable to submit leave request";
      setError(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: LeaveStatus) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500 hover:bg-green-600">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return (
          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20">
            Pending
          </Badge>
        );
    }
  };

  const handleOfferResponse = async (offerId: string, decision: "accept" | "reject") => {
    setOfferActionId(offerId);
    setError(null);
    try {
      await respondToSubstituteOffer(offerId, { decision });
      setMessage(
        decision === "accept"
          ? "Substitute request accepted. Timetable will update shortly."
          : "Substitute request rejected.",
      );
      await Promise.all([loadOffers(), loadHistory()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to respond to substitute request");
    } finally {
      setOfferActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Leave Management</h1>
        <p className="text-muted-foreground">Submit and track your leave requests.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>New Leave Request</CardTitle>
            <CardDescription>Select a date and provide a reason.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col gap-4 items-center sm:items-start">
              <Label>Select Date</Label>
              <div className="border rounded-md p-2">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  className="rounded-md"
                  disabled={(selectedDate) => selectedDate < new Date(new Date().toDateString())}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={leaveType} onValueChange={(value) => setLeaveType(value as LeaveType)}>
                <SelectTrigger>
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sick">Sick Leave</SelectItem>
                  <SelectItem value="casual">Casual Leave</SelectItem>
                  <SelectItem value="academic">Academic / OOD</SelectItem>
                  <SelectItem value="personal">Personal Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
               
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={() => void handleSubmit()} disabled={isSubmitting || !date || !reason.trim()}>
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Request History</CardTitle>
            <CardDescription>Recent leave applications and their status.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading requests...</p>
            ) : (
              <div className="space-y-4">
                {history.map((item) => (
                  <div key={item.id} className="flex items-start justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">{item.leave_date}</span>
                      </div>
                      <p className="text-sm font-medium">{item.leave_type.charAt(0).toUpperCase() + item.leave_type.slice(1)} Leave</p>
                      <p className="text-xs text-muted-foreground max-w-[220px] truncate">{item.reason}</p>
                      {item.admin_comment ? (
                        <p className="text-xs text-muted-foreground mt-2 bg-muted p-2 rounded">
                          <span className="font-medium">Admin:</span> {item.admin_comment}
                        </p>
                      ) : null}
                      {item.substitute_assignment ? (
                        <p className="text-xs text-muted-foreground mt-2 bg-muted p-2 rounded">
                          <span className="font-medium">Substitute:</span>{" "}
                          {item.substitute_assignment.substitute_faculty_name ?? item.substitute_assignment.substitute_faculty_id}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(item.status)}
                      <span className="text-xs text-muted-foreground capitalize">{item.status}</span>
                    </div>
                  </div>
                ))}
                {!history.length ? <p className="text-sm text-muted-foreground">No leave requests found.</p> : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Substitute Requests</CardTitle>
          <CardDescription>Accept or reject pending substitute slots assigned to you.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {offers.map((offer) => (
              <div key={offer.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {offer.course_code ?? "Course"} {offer.course_name ? `- ${offer.course_name}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {offer.day ?? "Day"} {offer.startTime ?? "--:--"}-{offer.endTime ?? "--:--"} | Section{" "}
                      {offer.section ?? "-"}
                      {offer.room_name ? ` | Room ${offer.room_name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Leave date: {offer.leave_date ?? "N/A"} | Absent faculty: {offer.absent_faculty_name ?? "N/A"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => void handleOfferResponse(offer.id, "accept")}
                      disabled={offerActionId === offer.id}
                    >
                      {offerActionId === offer.id ? "Saving..." : "Accept"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleOfferResponse(offer.id, "reject")}
                      disabled={offerActionId === offer.id}
                    >
                      {offerActionId === offer.id ? "Saving..." : "Reject"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!offers.length ? (
              <p className="text-sm text-muted-foreground">No pending substitute requests.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
