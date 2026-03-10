import type { SchedulePolicyUpdate, WorkingHoursEntry } from "@/lib/settings-api";

export function parseTimeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map((item) => Number(item));
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return NaN;
  }
  return hours * 60 + minutes;
}

export function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function buildTeachingSegmentsForDay(
  dayHours: WorkingHoursEntry,
  policy: SchedulePolicyUpdate,
): Array<{ start: number; end: number }> {
  const dayStart = parseTimeToMinutes(dayHours.start_time);
  const dayEnd = parseTimeToMinutes(dayHours.end_time);
  if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd) || dayEnd <= dayStart) {
    return [];
  }

  const breakWindows = [...policy.breaks]
    .map((item) => ({
      start: parseTimeToMinutes(item.start_time),
      end: parseTimeToMinutes(item.end_time),
    }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > dayStart && item.start < dayEnd)
    .sort((a, b) => a.start - b.start);

  const segments: Array<{ start: number; end: number }> = [];
  let cursor = dayStart;
  let breakIndex = 0;
  while (cursor + policy.period_minutes <= dayEnd) {
    while (breakIndex < breakWindows.length && breakWindows[breakIndex].end <= cursor) {
      breakIndex += 1;
    }

    if (breakIndex < breakWindows.length) {
      const currentBreak = breakWindows[breakIndex];
      if (currentBreak.start <= cursor && cursor < currentBreak.end) {
        cursor = currentBreak.end;
        continue;
      }
      if (cursor < currentBreak.start && currentBreak.start < cursor + policy.period_minutes) {
        cursor = currentBreak.end;
        continue;
      }
    }

    const nextCursor = cursor + policy.period_minutes;
    segments.push({ start: cursor, end: nextCursor });
    cursor = nextCursor;
  }

  return segments;
}

export function buildTemplateDays(workingHours: WorkingHoursEntry[]): string[] {
  return workingHours.filter((item) => item.enabled).map((item) => item.day);
}

export function buildTemplateTimeSlots(
  workingHours: WorkingHoursEntry[],
  policy: SchedulePolicyUpdate,
): string[] {
  const firstEnabled = workingHours.find((item) => item.enabled);
  if (!firstEnabled) {
    return [];
  }
  const segments = buildTeachingSegmentsForDay(firstEnabled, policy);
  return segments.map((item) => minutesToTime(item.start));
}

export function sortTimes(values: string[]): string[] {
  return [...values].sort((left, right) => parseTimeToMinutes(left) - parseTimeToMinutes(right));
}
