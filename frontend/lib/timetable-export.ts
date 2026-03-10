import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { parseTimeToMinutes } from "@/lib/schedule-template";
import type { Course, Faculty, Room, TimeSlot } from "@/lib/timetable-types";

const DAY_SEQUENCE = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_INDEX = new Map(DAY_SEQUENCE.map((day, index) => [day, index]));

type SessionType = "theory" | "tutorial" | "lab" | "mixed";

interface TimetableContext {
  courseById: Map<string, Course>;
  roomById: Map<string, Room>;
  facultyById: Map<string, Faculty>;
}

interface TimetableWindow {
  startTime: string;
  endTime: string;
  label: string;
}

interface TimetableSummaryRow {
  code: string;
  name: string;
  type: SessionType;
  faculty: string;
  venue: string;
}

export interface TimetableExportPayload {
  filename: string;
  title: string;
  subtitle: string;
  viewLabel: string;
  scopeLabel: string;
  semesterLabel: string;
  sourceLabel: string;
  departmentLabel: string;
  programLabel: string;
  slots: TimeSlot[];
  courses: Course[];
  rooms: Room[];
  faculty: Faculty[];
}

function resolveSessionType(slot: TimeSlot, course: Course | undefined): SessionType {
  const value = slot.sessionType ?? (course?.type === "lab" ? "lab" : "theory");
  if (value === "lab" || value === "tutorial" || value === "theory") {
    return value;
  }
  return "theory";
}

function buildContext(payload: TimetableExportPayload): TimetableContext {
  return {
    courseById: new Map(payload.courses.map((item) => [item.id, item])),
    roomById: new Map(payload.rooms.map((item) => [item.id, item])),
    facultyById: new Map(payload.faculty.map((item) => [item.id, item])),
  };
}

function sortSlots(slots: TimeSlot[]): TimeSlot[] {
  return [...slots].sort((left, right) => {
    const dayDiff = (DAY_INDEX.get(left.day) ?? 99) - (DAY_INDEX.get(right.day) ?? 99);
    if (dayDiff !== 0) {
      return dayDiff;
    }
    const startDiff = parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime);
    if (startDiff !== 0) {
      return startDiff;
    }
    const sectionDiff = left.section.localeCompare(right.section, undefined, { numeric: true, sensitivity: "base" });
    if (sectionDiff !== 0) {
      return sectionDiff;
    }
    return left.id.localeCompare(right.id);
  });
}

function uniqueDays(slots: TimeSlot[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const slot of sortSlots(slots)) {
    if (seen.has(slot.day)) {
      continue;
    }
    seen.add(slot.day);
    ordered.push(slot.day);
  }
  return ordered;
}

function uniqueWindows(slots: TimeSlot[]): TimetableWindow[] {
  const map = new Map<string, TimetableWindow>();
  for (const slot of slots) {
    const key = `${slot.startTime}|${slot.endTime}`;
    if (map.has(key)) {
      continue;
    }
    map.set(key, {
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: `${slot.startTime} - ${slot.endTime}`,
    });
  }
  return [...map.values()].sort((left, right) => parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime));
}

function sessionFillHex(type: SessionType): string {
  if (type === "lab") {
    return "#D9F7D6";
  }
  if (type === "tutorial") {
    return "#FFF3CD";
  }
  if (type === "mixed") {
    return "#E3F2FD";
  }
  return "#EAF2FF";
}

function toRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) {
    return [234, 242, 255];
  }
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function toArgb(hex: string): string {
  const clean = hex.replace("#", "").toUpperCase();
  return `FF${clean.length === 6 ? clean : "EAF2FF"}`;
}

function slotCellKey(day: string, window: TimetableWindow): string {
  return `${day}|${window.startTime}|${window.endTime}`;
}

function getSlotLabel(slot: TimeSlot, context: TimetableContext): string {
  const course = context.courseById.get(slot.courseId);
  const room = context.roomById.get(slot.roomId);
  const faculty = context.facultyById.get(slot.facultyId);
  const courseCode = course?.code ?? slot.courseId;
  const roomName = room?.name ?? slot.roomId;
  const facultyName = faculty?.name ?? slot.facultyId;
  const sectionLabel = slot.batch ? `${slot.section}-${slot.batch}` : slot.section;
  return `${courseCode} | ${sectionLabel} | ${facultyName} | ${roomName}`;
}

