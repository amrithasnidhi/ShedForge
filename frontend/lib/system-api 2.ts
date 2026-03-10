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

export interface SystemInfo {
  name: string;
  api_prefix: string;
  help_sections: string[];
  features: Record<string, boolean>;
  timestamp: string;
}

export async function fetchSystemInfo(): Promise<SystemInfo> {
  const response = await fetch(`${API_BASE_URL}/api/system/info`, {
    headers: getAuthHeaders(),
  });
  return parseOrThrow<SystemInfo>(response, "Unable to load system info");
}

export async function triggerSystemBackup(): Promise<{ success: boolean; backup_file: string }> {
  const response = await fetch(`${API_BASE_URL}/api/system/backup`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return parseOrThrow(response, "Unable to trigger backup");
}
