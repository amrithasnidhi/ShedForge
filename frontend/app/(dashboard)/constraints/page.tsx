"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { listPrograms, type Program } from "@/lib/academic-api";
import {
  deleteSemesterConstraint,
  getProgramConstraint,
  listSemesterConstraints,
  upsertProgramConstraint,
  upsertSemesterConstraint,
  type ProgramConstraint,
  type ProgramDailyTimeSlot,
  type SemesterConstraint,
} from "@/lib/constraints-api";

interface ConstraintForm {
  term_number: number;
  earliest_start_time: string;
  latest_end_time: string;
  max_hours_per_day: number;
  max_hours_per_week: number;
  min_break_minutes: number;
  max_consecutive_hours: number;
}

interface ProgramConstraintForm {
  program_id: string;
  daily_time_slots: ProgramDailyTimeSlot[];
  faculty_min_hours_per_week: number;
  faculty_max_hours_per_week: number;
  temporal_window_semesters: number;
  auto_assign_research_slots: boolean;
  enforce_student_credit_load: boolean;
  enforce_ltp_split: boolean;
  enforce_lab_contiguous_blocks: boolean;
}

const DEFAULT_TERM_FORM: ConstraintForm = {
  term_number: 1,
  earliest_start_time: "08:50",
  latest_end_time: "16:35",
  max_hours_per_day: 6,
  max_hours_per_week: 30,
  min_break_minutes: 0,
  max_consecutive_hours: 3,
};

const EMPTY_PROGRAM_FORM: ProgramConstraintForm = {
  program_id: "",
  daily_time_slots: [],
  faculty_min_hours_per_week: 14,
  faculty_max_hours_per_week: 20,
  temporal_window_semesters: 3,
  auto_assign_research_slots: true,
  enforce_student_credit_load: true,
  enforce_ltp_split: true,
  enforce_lab_contiguous_blocks: true,
};

function buildProgramForm(data: ProgramConstraint): ProgramConstraintForm {
  return {
    program_id: data.program_id,
    daily_time_slots: [...data.daily_time_slots].sort((left, right) =>
      left.start_time.localeCompare(right.start_time),
    ),
    faculty_min_hours_per_week: data.faculty_min_hours_per_week,
    faculty_max_hours_per_week: data.faculty_max_hours_per_week,
    temporal_window_semesters: data.temporal_window_semesters,
    auto_assign_research_slots: data.auto_assign_research_slots,
    enforce_student_credit_load: data.enforce_student_credit_load,
    enforce_ltp_split: data.enforce_ltp_split,
    enforce_lab_contiguous_blocks: data.enforce_lab_contiguous_blocks,
  };
}