function buildCellMaps(
  slots: TimeSlot[],
  context: TimetableContext,
): {
  labelsByCell: Map<string, string>;
  fillByCell: Map<string, string>;
} {
  const entriesByCell = new Map<string, TimeSlot[]>();
  for (const slot of slots) {
    const key = `${slot.day}|${slot.startTime}|${slot.endTime}`;
    const current = entriesByCell.get(key) ?? [];
    current.push(slot);
    entriesByCell.set(key, current);
  }

  const labelsByCell = new Map<string, string>();
  const fillByCell = new Map<string, string>();

  for (const [key, entries] of entriesByCell.entries()) {
    const labels = entries.map((slot) => getSlotLabel(slot, context));
    labelsByCell.set(key, labels.join("\n"));

    const sessionKinds = new Set<SessionType>();
    for (const slot of entries) {
      const course = context.courseById.get(slot.courseId);
      sessionKinds.add(resolveSessionType(slot, course));
    }
    const fill =
      sessionKinds.size > 1
        ? sessionFillHex("mixed")
        : sessionFillHex(sessionKinds.values().next().value ?? "theory");
    fillByCell.set(key, fill);
  }

  return { labelsByCell, fillByCell };
}

function buildSummaryRows(slots: TimeSlot[], context: TimetableContext): TimetableSummaryRow[] {
  const rowsByCourseId = new Map<string, TimetableSummaryRow>();
  for (const slot of slots) {
    const course = context.courseById.get(slot.courseId);
    if (!course) {
      continue;
    }
    const key = course.id;
    const existing = rowsByCourseId.get(key) ?? {
      code: course.code,
      name: course.name,
      type: resolveSessionType(slot, course),
      faculty: "",
      venue: "",
    };
    if (existing.type !== resolveSessionType(slot, course)) {
      existing.type = "mixed";
    }

    const facultyIds = [slot.facultyId, ...(slot.assistantFacultyIds ?? [])];
    const facultyNames = new Set(
      facultyIds.map((facultyId) => context.facultyById.get(facultyId)?.name ?? facultyId),
    );
    const venueNames = new Set([context.roomById.get(slot.roomId)?.name ?? slot.roomId]);

    const currentFaculty = new Set(existing.faculty ? existing.faculty.split(", ").map((value) => value.trim()) : []);
    const currentVenue = new Set(existing.venue ? existing.venue.split(", ").map((value) => value.trim()) : []);
    for (const name of facultyNames) {
      if (name) {
        currentFaculty.add(name);
      }
    }
    for (const venue of venueNames) {
      if (venue) {
        currentVenue.add(venue);
      }
    }
    existing.faculty = [...currentFaculty].sort((left, right) => left.localeCompare(right)).join(", ");
    existing.venue = [...currentVenue].sort((left, right) => left.localeCompare(right)).join(", ");
    rowsByCourseId.set(key, existing);
  }

  return [...rowsByCourseId.values()].sort((left, right) => left.code.localeCompare(right.code));
}

