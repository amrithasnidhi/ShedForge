"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  compareTimetableVersions,
  fetchTimetableTrends,
  listTimetableVersions,
  type TimetableTrendPoint,
  type TimetableVersion,
  type TimetableVersionCompare,
} from "@/lib/timetable-api";

export default function VersionsPage() {
  const [versions, setVersions] = useState<TimetableVersion[]>([]);
  const [trends, setTrends] = useState<TimetableTrendPoint[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [compareResult, setCompareResult] = useState<TimetableVersionCompare | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listTimetableVersions(), fetchTimetableTrends()])
      .then(([versionData, trendData]) => {
        setVersions(versionData);
        setTrends(trendData);
        if (versionData.length > 1) {
          setToId(versionData[0].id);
          setFromId(versionData[1].id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load version data"));
  }, []);

  const latest = useMemo(() => versions[0], [versions]);

  const handleCompare = async () => {
    if (!fromId || !toId) {
      return;
    }
    try {
      const result = await compareTimetableVersions(fromId, toId);
      setCompareResult(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to compare versions");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Timetable Versions</h1>
        <p className="text-sm text-muted-foreground">Version labels, comparison, and trend checkpoints.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Latest Published Version</CardTitle>
          <CardDescription>Current official version metadata</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="font-medium">Label:</span> {latest?.label ?? ""}</p>
          <p><span className="font-medium">Created:</span> {latest?.created_at ? new Date(latest.created_at).toLocaleString() : ""}</p>
          <p><span className="font-medium">Summary:</span> {latest ? JSON.stringify(latest.summary) : ""}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compare Versions</CardTitle>
          <CardDescription>Analyze changes between two published versions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid items-end gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">From</label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger>
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                  {versions.map((version) => (
                    <SelectItem key={version.id} value={version.id}>{version.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">To</label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger>
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                  {versions.map((version) => (
                    <SelectItem key={version.id} value={version.id}>{version.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => void handleCompare()} disabled={!fromId || !toId}>Compare</Button>
          </div>

          {compareResult ? (
            <div className="grid gap-3 rounded-md border p-4 text-sm sm:grid-cols-3">
              <p><span className="font-medium">Added Slots:</span> {compareResult.added_slots}</p>
              <p><span className="font-medium">Removed Slots:</span> {compareResult.removed_slots}</p>
              <p><span className="font-medium">Changed Slots:</span> {compareResult.changed_slots}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Trend Checkpoints</CardTitle>
          <CardDescription>Historical quality trend from version history</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {trends.map((point) => (
            <div key={point.version_id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">{point.label}</p>
                <p className="text-muted-foreground">{new Date(point.created_at).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p>Satisfaction: {point.constraint_satisfaction.toFixed(1)}%</p>
                <p>Conflicts: {point.conflicts_detected}</p>
              </div>
            </div>
          ))}
          {!trends.length ? <p className="text-muted-foreground">No trend data available yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
