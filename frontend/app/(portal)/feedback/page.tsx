"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Send, ShieldAlert } from "lucide-react";

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
  type FeedbackCategory,
  type FeedbackDetail,
  type FeedbackItem,
  type FeedbackPriority,
  type FeedbackStatus,
  updateFeedback,
} from "@/lib/feedback-api";

const FEEDBACK_CATEGORIES: FeedbackCategory[] = ["timetable", "technical", "usability", "account", "suggestion", "grievance", "other"];
const FEEDBACK_PRIORITIES: FeedbackPriority[] = ["low", "medium", "high", "urgent"];
const FEEDBACK_STATUSES: FeedbackStatus[] = ["open", "under_review", "awaiting_user", "resolved", "closed"];

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
  const [category, setCategory] = useState<FeedbackCategory>("other");
  const [priority, setPriority] = useState<FeedbackPriority>("medium");
  const [description, setDescription] = useState("");
  const [reply, setReply] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FeedbackStatus>("all");
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
  }, [statusFilter]);

  useEffect(() => {
    void loadSelectedFeedback(selectedFeedbackId);
  }, [selectedFeedbackId]);

  const activeItem = useMemo(
    () => feedbackItems.find((item) => item.id === selectedFeedbackId) ?? null,
    [feedbackItems, selectedFeedbackId],
  );

  const handleSubmitFeedback = async () => {
    if (!subject.trim() || !description.trim()) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createFeedback({
        subject: subject.trim(),
        category,
        priority,
        message: description.trim(),
      });
      setSubject("");
      setDescription("");
      setCategory("other");
      setPriority("medium");
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
      setSuccess("Message sent.");
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
      <div>
        <h1 className="text-2xl font-semibold">Feedback Center</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Review and respond to feedback from students, faculty, and staff."
            : "Share feedback directly with the system administrator and track responses."}
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-success">{success}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Submit Feedback</CardTitle>
              <CardDescription>All messages are routed to the administrator.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                 
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={(value) => setCategory(value as FeedbackCategory)}>
                    <SelectTrigger>
                      <SelectValue/>
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
                  <Select value={priority} onValueChange={(value) => setPriority(value as FeedbackPriority)}>
                    <SelectTrigger>
                      <SelectValue/>
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
                <Textarea
                  rows={5}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                 
                />
              </div>
              <Button
                onClick={() => void handleSubmitFeedback()}
                disabled={isSubmitting || !subject.trim() || !description.trim()}
                className="w-full"
              >
                {isSubmitting ? "Submitting..." : "Send to Administrator"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Feedback Threads</CardTitle>
              <CardDescription>{isAdmin ? "All feedback tickets" : "Your feedback tickets"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Filter by status</Label>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | FeedbackStatus)}>
                  <SelectTrigger>
                    <SelectValue/>
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

              {isLoading ? <p className="text-sm text-muted-foreground">Loading feedback...</p> : null}
              {!isLoading && !feedbackItems.length ? <p className="text-sm text-muted-foreground">No feedback found.</p> : null}

              <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                {feedbackItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedFeedbackId(item.id)}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      selectedFeedbackId === item.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium line-clamp-1">{item.subject}</p>
                      <Badge variant="outline">{item.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {item.latest_message_preview ?? "No messages yet."}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{new Date(item.latest_message_at).toLocaleString()}</span>
                      <span>{item.message_count} message(s)</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Conversation
            </CardTitle>
            <CardDescription>
              {activeItem ? `Feedback ID: ${activeItem.id}` : "Select a feedback thread to view details."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedFeedback ? (
              <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
                Select a feedback thread from the left panel.
              </div>
            ) : (
              <>
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{selectedFeedback.category}</Badge>
                    <Badge variant="outline">{selectedFeedback.priority}</Badge>
                    <Badge variant="secondary">{selectedFeedback.status}</Badge>
                    {selectedFeedback.reporter_name ? (
                      <Badge variant="outline">
                        by {selectedFeedback.reporter_name} ({selectedFeedback.reporter_role})
                      </Badge>
                    ) : null}
                  </div>

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
                            <SelectValue/>
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
                            <SelectValue/>
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

                <div className="rounded-md border p-3 space-y-3 max-h-[420px] overflow-auto">
                  {selectedFeedback.messages.map((message) => {
                    const isMine = user?.id === message.author_id;
                    const isAdminReply = message.author_role === "admin";
                    return (
                      <div
                        key={message.id}
                        className={`rounded-md border p-3 ${isMine ? "bg-primary/5 border-primary/30" : "bg-muted/30"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{message.author_role}</span>
                            {isAdminReply ? <ShieldAlert className="h-3 w-3" /> : null}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(message.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm mt-1 whitespace-pre-wrap">{message.message}</p>
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
                   
                  />
                  <Button onClick={() => void handleSendReply()} disabled={isSendingReply || !reply.trim()}>
                    <Send className="h-4 w-4 mr-2" />
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
