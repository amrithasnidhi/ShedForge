import type { OfficialTimetablePayload } from "@/lib/timetable-api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function getAuthHeaders(): HeadersInit {
  if (typeof window === "undefined") {
    return {};
  }
  const token = localStorage.getItem("token");
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) {
    let detail = errorMessage;
    try {
      const data = await response.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export interface ObjectiveWeights {
  room_conflict: number;
  faculty_conflict: number;
  section_conflict: number;
  room_capacity: number;
  room_type: number;
  faculty_availability: number;
  locked_slot: number;
  semester_limit: number;
  workload_overflow: number;
  workload_underflow?: number;
  spread_balance: number;
  faculty_subject_preference?: number;
}

export type GenerationSolverStrategy = "auto" | "hybrid" | "simulated_annealing" | "genetic";

export interface FacultyWorkloadBridgeSuggestion {
  term_number?: number | null;
  course_id: string;
  course_code: string;
  course_name: string;
  section_name: string;
  batch?: string | null;
  weekly_hours: number;
  is_preferred_subject: boolean;
  feasible_without_conflict: boolean;
}

export interface FacultyWorkloadGapSuggestion {
  faculty_id: string;
  faculty_name: string;
  department?: string | null;
  target_hours: number;
  assigned_hours: number;
  preferred_assigned_hours: number;
  gap_hours: number;
  suggested_bridges: FacultyWorkloadBridgeSuggestion[];
}

export interface OccupancyMatrix {
  section_matrix: Record<string, Record<string, number>>;
  faculty_matrix: Record<string, Record<string, number>>;
  room_matrix: Record<string, Record<string, number>>;
  faculty_labels: Record<string, string>;
  room_labels: Record<string, string>;
}

export interface GenerationSettings {
  id?: number;
  solver_strategy: GenerationSolverStrategy;
  population_size: number;
  generations: number;
  mutation_rate: number;
  crossover_rate: number;
  elite_count: number;
  tournament_size: number;
  stagnation_limit: number;
  annealing_iterations: number;
  annealing_initial_temperature: number;
  annealing_cooling_rate: number;
  random_seed?: number | null;
  objective_weights: ObjectiveWeights;
}

export interface GenerateTimetableRequest {
  program_id: string;
  term_number: number;
  alternative_count: number;
  persist_official: boolean;
  settings_override?: Omit<GenerationSettings, "id">;
}

export type GenerationCycle = "odd" | "even" | "all" | "custom";

export interface GenerateTimetableCycleRequest {
  program_id: string;
  cycle: GenerationCycle;
  term_numbers?: number[];
  alternative_count: number;
  pareto_limit?: number;
  persist_official: boolean;
  settings_override?: Omit<GenerationSettings, "id">;
}

export interface GeneratedAlternative {
  rank: number;
  fitness: number;
  hard_conflicts: number;
  soft_penalty: number;
  payload: OfficialTimetablePayload;
  workload_gap_suggestions?: FacultyWorkloadGapSuggestion[];
  occupancy_matrix?: OccupancyMatrix | null;
}

export interface GenerateTimetableResponse {
  alternatives: GeneratedAlternative[];
  settings_used: Omit<GenerationSettings, "id">;
  runtime_ms: number;
  published_version_label?: string | null;
  publish_warning?: string | null;
}

export interface GeneratedCycleTermResult {
  term_number: number;
  generation: GenerateTimetableResponse;
  published_version_label?: string | null;
}

export interface GeneratedCycleSolutionTerm {
  term_number: number;
  alternative_rank: number;
  fitness: number;
  hard_conflicts: number;
  soft_penalty: number;
  payload: OfficialTimetablePayload;
  workload_gap_suggestions?: FacultyWorkloadGapSuggestion[];
  occupancy_matrix?: OccupancyMatrix | null;
}

export interface GeneratedCycleSolution {
  rank: number;
  resource_penalty: number;
  faculty_preference_penalty: number;
  workload_gap_penalty?: number;
  hard_conflicts: number;
  soft_penalty: number;
  runtime_ms: number;
  terms: GeneratedCycleSolutionTerm[];
  workload_gap_suggestions?: FacultyWorkloadGapSuggestion[];
}

export interface GenerateTimetableCycleResponse {
  program_id: string;
  cycle: GenerationCycle;
  term_numbers: number[];
  results: GeneratedCycleTermResult[];
  pareto_front?: GeneratedCycleSolution[];
  selected_solution_rank?: number | null;
}

export type ReevaluationStatus = "pending" | "resolved" | "dismissed";

export interface ReevaluationEvent {
  id: string;
  program_id: string;
  term_number?: number | null;
  change_type: string;
  entity_type: string;
  entity_id?: string | null;
  description: string;
  details: Record<string, unknown>;
  status: ReevaluationStatus;
  triggered_by_id?: string | null;
  triggered_at: string;
  resolved_by_id?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  has_official_impact: boolean;
}

export interface RunReevaluationRequest {
  program_id: string;
  term_number: number;
  alternative_count: number;
  persist_official: boolean;
  mark_resolved: boolean;
  resolution_note?: string;
  settings_override?: Omit<GenerationSettings, "id">;
}

export interface RunReevaluationResponse {
  generation: GenerateTimetableResponse;
  resolved_events: number;
  pending_events: number;
}

export interface SlotLock {
  id: string;
  program_id: string;
  term_number: number;
  day: string;
  start_time: string;
  end_time: string;
  section_name: string;
  course_id: string;
  batch?: string | null;
  room_id?: string | null;
  faculty_id?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_by_id?: string | null;
}

export type SlotLockCreate = Omit<SlotLock, "id" | "created_by_id">;

export async function fetchGenerationSettings(): Promise<GenerationSettings> {
  const response = await fetch(`${API_BASE_URL}/api/timetable/generation-settings`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<GenerationSettings>(response, "Unable to load generation settings");
}

export async function updateGenerationSettings(payload: Omit<GenerationSettings, "id">): Promise<GenerationSettings> {
  const response = await fetch(`${API_BASE_URL}/api/timetable/generation-settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<GenerationSettings>(response, "Unable to update generation settings");
}

export async function generateTimetable(payload: GenerateTimetableRequest): Promise<GenerateTimetableResponse> {
  const response = await fetch(`${API_BASE_URL}/api/timetable/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<GenerateTimetableResponse>(response, "Unable to generate timetable");
}

export async function generateTimetableCycle(
  payload: GenerateTimetableCycleRequest,
): Promise<GenerateTimetableCycleResponse> {
  const response = await fetch(`${API_BASE_URL}/api/timetable/generate-cycle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<GenerateTimetableCycleResponse>(response, "Unable to generate timetable cycle");
}

export async function listReevaluationEvents(
  params: { program_id?: string; term_number?: number; status?: ReevaluationStatus } = {},
): Promise<ReevaluationEvent[]> {
  const search = new URLSearchParams();
  if (params.program_id) search.set("program_id", params.program_id);
  if (typeof params.term_number === "number") search.set("term_number", String(params.term_number));
  if (params.status) search.set("status", params.status);
  const query = search.toString();
  const response = await fetch(`${API_BASE_URL}/api/timetable/reevaluation/events${query ? `?${query}` : ""}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<ReevaluationEvent[]>(response, "Unable to load reevaluation events");
}

export async function runCurriculumReevaluation(
  payload: RunReevaluationRequest,
): Promise<RunReevaluationResponse> {
  const response = await fetch(`${API_BASE_URL}/api/timetable/reevaluation/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<RunReevaluationResponse>(response, "Unable to run curriculum reevaluation");
}

export async function listSlotLocks(programId: string, termNumber: number): Promise<SlotLock[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/timetable/locks?program_id=${encodeURIComponent(programId)}&term_number=${termNumber}`,
    { headers: getAuthHeaders() },
  );
  return handleResponse<SlotLock[]>(response, "Unable to load slot locks");
}

export async function createSlotLock(payload: SlotLockCreate): Promise<SlotLock> {
  const response = await fetch(`${API_BASE_URL}/api/timetable/locks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<SlotLock>(response, "Unable to create slot lock");
}

export async function deleteSlotLock(lockId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/timetable/locks/${lockId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Unable to delete slot lock");
  }
}