function downloadBuffer(buffer: BlobPart, mimeType: string, filename: string): void {
  const blob = new Blob([buffer], { type: mimeType });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function lastTableY(doc: jsPDF, fallback: number): number {
  const maybe = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
  return typeof maybe === "number" ? maybe : fallback;
}

export function downloadTimetablePdf(payload: TimetableExportPayload): void {
  const context = buildContext(payload);
  const orderedSlots = sortSlots(payload.slots);
  const days = uniqueDays(orderedSlots);
  const windows = uniqueWindows(orderedSlots);
  const { labelsByCell, fillByCell } = buildCellMaps(orderedSlots, context);
  const summaryRows = buildSummaryRows(orderedSlots, context);

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a3",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 24;

  doc.setFillColor(112, 173, 71);
  doc.rect(margin, 18, pageWidth - margin * 2, 34, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(9, 23, 34);
  doc.text(payload.title, pageWidth / 2, 41, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(payload.subtitle, margin, 64);

  autoTable(doc, {
    startY: 74,
    body: [
      ["View", payload.viewLabel, "Scope", payload.scopeLabel],
      ["Semester", payload.semesterLabel, "Source", payload.sourceLabel],
      ["Department", payload.departmentLabel, "Program", payload.programLabel],
    ],
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: 5,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [242, 245, 249], cellWidth: 82 },
      1: { cellWidth: 220 },
      2: { fontStyle: "bold", fillColor: [242, 245, 249], cellWidth: 82 },
      3: { cellWidth: 220 },
    },
    margin: { left: margin, right: margin },
  });

  const gridHead = [["Day / Time", ...windows.map((window) => window.label)]];
  const cellFillByPosition = new Map<string, [number, number, number]>();
  const gridBody = days.map((day, rowIndex) => {
    const row = [day];
    windows.forEach((window, windowIndex) => {
      const key = slotCellKey(day, window);
      const label = labelsByCell.get(key) ?? "";
      row.push(label);
      const fillHex = fillByCell.get(key) ?? "#F8FAFC";
      cellFillByPosition.set(`${rowIndex}|${windowIndex + 1}`, toRgb(fillHex));
    });
    return row;
  });

  autoTable(doc, {
    startY: lastTableY(doc, 110) + 10,
    head: gridHead,
    body: gridBody.length ? gridBody : [["No timetable data available for this scope."]],
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 4,
      halign: "center",
      valign: "middle",
      overflow: "linebreak",
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [242, 210, 99],
      textColor: [17, 24, 39],
      fontStyle: "bold",
    },
    columnStyles: {
      0: {
        fillColor: [251, 232, 151],
        fontStyle: "bold",
        cellWidth: 96,
      },
    },
    didParseCell: (hook) => {
      if (hook.section === "body" && hook.column.index > 0 && gridBody.length) {
        const fill = cellFillByPosition.get(`${hook.row.index}|${hook.column.index}`);
        if (fill) {
          hook.cell.styles.fillColor = fill;
        }
      }
    },
    margin: { left: margin, right: margin },
  });

  autoTable(doc, {
    startY: lastTableY(doc, 170) + 10,
    head: [["Course Code", "Course Name", "Type", "Faculty", "Venue"]],
    body: summaryRows.map((item) => [item.code, item.name, item.type.toUpperCase(), item.faculty, item.venue]),
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 4,
      textColor: [15, 23, 42],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [112, 173, 71],
      textColor: [9, 23, 34],
      fontStyle: "bold",
    },
    didParseCell: (hook) => {
      if (hook.section !== "body") {
        return;
      }
      const row = summaryRows[hook.row.index];
      if (!row) {
        return;
      }
      hook.cell.styles.fillColor = toRgb(sessionFillHex(row.type));
    },
    margin: { left: margin, right: margin },
  });

  doc.save(`${payload.filename}.pdf`);
}

