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

export interface SemesterConstraint {
  id: string;
  term_number: number;
  earliest_start_time: string;
  latest_end_time: string;
  max_hours_per_day: number;
  max_hours_per_week: number;
  min_break_minutes: number;
  max_consecutive_hours: number;
}

export type SemesterConstraintUpsert = Omit<SemesterConstraint, "id">;

export type ConstraintSlotTag = "teaching" | "block" | "break" | "lunch";

export interface ProgramDailyTimeSlot {
  start_time: string;
  end_time: string;
  tag: ConstraintSlotTag;
  label?: string | null;
}

export interface ProgramConstraint {
  id: string;
  program_id: string;
  daily_time_slots: ProgramDailyTimeSlot[];
  faculty_min_hours_per_week: number;
  faculty_max_hours_per_week: number;
  temporal_window_semesters: number;
  auto_assign_research_slots: boolean;
  enforce_student_credit_load: boolean;
  enforce_ltp_split: boolean;
  enforce_lab_contiguous_blocks: boolean;
  updated_at?: string | null;
}

export type ProgramConstraintUpsert = Omit<ProgramConstraint, "id" | "updated_at">;

export interface ConstraintViolation {
  code: string;
  severity: "hard" | "warn";
  message: string;
  term_number?: number | null;
  course_id?: string | null;
  faculty_id?: string | null;
}

export interface ProgramConstraintReport {
  program_id: string;
  generated_at: string;
  violation_count: number;
  violations: ConstraintViolation[];
}

export async function listSemesterConstraints(): Promise<SemesterConstraint[]> {
  const response = await fetch(`${API_BASE_URL}/api/constraints/semesters`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<SemesterConstraint[]>(response, "Unable to load semester constraints");
}

export async function getSemesterConstraint(termNumber: number): Promise<SemesterConstraint> {
  const response = await fetch(`${API_BASE_URL}/api/constraints/semesters/${termNumber}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<SemesterConstraint>(response, "Unable to load semester constraint");
}

export async function upsertSemesterConstraint(
  termNumber: number,
  payload: SemesterConstraintUpsert,
): Promise<SemesterConstraint> {
  const response = await fetch(`${API_BASE_URL}/api/constraints/semesters/${termNumber}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<SemesterConstraint>(response, "Unable to update semester constraint");
}

export async function deleteSemesterConstraint(termNumber: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/constraints/semesters/${termNumber}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Unable to delete semester constraint");
  }
}

export async function listProgramConstraints(): Promise<ProgramConstraint[]> {
  const response = await fetch(`${API_BASE_URL}/api/constraints/programs`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<ProgramConstraint[]>(response, "Unable to load program constraints");
}

export async function getProgramConstraint(programId: string): Promise<ProgramConstraint> {
  const response = await fetch(`${API_BASE_URL}/api/constraints/programs/${programId}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<ProgramConstraint>(response, "Unable to load program constraints");
}

export async function upsertProgramConstraint(
  programId: string,
  payload: ProgramConstraintUpsert,
): Promise<ProgramConstraint> {
  const response = await fetch(`${API_BASE_URL}/api/constraints/programs/${programId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<ProgramConstraint>(response, "Unable to update program constraints");
}

export async function getProgramConstraintReport(
  programId: string,
  termNumber?: number,
): Promise<ProgramConstraintReport> {
  const query = typeof termNumber === "number" ? `?termNumber=${termNumber}` : "";
  const response = await fetch(`${API_BASE_URL}/api/constraints/programs/${programId}/report${query}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<ProgramConstraintReport>(response, "Unable to load constraint report");
}
