import type {
  Conflict,
  ConflictDecisionResult,
  ConflictReport,
  ResolutionAction,
  Course,
  Faculty,
  Room,
  TimeSlot,
  TimetableAnalyticsPayload,
  OfficialTimetablePayload,
} from "@/lib/timetable-types";

export type { Conflict, TimetableAnalyticsPayload } from "@/lib/timetable-types";
export type { ConflictDecisionResult } from "@/lib/timetable-types";
export type { OfficialTimetablePayload } from "@/lib/timetable-types";

export interface TimetableVersion {
  id: string;
  label: string;
  summary: Record<string, unknown>;
  created_by_id?: string | null;
  created_at: string;
}

export interface TimetableVersionCompare {
  from_version_id: string;
  to_version_id: string;
  added_slots: number;
  removed_slots: number;
  changed_slots: number;
  from_label: string;
  to_label: string;
}

export interface TimetableTrendPoint {
  version_id: string;
  label: string;
  created_at: string;
  constraint_satisfaction: number;
  conflicts_detected: number;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type BackendConflict = {
  id: string;
  type?: string;
  conflict_type?: string;
  severity?: string;
  description?: string;
  affectedSlots?: string[];
  affected_slots?: string[];
  resolution?: string;
  resolved?: boolean;
};

function normalizeConflict(raw: BackendConflict): Conflict {
  const severityRaw = (raw.severity ?? "").toLowerCase();
  const severity: Conflict["severity"] = severityRaw === "high" || severityRaw === "hard" ? "hard" : "soft";
  const affected =
    Array.isArray(raw.affected_slots) && raw.affected_slots.length
      ? raw.affected_slots
      : Array.isArray(raw.affectedSlots)
        ? raw.affectedSlots
        : [];

  return {
    id: raw.id,
    conflict_type: raw.type ?? raw.conflict_type ?? "unknown",
    severity,
    description: raw.description ?? "",
    affected_slots: affected,
    resolution: raw.resolution,
    resolved: Boolean(raw.resolved),
  };
}

function normalizeConflictReport(rawConflicts: BackendConflict[]): ConflictReport {
  return {
    conflicts: rawConflicts.map(normalizeConflict),
    suggested_resolutions: [],
  };
}

export interface OfflinePublishFilters {
  department?: string;
  programId?: string;
  termNumber?: number;
  sectionName?: string;
  facultyId?: string;
}

export interface OfflinePublishResult {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  recipients: string[];
  failed_recipients: string[];
  message: string;
}

export interface FacultyCourseSectionAssignment {
  course_id: string;
  course_code: string;
  course_name: string;
  section: string;
  batch?: string | null;
  day: string;
  startTime: string;
  endTime: string;
  room_id: string;
  room_name: string;
}

export interface FacultyCourseSectionMapping {
  faculty_id: string;
  faculty_name: string;
  faculty_email: string;
  total_assigned_hours: number;
  assignments: FacultyCourseSectionAssignment[];
}

function getAuthHeaders(): HeadersInit | null {
  if (typeof window === "undefined") {
    return null;
  }
  const token = localStorage.getItem("token");
  if (!token) {
    return null;
  }
  return { Authorization: `Bearer ${token}` };
}

export async function fetchOfficialTimetable(): Promise<OfficialTimetablePayload | null> {
  const headers = getAuthHeaders();
  if (!headers) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/api/timetable/official`, {
    headers,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to load official timetable");
  }

  return response.json();
}

export async function publishOfficialTimetable(
  payload: OfficialTimetablePayload,
  versionLabel?: string,
  force?: boolean,
): Promise<void> {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Not authenticated");
  }

  const params = new URLSearchParams();
  if (versionLabel?.trim()) {
    params.set("versionLabel", versionLabel.trim());
  }
  if (force) {
    params.set("force", "true");
  }
  const query = params.toString();
  const url = query ? `${API_BASE_URL}/api/timetable/official?${query}` : `${API_BASE_URL}/api/timetable/official`;

  const response = await fetch(url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = "Unable to publish timetable";
    try {
      const data = await response.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore parsing errors
    }
    throw new Error(detail);
  }
}

export async function listTimetableVersions(): Promise<TimetableVersion[]> {
  const headers = getAuthHeaders();
  if (!headers) {
    return [];
  }
  const response = await fetch(`${API_BASE_URL}/api/timetable/versions`, {
    headers,
  });
  if (!response.ok) {
    throw new Error("Unable to load timetable versions");
  }
  return response.json();
}

export async function compareTimetableVersions(fromId: string, toId: string): Promise<TimetableVersionCompare> {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Not authenticated");
  }
  const response = await fetch(
    `${API_BASE_URL}/api/timetable/versions/compare?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`,
    { headers },
  );
  if (!response.ok) {
    throw new Error("Unable to compare timetable versions");
  }
  return response.json();
}

export async function fetchTimetableTrends(): Promise<TimetableTrendPoint[]> {
  const headers = getAuthHeaders();
  if (!headers) {
    return [];
  }
  const response = await fetch(`${API_BASE_URL}/api/timetable/trends`, {
    headers,
  });
  if (!response.ok) {
    throw new Error("Unable to load timetable trends");
  }
  return response.json();
}

export async function fetchTimetableConflicts(): Promise<ConflictReport> {
  const headers = getAuthHeaders();
  if (!headers) {
    return { conflicts: [], suggested_resolutions: [] };
  }

  const response = await fetch(`${API_BASE_URL}/api/timetable/conflicts`, {
    headers,
  });
  if (response.status === 404) {
    return { conflicts: [], suggested_resolutions: [] };
  }
  if (!response.ok) {
    let detail = "Unable to load timetable conflicts";
    try {
      const data = await response.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore parsing errors
    }
    throw new Error(detail);
  }

  const raw = (await response.json()) as BackendConflict[];
  return normalizeConflictReport(raw);
}

export async function analyzeTimetableConflicts(payload: OfficialTimetablePayload): Promise<ConflictReport> {
  const headers = getAuthHeaders();
  if (!headers) {
    return { conflicts: [], suggested_resolutions: [] };
  }

  const response = await fetch(`${API_BASE_URL}/api/timetable/conflicts/analyze`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = "Unable to analyze timetable conflicts";
    try {
      const data = await response.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore parsing errors
    }
    throw new Error(detail);
  }

  const raw = (await response.json()) as BackendConflict[];
  return normalizeConflictReport(raw);
}

export async function resolveConflict(
  payload: OfficialTimetablePayload,
  action: ResolutionAction
): Promise<OfficialTimetablePayload> {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_BASE_URL}/api/conflicts/resolve`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ payload, action }),
  });

  if (!response.ok) {
    let detail = "Unable to apply conflict resolution";
    try {
      const data = await response.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore parsing errors
    }
    throw new Error(detail);
  }

  return response.json();
}

