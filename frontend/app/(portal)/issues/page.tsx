"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Plus, Search, Send, UserRoundCog } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  addIssueMessage,
  createIssue,
  getIssue,
  listIssues,
  updateIssue,
  type Issue,
  type IssueCategory,
  type IssueDetail,
  type IssueStatus,
} from "@/lib/issue-api";

const ISSUE_CATEGORIES: IssueCategory[] = ["conflict", "capacity", "availability", "data", "other"];
const ISSUE_STATUSES: IssueStatus[] = ["open", "in_progress", "resolved"];

const STATUS_STYLES: Record<IssueStatus, string> = {
  open: "bg-rose-100 text-rose-700 hover:bg-rose-100",
  in_progress: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  resolved: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
};

export default function IssuesPage() {
  return <IssuesContent />;
}

function IssuesContent() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "scheduler";

  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<IssueDetail | null>(null);

  const [issueCategory, setIssueCategory] = useState<IssueCategory>("other");
  const [slotId, setSlotId] = useState("");
  const [description, setDescription] = useState("");

  const [statusFilter, setStatusFilter] = useState<"all" | IssueStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | IssueCategory>("all");
  const [search, setSearch] = useState("");

  const [reply, setReply] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isUpdatingMeta, setIsUpdatingMeta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadIssues = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await listIssues({
        status: statusFilter === "all" ? undefined : statusFilter,
        category: categoryFilter === "all" ? undefined : categoryFilter,
      });
      setIssues(rows);
      setSelectedIssueId((prev) => {
        if (prev && rows.some((item) => item.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load issues");
    } finally {
      setIsLoading(false);
    }
  };

  const loadSelectedIssue = async (issueId: string | null) => {
    if (!issueId) {
      setSelectedIssue(null);
      setResolutionNotes("");
      return;
    }
    try {
      const detail = await getIssue(issueId);
      setSelectedIssue(detail);
      setResolutionNotes(detail.resolution_notes ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load issue details");
    }
  };

  useEffect(() => {
    void loadIssues();
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    void loadSelectedIssue(selectedIssueId);
  }, [selectedIssueId]);

  const filteredIssues = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return issues;
    return issues.filter((item) => {
      const lookup = [
        item.id,
        item.description,
        item.latest_message_preview ?? "",
        item.reporter_name ?? "",
        item.reporter_role ?? "",
        item.affected_slot_id ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return lookup.includes(needle);
    });
  }, [issues, search]);

  const issueStats = useMemo(() => {
    const open = issues.filter((item) => item.status === "open").length;
    const inProgress = issues.filter((item) => item.status === "in_progress").length;
    const resolved = issues.filter((item) => item.status === "resolved").length;
    return {
      total: issues.length,
      open,
      inProgress,
      resolved,
    };
  }, [issues]);

  const handleCreate = async () => {
    if (!description.trim()) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createIssue({
        category: issueCategory,
        affected_slot_id: slotId || undefined,
        description: description.trim(),
      });
      setDescription("");
      setSlotId("");
      setIssueCategory("other");
      setSuccess("Issue submitted successfully.");
      await loadIssues();
      setSelectedIssueId(created.id);
      await loadSelectedIssue(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create issue");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusUpdate = async (status: IssueStatus) => {
    if (!selectedIssueId || !canManage) return;
    setIsUpdatingMeta(true);
    setError(null);
    setSuccess(null);
    try {
      await updateIssue(selectedIssueId, { status });
      setSuccess("Issue status updated.");
      await loadIssues();
      await loadSelectedIssue(selectedIssueId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update issue status");
    } finally {
      setIsUpdatingMeta(false);
    }
  };

  const handleSaveResolution = async () => {
    if (!selectedIssueId || !canManage) return;
    setIsUpdatingMeta(true);
    setError(null);
    setSuccess(null);
    try {
      await updateIssue(selectedIssueId, {
        resolution_notes: resolutionNotes.trim() ? resolutionNotes.trim() : null,
      });
      setSuccess("Resolution notes saved.");
      await loadIssues();
      await loadSelectedIssue(selectedIssueId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save resolution notes");
    } finally {
      setIsUpdatingMeta(false);
    }
  };

  const handleAssignToMe = async () => {
    if (!selectedIssueId || !canManage || !user?.id) return;
    setIsUpdatingMeta(true);
    setError(null);
    setSuccess(null);
    try {
      await updateIssue(selectedIssueId, { assigned_to_id: user.id });
      setSuccess("Issue assigned to your account.");
      await loadIssues();
      await loadSelectedIssue(selectedIssueId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign issue");
    } finally {
      setIsUpdatingMeta(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedIssueId || !reply.trim()) return;
    setIsSendingReply(true);
    setError(null);
    setSuccess(null);
    try {
      await addIssueMessage(selectedIssueId, { message: reply.trim() });
      setReply("");
      setSuccess("Reply sent.");
      await loadIssues();
      await loadSelectedIssue(selectedIssueId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send reply");
    } finally {
      setIsSendingReply(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Issue Management</h1>
        <p className="text-sm text-muted-foreground">
          Professional issue triage workspace with direct conversation, status control, and closure tracking.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Total Issues" value={issueStats.total} icon={<AlertTriangle className="h-4 w-4" />} />
        <MetricCard title="Open" value={issueStats.open} icon={<AlertTriangle className="h-4 w-4 text-rose-600" />} />
        <MetricCard title="In Progress" value={issueStats.inProgress} icon={<Clock3 className="h-4 w-4 text-amber-600" />} />
        <MetricCard title="Resolved" value={issueStats.resolved} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Report New Issue</CardTitle>
              <CardDescription>Capture timetable conflicts, data gaps, or operational blockers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Issue Category</Label>
                <Select value={issueCategory} onValueChange={(value) => setIssueCategory(value as IssueCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ISSUE_CATEGORIES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Affected Slot ID (optional)</Label>
                <Input value={slotId} onChange={(event) => setSlotId(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>
              <Button onClick={() => void handleCreate()} disabled={isSaving || !description.trim()} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                {isSaving ? "Submitting..." : "Submit Issue"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Issue Queue</CardTitle>
              <CardDescription>{canManage ? "All reported issues" : "Issues reported by your account"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | IssueStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">all</SelectItem>
                      {ISSUE_STATUSES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Select
                    value={categoryFilter}
                    onValueChange={(value) => setCategoryFilter(value as "all" | IssueCategory)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">all</SelectItem>
                      {ISSUE_CATEGORIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isLoading ? <p className="text-sm text-muted-foreground">Loading issues...</p> : null}
              {!isLoading && !filteredIssues.length ? (
                <p className="text-sm text-muted-foreground">No issues found for current filters.</p>
              ) : null}

              <div className="max-h-[460px] space-y-2 overflow-auto pr-1">
                {filteredIssues.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedIssueId(item.id)}
                    className={cn(
                      "w-full rounded-md border p-3 text-left transition-colors",
                      selectedIssueId === item.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.category.toUpperCase()}</p>
                      <Badge className={STATUS_STYLES[item.status]}>{item.status.replace("_", " ")}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {item.latest_message_preview ?? item.description}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{item.reporter_name ?? "Unknown reporter"}</span>
                      <span>{item.message_count} msg</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Issue Conversation</CardTitle>
            <CardDescription>
              {selectedIssue ? `Issue ID: ${selectedIssue.id}` : "Select an issue from the queue to inspect and respond."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedIssue ? (
              <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
                Choose an issue to view discussion history and management actions.
              </div>
            ) : (
              <>
                <div className="space-y-3 rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{selectedIssue.category}</Badge>
                    <Badge className={STATUS_STYLES[selectedIssue.status]}>{selectedIssue.status.replace("_", " ")}</Badge>
                    {selectedIssue.affected_slot_id ? <Badge variant="outline">{selectedIssue.affected_slot_id}</Badge> : null}
                    <Badge variant="secondary">
                      Reporter: {selectedIssue.reporter_name ?? "Unknown"} ({selectedIssue.reporter_role ?? "unknown"})
                    </Badge>
                  </div>
                  <p className="text-sm">{selectedIssue.description}</p>

                  {canManage ? (
                    <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
                      <div className="space-y-1">
                        <Label className="text-xs">Status</Label>
                        <Select
                          value={selectedIssue.status}
                          onValueChange={(value) => void handleStatusUpdate(value as IssueStatus)}
                          disabled={isUpdatingMeta}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ISSUE_STATUSES.map((item) => (
                              <SelectItem key={item} value={item}>
                                {item.replace("_", " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Assigned To</Label>
                        <div className="h-10 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                          {selectedIssue.assigned_to_id ?? "Unassigned"}
                        </div>
                      </div>
                      <div className="self-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleAssignToMe()}
                          disabled={isUpdatingMeta}
                        >
                          <UserRoundCog className="mr-2 h-4 w-4" />
                          Assign to Me
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {canManage ? (
                    <div className="space-y-2">
                      <Label>Resolution Notes</Label>
                      <Textarea
                        rows={3}
                        value={resolutionNotes}
                        onChange={(event) => setResolutionNotes(event.target.value)}
                        placeholder="Document what was fixed and why."
                      />
                      <Button size="sm" variant="outline" onClick={() => void handleSaveResolution()} disabled={isUpdatingMeta}>
                        Save Notes
                      </Button>
                    </div>
                  ) : selectedIssue.resolution_notes ? (
                    <div className="rounded-md border bg-muted/20 p-3 text-sm">
                      <p className="font-medium">Resolution Notes</p>
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{selectedIssue.resolution_notes}</p>
                    </div>
                  ) : null}
                </div>

                <div className="max-h-[380px] space-y-3 overflow-auto rounded-md border p-3">
                  {selectedIssue.messages.map((message) => {
                    const mine = user?.id === message.author_id;
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "rounded-md border p-3",
                          mine ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium uppercase text-foreground">{message.author_role}</span>
                          <span className="text-muted-foreground">{new Date(message.created_at).toLocaleString()}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{message.message}</p>
                      </div>
                    );
                  })}
                  {!selectedIssue.messages.length ? (
                    <p className="text-sm text-muted-foreground">No messages yet.</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>Reply</Label>
                  <Textarea
                    rows={4}
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder={canManage ? "Respond to reporter with action items." : "Share additional context for this issue."}
                  />
                  <Button onClick={() => void handleSendReply()} disabled={isSendingReply || !reply.trim()}>
                    <Send className="mr-2 h-4 w-4" />
                    {isSendingReply ? "Sending..." : "Send Reply"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="rounded-full border bg-muted/30 p-2 text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
  );
}
