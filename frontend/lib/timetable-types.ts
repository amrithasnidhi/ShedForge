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
  batchSegregation?: boolean;
  practicalContiguousSlots?: number;
  assignFaculty?: boolean;
  assignClassroom?: boolean;
  defaultRoomId?: string | null;
  electiveCategory?: string | null;
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
  assistantFacultyIds?: string[];
}

export interface Conflict {
  id: string;
  conflict_type: string;
  severity: "hard" | "soft";
  description: string;
  affected_slots: string[];
  resolution?: string;
  resolved?: boolean;
  decision?: "yes" | "no" | null;
  resolution_mode?: "auto" | "manual" | "ignored" | "pending" | null;
  decision_note?: string | null;
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

export interface TimetableConflictReview {
  source: "official" | "provided";
  autoResolvedConflicts: Conflict[];
  manuallyResolvedConflicts: Conflict[];
  ignoredConflicts: Conflict[];
  pendingConflicts: Conflict[];
  unresolvedRequiredCount: number;
  unresolvedHardCount: number;
  constraintMismatches: string[];
  canPublish: boolean;
  canPublishAnyway: boolean;
}

export interface TimetableConflictResolveAllInput {
  payload?: OfficialTimetablePayload;
  scope?: "hard" | "all";
  promoteOfficial?: boolean;
  note?: string;
}

export interface TimetableConflictResolveAllResult {
  source: "official" | "provided";
  resolvedPayload: OfficialTimetablePayload;
  resolvedCount: number;
  remainingConflicts: Conflict[];
  autoResolvedConflicts: Conflict[];
  constraintMismatches: string[];
  promotedVersionLabel?: string | null;
}

export type TimetableChangeRequestStatus = "pending" | "approved" | "rejected" | "applied";

export interface TimetableChangeRequest {
  id: string;
  programId?: string | null;
  termNumber?: number | null;
  slotId: string;
  requestedById: string;
  requestedByRole: "admin" | "scheduler" | "faculty" | "student";
  requestedByName?: string | null;
  approverUserId?: string | null;
  approverRole?: "admin" | "scheduler" | "faculty" | "student" | null;
  approverName?: string | null;
  status: TimetableChangeRequestStatus;
  proposal: {
    slotId: string;
    day: string;
    startTime: string;
    endTime: string;
    roomId?: string | null;
    facultyId?: string | null;
    assistantFacultyIds?: string[] | null;
    section?: string | null;
    requestKind?: "slot_move" | "resource_reassign" | "extra_class";
    note?: string | null;
  };
  requestNote?: string | null;
  decisionNote?: string | null;
  resolutionNote?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  decidedAt?: string | null;
  appliedAt?: string | null;
}

export interface TimetableChangeRequestDecisionResult {
  request: TimetableChangeRequest;
  message: string;
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
