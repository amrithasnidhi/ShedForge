"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  RefreshCw,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  analyzeTimetableConflicts,
  decideTimetableConflict,
  fetchTimetableConflicts,
} from "@/lib/timetable-api";
import type { Conflict } from "@/lib/timetable-types";
import { loadGeneratedDraft, type GeneratedDraftSnapshot } from "@/lib/generated-draft-store";

function getSeverityBadge(severity: Conflict["severity"]) {
  switch (severity) {
    case "hard":
      return (
        <Badge variant="outline" className="text-destructive border-destructive">
          Hard
        </Badge>
      );
    case "soft":
      return (
        <Badge variant="outline" className="text-warning border-warning">
          Soft
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground border-muted-foreground">
          Info
        </Badge>
      );
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case "faculty-overlap":
    case "faculty_conflict":
      return <Users className="h-4 w-4" />;
    case "room-overlap":
    case "room_conflict":
    case "capacity":
    case "room_capacity":
    case "room_type":
      return <Building className="h-4 w-4" />;
    case "section-overlap":
    case "elective-overlap":
    case "course-faculty-inconsistency":
    case "section_conflict":
      return <Users className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case "faculty-overlap":
    case "faculty_conflict":
      return "Faculty Overlap";
    case "room-overlap":
    case "room_conflict":
      return "Room Overlap";
    case "capacity":
    case "room_capacity":
      return "Room Capacity";
    case "availability":
    case "faculty_availability":
      return "Availability Constraint";
    case "room_type":
      return "Room Type Mismatch";
    case "section-overlap":
    case "section_conflict":
      return "Section Overlap";
    case "elective-overlap":
      return "Elective Overlap";
    case "course-faculty-inconsistency":
      return "Faculty Assignment Mismatch";
    default:
      return type.replace(/_/g, " ").replace(/-/g, " ");
  }
}

export default function ConflictsPage() {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [expandedConflicts, setExpandedConflicts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [decisionBusyId, setDecisionBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [draftSnapshot, setDraftSnapshot] = useState<GeneratedDraftSnapshot | null>(null);
  const [source, setSource] = useState<"official" | "draft">("official");

  const loadConflicts = async (sourceOverride?: "official" | "draft") => {
    const effectiveSource = sourceOverride ?? source;
    setIsLoading(true);
    setError(null);
    try {
      if (effectiveSource === "draft") {
        const stored = loadGeneratedDraft();
        if (!stored || !stored.payload?.timetableData?.length) {
          setDraftSnapshot(null);
          setConflicts([]);
          setError("No generated draft is available. Generate a timetable first or switch to official conflicts.");
          return;
        }
        setDraftSnapshot(stored);
        const report = await analyzeTimetableConflicts(stored.payload);
        setConflicts(report.conflicts);
      } else {
        const report = await fetchTimetableConflicts();
        setConflicts(report.conflicts);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load conflicts";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial load
    void loadConflicts("official");
  }, []);

  const toggleExpanded = (id: string) => {
    setExpandedConflicts((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleConflictDecision = async (conflictId: string, decision: "yes" | "no") => {
    if (source === "draft") {
      setActionMessage("Conflict decisions are available only for official mode. Publish the draft first.");
      return;
    }

    setDecisionBusyId(conflictId);
    setActionMessage(null);
    setError(null);

    try {
      const result = await decideTimetableConflict(conflictId, decision);
      setActionMessage(result.message);
      const refreshed = await fetchTimetableConflicts();
      setConflicts(refreshed.conflicts);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to apply resolution";
      setError(message);
    } finally {
      setDecisionBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Conflict Resolution</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {source === "draft"
              ? "Live conflict analysis from the saved generated draft"
              : "Live conflict analysis from the official timetable"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={source === "draft" ? "default" : "outline"}
            onClick={() => {
              setSource("draft");
              void loadConflicts("draft");
            }}
          >
            Generated Draft
          </Button>
          <Button
            variant={source === "official" ? "default" : "outline"}
            onClick={() => {
              setSource("official");
              void loadConflicts("official");
            }}
          >
            Official
          </Button>
          <Button variant="outline" onClick={() => void loadConflicts(source)} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-3xl font-semibold">{conflicts.length}</p>
                <p className="text-sm text-muted-foreground">Total Conflicts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Placeholder stats */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
                <AlertTriangle className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-3xl font-semibold">{conflicts.filter(c => c.severity === 'hard').length}</p>
                <p className="text-sm text-muted-foreground">Hard Conflicts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                <CheckCircle2 className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-3xl font-semibold">
                  {conflicts.length === 0 ? "100%" : "0%"}
                </p>
                <p className="text-sm text-muted-foreground">Compliance</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {actionMessage ? (
        <Card>
          <CardContent className="py-4 text-sm text-foreground bg-muted/20">{actionMessage}</CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Analyzing timetable conflicts...</CardContent>
        </Card>
      ) : null}

      {!isLoading && conflicts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              No Conflicts Detected
            </CardTitle>
            <CardDescription>
              The timetable adheres to all hard constraints.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {conflicts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Detailed Conflict Report
            </CardTitle>
            <CardDescription>
              Review conflicts and select available resolutions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {conflicts.map((conflict) => {
                return (
                  <Collapsible
                    key={conflict.id}
                    open={expandedConflicts.includes(conflict.id)}
                    onOpenChange={() => toggleExpanded(conflict.id)}
                  >
                    <div className="border rounded-lg">
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                              {getTypeIcon(conflict.conflict_type)}
                            </div>
                            <div className="text-left">
                              <p className="font-medium">{getTypeLabel(conflict.conflict_type)}</p>
                              <p className="text-sm text-muted-foreground line-clamp-1">{conflict.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {getSeverityBadge(conflict.severity)}
                            {conflict.resolved ? (
                              <Badge variant="outline" className="text-emerald-600 border-emerald-600">
                                Resolved
                              </Badge>
                            ) : null}
                            {expandedConflicts.includes(conflict.id) ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t px-4 py-4 bg-muted/20 space-y-4">
                          <div>
                            <p className="text-sm font-medium text-foreground mb-1">Issue Description</p>
                            <p className="text-sm text-muted-foreground">{conflict.description}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground mb-1">Affected Slots</p>
                            <div className="flex gap-2 flex-wrap">
                              {conflict.affected_slots.map((slot) => (
                                <Badge key={slot} variant="secondary" className="font-mono text-xs">
                                  {slot}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div>
                            <p className="text-sm font-medium text-foreground mb-1">Recommended Fix</p>
                            <p className="text-sm text-muted-foreground">
                              {conflict.resolution ?? "No automatic recommendation available. Resolve manually."}
                            </p>
                          </div>
                          {source === "official" ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                onClick={() => void handleConflictDecision(conflict.id, "yes")}
                                disabled={decisionBusyId === conflict.id}
                              >
                                Yes, Apply Recommendation
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleConflictDecision(conflict.id, "no")}
                                disabled={decisionBusyId === conflict.id}
                              >
                                No, Keep Current
                              </Button>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              Draft mode is read-only. Publish draft and switch to official mode to apply Yes/No decisions.
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
