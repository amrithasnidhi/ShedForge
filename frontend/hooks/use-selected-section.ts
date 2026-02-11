"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "shedforge:selected-section";

export function useSelectedSection(availableSections: string[]) {
  const sectionOptions = useMemo(() => {
    const unique = Array.from(new Set(availableSections.map((item) => item.trim()).filter(Boolean)));
    return unique.sort((left, right) => left.localeCompare(right));
  }, [availableSections]);

  const [selectedSection, setSelectedSection] = useState("");

  useEffect(() => {
    if (!sectionOptions.length) {
      setSelectedSection("");
      return;
    }

    setSelectedSection((current) => {
      if (current && sectionOptions.includes(current)) {
        return current;
      }

      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && sectionOptions.includes(stored)) {
          return stored;
        }
      }

      return sectionOptions[0];
    });
  }, [sectionOptions]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (selectedSection) {
      localStorage.setItem(STORAGE_KEY, selectedSection);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [selectedSection]);

  return {
    selectedSection,
    setSelectedSection,
    sectionOptions,
  };
}
