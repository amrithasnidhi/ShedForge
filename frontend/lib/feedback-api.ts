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

async function parseOrThrow<T>(response: Response, fallback: string): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }
  let detail = fallback;
  try {
    const data = await response.json();
    detail = data?.detail ?? fallback;
  } catch {
    // ignore parsing errors
  }
  throw new Error(detail);
}

export type FeedbackStatus = "open" | "under_review" | "awaiting_user" | "resolved" | "closed";
export type FeedbackCategory = "timetable" | "technical" | "usability" | "account" | "suggestion" | "grievance" | "other";
export type FeedbackPriority = "low" | "medium" | "high" | "urgent";
export type UserRole = "admin" | "scheduler" | "faculty" | "student";

export interface FeedbackItem {
  id: string;
  reporter_id: string;
  reporter_name?: string | null;
  reporter_role?: UserRole | null;
  subject: string;
  category: FeedbackCategory;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  assigned_admin_id?: string | null;
  resolved_at?: string | null;
  latest_message_at: string;
  created_at: string;
  updated_at?: string | null;
  message_count: number;
  latest_message_preview?: string | null;
}

export interface FeedbackMessage {
  id: string;
  feedback_id: string;
  author_id: string;
  author_role: UserRole;
  message: string;
  created_at: string;
}

export interface FeedbackDetail extends FeedbackItem {
  messages: FeedbackMessage[];
}

export async function listFeedback(params: {
  status?: FeedbackStatus;
  category?: FeedbackCategory;
  priority?: FeedbackPriority;
} = {}): Promise<FeedbackItem[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.category) query.set("category", params.category);
  if (params.priority) query.set("priority", params.priority);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/feedback${suffix}`, {
    headers: getAuthHeaders(),
  });
  return parseOrThrow<FeedbackItem[]>(response, "Unable to load feedback");
}

export async function createFeedback(payload: {
  subject: string;
  category: FeedbackCategory;
  priority: FeedbackPriority;
  message: string;
}): Promise<FeedbackItem> {
  const response = await fetch(`${API_BASE_URL}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return parseOrThrow<FeedbackItem>(response, "Unable to submit feedback");
}

export async function getFeedback(feedbackId: string): Promise<FeedbackDetail> {
  const response = await fetch(`${API_BASE_URL}/api/feedback/${feedbackId}`, {
    headers: getAuthHeaders(),
  });
  return parseOrThrow<FeedbackDetail>(response, "Unable to load feedback thread");
}

export async function addFeedbackMessage(feedbackId: string, payload: { message: string }): Promise<FeedbackMessage> {
  const response = await fetch(`${API_BASE_URL}/api/feedback/${feedbackId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return parseOrThrow<FeedbackMessage>(response, "Unable to send feedback message");
}

export async function updateFeedback(
  feedbackId: string,
  payload: { status?: FeedbackStatus; priority?: FeedbackPriority; assigned_admin_id?: string | null },
): Promise<FeedbackItem> {
  const response = await fetch(`${API_BASE_URL}/api/feedback/${feedbackId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return parseOrThrow<FeedbackItem>(response, "Unable to update feedback");
}
