"use client";

import { useEffect, useState } from "react";
import {
    Settings,
    User,
    Bell,
    Shield,
    Database,
    Save,
    School
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

import { useAuth } from "@/components/auth-provider";
import {
    DEFAULT_ACADEMIC_CYCLE,
    DEFAULT_SCHEDULE_POLICY,
    DEFAULT_WORKING_HOURS,
    fetchAcademicCycleSettings,
    fetchSmtpConfigurationStatus,
    fetchSchedulePolicy,
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
import {
    deleteSemesterConstraint,
    getSemesterConstraint,
    listSemesterConstraints,
    upsertSemesterConstraint,
    type SemesterConstraint,
    type SemesterConstraintUpsert,
} from "@/lib/constraints-api";

const SEMESTER_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8"];

const DEFAULT_SEMESTER_CONSTRAINT: SemesterConstraintUpsert = {
    term_number: 1,
    earliest_start_time: "08:50",
    latest_end_time: "16:35",
    max_hours_per_day: 6,
    max_hours_per_week: 30,
    min_break_minutes: 0,
    max_consecutive_hours: 3,
};

const normalizeWorkingHours = (hours: WorkingHoursEntry[]): WorkingHoursEntry[] => {
    const byDay = new Map(hours.map((entry) => [entry.day, entry]));
    return DEFAULT_WORKING_HOURS.map((entry) => byDay.get(entry.day) ?? entry);
};

export default function SettingsPage() {
    const { user, changePassword } = useAuth();
    const isAdmin = user?.role === "admin";
    const canEditWorkingHours = user?.role === "admin" || user?.role === "scheduler";
    const [activeTab, setActiveTab] = useState("general");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    const [workingHours, setWorkingHours] = useState<WorkingHoursEntry[]>(DEFAULT_WORKING_HOURS);
    const [workingHoursLoading, setWorkingHoursLoading] = useState(false);
    const [workingHoursSaving, setWorkingHoursSaving] = useState(false);
    const [workingHoursError, setWorkingHoursError] = useState<string | null>(null);
    const [workingHoursSuccess, setWorkingHoursSuccess] = useState<string | null>(null);
    const [schedulePolicy, setSchedulePolicy] = useState<SchedulePolicyUpdate>(DEFAULT_SCHEDULE_POLICY);
    const [schedulePolicyLoading, setSchedulePolicyLoading] = useState(false);
    const [schedulePolicySaving, setSchedulePolicySaving] = useState(false);
    const [schedulePolicyError, setSchedulePolicyError] = useState<string | null>(null);
    const [schedulePolicySuccess, setSchedulePolicySuccess] = useState<string | null>(null);
    const [academicCycle, setAcademicCycle] = useState<AcademicCycleSettings>(DEFAULT_ACADEMIC_CYCLE);
    const [academicCycleLoading, setAcademicCycleLoading] = useState(false);
    const [academicCycleSaving, setAcademicCycleSaving] = useState(false);
    const [academicCycleError, setAcademicCycleError] = useState<string | null>(null);
    const [academicCycleSuccess, setAcademicCycleSuccess] = useState<string | null>(null);
    const [semesterConstraints, setSemesterConstraints] = useState<SemesterConstraint[]>([]);
    const [selectedSemester, setSelectedSemester] = useState("1");
    const [constraintForm, setConstraintForm] = useState<SemesterConstraintUpsert>({
        ...DEFAULT_SEMESTER_CONSTRAINT,
        term_number: 1,
    });
    const [constraintLoading, setConstraintLoading] = useState(false);
    const [constraintSaving, setConstraintSaving] = useState(false);
    const [constraintError, setConstraintError] = useState<string | null>(null);
    const [constraintSuccess, setConstraintSuccess] = useState<string | null>(null);
    const [constraintDeleting, setConstraintDeleting] = useState(false);
    const [smtpStatus, setSmtpStatus] = useState<SmtpConfigurationStatus | null>(null);
    const [smtpStatusLoading, setSmtpStatusLoading] = useState(false);
    const [smtpError, setSmtpError] = useState<string | null>(null);
    const [smtpSuccess, setSmtpSuccess] = useState<string | null>(null);
    const [smtpRecipient, setSmtpRecipient] = useState("");
    const [smtpSending, setSmtpSending] = useState(false);

    useEffect(() => {
        if (activeTab !== "academic") {
            return;
        }

        let isActive = true;
        setWorkingHoursLoading(true);
        setWorkingHoursError(null);
        setSchedulePolicyLoading(true);
        setSchedulePolicyError(null);
        setAcademicCycleLoading(true);
        setAcademicCycleError(null);

        Promise.allSettled([fetchWorkingHours(), fetchSchedulePolicy(), fetchAcademicCycleSettings()])
            .then(([workingHoursResult, policyResult, cycleResult]) => {
                if (!isActive) return;
                if (workingHoursResult.status === "fulfilled") {
                    setWorkingHours(normalizeWorkingHours(workingHoursResult.value.hours));
                } else {
                    const message =
                        workingHoursResult.reason instanceof Error
                            ? workingHoursResult.reason.message
                            : "Unable to load working hours";
                    setWorkingHoursError(message);
                }

                if (policyResult.status === "fulfilled") {
                    setSchedulePolicy(policyResult.value);
                } else {
                    const message =
                        policyResult.reason instanceof Error
                            ? policyResult.reason.message
                            : "Unable to load schedule policy";
                    setSchedulePolicyError(message);
                }

                if (cycleResult.status === "fulfilled") {
                    setAcademicCycle(cycleResult.value);
                } else {
                    const message =
                        cycleResult.reason instanceof Error
                            ? cycleResult.reason.message
                            : "Unable to load academic cycle settings";
                    setAcademicCycleError(message);
                }
            })
            .finally(() => {
                if (!isActive) return;
                setWorkingHoursLoading(false);
                setSchedulePolicyLoading(false);
                setAcademicCycleLoading(false);
            });

        return () => {
            isActive = false;
        };
    }, [activeTab]);

    useEffect(() => {
        if (activeTab !== "academic") {
            return;
        }

        let isActive = true;
        setConstraintLoading(true);
        setConstraintError(null);

        const selected = Number(selectedSemester);

        Promise.allSettled([listSemesterConstraints(), getSemesterConstraint(selected)])
            .then(([listResult, detailResult]) => {
                if (!isActive) return;

                if (listResult.status === "fulfilled") {
                    setSemesterConstraints(listResult.value);
                } else {
                    const message =
                        listResult.reason instanceof Error
                            ? listResult.reason.message
                            : "Unable to load semester constraints";
                    setConstraintError(message);
                }

                if (detailResult.status === "fulfilled") {
                    const existing = detailResult.value;
                    setConstraintForm({
                        term_number: existing.term_number,
                        earliest_start_time: existing.earliest_start_time,
                        latest_end_time: existing.latest_end_time,
                        max_hours_per_day: existing.max_hours_per_day,
                        max_hours_per_week: existing.max_hours_per_week,
                        min_break_minutes: existing.min_break_minutes,
                        max_consecutive_hours: existing.max_consecutive_hours,
                    });
                } else {
                    setConstraintForm({ ...DEFAULT_SEMESTER_CONSTRAINT, term_number: selected });
                }
            })
            .finally(() => {
                if (!isActive) return;
                setConstraintLoading(false);
            });

        return () => {
            isActive = false;
        };
    }, [activeTab, selectedSemester]);

    useEffect(() => {
        if (activeTab !== "system") {
            return;
        }
        if (!isAdmin) {
            return;
        }

        let isActive = true;
        setSmtpStatusLoading(true);
        setSmtpError(null);
        fetchSmtpConfigurationStatus()
            .then((status) => {
                if (!isActive) return;
                setSmtpStatus(status);
            })
            .catch((error) => {
                if (!isActive) return;
                const message = error instanceof Error ? error.message : "Unable to load SMTP diagnostics";
                setSmtpError(message);
            })
            .finally(() => {
                if (!isActive) return;
                setSmtpStatusLoading(false);
            });

        return () => {
            isActive = false;
        };
    }, [activeTab, isAdmin]);

    const handleWorkingHourToggle = (day: string) => {
        setWorkingHours((prev) =>
            prev.map((entry) => (entry.day === day ? { ...entry, enabled: !entry.enabled } : entry)),
        );
    };

    const handleWorkingHourTimeChange = (day: string, field: "start_time" | "end_time", value: string) => {
        setWorkingHours((prev) =>
            prev.map((entry) => (entry.day === day ? { ...entry, [field]: value } : entry)),
        );
    };

    const handleSaveWorkingHours = async () => {
        setWorkingHoursError(null);
        setWorkingHoursSuccess(null);
        setWorkingHoursSaving(true);
        try {
            const updated = await updateWorkingHours({ hours: workingHours });
            setWorkingHours(normalizeWorkingHours(updated.hours));
            setWorkingHoursSuccess("Working hours updated successfully.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to update working hours";
            setWorkingHoursError(message);
        } finally {
            setWorkingHoursSaving(false);
        }
    };

    const handlePolicyFieldChange = (
        field: keyof Pick<SchedulePolicyUpdate, "period_minutes" | "lab_contiguous_slots">,
        value: number,
    ) => {
        setSchedulePolicy((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handlePolicyBreakChange = (
        index: number,
        field: keyof BreakWindowEntry,
        value: string,
    ) => {
        setSchedulePolicy((prev) => ({
            ...prev,
            breaks: prev.breaks.map((item, currentIndex) =>
                currentIndex === index ? { ...item, [field]: value } : item,
            ),
        }));
    };

    const handleAddBreak = () => {
        setSchedulePolicy((prev) => ({
            ...prev,
            breaks: [...prev.breaks, { name: `Break ${prev.breaks.length + 1}`, start_time: "11:00", end_time: "11:15" }],
        }));
    };

    const handleRemoveBreak = (index: number) => {
        setSchedulePolicy((prev) => ({
            ...prev,
            breaks: prev.breaks.filter((_, currentIndex) => currentIndex !== index),
        }));
    };

    const handleSaveSchedulePolicy = async () => {
        setSchedulePolicyError(null);
        setSchedulePolicySuccess(null);
        setSchedulePolicySaving(true);
        try {
            const updated = await updateSchedulePolicy(schedulePolicy);
            setSchedulePolicy(updated);
            setSchedulePolicySuccess("Slot and break rules updated.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to update schedule policy";
            setSchedulePolicyError(message);
        } finally {
            setSchedulePolicySaving(false);
        }
    };

    const handleSaveAcademicCycle = async () => {
        setAcademicCycleError(null);
        setAcademicCycleSuccess(null);
        setAcademicCycleSaving(true);
        try {
            const updated = await updateAcademicCycleSettings(academicCycle);
            setAcademicCycle(updated);
            setAcademicCycleSuccess("Academic cycle settings updated.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to update academic cycle settings";
            setAcademicCycleError(message);
        } finally {
            setAcademicCycleSaving(false);
        }
    };

    const handleSemesterChange = (value: string) => {
        setSelectedSemester(value);
        const selected = Number(value);
        const existing = semesterConstraints.find((item) => item.term_number === selected);
        if (existing) {
            setConstraintForm({
                term_number: existing.term_number,
                earliest_start_time: existing.earliest_start_time,
                latest_end_time: existing.latest_end_time,
                max_hours_per_day: existing.max_hours_per_day,
                max_hours_per_week: existing.max_hours_per_week,
                min_break_minutes: existing.min_break_minutes,
                max_consecutive_hours: existing.max_consecutive_hours,
            });
        } else {
            setConstraintForm({ ...DEFAULT_SEMESTER_CONSTRAINT, term_number: selected });
        }
        setConstraintError(null);
        setConstraintSuccess(null);
    };

    const handleConstraintFieldChange = (
        field: keyof SemesterConstraintUpsert,
        value: string | number,
    ) => {
        setConstraintForm((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleSaveConstraint = async () => {
        setConstraintError(null);
        setConstraintSuccess(null);
        setConstraintSaving(true);
        try {
            const saved = await upsertSemesterConstraint(constraintForm.term_number, constraintForm);
            setSemesterConstraints((prev) => {
                const filtered = prev.filter((item) => item.term_number !== saved.term_number);
                return [...filtered, saved].sort((a, b) => a.term_number - b.term_number);
            });
            setConstraintSuccess("Semester constraints updated.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to update semester constraints";
            setConstraintError(message);
        } finally {
            setConstraintSaving(false);
        }
    };

    const handleDeleteConstraint = async () => {
        setConstraintError(null);
        setConstraintSuccess(null);
        setConstraintDeleting(true);
        try {
            await deleteSemesterConstraint(constraintForm.term_number);
            setSemesterConstraints((prev) =>
                prev.filter((item) => item.term_number !== constraintForm.term_number),
            );
            setConstraintForm({ ...DEFAULT_SEMESTER_CONSTRAINT, term_number: constraintForm.term_number });
            setConstraintSuccess("Semester constraints cleared.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to delete semester constraints";
            setConstraintError(message);
        } finally {
            setConstraintDeleting(false);
        }
    };

    const handleChangePassword = async (event: React.FormEvent) => {
        event.preventDefault();
        setPasswordError(null);
        setPasswordSuccess(null);

        if (!currentPassword || !newPassword) {
            setPasswordError("Current and new password are required.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordError("New passwords do not match.");
            return;
        }

        setIsSavingPassword(true);
        try {
            await changePassword(currentPassword, newPassword);
            setPasswordSuccess("Password updated successfully.");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to change password";
            setPasswordError(message);
        } finally {
            setIsSavingPassword(false);
        }
    };

    const handleRefreshSmtpStatus = async () => {
        if (!isAdmin) return;
        setSmtpStatusLoading(true);
        setSmtpError(null);
        try {
            const status = await fetchSmtpConfigurationStatus();
            setSmtpStatus(status);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to load SMTP diagnostics";
            setSmtpError(message);
        } finally {
            setSmtpStatusLoading(false);
        }
    };

    const handleSendSmtpTest = async () => {
        setSmtpError(null);
        setSmtpSuccess(null);
        setSmtpSending(true);
        try {
            const result = await sendSmtpTestEmail(smtpRecipient.trim() || undefined);
            setSmtpSuccess(`${result.message} Recipient: ${result.recipient}`);
            setSmtpRecipient("");
            await handleRefreshSmtpStatus();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to send SMTP test email";
            setSmtpError(message);
        } finally {
            setSmtpSending(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                    Settings
                </h1>
                <p className="text-muted-foreground mt-2">
                    Manage your institution preferences and system configurations.
                </p>
            </div>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Sidebar Navigation for Settings */}
                <aside className="md:w-64 space-y-2">
                    {[
                        { id: "general", label: "General", icon: Settings },
                        { id: "academic", label: "Academic Years", icon: School },
                        { id: "users", label: "User Management", icon: User },
                        { id: "notifications", label: "Notifications", icon: Bell },
                        { id: "security", label: "Security", icon: Shield },
                        { id: "system", label: "System", icon: Database },
                    ].map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === item.id
                                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                : "hover:bg-accent text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </button>
                    ))}
                </aside>

                {/* Main Content Area */}
                <main className="flex-1">
                    {/* General Settings */}
                    {activeTab === "general" && (
                        <Card className="border-t-4 border-t-primary card-modern">
                            <CardHeader>
                                <CardTitle>Institution Profile</CardTitle>
                                <CardDescription>Update your university details and branding.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-2">
                                    <Label>Institution Name</Label>
                                    <Input defaultValue="Amrita Vishwa Vidyapeetham" className="bg-background/50" readOnly={!isAdmin} />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Campus Location</Label>
                                    <Input defaultValue="Coimbatore" className="bg-background/50" readOnly={!isAdmin} />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Time Zone</Label>
                                    <Input defaultValue="(GMT+05:30) Chennai, Kolkata, Mumbai, New Delhi" className="bg-background/50" readOnly={!isAdmin} />
                                </div>
                            </CardContent>
                            {isAdmin && (
                                <CardFooter className="justify-end border-t border-border/40 pt-6">
                                    <Button>
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Changes
                                    </Button>
                                </CardFooter>
                            )}
                        </Card>
                    )}

                    {activeTab === "security" && (
                        <Card className="border-t-4 border-t-primary card-modern">
                            <CardHeader>
                                <CardTitle>Change Password</CardTitle>
                                <CardDescription>Update your account password.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <form className="space-y-4" onSubmit={handleChangePassword}>
                                    <div className="grid gap-2">
                                        <Label htmlFor="current-password">Current Password</Label>
                                        <Input
                                            id="current-password"
                                            type="password"
                                            value={currentPassword}
                                            onChange={(event) => setCurrentPassword(event.target.value)}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="new-password">New Password</Label>
                                        <Input
                                            id="new-password"
                                            type="password"
                                            value={newPassword}
                                            onChange={(event) => setNewPassword(event.target.value)}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="confirm-password">Confirm New Password</Label>
                                        <Input
                                            id="confirm-password"
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(event) => setConfirmPassword(event.target.value)}
                                        />
                                    </div>
                                    {passwordError ? (
                                        <p className="text-sm text-destructive">{passwordError}</p>
                                    ) : null}
                                    {passwordSuccess ? (
                                        <p className="text-sm text-emerald-600">{passwordSuccess}</p>
                                    ) : null}
                                    <Button type="submit" disabled={isSavingPassword}>
                                        <Shield className="h-4 w-4 mr-2" />
                                        {isSavingPassword ? "Updating..." : "Update Password"}
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    )}

                    {/* Academic Settings */}
                    {activeTab === "academic" && (
                        <Card className="border-t-4 border-t-primary card-modern">
                            <CardHeader>
                                <CardTitle>Academic Configuration</CardTitle>
                                <CardDescription>Manage active semesters and working days.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between p-4 rounded-lg border bg-background/50">
                                    <div className="space-y-0.5">
                                        <Label className="text-base">Current Academic Year</Label>
                                        <p className="text-sm text-muted-foreground">Set the global academic year and Odd/Even cycle used by generation.</p>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-[180px_180px] gap-2">
                                        <Input
                                            value={academicCycle.academic_year}
                                            onChange={(event) =>
                                                setAcademicCycle((prev) => ({ ...prev, academic_year: event.target.value }))
                                            }
                                            className="font-mono text-center"
                                            disabled={!canEditWorkingHours || academicCycleLoading}
                                        />
                                        <Select
                                            value={academicCycle.semester_cycle}
                                            onValueChange={(value) =>
                                                setAcademicCycle((prev) => ({
                                                    ...prev,
                                                    semester_cycle: value as AcademicCycleSettings["semester_cycle"],
                                                }))
                                            }
                                            disabled={!canEditWorkingHours || academicCycleLoading}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="odd">Odd Cycle</SelectItem>
                                                <SelectItem value="even">Even Cycle</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                {academicCycleError ? <p className="text-sm text-destructive">{academicCycleError}</p> : null}
                                {academicCycleSuccess ? <p className="text-sm text-emerald-600">{academicCycleSuccess}</p> : null}
                                <Separator />
                                <div className="space-y-3">
                                    <div>
                                        <Label>Working Hours</Label>
                                        <p className="text-sm text-muted-foreground">Define the campus working window for each day.</p>
                                    </div>
                                    {workingHoursLoading ? (
                                        <p className="text-sm text-muted-foreground">Loading working hours...</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {workingHours.map((entry) => (
                                                <div
                                                    key={entry.day}
                                                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border p-3 rounded-md bg-background/30"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <Switch
                                                            checked={entry.enabled}
                                                            onCheckedChange={() => handleWorkingHourToggle(entry.day)}
                                                            disabled={!canEditWorkingHours}
                                                        />
                                                        <Label>{entry.day}</Label>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Input
                                                            type="time"
                                                            value={entry.start_time}
                                                            onChange={(event) =>
                                                                handleWorkingHourTimeChange(entry.day, "start_time", event.target.value)
                                                            }
                                                            disabled={!canEditWorkingHours || !entry.enabled}
                                                            className="w-[130px]"
                                                        />
                                                        <span className="text-sm text-muted-foreground">to</span>
                                                        <Input
                                                            type="time"
                                                            value={entry.end_time}
                                                            onChange={(event) =>
                                                                handleWorkingHourTimeChange(entry.day, "end_time", event.target.value)
                                                            }
                                                            disabled={!canEditWorkingHours || !entry.enabled}
                                                            className="w-[130px]"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {workingHoursError ? (
                                        <p className="text-sm text-destructive">{workingHoursError}</p>
                                    ) : null}
                                    {workingHoursSuccess ? (
                                        <p className="text-sm text-emerald-600">{workingHoursSuccess}</p>
                                    ) : null}
                                    {!canEditWorkingHours ? (
                                        <p className="text-xs text-muted-foreground">
                                            Only administrators and schedulers can update working hours.
                                        </p>
                                    ) : null}
                                </div>
                                <Separator />
                                <div className="space-y-4">
                                    <div>
                                        <Label>Slot and Break Rules</Label>
                                        <p className="text-sm text-muted-foreground">
                                            Configure period duration, lab slot grouping, and institutional breaks.
                                        </p>
                                    </div>
                                    {schedulePolicyLoading ? (
                                        <p className="text-sm text-muted-foreground">Loading slot rules...</p>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="grid gap-2">
                                                    <Label>Period Duration (minutes)</Label>
                                                    <Input
                                                        type="number"
                                                        min={5}
                                                        max={180}
                                                        value={schedulePolicy.period_minutes}
                                                        onChange={(event) =>
                                                            handlePolicyFieldChange("period_minutes", Number(event.target.value))
                                                        }
                                                        disabled={!canEditWorkingHours}
                                                    />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label>Lab Contiguous Slots</Label>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        max={8}
                                                        value={schedulePolicy.lab_contiguous_slots}
                                                        onChange={(event) =>
                                                            handlePolicyFieldChange("lab_contiguous_slots", Number(event.target.value))
                                                        }
                                                        disabled={!canEditWorkingHours}
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <Label>Break Windows</Label>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={handleAddBreak}
                                                        disabled={!canEditWorkingHours}
                                                    >
                                                        Add Break
                                                    </Button>
                                                </div>
                                                {schedulePolicy.breaks.map((breakEntry, index) => (
                                                    <div
                                                        key={`${breakEntry.name}-${index}`}
                                                        className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_auto] gap-2 items-end border p-3 rounded-md bg-background/30"
                                                    >
                                                        <div className="grid gap-2">
                                                            <Label>Name</Label>
                                                            <Input
                                                                value={breakEntry.name}
                                                                onChange={(event) =>
                                                                    handlePolicyBreakChange(index, "name", event.target.value)
                                                                }
                                                                disabled={!canEditWorkingHours}
                                                            />
                                                        </div>
                                                        <div className="grid gap-2">
                                                            <Label>Start</Label>
                                                            <Input
                                                                type="time"
                                                                value={breakEntry.start_time}
                                                                onChange={(event) =>
                                                                    handlePolicyBreakChange(index, "start_time", event.target.value)
                                                                }
                                                                disabled={!canEditWorkingHours}
                                                            />
                                                        </div>
                                                        <div className="grid gap-2">
                                                            <Label>End</Label>
                                                            <Input
                                                                type="time"
                                                                value={breakEntry.end_time}
                                                                onChange={(event) =>
                                                                    handlePolicyBreakChange(index, "end_time", event.target.value)
                                                                }
                                                                disabled={!canEditWorkingHours}
                                                            />
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={() => handleRemoveBreak(index)}
                                                            disabled={!canEditWorkingHours || schedulePolicy.breaks.length <= 1}
                                                        >
                                                            Remove
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {schedulePolicyError ? (
                                        <p className="text-sm text-destructive">{schedulePolicyError}</p>
                                    ) : null}
                                    {schedulePolicySuccess ? (
                                        <p className="text-sm text-emerald-600">{schedulePolicySuccess}</p>
                                    ) : null}
                                </div>
                                <Separator />
                                <div className="space-y-4">
                                    <div>
                                        <Label>Semester Constraints</Label>
                                        <p className="text-sm text-muted-foreground">
                                            Set per-semester limits used to validate published schedules.
                                        </p>
                                    </div>
                                    <div className="flex flex-col md:flex-row md:items-end gap-3">
                                        <div className="space-y-2">
                                            <Label>Semester</Label>
                                            <Select value={selectedSemester} onValueChange={handleSemesterChange}>
                                                <SelectTrigger className="w-[160px]">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {SEMESTER_OPTIONS.map((term) => (
                                                        <SelectItem key={term} value={term}>
                                                            Semester {term}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {constraintLoading ? (
                                            <p className="text-sm text-muted-foreground">Loading constraints...</p>
                                        ) : null}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label>Earliest Start</Label>
                                            <Input
                                                type="time"
                                                value={constraintForm.earliest_start_time}
                                                onChange={(event) =>
                                                    handleConstraintFieldChange("earliest_start_time", event.target.value)
                                                }
                                                disabled={!canEditWorkingHours}
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Latest End</Label>
                                            <Input
                                                type="time"
                                                value={constraintForm.latest_end_time}
                                                onChange={(event) =>
                                                    handleConstraintFieldChange("latest_end_time", event.target.value)
                                                }
                                                disabled={!canEditWorkingHours}
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Max Hours / Day</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={24}
                                                value={constraintForm.max_hours_per_day}
                                                onChange={(event) =>
                                                    handleConstraintFieldChange("max_hours_per_day", Number(event.target.value))
                                                }
                                                disabled={!canEditWorkingHours}
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Max Hours / Week</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={200}
                                                value={constraintForm.max_hours_per_week}
                                                onChange={(event) =>
                                                    handleConstraintFieldChange("max_hours_per_week", Number(event.target.value))
                                                }
                                                disabled={!canEditWorkingHours}
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Min Break (minutes)</Label>
                                            <Input
                                                type="number"
                                                min={0}
                                                max={180}
                                                value={constraintForm.min_break_minutes}
                                                onChange={(event) =>
                                                    handleConstraintFieldChange("min_break_minutes", Number(event.target.value))
                                                }
                                                disabled={!canEditWorkingHours}
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Max Consecutive Hours</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={12}
                                                value={constraintForm.max_consecutive_hours}
                                                onChange={(event) =>
                                                    handleConstraintFieldChange("max_consecutive_hours", Number(event.target.value))
                                                }
                                                disabled={!canEditWorkingHours}
                                            />
                                        </div>
                                    </div>
                                    {constraintError ? (
                                        <p className="text-sm text-destructive">{constraintError}</p>
                                    ) : null}
                                    {constraintSuccess ? (
                                        <p className="text-sm text-emerald-600">{constraintSuccess}</p>
                                    ) : null}
                                    {!canEditWorkingHours ? (
                                        <p className="text-xs text-muted-foreground">
                                            Only administrators and schedulers can update semester constraints.
                                        </p>
                                    ) : null}
                                </div>
                            </CardContent>
                            <CardFooter className="justify-end border-t border-border/40 pt-6">
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <Button
                                        onClick={handleSaveAcademicCycle}
                                        disabled={!canEditWorkingHours || academicCycleSaving || academicCycleLoading}
                                    >
                                        <Save className="h-4 w-4 mr-2" />
                                        {academicCycleSaving ? "Saving..." : "Save Academic Cycle"}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={handleDeleteConstraint}
                                        disabled={!canEditWorkingHours || constraintDeleting}
                                    >
                                        {constraintDeleting ? "Clearing..." : "Clear Semester Constraints"}
                                    </Button>
                                    <Button
                                        onClick={handleSaveConstraint}
                                        disabled={!canEditWorkingHours || constraintSaving}
                                    >
                                        <Save className="h-4 w-4 mr-2" />
                                        {constraintSaving ? "Saving..." : "Save Semester Constraints"}
                                    </Button>
                                    <Button
                                        onClick={handleSaveSchedulePolicy}
                                        disabled={!canEditWorkingHours || schedulePolicySaving || schedulePolicyLoading}
                                    >
                                        <Save className="h-4 w-4 mr-2" />
                                        {schedulePolicySaving ? "Saving..." : "Save Slot Rules"}
                                    </Button>
                                    <Button
                                        onClick={handleSaveWorkingHours}
                                        disabled={!canEditWorkingHours || workingHoursSaving || workingHoursLoading}
                                    >
                                        <Save className="h-4 w-4 mr-2" />
                                        {workingHoursSaving ? "Saving..." : "Update Working Hours"}
                                    </Button>
                                </div>
                            </CardFooter>
                        </Card>
                    )}

                    {/* System Settings */}
                    {activeTab === "system" && (
                        <div className="space-y-6">
                            {!isAdmin ? (
                                <Card className="card-modern">
                                    <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                                        <Shield className="h-12 w-12 mb-4 opacity-20" />
                                        <h3 className="text-lg font-semibold">Restricted Access</h3>
                                        <p>You do not have permission to access system settings.</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <>
                                    <Card className="border-t-4 border-t-primary card-modern">
                                        <CardHeader>
                                            <CardTitle>Email Diagnostics</CardTitle>
                                            <CardDescription>Validate SMTP configuration and deliverability.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            {smtpStatusLoading ? (
                                                <p className="text-sm text-muted-foreground">Loading SMTP status...</p>
                                            ) : smtpStatus ? (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                                    <div className="rounded-md border p-3 bg-background/30">
                                                        <p className="font-medium">Configured</p>
                                                        <p className={smtpStatus.configured ? "text-emerald-600" : "text-destructive"}>
                                                            {smtpStatus.configured ? "Yes" : "No"}
                                                        </p>
                                                    </div>
                                                    <div className="rounded-md border p-3 bg-background/30">
                                                        <p className="font-medium">SMTP Host</p>
                                                        <p>{smtpStatus.host || "-"}</p>
                                                    </div>
                                                    <div className="rounded-md border p-3 bg-background/30">
                                                        <p className="font-medium">Port / Security</p>
                                                        <p>
                                                            {smtpStatus.port} • {smtpStatus.use_ssl ? "SSL" : smtpStatus.use_tls ? "TLS" : "Plain"}
                                                        </p>
                                                    </div>
                                                    <div className="rounded-md border p-3 bg-background/30">
                                                        <p className="font-medium">From Email</p>
                                                        <p>{smtpStatus.from_email || "-"}</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">SMTP diagnostics unavailable.</p>
                                            )}
                                            <div className="grid gap-2">
                                                <Label>Test Recipient (optional)</Label>
                                                <Input
                                                    type="email"
                                                   
                                                    value={smtpRecipient}
                                                    onChange={(event) => setSmtpRecipient(event.target.value)}
                                                />
                                            </div>
                                            {smtpError ? <p className="text-sm text-destructive">{smtpError}</p> : null}
                                            {smtpSuccess ? <p className="text-sm text-emerald-600">{smtpSuccess}</p> : null}
                                        </CardContent>
                                        <CardFooter className="justify-end border-t border-border/40 pt-6 gap-2">
                                            <Button variant="outline" onClick={() => void handleRefreshSmtpStatus()} disabled={smtpStatusLoading}>
                                                Refresh Status
                                            </Button>
                                            <Button onClick={() => void handleSendSmtpTest()} disabled={smtpSending}>
                                                {smtpSending ? "Sending..." : "Send Test Email"}
                                            </Button>
                                        </CardFooter>
                                    </Card>

                                    <Card className="border-t-4 border-t-red-500 card-modern">
                                        <CardHeader>
                                            <CardTitle className="text-red-500">Danger Zone</CardTitle>
                                            <CardDescription>Irreversible actions for system data.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="flex items-center justify-between p-4 border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 rounded-lg">
                                                <div>
                                                    <h4 className="font-semibold text-red-700 dark:text-red-400">Reset All Schedules</h4>
                                                    <p className="text-sm text-red-600/80 dark:text-red-400/70">Delete all generated timetables. This cannot be undone.</p>
                                                </div>
                                                <Button variant="destructive">Reset Schedules</Button>
                                            </div>
                                            <div className="flex items-center justify-between p-4 border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 rounded-lg">
                                                <div>
                                                    <h4 className="font-semibold text-red-700 dark:text-red-400">Clear Master Data</h4>
                                                    <p className="text-sm text-red-600/80 dark:text-red-400/70">Remove all faculty, courses, and rooms.</p>
                                                </div>
                                                <Button variant="destructive">Clear Data</Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </>
                            )}
                        </div>
                    )}

                    {/* Placeholder for others */}
                    {(activeTab === "users" || activeTab === "notifications") && (
                        <Card className="card-modern">
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                                <Shield className="h-12 w-12 mb-4 opacity-20" />
                                <h3 className="text-lg font-semibold">Coming Soon</h3>
                                <p>This settings module is currently under development.</p>
                            </CardContent>
                        </Card>
                    )}

                </main>
            </div>
        </div>
    );
}
