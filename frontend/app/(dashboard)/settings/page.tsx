"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Database,
  GraduationCap,
  Mail,
  RefreshCw,
  Save,
  Settings2,
  Shield,
  User,
  Wrench,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listPrograms, type Program } from "@/lib/academic-api";
import {
  deleteSemesterConstraint,
  getProgramConstraint,
  getProgramConstraintReport,
  getSemesterConstraint,
  listSemesterConstraints,
  type ConstraintSlotTag,
  type ProgramConstraint,
  type ProgramConstraintReport,
  type ProgramConstraintUpsert,
  type ProgramDailyTimeSlot,
  type SemesterConstraint,
  type SemesterConstraintUpsert,
  upsertProgramConstraint,
  upsertSemesterConstraint,
} from "@/lib/constraints-api";
import { fetchHealthLive, fetchHealthReady, type HealthLiveStatus, type HealthReadyStatus } from "@/lib/health-api";
import {
  DEFAULT_ACADEMIC_CYCLE,
  DEFAULT_SCHEDULE_POLICY,
  DEFAULT_WORKING_HOURS,
  fetchAcademicCycleSettings,
  fetchSchedulePolicy,
  fetchSmtpConfigurationStatus,
  fetchWorkingHours,
  sendSmtpTestEmail,
  updateAcademicCycleSettings,
  updateSchedulePolicy,
  updateWorkingHours,
  type AcademicCycleSettings,
  type BreakWindowEntry,
  type SchedulePolicyUpdate,
  type SmtpConfigurationStatus,
  type WorkingHoursEntry,
} from "@/lib/settings-api";
import { fetchSystemInfo, triggerSystemBackup, type SystemInfo } from "@/lib/system-api";

const SEMESTER_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const SLOT_TAGS: ConstraintSlotTag[] = ["teaching", "block", "break", "lunch"];

const DEFAULT_SEMESTER_CONSTRAINT: SemesterConstraintUpsert = {
  term_number: 1,
  earliest_start_time: "08:50",
  latest_end_time: "16:35",
  max_hours_per_day: 6,
  max_hours_per_week: 30,
  min_break_minutes: 0,
  max_consecutive_hours: 3,
};

function normalizeWorkingHours(hours: WorkingHoursEntry[]): WorkingHoursEntry[] {
  const byDay = new Map(hours.map((entry) => [entry.day, entry]));
  return DEFAULT_WORKING_HOURS.map((entry) => byDay.get(entry.day) ?? entry);
}

function toProgramConstraintUpsert(record: ProgramConstraint): ProgramConstraintUpsert {
  return {
    program_id: record.program_id,
    daily_time_slots: record.daily_time_slots,
    faculty_min_hours_per_week: record.faculty_min_hours_per_week,
    faculty_max_hours_per_week: record.faculty_max_hours_per_week,
    temporal_window_semesters: record.temporal_window_semesters,
    auto_assign_research_slots: record.auto_assign_research_slots,
    enforce_student_credit_load: record.enforce_student_credit_load,
    enforce_ltp_split: record.enforce_ltp_split,
    enforce_lab_contiguous_blocks: record.enforce_lab_contiguous_blocks,
  };
}

function buildDefaultSlot(): ProgramDailyTimeSlot {
  return {
    start_time: "08:50",
    end_time: "09:40",
    tag: "teaching",
    label: null,
  };
}

function validateTimeWindows(windows: Array<{ start_time: string; end_time: string }>): string | null {
  const invalid = windows.find((item) => item.start_time >= item.end_time);
  if (invalid) {
    return "Each time range must have start time earlier than end time.";
  }
  return null;
}

