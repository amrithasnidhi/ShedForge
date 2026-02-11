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

export interface Issue {
  id: string;
  reporter_id: string;
  category: IssueCategory;
  affected_slot_id?: string | null;
  description: string;
  status: IssueStatus;
  resolution_notes?: string | null;
  assigned_to_id?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export async function listIssues(): Promise<Issue[]> {
  const response = await fetch(`${API_BASE_URL}/api/issues`, {
    headers: getAuthHeaders(),
  });
  return parseOrThrow<Issue[]>(response, "Unable to load issues");
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
  payload: { status?: IssueStatus; resolution_notes?: string; assigned_to_id?: string },
): Promise<Issue> {
  const response = await fetch(`${API_BASE_URL}/api/issues/${issueId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return parseOrThrow<Issue>(response, "Unable to update issue");
}