export default function ConstraintsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "scheduler";

  const [termConstraints, setTermConstraints] = useState<SemesterConstraint[]>([]);
  const [termForm, setTermForm] = useState<ConstraintForm>(DEFAULT_TERM_FORM);
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [programForm, setProgramForm] = useState<ProgramConstraintForm>(EMPTY_PROGRAM_FORM);

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingTerm, setIsSavingTerm] = useState(false);
  const [isSavingProgram, setIsSavingProgram] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [programError, setProgramError] = useState<string | null>(null);
  const [programMessage, setProgramMessage] = useState<string | null>(null);

  const selectedConstraint = useMemo(
    () => termConstraints.find((item) => item.term_number === selectedTerm) ?? null,
    [termConstraints, selectedTerm],
  );

  const selectedProgram = useMemo(
    () => programs.find((item) => item.id === selectedProgramId) ?? null,
    [programs, selectedProgramId],
  );

  const loadProgramConstraintState = async (programId: string) => {
    setProgramError(null);
    setProgramMessage(null);
    try {
      const constraint = await getProgramConstraint(programId);
      setProgramForm(buildProgramForm(constraint));
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unable to load program constraints";
      setProgramError(detail);
    }
  };

  const loadPage = async () => {
    setIsLoading(true);
    setError(null);
    setProgramError(null);
    try {
      const [termData, programData] = await Promise.all([listSemesterConstraints(), listPrograms()]);
      const sortedTerms = [...termData].sort((a, b) => a.term_number - b.term_number);
      const sortedPrograms = [...programData].sort((a, b) => a.code.localeCompare(b.code));

      setTermConstraints(sortedTerms);
      setPrograms(sortedPrograms);

      if (sortedTerms.length) {
        setSelectedTerm(sortedTerms[0].term_number);
        setTermForm({ ...sortedTerms[0] });
      }

      if (sortedPrograms.length) {
        const initialProgramId = sortedPrograms[0].id;
        setSelectedProgramId(initialProgramId);
        await loadProgramConstraintState(initialProgramId);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unable to load constraints";
      setError(detail);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPage();
  }, []);

  const handleSelectTerm = (termNumber: number) => {
    setSelectedTerm(termNumber);
    const found = termConstraints.find((item) => item.term_number === termNumber);
    if (found) {
      setTermForm({ ...found });
      setMessage(null);
      setError(null);
    }
  };

  const handleNewTerm = () => {
    const nextTerm = Math.max(0, ...termConstraints.map((item) => item.term_number)) + 1;
    setSelectedTerm(null);
    setTermForm({ ...DEFAULT_TERM_FORM, term_number: nextTerm });
    setMessage(null);
    setError(null);
  };

  const handleSaveTerm = async () => {
    setIsSavingTerm(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await upsertSemesterConstraint(termForm.term_number, {
        term_number: termForm.term_number,
        earliest_start_time: termForm.earliest_start_time,
        latest_end_time: termForm.latest_end_time,
        max_hours_per_day: termForm.max_hours_per_day,
        max_hours_per_week: termForm.max_hours_per_week,
        min_break_minutes: termForm.min_break_minutes,
        max_consecutive_hours: termForm.max_consecutive_hours,
      });
      setTermConstraints((prev) => {
        const withoutCurrent = prev.filter((item) => item.term_number !== saved.term_number);
        return [...withoutCurrent, saved].sort((a, b) => a.term_number - b.term_number);
      });
      setSelectedTerm(saved.term_number);
      setTermForm({ ...saved });
      setMessage(`Saved semester envelope for Term ${saved.term_number}.`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unable to save semester constraint";
      setError(detail);
    } finally {
      setIsSavingTerm(false);
    }
  };

  const handleDeleteTerm = async () => {
    if (selectedTerm === null) {
      return;
    }
    setIsSavingTerm(true);
    setMessage(null);
    setError(null);
    try {
      await deleteSemesterConstraint(selectedTerm);
      const updated = termConstraints.filter((item) => item.term_number !== selectedTerm);
      setTermConstraints(updated);
      if (updated.length) {
        setSelectedTerm(updated[0].term_number);
        setTermForm({ ...updated[0] });
      } else {
        setSelectedTerm(null);
        setTermForm(DEFAULT_TERM_FORM);
      }
      setMessage(`Deleted semester envelope for Term ${selectedTerm}.`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unable to delete semester constraint";
      setError(detail);
    } finally {
      setIsSavingTerm(false);
    }
  };

  const handleProgramSelect = async (programId: string) => {
    setSelectedProgramId(programId);
    await loadProgramConstraintState(programId);
  };

  const handleProgramSlotChange = (
    slotIndex: number,
    field: keyof ProgramDailyTimeSlot,
    value: string,
  ) => {
    setProgramForm((prev) => {
      const next = [...prev.daily_time_slots];
      const current = next[slotIndex];
      if (!current) {
        return prev;
      }
      next[slotIndex] = { ...current, [field]: value };
      return { ...prev, daily_time_slots: next };
    });
  };

  const handleAddProgramSlot = () => {
    setProgramForm((prev) => ({
      ...prev,
      daily_time_slots: [
        ...prev.daily_time_slots,
        { start_time: "08:50", end_time: "09:40", tag: "teaching", label: "" },
      ],
    }));
  };

  const handleDeleteProgramSlot = (slotIndex: number) => {
    setProgramForm((prev) => ({
      ...prev,
      daily_time_slots: prev.daily_time_slots.filter((_, index) => index !== slotIndex),
    }));
  };

  const handleSaveProgram = async () => {
    if (!selectedProgramId) {
      setProgramError("Select a program before saving constraints.");
      return;
    }
    setIsSavingProgram(true);
    setProgramError(null);
    setProgramMessage(null);
    try {
      const saved = await upsertProgramConstraint(selectedProgramId, {
        ...programForm,
        program_id: selectedProgramId,
        daily_time_slots: [...programForm.daily_time_slots].sort((left, right) =>
          left.start_time.localeCompare(right.start_time),
        ),
      });
      setProgramForm(buildProgramForm(saved));
      setProgramMessage(`Saved program constraints for ${selectedProgram?.code ?? selectedProgramId}.`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unable to save program constraints";
      setProgramError(detail);
    } finally {
      setIsSavingProgram(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Constraints</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure program-level and semester-level constraints used by timetable generation and validation.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Program Constraints</CardTitle>
          <CardDescription>
            Time slots, faculty workload envelope, temporal workload window, and constraint validation toggles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="program-picker">Program</Label>
              <Select value={selectedProgramId} onValueChange={(value) => void handleProgramSelect(value)}>
                <SelectTrigger id="program-picker">
                  <SelectValue placeholder={isLoading ? "Loading programs..." : "Select program"} />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.code} • {program.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="faculty-min-hours">Faculty Min Hours/Week</Label>
              <Input
                id="faculty-min-hours"
                type="number"
                min={0}
                max={80}
                value={programForm.faculty_min_hours_per_week}
                onChange={(event) =>
                  setProgramForm((prev) => ({
                    ...prev,
                    faculty_min_hours_per_week: Number(event.target.value) || 0,
                  }))
                }
                disabled={!canEdit || !selectedProgramId}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="faculty-max-hours">Faculty Max Hours/Week</Label>
              <Input
                id="faculty-max-hours"
                type="number"
                min={1}
                max={80}
                value={programForm.faculty_max_hours_per_week}
                onChange={(event) =>
                  setProgramForm((prev) => ({
                    ...prev,
                    faculty_max_hours_per_week: Number(event.target.value) || 1,
                  }))
                }
                disabled={!canEdit || !selectedProgramId}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="grid gap-2 md:col-span-1">
              <Label htmlFor="temporal-window">Temporal Window (semesters)</Label>
              <Input
                id="temporal-window"
                type="number"
                min={1}
                max={9}
                value={programForm.temporal_window_semesters}
                onChange={(event) =>
                  setProgramForm((prev) => ({
                    ...prev,
                    temporal_window_semesters: Number(event.target.value) || 1,
                  }))
                }
                disabled={!canEdit || !selectedProgramId}
              />
            </div>
            <div className="grid gap-2 md:col-span-3">
              <Label>Validation Toggles</Label>
              <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="toggle-student-credit" className="text-sm font-normal">
                    Student Weekly Hours vs Credit Load
                  </Label>
                  <Switch
                    id="toggle-student-credit"
                    checked={programForm.enforce_student_credit_load}
                    onCheckedChange={(checked) =>
                      setProgramForm((prev) => ({ ...prev, enforce_student_credit_load: checked }))
                    }
                    disabled={!canEdit || !selectedProgramId}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="toggle-ltp" className="text-sm font-normal">
                    LTP Split & Hours/Week
                  </Label>
                  <Switch
                    id="toggle-ltp"
                    checked={programForm.enforce_ltp_split}
                    onCheckedChange={(checked) =>
                      setProgramForm((prev) => ({ ...prev, enforce_ltp_split: checked }))
                    }
                    disabled={!canEdit || !selectedProgramId}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="toggle-lab" className="text-sm font-normal">
                    Practical Together Count
                  </Label>
                  <Switch
                    id="toggle-lab"
                    checked={programForm.enforce_lab_contiguous_blocks}
                    onCheckedChange={(checked) =>
                      setProgramForm((prev) => ({ ...prev, enforce_lab_contiguous_blocks: checked }))
                    }
                    disabled={!canEdit || !selectedProgramId}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="toggle-research" className="text-sm font-normal">
                    Auto-assign Research Slots (when needed)
                  </Label>
                  <Switch
                    id="toggle-research"
                    checked={programForm.auto_assign_research_slots}
                    onCheckedChange={(checked) =>
                      setProgramForm((prev) => ({ ...prev, auto_assign_research_slots: checked }))
                    }
                    disabled={!canEdit || !selectedProgramId}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Daily Time Slots</h3>
                <p className="text-xs text-muted-foreground">
                  Tag non-teaching slots as `block`, `break`, or `lunch`; scheduler will avoid them.
                </p>
              </div>
              {canEdit ? (
                <Button type="button" variant="outline" size="sm" onClick={handleAddProgramSlot} disabled={!selectedProgramId}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Slot
                </Button>
              ) : null}
            </div>

            <div className="space-y-2">
              {programForm.daily_time_slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">No slots configured. Add at least one teaching slot.</p>
              ) : null}
              {programForm.daily_time_slots.map((slot, index) => (
                <div key={`${slot.start_time}-${slot.end_time}-${index}`} className="grid gap-2 rounded-md border p-2 md:grid-cols-12">
                  <div className="grid gap-1 md:col-span-2">
                    <Label className="text-xs text-muted-foreground">Start</Label>
                    <Input
                      type="time"
                      value={slot.start_time}
                      onChange={(event) => handleProgramSlotChange(index, "start_time", event.target.value)}
                      disabled={!canEdit || !selectedProgramId}
                    />
                  </div>
                  <div className="grid gap-1 md:col-span-2">
                    <Label className="text-xs text-muted-foreground">End</Label>
                    <Input
                      type="time"
                      value={slot.end_time}
                      onChange={(event) => handleProgramSlotChange(index, "end_time", event.target.value)}
                      disabled={!canEdit || !selectedProgramId}
                    />
                  </div>
                  <div className="grid gap-1 md:col-span-3">
                    <Label className="text-xs text-muted-foreground">Tag</Label>
                    <Select
                      value={slot.tag}
                      onValueChange={(value) => handleProgramSlotChange(index, "tag", value)}
                      disabled={!canEdit || !selectedProgramId}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="teaching">teaching</SelectItem>
                        <SelectItem value="block">block</SelectItem>
                        <SelectItem value="break">break</SelectItem>
                        <SelectItem value="lunch">lunch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1 md:col-span-4">
                    <Label className="text-xs text-muted-foreground">Label</Label>
                    <Input
                      value={slot.label ?? ""}
                      placeholder={slot.tag === "teaching" ? "Teaching" : slot.tag.toUpperCase()}
                      onChange={(event) => handleProgramSlotChange(index, "label", event.target.value)}
                      disabled={!canEdit || !selectedProgramId}
                    />
                  </div>
                  <div className="flex items-end justify-end md:col-span-1">
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteProgramSlot(index)}
                        disabled={!selectedProgramId}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {programError ? <p className="text-sm text-destructive">{programError}</p> : null}
          {programMessage ? <p className="text-sm text-emerald-600">{programMessage}</p> : null}

          {canEdit ? (
            <Button onClick={() => void handleSaveProgram()} disabled={isSavingProgram || !selectedProgramId}>
              <Save className="mr-2 h-4 w-4" />
              Save Program Constraints
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">You have read-only access to constraints.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Semester Constraints</CardTitle>
            <CardDescription>Term-level envelope used for generation and publish checks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
            {!isLoading && termConstraints.length === 0 ? (
              <p className="text-sm text-muted-foreground">No term constraints configured yet.</p>
            ) : null}
            {termConstraints.map((constraint) => (
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
                  <Badge variant="outline">
                    {constraint.earliest_start_time} - {constraint.latest_end_time}
                  </Badge>
                </div>
              </button>
            ))}
            {canEdit ? (
              <Button variant="outline" className="mt-3 w-full" onClick={handleNewTerm}>
                <Plus className="mr-2 h-4 w-4" />
                New Term Constraint
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Semester Envelope Details</CardTitle>
            <CardDescription>
              {selectedConstraint ? `Editing Term ${selectedConstraint.term_number}` : "Create a new term envelope"}
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
                  value={termForm.term_number}
                  onChange={(event) =>
                    setTermForm((prev) => ({ ...prev, term_number: Number(event.target.value) || 1 }))
                  }
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
                  value={termForm.min_break_minutes}
                  onChange={(event) =>
                    setTermForm((prev) => ({ ...prev, min_break_minutes: Number(event.target.value) || 0 }))
                  }
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
                  value={termForm.earliest_start_time}
                  onChange={(event) => setTermForm((prev) => ({ ...prev, earliest_start_time: event.target.value }))}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="latest">Latest End</Label>
                <Input
                  id="latest"
                  type="time"
                  value={termForm.latest_end_time}
                  onChange={(event) => setTermForm((prev) => ({ ...prev, latest_end_time: event.target.value }))}
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
                  value={termForm.max_hours_per_day}
                  onChange={(event) =>
                    setTermForm((prev) => ({ ...prev, max_hours_per_day: Number(event.target.value) || 1 }))
                  }
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
                  value={termForm.max_hours_per_week}
                  onChange={(event) =>
                    setTermForm((prev) => ({ ...prev, max_hours_per_week: Number(event.target.value) || 1 }))
                  }
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
                  value={termForm.max_consecutive_hours}
                  onChange={(event) =>
                    setTermForm((prev) => ({ ...prev, max_consecutive_hours: Number(event.target.value) || 1 }))
                  }
                  disabled={!canEdit}
                />
              </div>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

            {canEdit ? (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={() => void handleSaveTerm()} disabled={isSavingTerm}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Term Envelope
                </Button>
                {selectedConstraint ? (
                  <Button
                    variant="outline"
                    className="text-destructive"
                    onClick={() => void handleDeleteTerm()}
                    disabled={isSavingTerm}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">You have read-only access to semester envelopes.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
