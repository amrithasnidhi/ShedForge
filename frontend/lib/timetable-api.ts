import type {
  Conflict,
  ConflictDecisionResult,
  ConflictReport,
  TimetableConflictReview,
  TimetableConflictResolveAllInput,
  TimetableConflictResolveAllResult,
  ResolutionAction,
  TimetableAnalyticsPayload,
  TimetableChangeRequest,
  TimetableChangeRequestDecisionResult,
  OfficialTimetablePayload,
} from "@/lib/timetable-types";

export type { Conflict, TimetableAnalyticsPayload } from "@/lib/timetable-types";
export type { ConflictDecisionResult } from "@/lib/timetable-types";
export type { OfficialTimetablePayload } from "@/lib/timetable-types";
export type { TimetableChangeRequest, TimetableChangeRequestDecisionResult } from "@/lib/timetable-types";
export type { TimetableConflictReview } from "@/lib/timetable-types";
export type { TimetableConflictResolveAllInput, TimetableConflictResolveAllResult } from "@/lib/timetable-types";

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

export interface GeneratedDraftSnapshot {
  version: TimetableVersion;
  payload: OfficialTimetablePayload;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
export const TIMETABLE_UPDATED_EVENT = "shedforge:timetable-updated";
export const TIMETABLE_UPDATED_STORAGE_KEY = "shedforge.timetable.updated_at";

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
  decision?: "yes" | "no" | null;
  resolutionMode?: "auto" | "manual" | "ignored" | "pending" | null;
  resolution_mode?: "auto" | "manual" | "ignored" | "pending" | null;
  decisionNote?: string | null;
  decision_note?: string | null;
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
    decision: raw.decision ?? null,
    resolution_mode: raw.resolutionMode ?? raw.resolution_mode ?? null,
    decision_note: raw.decisionNote ?? raw.decision_note ?? null,
  };
}

function normalizeConflictReport(rawConflicts: BackendConflict[]): ConflictReport {
  return {
    conflicts: rawConflicts.map(normalizeConflict),
    suggested_resolutions: [],
  };
}

type BackendConflictReview = {
  source: "official" | "provided";
  autoResolvedConflicts?: BackendConflict[];
  manuallyResolvedConflicts?: BackendConflict[];
  ignoredConflicts?: BackendConflict[];
  pendingConflicts?: BackendConflict[];
  unresolvedRequiredCount?: number;
  unresolvedHardCount?: number;
  constraintMismatches?: string[];
  canPublish?: boolean;
  canPublishAnyway?: boolean;
};

type BackendConflictResolveAll = {
  source: "official" | "provided";
  resolvedPayload: OfficialTimetablePayload;
  resolvedCount?: number;
  remainingConflicts?: BackendConflict[];
  autoResolvedConflicts?: BackendConflict[];
  constraintMismatches?: string[];
  promotedVersionLabel?: string | null;
};

function normalizeConflictReview(raw: BackendConflictReview): TimetableConflictReview {
  return {
    source: raw.source,
    autoResolvedConflicts: (raw.autoResolvedConflicts ?? []).map(normalizeConflict),
    manuallyResolvedConflicts: (raw.manuallyResolvedConflicts ?? []).map(normalizeConflict),
    ignoredConflicts: (raw.ignoredConflicts ?? []).map(normalizeConflict),
    pendingConflicts: (raw.pendingConflicts ?? []).map(normalizeConflict),
    unresolvedRequiredCount: Number(raw.unresolvedRequiredCount ?? 0),
    unresolvedHardCount: Number(raw.unresolvedHardCount ?? 0),
    constraintMismatches: Array.isArray(raw.constraintMismatches) ? raw.constraintMismatches : [],
    canPublish: Boolean(raw.canPublish),
    canPublishAnyway: raw.canPublishAnyway !== false,
  };
}

