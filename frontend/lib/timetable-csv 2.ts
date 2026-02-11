interface TimetableSlot {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  courseId: string;
  roomId: string;
  facultyId: string;
  section: string;
  batch?: string | null;
  studentCount?: number | null;
  sessionType?: "theory" | "tutorial" | "lab";
}

interface CourseLike {
  id: string;
  code: string;
  name: string;
  type?: string;
}

interface RoomLike {
  id: string;
  name: string;
  building?: string;
}

interface FacultyLike {
  id: string;
  name: string;
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}

function buildCsv(
  slots: TimetableSlot[],
  courses: CourseLike[],
  rooms: RoomLike[],
  faculty: FacultyLike[],
): string {
  const courseById = new Map(courses.map((item) => [item.id, item]));
  const roomById = new Map(rooms.map((item) => [item.id, item]));
  const facultyById = new Map(faculty.map((item) => [item.id, item]));

  const header = [
    "slot_id",
    "day",
    "start_time",
    "end_time",
    "course_code",
    "course_name",
    "course_type",
    "room",
    "building",
    "faculty",
    "section",
    "batch",
    "student_count",
    "session_type",
  ];
  const lines = [header.join(",")];

  for (const slot of slots) {
    const course = courseById.get(slot.courseId);
    const room = roomById.get(slot.roomId);
    const instructor = facultyById.get(slot.facultyId);
    const row = [
      slot.id,
      slot.day,
      slot.startTime,
      slot.endTime,
      course?.code ?? slot.courseId,
      course?.name ?? "",
      slot.sessionType === "tutorial" ? "tutorial" : (course?.type ?? ""),
      room?.name ?? slot.roomId,
      room?.building ?? "",
      instructor?.name ?? slot.facultyId,
      slot.section,
      slot.batch ?? "",
      slot.studentCount ?? "",
      slot.sessionType ?? (course?.type === "lab" ? "lab" : "theory"),
    ];
    lines.push(row.map((item) => escapeCsv(item)).join(","));
  }

  return lines.join("\n");
}

export function downloadTimetableCsv(
  filename: string,
  slots: TimetableSlot[],
  courses: CourseLike[],
  rooms: RoomLike[],
  faculty: FacultyLike[],
): void {
  const csv = buildCsv(slots, courses, rooms, faculty);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
