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
