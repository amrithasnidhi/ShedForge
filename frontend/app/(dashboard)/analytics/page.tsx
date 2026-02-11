"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  BookOpen,
  Building2,
  CheckCircle2,
  DoorOpen,
  Minus,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { fetchSystemAnalytics, type SystemAnalyticsPayload } from "@/lib/analytics-api";
import {
  fetchTimetableAnalytics,
  fetchTimetableTrends,
  type TimetableAnalyticsPayload,
  type TimetableTrendPoint,
} from "@/lib/timetable-api";

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function getHeatmapColor(value: number): string {
  if (value === 0) return "bg-muted/30";
  if (value <= 2) return "bg-chart-2/30";
  if (value <= 4) return "bg-chart-2/50";
  if (value <= 6) return "bg-chart-2/70";
  return "bg-chart-2/90";
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

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function statusTone(label: string): "default" | "secondary" | "destructive" | "outline" {
  const normalized = label.toLowerCase();
  if (normalized.includes("resolved") || normalized.includes("closed")) {
    return "secondary";
  }
  if (normalized.includes("rejected") || normalized.includes("urgent")) {
    return "destructive";
  }
  if (normalized.includes("pending")) {
    return "outline";
  }
  return "default";
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<TimetableAnalyticsPayload | null>(null);
  const [trendPoints, setTrendPoints] = useState<TimetableTrendPoint[]>([]);
  const [systemAnalytics, setSystemAnalytics] = useState<SystemAnalyticsPayload | null>(null);
  const [timetableError, setTimetableError] = useState<string | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadData() {
      setIsLoading(true);
      const [timetableResult, trendResult, systemResult] = await Promise.allSettled([
        fetchTimetableAnalytics(),
        fetchTimetableTrends(),
        fetchSystemAnalytics(14),
      ]);
      if (!isActive) {
        return;
      }

      if (timetableResult.status === "fulfilled") {
        setAnalytics(timetableResult.value);
        setTimetableError(null);
      } else {
        const message =
          timetableResult.reason instanceof Error
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
        const message =
          systemResult.reason instanceof Error
            ? systemResult.reason.message
            : "Unable to load system analytics";
        setSystemError(message);
      }

      setIsLoading(false);
    }

    loadData().catch(() => {
      if (!isActive) {
        return;
      }
      setIsLoading(false);
      setSystemError("Unable to load analytics");
    });

    return () => {
      isActive = false;
    };
  }, []);

  const workloadData = analytics?.workloadChartData ?? [];
  const avgWorkload = workloadData.length
    ? workloadData.reduce((sum, item) => sum + item.workload, 0) / workloadData.length
    : 0;
  const maxWorkload = workloadData.length ? Math.max(...workloadData.map((item) => item.workload)) : 0;
  const minWorkload = workloadData.length ? Math.min(...workloadData.map((item) => item.workload)) : 0;
  const overloadedCount = workloadData.filter((item) => item.overloaded).length;

  const standardDeviation = workloadData.length
    ? Math.sqrt(
        workloadData.reduce((sum, item) => sum + Math.pow(item.workload - avgWorkload, 2), 0) / workloadData.length,
      )
    : 0;
  const fairnessScore = Math.max(0, 100 - standardDeviation * 10);

  const dailyRows = useMemo(() => {
    const rows = analytics?.dailyWorkloadData ?? [];
    return [...rows].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
  }, [analytics]);

  const facultyOrder = useMemo(() => {
    return workloadData.map((item) => ({ id: item.id, name: item.fullName }));
  }, [workloadData]);

  const roomTypeData = useMemo(() => {
    if (!systemAnalytics) {
      return [];
    }
    return [
      { label: "Lecture", value: systemAnalytics.inventory.lectureRooms },
      { label: "Lab", value: systemAnalytics.inventory.labRooms },
      { label: "Seminar", value: systemAnalytics.inventory.seminarRooms },
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
    return systemAnalytics.activity.topActions.map((item) => ({
      label: item.label,
      value: item.value,
    }));
  }, [systemAnalytics]);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading analytics...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">System Analytics & Insights</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Resource health, user activity, and timetable optimization quality in one view
        </p>
      </div>

      {systemError ? <div className="text-sm text-destructive">{systemError}</div> : null}
      {timetableError ? <div className="text-sm text-destructive">{timetableError}</div> : null}

      {systemAnalytics ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Programs</p>
                    <p className="text-3xl font-semibold mt-1">{systemAnalytics.inventory.programs}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Courses</p>
                    <p className="text-3xl font-semibold mt-1">{systemAnalytics.inventory.courses}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-chart-1/20">
                    <BookOpen className="h-5 w-5 text-chart-1" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Faculty</p>
                    <p className="text-3xl font-semibold mt-1">{systemAnalytics.inventory.faculty}</p>
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
                    <p className="text-sm text-muted-foreground">Rooms</p>
                    <p className="text-3xl font-semibold mt-1">{systemAnalytics.inventory.roomsTotal}</p>
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
                    <p className="text-sm text-muted-foreground">Active Users ({systemAnalytics.activity.windowDays}d)</p>
                    <p className="text-3xl font-semibold mt-1">{systemAnalytics.activity.activeUsers}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
                    <Activity className="h-5 w-5 text-success" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Unread Notifications</p>
                    <p className="text-3xl font-semibold mt-1">{systemAnalytics.operations.unreadNotifications}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10">
                    <BellRing className="h-5 w-5 text-warning" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resource Utilization</CardTitle>
              <CardDescription>Coverage across rooms, faculty assignments, and configured sections</CardDescription>
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
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground">Total Room Capacity</p>
                  <p className="text-xl font-semibold mt-1">{systemAnalytics.capacity.totalRoomCapacity}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground">Section Capacity</p>
                  <p className="text-xl font-semibold mt-1">{systemAnalytics.capacity.configuredSectionCapacity}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground">Scheduled Student Seats</p>
                  <p className="text-xl font-semibold mt-1">{systemAnalytics.capacity.scheduledStudentSeats}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Room Inventory by Type</CardTitle>
                <CardDescription>Distribution of lecture, lab, and seminar spaces</CardDescription>
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
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="oklch(0.25 0.08 250)" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">User Role Distribution</CardTitle>
                <CardDescription>Account count by role</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    value: {
                      label: "Users",
                      color: "oklch(0.62 0.18 240)",
                    },
                  }}
                  className="h-[260px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={userRoleData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.90 0.01 250)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="oklch(0.62 0.18 240)" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Activity Trend</CardTitle>
                <CardDescription>Action volume over the last {systemAnalytics.activity.windowDays} days</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    actions: {
                      label: "Actions",
                      color: "oklch(0.65 0.15 195)",
                    },
                  }}
                  className="h-[260px]"
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

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top Actions</CardTitle>
                <CardDescription>Most common user actions in the selected window</CardDescription>
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
                          angle={-25}
                          textAnchor="end"
                          height={70}
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
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Operational Queues</CardTitle>
                <CardDescription>Current status distribution for notifications and workflows</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Notifications</p>
                  <div className="flex flex-wrap gap-2">
                    {systemAnalytics.operations.notificationsByType.map((item) => (
                      <Badge key={`notif-${item.label}`} variant="outline">
                        {formatLabel(item.label)}: {item.value}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Leave Requests</p>
                  <div className="flex flex-wrap gap-2">
                    {systemAnalytics.operations.leavesByStatus.map((item) => (
                      <Badge key={`leave-${item.label}`} variant={statusTone(item.label)}>
                        {formatLabel(item.label)}: {item.value}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Issues</p>
                  <div className="flex flex-wrap gap-2">
                    {systemAnalytics.operations.issuesByStatus.map((item) => (
                      <Badge key={`issue-${item.label}`} variant={statusTone(item.label)}>
                        {formatLabel(item.label)}: {item.value}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Feedback</p>
                  <div className="flex flex-wrap gap-2">
                    {systemAnalytics.operations.feedbackByStatus.map((item) => (
                      <Badge key={`feedback-${item.label}`} variant={statusTone(item.label)}>
                        {formatLabel(item.label)}: {item.value}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
                <CardDescription>Latest logged actions in the system</CardDescription>
              </CardHeader>
              <CardContent>
                {systemAnalytics.activity.recentLogs.length ? (
                  <div className="space-y-3">
                    {systemAnalytics.activity.recentLogs.slice(0, 8).map((item) => (
                      <div key={item.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">{item.action}</p>
                          <span className="text-xs text-muted-foreground">{formatTimestamp(item.created_at)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {item.entity_type ? `${formatLabel(item.entity_type)} • ` : ""}
                          {item.entity_id ?? "No entity id"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No recent activity logs available.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">System-level analytics are not available right now.</p>
          </CardContent>
        </Card>
      )}

      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Timetable Quality Analytics</h2>
          <p className="text-sm text-muted-foreground mt-1">Computed from the published official timetable</p>
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
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Average Workload</p>
                      <p className="text-3xl font-semibold mt-1">{avgWorkload.toFixed(1)}h</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Minus className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Maximum Load</p>
                      <p className="text-3xl font-semibold mt-1">{maxWorkload.toFixed(1)}h</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                      <TrendingUp className="h-5 w-5 text-destructive" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Minimum Load</p>
                      <p className="text-3xl font-semibold mt-1">{minWorkload.toFixed(1)}h</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
                      <TrendingDown className="h-5 w-5 text-success" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Overloaded Faculty</p>
                      <p className="text-3xl font-semibold mt-1">{overloadedCount}</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10">
                      <AlertTriangle className="h-5 w-5 text-warning" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Workload Fairness Index</CardTitle>
                <CardDescription>Lower distribution variance indicates fairer teaching load</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Fairness Score</span>
                      <span className="text-lg font-semibold">{fairnessScore.toFixed(0)}%</span>
                    </div>
                    <Progress value={fairnessScore} className="h-3" />
                    <p className="text-xs text-muted-foreground mt-2">
                      Standard deviation: {standardDeviation.toFixed(2)} hours
                    </p>
                  </div>
                  <div className="text-center px-6 border-l">
                    {fairnessScore >= 80 ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                          <CheckCircle2 className="h-6 w-6 text-success" />
                        </div>
                        <Badge variant="outline" className="text-success border-success">
                          Excellent
                        </Badge>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
                          <AlertTriangle className="h-6 w-6 text-warning" />
                        </div>
                        <Badge variant="outline" className="text-warning border-warning">
                          Needs Balancing
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Faculty Workload Distribution</CardTitle>
                <CardDescription>Weekly teaching hours by faculty</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    workload: {
                      label: "Workload Hours",
                      color: "oklch(0.25 0.08 250)",
                    },
                  }}
                  className="h-[340px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={workloadData} margin={{ top: 20, right: 20, bottom: 60, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.90 0.01 250)" />
                      <XAxis
                        dataKey="fullName"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: "oklch(0.50 0.02 250)" }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12, fill: "oklch(0.50 0.02 250)" }}
                      />
                      <ChartTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="rounded-lg border bg-background p-3 shadow-md">
                                <p className="font-medium">{data.fullName}</p>
                                <p className="text-sm text-muted-foreground">{data.department}</p>
                                <p className="text-sm mt-1">
                                  Workload: <span className="font-medium">{data.workload}h</span> / {data.max}h max
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="workload" radius={[4, 4, 0, 0]}>
                        {workloadData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.overloaded ? "oklch(0.55 0.20 27)" : "oklch(0.25 0.08 250)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Daily Workload Heatmap</CardTitle>
                  <CardDescription>Hours per day across faculty assignments</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <div className="min-w-[650px]">
                      <div
                        className="grid gap-1"
                        style={{ gridTemplateColumns: `100px repeat(${facultyOrder.length}, minmax(60px, 1fr))` }}
                      >
                        <div className="p-2" />
                        {facultyOrder.map((facultyMember) => (
                          <div
                            key={facultyMember.id}
                            className="p-2 text-center font-medium truncate text-xs"
                            title={facultyMember.name}
                          >
                            {facultyMember.name.split(" ").slice(-1)[0]}
                          </div>
                        ))}

                        {dailyRows.map((day) => (
                          <div key={day.day} className="contents">
                            <div className="p-2 text-right font-medium text-xs">{day.day.slice(0, 3)}</div>
                            {facultyOrder.map((facultyMember) => {
                              const value = day.loads[facultyMember.id] ?? 0;
                              return (
                                <div
                                  key={`${day.day}-${facultyMember.id}`}
                                  className={`p-2 text-center rounded text-xs ${getHeatmapColor(value)}`}
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Optimization Trend</CardTitle>
                  <CardDescription>Latest recorded optimization quality</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      satisfaction: {
                        label: "Satisfaction %",
                        color: "oklch(0.65 0.15 195)",
                      },
                      conflicts: {
                        label: "Conflicts",
                        color: "oklch(0.55 0.20 27)",
                      },
                    }}
                    className="h-[280px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={
                          trendPoints.length
                            ? trendPoints.map((point) => ({
                                semester: point.label,
                                satisfaction: point.constraint_satisfaction,
                                conflicts: point.conflicts_detected,
                              }))
                            : analytics.performanceTrendData
                        }
                        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.90 0.01 250)" />
                        <XAxis
                          dataKey="semester"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fill: "oklch(0.50 0.02 250)" }}
                        />
                        <YAxis
                          yAxisId="left"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fill: "oklch(0.50 0.02 250)" }}
                          domain={[0, 100]}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fill: "oklch(0.50 0.02 250)" }}
                          domain={[0, "auto"]}
                        />
                        <Tooltip />
                        <Legend />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="satisfaction"
                          stroke="oklch(0.65 0.15 195)"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          name="Satisfaction %"
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="conflicts"
                          stroke="oklch(0.55 0.20 27)"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          name="Conflicts"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
