export interface Faculty {
  id: string;
  name: string;
  department: string;
  workloadHours: number;
  maxHours: number;
  availability: string[];
  email: string;
  currentWorkload?: number;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  type: "theory" | "lab" | "elective";
  credits: number;
  facultyId: string;
  duration: number;
  sections?: number;
  hoursPerWeek: number;
  semesterNumber?: number;
  batchYear?: number;
  theoryHours?: number;
  labHours?: number;
  tutorialHours?: number;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  type: "lecture" | "lab" | "seminar";
  building: string;
  hasLabEquipment?: boolean;
  utilization?: number;
  hasProjector?: boolean;
}

export interface TimeSlot {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  courseId: string;
  roomId: string;
  facultyId: string;
  section: string;
  batch?: string;
  studentCount?: number;
  sessionType?: "theory" | "tutorial" | "lab";
}

export interface Conflict {
  id: string;
  conflict_type: string;
  severity: "hard" | "soft";
  description: string;
  affected_slots: string[];
  resolution?: string;
  resolved?: boolean;
}

export interface ResolutionAction {
  action_type: string;
  description: string;
  target_slot_id: string;
  parameters: Record<string, any>;
}

export interface ConflictReport {
  conflicts: Conflict[];
  suggested_resolutions: ResolutionAction[];
}

export interface ConflictDecisionResult {
  conflict_id: string;
  decision: "yes" | "no";
  resolved: boolean;
  message: string;
  published_version_label?: string | null;
}

export interface ConstraintStatus {
  name: string;
  description: string;
  satisfaction: number;
  status: "satisfied" | "partial" | "violated";
}

export interface WorkloadChartEntry {
  id: string;
  name: string;
  fullName: string;
  department: string;
  workload: number;
  max: number;
  overloaded: boolean;
}

export interface DailyWorkloadEntry {
  day: string;
  loads: Record<string, number>;
  total: number;
}

export interface PerformanceTrendEntry {
  semester: string;
  satisfaction: number;
  conflicts: number;
}

export interface OptimizationSummary {
  constraintSatisfaction: number;
  conflictsDetected: number;
  optimizationTechnique: string;
  alternativesGenerated: number;
  lastGenerated?: string | null;
  totalIterations: number;
  computeTime: string;
}

export interface TimetableAnalyticsPayload {
  optimizationSummary: OptimizationSummary;
  constraintData: ConstraintStatus[];
  workloadChartData: WorkloadChartEntry[];
  dailyWorkloadData: DailyWorkloadEntry[];
  performanceTrendData: PerformanceTrendEntry[];
}

export interface OfficialTimetablePayload {
  programId?: string;
  termNumber?: number;
  facultyData: Faculty[];
  courseData: Course[];
  roomData: Room[];
  timetableData: TimeSlot[];
}
