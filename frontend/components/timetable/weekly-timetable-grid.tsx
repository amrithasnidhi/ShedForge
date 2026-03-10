"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { Course, Faculty, Room, TimeSlot } from "@/lib/timetable-types";

export type WeeklyGridRowTag = "teaching" | "block" | "break" | "lunch";

export interface WeeklyGridRow {
  startTime: string;
  endTime: string;
  tag: WeeklyGridRowTag;
  label?: string | null;
}

export interface WeeklyGridResolvedSlot {
  slot: TimeSlot;
  course: Course | undefined;
  faculty: Faculty | undefined;
  room: Room | undefined;
}

interface WeeklyTimetableGridProps {
  days: string[];
  rows: WeeklyGridRow[];
  cellEntries: Record<string, WeeklyGridResolvedSlot[]>;
  interactive?: boolean;
  onMoveSlot?: (params: {
    slotId: string;
    targetDay: string;
    targetStartTime: string;
    targetEndTime: string;
    dropClientX?: number;
    dropClientY?: number;
  }) => void;
  emptyMessage?: string;
}

function rowTagClass(tag: WeeklyGridRowTag): string {
  if (tag === "lunch") {
    return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200";
  }
  if (tag === "break") {
    return "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200";
  }
  if (tag === "block") {
    return "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200";
  }
  return "";
}

function slotClass(type: Course["type"] | undefined, sessionType: TimeSlot["sessionType"] | undefined): string {
  if (sessionType === "tutorial") {
    return "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200";
  }
  if (sessionType === "lab" || type === "lab") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200";
  }
  if (type === "elective") {
    return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
  }
  return "border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200";
}

function sessionSuffix(sessionType: TimeSlot["sessionType"] | undefined): string {
  if (sessionType === "tutorial") {
    return " (T)";
  }
  if (sessionType === "lab") {
    return " (P)";
  }
  return "";
}

function cellKey(day: string, row: WeeklyGridRow): string {
  return `${day}|${row.startTime}|${row.endTime}`;
}

export function WeeklyTimetableGrid({
  days,
  rows,
  cellEntries,
  interactive = false,
  onMoveSlot,
  emptyMessage = "No timetable entries for this selection.",
}: WeeklyTimetableGridProps) {
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const [activeDropCellKey, setActiveDropCellKey] = useState<string | null>(null);

  const totalEntries = useMemo(() => {
    return Object.values(cellEntries).reduce((sum, items) => sum + items.length, 0);
  }, [cellEntries]);

  if (!days.length || !rows.length || totalEntries === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border bg-background">
      <table className="w-full min-w-[1100px] table-fixed border-collapse text-sm">
        <thead>
          <tr className="bg-muted/60">
            <th className="sticky left-0 top-0 z-30 w-[120px] border-b px-3 py-2 text-left font-semibold">
              Time
            </th>
            {days.map((day) => (
              <th key={day} className="border-b px-3 py-2 text-center font-semibold">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const nonTeaching = row.tag !== "teaching";
            return (
              <tr key={`${row.startTime}-${row.endTime}`} className={nonTeaching ? "bg-muted/10" : ""}>
                <th className="sticky left-0 z-20 border-b bg-background px-3 py-3 text-left align-top text-xs font-semibold text-muted-foreground">
                  <p>{row.startTime} - {row.endTime}</p>
                  {nonTeaching ? (
                    <Badge variant="secondary" className="mt-1 text-[10px]">
                      {(row.label || row.tag).toUpperCase()}
                    </Badge>
                  ) : null}
                </th>
                {days.map((day) => {
                  const key = cellKey(day, row);
                  const entries = cellEntries[key] ?? [];
                  const canDrop = interactive && !nonTeaching && Boolean(onMoveSlot);
                  const isDropTarget = activeDropCellKey === key && draggingSlotId !== null;
                  const dropTargetClass = canDrop
                    ? `transition-colors hover:bg-primary/5 ${isDropTarget ? "bg-primary/10 ring-1 ring-primary/50" : ""}`
                    : "";

                  return (
                    <td
                      key={key}
                      className={`border-b px-2 py-2 align-top ${dropTargetClass}`}
                      onDragOver={(event) => {
                        if (!canDrop) {
                          return;
                        }
                        event.preventDefault();
                        if (activeDropCellKey !== key) {
                          setActiveDropCellKey(key);
                        }
                      }}
                      onDragLeave={() => {
                        if (activeDropCellKey === key) {
                          setActiveDropCellKey(null);
                        }
                      }}
                      onDrop={(event) => {
                        if (!canDrop || !onMoveSlot) {
                          return;
                        }
                        event.preventDefault();
                        const slotId = event.dataTransfer.getData("text/plain");
                        if (!slotId) {
                          return;
                        }
                        setDraggingSlotId(null);
                        setActiveDropCellKey(null);
                        onMoveSlot({
                          slotId,
                          targetDay: day,
                          targetStartTime: row.startTime,
                          targetEndTime: row.endTime,
                          dropClientX: event.clientX,
                          dropClientY: event.clientY,
                        });
                      }}
                    >
                      {nonTeaching ? (
                        <div className={`min-h-[74px] rounded-md border px-2 py-2 ${rowTagClass(row.tag)}`}>
                          <p className="text-xs font-semibold">{row.label || row.tag.toUpperCase()}</p>
                          {entries.length ? (
                            <p className="mt-1 text-[11px] opacity-90">
                              {entries.length} class{entries.length > 1 ? "es" : ""} currently scheduled here.
                            </p>
                          ) : (
                            <p className="mt-1 text-[11px] opacity-80">Reserved non-teaching slot.</p>
                          )}
                        </div>
                      ) : entries.length ? (
                        <div className="space-y-2">
                          {entries.map((entry) => {
                            const isDragging = draggingSlotId === entry.slot.id;
                            return (
                              <div
                                key={entry.slot.id}
                                draggable={interactive}
                                onDragStart={(event) => {
                                  if (!interactive) {
                                    return;
                                  }
                                  setDraggingSlotId(entry.slot.id);
                                  setActiveDropCellKey(null);
                                  event.dataTransfer.setData("text/plain", entry.slot.id);
                                  event.dataTransfer.effectAllowed = "move";
                                }}
                                onDragEnd={() => {
                                  setDraggingSlotId(null);
                                  setActiveDropCellKey(null);
                                }}
                                className={`min-h-[74px] cursor-${interactive ? "grab" : "default"} rounded-md border px-2 py-2 ${
                                  isDragging ? "scale-[0.99] opacity-45 shadow-sm" : ""
                                } ${slotClass(entry.course?.type, entry.slot.sessionType)}`}
                              >
                                <p className="text-xs font-semibold">
                                  {entry.course?.code ?? entry.slot.courseId}
                                  {sessionSuffix(entry.slot.sessionType)}
                                </p>
                                <p className="text-xs">
                                  {entry.slot.section}
                                  {entry.slot.batch ? ` • Batch ${entry.slot.batch}` : ""}
                                </p>
                                <p className="text-[11px] opacity-85">
                                  {entry.faculty?.name ?? entry.slot.facultyId}
                                </p>
                                <p className="text-[11px] opacity-85">
                                  {entry.room?.name ?? entry.slot.roomId}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="min-h-[74px] rounded-md border border-dashed border-muted/40 bg-muted/10" />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