export default function SettingsPage() {
  const { user, changePassword } = useAuth();
  const canEditAcademic = user?.role === "admin" || user?.role === "scheduler";
  const canManageSmtp = user?.role === "admin" || user?.role === "scheduler";
  const canRunBackup = user?.role === "admin";

  const [activeTab, setActiveTab] = useState("policy");

  const [workingHours, setWorkingHours] = useState<WorkingHoursEntry[]>(DEFAULT_WORKING_HOURS);
  const [schedulePolicy, setSchedulePolicy] = useState<SchedulePolicyUpdate>(DEFAULT_SCHEDULE_POLICY);
  const [academicCycle, setAcademicCycle] = useState<AcademicCycleSettings>(DEFAULT_ACADEMIC_CYCLE);
  const [semesterConstraints, setSemesterConstraints] = useState<SemesterConstraint[]>([]);
  const [selectedSemester, setSelectedSemester] = useState("1");
  const [semesterForm, setSemesterForm] = useState<SemesterConstraintUpsert>(DEFAULT_SEMESTER_CONSTRAINT);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [reportTerm, setReportTerm] = useState<string>("all");
  const [programConstraint, setProgramConstraint] = useState<ProgramConstraintUpsert | null>(null);
  const [programReport, setProgramReport] = useState<ProgramConstraintReport | null>(null);

  const [smtpStatus, setSmtpStatus] = useState<SmtpConfigurationStatus | null>(null);
  const [smtpRecipient, setSmtpRecipient] = useState("");

  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [liveStatus, setLiveStatus] = useState<HealthLiveStatus | null>(null);
  const [readyStatus, setReadyStatus] = useState<HealthReadyStatus | null>(null);
  const [backupResult, setBackupResult] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loadingState, setLoadingState] = useState({
    core: false,
    semester: false,
    programs: false,
    programConstraint: false,
    smtp: false,
    ops: false,
  });
  const [savingState, setSavingState] = useState({
    academicCycle: false,
    workingHours: false,
    schedulePolicy: false,
    semester: false,
    deleteSemester: false,
    programConstraint: false,
    smtpTest: false,
    password: false,
    backup: false,
  });

  const [messages, setMessages] = useState({
    globalError: null as string | null,
    academic: null as string | null,
    programConstraint: null as string | null,
    smtp: null as string | null,
    security: null as string | null,
    operations: null as string | null,
    success: null as string | null,
  });

  const workingDaysEnabled = useMemo(
    () => workingHours.filter((item) => item.enabled).length,
    [workingHours],
  );

  const selectedProgram = useMemo(
    () => programs.find((item) => item.id === selectedProgramId) ?? null,
    [programs, selectedProgramId],
  );

  useEffect(() => {
    void loadCoreAcademicSettings();
    void loadPrograms();
    void loadOperationsSnapshot();
  }, []);

  useEffect(() => {
    if (!canManageSmtp) return;
    void loadSmtpStatus();
  }, [canManageSmtp]);

  useEffect(() => {
    const term = Number(selectedSemester);
    if (!Number.isFinite(term)) return;
    void loadSemesterConstraint(term);
  }, [selectedSemester]);

  useEffect(() => {
    if (!selectedProgramId) return;
    void loadProgramConstraintSuite(selectedProgramId);
  }, [selectedProgramId, reportTerm]);

  const loadCoreAcademicSettings = async () => {
    setLoadingState((prev) => ({ ...prev, core: true }));
    setMessages((prev) => ({ ...prev, globalError: null }));

    const [workingResult, policyResult, cycleResult, semestersResult] = await Promise.allSettled([
      fetchWorkingHours(),
      fetchSchedulePolicy(),
      fetchAcademicCycleSettings(),
      listSemesterConstraints(),
    ]);

    const errors: string[] = [];
    if (workingResult.status === "fulfilled") {
      setWorkingHours(normalizeWorkingHours(workingResult.value.hours));
    } else {
      errors.push(workingResult.reason instanceof Error ? workingResult.reason.message : "Unable to load working hours.");
    }

    if (policyResult.status === "fulfilled") {
      setSchedulePolicy(policyResult.value);
    } else {
      errors.push(policyResult.reason instanceof Error ? policyResult.reason.message : "Unable to load slot policy.");
    }

    if (cycleResult.status === "fulfilled") {
      setAcademicCycle(cycleResult.value);
    } else {
      errors.push(cycleResult.reason instanceof Error ? cycleResult.reason.message : "Unable to load academic cycle.");
    }

    if (semestersResult.status === "fulfilled") {
      setSemesterConstraints(semestersResult.value);
    } else {
      errors.push(semestersResult.reason instanceof Error ? semestersResult.reason.message : "Unable to load semester constraints.");
    }

    setMessages((prev) => ({ ...prev, globalError: errors.length ? errors.join(" ") : null }));
    setLoadingState((prev) => ({ ...prev, core: false }));
  };

  const loadSemesterConstraint = async (termNumber: number) => {
    setLoadingState((prev) => ({ ...prev, semester: true }));
    try {
      const constraint = await getSemesterConstraint(termNumber);
      setSemesterForm({
        term_number: constraint.term_number,
        earliest_start_time: constraint.earliest_start_time,
        latest_end_time: constraint.latest_end_time,
        max_hours_per_day: constraint.max_hours_per_day,
        max_hours_per_week: constraint.max_hours_per_week,
        min_break_minutes: constraint.min_break_minutes,
        max_consecutive_hours: constraint.max_consecutive_hours,
      });
    } catch {
      setSemesterForm({ ...DEFAULT_SEMESTER_CONSTRAINT, term_number: termNumber });
    } finally {
      setLoadingState((prev) => ({ ...prev, semester: false }));
    }
  };

  const loadPrograms = async () => {
    setLoadingState((prev) => ({ ...prev, programs: true }));
    try {
      const rows = await listPrograms();
      setPrograms(rows);
      setSelectedProgramId((prev) => prev || rows[0]?.id || "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load programs.";
      setMessages((prev) => ({ ...prev, programConstraint: message }));
    } finally {
      setLoadingState((prev) => ({ ...prev, programs: false }));
    }
  };

  const loadProgramConstraintSuite = async (programId: string) => {
    setLoadingState((prev) => ({ ...prev, programConstraint: true }));
    setMessages((prev) => ({ ...prev, programConstraint: null }));

    const requestedTerm = reportTerm === "all" ? undefined : Number(reportTerm);
    const [constraintResult, reportResult] = await Promise.allSettled([
      getProgramConstraint(programId),
      getProgramConstraintReport(programId, Number.isFinite(requestedTerm) ? requestedTerm : undefined),
    ]);

    if (constraintResult.status === "fulfilled") {
      setProgramConstraint(toProgramConstraintUpsert(constraintResult.value));
    } else {
      const message =
        constraintResult.reason instanceof Error
          ? constraintResult.reason.message
          : "Unable to load program constraints.";
      setMessages((prev) => ({ ...prev, programConstraint: message }));
    }

    if (reportResult.status === "fulfilled") {
      setProgramReport(reportResult.value);
    } else {
      const message =
        reportResult.reason instanceof Error
          ? reportResult.reason.message
          : "Unable to load program constraint report.";
      setMessages((prev) => ({ ...prev, programConstraint: message }));
    }

    setLoadingState((prev) => ({ ...prev, programConstraint: false }));
  };

  const loadSmtpStatus = async () => {
    if (!canManageSmtp) return;
    setLoadingState((prev) => ({ ...prev, smtp: true }));
    setMessages((prev) => ({ ...prev, smtp: null }));
    try {
      const status = await fetchSmtpConfigurationStatus();
      setSmtpStatus(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load SMTP diagnostics.";
      setMessages((prev) => ({ ...prev, smtp: message }));
    } finally {
      setLoadingState((prev) => ({ ...prev, smtp: false }));
    }
  };

  const loadOperationsSnapshot = async () => {
    setLoadingState((prev) => ({ ...prev, ops: true }));
    const [infoResult, liveResult, readyResult] = await Promise.allSettled([
      fetchSystemInfo(),
      fetchHealthLive(),
      fetchHealthReady(),
    ]);
    const errors: string[] = [];

    if (infoResult.status === "fulfilled") {
      setSystemInfo(infoResult.value);
    } else {
      errors.push(infoResult.reason instanceof Error ? infoResult.reason.message : "Unable to load system info.");
    }

    if (liveResult.status === "fulfilled") {
      setLiveStatus(liveResult.value);
    } else {
      errors.push(liveResult.reason instanceof Error ? liveResult.reason.message : "Unable to load liveness status.");
    }

    if (readyResult.status === "fulfilled") {
      setReadyStatus(readyResult.value);
    } else {
      errors.push(readyResult.reason instanceof Error ? readyResult.reason.message : "Unable to load readiness status.");
    }

    setMessages((prev) => ({ ...prev, operations: errors.length ? errors.join(" ") : null }));
    setLoadingState((prev) => ({ ...prev, ops: false }));
  };

  const handleSaveAcademicCycle = async () => {
    if (!canEditAcademic) return;
    setSavingState((prev) => ({ ...prev, academicCycle: true }));
    setMessages((prev) => ({ ...prev, academic: null, success: null }));
    try {
      const updated = await updateAcademicCycleSettings(academicCycle);
      setAcademicCycle(updated);
      setMessages((prev) => ({ ...prev, success: "Academic cycle settings updated." }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update academic cycle settings.";
      setMessages((prev) => ({ ...prev, academic: message }));
    } finally {
      setSavingState((prev) => ({ ...prev, academicCycle: false }));
    }
  };

  const handleToggleWorkingDay = (day: string) => {
    setWorkingHours((prev) =>
      prev.map((item) => (item.day === day ? { ...item, enabled: !item.enabled } : item)),
    );
  };

  const handleWorkingHoursTimeChange = (day: string, field: "start_time" | "end_time", value: string) => {
    setWorkingHours((prev) =>
      prev.map((item) => (item.day === day ? { ...item, [field]: value } : item)),
    );
  };

  const handleSaveWorkingHours = async () => {
    if (!canEditAcademic) return;
    const validationError = validateTimeWindows(workingHours.filter((item) => item.enabled));
    if (validationError) {
      setMessages((prev) => ({ ...prev, academic: validationError, success: null }));
      return;
    }

    setSavingState((prev) => ({ ...prev, workingHours: true }));
    setMessages((prev) => ({ ...prev, academic: null, success: null }));
    try {
      const updated = await updateWorkingHours({ hours: workingHours });
      setWorkingHours(normalizeWorkingHours(updated.hours));
      setMessages((prev) => ({ ...prev, success: "Working hours updated." }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update working hours.";
      setMessages((prev) => ({ ...prev, academic: message }));
    } finally {
      setSavingState((prev) => ({ ...prev, workingHours: false }));
    }
  };

  const handlePolicyFieldChange = (
    field: keyof Pick<SchedulePolicyUpdate, "period_minutes" | "lab_contiguous_slots">,
    value: number,
  ) => {
    setSchedulePolicy((prev) => ({ ...prev, [field]: value }));
  };

  const handleBreakFieldChange = (index: number, field: keyof BreakWindowEntry, value: string) => {
    setSchedulePolicy((prev) => ({
      ...prev,
      breaks: prev.breaks.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    }));
  };

  const handleAddBreakWindow = () => {
    setSchedulePolicy((prev) => ({
      ...prev,
      breaks: [...prev.breaks, { name: `Break ${prev.breaks.length + 1}`, start_time: "11:00", end_time: "11:15" }],
    }));
  };

  const handleRemoveBreakWindow = (index: number) => {
    setSchedulePolicy((prev) => ({
      ...prev,
      breaks: prev.breaks.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleSaveSchedulePolicy = async () => {
    if (!canEditAcademic) return;
    const validationError = validateTimeWindows(schedulePolicy.breaks);
    if (validationError) {
      setMessages((prev) => ({ ...prev, academic: validationError, success: null }));
      return;
    }
    setSavingState((prev) => ({ ...prev, schedulePolicy: true }));
    setMessages((prev) => ({ ...prev, academic: null, success: null }));
    try {
      const updated = await updateSchedulePolicy(schedulePolicy);
      setSchedulePolicy(updated);
      setMessages((prev) => ({ ...prev, success: "Slot and break policy updated." }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update slot policy.";
      setMessages((prev) => ({ ...prev, academic: message }));
    } finally {
      setSavingState((prev) => ({ ...prev, schedulePolicy: false }));
    }
  };

  const handleSaveSemesterConstraint = async () => {
    if (!canEditAcademic) return;
    setSavingState((prev) => ({ ...prev, semester: true }));
    setMessages((prev) => ({ ...prev, academic: null, success: null }));
    try {
      const saved = await upsertSemesterConstraint(semesterForm.term_number, semesterForm);
      setSemesterConstraints((prev) => {
        const filtered = prev.filter((item) => item.term_number !== saved.term_number);
        return [...filtered, saved].sort((a, b) => a.term_number - b.term_number);
      });
      setMessages((prev) => ({ ...prev, success: `Semester ${saved.term_number} constraints saved.` }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save semester constraints.";
      setMessages((prev) => ({ ...prev, academic: message }));
    } finally {
      setSavingState((prev) => ({ ...prev, semester: false }));
    }
  };

  const handleDeleteSemesterConstraint = async () => {
    if (!canEditAcademic) return;
    setSavingState((prev) => ({ ...prev, deleteSemester: true }));
    setMessages((prev) => ({ ...prev, academic: null, success: null }));
    try {
      await deleteSemesterConstraint(semesterForm.term_number);
      setSemesterConstraints((prev) => prev.filter((item) => item.term_number !== semesterForm.term_number));
      setSemesterForm({ ...DEFAULT_SEMESTER_CONSTRAINT, term_number: semesterForm.term_number });
      setMessages((prev) => ({ ...prev, success: `Semester ${semesterForm.term_number} constraints cleared.` }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to clear semester constraints.";
      setMessages((prev) => ({ ...prev, academic: message }));
    } finally {
      setSavingState((prev) => ({ ...prev, deleteSemester: false }));
    }
  };

  const handleProgramConstraintField = (
    field: keyof Omit<ProgramConstraintUpsert, "program_id" | "daily_time_slots">,
    value: number | boolean,
  ) => {
    setProgramConstraint((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
  };

  const handleProgramSlotField = (
    index: number,
    field: keyof ProgramDailyTimeSlot,
    value: string | ConstraintSlotTag | null,
  ) => {
    setProgramConstraint((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        daily_time_slots: prev.daily_time_slots.map((item, itemIndex) =>
          itemIndex === index ? { ...item, [field]: value } : item,
        ),
      };
    });
  };

  const handleAddProgramSlot = () => {
    setProgramConstraint((prev) => {
      if (!prev) return prev;
      return { ...prev, daily_time_slots: [...prev.daily_time_slots, buildDefaultSlot()] };
    });
  };

  const handleDeleteProgramSlot = (index: number) => {
    setProgramConstraint((prev) => {
      if (!prev) return prev;
      return { ...prev, daily_time_slots: prev.daily_time_slots.filter((_, itemIndex) => itemIndex !== index) };
    });
  };

  const handleSaveProgramConstraint = async () => {
    if (!canEditAcademic || !selectedProgramId || !programConstraint) return;
    const validationError = validateTimeWindows(programConstraint.daily_time_slots);
    if (validationError) {
      setMessages((prev) => ({ ...prev, programConstraint: validationError, success: null }));
      return;
    }
    setSavingState((prev) => ({ ...prev, programConstraint: true }));
    setMessages((prev) => ({ ...prev, programConstraint: null, success: null }));
    try {
      const payload: ProgramConstraintUpsert = {
        ...programConstraint,
        program_id: selectedProgramId,
      };
      await upsertProgramConstraint(selectedProgramId, payload);
      setMessages((prev) => ({ ...prev, success: "Program constraints updated." }));
      await loadProgramConstraintSuite(selectedProgramId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save program constraints.";
      setMessages((prev) => ({ ...prev, programConstraint: message }));
    } finally {
      setSavingState((prev) => ({ ...prev, programConstraint: false }));
    }
  };

  const handleSmtpTest = async () => {
    if (!canManageSmtp) return;
    setSavingState((prev) => ({ ...prev, smtpTest: true }));
    setMessages((prev) => ({ ...prev, smtp: null, success: null }));
    try {
      const result = await sendSmtpTestEmail(smtpRecipient.trim() || undefined);
      setSmtpRecipient("");
      setMessages((prev) => ({ ...prev, success: `${result.message} Recipient: ${result.recipient}` }));
      await loadSmtpStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send SMTP test email.";
      setMessages((prev) => ({ ...prev, smtp: message }));
    } finally {
      setSavingState((prev) => ({ ...prev, smtpTest: false }));
    }
  };

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setMessages((prev) => ({ ...prev, security: null, success: null }));

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessages((prev) => ({ ...prev, security: "All password fields are required." }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessages((prev) => ({ ...prev, security: "New password and confirmation do not match." }));
      return;
    }

    setSavingState((prev) => ({ ...prev, password: true }));
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessages((prev) => ({ ...prev, success: "Password updated successfully." }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to change password.";
      setMessages((prev) => ({ ...prev, security: message }));
    } finally {
      setSavingState((prev) => ({ ...prev, password: false }));
    }
  };

  const handleTriggerBackup = async () => {
    if (!canRunBackup) return;
    setSavingState((prev) => ({ ...prev, backup: true }));
    setMessages((prev) => ({ ...prev, operations: null, success: null }));
    setBackupResult(null);
    try {
      const result = await triggerSystemBackup();
      setBackupResult(result.backup_file);
      setMessages((prev) => ({ ...prev, success: "System backup completed." }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to trigger backup.";
      setMessages((prev) => ({ ...prev, operations: message }));
    } finally {
      setSavingState((prev) => ({ ...prev, backup: false }));
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 p-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Settings Control Center</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Professional governance hub for academic policies, security posture, communication reliability, and
              runtime operations.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadCoreAcademicSettings()} disabled={loadingState.core}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Policies
            </Button>
            <Button variant="outline" onClick={() => void loadOperationsSnapshot()} disabled={loadingState.ops}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Runtime
            </Button>
          </div>
        </div>
        <Separator />
        <div className="grid gap-3 p-6 sm:grid-cols-2 xl:grid-cols-6">
          <StatusCard label="Role" value={(user?.role ?? "unknown").toUpperCase()} icon={<User className="h-4 w-4" />} />
          <StatusCard
            label="Academic Cycle"
            value={`${academicCycle.academic_year} • ${academicCycle.semester_cycle.toUpperCase()}`}
            icon={<CalendarClock className="h-4 w-4" />}
          />
          <StatusCard label="Working Days" value={`${workingDaysEnabled}/7`} icon={<Clock3 className="h-4 w-4" />} />
          <StatusCard label="Programs" value={`${programs.length}`} icon={<GraduationCap className="h-4 w-4" />} />
          <StatusCard
            label="SMTP"
            value={smtpStatus?.configured ? "Configured" : "Not Configured"}
            icon={<Mail className="h-4 w-4" />}
          />
          <StatusCard
            label="Readiness"
            value={readyStatus?.status?.toUpperCase() ?? "-"}
            icon={<Database className="h-4 w-4" />}
          />
        </div>
      </section>

      {messages.globalError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {messages.globalError}
        </div>
      ) : null}

      {messages.success ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>{messages.success}</span>
          </div>
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid h-auto grid-cols-2 gap-2 p-1 md:grid-cols-5">
          <TabsTrigger value="policy" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Governance
          </TabsTrigger>
          <TabsTrigger value="constraints" className="gap-2">
            <GraduationCap className="h-4 w-4" />
            Constraints
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="communications" className="gap-2">
            <Bell className="h-4 w-4" />
            Communications
          </TabsTrigger>
          <TabsTrigger value="operations" className="gap-2">
            <Database className="h-4 w-4" />
            Reliability
          </TabsTrigger>
        </TabsList>

        <TabsContent value="policy" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Academic Cycle</CardTitle>
                  <CardDescription>Sets the active year and semester-cycle context for scheduling.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-[220px_220px_1fr]">
                  <div className="space-y-2">
                    <Label>Academic Year</Label>
                    <Input
                      value={academicCycle.academic_year}
                      onChange={(event) =>
                        setAcademicCycle((prev) => ({ ...prev, academic_year: event.target.value }))
                      }
                      disabled={!canEditAcademic || loadingState.core}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Semester Cycle</Label>
                    <Select
                      value={academicCycle.semester_cycle}
                      onValueChange={(value) =>
                        setAcademicCycle((prev) => ({
                          ...prev,
                          semester_cycle: value as AcademicCycleSettings["semester_cycle"],
                        }))
                      }
                      disabled={!canEditAcademic || loadingState.core}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="odd">Odd</SelectItem>
                        <SelectItem value="even">Even</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => void handleSaveAcademicCycle()}
                      disabled={!canEditAcademic || savingState.academicCycle}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {savingState.academicCycle ? "Saving..." : "Save Academic Cycle"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Working Hours</CardTitle>
                  <CardDescription>Defines institution-level active teaching windows by day.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loadingState.core ? (
                    <p className="text-sm text-muted-foreground">Loading working hours...</p>
                  ) : (
                    workingHours.map((entry) => (
                      <div key={entry.day} className="grid gap-3 rounded-md border p-3 md:grid-cols-[200px_1fr]">
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={entry.enabled}
                            onCheckedChange={() => handleToggleWorkingDay(entry.day)}
                            disabled={!canEditAcademic}
                          />
                          <Label>{entry.day}</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={entry.start_time}
                            onChange={(event) => handleWorkingHoursTimeChange(entry.day, "start_time", event.target.value)}
                            disabled={!canEditAcademic || !entry.enabled}
                            className="w-[140px]"
                          />
                          <span className="text-sm text-muted-foreground">to</span>
                          <Input
                            type="time"
                            value={entry.end_time}
                            onChange={(event) => handleWorkingHoursTimeChange(entry.day, "end_time", event.target.value)}
                            disabled={!canEditAcademic || !entry.enabled}
                            className="w-[140px]"
                          />
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    onClick={() => void handleSaveWorkingHours()}
                    disabled={!canEditAcademic || savingState.workingHours}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {savingState.workingHours ? "Updating..." : "Update Working Hours"}
                  </Button>
                </CardFooter>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Governance Checklist</CardTitle>
                <CardDescription>Recommended checks before running generation jobs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>1. Confirm academic year and cycle match the planning period.</p>
                <p>2. Ensure active teaching days are correctly enabled.</p>
                <p>3. Validate slot policy and mandatory breaks.</p>
                <p>4. Save semester envelopes for all terms in scope.</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Slot & Break Policy</CardTitle>
              <CardDescription>Controls period duration, default practical continuity, and break windows.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Period Duration (minutes)">
                  <Input
                    type="number"
                    min={5}
                    max={180}
                    value={schedulePolicy.period_minutes}
                    onChange={(event) => handlePolicyFieldChange("period_minutes", Number(event.target.value))}
                    disabled={!canEditAcademic}
                  />
                </Field>
                <Field label="Default Lab Contiguous Slots">
                  <Input
                    type="number"
                    min={1}
                    max={8}
                    value={schedulePolicy.lab_contiguous_slots}
                    onChange={(event) => handlePolicyFieldChange("lab_contiguous_slots", Number(event.target.value))}
                    disabled={!canEditAcademic}
                  />
                </Field>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Break Windows</Label>
                  <Button variant="outline" size="sm" onClick={handleAddBreakWindow} disabled={!canEditAcademic}>
                    Add Break
                  </Button>
                </div>
                {schedulePolicy.breaks.map((entry, index) => (
                  <div
                    key={`${entry.name}-${index}`}
                    className="grid gap-2 rounded-md border p-3 md:grid-cols-[1.2fr_1fr_1fr_auto]"
                  >
                    <Input
                      value={entry.name}
                      onChange={(event) => handleBreakFieldChange(index, "name", event.target.value)}
                      disabled={!canEditAcademic}
                    />
                    <Input
                      type="time"
                      value={entry.start_time}
                      onChange={(event) => handleBreakFieldChange(index, "start_time", event.target.value)}
                      disabled={!canEditAcademic}
                    />
                    <Input
                      type="time"
                      value={entry.end_time}
                      onChange={(event) => handleBreakFieldChange(index, "end_time", event.target.value)}
                      disabled={!canEditAcademic}
                    />
                    <Button
                      variant="outline"
                      onClick={() => handleRemoveBreakWindow(index)}
                      disabled={!canEditAcademic || schedulePolicy.breaks.length <= 1}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => void handleSaveSchedulePolicy()}
                disabled={!canEditAcademic || savingState.schedulePolicy}
              >
                <Save className="mr-2 h-4 w-4" />
                {savingState.schedulePolicy ? "Saving..." : "Save Slot Policy"}
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Semester Constraint Envelope</CardTitle>
              <CardDescription>Defines hard timing envelopes and per-term load limits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Term">
                  <Select value={selectedSemester} onValueChange={setSelectedSemester}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEMESTER_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          Semester {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {loadingState.semester ? (
                  <p className="pb-2 text-sm text-muted-foreground">Loading selected term...</p>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Earliest Start">
                  <Input
                    type="time"
                    value={semesterForm.earliest_start_time}
                    onChange={(event) =>
                      setSemesterForm((prev) => ({ ...prev, earliest_start_time: event.target.value }))
                    }
                    disabled={!canEditAcademic}
                  />
                </Field>
                <Field label="Latest End">
                  <Input
                    type="time"
                    value={semesterForm.latest_end_time}
                    onChange={(event) => setSemesterForm((prev) => ({ ...prev, latest_end_time: event.target.value }))}
                    disabled={!canEditAcademic}
                  />
                </Field>
                <Field label="Max Hours / Day">
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={semesterForm.max_hours_per_day}
                    onChange={(event) =>
                      setSemesterForm((prev) => ({ ...prev, max_hours_per_day: Number(event.target.value) }))
                    }
                    disabled={!canEditAcademic}
                  />
                </Field>
                <Field label="Max Hours / Week">
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={semesterForm.max_hours_per_week}
                    onChange={(event) =>
                      setSemesterForm((prev) => ({ ...prev, max_hours_per_week: Number(event.target.value) }))
                    }
                    disabled={!canEditAcademic}
                  />
                </Field>
                <Field label="Minimum Break (minutes)">
                  <Input
                    type="number"
                    min={0}
                    max={180}
                    value={semesterForm.min_break_minutes}
                    onChange={(event) =>
                      setSemesterForm((prev) => ({ ...prev, min_break_minutes: Number(event.target.value) }))
                    }
                    disabled={!canEditAcademic}
                  />
                </Field>
                <Field label="Max Consecutive Hours">
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={semesterForm.max_consecutive_hours}
                    onChange={(event) =>
                      setSemesterForm((prev) => ({ ...prev, max_consecutive_hours: Number(event.target.value) }))
                    }
                    disabled={!canEditAcademic}
                  />
                </Field>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Button onClick={() => void handleSaveSemesterConstraint()} disabled={!canEditAcademic || savingState.semester}>
                <Save className="mr-2 h-4 w-4" />
                {savingState.semester ? "Saving..." : "Save Semester Constraint"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleDeleteSemesterConstraint()}
                disabled={!canEditAcademic || savingState.deleteSemester}
              >
                {savingState.deleteSemester ? "Clearing..." : "Clear Constraint"}
              </Button>
              <Badge variant="outline">Configured Terms: {semesterConstraints.length}</Badge>
            </CardFooter>
          </Card>

          {messages.academic ? <p className="text-sm text-destructive">{messages.academic}</p> : null}
        </TabsContent>

        <TabsContent value="constraints" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Program Constraint Profile</CardTitle>
              <CardDescription>
                Configure program-level rule packs used by the scheduler for workload, slot tagging, and validation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[1.2fr_200px]">
                <Field label="Program">
                  <Select
                    value={selectedProgramId}
                    onValueChange={setSelectedProgramId}
                    disabled={loadingState.programs || !programs.length}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingState.programs ? "Loading programs..." : "Select program"} />
                    </SelectTrigger>
                    <SelectContent>
                      {programs.map((program) => (
                        <SelectItem key={program.id} value={program.id}>
                          {program.code} - {program.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Report Scope">
                  <Select value={reportTerm} onValueChange={setReportTerm} disabled={!selectedProgramId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Terms</SelectItem>
                      {SEMESTER_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          Term {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {!selectedProgram ? (
                <p className="text-sm text-muted-foreground">
                  No programs found. Create a program first to configure program constraints.
                </p>
              ) : null}

              {programConstraint ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Faculty Minimum Hours / Week">
                    <Input
                      type="number"
                      min={0}
                      max={40}
                      value={programConstraint.faculty_min_hours_per_week}
                      onChange={(event) =>
                        handleProgramConstraintField("faculty_min_hours_per_week", Number(event.target.value))
                      }
                      disabled={!canEditAcademic}
                    />
                  </Field>
                  <Field label="Faculty Maximum Hours / Week">
                    <Input
                      type="number"
                      min={0}
                      max={60}
                      value={programConstraint.faculty_max_hours_per_week}
                      onChange={(event) =>
                        handleProgramConstraintField("faculty_max_hours_per_week", Number(event.target.value))
                      }
                      disabled={!canEditAcademic}
                    />
                  </Field>
                  <Field label="Temporal Window (semesters)">
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={programConstraint.temporal_window_semesters}
                      onChange={(event) =>
                        handleProgramConstraintField("temporal_window_semesters", Number(event.target.value))
                      }
                      disabled={!canEditAcademic}
                    />
                  </Field>
                  <div className="space-y-2">
                    <Label>Automatic Behaviors</Label>
                    <div className="space-y-3 rounded-md border p-3">
                      <ToggleRow
                        label="Auto Assign Research Slots"
                        checked={programConstraint.auto_assign_research_slots}
                        onCheckedChange={(value) => handleProgramConstraintField("auto_assign_research_slots", value)}
                        disabled={!canEditAcademic}
                      />
                      <ToggleRow
                        label="Enforce Student Credit Load"
                        checked={programConstraint.enforce_student_credit_load}
                        onCheckedChange={(value) => handleProgramConstraintField("enforce_student_credit_load", value)}
                        disabled={!canEditAcademic}
                      />
                      <ToggleRow
                        label="Enforce LTP Split"
                        checked={programConstraint.enforce_ltp_split}
                        onCheckedChange={(value) => handleProgramConstraintField("enforce_ltp_split", value)}
                        disabled={!canEditAcademic}
                      />
                      <ToggleRow
                        label="Enforce Lab Contiguous Blocks"
                        checked={programConstraint.enforce_lab_contiguous_blocks}
                        onCheckedChange={(value) => handleProgramConstraintField("enforce_lab_contiguous_blocks", value)}
                        disabled={!canEditAcademic}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {loadingState.programConstraint
                    ? "Loading program constraints..."
                    : "Select a program to configure constraints."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Daily Time Slot Map</CardTitle>
              <CardDescription>
                Tag slots as `teaching`, `block`, `break`, or `lunch`. Non-teaching tags are excluded from scheduling.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleAddProgramSlot} disabled={!canEditAcademic || !programConstraint}>
                  Add Slot
                </Button>
              </div>
              {programConstraint?.daily_time_slots.length ? (
                programConstraint.daily_time_slots.map((slot, index) => (
                  <div
                    key={`${slot.start_time}-${slot.end_time}-${index}`}
                    className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_1fr_1fr_1.2fr_auto]"
                  >
                    <Input
                      type="time"
                      value={slot.start_time}
                      onChange={(event) => handleProgramSlotField(index, "start_time", event.target.value)}
                      disabled={!canEditAcademic}
                    />
                    <Input
                      type="time"
                      value={slot.end_time}
                      onChange={(event) => handleProgramSlotField(index, "end_time", event.target.value)}
                      disabled={!canEditAcademic}
                    />
                    <Select
                      value={slot.tag}
                      onValueChange={(value) => handleProgramSlotField(index, "tag", value as ConstraintSlotTag)}
                      disabled={!canEditAcademic}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SLOT_TAGS.map((tag) => (
                          <SelectItem key={tag} value={tag}>
                            {tag}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Optional label"
                      value={slot.label ?? ""}
                      onChange={(event) => handleProgramSlotField(index, "label", event.target.value || null)}
                      disabled={!canEditAcademic}
                    />
                    <Button variant="outline" onClick={() => handleDeleteProgramSlot(index)} disabled={!canEditAcademic || !programConstraint}>
                      Remove
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No daily slots configured.</p>
              )}
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => void handleSaveProgramConstraint()}
                disabled={!canEditAcademic || !programConstraint || savingState.programConstraint}
              >
                <Save className="mr-2 h-4 w-4" />
                {savingState.programConstraint ? "Saving..." : "Save Program Constraints"}
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Constraint Validation Report</CardTitle>
              <CardDescription>Program-level integrity report generated from current constraints and academic data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {programReport ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Program: {selectedProgram?.code ?? programReport.program_id}</Badge>
                    <Badge variant="outline">Violations: {programReport.violation_count}</Badge>
                    <Badge variant="outline">Generated: {new Date(programReport.generated_at).toLocaleString()}</Badge>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-auto rounded-md border p-3">
                    {programReport.violations.length ? (
                      programReport.violations.slice(0, 20).map((violation, index) => (
                        <div key={`${violation.code}-${index}`} className="rounded-md border p-2 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={violation.severity === "hard" ? "destructive" : "secondary"}>
                              {violation.severity}
                            </Badge>
                            <span className="font-medium">{violation.code}</span>
                            {typeof violation.term_number === "number" ? <span>Term {violation.term_number}</span> : null}
                          </div>
                          <p className="mt-1 text-muted-foreground">{violation.message}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-emerald-700">No violations detected for the selected scope.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {loadingState.programConstraint ? "Building constraint report..." : "Select a program to view report."}
                </p>
              )}
            </CardContent>
          </Card>

          {messages.programConstraint ? <p className="text-sm text-destructive">{messages.programConstraint}</p> : null}
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Account Security</CardTitle>
              <CardDescription>Manage user identity details and rotate account credentials safely.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-md border p-4">
                <p className="text-sm font-medium">Current Account</p>
                <p className="text-sm text-muted-foreground">Name: {user?.name ?? "-"}</p>
                <p className="text-sm text-muted-foreground">Email: {user?.email ?? "-"}</p>
                <p className="text-sm text-muted-foreground">Role: {(user?.role ?? "unknown").toUpperCase()}</p>
                <p className="text-sm text-muted-foreground">
                  Security baseline: rotate passwords regularly and avoid reuse across services.
                </p>
              </div>

              <form className="space-y-3 rounded-md border p-4" onSubmit={(event) => void handleChangePassword(event)}>
                <p className="text-sm font-medium">Password Rotation</p>
                <Field label="Current Password">
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </Field>
                <Field label="New Password">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </Field>
                <Field label="Confirm New Password">
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </Field>
                <Button type="submit" disabled={savingState.password}>
                  <Shield className="mr-2 h-4 w-4" />
                  {savingState.password ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </CardContent>
          </Card>
          {messages.security ? <p className="text-sm text-destructive">{messages.security}</p> : null}
        </TabsContent>

        <TabsContent value="communications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Email Service Diagnostics</CardTitle>
              <CardDescription>Validate SMTP connectivity and notification reliability settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canManageSmtp ? (
                <p className="text-sm text-muted-foreground">You do not have permission to view SMTP diagnostics.</p>
              ) : loadingState.smtp ? (
                <p className="text-sm text-muted-foreground">Loading SMTP diagnostics...</p>
              ) : smtpStatus ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <StatusTile label="Configured" value={smtpStatus.configured ? "Yes" : "No"} />
                    <StatusTile label="Host" value={smtpStatus.host || "-"} />
                    <StatusTile label="Port" value={`${smtpStatus.port}`} />
                    <StatusTile label="From Email" value={smtpStatus.from_email || "-"} />
                    <StatusTile label="From Name" value={smtpStatus.from_name || "-"} />
                    <StatusTile label="Auth Username Set" value={smtpStatus.username_set ? "Yes" : "No"} />
                    <StatusTile
                      label="Security"
                      value={smtpStatus.use_ssl ? "SSL" : smtpStatus.use_tls ? "TLS" : "None"}
                    />
                    <StatusTile label="Timeout" value={`${smtpStatus.timeout_seconds}s`} />
                    <StatusTile label="Retry Attempts" value={`${smtpStatus.retry_attempts ?? "-"}`} />
                    <StatusTile label="Retry Backoff" value={`${smtpStatus.retry_backoff_seconds ?? "-"}s`} />
                    <StatusTile label="Rate Limit Cooldown" value={`${smtpStatus.rate_limit_cooldown_seconds ?? "-"}s`} />
                    <StatusTile label="Backup SMTP" value={smtpStatus.backup_configured ? "Configured" : "Not Configured"} />
                  </div>
                  <Separator />
                  <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                    <Field label="Test Recipient (optional)">
                      <Input
                        type="email"
                        value={smtpRecipient}
                        onChange={(event) => setSmtpRecipient(event.target.value)}
                        placeholder={user?.email ?? "admin@example.com"}
                      />
                    </Field>
                    <div className="flex items-end">
                      <Button variant="outline" onClick={() => void loadSmtpStatus()} disabled={loadingState.smtp}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                      </Button>
                    </div>
                    <div className="flex items-end">
                      <Button onClick={() => void handleSmtpTest()} disabled={savingState.smtpTest}>
                        {savingState.smtpTest ? "Sending..." : "Send Test Email"}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">SMTP diagnostics are unavailable.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notification Readiness Checklist</CardTitle>
              <CardDescription>Operational controls before enabling broad notification traffic.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. Verify sender identity and mailbox permissions.</p>
              <p>2. Run test email and confirm inbox delivery + spam behavior.</p>
              <p>3. Tune retry/cooldown parameters for provider rate limits.</p>
              <p>4. Validate backup SMTP fallback path.</p>
            </CardContent>
          </Card>

          {messages.smtp ? <p className="text-sm text-destructive">{messages.smtp}</p> : null}
        </TabsContent>

        <TabsContent value="operations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Runtime Reliability Snapshot</CardTitle>
              <CardDescription>Service probes, database schema compatibility, and runtime feature status.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <StatusTile label="Project" value={systemInfo?.name || "-"} />
                <StatusTile label="API Prefix" value={systemInfo?.api_prefix || "-"} />
                <StatusTile label="Liveness" value={liveStatus?.status.toUpperCase() || "-"} />
                <StatusTile label="Readiness" value={readyStatus?.status.toUpperCase() || "-"} />
                <StatusTile
                  label="Database"
                  value={
                    readyStatus
                      ? readyStatus.database.ok
                        ? readyStatus.database.schema_ok
                          ? "Connected + Schema OK"
                          : "Connected + Schema Drift"
                        : "Unavailable"
                      : "-"
                  }
                />
                <StatusTile label="SMTP" value={readyStatus?.smtp.configured ? "Configured" : "Not Configured"} />
              </div>

              {systemInfo?.features ? (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(systemInfo.features).map(([key, value]) => (
                    <Badge key={key} variant={value ? "secondary" : "destructive"}>
                      {key}: {value ? "on" : "off"}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {readyStatus?.database.missing_tables.length ? (
                <p className="text-sm text-destructive">
                  Missing tables: {readyStatus.database.missing_tables.join(", ")}
                </p>
              ) : null}

              {readyStatus && Object.keys(readyStatus.database.missing_columns).length ? (
                <p className="text-sm text-destructive">
                  Missing columns:{" "}
                  {Object.entries(readyStatus.database.missing_columns)
                    .map(([tableName, columns]) => `${tableName}(${columns.join(", ")})`)
                    .join("; ")}
                </p>
              ) : null}

              {readyStatus?.database.error ? (
                <p className="text-sm text-destructive">Database error: {readyStatus.database.error}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Backup Operations</CardTitle>
              <CardDescription>Create point-in-time backups for recovery, rollback, and audit traceability.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {canRunBackup ? (
                <>
                  <Button onClick={() => void handleTriggerBackup()} disabled={savingState.backup}>
                    <Wrench className="mr-2 h-4 w-4" />
                    {savingState.backup ? "Running Backup..." : "Trigger Backup"}
                  </Button>
                  {backupResult ? <p className="text-sm text-emerald-700">Backup file: {backupResult}</p> : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Only administrators can trigger system backups.</p>
              )}
            </CardContent>
          </Card>

          {messages.operations ? <p className="text-sm text-destructive">{messages.operations}</p> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

function StatusCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-sm font-semibold">{value}</p>
        </div>
        <div className="rounded-full border bg-muted/30 p-2 text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
