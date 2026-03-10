"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  decideTimetableConflict,
  fetchOfficialTimetable,
  publishOfficialTimetable,
  resolveAllTimetableConflicts,
  reviewTimetableConflicts,
} from "@/lib/timetable-api";
import { loadGeneratedDraft, type GeneratedDraftSnapshot } from "@/lib/generated-draft-store";
import type { Conflict, OfficialTimetablePayload, TimetableConflictReview } from "@/lib/timetable-types";

type SourceMode = "official" | "draft";

function toUiError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "Cannot reach backend API. Start backend and verify NEXT_PUBLIC_API_BASE_URL.";
    }
    return error.message;
  }
  return "Unexpected request failure.";
}

function severityBadge(conflict: Conflict) {
  if (conflict.severity === "hard") {
    return (
      <Badge variant="outline" className="border-destructive text-destructive">
        Hard
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-600 text-amber-700">
      Soft
    </Badge>
  );
}

function conflictLabel(conflictType: string): string {
  return conflictType.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function ConflictCard(props: {
  conflict: Conflict;
  showActions?: boolean;
  busy?: boolean;
  onApply?: (conflictId: string) => void;
  onIgnore?: (conflictId: string) => void;
}) {
  const { conflict, showActions = false, busy = false, onApply, onIgnore } = props;
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{conflictLabel(conflict.conflict_type)}</p>
        <div className="flex items-center gap-1">
          {severityBadge(conflict)}
          {conflict.resolution_mode ? (
            <Badge variant="secondary" className="text-[10px]">
              {conflict.resolution_mode}
            </Badge>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{conflict.description || "No description provided."}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {conflict.affected_slots.length ? (
          conflict.affected_slots.slice(0, 8).map((slotId) => (
            <Badge key={slotId} variant="outline" className="font-mono text-[10px]">
              {slotId}
            </Badge>
          ))
        ) : (
          <Badge variant="outline" className="text-[10px]">
            No slot id
          </Badge>
        )}
      </div>
      {showActions ? (
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => onIgnore?.(conflict.id)} disabled={busy}>
            Ignore
          </Button>
          <Button size="sm" onClick={() => onApply?.(conflict.id)} disabled={busy}>
            {busy ? "Applying..." : "Apply Recommendation"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default function ConflictsPage() {
  const [source, setSource] = useState<SourceMode>("official");
  const [review, setReview] = useState<TimetableConflictReview | null>(null);
  const [activePayload, setActivePayload] = useState<OfficialTimetablePayload | null>(null);
  const [draftSnapshot, setDraftSnapshot] = useState<GeneratedDraftSnapshot | null>(null);
  const [draftIgnoredIds, setDraftIgnoredIds] = useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] = useState(true);
  const [decisionBusyId, setDecisionBusyId] = useState<string | null>(null);
  const [isResolveAllBusy, setIsResolveAllBusy] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishLabel, setPublishLabel] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "warn" | "info" | "error">("info");

  const loadReview = useCallback(
    async (targetSource: SourceMode, options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsLoading(true);
      }
      setError(null);
      try {
        if (targetSource === "draft") {
          const stored = loadGeneratedDraft();
          if (!stored || !stored.payload?.timetableData?.length) {
            setDraftSnapshot(null);
            setActivePayload(null);
            setReview(null);
            setDraftIgnoredIds(new Set());
            throw new Error("No generated draft found. Run the generator first and save a draft.");
          }
          setDraftSnapshot(stored);
          setActivePayload(stored.payload);
          const reviewData = await reviewTimetableConflicts(stored.payload);
          setReview(reviewData);
          return;
        }

        setDraftSnapshot(null);
        setDraftIgnoredIds(new Set());
        const [officialPayload, reviewData] = await Promise.all([
          fetchOfficialTimetable(),
          reviewTimetableConflicts(),
        ]);
        if (!officialPayload) {
          setActivePayload(null);
          setReview(reviewData);
          throw new Error("Official timetable not found. Publish or load a timetable first.");
        }
        setActivePayload(officialPayload);
        setReview(reviewData);
      } catch (err) {
        setError(toUiError(err));
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadReview(source);
  }, [loadReview, source]);

  const autoResolvedConflicts = useMemo(
    () => review?.autoResolvedConflicts ?? [],
    [review?.autoResolvedConflicts],
  );
  const manuallyResolvedConflicts = useMemo(
    () => review?.manuallyResolvedConflicts ?? [],
    [review?.manuallyResolvedConflicts],
  );

  const ignoredConflicts = useMemo(() => {
    const backendIgnored = review?.ignoredConflicts ?? [];
    if (source !== "draft" || !review) {
      return backendIgnored;
    }
    const fromDraft = (review.pendingConflicts ?? []).filter((item) => draftIgnoredIds.has(item.id));
    const map = new Map<string, Conflict>();
    for (const item of backendIgnored) {
      map.set(item.id, item);
    }
    for (const item of fromDraft) {
      map.set(item.id, { ...item, resolution_mode: "ignored", decision: "no" });
    }
    return Array.from(map.values());
  }, [draftIgnoredIds, review, source]);

  const pendingRequiredConflicts = useMemo(() => {
    const pending = review?.pendingConflicts ?? [];
    if (source !== "draft") {
      return pending;
    }
    return pending.filter((item) => !draftIgnoredIds.has(item.id));
  }, [draftIgnoredIds, review?.pendingConflicts, source]);

  const unresolvedHardCount = useMemo(
    () => pendingRequiredConflicts.filter((item) => item.severity === "hard").length,
    [pendingRequiredConflicts],
  );

  const constraintMismatches = useMemo(
    () => review?.constraintMismatches ?? [],
    [review?.constraintMismatches],
  );

  const canPublishNormally = useMemo(() => {
    if (!review) {
      return false;
    }
    return unresolvedHardCount === 0 && constraintMismatches.length === 0;
  }, [constraintMismatches.length, review, unresolvedHardCount]);

  const handleApplyRecommendation = async (conflictId: string) => {
    if (source === "draft") {
      setMessageTone("warn");
      setMessage("Apply Recommendation is available only in official mode. For draft conflicts, use Ignore or publish anyway.");
      return;
    }

    setDecisionBusyId(conflictId);
    setError(null);
    setMessage(null);
    try {
      const result = await decideTimetableConflict(conflictId, "yes", "Applied from Conflicts page.");
      setMessageTone(result.resolved ? "success" : "warn");
      setMessage(result.message);
      await loadReview("official", { silent: true });
    } catch (err) {
      setError(toUiError(err));
    } finally {
      setDecisionBusyId(null);
    }
  };

  const handleIgnoreConflict = async (conflictId: string) => {
    setError(null);
    setMessage(null);
    if (source === "draft") {
      setDraftIgnoredIds((previous) => new Set(previous).add(conflictId));
      setMessageTone("warn");
      setMessage("Conflict ignored for this draft session. Use Publish Anyway to continue.");
      return;
    }

    setDecisionBusyId(conflictId);
    try {
      const result = await decideTimetableConflict(conflictId, "no", "Ignored from Conflicts page.");
      setMessageTone("warn");
      setMessage(result.message);
      await loadReview("official", { silent: true });
    } catch (err) {
      setError(toUiError(err));
    } finally {
      setDecisionBusyId(null);
    }
  };

  const handlePublish = async (force: boolean) => {
    if (!activePayload) {
      setError("No timetable payload is available for publishing.");
      return;
    }
    setIsPublishing(true);
    setError(null);
    setMessage(null);
    try {
      await loadReview(source, { silent: true });
      if (!force && !canPublishNormally) {
        throw new Error("Publish is blocked. Resolve required conflicts and constraint mismatches, or use Publish Anyway.");
      }
      await publishOfficialTimetable(activePayload, publishLabel.trim() || undefined, force);
      await loadReview("official", { silent: true });
      setSource("official");
      setMessageTone(force ? "warn" : "success");
      setMessage(
        force
          ? "Timetable published using Publish Anyway (force mode)."
          : "Timetable published after successful conflict and constraint verification.",
      );
    } catch (err) {
      setError(toUiError(err));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleResolveAll = async () => {
    if (!activePayload) {
      setError("No timetable payload is available to resolve.");
      return;
    }

    setIsResolveAllBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await resolveAllTimetableConflicts({
        payload: source === "draft" ? activePayload : undefined,
        scope: "all",
        promoteOfficial: true,
        note: "Bulk auto-resolution from Conflicts page.",
      });
      setDraftIgnoredIds(new Set());
      setActivePayload(result.resolvedPayload);
      setSource("official");
      await loadReview("official", { silent: true });

      const mismatchText = result.constraintMismatches.length
        ? ` Constraint mismatches: ${result.constraintMismatches.length}.`
        : "";
      const promotedText = result.promotedVersionLabel
        ? ` Promoted as ${result.promotedVersionLabel}.`
        : "";
      setMessageTone(result.remainingConflicts.length ? "warn" : "success");
      setMessage(
        `Auto Resolve All completed. Resolved ${result.resolvedCount} conflict(s), remaining ${result.remainingConflicts.length}.${mismatchText}${promotedText}`,
      );
    } catch (err) {
      setError(toUiError(err));
    } finally {
      setIsResolveAllBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Conflicts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review, resolve, ignore, re-verify, and publish from one dedicated conflict manager.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={source === "official" ? "default" : "outline"}
            onClick={() => setSource("official")}
          >
            Official
          </Button>
          <Button
            variant={source === "draft" ? "default" : "outline"}
            onClick={() => setSource("draft")}
          >
            Generated Draft
          </Button>
          <Button variant="outline" onClick={() => void loadReview(source)} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Re-verify
          </Button>
          <Button onClick={() => void handleResolveAll()} disabled={isLoading || isResolveAllBusy || !activePayload}>
            {isResolveAllBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Auto Resolve All
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-semibold">{autoResolvedConflicts.length}</p>
            <p className="text-xs text-muted-foreground">Automatically Resolved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-semibold">{manuallyResolvedConflicts.length}</p>
            <p className="text-xs text-muted-foreground">Manually Resolved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-semibold">{ignoredConflicts.length}</p>
            <p className="text-xs text-muted-foreground">Ignored</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-semibold">{pendingRequiredConflicts.length}</p>
            <p className="text-xs text-muted-foreground">Yet to Resolve (Required)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-semibold">{constraintMismatches.length}</p>
            <p className="text-xs text-muted-foreground">Constraint Mismatches</p>
          </CardContent>
        </Card>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}
      {message ? (
        <Card>
          <CardContent
            className={`py-4 text-sm ${
              messageTone === "success"
                ? "text-emerald-700"
                : messageTone === "warn"
                  ? "text-amber-700"
                  : messageTone === "error"
                    ? "text-destructive"
                    : "text-foreground"
            }`}
          >
            {message}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {canPublishNormally ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-amber-600" />}
            Publish Readiness
          </CardTitle>
          <CardDescription>
            System re-verifies conflicts and constraints before publish. You can still override using Publish Anyway.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">Source: {source}</Badge>
            <Badge variant="outline">Unresolved Hard: {unresolvedHardCount}</Badge>
            <Badge variant="outline">Constraint Mismatches: {constraintMismatches.length}</Badge>
            {draftSnapshot ? <Badge variant="outline">Draft: {draftSnapshot.label}</Badge> : null}
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <div className="space-y-2">
              <Label>Publish Label</Label>
              <Input
                placeholder="Ex: Odd Cycle Final Review"
                value={publishLabel}
                onChange={(event) => setPublishLabel(event.target.value)}
              />
            </div>
            <Button
              onClick={() => void handlePublish(false)}
              disabled={isPublishing || !activePayload}
            >
              {isPublishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Publish
            </Button>
            <Button
              variant="outline"
              onClick={() => void handlePublish(true)}
              disabled={isPublishing || !activePayload}
            >
              {isPublishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
              Publish Anyway
            </Button>
          </div>
          {constraintMismatches.length ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">Constraint Mismatches</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
                {constraintMismatches.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-emerald-700">No constraint mismatches detected in current verification.</p>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Loading conflict review...</CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Automatically Resolved Conflicts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {autoResolvedConflicts.length ? (
                autoResolvedConflicts.map((conflict) => <ConflictCard key={conflict.id} conflict={conflict} />)
              ) : (
                <p className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">No automatically resolved conflicts recorded.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock3 className="h-5 w-5 text-indigo-600" />
                Manually Resolved Conflicts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {manuallyResolvedConflicts.length ? (
                manuallyResolvedConflicts.map((conflict) => <ConflictCard key={conflict.id} conflict={conflict} />)
              ) : (
                <p className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">No manually resolved conflicts recorded.</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Conflicts Yet to Be Resolved (Required Before Publishing)
              </CardTitle>
              <CardDescription>
                Apply recommendation to resolve. Use Ignore if you intentionally want to bypass this in Publish Anyway mode.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingRequiredConflicts.length ? (
                pendingRequiredConflicts.map((conflict) => (
                  <ConflictCard
                    key={conflict.id}
                    conflict={conflict}
                    showActions
                    busy={decisionBusyId === conflict.id}
                    onApply={handleApplyRecommendation}
                    onIgnore={handleIgnoreConflict}
                  />
                ))
              ) : (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  No required unresolved conflicts remain.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Ignored Conflicts</CardTitle>
              <CardDescription>These conflicts are excluded from required-resolution count for Publish Anyway.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {ignoredConflicts.length ? (
                ignoredConflicts.map((conflict) => <ConflictCard key={conflict.id} conflict={conflict} />)
              ) : (
                <p className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">No ignored conflicts.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
