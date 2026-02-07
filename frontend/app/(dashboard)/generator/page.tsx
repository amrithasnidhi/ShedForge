"use client";

import { useState } from "react";
import {
  Settings2,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  facultyData,
  roomData,
  courseData,
  timetableData,
} from "@/lib/mock-data";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const timeSlots = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

type ScheduleVersion = "A" | "B" | "C";

// Mock alternative schedules (slightly different from main)
const alternativeSchedules: Record<ScheduleVersion, typeof timetableData> = {
  A: timetableData,
  B: timetableData.map((slot) => ({
    ...slot,
    startTime: slot.startTime === "09:00" ? "10:00" : slot.startTime === "10:00" ? "09:00" : slot.startTime,
  })),
  C: timetableData.map((slot) => ({
    ...slot,
    day: slot.day === "Monday" ? "Tuesday" : slot.day === "Tuesday" ? "Monday" : slot.day,
  })),
};

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

import { useAuth } from "@/components/auth-provider";

export default function GeneratorPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeSchedule, setActiveSchedule] = useState<ScheduleVersion>("A");
  const [strategy, setStrategy] = useState("genetic");
  const [iterations, setIterations] = useState([1000]);
  const [selectedFaculty, setSelectedFaculty] = useState<string[]>(
    facultyData.map((f) => f.id)
  );
  const [selectedRooms, setSelectedRooms] = useState<string[]>(
    roomData.map((r) => r.id)
  );
  const [constraints, setConstraints] = useState({
    respectAvailability: true,
    labContinuity: true,
    breakTime: true,
    workloadBalance: true,
    electiveNoOverlap: true,
  });
  const [workloadLimit, setWorkloadLimit] = useState([20]);
  const [breakMinutes, setBreakMinutes] = useState([15]);

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
    }, 2500);
  };

  const toggleFaculty = (id: string) => {
    setSelectedFaculty((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const toggleRoom = (id: string) => {
    setSelectedRooms((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const getSlotForDayTime = (day: string, time: string, schedule: ScheduleVersion) => {
    return alternativeSchedules[schedule].find(
      (slot) => slot.day === day && slot.startTime === time
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Timetable Generator</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure optimization strategies and generate experimental schedules
          </p>
        </div>
        {!isAdmin && (
          <Button onClick={handleGenerate} disabled={isGenerating} size="lg" className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90">
            {isGenerating ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Running Experiment...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                Run Experiment
              </span>
            )}
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Left Panel - Configuration */}
        <div className="space-y-4">

          {/* Strategy Selection */}
          <Card className="border-accent/20 bg-accent/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-accent" />
                Optimization Strategy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Algorithm</Label>
                <Select value={strategy} onValueChange={setStrategy}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="genetic">Genetic Algorithm (GA)</SelectItem>
                    <SelectItem value="simulated-annealing">Simulated Annealing</SelectItem>
                    <SelectItem value="constraint-programming">Constraint Programming (CP)</SelectItem>
                    <SelectItem value="hybrid">Hybrid (GA + Local Search)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Max Iterations</Label>
                  <span className="text-sm font-medium">{iterations[0]}</span>
                </div>
                <Slider value={iterations} onValueChange={setIterations} min={100} max={5000} step={100} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Constraints
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Constraint Toggles */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="availability" className="flex items-center gap-2 cursor-pointer text-sm">
                    Respect Faculty Availability
                  </Label>
                  <Switch
                    id="availability"
                    checked={constraints.respectAvailability}
                    onCheckedChange={(checked) =>
                      setConstraints((prev) => ({ ...prev, respectAvailability: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="labContinuity" className="flex items-center gap-2 cursor-pointer text-sm">
                    Lab Session Continuity
                  </Label>
                  <Switch
                    id="labContinuity"
                    checked={constraints.labContinuity}
                    onCheckedChange={(checked) =>
                      setConstraints((prev) => ({ ...prev, labContinuity: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="workload" className="flex items-center gap-2 cursor-pointer text-sm">
                    Workload Balancing
                  </Label>
                  <Switch
                    id="workload"
                    checked={constraints.workloadBalance}
                    onCheckedChange={(checked) =>
                      setConstraints((prev) => ({ ...prev, workloadBalance: checked }))
                    }
                  />
                </div>
              </div>

              <Separator />

              {/* Sliders */}
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Max Workload (hours/week)</Label>
                    <span className="text-xs font-medium">{workloadLimit[0]}h</span>
                  </div>
                  <Slider
                    value={workloadLimit}
                    onValueChange={setWorkloadLimit}
                    min={12}
                    max={24}
                    step={1}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Generated Timetable */}
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Experiment Results</CardTitle>
                <CardDescription>Compare generated scenarios</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <div className="h-2.5 w-2.5 rounded bg-primary/30" />
                  <span className="text-muted-foreground">Theory</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="h-2.5 w-2.5 rounded bg-accent/40" />
                  <span className="text-muted-foreground">Lab</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="h-2.5 w-2.5 rounded bg-chart-4/40" />
                  <span className="text-muted-foreground">Elective</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <Tabs value={activeSchedule} onValueChange={(v) => setActiveSchedule(v as ScheduleVersion)} className="h-full flex flex-col">
              <TabsList className="mb-4 w-full justify-start">
                <TabsTrigger value="A" className="flex items-center gap-2">
                  Scenario A (Best Fit)
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                </TabsTrigger>
                <TabsTrigger value="B" className="flex items-center gap-2">
                  Scenario B (Balanced)
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                </TabsTrigger>
                <TabsTrigger value="C" className="flex items-center gap-2">
                  Scenario C (Fastest)
                  <AlertCircle className="h-3.5 w-3.5 text-warning" />
                </TabsTrigger>
              </TabsList>

              {(["A", "B", "C"] as ScheduleVersion[]).map((schedule) => (
                <TabsContent key={schedule} value={schedule} className="mt-0 flex-1 flex flex-col">
                  {/* Schedule Stats */}
                  <div className="mb-4 p-4 rounded-lg border bg-muted/30 grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold tracking-tight text-foreground">
                        {schedule === "A" ? "98.5" : schedule === "B" ? "96.2" : "93.1"}%
                      </p>
                      <p className="text-xs font-medium text-muted-foreground">Fitness Score</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold tracking-tight text-foreground">
                        {schedule === "A" ? "0" : schedule === "B" ? "1" : "3"}
                      </p>
                      <p className="text-xs font-medium text-muted-foreground">Hard Conflicts</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold tracking-tight text-foreground">
                        {schedule === "A" ? "12s" : schedule === "B" ? "8s" : "4s"}
                      </p>
                      <p className="text-xs font-medium text-muted-foreground">Compute Time</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold tracking-tight text-foreground">
                        {schedule === "A" ? "Low" : schedule === "B" ? "Med" : "High"}
                      </p>
                      <p className="text-xs font-medium text-muted-foreground">Variance</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto flex-1">
                    <div className="min-w-[700px]">
                      <div className="grid grid-cols-[70px_repeat(5,1fr)] gap-1">
                        {/* Header row */}
                        <div className="p-2" />
                        {days.map((day) => (
                          <div key={day} className="p-2 text-center font-medium text-xs bg-muted rounded">
                            {day}
                          </div>
                        ))}

                        {/* Time rows */}
                        {timeSlots.map((time) => (
                          <div key={`row-${time}`} className="contents">
                            <div className="p-1.5 text-xs text-muted-foreground text-right">
                              {time}
                            </div>
                            {days.map((day) => {
                              const slot = getSlotForDayTime(day, time, schedule);
                              if (slot) {
                                const course = courseData.find((c) => c.id === slot.courseId);
                                const room = roomData.find((r) => r.id === slot.roomId);
                                const faculty = facultyData.find((f) => f.id === slot.facultyId);
                                return (
                                  <TooltipProvider key={`${day}-${time}-${schedule}`}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div
                                          className={`p-1.5 rounded border text-xs cursor-default hover:brightness-95 transition-all ${getCourseColor(course?.type || "")}`}
                                        >
                                          <p className="font-semibold truncate text-[11px]">{course?.code}</p>
                                          <p className="truncate text-muted-foreground text-[10px]">{room?.name}</p>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <div className="space-y-1">
                                          <p className="font-medium">{course?.name}</p>
                                          <p className="text-sm">Instructor: {faculty?.name}</p>
                                          <p className="text-sm">Room: {room?.name}</p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              }
                              return (
                                <div
                                  key={`${day}-${time}-${schedule}`}
                                  className="p-1.5 rounded bg-muted/10 border border-transparent"
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
