"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  deleteSemesterConstraint,
  listSemesterConstraints,
  upsertSemesterConstraint,
  type SemesterConstraint,
} from "@/lib/constraints-api";
import { useAuth } from "@/components/auth-provider";

interface ConstraintForm {
  term_number: number;
  earliest_start_time: string;
  latest_end_time: string;
  max_hours_per_day: number;
  max_hours_per_week: number;
  min_break_minutes: number;
  max_consecutive_hours: number;
}

const DEFAULT_FORM: ConstraintForm = {
  term_number: 1,
  earliest_start_time: "08:50",
  latest_end_time: "16:35",
  max_hours_per_day: 6,
  max_hours_per_week: 30,
  min_break_minutes: 0,
  max_consecutive_hours: 3,
};

export default function ConstraintsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "scheduler";

  const [constraints, setConstraints] = useState<SemesterConstraint[]>([]);
  const [form, setForm] = useState<ConstraintForm>(DEFAULT_FORM);
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedConstraint = useMemo(
    () => constraints.find((item) => item.term_number === selectedTerm) ?? null,
    [constraints, selectedTerm],
  );

  const loadConstraints = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listSemesterConstraints();
      const sorted = [...data].sort((a, b) => a.term_number - b.term_number);
      setConstraints(sorted);
      if (sorted.length && selectedTerm === null) {
        const first = sorted[0];
        setSelectedTerm(first.term_number);
        setForm({ ...first });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unable to load constraints";
      setError(detail);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadConstraints();
  }, []);

  const handleSelectTerm = (termNumber: number) => {
    setSelectedTerm(termNumber);
    const found = constraints.find((item) => item.term_number === termNumber);
    if (found) {
      setForm({ ...found });
      setMessage(null);
      setError(null);
    }
  };

  const handleNew = () => {
    const nextTerm = Math.max(0, ...constraints.map((item) => item.term_number)) + 1;
    setSelectedTerm(null);
    setForm({ ...DEFAULT_FORM, term_number: nextTerm });
    setMessage(null);
    setError(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const payload = {
        term_number: form.term_number,
        earliest_start_time: form.earliest_start_time,
        latest_end_time: form.latest_end_time,
        max_hours_per_day: form.max_hours_per_day,
        max_hours_per_week: form.max_hours_per_week,
        min_break_minutes: form.min_break_minutes,
        max_consecutive_hours: form.max_consecutive_hours,
      };
      const saved = await upsertSemesterConstraint(form.term_number, payload);
      setConstraints((prev) => {
        const withoutCurrent = prev.filter((item) => item.term_number !== saved.term_number);
        return [...withoutCurrent, saved].sort((a, b) => a.term_number - b.term_number);
      });
      setSelectedTerm(saved.term_number);
      setForm({ ...saved });
      setMessage(`Saved constraints for Term ${saved.term_number}.`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unable to save constraint";
      setError(detail);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (selectedTerm === null) {
      return;
    }
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      await deleteSemesterConstraint(selectedTerm);
      const updated = constraints.filter((item) => item.term_number !== selectedTerm);
      setConstraints(updated);
      if (updated.length) {
        const first = updated[0];
        setSelectedTerm(first.term_number);
        setForm({ ...first });
      } else {
        setSelectedTerm(null);
        setForm({ ...DEFAULT_FORM });
      }
      setMessage(`Deleted constraints for Term ${selectedTerm}.`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unable to delete constraint";
      setError(detail);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Semester Constraints</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure rule envelopes per term used by timetable validation and generation.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configured Terms</CardTitle>
            <CardDescription>Select a term to edit its constraints</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
            {!isLoading && constraints.length === 0 ? (
              <p className="text-sm text-muted-foreground">No term constraints configured yet.</p>
            ) : null}
            {constraints.map((constraint) => (
              <button
                key={constraint.id}
                type="button"
                onClick={() => handleSelectTerm(constraint.term_number)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selectedTerm === constraint.term_number
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">Term {constraint.term_number}</span>
                  <Badge variant="outline">{constraint.earliest_start_time} - {constraint.latest_end_time}</Badge>
                </div>
              </button>
            ))}
            {canEdit ? (
              <Button variant="outline" className="w-full mt-3" onClick={handleNew}>
                <Plus className="h-4 w-4 mr-2" />
                New Term Constraint
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Constraint Details</CardTitle>
            <CardDescription>
              {selectedConstraint ? `Editing Term ${selectedConstraint.term_number}` : "Create a new term constraint"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="term-number">Term Number</Label>
                <Input
                  id="term-number"
                  type="number"
                  min={1}
                  max={20}
                  value={form.term_number}
                  onChange={(e) => setForm((prev) => ({ ...prev, term_number: Number(e.target.value) || 1 }))}
                  disabled={!canEdit || Boolean(selectedConstraint)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="min-break">Minimum Break (minutes)</Label>
                <Input
                  id="min-break"
                  type="number"
                  min={0}
                  max={120}
                  value={form.min_break_minutes}
                  onChange={(e) => setForm((prev) => ({ ...prev, min_break_minutes: Number(e.target.value) || 0 }))}
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="earliest">Earliest Start</Label>
                <Input
                  id="earliest"
                  type="time"
                  value={form.earliest_start_time}
                  onChange={(e) => setForm((prev) => ({ ...prev, earliest_start_time: e.target.value }))}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="latest">Latest End</Label>
                <Input
                  id="latest"
                  type="time"
                  value={form.latest_end_time}
                  onChange={(e) => setForm((prev) => ({ ...prev, latest_end_time: e.target.value }))}
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="max-day">Max Hours / Day</Label>
                <Input
                  id="max-day"
                  type="number"
                  min={1}
                  max={12}
                  value={form.max_hours_per_day}
                  onChange={(e) => setForm((prev) => ({ ...prev, max_hours_per_day: Number(e.target.value) || 1 }))}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="max-week">Max Hours / Week</Label>
                <Input
                  id="max-week"
                  type="number"
                  min={1}
                  max={80}
                  value={form.max_hours_per_week}
                  onChange={(e) => setForm((prev) => ({ ...prev, max_hours_per_week: Number(e.target.value) || 1 }))}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="max-consecutive">Max Consecutive Hours</Label>
                <Input
                  id="max-consecutive"
                  type="number"
                  min={1}
                  max={8}
                  value={form.max_consecutive_hours}
                  onChange={(e) => setForm((prev) => ({ ...prev, max_consecutive_hours: Number(e.target.value) || 1 }))}
                  disabled={!canEdit}
                />
              </div>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {message ? <p className="text-sm text-success">{message}</p> : null}

            {canEdit ? (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={() => void handleSave()} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Constraint
                </Button>
                {selectedConstraint ? (
                  <Button variant="outline" className="text-destructive" onClick={() => void handleDelete()} disabled={isSaving}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">You have read-only access to constraint configuration.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
