"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  BookOpen,
  Building2,
  CheckCircle2,
  DoorOpen,
  Gauge,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer } from "@/components/ui/chart";
import { useOfficialTimetable } from "@/hooks/use-official-timetable";
import { listPrograms, type Program } from "@/lib/academic-api";
import { fetchSystemAnalytics, type LabeledCount, type SystemAnalyticsPayload } from "@/lib/analytics-api";
import {
  fetchTimetableAnalytics,
  fetchTimetableTrends,
  type TimetableAnalyticsPayload,
  type TimetableTrendPoint,
} from "@/lib/timetable-api";

const WINDOW_OPTIONS = [7, 14, 30, 60];
const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function formatLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatShortDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "N/A";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatTimeAgo(value: string | null | undefined): string {
  if (!value) {
    return "No publish timestamp";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 60_000) {
    return "Just now";
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusTone(label: string): "default" | "secondary" | "destructive" | "outline" {
  const normalized = label.toLowerCase();
  if (normalized.includes("resolved") || normalized.includes("closed") || normalized.includes("approved")) {
    return "secondary";
  }
  if (normalized.includes("rejected") || normalized.includes("urgent") || normalized.includes("failed")) {
    return "destructive";
  }
  if (normalized.includes("pending") || normalized.includes("open") || normalized.includes("awaiting")) {
    return "outline";
  }
  return "default";
}

function findCount(items: LabeledCount[], labelIncludes: string[]): number {
  return items
    .filter((item) => labelIncludes.some((term) => item.label.toLowerCase().includes(term)))
    .reduce((sum, item) => sum + item.value, 0);
}

function deltaInfo(current: number, previous: number): {
  delta: number;
  direction: "up" | "down" | "flat";
} {
  const delta = current - previous;
  if (Math.abs(delta) < 0.001) {
    return { delta: 0, direction: "flat" };
  }
  return { delta, direction: delta > 0 ? "up" : "down" };
}

function heatmapColor(value: number): string {
  if (value === 0) return "bg-muted/30";
  if (value <= 2) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200";
  if (value <= 4) return "bg-emerald-200 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100";
  if (value <= 6) return "bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100";
  return "bg-rose-200 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100";
}

export default function AnalyticsPage() {
  const { data: officialPayload, hasOfficial } = useOfficialTimetable();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [windowDays, setWindowDays] = useState<number>(14);
  const [analytics, setAnalytics] = useState<TimetableAnalyticsPayload | null>(null);
  const [trendPoints, setTrendPoints] = useState<TimetableTrendPoint[]>([]);
  const [systemAnalytics, setSystemAnalytics] = useState<SystemAnalyticsPayload | null>(null);
  const [timetableError, setTimetableError] = useState<string | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  useEffect(() => {
    listPrograms().then(setPrograms).catch(() => setPrograms([]));
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [timetableResult, trendResult, systemResult] = await Promise.allSettled([
      fetchTimetableAnalytics(),
      fetchTimetableTrends(),
      fetchSystemAnalytics(windowDays),
    ]);

    if (timetableResult.status === "fulfilled") {
      setAnalytics(timetableResult.value);
      setTimetableError(null);
    } else {
      setAnalytics(null);
      const message = timetableResult.reason instanceof Error
        ? timetableResult.reason.message
        : "Unable to load timetable analytics";
      setTimetableError(message);
    }

    if (trendResult.status === "fulfilled") {
      setTrendPoints(trendResult.value);
    } else {
      setTrendPoints([]);
    }

    if (systemResult.status === "fulfilled") {
      setSystemAnalytics(systemResult.value);
      setSystemError(null);
    } else {
      setSystemAnalytics(null);
      const message = systemResult.reason instanceof Error
        ? systemResult.reason.message
        : "Unable to load system analytics";
      setSystemError(message);
    }

    setLastRefreshedAt(new Date().toISOString());
    setIsLoading(false);
  }, [windowDays]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeProgram = useMemo(() => {
    const programId = officialPayload.programId;
    if (!programId) {
      return null;
    }
    return programs.find((program) => program.id === programId) ?? null;
  }, [officialPayload.programId, programs]);

  const workloadData = analytics?.workloadChartData ?? [];
  const avgWorkload = workloadData.length
    ? workloadData.reduce((sum, item) => sum + item.workload, 0) / workloadData.length
    : 0;
  const maxWorkload = workloadData.length ? Math.max(...workloadData.map((item) => item.workload)) : 0;
  const minWorkload = workloadData.length ? Math.min(...workloadData.map((item) => item.workload)) : 0;
  const overloadedCount = workloadData.filter((item) => item.overloaded).length;
  const workloadSpread = maxWorkload - minWorkload;

  const standardDeviation = workloadData.length
    ? Math.sqrt(
        workloadData.reduce((sum, item) => sum + Math.pow(item.workload - avgWorkload, 2), 0) / workloadData.length,
      )
    : 0;
  const fairnessScore = clamp(100 - standardDeviation * 10);

  const utilizationComposite = systemAnalytics
    ? (systemAnalytics.utilization.roomUtilizationPercent
      + systemAnalytics.utilization.facultyUtilizationPercent
      + systemAnalytics.utilization.sectionCoveragePercent) / 3
    : 0;

  const capacityPressure = systemAnalytics && systemAnalytics.capacity.configuredSectionCapacity > 0
    ? (systemAnalytics.capacity.scheduledStudentSeats / systemAnalytics.capacity.configuredSectionCapacity) * 100
    : 0;

  const queueSummary = useMemo(() => {
    if (!systemAnalytics) {
      return {
        pendingLeaves: 0,
        openIssues: 0,
        openFeedback: 0,
        unreadNotifications: 0,
        totalActionable: 0,
      };
    }

    const pendingLeaves = findCount(systemAnalytics.operations.leavesByStatus, ["pending"]);
    const openIssues = findCount(systemAnalytics.operations.issuesByStatus, ["open", "in_progress", "in progress"]);
    const openFeedback = findCount(systemAnalytics.operations.feedbackByStatus, ["open", "awaiting", "under_review", "under review"]);
    const unreadNotifications = systemAnalytics.operations.unreadNotifications;
    const totalActionable = pendingLeaves + openIssues + openFeedback;

    return {
      pendingLeaves,
      openIssues,
      openFeedback,
      unreadNotifications,
      totalActionable,
    };
  }, [systemAnalytics]);

  const operationHealthScore = clamp(100 - queueSummary.totalActionable * 5 - queueSummary.unreadNotifications * 0.5);

  const qualityScore = analytics
    ? clamp(
      analytics.optimizationSummary.constraintSatisfaction
      - analytics.optimizationSummary.conflictsDetected * 2
      - (workloadData.length ? (overloadedCount / workloadData.length) * 25 : 0),
    )
    : 0;

  const activityIntensity = systemAnalytics
    ? systemAnalytics.activity.actionsLastWindow / Math.max(1, systemAnalytics.activity.windowDays)
    : 0;

  const roomTypeData = useMemo(() => {
    if (!systemAnalytics) {
      return [];
    }
    return [
      { label: "Lecture", value: systemAnalytics.inventory.lectureRooms, color: "oklch(0.62 0.18 240)" },
      { label: "Lab", value: systemAnalytics.inventory.labRooms, color: "oklch(0.65 0.15 195)" },
      { label: "Seminar", value: systemAnalytics.inventory.seminarRooms, color: "oklch(0.55 0.20 27)" },
    ];
  }, [systemAnalytics]);

  const userRoleData = useMemo(() => {
    if (!systemAnalytics) {
      return [];
    }
    return Object.entries(systemAnalytics.inventory.usersByRole)
      .map(([role, count]) => ({ label: formatLabel(role), value: count }))
      .sort((left, right) => right.value - left.value);
  }, [systemAnalytics]);

  const activityTrendData = useMemo(() => {
    if (!systemAnalytics) {
      return [];
    }
    return systemAnalytics.activity.actionsByDay.map((item) => ({
      date: item.date,
      label: formatShortDate(item.date),
      actions: item.value,
    }));
  }, [systemAnalytics]);

  const topActionData = useMemo(() => {
    if (!systemAnalytics) {
      return [];
    }
    return systemAnalytics.activity.topActions.slice(0, 8).map((item) => ({
      label: item.label,
      value: item.value,
    }));
  }, [systemAnalytics]);

  const topEntityData = useMemo(() => {
    if (!systemAnalytics) {
      return [];
    }
    return systemAnalytics.activity.topEntities.slice(0, 8).map((item) => ({
      label: formatLabel(item.label),
      value: item.value,
    }));
  }, [systemAnalytics]);

  const constraintsSummary = useMemo(() => {
    const rows = analytics?.constraintData ?? [];
    const counts = {
      satisfied: rows.filter((row) => row.status === "satisfied").length,
      partial: rows.filter((row) => row.status === "partial").length,
      violated: rows.filter((row) => row.status === "violated").length,
    };
    return {
      rows,
      counts,
    };
  }, [analytics]);

  const dailyRows = useMemo(() => {
    const rows = analytics?.dailyWorkloadData ?? [];
    return [...rows].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
  }, [analytics]);

  const facultyOrder = useMemo(() => {
    return workloadData.map((item) => ({ id: item.id, name: item.fullName }));
  }, [workloadData]);

  const trendSeries = useMemo(() => {
    if (trendPoints.length) {
      return trendPoints.map((point) => ({
        label: point.label,
        satisfaction: point.constraint_satisfaction,
        conflicts: point.conflicts_detected,
      }));
    }
    return (analytics?.performanceTrendData ?? []).map((point) => ({
      label: point.semester,
      satisfaction: point.satisfaction,
      conflicts: point.conflicts,
    }));
  }, [analytics?.performanceTrendData, trendPoints]);

  const qualityDelta = useMemo(() => {
    if (trendSeries.length < 2) {
      return {
        satisfaction: { delta: 0, direction: "flat" as const },
        conflicts: { delta: 0, direction: "flat" as const },
      };
    }
    const previous = trendSeries[trendSeries.length - 2];
    const current = trendSeries[trendSeries.length - 1];
    return {
      satisfaction: deltaInfo(current.satisfaction, previous.satisfaction),
      conflicts: deltaInfo(current.conflicts, previous.conflicts),
    };
  }, [trendSeries]);

  const slotsByDayData = useMemo(() => {
    if (!systemAnalytics) {
      return [];
    }
    const entries = Object.entries(systemAnalytics.timetable.slotsByDay).map(([day, value]) => ({ day, value }));
    return entries.sort((left, right) => DAY_ORDER.indexOf(left.day) - DAY_ORDER.indexOf(right.day));
  }, [systemAnalytics]);

  const queuePieData = useMemo(() => {
    return [
      { label: "Pending Leaves", value: queueSummary.pendingLeaves, color: "oklch(0.55 0.20 27)" },
      { label: "Open Issues", value: queueSummary.openIssues, color: "oklch(0.65 0.15 195)" },
      { label: "Open Feedback", value: queueSummary.openFeedback, color: "oklch(0.62 0.18 240)" },
    ];
  }, [queueSummary.openFeedback, queueSummary.openIssues, queueSummary.pendingLeaves]);

  const overloadShare = workloadData.length ? (overloadedCount / workloadData.length) * 100 : 0;

  const riskFaculty = useMemo(() => {
    return [...workloadData]
      .filter((item) => item.overloaded)
      .sort((left, right) => right.workload - left.workload)
      .slice(0, 6);
  }, [workloadData]);

  const underloadedFaculty = useMemo(() => {
    return [...workloadData]
      .filter((item) => item.workload < item.max * 0.5)
      .sort((left, right) => left.workload - right.workload)
      .slice(0, 6);
  }, [workloadData]);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading analytics workspace...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">System Analytics & Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-layer intelligence for system operations, resource health, and timetable quality.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-[160px]">
            <Select
              value={String(windowDays)}
              onValueChange={(value) => setWindowDays(Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>{option} Day Window</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => void loadData()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {systemError ? <p className="text-sm text-destructive">{systemError}</p> : null}
      {timetableError ? <p className="text-sm text-destructive">{timetableError}</p> : null}

      <Card className="border-border/70 bg-gradient-to-br from-background to-muted/30">
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Program Context</p>
            <p className="mt-2 text-lg font-semibold">{activeProgram?.name ?? "Not mapped"}</p>
            <p className="text-xs text-muted-foreground">{activeProgram?.code ?? "No official program id"}</p>
          </div>
          <div className="rounded-lg border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Published Timetable</p>
            <p className="mt-2 text-lg font-semibold">{hasOfficial ? "Available" : "Not published"}</p>
            <p className="text-xs text-muted-foreground">
              {systemAnalytics ? formatTimeAgo(systemAnalytics.timetable.updatedAt) : "No publish data"}
            </p>
          </div>
          <div className="rounded-lg border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Analytics Window</p>
            <p className="mt-2 text-lg font-semibold">{windowDays} days</p>
            <p className="text-xs text-muted-foreground">
              Generated: {formatTimestamp(systemAnalytics?.generatedAt ?? lastRefreshedAt)}
            </p>
          </div>
          <div className="rounded-lg border bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Activity Intensity</p>
            <p className="mt-2 text-lg font-semibold">{activityIntensity.toFixed(1)} actions/day</p>
            <p className="text-xs text-muted-foreground">
              {systemAnalytics?.activity.actionsLastWindow ?? 0} actions in window
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Quality Score</p>
                <p className="mt-1 text-3xl font-semibold">{qualityScore.toFixed(0)}%</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Gauge className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Utilization Composite</p>
                <p className="mt-1 text-3xl font-semibold">{utilizationComposite.toFixed(1)}%</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-chart-1/20">
                <Activity className="h-5 w-5 text-chart-1" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Operation Health</p>
                <p className="mt-1 text-3xl font-semibold">{operationHealthScore.toFixed(0)}%</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
                {operationHealthScore >= 75 ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-warning" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Capacity Pressure</p>
                <p className="mt-1 text-3xl font-semibold">{capacityPressure.toFixed(1)}%</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-chart-4/20">
                <DoorOpen className="h-5 w-5 text-chart-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Workload Fairness</p>
                <p className="mt-1 text-3xl font-semibold">{fairnessScore.toFixed(0)}%</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-chart-2/20">
                <Users className="h-5 w-5 text-chart-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overload Share</p>
                <p className="mt-1 text-3xl font-semibold">{overloadShare.toFixed(1)}%</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Performance Delta</CardTitle>
            <CardDescription>Latest optimization movement versus the previous snapshot</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Constraint Satisfaction</p>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {qualityDelta.satisfaction.direction === "up" ? (
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                  ) : qualityDelta.satisfaction.direction === "down" ? (
                    <TrendingDown className="h-4 w-4 text-rose-600" />
                  ) : (
                    <span>-</span>
                  )}
                  {qualityDelta.satisfaction.delta >= 0 ? "+" : ""}
                  {qualityDelta.satisfaction.delta.toFixed(2)}
                </div>
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Conflict Count</p>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {qualityDelta.conflicts.direction === "down" ? (
                    <TrendingDown className="h-4 w-4 text-emerald-600" />
                  ) : qualityDelta.conflicts.direction === "up" ? (
                    <TrendingUp className="h-4 w-4 text-rose-600" />
                  ) : (
                    <span>-</span>
                  )}
                  {qualityDelta.conflicts.delta >= 0 ? "+" : ""}
                  {qualityDelta.conflicts.delta.toFixed(0)}
                </div>
              </div>
            </div>
            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              Current technique: <span className="font-medium text-foreground">{analytics?.optimizationSummary.optimizationTechnique ?? "N/A"}</span>
              {" • "}
              Iterations: <span className="font-medium text-foreground">{analytics?.optimizationSummary.totalIterations ?? 0}</span>
              {" • "}
              Compute time: <span className="font-medium text-foreground">{analytics?.optimizationSummary.computeTime ?? "N/A"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Operational Backlog</CardTitle>
            <CardDescription>Actionable queue load across requests and communication channels</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Pending Leaves</p>
                <p className="text-2xl font-semibold">{queueSummary.pendingLeaves}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Open Issues</p>
                <p className="text-2xl font-semibold">{queueSummary.openIssues}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Open Feedback</p>
                <p className="text-2xl font-semibold">{queueSummary.openFeedback}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Unread Notifications</p>
                <p className="text-2xl font-semibold">{queueSummary.unreadNotifications}</p>
              </div>
            </div>

            <ChartContainer
              config={{
                value: {
                  label: "Queue",
                  color: "oklch(0.62 0.18 240)",
                },
              }}
              className="h-[220px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={queuePieData}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={4}
                  >
                    {queuePieData.map((item) => (
                      <Cell key={item.label} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {systemAnalytics ? (
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">System Operations Analytics</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Programs</p>
                    <p className="mt-1 text-3xl font-semibold">{systemAnalytics.inventory.programs}</p>
                  </div>
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Courses</p>
                    <p className="mt-1 text-3xl font-semibold">{systemAnalytics.inventory.courses}</p>
                  </div>
                  <BookOpen className="h-5 w-5 text-chart-1" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Faculty</p>
                    <p className="mt-1 text-3xl font-semibold">{systemAnalytics.inventory.faculty}</p>
                  </div>
                  <Users className="h-5 w-5 text-chart-2" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Rooms</p>
                    <p className="mt-1 text-3xl font-semibold">{systemAnalytics.inventory.roomsTotal}</p>
                  </div>
                  <DoorOpen className="h-5 w-5 text-chart-4" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Users ({systemAnalytics.activity.windowDays}d)</p>
                    <p className="mt-1 text-3xl font-semibold">{systemAnalytics.activity.activeUsers}</p>
                  </div>
                  <Activity className="h-5 w-5 text-success" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Unread Notifications</p>
                    <p className="mt-1 text-3xl font-semibold">{systemAnalytics.operations.unreadNotifications}</p>
                  </div>
                  <BellRing className="h-5 w-5 text-warning" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Utilization & Capacity</CardTitle>
                <CardDescription>Room/faculty usage with section-seat pressure</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Room Utilization</span>
                    <span className="font-medium">{systemAnalytics.utilization.roomUtilizationPercent.toFixed(1)}%</span>
                  </div>
                  <Progress value={systemAnalytics.utilization.roomUtilizationPercent} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Faculty Utilization</span>
                    <span className="font-medium">{systemAnalytics.utilization.facultyUtilizationPercent.toFixed(1)}%</span>
                  </div>
                  <Progress value={systemAnalytics.utilization.facultyUtilizationPercent} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Section Coverage</span>
                    <span className="font-medium">{systemAnalytics.utilization.sectionCoveragePercent.toFixed(1)}%</span>
                  </div>
                  <Progress value={systemAnalytics.utilization.sectionCoveragePercent} className="h-2" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Room Capacity</p>
                    <p className="text-xl font-semibold">{systemAnalytics.capacity.totalRoomCapacity}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Section Capacity</p>
                    <p className="text-xl font-semibold">{systemAnalytics.capacity.configuredSectionCapacity}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Scheduled Seats</p>
                    <p className="text-xl font-semibold">{systemAnalytics.capacity.scheduledStudentSeats}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Activity Trend</CardTitle>
                <CardDescription>Daily action volume over the selected window</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    actions: {
                      label: "Actions",
                      color: "oklch(0.65 0.15 195)",
                    },
                  }}
                  className="h-[280px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activityTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.90 0.01 250)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="actions" stroke="oklch(0.65 0.15 195)" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Room Inventory Mix</CardTitle>
                <CardDescription>Lecture, lab, and seminar distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    value: {
                      label: "Rooms",
                      color: "oklch(0.25 0.08 250)",
                    },
                  }}
                  className="h-[260px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={roomTypeData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.90 0.01 250)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {roomTypeData.map((entry) => (
                          <Cell key={entry.label} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top User Actions</CardTitle>
                <CardDescription>Most frequent operations recorded in audit logs</CardDescription>
              </CardHeader>
              <CardContent>
                {topActionData.length ? (
                  <ChartContainer
                    config={{
                      value: {
                        label: "Count",
                        color: "oklch(0.55 0.20 27)",
                      },
                    }}
                    className="h-[260px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topActionData} margin={{ top: 10, right: 10, bottom: 50, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.90 0.01 250)" />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11 }}
                          angle={-20}
                          textAnchor="end"
                          height={66}
                        />
                        <YAxis tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="oklch(0.55 0.20 27)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">No activity actions recorded yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Entity Hotspots</CardTitle>
                <CardDescription>Most touched entities in recent actions</CardDescription>
              </CardHeader>
              <CardContent>
                {topEntityData.length ? (
                  <ChartContainer
                    config={{
                      value: {
                        label: "Count",
                        color: "oklch(0.62 0.18 240)",
                      },
                    }}
                    className="h-[260px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topEntityData} layout="vertical" margin={{ top: 10, right: 10, bottom: 10, left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.90 0.01 250)" />
                        <XAxis type="number" tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={90} />
                        <Tooltip />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="oklch(0.62 0.18 240)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">No entity activity available.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Role & Queue Distribution</CardTitle>
              <CardDescription>Role mix and current operational status split</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium mb-3">User Roles</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {userRoleData.map((item) => (
                    <Badge key={item.label} variant="outline">{item.label}: {item.value}</Badge>
                  ))}
                </div>
                <h3 className="text-sm font-medium mb-2">Workflow Status</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    {systemAnalytics.operations.leavesByStatus.map((item) => (
                      <Badge key={`leave-${item.label}`} variant={statusTone(item.label)}>{formatLabel(item.label)}: {item.value}</Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {systemAnalytics.operations.issuesByStatus.map((item) => (
                      <Badge key={`issue-${item.label}`} variant={statusTone(item.label)}>{formatLabel(item.label)}: {item.value}</Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {systemAnalytics.operations.feedbackByStatus.map((item) => (
                      <Badge key={`feedback-${item.label}`} variant={statusTone(item.label)}>{formatLabel(item.label)}: {item.value}</Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-3">Weekly Slot Load by Day</h3>
                {slotsByDayData.length ? (
                  <ChartContainer
                    config={{
                      value: {
                        label: "Slots",
                        color: "oklch(0.25 0.08 250)",
                      },
                    }}
                    className="h-[220px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={slotsByDayData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.90 0.01 250)" />
                        <XAxis dataKey="day" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="oklch(0.25 0.08 250)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">No slot distribution available.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">System-level analytics are not available right now.</p>
          </CardContent>
        </Card>
      )}

      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Timetable Quality Analytics</h2>
        </div>

        {!analytics ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">No published timetable available for timetable analytics.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Average Workload</p>
                  <p className="mt-1 text-3xl font-semibold">{avgWorkload.toFixed(1)}h</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Maximum Workload</p>
                  <p className="mt-1 text-3xl font-semibold">{maxWorkload.toFixed(1)}h</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Minimum Workload</p>
                  <p className="mt-1 text-3xl font-semibold">{minWorkload.toFixed(1)}h</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Workload Spread</p>
                  <p className="mt-1 text-3xl font-semibold">{workloadSpread.toFixed(1)}h</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Faculty Workload Distribution</CardTitle>
                  <CardDescription>Overloaded faculty are highlighted in red</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      workload: {
                        label: "Workload",
                        color: "oklch(0.25 0.08 250)",
                      },
                    }}
                    className="h-[330px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={workloadData} margin={{ top: 10, right: 20, bottom: 70, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.90 0.01 250)" />
                        <XAxis
                          dataKey="fullName"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11 }}
                          angle={-40}
                          textAnchor="end"
                          height={86}
                        />
                        <YAxis tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Bar dataKey="workload" radius={[4, 4, 0, 0]}>
                          {workloadData.map((entry, index) => (
                            <Cell key={`${entry.id}-${index}`} fill={entry.overloaded ? "oklch(0.55 0.20 27)" : "oklch(0.25 0.08 250)"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Optimization Trajectory</CardTitle>
                  <CardDescription>Constraint satisfaction and conflict history</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      satisfaction: {
                        label: "Satisfaction",
                        color: "oklch(0.65 0.15 195)",
                      },
                      conflicts: {
                        label: "Conflicts",
                        color: "oklch(0.55 0.20 27)",
                      },
                    }}
                    className="h-[300px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendSeries} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.90 0.01 250)" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="left" domain={[0, 100]} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Legend />
                        <Line yAxisId="left" type="monotone" dataKey="satisfaction" stroke="oklch(0.65 0.15 195)" strokeWidth={2} dot={{ r: 3 }} />
                        <Line yAxisId="right" type="monotone" dataKey="conflicts" stroke="oklch(0.55 0.20 27)" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Constraint Compliance Matrix</CardTitle>
                  <CardDescription>Status and satisfaction of enforced timetable constraints</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary">Satisfied: {constraintsSummary.counts.satisfied}</Badge>
                    <Badge variant="outline">Partial: {constraintsSummary.counts.partial}</Badge>
                    <Badge variant="destructive">Violated: {constraintsSummary.counts.violated}</Badge>
                  </div>

                  {constraintsSummary.rows.length ? (
                    <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                      {constraintsSummary.rows.map((row) => (
                        <div key={row.name} className="rounded-md border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">{row.name}</p>
                            <Badge variant={row.status === "satisfied" ? "secondary" : row.status === "partial" ? "outline" : "destructive"}>
                              {formatLabel(row.status)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
                          <div className="mt-2 flex items-center gap-3">
                            <Progress value={row.satisfaction} className="h-2" />
                            <span className="w-10 text-right text-xs font-medium">{row.satisfaction.toFixed(0)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No constraint rows available.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Daily Faculty Heatmap</CardTitle>
                  <CardDescription>Hours assigned per day by faculty member</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <div className="min-w-[680px]">
                      <div className="grid gap-1" style={{ gridTemplateColumns: `110px repeat(${facultyOrder.length}, minmax(56px, 1fr))` }}>
                        <div className="p-2" />
                        {facultyOrder.map((facultyMember) => (
                          <div key={facultyMember.id} className="p-2 text-center text-xs font-medium" title={facultyMember.name}>
                            {facultyMember.name.split(" ").slice(-1)[0]}
                          </div>
                        ))}

                        {dailyRows.map((day) => (
                          <div key={day.day} className="contents">
                            <div className="p-2 text-right text-xs font-medium">{day.day.slice(0, 3)}</div>
                            {facultyOrder.map((facultyMember) => {
                              const value = day.loads[facultyMember.id] ?? 0;
                              return (
                                <div
                                  key={`${day.day}-${facultyMember.id}`}
                                  className={`rounded p-2 text-center text-xs ${heatmapColor(value)}`}
                                  title={`${facultyMember.name}: ${value}h on ${day.day}`}
                                >
                                  {value > 0 ? value : "-"}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Faculty Risk Focus</CardTitle>
                  <CardDescription>Immediate workload risk candidates</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-medium">Overloaded Faculty</p>
                    {riskFaculty.length ? (
                      <div className="space-y-2">
                        {riskFaculty.map((item) => (
                          <div key={`risk-${item.id}`} className="flex items-center justify-between rounded-md border p-2 text-sm">
                            <span>{item.fullName}</span>
                            <Badge variant="destructive">{item.workload.toFixed(1)}h / {item.max.toFixed(1)}h</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No overloaded faculty.</p>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium">Low Utilization Faculty</p>
                    {underloadedFaculty.length ? (
                      <div className="space-y-2">
                        {underloadedFaculty.map((item) => (
                          <div key={`under-${item.id}`} className="flex items-center justify-between rounded-md border p-2 text-sm">
                            <span>{item.fullName}</span>
                            <Badge variant="outline">{item.workload.toFixed(1)}h / {item.max.toFixed(1)}h</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No underloaded faculty.</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Optimization Profile</CardTitle>
                  <CardDescription>Current run characteristics and solver outputs</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <span className="text-muted-foreground">Constraint Satisfaction</span>
                    <span className="font-semibold">{analytics.optimizationSummary.constraintSatisfaction.toFixed(2)}%</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <span className="text-muted-foreground">Conflicts Detected</span>
                    <span className="font-semibold">{analytics.optimizationSummary.conflictsDetected}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <span className="text-muted-foreground">Technique</span>
                    <span className="font-semibold">{analytics.optimizationSummary.optimizationTechnique}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <span className="text-muted-foreground">Alternatives Generated</span>
                    <span className="font-semibold">{analytics.optimizationSummary.alternativesGenerated}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <span className="text-muted-foreground">Total Iterations</span>
                    <span className="font-semibold">{analytics.optimizationSummary.totalIterations}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <span className="text-muted-foreground">Compute Time</span>
                    <span className="font-semibold">{analytics.optimizationSummary.computeTime}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <span className="text-muted-foreground">Last Generated</span>
                    <span className="font-semibold">{formatTimestamp(analytics.optimizationSummary.lastGenerated ?? null)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
