"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, MessageSquare, Search, Send, ShieldAlert, Sparkles } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  addFeedbackMessage,
  createFeedback,
  getFeedback,
  listFeedback,
  updateFeedback,
  type FeedbackCategory,
  type FeedbackDetail,
  type FeedbackItem,
  type FeedbackPriority,
  type FeedbackStatus,
} from "@/lib/feedback-api";
import { cn } from "@/lib/utils";

const FEEDBACK_CATEGORIES: FeedbackCategory[] = [
  "timetable",
  "technical",
  "usability",
  "account",
  "suggestion",
  "grievance",
  "other",
];
const FEEDBACK_PRIORITIES: FeedbackPriority[] = ["low", "medium", "high", "urgent"];
const FEEDBACK_STATUSES: FeedbackStatus[] = ["open", "under_review", "awaiting_user", "resolved", "closed"];

const STATUS_STYLES: Record<FeedbackStatus, string> = {
  open: "bg-rose-100 text-rose-700 hover:bg-rose-100",
  under_review: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  awaiting_user: "bg-indigo-100 text-indigo-700 hover:bg-indigo-100",
  resolved: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  closed: "bg-slate-200 text-slate-700 hover:bg-slate-200",
};

const PRIORITY_STYLES: Record<FeedbackPriority, string> = {
  low: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  medium: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  high: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  urgent: "bg-red-100 text-red-700 hover:bg-red-100",
};

export default function FeedbackPage() {
  return <FeedbackContent />;
}

