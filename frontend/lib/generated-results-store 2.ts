import type {
  GenerateTimetableCycleResponse,
  GenerateTimetableResponse,
  GenerationCycle,
} from "@/lib/generator-api";

const GENERATED_RESULTS_STORAGE_KEY = "shedforge.generated_results.v1";

export type GeneratedResultsMode = "single" | GenerationCycle;

export interface GeneratedResultsSnapshot {
  version: 1;
  generated_at: string;
  mode: GeneratedResultsMode;
  program_id?: string;
  term_number?: number;
  single?: GenerateTimetableResponse | null;
  cycle?: GenerateTimetableCycleResponse | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGeneratedResultsSnapshot(value: unknown): value is GeneratedResultsSnapshot {
  if (!isObject(value)) {
    return false;
  }
  if (value.version !== 1 || typeof value.generated_at !== "string" || typeof value.mode !== "string") {
    return false;
  }
  const mode = value.mode;
  if (mode === "single") {
    return !value.single || (isObject(value.single) && Array.isArray(value.single.alternatives));
  }
  return !value.cycle || (isObject(value.cycle) && Array.isArray(value.cycle.results));
}

export function saveGeneratedResults(snapshot: GeneratedResultsSnapshot): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(GENERATED_RESULTS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore localStorage quota failures; generation can continue without persistence.
  }
}

export function loadGeneratedResults(): GeneratedResultsSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(GENERATED_RESULTS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isGeneratedResultsSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearGeneratedResults(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(GENERATED_RESULTS_STORAGE_KEY);
}

export function buildSingleGeneratedResultsSnapshot(params: {
  programId?: string;
  termNumber?: number;
  response: GenerateTimetableResponse;
}): GeneratedResultsSnapshot {
  const { programId, termNumber, response } = params;
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    mode: "single",
    program_id: programId,
    term_number: termNumber,
    single: response,
    cycle: null,
  };
}

export function buildCycleGeneratedResultsSnapshot(params: {
  mode: GenerationCycle;
  programId?: string;
  response: GenerateTimetableCycleResponse;
}): GeneratedResultsSnapshot {
  const { mode, programId, response } = params;
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    mode,
    program_id: programId,
    term_number: response.term_numbers?.[0],
    single: null,
    cycle: response,
  };
}
