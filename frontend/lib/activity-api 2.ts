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

export interface ActivityLogItem {
  id: string;
  user_id?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export async function listActivityLogs(): Promise<ActivityLogItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/activity/logs`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<ActivityLogItem[]>(response, "Unable to load activity logs");
}
