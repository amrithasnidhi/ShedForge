"use client";

import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Line,
  LineChart,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  facultyData,
  workloadChartData,
  dailyWorkloadData,
  performanceTrendData,
} from "@/lib/mock-data";

// Calculate statistics
const avgWorkload = workloadChartData.reduce((sum, f) => sum + f.workload, 0) / workloadChartData.length;
const maxWorkload = Math.max(...workloadChartData.map((f) => f.workload));
const minWorkload = Math.min(...workloadChartData.map((f) => f.workload));
const overloadedCount = workloadChartData.filter((f) => f.overloaded).length;
const standardDeviation = Math.sqrt(
  workloadChartData.reduce((sum, f) => sum + Math.pow(f.workload - avgWorkload, 2), 0) / workloadChartData.length
);

// Fairness score based on standard deviation (lower is fairer)
const fairnessScore = Math.max(0, 100 - standardDeviation * 10);

// Heatmap data transformation
const heatmapData = dailyWorkloadData.map((day) => ({
  ...day,
  total: Object.entries(day)
    .filter(([key]) => key.startsWith("f"))
    .reduce((sum, [, val]) => sum + (val as number), 0),
}));

function getHeatmapColor(value: number): string {
  if (value === 0) return "bg-muted/30";
  if (value <= 2) return "bg-chart-2/30";
  if (value <= 4) return "bg-chart-2/50";
  if (value <= 6) return "bg-chart-2/70";
  return "bg-chart-2/90";
}

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Faculty Workload Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Detailed workload distribution and fairness analysis
        </p>
      </div>

      {/* Summary Stats */}
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
                <p className="text-3xl font-semibold mt-1">{maxWorkload}h</p>
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
                <p className="text-3xl font-semibold mt-1">{minWorkload}h</p>
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

      {/* Fairness Indicator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Workload Fairness Index</CardTitle>
          <CardDescription>
            Measures how evenly workload is distributed across faculty members
          </CardDescription>
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
              ) : fairnessScore >= 60 ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
                    <AlertTriangle className="h-6 w-6 text-warning" />
                  </div>
                  <Badge variant="outline" className="text-warning border-warning">
                    Acceptable
                  </Badge>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  </div>
                  <Badge variant="outline" className="text-destructive border-destructive">
                    Needs Review
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workload Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Faculty Workload Distribution</CardTitle>
          <CardDescription>Weekly teaching hours per faculty member</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              workload: {
                label: "Workload Hours",
                color: "oklch(0.25 0.08 250)",
              },
            }}
            className="h-[350px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={workloadChartData}
                margin={{ top: 20, right: 20, bottom: 60, left: 20 }}
              >
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
                            <p className="text-sm text-destructive mt-1">Overloaded - exceeds limit</p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
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

      {/* Heatmap and Trend */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Daily Workload Heatmap</CardTitle>
            <CardDescription>Hours per day for each faculty member</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="min-w-[400px]">
                <div className="grid grid-cols-[100px_repeat(8,1fr)] gap-1 text-xs">
                  {/* Header */}
                  <div className="p-2" />
                  {facultyData.map((f) => (
                    <div key={f.id} className="p-2 text-center font-medium truncate" title={f.name}>
                      {f.name.split(" ").slice(-1)[0]}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-[100px_repeat(8,1fr)] gap-1 text-xs">
                  {/* Rows */}
                  {heatmapData.map((day) => (
                    <div key={day.day} className="contents">
                      <div className="p-2 text-right font-medium">
                        {day.day.slice(0, 3)}
                      </div>
                      {facultyData.map((f) => {
                        const value = day[f.id as keyof typeof day] as number;
                        return (
                          <div
                            key={`${day.day}-${f.id}`}
                            className={`p-2 text-center rounded ${getHeatmapColor(value)}`}
                            title={`${f.name}: ${value}h on ${day.day}`}
                          >
                            {value > 0 ? value : "-"}
                          </div>
);
                      })}
                    </div>
                  ))}
                </div>

                {/* Legend */}
                <div className="flex items-center justify-end gap-2 mt-4 text-xs text-muted-foreground">
                  <span>Low</span>
                  <div className="flex gap-1">
                    <div className="w-4 h-4 rounded bg-muted/30" />
                    <div className="w-4 h-4 rounded bg-chart-2/30" />
                    <div className="w-4 h-4 rounded bg-chart-2/50" />
                    <div className="w-4 h-4 rounded bg-chart-2/70" />
                    <div className="w-4 h-4 rounded bg-chart-2/90" />
                  </div>
                  <span>High</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Optimization Trend</CardTitle>
            <CardDescription>Constraint satisfaction and conflicts over time</CardDescription>
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
                <LineChart data={performanceTrendData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
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
                    domain={[80, 100]}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "oklch(0.50 0.02 250)" }}
                    domain={[0, 10]}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded-lg border bg-background p-3 shadow-md">
                            <p className="font-medium mb-1">{label}</p>
                            {payload.map((entry, index) => (
                              <p key={index} className="text-sm" style={{ color: entry.color }}>
                                {entry.name}: {entry.value}
                                {entry.name === "Satisfaction %" ? "%" : ""}
                              </p>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="satisfaction"
                    name="Satisfaction %"
                    stroke="oklch(0.65 0.15 195)"
                    strokeWidth={2}
                    dot={{ fill: "oklch(0.65 0.15 195)", strokeWidth: 2 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="conflicts"
                    name="Conflicts"
                    stroke="oklch(0.55 0.20 27)"
                    strokeWidth={2}
                    dot={{ fill: "oklch(0.55 0.20 27)", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Faculty Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Faculty Workload Details
          </CardTitle>
          <CardDescription>Complete breakdown by faculty member</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Faculty Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Current Load</TableHead>
                <TableHead className="text-right">Max Limit</TableHead>
                <TableHead className="text-right">Utilization</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facultyData.map((faculty) => {
                const utilization = (faculty.workloadHours / faculty.maxHours) * 100;
                const isOverloaded = faculty.workloadHours > faculty.maxHours;
                return (
                  <TableRow key={faculty.id}>
                    <TableCell className="font-medium">{faculty.name}</TableCell>
                    <TableCell className="text-muted-foreground">{faculty.department}</TableCell>
                    <TableCell className="text-right tabular-nums">{faculty.workloadHours}h</TableCell>
                    <TableCell className="text-right tabular-nums">{faculty.maxHours}h</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Progress value={Math.min(utilization, 100)} className="w-16 h-2" />
                        <span className="tabular-nums text-sm">{utilization.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {isOverloaded ? (
                        <Badge variant="outline" className="text-destructive border-destructive">
                          Overloaded
                        </Badge>
                      ) : utilization >= 90 ? (
                        <Badge variant="outline" className="text-warning border-warning">
                          Near Limit
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-success border-success">
                          Normal
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