function FeedbackContent() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackDetail | null>(null);

  const [subject, setSubject] = useState("");
  const [newCategory, setNewCategory] = useState<FeedbackCategory>("other");
  const [newPriority, setNewPriority] = useState<FeedbackPriority>("medium");
  const [newMessage, setNewMessage] = useState("");

  const [statusFilter, setStatusFilter] = useState<"all" | FeedbackStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | FeedbackCategory>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | FeedbackPriority>("all");
  const [search, setSearch] = useState("");

  const [reply, setReply] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isUpdatingMeta, setIsUpdatingMeta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadFeedbackItems = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await listFeedback({
        status: statusFilter === "all" ? undefined : statusFilter,
        category: categoryFilter === "all" ? undefined : categoryFilter,
        priority: priorityFilter === "all" ? undefined : priorityFilter,
      });
      setFeedbackItems(rows);
      setSelectedFeedbackId((prev) => {
        if (prev && rows.some((item) => item.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load feedback");
    } finally {
      setIsLoading(false);
    }
  };

  const loadSelectedFeedback = async (feedbackId: string | null) => {
    if (!feedbackId) {
      setSelectedFeedback(null);
      return;
    }
    try {
      const detail = await getFeedback(feedbackId);
      setSelectedFeedback(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load feedback thread");
    }
  };

  useEffect(() => {
    void loadFeedbackItems();
  }, [statusFilter, categoryFilter, priorityFilter]);

  useEffect(() => {
    void loadSelectedFeedback(selectedFeedbackId);
  }, [selectedFeedbackId]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return feedbackItems;
    return feedbackItems.filter((item) => {
      const lookup = [
        item.id,
        item.subject,
        item.latest_message_preview ?? "",
        item.reporter_name ?? "",
        item.reporter_role ?? "",
        item.category,
        item.status,
      ]
        .join(" ")
        .toLowerCase();
      return lookup.includes(needle);
    });
  }, [feedbackItems, search]);

  const stats = useMemo(() => {
    const open = feedbackItems.filter((item) => item.status === "open" || item.status === "under_review").length;
    const awaitingUser = feedbackItems.filter((item) => item.status === "awaiting_user").length;
    const resolved = feedbackItems.filter((item) => item.status === "resolved" || item.status === "closed").length;
    return {
      total: feedbackItems.length,
      open,
      awaitingUser,
      resolved,
    };
  }, [feedbackItems]);

  const handleSubmitFeedback = async () => {
    if (!subject.trim() || !newMessage.trim()) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createFeedback({
        subject: subject.trim(),
        category: newCategory,
        priority: newPriority,
        message: newMessage.trim(),
      });
      setSubject("");
      setNewMessage("");
      setNewCategory("other");
      setNewPriority("medium");
      setSuccess("Feedback submitted successfully.");
      await loadFeedbackItems();
      setSelectedFeedbackId(created.id);
      await loadSelectedFeedback(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit feedback");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedFeedbackId || !reply.trim()) return;
    setIsSendingReply(true);
    setError(null);
    setSuccess(null);
    try {
      await addFeedbackMessage(selectedFeedbackId, { message: reply.trim() });
      setReply("");
      setSuccess("Reply sent.");
      await loadFeedbackItems();
      await loadSelectedFeedback(selectedFeedbackId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message");
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleAdminUpdate = async (payload: { status?: FeedbackStatus; priority?: FeedbackPriority }) => {
    if (!selectedFeedbackId || !isAdmin) return;
    setIsUpdatingMeta(true);
    setError(null);
    setSuccess(null);
    try {
      await updateFeedback(selectedFeedbackId, payload);
      setSuccess("Feedback updated.");
      await loadFeedbackItems();
      await loadSelectedFeedback(selectedFeedbackId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update feedback");
    } finally {
      setIsUpdatingMeta(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Feedback Management</h1>
        <p className="text-sm text-muted-foreground">
          Structured feedback workflow with priority triage, threaded replies, and full status tracking.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Total Tickets" value={stats.total} icon={<MessageSquare className="h-4 w-4" />} />
        <MetricCard title="Open + Review" value={stats.open} icon={<Clock3 className="h-4 w-4 text-amber-600" />} />
        <MetricCard title="Awaiting User" value={stats.awaitingUser} icon={<Sparkles className="h-4 w-4 text-indigo-600" />} />
        <MetricCard title="Resolved + Closed" value={stats.resolved} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Submit Feedback</CardTitle>
              <CardDescription>Use this to report product feedback, system issues, or improvement requests.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={newCategory} onValueChange={(value) => setNewCategory(value as FeedbackCategory)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FEEDBACK_CATEGORIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={newPriority} onValueChange={(value) => setNewPriority(value as FeedbackPriority)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FEEDBACK_PRIORITIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea rows={5} value={newMessage} onChange={(event) => setNewMessage(event.target.value)} />
              </div>
              <Button
                onClick={() => void handleSubmitFeedback()}
                disabled={isSubmitting || !subject.trim() || !newMessage.trim()}
                className="w-full"
              >
                {isSubmitting ? "Submitting..." : "Create Feedback Ticket"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Feedback Queue</CardTitle>
              <CardDescription>{isAdmin ? "All submitted tickets" : "Tickets raised by your account"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | FeedbackStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">all</SelectItem>
                      {FEEDBACK_STATUSES.map((item) => (
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
                    onValueChange={(value) => setCategoryFilter(value as "all" | FeedbackCategory)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">all</SelectItem>
                      {FEEDBACK_CATEGORIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Priority</Label>
                  <Select
                    value={priorityFilter}
                    onValueChange={(value) => setPriorityFilter(value as "all" | FeedbackPriority)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">all</SelectItem>
                      {FEEDBACK_PRIORITIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isLoading ? <p className="text-sm text-muted-foreground">Loading feedback...</p> : null}
              {!isLoading && !filteredItems.length ? (
                <p className="text-sm text-muted-foreground">No feedback found for current filters.</p>
              ) : null}

              <div className="max-h-[460px] space-y-2 overflow-auto pr-1">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedFeedbackId(item.id)}
                    className={cn(
                      "w-full rounded-md border p-3 text-left transition-colors",
                      selectedFeedbackId === item.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-medium">{item.subject}</p>
                      <Badge className={STATUS_STYLES[item.status]}>{item.status.replace("_", " ")}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {item.latest_message_preview ?? "No messages yet."}
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
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5" />
              Conversation
            </CardTitle>
            <CardDescription>
              {selectedFeedback ? `Ticket ID: ${selectedFeedback.id}` : "Select a feedback ticket to manage the thread."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedFeedback ? (
              <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
                Select a feedback ticket from the queue.
              </div>
            ) : (
              <>
                <div className="space-y-3 rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{selectedFeedback.category}</Badge>
                    <Badge className={PRIORITY_STYLES[selectedFeedback.priority]}>{selectedFeedback.priority}</Badge>
                    <Badge className={STATUS_STYLES[selectedFeedback.status]}>{selectedFeedback.status.replace("_", " ")}</Badge>
                    {selectedFeedback.reporter_name ? (
                      <Badge variant="secondary">
                        Reporter: {selectedFeedback.reporter_name} ({selectedFeedback.reporter_role})
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm font-medium">{selectedFeedback.subject}</p>

                  {isAdmin ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Status</Label>
                        <Select
                          value={selectedFeedback.status}
                          onValueChange={(value) => void handleAdminUpdate({ status: value as FeedbackStatus })}
                          disabled={isUpdatingMeta}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FEEDBACK_STATUSES.map((item) => (
                              <SelectItem key={item} value={item}>
                                {item.replace("_", " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Priority</Label>
                        <Select
                          value={selectedFeedback.priority}
                          onValueChange={(value) => void handleAdminUpdate({ priority: value as FeedbackPriority })}
                          disabled={isUpdatingMeta}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FEEDBACK_PRIORITIES.map((item) => (
                              <SelectItem key={item} value={item}>
                                {item}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="max-h-[420px] space-y-3 overflow-auto rounded-md border p-3">
                  {selectedFeedback.messages.map((message) => {
                    const isMine = user?.id === message.author_id;
                    const isAdminReply = message.author_role === "admin";
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "rounded-md border p-3",
                          isMine ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-medium uppercase text-foreground">{message.author_role}</span>
                            {isAdminReply ? <ShieldAlert className="h-3.5 w-3.5 text-amber-600" /> : null}
                          </div>
                          <span className="text-muted-foreground">{new Date(message.created_at).toLocaleString()}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{message.message}</p>
                      </div>
                    );
                  })}
                  {!selectedFeedback.messages.length ? (
                    <p className="text-sm text-muted-foreground">No messages yet.</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>Reply</Label>
                  <Textarea
                    rows={4}
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder={isAdmin ? "Respond with action items and next steps." : "Add clarifications for the admin."}
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
