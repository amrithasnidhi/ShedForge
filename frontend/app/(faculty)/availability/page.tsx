"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save } from "lucide-react";
import { getMyFacultyProfile, updateFaculty, type Faculty } from "@/lib/academic-api";
import { useAuth } from "@/components/auth-provider";

export default function AvailabilityPage() {
  const { user } = useAuth();
  const [facultyRecord, setFacultyRecord] = useState<Faculty | null>(null);
  const [preferredDays, setPreferredDays] = useState<string[]>([]);
  const [maxHours, setMaxHours] = useState([18]);
  const [preferredTimeStart, setPreferredTimeStart] = useState("08:50");
  const [preferredTimeEnd, setPreferredTimeEnd] = useState("16:35");
  const [avoidBackToBack, setAvoidBackToBack] = useState(false);
  const [minBreakMinutes, setMinBreakMinutes] = useState(0);
  const [notes, setNotes] = useState("");
  const [preferredSubjectsInput, setPreferredSubjectsInput] = useState("");
  const [semesterPreferences, setSemesterPreferences] = useState<Record<string, string[]>>({});
  const [activeSemester, setActiveSemester] = useState("1");
  const [activeSemesterSubjectsInput, setActiveSemesterSubjectsInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const timeOptions = [
    "08:50",
    "09:40",
    "10:45",
    "11:35",
    "13:15",
    "14:05",
    "14:55",
    "15:45",
    "16:35",
  ];
  const semesterOptions = ["1", "2", "3", "4", "5", "6", "7", "8"];

  useEffect(() => {
    let isActive = true;
    getMyFacultyProfile()
      .then((matched) => {
        if (!isActive) return;
        setFacultyRecord(matched);
        if (matched) {
          setPreferredDays(matched.availability.length ? matched.availability : days);
          setMaxHours([matched.max_hours]);
          setAvoidBackToBack(matched.avoid_back_to_back);
          setMinBreakMinutes(matched.preferred_min_break_minutes);
          setNotes(matched.preference_notes ?? "");
          setPreferredSubjectsInput((matched.preferred_subject_codes ?? []).join(", "));
          const loadedSemesterPreferences = matched.semester_preferences ?? {};
          setSemesterPreferences(loadedSemesterPreferences);
          const selectedSemesterCodes = loadedSemesterPreferences[activeSemester] ?? [];
          setActiveSemesterSubjectsInput(selectedSemesterCodes.join(", "));
          const firstWindow = matched.availability_windows[0];
          if (firstWindow) {
            setPreferredTimeStart(firstWindow.start_time);
            setPreferredTimeEnd(firstWindow.end_time);
          }
        }
      })
      .catch((err) => {
        if (!isActive) return;
        const detail = err instanceof Error ? err.message : "Unable to load your availability";
        setError(detail);
        setFacultyRecord(null);
      })
      .finally(() => {
        if (!isActive) return;
        setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [user?.email]);

  useEffect(() => {
    const selectedSemesterCodes = semesterPreferences[activeSemester] ?? [];
    setActiveSemesterSubjectsInput(selectedSemesterCodes.join(", "));
  }, [activeSemester, semesterPreferences]);

  const toggleDay = (day: string) => {
    setPreferredDays((prev) => (prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]));
  };

  const availabilityWindows = useMemo(() => {
    return preferredDays.map((day) => ({
      day,
      start_time: preferredTimeStart,
      end_time: preferredTimeEnd,
    }));
  }, [preferredDays, preferredTimeEnd, preferredTimeStart]);

  const handleSave = async () => {
    if (!facultyRecord) {
      setError("No faculty profile linked to your account. Ask admin to map your email in Faculty Management.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateFaculty(facultyRecord.id, {
        availability: preferredDays,
        max_hours: maxHours[0],
        availability_windows: availabilityWindows,
        avoid_back_to_back: avoidBackToBack,
        preferred_min_break_minutes: minBreakMinutes,
        preference_notes: notes || null,
        preferred_subject_codes: preferredSubjectsInput
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        semester_preferences: {
          ...semesterPreferences,
          [activeSemester]: activeSemesterSubjectsInput
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        },
      });
      setFacultyRecord(updated);
      setPreferredSubjectsInput((updated.preferred_subject_codes ?? []).join(", "));
      setSemesterPreferences(updated.semester_preferences ?? {});
      setMessage("Availability preferences saved.");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unable to save preferences";
      setError(detail);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading availability preferences...</div>;
  }

  if (!facultyRecord) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Faculty Profile Not Linked</CardTitle>
            <CardDescription>
              Ask an administrator to map your account email in Faculty Management before saving availability preferences.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Availability & Preferences</h1>
        <p className="text-muted-foreground">Update your scheduling constraints for timetable generation.</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Preferred Teaching Days</CardTitle>
            <CardDescription>Select the days you are available to teach.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {days.map((day) => (
                <div
                  key={day}
                  className="flex items-center space-x-2 border p-4 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleDay(day)}
                >
                  <Checkbox
                    id={day}
                    checked={preferredDays.includes(day)}
                    onCheckedChange={() => toggleDay(day)}
                  />
                  <Label htmlFor={day} className="cursor-pointer font-medium">{day}</Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Workload Limit</CardTitle>
              <CardDescription>Maximum teaching hours per week.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex items-center justify-between">
                <span className="font-bold text-2xl">{maxHours[0]} hours</span>
                <span className="text-muted-foreground text-sm">/ week</span>
              </div>
              <Slider value={maxHours} onValueChange={setMaxHours} max={40} min={4} step={1} className="py-4" />
              <p className="text-xs text-muted-foreground">Configured in your faculty profile and enforced during generation.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preferred Time Window</CardTitle>
              <CardDescription>Daily teaching window used as an availability soft constraint.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Select value={preferredTimeStart} onValueChange={setPreferredTimeStart}>
                    <SelectTrigger>
                      <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.slice(0, -1).map((time) => (
                        <SelectItem key={time} value={time}>{time}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Select value={preferredTimeEnd} onValueChange={setPreferredTimeEnd}>
                    <SelectTrigger>
                      <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.slice(1).map((time) => (
                        <SelectItem key={time} value={time}>{time}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">These windows are saved as `availability_windows` and used by the optimizer.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="min-break">Preferred Min Break (minutes)</Label>
                  <Input
                    id="min-break"
                    type="number"
                    min={0}
                    max={120}
                    value={minBreakMinutes}
                    onChange={(event) => setMinBreakMinutes(Number(event.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="block">Back-to-Back Preference</Label>
                  <div className="flex items-center gap-2 border rounded-md px-3 py-2">
                    <Checkbox
                      id="avoid-back-to-back"
                      checked={avoidBackToBack}
                      onCheckedChange={(checked) => setAvoidBackToBack(Boolean(checked))}
                    />
                    <Label htmlFor="avoid-back-to-back">Avoid back-to-back sessions</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Preference Notes</CardTitle>
            <CardDescription>Personalized optimization notes used as soft guidance.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
             
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferred Subjects</CardTitle>
            <CardDescription>
              Add subject codes you prefer to teach. Separate multiple codes with commas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              value={preferredSubjectsInput}
              onChange={(event) => setPreferredSubjectsInput(event.target.value)}
             
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Semester Preferences</CardTitle>
            <CardDescription>
              Set subject preferences for specific semesters to improve timetable assignment quality.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
              <div className="space-y-2">
                <Label>Semester</Label>
                <Select value={activeSemester} onValueChange={setActiveSemester}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {semesterOptions.map((term) => (
                      <SelectItem key={term} value={term}>
                        Semester {term}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Preferred Subject Codes</Label>
                <Input
                  value={activeSemesterSubjectsInput}
                  onChange={(event) => {
                    const next = event.target.value;
                    setActiveSemesterSubjectsInput(next);
                    setSemesterPreferences((prev) => ({
                      ...prev,
                      [activeSemester]: next
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    }));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Example: `23CSE211, 23CSE312`
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-success">{message}</p> : null}

        <Card>
          <CardFooter className="flex justify-end p-6">
            <Button onClick={() => void handleSave()} disabled={isSaving || !preferredDays.length} size="lg">
              {isSaving ? (
                <>
                  <span className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Preferences
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
