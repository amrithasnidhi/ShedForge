import { useCallback, useEffect, useState } from "react";

import { fetchOfficialTimetable, type OfficialTimetablePayload } from "@/lib/timetable-api";

const emptyPayload: OfficialTimetablePayload = {
  termNumber: undefined,
  timetableData: [],
  courseData: [],
  roomData: [],
  facultyData: [],
};

export function useOfficialTimetable() {
  const [data, setData] = useState<OfficialTimetablePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await fetchOfficialTimetable();
      setData(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load timetable";
      setError(message);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data: data ?? emptyPayload,
    hasOfficial: Boolean(data),
    isLoading,
    error,
    refresh,
  };
}