function normalizeConflictResolveAll(raw: BackendConflictResolveAll): TimetableConflictResolveAllResult {
  return {
    source: raw.source,
    resolvedPayload: raw.resolvedPayload,
    resolvedCount: Number(raw.resolvedCount ?? 0),
    remainingConflicts: (raw.remainingConflicts ?? []).map(normalizeConflict),
    autoResolvedConflicts: (raw.autoResolvedConflicts ?? []).map(normalizeConflict),
    constraintMismatches: Array.isArray(raw.constraintMismatches) ? raw.constraintMismatches : [],
    promotedVersionLabel: raw.promotedVersionLabel ?? null,
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
  assignmentRole?: "primary" | "assistant";
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

function notifyTimetableUpdated(reason: "publish" | "conflict_resolution" | "resolution_action"): void {
  if (typeof window === "undefined") {
    return;
  }
  const detail = { reason, at: new Date().toISOString() };
  window.dispatchEvent(new CustomEvent(TIMETABLE_UPDATED_EVENT, { detail }));
  try {
    localStorage.setItem(TIMETABLE_UPDATED_STORAGE_KEY, JSON.stringify(detail));
  } catch {
    // Ignore storage failures; in-tab event dispatch is sufficient.
  }
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

export async function fetchFullOfficialTimetable(): Promise<OfficialTimetablePayload | null> {
  const headers = getAuthHeaders();
  if (!headers) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/api/timetable/official/full`, {
    headers,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    let detail = "Unable to load full official timetable";
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
  notifyTimetableUpdated("publish");
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

export async function fetchTimetableVersionPayload(versionId: string): Promise<OfficialTimetablePayload> {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Not authenticated");
  }
  const response = await fetch(`${API_BASE_URL}/api/timetable/versions/${encodeURIComponent(versionId)}/payload`, {
    headers,
  });
  if (!response.ok) {
    let detail = "Unable to load timetable version payload";
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

function isGeneratedSnapshotVersion(version: TimetableVersion): boolean {
  const summary = version.summary ?? {};
  const source = typeof summary.source === "string" ? summary.source.toLowerCase() : "";
  if (
    source === "generator-auto-save"
    || source === "generation-cycle"
    || source === "generation"
    || source.includes("generator")
    || source.includes("generation")
    || summary.auto_saved === true
  ) {
    return true;
  }
  const label = (version.label ?? "").toLowerCase();
  return label.startsWith("gen-") || label.startsWith("cyclegen-");
}

async function fetchFirstAccessibleSnapshot(
  candidates: TimetableVersion[],
): Promise<GeneratedDraftSnapshot | null> {
  let fallback: GeneratedDraftSnapshot | null = null;

  for (const candidate of candidates) {
    try {
      const payload = await fetchTimetableVersionPayload(candidate.id);
      const snapshot: GeneratedDraftSnapshot = { version: candidate, payload };
      if (payload.timetableData.length > 0) {
        return snapshot;
      }
      if (fallback === null) {
        fallback = snapshot;
      }
    } catch {
      // Skip inaccessible snapshots and continue.
    }
  }

  return fallback;
}

interface ParsedCycleTermLabel {
  programToken: string;
  termNumber: number;
  timestamp: string;
}

function parseCycleTermLabel(label: string): ParsedCycleTermLabel | null {
  const match = /^cyclegen-([a-z0-9]+)-t(\d+)-(\d{8}-\d{6})-[a-z0-9]+$/i.exec(label.trim());
  if (!match) {
    return null;
  }
  return {
    programToken: match[1].toLowerCase(),
    termNumber: Number(match[2]),
    timestamp: match[3],
  };
}

function summarizeCycleTerms(snapshots: GeneratedDraftSnapshot[]): string {
  const terms = new Set<number>();
  for (const snapshot of snapshots) {
    const payloadTerm = snapshot.payload.termNumber;
    if (typeof payloadTerm === "number" && Number.isFinite(payloadTerm)) {
      terms.add(payloadTerm);
      continue;
    }
    const parsed = parseCycleTermLabel(snapshot.version.label);
    if (parsed) {
      terms.add(parsed.termNumber);
    }
  }
  return [...terms].sort((left, right) => left - right).join("-");
}

function makeCycleSlotId(term: number, originalId: string, index: number): string {
  const raw = `t${term}-${originalId}-${index}`;
  if (raw.length <= 36) {
    return raw;
  }
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  const compact = Math.abs(hash).toString(36);
  const fallback = `t${term}-${compact}-${index}`;
  return fallback.slice(0, 36);
}

function combineCycleSnapshots(snapshots: GeneratedDraftSnapshot[]): GeneratedDraftSnapshot {
  const ordered = [...snapshots].sort((left, right) => {
    const leftTerm = left.payload.termNumber ?? parseCycleTermLabel(left.version.label)?.termNumber ?? 0;
    const rightTerm = right.payload.termNumber ?? parseCycleTermLabel(right.version.label)?.termNumber ?? 0;
    return leftTerm - rightTerm;
  });

  const base = ordered[0];
  const courseMap = new Map<string, OfficialTimetablePayload["courseData"][number]>();
  const facultyMap = new Map<string, OfficialTimetablePayload["facultyData"][number]>();
  const roomMap = new Map<string, OfficialTimetablePayload["roomData"][number]>();
  const combinedSlots: OfficialTimetablePayload["timetableData"] = [];

  for (const snapshot of ordered) {
    for (const item of snapshot.payload.courseData) {
      if (!courseMap.has(item.id)) {
        courseMap.set(item.id, item);
      }
    }
    for (const item of snapshot.payload.facultyData) {
      if (!facultyMap.has(item.id)) {
        facultyMap.set(item.id, item);
      }
    }
    for (const item of snapshot.payload.roomData) {
      if (!roomMap.has(item.id)) {
        roomMap.set(item.id, item);
      }
    }

    const inferredTerm = snapshot.payload.termNumber ?? parseCycleTermLabel(snapshot.version.label)?.termNumber ?? 0;
    snapshot.payload.timetableData.forEach((slot, slotIndex) => {
      combinedSlots.push({
        ...slot,
        id: makeCycleSlotId(inferredTerm, slot.id, slotIndex),
      });
    });
  }

  const combinedPayload: OfficialTimetablePayload = {
    programId: base.payload.programId,
    termNumber: undefined,
    courseData: [...courseMap.values()],
    facultyData: [...facultyMap.values()],
    roomData: [...roomMap.values()],
    timetableData: combinedSlots,
  };

  const cycleLabelParts = parseCycleTermLabel(base.version.label);
  const cycleLabel = cycleLabelParts
    ? `cyclegen-${cycleLabelParts.programToken}-cycle-${cycleLabelParts.timestamp}-terms-${summarizeCycleTerms(ordered)}`
    : `${base.version.label} • combined-cycle`;

  return {
    version: {
      ...base.version,
      label: cycleLabel,
      summary: {
        ...(base.version.summary ?? {}),
        source: "generation-cycle-bundle",
        combined_cycle_snapshot: true,
        terms: summarizeCycleTerms(ordered),
      },
    },
    payload: combinedPayload,
  };
}

export async function fetchLatestGeneratedDraftSnapshot(): Promise<GeneratedDraftSnapshot | null> {
  const versions = await listTimetableVersions();
  if (!versions.length) {
    return null;
  }

  const combinedCycleVersion = versions.find((version) => {
    const summary = version.summary ?? {};
    const source = typeof summary.source === "string" ? summary.source.toLowerCase() : "";
    return source === "generation-cycle-bundle" || summary.combined_cycle_snapshot === true;
  });
  if (combinedCycleVersion) {
    const combinedSnapshot = await fetchFirstAccessibleSnapshot([combinedCycleVersion]);
    if (combinedSnapshot) {
      return combinedSnapshot;
    }
  }

  const firstCycleTermVersion = versions.find((version) => parseCycleTermLabel(version.label) !== null);
  if (firstCycleTermVersion) {
    const anchor = parseCycleTermLabel(firstCycleTermVersion.label);
    if (anchor) {
      const siblingCycleVersions = versions.filter((version) => {
        const parsed = parseCycleTermLabel(version.label);
        return (
          parsed !== null
          && parsed.programToken === anchor.programToken
          && parsed.timestamp === anchor.timestamp
        );
      });
      if (siblingCycleVersions.length > 1) {
        const siblingSnapshots: GeneratedDraftSnapshot[] = [];
        for (const candidate of siblingCycleVersions) {
          try {
            const payload = await fetchTimetableVersionPayload(candidate.id);
            siblingSnapshots.push({ version: candidate, payload });
          } catch {
            // Skip inaccessible cycle-term payloads and continue.
          }
        }
        if (siblingSnapshots.length > 1) {
          return combineCycleSnapshots(siblingSnapshots);
        }
      }
    }
  }

  const generatedCandidates = versions.filter(isGeneratedSnapshotVersion);
  const generatedSnapshot = await fetchFirstAccessibleSnapshot(generatedCandidates);
  if (generatedSnapshot) {
    return generatedSnapshot;
  }

  // Fallback: if generated markers are missing, still return the latest usable version.
  return fetchFirstAccessibleSnapshot(versions);
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

export async function reviewTimetableConflicts(
  payload?: OfficialTimetablePayload,
): Promise<TimetableConflictReview> {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_BASE_URL}/api/timetable/conflicts/review`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload ? { payload } : {}),
  });

  if (!response.ok) {
    let detail = "Unable to review timetable conflicts";
    try {
      const data = await response.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore parsing errors
    }
    throw new Error(detail);
  }

  const raw = (await response.json()) as BackendConflictReview;
  return normalizeConflictReview(raw);
}

