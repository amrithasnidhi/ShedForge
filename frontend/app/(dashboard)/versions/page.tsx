"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  WeeklyTimetableGrid,
  type WeeklyGridResolvedSlot,
  type WeeklyGridRow,
} from "@/components/timetable/weekly-timetable-grid";
import {
  compareTimetableVersions,
  fetchTimetableTrends,
  fetchTimetableVersionPayload,
  listTimetableVersions,
  type OfficialTimetablePayload,
  type TimetableTrendPoint,
  type TimetableVersion,
  type TimetableVersionCompare,
} from "@/lib/timetable-api";
import type { Course, Faculty, Room, TimeSlot } from "@/lib/timetable-types";
import { parseTimeToMinutes } from "@/lib/schedule-template";

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type FilterKind = "semester-section" | "faculty" | "room";

interface SemesterSectionOption {
  key: string;
  semester: number | null;
  section: string;
  label: string;
}

function toUiError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "Cannot reach backend API. Start backend and verify NEXT_PUBLIC_API_BASE_URL.";
    }
    return error.message;
  }
  return "Unexpected request failure.";
}

function buildSemesterSectionOptions(payloads: OfficialTimetablePayload[]): SemesterSectionOption[] {
  const output = new Map<string, SemesterSectionOption>();

  for (const payload of payloads) {
    const courseById = new Map(payload.courseData.map((item) => [item.id, item]));
    for (const slot of payload.timetableData) {
      const course = courseById.get(slot.courseId);
      const semester = typeof course?.semesterNumber === "number" ? course.semesterNumber : (payload.termNumber ?? null);
      const section = (slot.section || "Unassigned").trim() || "Unassigned";
      const key = `${semester ?? "unknown"}|${section.toUpperCase()}`;
      if (!output.has(key)) {
        output.set(key, {
          key,
          semester,
          section,
          label: `${semester ? `Semester ${semester}` : "Semester ?"} • Section ${section}`,
        });
      }
    }
  }

  return Array.from(output.values()).sort((left, right) => {
    const leftSemester = left.semester ?? Number.MAX_SAFE_INTEGER;
    const rightSemester = right.semester ?? Number.MAX_SAFE_INTEGER;
    if (leftSemester !== rightSemester) {
      return leftSemester - rightSemester;
    }
    return left.section.localeCompare(right.section, undefined, { numeric: true, sensitivity: "base" });
  });
}

function filterSlotsByKind(
  slots: TimeSlot[],
  filterKind: FilterKind,
  selectedSemesterSection: string,
  selectedFacultyId: string,
  selectedRoomId: string,
  payload: OfficialTimetablePayload,
): TimeSlot[] {
  if (filterKind === "faculty") {
    if (!selectedFacultyId) {
      return [];
    }
    return slots.filter((slot) => slot.facultyId === selectedFacultyId || (slot.assistantFacultyIds ?? []).includes(selectedFacultyId));
  }

  if (filterKind === "room") {
    if (!selectedRoomId) {
      return [];
    }
    return slots.filter((slot) => slot.roomId === selectedRoomId);
  }

  if (!selectedSemesterSection) {
    return [];
  }

  const [semesterRaw, sectionRaw] = selectedSemesterSection.split("|");
  const semesterFilter = semesterRaw && semesterRaw !== "unknown" ? Number(semesterRaw) : null;
  const sectionFilter = sectionRaw ?? "";
  const courseById = new Map(payload.courseData.map((item) => [item.id, item]));

  return slots.filter((slot) => {
    if (sectionFilter && slot.section.toUpperCase() !== sectionFilter.toUpperCase()) {
      return false;
    }
    if (semesterFilter === null) {
      return true;
    }
    const course = courseById.get(slot.courseId);
    const slotSemester = typeof course?.semesterNumber === "number" ? course.semesterNumber : payload.termNumber ?? null;
    return slotSemester === semesterFilter;
  });
}

