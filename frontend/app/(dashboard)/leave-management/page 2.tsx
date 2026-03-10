"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, RefreshCcw, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  assignLeaveSubstitute,
  listLeaveRequests,
  listSubstituteSuggestions,
  updateLeaveRequestStatus,
  type LeaveRequest,
  type LeaveStatus,
  type SubstituteSuggestion,
} from "@/lib/leave-api";

type FilterStatus = LeaveStatus | "all";

function getStatusVariant(status: LeaveStatus): "default" | "secondary" | "destructive" {
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  return "secondary";
}

export default function LeaveManagementPage() {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminComments, setAdminComments] = useState<Record<string, string>>({});
  const [assignmentNotes, setAssignmentNotes] = useState<Record<string, string>>({});
  const [suggestionsByLeave, setSuggestionsByLeave] = useState<Record<string, SubstituteSuggestion[]>>({});
  const [loadingSuggestionsFor, setLoadingSuggestionsFor] = useState<string | null>(null);
  const [assigningKey, setAssigningKey] = useState<string | null>(null);

  const loadRequests = async (filter: FilterStatus) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listLeaveRequests(filter === "all" ? undefined : filter);
      setRequests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load leave requests");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests(statusFilter);
  }, [statusFilter]);

  const pendingCount = useMemo(
    () => requests.filter((item) => item.status === "pending").length,
    [requests],
  );

  const handleStatusUpdate = async (leaveId: string, status: LeaveStatus) => {
    setError(null);
    setIsSaving(leaveId);
    try {
      const updated = await updateLeaveRequestStatus(leaveId, {
        status,
        admin_comment: adminComments[leaveId]?.trim() || undefined,
      });
      setRequests((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update leave request");
    } finally {
      setIsSaving(null);
    }
  };

  const loadSubstituteSuggestions = async (request: LeaveRequest) => {
    setLoadingSuggestionsFor(request.id);
    setError(null);
    try {
      const suggestions = await listSubstituteSuggestions(request.leave_date);
      setSuggestionsByLeave((prev) => ({ ...prev, [request.id]: suggestions }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load substitute suggestions");
    } finally {
      setLoadingSuggestionsFor(null);
    }
  };

  const handleAssignSubstitute = async (leaveId: string, facultyId: string) => {
    const actionKey = `${leaveId}:${facultyId}`;
    setAssigningKey(actionKey);
    setError(null);
    try {
      await assignLeaveSubstitute(leaveId, {
        substitute_faculty_id: facultyId,
        notes: assignmentNotes[leaveId]?.trim() || undefined,
      });
      await loadRequests(statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign substitute");
    } finally {
      setAssigningKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leave Management</h1>
          <p className="text-sm text-muted-foreground">Review faculty leave requests and assign substitutes faster.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as FilterStatus)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue/>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void loadRequests(statusFilter)} disabled={isLoading}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Requests</p>
            <p className="text-3xl font-semibold mt-1">{requests.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-3xl font-semibold mt-1">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Reviewed</p>
            <p className="text-3xl font-semibold mt-1">{Math.max(0, requests.length - pendingCount)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Request Queue</CardTitle>
          <CardDescription>Approve/reject requests and check substitute recommendations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading leave requests...</p> : null}
          {!isLoading && !requests.length ? (
            <p className="text-sm text-muted-foreground">No leave requests found for the selected filter.</p>
          ) : null}

          {requests.map((item) => (
            <div key={item.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="font-medium flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    {item.leave_date}
                  </p>
                  <p className="text-sm text-muted-foreground">Type: {item.leave_type}</p>
                  <p className="text-sm">{item.reason}</p>
                </div>
                <Badge variant={getStatusVariant(item.status)}>{item.status}</Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <Input
                  value={adminComments[item.id] ?? item.admin_comment ?? ""}
                  onChange={(event) => setAdminComments((prev) => ({ ...prev, [item.id]: event.target.value }))}
                 
                />
                <Button
                  variant="outline"
                  onClick={() => void handleStatusUpdate(item.id, "approved")}
                  disabled={isSaving === item.id}
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleStatusUpdate(item.id, "rejected")}
                  disabled={isSaving === item.id}
                >
                  Reject
                </Button>
              </div>

              <div className="space-y-2">
                <Input
                  value={assignmentNotes[item.id] ?? ""}
                  onChange={(event) => setAssignmentNotes((prev) => ({ ...prev, [item.id]: event.target.value }))}
                 
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void loadSubstituteSuggestions(item)}
                  disabled={loadingSuggestionsFor === item.id}
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  {loadingSuggestionsFor === item.id ? "Loading..." : "Suggest Substitutes"}
                </Button>

                {item.substitute_assignment ? (
                  <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                    <p className="font-medium text-emerald-700 dark:text-emerald-400">
                      Assigned: {item.substitute_assignment.substitute_faculty_name ?? item.substitute_assignment.substitute_faculty_id}
                    </p>
                    <p className="text-muted-foreground">
                      {item.substitute_assignment.substitute_faculty_email ?? "No substitute email mapped"}
                    </p>
                    {item.substitute_assignment.notes ? (
                      <p className="text-muted-foreground">Notes: {item.substitute_assignment.notes}</p>
                    ) : null}
                  </div>
                ) : null}

                {(suggestionsByLeave[item.id] ?? []).length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {suggestionsByLeave[item.id].map((suggestion) => (
                      <div key={`${item.id}-${suggestion.faculty_id}`} className="border rounded-md p-2 text-sm">
                        <p className="font-medium">{suggestion.name}</p>
                        <p className="text-muted-foreground">{suggestion.department}</p>
                        <p className="text-muted-foreground">
                          Score: {suggestion.score} | Load: {suggestion.workload_hours}/{suggestion.max_hours}
                        </p>
                        <Button
                          size="sm"
                          className="mt-2"
                          onClick={() => void handleAssignSubstitute(item.id, suggestion.faculty_id)}
                          disabled={
                            item.status !== "approved" ||
                            assigningKey === `${item.id}:${suggestion.faculty_id}`
                          }
                        >
                          {item.status !== "approved"
                            ? "Approve Request First"
                            : assigningKey === `${item.id}:${suggestion.faculty_id}`
                              ? "Assigning..."
                              : "Assign Substitute"}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
