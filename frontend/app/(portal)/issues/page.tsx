"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { createIssue, listIssues, updateIssue, type Issue, type IssueCategory, type IssueStatus } from "@/lib/issue-api";

export default function IssuesPage() {
  return <IssuesContent />;
}

function IssuesContent() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "scheduler";

  const [issues, setIssues] = useState<Issue[]>([]);
  const [category, setCategory] = useState<IssueCategory>("other");
  const [slotId, setSlotId] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIssues = async () => {
    try {
      const data = await listIssues();
      setIssues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load issues");
    }
  };

  useEffect(() => {
    void loadIssues();
  }, []);

  const handleCreate = async () => {
    if (!description.trim()) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const created = await createIssue({
        category,
        affected_slot_id: slotId || undefined,
        description: description.trim(),
      });
      setIssues((prev) => [created, ...prev]);
      setDescription("");
      setSlotId("");
      setCategory("other");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create issue");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusUpdate = async (issueId: string, status: IssueStatus) => {
    try {
      const updated = await updateIssue(issueId, { status });
      setIssues((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update issue");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Timetable Issue Feedback</h1>
        <p className="text-sm text-muted-foreground">Report timetable issues and track resolution status.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Report New Issue</CardTitle>
          <CardDescription>Use this form to report conflicts, capacity, or availability issues.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as IssueCategory)}>
                <SelectTrigger>
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conflict">Conflict</SelectItem>
                  <SelectItem value="capacity">Capacity</SelectItem>
                  <SelectItem value="availability">Availability</SelectItem>
                  <SelectItem value="data">Data</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Affected Slot ID (optional)</Label>
              <Input value={slotId} onChange={(event) => setSlotId(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <Button onClick={() => void handleCreate()} disabled={isSaving || !description.trim()}>
            <Plus className="h-4 w-4 mr-2" />
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
          {issues.map((issue) => (
            <div key={issue.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="text-sm font-medium uppercase">{issue.category}</span>
                  {issue.affected_slot_id ? <Badge variant="outline">{issue.affected_slot_id}</Badge> : null}
                </div>
                <Badge variant="secondary">{issue.status}</Badge>
              </div>
              <p className="text-sm">{issue.description}</p>
              {issue.resolution_notes ? (
                <p className="text-xs text-muted-foreground">Resolution: {issue.resolution_notes}</p>
              ) : null}
              {canManage ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void handleStatusUpdate(issue.id, "in_progress")}>In Progress</Button>
                  <Button size="sm" variant="outline" onClick={() => void handleStatusUpdate(issue.id, "resolved")}>Resolve</Button>
                </div>
              ) : null}
            </div>
          ))}
          {!issues.length ? <p className="text-sm text-muted-foreground">No issues reported yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