export async function downloadTimetableXlsx(payload: TimetableExportPayload): Promise<void> {
  const context = buildContext(payload);
  const orderedSlots = sortSlots(payload.slots);
  const days = uniqueDays(orderedSlots);
  const windows = uniqueWindows(orderedSlots);
  const { labelsByCell, fillByCell } = buildCellMaps(orderedSlots, context);
  const summaryRows = buildSummaryRows(orderedSlots, context);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ShedForge";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Timetable");
  const totalColumns = Math.max(windows.length + 1, 7);

  for (let index = 1; index <= totalColumns; index += 1) {
    sheet.getColumn(index).width = index === 1 ? 18 : 24;
  }

  sheet.mergeCells(1, 1, 1, totalColumns);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = payload.title;
  titleCell.font = { bold: true, size: 18, color: { argb: "FF091722" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF70AD47" } };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(2, 1, 2, totalColumns);
  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = payload.subtitle;
  subtitleCell.font = { size: 11, color: { argb: "FF334155" } };
  subtitleCell.alignment = { horizontal: "left", vertical: "middle" };

  sheet.mergeCells(3, 1, 3, totalColumns);
  const scopeCell = sheet.getCell(3, 1);
  scopeCell.value = `View: ${payload.viewLabel} | Scope: ${payload.scopeLabel} | Semester: ${payload.semesterLabel} | Source: ${payload.sourceLabel}`;
  scopeCell.font = { bold: true, size: 10, color: { argb: "FF0F172A" } };
  scopeCell.alignment = { horizontal: "left", vertical: "middle" };

  sheet.mergeCells(4, 1, 4, totalColumns);
  const metaCell = sheet.getCell(4, 1);
  metaCell.value = `Department: ${payload.departmentLabel} | Program: ${payload.programLabel}`;
  metaCell.font = { bold: true, size: 10, color: { argb: "FF0F172A" } };
  metaCell.alignment = { horizontal: "left", vertical: "middle" };

  const border = {
    top: { style: "thin" as const, color: { argb: "FF94A3B8" } },
    left: { style: "thin" as const, color: { argb: "FF94A3B8" } },
    bottom: { style: "thin" as const, color: { argb: "FF94A3B8" } },
    right: { style: "thin" as const, color: { argb: "FF94A3B8" } },
  };

  const gridStartRow = 6;
  sheet.getCell(gridStartRow, 1).value = "Day / Time";
  for (const [columnOffset, window] of windows.entries()) {
    sheet.getCell(gridStartRow, columnOffset + 2).value = window.label;
  }
  for (let columnIndex = 1; columnIndex <= windows.length + 1; columnIndex += 1) {
    const cell = sheet.getCell(gridStartRow, columnIndex);
    cell.font = { bold: true, size: 10, color: { argb: "FF111827" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2D263" } };
    cell.border = border;
  }
  sheet.getRow(gridStartRow).height = 32;

  for (const [rowOffset, day] of days.entries()) {
    const rowIndex = gridStartRow + rowOffset + 1;
    const dayCell = sheet.getCell(rowIndex, 1);
    dayCell.value = day;
    dayCell.font = { bold: true, size: 10, color: { argb: "FF111827" } };
    dayCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    dayCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBE897" } };
    dayCell.border = border;

    for (const [windowOffset, window] of windows.entries()) {
      const columnIndex = windowOffset + 2;
      const slotKey = slotCellKey(day, window);
      const value = labelsByCell.get(slotKey) ?? "";
      const fillHex = fillByCell.get(slotKey) ?? "#F8FAFC";
      const cell = sheet.getCell(rowIndex, columnIndex);
      cell.value = value;
      cell.font = { size: 9, color: { argb: "FF0F172A" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: toArgb(fillHex) } };
      cell.border = border;
    }
    sheet.getRow(rowIndex).height = 54;
  }

  const summaryTitleRow = gridStartRow + days.length + 3;
  sheet.mergeCells(summaryTitleRow, 1, summaryTitleRow, totalColumns);
  const summaryTitleCell = sheet.getCell(summaryTitleRow, 1);
  summaryTitleCell.value = "Course Summary";
  summaryTitleCell.font = { bold: true, size: 12, color: { argb: "FF091722" } };
  summaryTitleCell.alignment = { horizontal: "center", vertical: "middle" };
  summaryTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF70AD47" } };
  summaryTitleCell.border = border;

  const summaryHeaderRow = summaryTitleRow + 1;
  const summaryHeaders = ["Course Code", "Course Name", "Type", "Faculty", "Venue"];
  summaryHeaders.forEach((header, index) => {
    const cell = sheet.getCell(summaryHeaderRow, index + 1);
    cell.value = header;
    cell.font = { bold: true, size: 10, color: { argb: "FF111827" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2D263" } };
    cell.border = border;
  });
  sheet.getRow(summaryHeaderRow).height = 24;

  summaryRows.forEach((summary, index) => {
    const rowIndex = summaryHeaderRow + index + 1;
    const rowValues = [summary.code, summary.name, summary.type.toUpperCase(), summary.faculty, summary.venue];
    rowValues.forEach((value, valueIndex) => {
      const cell = sheet.getCell(rowIndex, valueIndex + 1);
      cell.value = value;
      cell.font = { size: 9, color: { argb: "FF0F172A" } };
      cell.alignment = {
        horizontal: valueIndex === 0 || valueIndex === 2 ? "center" : "left",
        vertical: "middle",
        wrapText: true,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: toArgb(sessionFillHex(summary.type)) },
      };
      cell.border = border;
    });
    sheet.getRow(rowIndex).height = 22;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(
    buffer,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    `${payload.filename}.xlsx`,
  );
}

