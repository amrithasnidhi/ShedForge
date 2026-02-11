"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Download,
  FileImage,
  FileText,
  RefreshCw,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOfficialTimetable } from "@/hooks/use-official-timetable";
import { fetchHealth } from "@/lib/health-api";
import { generateICSContent } from "@/lib/ics";
import { fetchTimetableAnalytics, type TimetableAnalyticsPayload } from "@/lib/timetable-api";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function getCourseColor(type: string, sessionType?: string): string {
  if (sessionType === "tutorial") {
    return "bg-primary/10 border-primary/30 text-primary";
  }
  switch (type) {
    case "theory":
      return "bg-primary/10 border-primary/30 text-primary";
    case "lab":
      return "bg-accent/20 border-accent/40 text-accent-foreground";
    case "elective":
      return "bg-chart-4/20 border-chart-4/40 text-foreground";
    default:
      return "bg-muted";
  }
}

function resolveSessionType(slot: { sessionType?: "theory" | "tutorial" | "lab" }, courseType?: string): "theory" | "tutorial" | "lab" {
  if (slot.sessionType) {
    return slot.sessionType;
  }
  return courseType === "lab" ? "lab" : "theory";
}

export default function DashboardPage() {
  const { data: timetablePayload, hasOfficial, isLoading: timetableLoading, error: timetableError } = useOfficialTimetable();
  const { timetableData, courseData, roomData, facultyData } = timetablePayload;

  const [healthStatus, setHealthStatus] = useState<"ok" | "error" | "loading">("loading");
  const [analytics, setAnalytics] = useState<TimetableAnalyticsPayload | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const days = useMemo(() => {
    const uniqueDays = Array.from(new Set(timetableData.map((slot) => slot.day)));
    return DAY_ORDER.filter((day) => uniqueDays.includes(day));
  }, [timetableData]);

  const timeSlots = useMemo(() => {
    return Array.from(new Set(timetableData.map((slot) => slot.startTime))).sort((a, b) => a.localeCompare(b));
  }, [timetableData]);

  useEffect(() => {
    let isActive = true;
    fetchHealth()
      .then((data) => {
        if (!isActive) return;
        setHealthStatus(data.status === "ok" ? "ok" : "error");
      })
      .catch(() => {
        if (!isActive) return;
        setHealthStatus("error");
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    fetchTimetableAnalytics()
      .then((data) => {
        if (!isActive) return;
        setAnalytics(data);
        setAnalyticsError(null);
      })
      .catch((error) => {
        if (!isActive) return;
        const message = error instanceof Error ? error.message : "Unable to load analytics";
        setAnalyticsError(message);
      });

    return () => {
      isActive = false;
    };
  }, [hasOfficial]);

  const handleExportCalendar = () => {
    const icsContent = generateICSContent(timetableData, {
      courses: courseData,
      rooms: roomData,
      faculty: facultyData,
    });
    const blob = new Blob([icsContent], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timetable.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const getSlotForDayTime = (day: string, time: string) => {
    return timetableData.find((slot) => slot.day === day && slot.startTime === time);
  };
  const previewDays = days.length ? days : DAY_ORDER.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Live operational view from published timetable data</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={healthStatus === "ok" ? "secondary" : "destructive"}>
            {healthStatus === "loading" ? "Backend: Checking..." : `Backend: ${healthStatus}`}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 bg-transparent">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCalendar}>
                <CalendarCheck className="h-4 w-4 mr-2" />
                Export as .ics
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/schedule">
                  <FileImage className="h-4 w-4 mr-2" />
                  Export as PNG
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/schedule">
                  <FileText className="h-4 w-4 mr-2" />
                  Export as PDF
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Button asChild className="h-auto py-4 flex-col gap-2">
          <Link href="/generator">
            <Calendar className="h-5 w-5" />
            <span>Generate Timetable</span>
          </Link>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-2 bg-transparent" asChild>
          <Link href="/schedule">
            <RefreshCw className="h-5 w-5" />
            <span>Review Current</span>
          </Link>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-2 bg-transparent" asChild>
          <Link href="/versions">
            <BarChart3 className="h-5 w-5" />
            <span>Compare Versions</span>
          </Link>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-2 bg-transparent" asChild>
          <Link href="/conflicts">
            <AlertTriangle className="h-5 w-5" />
            <span>Resolve Conflicts</span>
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Button variant="outline" className="h-auto p-4 justify-start border-dashed hover:border-primary/50" asChild>
          <Link href="/faculty" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-medium">Manage Faculty</p>
              <p className="text-xs text-muted-foreground">Update teaching resources</p>
            </div>
            <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
          </Link>
        </Button>
        <Button variant="outline" className="h-auto p-4 justify-start border-dashed hover:border-primary/50" asChild>
          <Link href="/courses" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-medium">Manage Courses</p>
              <p className="text-xs text-muted-foreground">Maintain course catalog</p>
            </div>
            <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
          </Link>
        </Button>
        <Button variant="outline" className="h-auto p-4 justify-start border-dashed hover:border-primary/50" asChild>
          <Link href="/rooms" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-medium">Manage Rooms</p>
              <p className="text-xs text-muted-foreground">Control room inventory</p>
            </div>
            <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
          </Link>
        </Button>
      </div>

      {timetableLoading ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Loading published timetable...</CardContent>
        </Card>
      ) : null}

      {timetableError ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">{timetableError}</CardContent>
        </Card>
      ) : null}

      {!timetableLoading && !hasOfficial ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">No Published Timetable</CardTitle>
            <CardDescription>Generate and publish a timetable to unlock analytics and role views.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/generator">Open Generator</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {hasOfficial ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Optimization Summary</CardTitle>
                <CardDescription>Computed from the currently published timetable</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Constraint Satisfaction</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-semibold">
                        {analytics?.optimizationSummary.constraintSatisfaction ?? 0}%
                      </span>
                      <Progress value={analytics?.optimizationSummary.constraintSatisfaction ?? 0} className="flex-1" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Conflicts Detected</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-semibold">{analytics?.optimizationSummary.conflictsDetected ?? 0}</span>
                      {(analytics?.optimizationSummary.conflictsDetected ?? 0) > 0 ? (
                        <Badge variant="outline" className="text-warning border-warning">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Review needed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-success border-success">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          All clear
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Technique</p>
                    <span className="text-sm font-medium">{analytics?.optimizationSummary.optimizationTechnique ?? ""}</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Estimated Iterations</p>
                    <span className="text-2xl font-semibold">{analytics?.optimizationSummary.totalIterations ?? 0}</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
                  <span>Compute time: {analytics?.optimizationSummary.computeTime ?? ""}</span>
                  <span>Generated: {analytics?.optimizationSummary.lastGenerated ? new Date(analytics.optimizationSummary.lastGenerated).toLocaleString() : ""}</span>
                </div>
                {analyticsError ? <p className="text-xs text-destructive mt-3">{analyticsError}</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Constraint Intelligence</CardTitle>
                <CardDescription>Live status of enforced scheduling rules</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Constraint</TableHead>
                      <TableHead className="text-right">Satisfaction</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(analytics?.constraintData ?? []).map((constraint) => (
                      <TableRow key={constraint.name}>
                        <TableCell>
                          <span className="font-medium">{constraint.name}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="tabular-nums">{constraint.satisfaction}%</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="outline"
                            className={
                              constraint.status === "satisfied"
                                ? "text-success border-success"
                                : constraint.status === "partial"
                                  ? "text-warning border-warning"
                                  : "text-destructive border-destructive"
                            }
                          >
                            {constraint.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Faculty Workload Analytics</CardTitle>
              <CardDescription>Assigned weekly teaching load from published timetable</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  workload: {
                    label: "Workload Hours",
                    color: "oklch(0.25 0.08 250)",
                  },
                }}
                className="h-[280px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics?.workloadChartData ?? []} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.90 0.01 250)" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "oklch(0.50 0.02 250)" }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "oklch(0.50 0.02 250)" }} />
                    <ChartTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-lg border bg-background p-3 shadow-md">
                              <p className="font-medium">{data.fullName}</p>
                              <p className="text-sm text-muted-foreground">{data.department}</p>
                              <p className="text-sm mt-1">Workload: {data.workload}h / {data.max}h</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="workload" radius={[4, 4, 0, 0]}>
                      {(analytics?.workloadChartData ?? []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.overloaded ? "oklch(0.55 0.20 27)" : "oklch(0.25 0.08 250)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Timetable Preview</CardTitle>
              <CardDescription>Read-only weekly schedule view from official data</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="min-w-[800px]">
                <div className="grid gap-1" style={{ gridTemplateColumns: `80px repeat(${previewDays.length}, minmax(0, 1fr))` }}>
                  <div className="p-2" />
                  {previewDays.map((day) => (
                    <div key={day} className="p-2 text-center font-medium text-sm bg-muted rounded">
                      {day}
                    </div>
                  ))}

                  {timeSlots.map((time) => (
                    <div key={`row-${time}`} className="contents">
                      <div className="p-2 text-xs text-muted-foreground text-right">{time}</div>
                      {previewDays.map((day) => {
                        const slot = getSlotForDayTime(day, time);
                        if (!slot) {
                          return <div key={`${day}-${time}`} className="p-2 rounded bg-muted/30 border border-transparent" />;
                        }
                        const course = courseData.find((item) => item.id === slot.courseId);
                        const room = roomData.find((item) => item.id === slot.roomId);
                        const sessionType = resolveSessionType(slot, course?.type);
                        return (
                          <div key={`${day}-${time}`} className={`p-2 rounded border text-xs ${getCourseColor(course?.type || "", sessionType)}`}>
                            <p className="font-medium truncate">
                              {course?.code}
                              {sessionType === "tutorial" ? " (Tutorial)" : ""}
                            </p>
                            <p className="truncate text-muted-foreground">{room?.name}</p>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