function buildRows(leftSlots: TimeSlot[], rightSlots: TimeSlot[]): WeeklyGridRow[] {
  const rows = new Map<string, WeeklyGridRow>();
  for (const slot of [...leftSlots, ...rightSlots]) {
    const key = `${slot.startTime}|${slot.endTime}`;
    if (!rows.has(key)) {
      rows.set(key, {
        startTime: slot.startTime,
        endTime: slot.endTime,
        tag: "teaching",
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

function buildCellEntries(
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
      return leftCode.localeCompare(rightCode);
    });
  }

  return output;
}

function slotReadableKey(slot: TimeSlot, payload: OfficialTimetablePayload): string {
  const courseById = new Map(payload.courseData.map((item) => [item.id, item]));
  const roomById = new Map(payload.roomData.map((item) => [item.id, item]));
  const facultyById = new Map(payload.facultyData.map((item) => [item.id, item]));

  const course = courseById.get(slot.courseId);
  const room = roomById.get(slot.roomId);
  const faculty = facultyById.get(slot.facultyId);

  return [
    `${course?.code ?? slot.courseId}`,
    `${slot.section}${slot.batch ? `-${slot.batch}` : ""}`,
    `${slot.day} ${slot.startTime}-${slot.endTime}`,
    `${room?.name ?? slot.roomId}`,
    `${faculty?.name ?? slot.facultyId}`,
  ].join(" • ");
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function describeChange(compare: TimetableVersionCompare | null): string {
  if (!compare) {
    return "Select two versions to view summary.";
  }
  if (compare.added_slots === 0 && compare.removed_slots === 0 && compare.changed_slots === 0) {
    return "No meaningful difference was detected between these two versions.";
  }
  return "The summary below shows how many classes were added, removed, or modified between the selected versions.";
}

export default function VersionsPage() {
  const [versions, setVersions] = useState<TimetableVersion[]>([]);
  const [trends, setTrends] = useState<TimetableTrendPoint[]>([]);

  const [leftVersionId, setLeftVersionId] = useState("");
  const [rightVersionId, setRightVersionId] = useState("");

  const [leftPayload, setLeftPayload] = useState<OfficialTimetablePayload | null>(null);
  const [rightPayload, setRightPayload] = useState<OfficialTimetablePayload | null>(null);
  const [compareResult, setCompareResult] = useState<TimetableVersionCompare | null>(null);

  const [filterKind, setFilterKind] = useState<FilterKind>("semester-section");
  const [selectedSemesterSection, setSelectedSemesterSection] = useState("");
  const [selectedFacultyId, setSelectedFacultyId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPayloads, setIsLoadingPayloads] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([listTimetableVersions(), fetchTimetableTrends()])
      .then(([versionData, trendData]) => {
        setVersions(versionData);
        setTrends(trendData);
        if (versionData.length > 1) {
          setRightVersionId(versionData[0].id);
          setLeftVersionId(versionData[1].id);
        } else if (versionData.length === 1) {
          setRightVersionId(versionData[0].id);
          setLeftVersionId(versionData[0].id);
        }
        setError(null);
      })
      .catch((err) => setError(toUiError(err)))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!leftVersionId || !rightVersionId) {
      setLeftPayload(null);
      setRightPayload(null);
      setCompareResult(null);
      return;
    }

    setIsLoadingPayloads(true);
    Promise.all([
      fetchTimetableVersionPayload(leftVersionId),
      fetchTimetableVersionPayload(rightVersionId),
      compareTimetableVersions(leftVersionId, rightVersionId),
    ])
      .then(([left, right, compare]) => {
        setLeftPayload(left);
        setRightPayload(right);
        setCompareResult(compare);
        setError(null);
      })
      .catch((err) => setError(toUiError(err)))
      .finally(() => setIsLoadingPayloads(false));
  }, [leftVersionId, rightVersionId]);

  const leftVersion = useMemo(
    () => versions.find((version) => version.id === leftVersionId) ?? null,
    [leftVersionId, versions],
  );

  const rightVersion = useMemo(
    () => versions.find((version) => version.id === rightVersionId) ?? null,
    [rightVersionId, versions],
  );

  const combinedPayloads = useMemo(() => {
    const payloads: OfficialTimetablePayload[] = [];
    if (leftPayload) payloads.push(leftPayload);
    if (rightPayload) payloads.push(rightPayload);
    return payloads;
  }, [leftPayload, rightPayload]);

  const semesterSectionOptions = useMemo(
    () => buildSemesterSectionOptions(combinedPayloads),
    [combinedPayloads],
  );

  useEffect(() => {
    if (!semesterSectionOptions.length) {
      setSelectedSemesterSection("");
      return;
    }
    if (!semesterSectionOptions.some((item) => item.key === selectedSemesterSection)) {
      setSelectedSemesterSection(semesterSectionOptions[0].key);
    }
  }, [selectedSemesterSection, semesterSectionOptions]);

  const facultyOptions = useMemo(() => {
    const map = new Map<string, Faculty>();
    for (const payload of combinedPayloads) {
      for (const item of payload.facultyData) {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [combinedPayloads]);

  useEffect(() => {
    if (!facultyOptions.length) {
      setSelectedFacultyId("");
      return;
    }
    if (!facultyOptions.some((item) => item.id === selectedFacultyId)) {
      setSelectedFacultyId(facultyOptions[0].id);
    }
  }, [facultyOptions, selectedFacultyId]);

  const roomOptions = useMemo(() => {
    const map = new Map<string, Room>();
    for (const payload of combinedPayloads) {
      for (const item of payload.roomData) {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [combinedPayloads]);

  useEffect(() => {
    if (!roomOptions.length) {
      setSelectedRoomId("");
      return;
    }
    if (!roomOptions.some((item) => item.id === selectedRoomId)) {
      setSelectedRoomId(roomOptions[0].id);
    }
  }, [roomOptions, selectedRoomId]);

  const leftFilteredSlots = useMemo(() => {
    if (!leftPayload) return [] as TimeSlot[];
    return filterSlotsByKind(
      leftPayload.timetableData,
      filterKind,
      selectedSemesterSection,
      selectedFacultyId,
      selectedRoomId,
      leftPayload,
    );
  }, [filterKind, leftPayload, selectedFacultyId, selectedRoomId, selectedSemesterSection]);

  const rightFilteredSlots = useMemo(() => {
    if (!rightPayload) return [] as TimeSlot[];
    return filterSlotsByKind(
      rightPayload.timetableData,
      filterKind,
      selectedSemesterSection,
      selectedFacultyId,
      selectedRoomId,
      rightPayload,
    );
  }, [filterKind, rightPayload, selectedFacultyId, selectedRoomId, selectedSemesterSection]);

  const days = useMemo(() => {
    const set = new Set<string>([
      ...leftFilteredSlots.map((slot) => slot.day),
      ...rightFilteredSlots.map((slot) => slot.day),
    ]);
    const ordered = DAY_ORDER.filter((day) => set.has(day));
    return ordered.length ? ordered : DAY_ORDER.slice(0, 5);
  }, [leftFilteredSlots, rightFilteredSlots]);

  const rows = useMemo(() => buildRows(leftFilteredSlots, rightFilteredSlots), [leftFilteredSlots, rightFilteredSlots]);

  const leftCourseById = useMemo(() => new Map((leftPayload?.courseData ?? []).map((item) => [item.id, item])), [leftPayload?.courseData]);
  const leftFacultyById = useMemo(() => new Map((leftPayload?.facultyData ?? []).map((item) => [item.id, item])), [leftPayload?.facultyData]);
  const leftRoomById = useMemo(() => new Map((leftPayload?.roomData ?? []).map((item) => [item.id, item])), [leftPayload?.roomData]);

  const rightCourseById = useMemo(() => new Map((rightPayload?.courseData ?? []).map((item) => [item.id, item])), [rightPayload?.courseData]);
  const rightFacultyById = useMemo(() => new Map((rightPayload?.facultyData ?? []).map((item) => [item.id, item])), [rightPayload?.facultyData]);
  const rightRoomById = useMemo(() => new Map((rightPayload?.roomData ?? []).map((item) => [item.id, item])), [rightPayload?.roomData]);

  const leftCellEntries = useMemo(
    () => buildCellEntries(leftFilteredSlots, leftCourseById, leftFacultyById, leftRoomById),
    [leftCourseById, leftFacultyById, leftFilteredSlots, leftRoomById],
  );

  const rightCellEntries = useMemo(
    () => buildCellEntries(rightFilteredSlots, rightCourseById, rightFacultyById, rightRoomById),
    [rightCourseById, rightFacultyById, rightFilteredSlots, rightRoomById],
  );

  const selectedFilterLabel = useMemo(() => {
    if (filterKind === "semester-section") {
      return semesterSectionOptions.find((item) => item.key === selectedSemesterSection)?.label ?? "No class selected";
    }
    if (filterKind === "faculty") {
      return facultyOptions.find((item) => item.id === selectedFacultyId)?.name ?? "No faculty selected";
    }
    return roomOptions.find((item) => item.id === selectedRoomId)?.name ?? "No room selected";
  }, [facultyOptions, filterKind, roomOptions, selectedFacultyId, selectedRoomId, selectedSemesterSection, semesterSectionOptions]);

  const diffDetails = useMemo(() => {
    if (!leftPayload || !rightPayload) {
      return { added: [] as string[], removed: [] as string[] };
    }

    const leftSet = new Set(leftFilteredSlots.map((slot) => slotReadableKey(slot, leftPayload)));
    const rightSet = new Set(rightFilteredSlots.map((slot) => slotReadableKey(slot, rightPayload)));

    const added = [...rightSet].filter((item) => !leftSet.has(item)).sort((a, b) => a.localeCompare(b));
    const removed = [...leftSet].filter((item) => !rightSet.has(item)).sort((a, b) => a.localeCompare(b));

    return { added, removed };
  }, [leftFilteredSlots, leftPayload, rightFilteredSlots, rightPayload]);

  const trendSummary = useMemo(() => {
    if (!trends.length) {
      return "No trend history is available yet.";
    }
    const sorted = [...trends].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const latest = sorted[sorted.length - 1];
    const first = sorted[0];
    const satisfactionDelta = latest.constraint_satisfaction - first.constraint_satisfaction;
    const conflictDelta = latest.conflicts_detected - first.conflicts_detected;
    return `Since ${formatDate(first.created_at)}, satisfaction changed by ${satisfactionDelta.toFixed(1)} points and conflicts changed by ${conflictDelta}.`;
  }, [trends]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">Loading versions workspace...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Versions Workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare two timetable versions side by side with one shared filter.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowLeftRight className="h-5 w-5" />
            Compare Setup
          </CardTitle>
          <CardDescription>
            Pick the left version, the right version, and one filter. The same filter applies to both grids.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Left Version</Label>
              <Select value={leftVersionId} onValueChange={setLeftVersionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select left version" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((version) => (
                    <SelectItem key={version.id} value={version.id}>{version.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Right Version</Label>
              <Select value={rightVersionId} onValueChange={setRightVersionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select right version" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((version) => (
                    <SelectItem key={version.id} value={version.id}>{version.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <div className="space-y-2">
              <Label>Filter Type</Label>
              <Select value={filterKind} onValueChange={(value) => setFilterKind(value as FilterKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semester-section">Semester-Section</SelectItem>
                  <SelectItem value="faculty">Faculty</SelectItem>
                  <SelectItem value="room">Room</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{filterKind === "semester-section" ? "Semester-Section" : filterKind === "faculty" ? "Faculty" : "Room"}</Label>
              {filterKind === "semester-section" ? (
                <Select value={selectedSemesterSection} onValueChange={setSelectedSemesterSection}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select semester-section" />
                  </SelectTrigger>
                  <SelectContent>
                    {semesterSectionOptions.map((option) => (
                      <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {filterKind === "faculty" ? (
                <Select value={selectedFacultyId} onValueChange={setSelectedFacultyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select faculty" />
                  </SelectTrigger>
                  <SelectContent>
                    {facultyOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {filterKind === "room" ? (
                <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select room" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">Filter: {selectedFilterLabel}</Badge>
            <Badge variant="outline">Left slots in view: {leftFilteredSlots.length}</Badge>
            <Badge variant="outline">Right slots in view: {rightFilteredSlots.length}</Badge>
            <Button variant="outline" size="sm" onClick={() => {
              if (!leftVersionId || !rightVersionId) return;
              setIsLoadingPayloads(true);
              Promise.all([
                fetchTimetableVersionPayload(leftVersionId),
                fetchTimetableVersionPayload(rightVersionId),
                compareTimetableVersions(leftVersionId, rightVersionId),
              ]).then(([left, right, compare]) => {
                setLeftPayload(left);
                setRightPayload(right);
                setCompareResult(compare);
                setError(null);
              }).catch((err) => setError(toUiError(err))).finally(() => setIsLoadingPayloads(false));
            }}>
              {isLoadingPayloads ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh Comparison
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Clear Summary</CardTitle>
          <CardDescription>{describeChange(compareResult)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <p className="text-xs uppercase text-muted-foreground">Added Classes</p>
            <p className="mt-1 text-2xl font-semibold">{compareResult?.added_slots ?? 0}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs uppercase text-muted-foreground">Removed Classes</p>
            <p className="mt-1 text-2xl font-semibold">{compareResult?.removed_slots ?? 0}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs uppercase text-muted-foreground">Modified Classes</p>
            <p className="mt-1 text-2xl font-semibold">{compareResult?.changed_slots ?? 0}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Left: {leftVersion?.label ?? "Not selected"}</CardTitle>
            <CardDescription>{leftVersion?.created_at ? formatDate(leftVersion.created_at) : "-"}</CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyTimetableGrid
              days={days}
              rows={rows}
              cellEntries={leftCellEntries}
              emptyMessage="No timetable slots for this filter in the left version."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Right: {rightVersion?.label ?? "Not selected"}</CardTitle>
            <CardDescription>{rightVersion?.created_at ? formatDate(rightVersion.created_at) : "-"}</CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyTimetableGrid
              days={days}
              rows={rows}
              cellEntries={rightCellEntries}
              emptyMessage="No timetable slots for this filter in the right version."
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New in Right Version</CardTitle>
            <CardDescription>Classes that appear on the right side but not on the left side for this filter</CardDescription>
          </CardHeader>
          <CardContent>
            {diffDetails.added.length ? (
              <div className="max-h-72 space-y-2 overflow-y-auto text-sm">
                {diffDetails.added.slice(0, 30).map((item, index) => (
                  <div key={`added-${index}`} className="rounded-md border p-2">{item}</div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No added classes in this filtered view.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Missing from Right Version</CardTitle>
            <CardDescription>Classes that exist on the left side but do not appear on the right side for this filter</CardDescription>
          </CardHeader>
          <CardContent>
            {diffDetails.removed.length ? (
              <div className="max-h-72 space-y-2 overflow-y-auto text-sm">
                {diffDetails.removed.slice(0, 30).map((item, index) => (
                  <div key={`removed-${index}`} className="rounded-md border p-2">{item}</div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No removed classes in this filtered view.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Version Trend (Simple View)</CardTitle>
          <CardDescription>{trendSummary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {trends.length ? (
            <div className="space-y-2">
              {[...trends]
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 12)
                .map((point) => (
                  <div key={point.version_id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="font-medium">{point.label}</p>
                      <p className="text-muted-foreground">{formatDate(point.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p>Satisfaction: {point.constraint_satisfaction.toFixed(1)}%</p>
                      <p>Conflicts: {point.conflicts_detected}</p>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No trend data available yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
