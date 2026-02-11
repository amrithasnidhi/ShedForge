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

export interface WorkingHoursEntry {
  day: string;
  start_time: string;
  end_time: string;
  enabled: boolean;
}

export interface WorkingHoursUpdate {
  hours: WorkingHoursEntry[];
}

export interface BreakWindowEntry {
  name: string;
  start_time: string;
  end_time: string;
}

export interface SchedulePolicyUpdate {
  period_minutes: number;
  lab_contiguous_slots: number;
  breaks: BreakWindowEntry[];
}

export interface SmtpConfigurationStatus {
  configured: boolean;
  host?: string | null;
  port: number;
  username_set: boolean;
  from_email?: string | null;
  from_name: string;
  use_tls: boolean;
  use_ssl: boolean;
  timeout_seconds: number;
}

export interface SmtpTestResponse {
  success: boolean;
  message: string;
  recipient: string;
}

export type SemesterCycle = "odd" | "even";

export interface AcademicCycleSettings {
  academic_year: string;
  semester_cycle: SemesterCycle;
}

export const DEFAULT_WORKING_HOURS: WorkingHoursEntry[] = [
  { day: "Monday", start_time: "08:50", end_time: "16:35", enabled: true },
  { day: "Tuesday", start_time: "08:50", end_time: "16:35", enabled: true },
  { day: "Wednesday", start_time: "08:50", end_time: "16:35", enabled: true },
  { day: "Thursday", start_time: "08:50", end_time: "16:35", enabled: true },
  { day: "Friday", start_time: "08:50", end_time: "16:35", enabled: true },
  { day: "Saturday", start_time: "08:50", end_time: "16:35", enabled: false },
  { day: "Sunday", start_time: "08:50", end_time: "16:35", enabled: false },
];

export const DEFAULT_SCHEDULE_POLICY: SchedulePolicyUpdate = {
  period_minutes: 50,
  lab_contiguous_slots: 2,
  breaks: [
    { name: "Short Break", start_time: "10:30", end_time: "10:45" },
    { name: "Lunch Break", start_time: "13:15", end_time: "14:05" },
  ],
};

export const DEFAULT_ACADEMIC_CYCLE: AcademicCycleSettings = {
  academic_year: "2026-2027",
  semester_cycle: "odd",
};

export async function fetchWorkingHours(): Promise<WorkingHoursUpdate> {
  const response = await fetch(`${API_BASE_URL}/api/settings/working-hours`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<WorkingHoursUpdate>(response, "Unable to load working hours");
}

export async function updateWorkingHours(payload: WorkingHoursUpdate): Promise<WorkingHoursUpdate> {
  const response = await fetch(`${API_BASE_URL}/api/settings/working-hours`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<WorkingHoursUpdate>(response, "Unable to update working hours");
}

export async function fetchSchedulePolicy(): Promise<SchedulePolicyUpdate> {
  const response = await fetch(`${API_BASE_URL}/api/settings/schedule-policy`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<SchedulePolicyUpdate>(response, "Unable to load schedule policy");
}

export async function updateSchedulePolicy(payload: SchedulePolicyUpdate): Promise<SchedulePolicyUpdate> {
  const response = await fetch(`${API_BASE_URL}/api/settings/schedule-policy`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<SchedulePolicyUpdate>(response, "Unable to update schedule policy");
}

export async function fetchAcademicCycleSettings(): Promise<AcademicCycleSettings> {
  const response = await fetch(`${API_BASE_URL}/api/settings/academic-cycle`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<AcademicCycleSettings>(response, "Unable to load academic cycle settings");
}

export async function updateAcademicCycleSettings(payload: AcademicCycleSettings): Promise<AcademicCycleSettings> {
  const response = await fetch(`${API_BASE_URL}/api/settings/academic-cycle`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<AcademicCycleSettings>(response, "Unable to update academic cycle settings");
}

export async function fetchSmtpConfigurationStatus(): Promise<SmtpConfigurationStatus> {
  const response = await fetch(`${API_BASE_URL}/api/settings/smtp/config`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<SmtpConfigurationStatus>(response, "Unable to load SMTP configuration status");
}

export async function sendSmtpTestEmail(toEmail?: string): Promise<SmtpTestResponse> {
  const response = await fetch(`${API_BASE_URL}/api/settings/smtp/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(toEmail ? { to_email: toEmail } : {}),
  });
  return handleResponse<SmtpTestResponse>(response, "Unable to send SMTP test email");
}
