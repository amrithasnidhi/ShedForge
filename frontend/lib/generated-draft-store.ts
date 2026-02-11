import type { GenerationCycle, GeneratedAlternative, GeneratedCycleSolutionTerm } from "@/lib/generator-api";
import type { OfficialTimetablePayload } from "@/lib/timetable-api";

const GENERATED_DRAFT_STORAGE_KEY = "shedforge.generated_draft.v1";

export type GeneratedDraftMode = "single" | GenerationCycle;

export interface GeneratedDraftSnapshot {
  version: 1;
  mode: GeneratedDraftMode;
  source: "generator" | "schedule";
  generated_at: string;
  program_id?: string;
  term_number?: number;
  label: string;
  hard_conflicts: number;
  fitness?: number | null;
  payload: OfficialTimetablePayload;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isGeneratedDraftSnapshot(value: unknown): value is GeneratedDraftSnapshot {
  if (!isObject(value)) {
    return false;
  }
  if (value.version !== 1) {
    return false;
  }
  if (value.source !== "generator" && value.source !== "schedule") {
    return false;
  }
  if (typeof value.mode !== "string") {
    return false;
  }
  if (typeof value.generated_at !== "string") {
    return false;
  }
  if (typeof value.label !== "string") {
    return false;
  }
  if (!isNumber(value.hard_conflicts)) {
    return false;
  }
  if (!isObject(value.payload)) {
    return false;
  }
  const payload = value.payload;
  if (!Array.isArray(payload.facultyData) || !Array.isArray(payload.courseData) || !Array.isArray(payload.roomData) || !Array.isArray(payload.timetableData)) {
    return false;
  }
  return true;
}

export function saveGeneratedDraft(snapshot: GeneratedDraftSnapshot): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(GENERATED_DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota errors; the app can continue without draft persistence.
  }
}

export function loadGeneratedDraft(): GeneratedDraftSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(GENERATED_DRAFT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isGeneratedDraftSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearGeneratedDraft(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(GENERATED_DRAFT_STORAGE_KEY);
}

export function buildSingleDraftSnapshot(params: {
  source: "generator" | "schedule";
  mode?: GeneratedDraftMode;
  programId?: string;
  termNumber?: number | null;
  alternative: GeneratedAlternative;
}): GeneratedDraftSnapshot {
  const { source, mode = "single", programId, termNumber, alternative } = params;
  return {
    version: 1,
    mode,
    source,
    generated_at: new Date().toISOString(),
    program_id: programId ?? alternative.payload.programId,
    term_number: termNumber ?? alternative.payload.termNumber,
    label: mode === "single" ? `Alternative ${alternative.rank}` : `${mode.toUpperCase()} cycle alt ${alternative.rank}`,
    hard_conflicts: alternative.hard_conflicts,
    fitness: alternative.fitness,
    payload: alternative.payload,
  };
}

export function buildCycleTermDraftSnapshot(params: {
  source: "generator" | "schedule";
  mode: GenerationCycle;
  programId?: string;
  solutionRank?: number | null;
  term: GeneratedCycleSolutionTerm;
}): GeneratedDraftSnapshot {
  const { source, mode, programId, solutionRank, term } = params;
  return {
    version: 1,
    mode,
    source,
    generated_at: new Date().toISOString(),
    program_id: programId ?? term.payload.programId,
    term_number: term.term_number,
    label: `Cycle solution ${solutionRank ?? "-"} • Semester ${term.term_number} • Alt ${term.alternative_rank}`,
    hard_conflicts: term.hard_conflicts,
    fitness: term.fitness,
    payload: term.payload,
  };
}
