import { parseTimeToMinutes } from "@/lib/schedule-template";
import type { ProgramDailyTimeSlot } from "@/lib/constraints-api";
import type { Course, Faculty, Room, TimeSlot } from "@/lib/timetable-types";
import type { WeeklyGridResolvedSlot, WeeklyGridRow } from "@/components/timetable/weekly-timetable-grid";

export const WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const LUNCH_START_TIME = "13:15";
export const LUNCH_END_TIME = "14:05";
const REMOVED_LEGACY_SLOT_KEYS = new Set([
  "10:45|11:20",
  "11:20|12:10",
  "12:10|13:00",
  "14:40|15:30",
  "15:30|16:20",
  "16:20|16:35",
]);

function toSlotKey(startTime: string, endTime: string): string {
  return `${startTime}|${endTime}`;
}

export function isCanonicalLunchRange(startTime: string, endTime: string): boolean {
  return startTime === LUNCH_START_TIME && endTime === LUNCH_END_TIME;
}

export function isRemovedLegacySlotRange(startTime: string, endTime: string): boolean {
  return REMOVED_LEGACY_SLOT_KEYS.has(toSlotKey(startTime, endTime));
}

export function overlapsCanonicalLunchWindow(startTime: string, endTime: string): boolean {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  const lunchStart = parseTimeToMinutes(LUNCH_START_TIME);
  const lunchEnd = parseTimeToMinutes(LUNCH_END_TIME);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }
  return start < lunchEnd && end > lunchStart;
}

export function buildWeeklyGridRows(slots: TimeSlot[], dailySlots: ProgramDailyTimeSlot[] = []): WeeklyGridRow[] {
  const rows = new Map<string, WeeklyGridRow>();

  for (const item of dailySlots) {
    if (isRemovedLegacySlotRange(item.start_time, item.end_time)) {
      continue;
    }
    const slotIsLunch = isCanonicalLunchRange(item.start_time, item.end_time);
    if (item.tag === "lunch" && !slotIsLunch) {
      continue;
    }
    if (overlapsCanonicalLunchWindow(item.start_time, item.end_time) && !slotIsLunch) {
      continue;
    }
    const key = toSlotKey(item.start_time, item.end_time);
    rows.set(key, {
      startTime: item.start_time,
      endTime: item.end_time,
      tag: slotIsLunch ? "lunch" : item.tag,
      label: slotIsLunch ? "Lunch Break" : item.label ?? undefined,
    });
  }

  const lunchKey = toSlotKey(LUNCH_START_TIME, LUNCH_END_TIME);
  if (!rows.has(lunchKey)) {
    rows.set(lunchKey, {
      startTime: LUNCH_START_TIME,
      endTime: LUNCH_END_TIME,
      tag: "lunch",
      label: "Lunch Break",
    });
  }

  for (const slot of slots) {
    if (isRemovedLegacySlotRange(slot.startTime, slot.endTime)) {
      continue;
    }
    const slotIsLunch = isCanonicalLunchRange(slot.startTime, slot.endTime);
    if (overlapsCanonicalLunchWindow(slot.startTime, slot.endTime) && !slotIsLunch) {
      continue;
    }
    const key = toSlotKey(slot.startTime, slot.endTime);
    if (!rows.has(key)) {
      rows.set(key, {
        startTime: slot.startTime,
        endTime: slot.endTime,
        tag: slotIsLunch ? "lunch" : "teaching",
        label: slotIsLunch ? "Lunch Break" : undefined,
      });
    }
  }

  return Array.from(rows.values()).sort((left, right) => {
    const startDiff = parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime);
    if (startDiff !== 0) {
      return startDiff;
    }
    return parseTimeToMinutes(left.endTime) - parseTimeToMinutes(right.endTime);
  });
}

export function buildWeeklyGridDays(slots: TimeSlot[]): string[] {
  const uniqueDays = Array.from(new Set(slots.map((slot) => slot.day)));
  const ordered = WEEKDAY_ORDER.filter((day) => uniqueDays.includes(day));
  return ordered.length ? ordered : WEEKDAY_ORDER.slice(0, 5);
}

export function buildWeeklyGridCellEntries(
  slots: TimeSlot[],
  courseById: Map<string, Course>,
  facultyById: Map<string, Faculty>,
  roomById: Map<string, Room>,
): Record<string, WeeklyGridResolvedSlot[]> {
  const output: Record<string, WeeklyGridResolvedSlot[]> = {};

  for (const slot of slots) {
    const key = `${slot.day}|${slot.startTime}|${slot.endTime}`;
    if (!output[key]) {
      output[key] = [];
    }
    output[key].push({
      slot,
      course: courseById.get(slot.courseId),
      faculty: facultyById.get(slot.facultyId),
      room: roomById.get(slot.roomId),
    });
  }

  for (const key of Object.keys(output)) {
    output[key].sort((left, right) => {
      const leftCode = left.course?.code ?? left.slot.courseId;
      const rightCode = right.course?.code ?? right.slot.courseId;
      return leftCode.localeCompare(rightCode, undefined, { numeric: true, sensitivity: "base" });
    });
  }

  return output;
}