export async function resolveAllTimetableConflicts(
  input?: TimetableConflictResolveAllInput,
): Promise<TimetableConflictResolveAllResult> {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_BASE_URL}/api/timetable/conflicts/resolve-all`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });

  if (!response.ok) {
    let detail = "Unable to auto-resolve timetable conflicts";
    try {
      const data = await response.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore parsing errors
    }
    throw new Error(detail);
  }

  const raw = (await response.json()) as BackendConflictResolveAll;
  const result = normalizeConflictResolveAll(raw);
  notifyTimetableUpdated("conflict_resolution");
  return result;
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

  const updatedPayload = (await response.json()) as OfficialTimetablePayload;
  notifyTimetableUpdated("resolution_action");
  return updatedPayload;
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

  const result = (await response.json()) as ConflictDecisionResult;
  if (decision === "yes" && result.resolved) {
    notifyTimetableUpdated("conflict_resolution");
  }
  return result;
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

export async function publishTimetableDistribution(): Promise<OfflinePublishResult> {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Not authenticated");
  }
  const response = await fetch(`${API_BASE_URL}/api/timetable/publish-distribution`, {
    method: "POST",
    headers,
  });
  if (!response.ok) {
    let detail = "Unable to publish role-wise timetable distribution";
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

export interface TimetableChangeRequestProposalInput {
  slotId: string;
  day: string;
  startTime: string;
  endTime: string;
  roomId?: string | null;
  facultyId?: string | null;
  assistantFacultyIds?: string[] | null;
  section?: string | null;
  requestKind?: "slot_move" | "resource_reassign" | "extra_class";
  note?: string | null;
}

export async function listTimetableChangeRequests(
  params: { status?: "pending" | "approved" | "rejected" | "applied"; mine?: boolean } = {},
): Promise<TimetableChangeRequest[]> {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Not authenticated");
  }
  const search = new URLSearchParams();
  if (params.status) {
    search.set("status", params.status);
  }
  if (params.mine) {
    search.set("mine", "true");
  }
  const query = search.toString();
  const response = await fetch(`${API_BASE_URL}/api/timetable/change-requests${query ? `?${query}` : ""}`, {
    headers,
  });
  if (!response.ok) {
    let detail = "Unable to load timetable change requests";
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

export async function proposeTimetableChangeRequest(
  payload: TimetableChangeRequestProposalInput,
): Promise<TimetableChangeRequest> {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Not authenticated");
  }
  const response = await fetch(`${API_BASE_URL}/api/timetable/change-requests`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let detail = "Unable to submit change request";
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

export async function decideTimetableChangeRequest(
  requestId: string,
  decision: "approve" | "reject",
  note?: string,
): Promise<TimetableChangeRequestDecisionResult> {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Not authenticated");
  }
  const response = await fetch(`${API_BASE_URL}/api/timetable/change-requests/${encodeURIComponent(requestId)}/decision`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ decision, note }),
  });
  if (!response.ok) {
    let detail = "Unable to submit decision";
    try {
      const data = await response.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore parsing errors
    }
    throw new Error(detail);
  }
  const result = await response.json() as TimetableChangeRequestDecisionResult;
  notifyTimetableUpdated("conflict_resolution");
  return result;
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