export async function decideTimetableConflict(
  conflictId: string,
  decision: "yes" | "no",
  note?: string,
): Promise<ConflictDecisionResult> {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_BASE_URL}/api/timetable/conflicts/${encodeURIComponent(conflictId)}/decision`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ decision, note }),
  });

  if (!response.ok) {
    let detail = "Unable to submit conflict decision";
    try {
      const data = await response.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore parsing errors
    }
    throw new Error(detail);
  }

  return response.json();
}

export async function fetchTimetableAnalytics(): Promise<TimetableAnalyticsPayload | null> {
  const headers = getAuthHeaders();
  if (!headers) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/api/timetable/analytics`, {
    headers,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to load timetable analytics");
  }

  return response.json();
}

export async function publishOfflineTimetable(filters?: OfflinePublishFilters): Promise<OfflinePublishResult> {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Not authenticated");
  }
  const body = filters ? { filters } : {};
  const response = await fetch(`${API_BASE_URL}/api/timetable/publish-offline`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = "Unable to publish timetable offline";
    try {
      const data = await response.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore parsing errors
    }
    throw new Error(detail);
  }
  return response.json();
}

export async function publishOfflineTimetableAll(): Promise<OfflinePublishResult> {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Not authenticated");
  }
  const response = await fetch(`${API_BASE_URL}/api/timetable/publish-offline/all`, {
    method: "POST",
    headers,
  });
  if (!response.ok) {
    let detail = "Unable to publish all timetables offline";
    try {
      const data = await response.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore parsing errors
    }
    throw new Error(detail);
  }
  return response.json();
}

export async function fetchOfficialFacultyMappings(): Promise<FacultyCourseSectionMapping[]> {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Not authenticated");
  }
  const response = await fetch(`${API_BASE_URL}/api/timetable/official/faculty-mapping`, {
    headers,
  });
  if (!response.ok) {
    let detail = "Unable to load faculty-course-section mapping";
    try {
      const data = await response.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore parsing errors
    }
    throw new Error(detail);
  }
  return response.json();
}
