import type { Course, Faculty, Room, TimeSlot } from "@/lib/timetable-types";

const DEFAULT_REPEAT_WEEKS = 16;
const DAY_TO_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};
const DAY_TO_RRULE: Record<string, string> = {
  Sunday: "SU",
  Monday: "MO",
  Tuesday: "TU",
  Wednesday: "WE",
  Thursday: "TH",
  Friday: "FR",
  Saturday: "SA",
};

function getCourseById(id: string, courses: Course[]): Course | undefined {
  return courses.find((item) => item.id === id);
}

function getFacultyById(id: string, faculty: Faculty[]): Faculty | undefined {
  return faculty.find((item) => item.id === id);
}

function getRoomById(id: string, rooms: Room[]): Room | undefined {
  return rooms.find((item) => item.id === id);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

function formatUtcDateTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    return null;
  }
  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
  };
}

function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n");
}

function resolveNextDateForDay(day: string, time: { hours: number; minutes: number }): Date | null {
  const targetDayIndex = DAY_TO_INDEX[day];
  if (targetDayIndex === undefined) {
    return null;
  }
  const now = new Date();
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  const offset = (targetDayIndex - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + offset);
  base.setHours(time.hours, time.minutes, 0, 0);
  if (base <= now) {
    base.setDate(base.getDate() + 7);
  }
  return base;
}

export function generateICSContent(
  slots: TimeSlot[],
  options: {
    courses: Course[];
    rooms: Room[];
    faculty: Faculty[];
  },
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ShedForge//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  const orderedSlots = [...slots].sort((left, right) => {
    if (left.day !== right.day) {
      return (DAY_TO_INDEX[left.day] ?? 99) - (DAY_TO_INDEX[right.day] ?? 99);
    }
    if (left.startTime !== right.startTime) {
      return left.startTime.localeCompare(right.startTime);
    }
    return left.id.localeCompare(right.id);
  });

  orderedSlots.forEach((slot) => {
    const course = getCourseById(slot.courseId, options.courses);
    const room = getRoomById(slot.roomId, options.rooms);
    const instructor = getFacultyById(slot.facultyId, options.faculty);
    const start = parseTime(slot.startTime);
    const end = parseTime(slot.endTime);
    if (!start || !end) {
      return;
    }
    const baseDate = resolveNextDateForDay(slot.day, start);
    if (!baseDate) {
      return;
    }

    const startDateTime = new Date(baseDate);
    startDateTime.setHours(start.hours, start.minutes, 0, 0);

    const endDateTime = new Date(baseDate);
    endDateTime.setHours(end.hours, end.minutes, 0, 0);
    if (endDateTime <= startDateTime) {
      endDateTime.setTime(startDateTime.getTime() + 50 * 60 * 1000);
    }

    const sessionType = slot.sessionType ?? (course?.type === "lab" ? "lab" : "theory");
    const summaryCode = course?.code ?? slot.courseId;
    const summaryName = course?.name ?? "Timetable Session";
    const section = slot.section || "N/A";
    const batch = slot.batch ? `\nBatch: ${slot.batch}` : "";
    const locationRoom = room?.name ?? slot.roomId;
    const locationBuilding = room?.building ? `, ${room.building}` : "";
    const facultyName = instructor?.name ?? slot.facultyId;
    const byDay = DAY_TO_RRULE[slot.day];

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(`${slot.id}@shedforge.local`)}`);
    lines.push(`DTSTAMP:${formatUtcDateTime(new Date())}`);
    lines.push(`DTSTART:${formatLocalDateTime(startDateTime)}`);
    lines.push(`DTEND:${formatLocalDateTime(endDateTime)}`);
    if (byDay) {
      lines.push(`RRULE:FREQ=WEEKLY;COUNT=${DEFAULT_REPEAT_WEEKS};BYDAY=${byDay}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(`${summaryCode} - ${summaryName}`)}`);
    lines.push(
      `DESCRIPTION:${escapeIcsText(`Instructor: ${facultyName}\nSection: ${section}${batch}\nType: ${sessionType}`)}`,
    );
    lines.push(`LOCATION:${escapeIcsText(`${locationRoom}${locationBuilding}`)}`);
    lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
