"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  RefreshCw,
  ArrowRight,
  Layers,
  Zap,
  Calendar,
  GitCompare,
  BarChart3,
  FileImage,
  FileText,
  CalendarCheck,
  Plus,
  Users,
  BookOpen
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  optimizationSummary,
  constraintData,
  workloadChartData,
  timetableData,
  courseData,
  roomData,
  facultyData,
  generateICSContent,
} from "@/lib/mock-data";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const timeSlots = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

function getCourseColor(type: string): string {
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

export default function DashboardPage() {
  const [semester, setSemester] = useState("2025-26-odd");
  // Mock state for adding a semester (in a real app this would be in a store or DB)
  const [isAddSemesterOpen, setIsAddSemesterOpen] = useState(false);
  const [semesterList, setSemesterList] = useState([
    { value: "2026-27-odd", label: "2026-27 Odd Sem" },
    { value: "2025-26-even", label: "2025-26 Even Sem" },
    { value: "2025-26-odd", label: "2025-26 Odd Sem" },
    { value: "2024-25-even", label: "2024-25 Even Sem" },
    { value: "2024-25-odd", label: "2024-25 Odd Sem" },
    { value: "2023-24-even", label: "2023-24 Even Sem" },
    { value: "2023-24-odd", label: "2023-24 Odd Sem" },
    { value: "2022-23-even", label: "2022-23 Even Sem" },
    { value: "2022-23-odd", label: "2022-23 Odd Sem" },
    { value: "2021-22-odd", label: "2021-22 Odd Sem" },
  ]);

  const handleExportCalendar = () => {
    const icsContent = generateICSContent(timetableData);
    const blob = new Blob([icsContent], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timetable.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Group timetable data by day and time for the grid
  const getSlotForDayTime = (day: string, time: string) => {
    return timetableData.find(
      (slot) => slot.day === day && slot.startTime === time
    );
  };

  const avgWorkload = workloadChartData.reduce((sum, f) => sum + f.workload, 0) / workloadChartData.length;
  const maxWorkload = Math.max(...workloadChartData.map((f) => f.workload));
  const minWorkload = Math.min(...workloadChartData.map((f) => f.workload));

  return (
    <div className="space-y-6">
      {/* System Status Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-Powered Timetable Scheduling Overview
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={semester} onValueChange={setSemester}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select semester" />
            </SelectTrigger>
            <SelectContent>
              {semesterList.map((sem) => (
                <SelectItem key={sem.value} value={sem.value}>
                  {sem.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={isAddSemesterOpen} onOpenChange={setIsAddSemesterOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" title="Add Semester">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Semester</DialogTitle>
                <DialogDescription>Create a new academic semester term.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Academic Year</Label>
                  <Input placeholder="e.g., 2026-27" />
                </div>
                <div className="grid gap-2">
                  <Label>Term</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select term" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="odd">Odd Sem</SelectItem>
                      <SelectItem value="even">Even Sem</SelectItem>
                      <SelectItem value="summer">Summer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setIsAddSemesterOpen(false)}>Create Semester</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>


      {/* Primary Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Button asChild className="h-auto py-4 flex-col gap-2">
          <Link href="/generator">
            <Calendar className="h-5 w-5" />
            <span>Generate Timetable</span>
          </Link>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-2 bg-transparent">
          <RefreshCw className="h-5 w-5" />
          <span>Generate Alternative</span>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-2 bg-transparent">
          <GitCompare className="h-5 w-5" />
          <span>Compare Schedules</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2 bg-transparent">
              <Download className="h-5 w-5" />
              <span>Export Schedule</span>
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
                Export as PNG (Go to Schedule)
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/schedule">
                <FileText className="h-4 w-4 mr-2" />
                Export as PDF (Go to Schedule)
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Management Shortcuts */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Button variant="outline" className="h-auto p-4 justify-start border-dashed hover:border-primary/50" asChild>
          <Link href="/faculty" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-medium">Manage Faculty</p>
              <p className="text-xs text-muted-foreground">Add or edit faculty members</p>
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
              <p className="text-xs text-muted-foreground">Add or edit course catalog</p>
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
              <p className="text-xs text-muted-foreground">Add or edit class availability</p>
            </div>
            <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
          </Link>
        </Button>
      </div>

      {/* Optimization Summary */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Optimization Summary</CardTitle>
            <CardDescription>Current schedule performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Constraint Satisfaction</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-semibold">{optimizationSummary.constraintSatisfaction}%</span>
                  <Progress value={optimizationSummary.constraintSatisfaction} className="flex-1" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Conflicts Detected</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-semibold">{optimizationSummary.conflictsDetected}</span>
                  {optimizationSummary.conflictsDetected > 0 ? (
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
                <p className="text-sm text-muted-foreground">Optimization Technique</p>
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium">{optimizationSummary.optimizationTechnique}</span>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Alternatives Generated</p>
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <span className="text-2xl font-semibold">{optimizationSummary.alternativesGenerated}</span>
                  <span className="text-sm text-muted-foreground">schedules</span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
              <span>Compute time: {optimizationSummary.computeTime}</span>
              <span>Iterations: {optimizationSummary.totalIterations.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* Constraint Intelligence Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Constraint Intelligence</CardTitle>
            <CardDescription>Status of scheduling constraints</CardDescription>
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
                {constraintData.map((constraint) => (
                  <TableRow key={constraint.name}>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="text-left">
                            <span className="font-medium">{constraint.name}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{constraint.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="tabular-nums">{constraint.satisfaction}%</span>
                    </TableCell>
                    <TableCell className="text-right">
                      {constraint.status === "satisfied" && (
                        <Badge variant="outline" className="text-success border-success">
                          Satisfied
                        </Badge>
                      )}
                      {constraint.status === "partial" && (
                        <Badge variant="outline" className="text-warning border-warning">
                          Partial
                        </Badge>
                      )}
                      {constraint.status === "violated" && (
                        <Badge variant="outline" className="text-destructive border-destructive">
                          Violated
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Faculty Workload Analytics */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Faculty Workload Analytics</CardTitle>
              <CardDescription>Weekly teaching hours per faculty member</CardDescription>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Avg:</span>
                <span className="font-medium">{avgWorkload.toFixed(1)}h</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Max:</span>
                <span className="font-medium">{maxWorkload}h</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Min:</span>
                <span className="font-medium">{minWorkload}h</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              workload: {
                label: "Workload Hours",
                color: "oklch(0.25 0.08 250)",
              },
            }}
            className="h-[300px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workloadChartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.90 0.01 250)" />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "oklch(0.50 0.02 250)" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "oklch(0.50 0.02 250)" }}
                  domain={[0, 25]}
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
                          {data.overloaded && (
                            <p className="text-sm text-destructive mt-1">Overloaded</p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine y={20} stroke="oklch(0.55 0.20 27)" strokeDasharray="5 5" label={{ value: "Max (20h)", position: "right", fontSize: 10, fill: "oklch(0.55 0.20 27)" }} />
                <Bar dataKey="workload" radius={[4, 4, 0, 0]}>
                  {workloadChartData.map((entry, index) => (
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

      {/* Timetable Preview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Timetable Preview</CardTitle>
              <CardDescription>Read-only weekly schedule view (Section A)</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-primary/30" />
                <span className="text-xs text-muted-foreground">Theory</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-accent/40" />
                <span className="text-xs text-muted-foreground">Lab</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-chart-4/40" />
                <span className="text-xs text-muted-foreground">Elective</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-[80px_repeat(5,1fr)] gap-1">
              {/* Header row */}
              <div className="p-2" />
              {days.map((day) => (
                <div key={day} className="p-2 text-center font-medium text-sm bg-muted rounded">
                  {day}
                </div>
              ))}

              {/* Time rows */}
              {timeSlots.map((time) => (
                <div key={`row-${time}`} className="contents">
                  <div className="p-2 text-xs text-muted-foreground text-right">
                    {time}
                  </div>
                  {days.map((day) => {
                    const slot = getSlotForDayTime(day, time);
                    if (slot) {
                      const course = courseData.find((c) => c.id === slot.courseId);
                      const room = roomData.find((r) => r.id === slot.roomId);
                      const faculty = facultyData.find((f) => f.id === slot.facultyId);
                      return (
                        <TooltipProvider key={`${day}-${time}`}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={`p-2 rounded border text-xs cursor-default ${getCourseColor(course?.type || "")}`}
                              >
                                <p className="font-medium truncate">{course?.code}</p>
                                <p className="truncate text-muted-foreground">{room?.name}</p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <div className="space-y-1">
                                <p className="font-medium">{course?.name}</p>
                                <p className="text-sm">Instructor: {faculty?.name}</p>
                                <p className="text-sm">Room: {room?.name}, {room?.building}</p>
                                <p className="text-sm">Type: {course?.type}</p>
                                <p className="text-xs text-muted-foreground mt-2">
                                  Placement optimized for faculty availability and lab continuity
                                </p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    }
                    return (
                      <div
                        key={`${day}-${time}`}
                        className="p-2 rounded bg-muted/30 border border-transparent"
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/conflicts" className="group">
          <Card className="transition-colors hover:border-accent">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-warning" />
                <div>
                  <p className="font-medium">Conflict Resolution</p>
                  <p className="text-sm text-muted-foreground">{optimizationSummary.conflictsDetected} pending</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/analytics" className="group">
          <Card className="transition-colors hover:border-accent">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Faculty Analytics</p>
                  <p className="text-sm text-muted-foreground">Detailed workload insights</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/generator" className="group">
          <Card className="transition-colors hover:border-accent">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-accent" />
                <div>
                  <p className="font-medium">Generate New Schedule</p>
                  <p className="text-sm text-muted-foreground">Configure and generate</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
