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

export type IssueStatus = "open" | "in_progress" | "resolved";
export type IssueCategory = "conflict" | "capacity" | "availability" | "data" | "other";
export type UserRole = "admin" | "scheduler" | "faculty" | "student";

export interface IssueMessage {
  id: string;
  issue_id: string;
  author_id: string;
  author_role: UserRole;
  message: string;
  created_at: string;
}

export interface Issue {
  id: string;
  reporter_id: string;
  reporter_name?: string | null;
  reporter_role?: UserRole | null;
  category: IssueCategory;
  affected_slot_id?: string | null;
  description: string;
  status: IssueStatus;
  resolution_notes?: string | null;
  assigned_to_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  message_count: number;
  latest_message_preview?: string | null;
}

export interface IssueDetail extends Issue {
  messages: IssueMessage[];
}

export async function listIssues(params: { status?: IssueStatus; category?: IssueCategory } = {}): Promise<Issue[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.category) query.set("category", params.category);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/issues${suffix}`, {
    headers: getAuthHeaders(),
  });
  return parseOrThrow<Issue[]>(response, "Unable to load issues");
}

export async function getIssue(issueId: string): Promise<IssueDetail> {
  const response = await fetch(`${API_BASE_URL}/api/issues/${issueId}`, {
    headers: getAuthHeaders(),
  });
  return parseOrThrow<IssueDetail>(response, "Unable to load issue thread");
}

export async function createIssue(payload: {
  category: IssueCategory;
  affected_slot_id?: string;
  description: string;
}): Promise<Issue> {
  const response = await fetch(`${API_BASE_URL}/api/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return parseOrThrow<Issue>(response, "Unable to create issue");
}

export async function updateIssue(
  issueId: string,
  payload: { status?: IssueStatus; resolution_notes?: string | null; assigned_to_id?: string },
): Promise<Issue> {
  const response = await fetch(`${API_BASE_URL}/api/issues/${issueId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return parseOrThrow<Issue>(response, "Unable to update issue");
}

export async function addIssueMessage(issueId: string, payload: { message: string }): Promise<IssueMessage> {
  const response = await fetch(`${API_BASE_URL}/api/issues/${issueId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return parseOrThrow<IssueMessage>(response, "Unable to send issue reply");
}
