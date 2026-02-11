const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export interface HealthStatus {
  status: string;
}

export interface HealthLiveStatus {
  status: string;
  timestamp: string;
}

export interface HealthReadyStatus {
  status: string;
  timestamp: string;
  database: {
    ok: boolean;
    schema_ok: boolean;
    missing_tables: string[];
    missing_columns: Record<string, string[]>;
    error: string | null;
  };
  smtp: {
    configured: boolean;
    host: string | null;
    port: number;
    from_email: string | null;
    use_tls: boolean;
    use_ssl: boolean;
  };
}

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) {
    throw new Error("Unable to reach backend");
  }
  return response.json() as Promise<HealthStatus>;
}

export async function fetchHealthLive(): Promise<HealthLiveStatus> {
  const response = await fetch(`${API_BASE_URL}/api/health/live`);
  if (!response.ok) {
    throw new Error("Unable to verify liveness");
  }
  return response.json() as Promise<HealthLiveStatus>;
}

export async function fetchHealthReady(): Promise<HealthReadyStatus> {
  const response = await fetch(`${API_BASE_URL}/api/health/ready`);
  const payload = await response.json();
  if (!response.ok) {
    if (payload && typeof payload === "object" && typeof payload.status === "string") {
      return payload as HealthReadyStatus;
    }
    throw new Error("Backend readiness check failed");
  }
  return payload as HealthReadyStatus;
}
