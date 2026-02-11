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
      // ignore parsing errors
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export type LeaveStatus = "pending" | "approved" | "rejected";
export type LeaveType = "sick" | "casual" | "academic" | "personal";
export type LeaveSubstituteOfferStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "superseded"
  | "cancelled"
  | "rescheduled";

export interface LeaveRequest {
  id: string;
  user_id: string;
  faculty_id?: string | null;
  leave_date: string;
  leave_type: LeaveType;
  reason: string;
  status: LeaveStatus;
  admin_comment?: string | null;
  reviewed_by_id?: string | null;
  reviewed_at?: string | null;
  substitute_assignment?: LeaveSubstituteAssignment | null;
  created_at: string;
}

export interface LeaveRequestCreate {
  leave_date: string;
  leave_type: LeaveType;
  reason: string;
}

export interface LeaveRequestStatusUpdate {
  status: LeaveStatus;
  admin_comment?: string;
}

export interface LeaveSubstituteAssignment {
  id: string;
  leave_request_id: string;
  substitute_faculty_id: string;
  substitute_faculty_name?: string | null;
  substitute_faculty_email?: string | null;
  assigned_by_id: string;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface LeaveSubstituteAssignmentCreate {
  substitute_faculty_id: string;
  notes?: string;
}

export interface LeaveSubstituteOffer {
  id: string;
  leave_request_id: string;
  slot_id: string;
  substitute_faculty_id: string;
  substitute_faculty_name?: string | null;
  substitute_faculty_email?: string | null;
  offered_by_id: string;
  status: LeaveSubstituteOfferStatus;
  expires_at?: string | null;
  responded_at?: string | null;
  response_note?: string | null;
  created_at: string;
  updated_at?: string | null;
  leave_date?: string | null;
  absent_faculty_id?: string | null;
  absent_faculty_name?: string | null;
  day?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  section?: string | null;
  batch?: string | null;
  course_code?: string | null;
  course_name?: string | null;
  room_name?: string | null;
}

export interface LeaveSubstituteOfferRespond {
  decision: "accept" | "reject";
  response_note?: string;
}

export interface SubstituteSuggestion {
  faculty_id: string;
  name: string;
  department: string;
  designation: string;
  workload_hours: number;
  max_hours: number;
  score: number;
  occupied_on_day: boolean;
}

export async function listLeaveRequests(status?: LeaveStatus): Promise<LeaveRequest[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const response = await fetch(`${API_BASE_URL}/api/leaves${query}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<LeaveRequest[]>(response, "Unable to load leave requests");
}

export async function createLeaveRequest(payload: LeaveRequestCreate): Promise<LeaveRequest> {
  const response = await fetch(`${API_BASE_URL}/api/leaves`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<LeaveRequest>(response, "Unable to submit leave request");
}

export async function updateLeaveRequestStatus(
  leaveId: string,
  payload: LeaveRequestStatusUpdate,
): Promise<LeaveRequest> {
  const response = await fetch(`${API_BASE_URL}/api/leaves/${leaveId}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<LeaveRequest>(response, "Unable to update leave request");
}

export async function listSubstituteSuggestions(
  leaveDate: string,
  courseId?: string,
): Promise<SubstituteSuggestion[]> {
  const search = new URLSearchParams({ leave_date: leaveDate });
  if (courseId) {
    search.set("course_id", courseId);
  }
  const response = await fetch(`${API_BASE_URL}/api/faculty/substitutes/suggestions?${search.toString()}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<SubstituteSuggestion[]>(response, "Unable to load substitute suggestions");
}

export async function assignLeaveSubstitute(
  leaveId: string,
  payload: LeaveSubstituteAssignmentCreate,
): Promise<LeaveSubstituteAssignment> {
  const response = await fetch(`${API_BASE_URL}/api/leaves/${leaveId}/substitute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<LeaveSubstituteAssignment>(response, "Unable to assign substitute");
}

export async function listSubstituteOffers(
  status?: LeaveSubstituteOfferStatus,
): Promise<LeaveSubstituteOffer[]> {
  const search = new URLSearchParams();
  if (status) {
    search.set("status", status);
  }
  const suffix = search.toString() ? `?${search.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/leaves/substitute-offers${suffix}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<LeaveSubstituteOffer[]>(response, "Unable to load substitute offers");
}

export async function respondToSubstituteOffer(
  offerId: string,
  payload: LeaveSubstituteOfferRespond,
): Promise<LeaveSubstituteOffer> {
  const response = await fetch(`${API_BASE_URL}/api/leaves/substitute-offers/${offerId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<LeaveSubstituteOffer>(response, "Unable to respond to substitute offer");
}
