import { useCallback, useEffect, useState } from "react";

import {
  fetchOfficialTimetable,
  TIMETABLE_UPDATED_EVENT,
  TIMETABLE_UPDATED_STORAGE_KEY,
  type OfficialTimetablePayload,
} from "@/lib/timetable-api";

const emptyPayload: OfficialTimetablePayload = {
  termNumber: undefined,
  timetableData: [],
  courseData: [],
  roomData: [],
  facultyData: [],
};
const POLL_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_TIMETABLE_POLL_MS ?? "30000");

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleTimetableUpdated = () => {
      void refresh();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== TIMETABLE_UPDATED_STORAGE_KEY || !event.newValue) {
        return;
      }
      void refresh();
    };

    window.addEventListener(TIMETABLE_UPDATED_EVENT, handleTimetableUpdated);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(TIMETABLE_UPDATED_EVENT, handleTimetableUpdated);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refresh]);

  useEffect(() => {
    if (!Number.isFinite(POLL_INTERVAL_MS) || POLL_INTERVAL_MS <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return {
    data: data ?? emptyPayload,
    hasOfficial: Boolean(data),
    isLoading,
    error,
    refresh,
  };
}
