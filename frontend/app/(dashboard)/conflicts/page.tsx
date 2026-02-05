"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Wand2,
  ChevronDown,
  ChevronRight,
  Users,
  Building,
  Clock,
  Info,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { conflictData, type Conflict } from "@/lib/mock-data";

function getSeverityBadge(severity: Conflict["severity"]) {
  switch (severity) {
    case "high":
      return (
        <Badge variant="outline" className="text-destructive border-destructive">
          High
        </Badge>
      );
    case "medium":
      return (
        <Badge variant="outline" className="text-warning border-warning">
          Medium
        </Badge>
      );
    case "low":
      return (
        <Badge variant="outline" className="text-muted-foreground border-muted-foreground">
          Low
        </Badge>
      );
  }
}

function getTypeIcon(type: Conflict["type"]) {
  switch (type) {
    case "faculty-overlap":
      return <Users className="h-4 w-4" />;
    case "room-overlap":
      return <Building className="h-4 w-4" />;
    case "capacity":
      return <Building className="h-4 w-4" />;
    case "availability":
      return <Clock className="h-4 w-4" />;
    default:
      return <AlertTriangle className="h-4 w-4" />;
  }
}

function getTypeLabel(type: Conflict["type"]) {
  switch (type) {
    case "faculty-overlap":
      return "Faculty Overlap";
    case "room-overlap":
      return "Room Overlap";
    case "capacity":
      return "Capacity Issue";
    case "availability":
      return "Availability Conflict";
    default:
      return "Unknown";
  }
}

import { useAuth } from "@/components/auth-provider";

export default function ConflictsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [conflicts, setConflicts] = useState(conflictData);
  const [expandedConflicts, setExpandedConflicts] = useState<string[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);

  const unresolvedConflicts = conflicts.filter((c) => !c.resolved);
  const resolvedConflicts = conflicts.filter((c) => c.resolved);

  const toggleExpanded = (id: string) => {
    setExpandedConflicts((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const resolveConflict = (id: string) => {
    setConflicts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, resolved: true } : c))
    );
  };

  const autoResolveAll = () => {
    setIsResolving(true);
    setTimeout(() => {
      setConflicts((prev) => prev.map((c) => ({ ...c, resolved: true })));
      setIsResolving(false);
      setResolveDialogOpen(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Conflict Resolution</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and resolve scheduling conflicts
          </p>
        </div>
        {!isAdmin && (
          <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={unresolvedConflicts.length === 0}>
                <Wand2 className="h-4 w-4 mr-2" />
                Auto-Resolve All
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Auto-Resolve Conflicts</DialogTitle>
                <DialogDescription>
                  The system will automatically apply the recommended resolution strategy for all unresolved conflicts.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="text-sm text-muted-foreground">
                  {unresolvedConflicts.length} conflict(s) will be resolved using AI-recommended strategies.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={autoResolveAll} disabled={isResolving}>
                  {isResolving ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Resolving...
                    </span>
                  ) : (
                    "Confirm"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-3xl font-semibold">{unresolvedConflicts.length}</p>
                <p className="text-sm text-muted-foreground">Unresolved Conflicts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-3xl font-semibold">{resolvedConflicts.length}</p>
                <p className="text-sm text-muted-foreground">Resolved Conflicts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                <Wand2 className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-3xl font-semibold">
                  {conflicts.length > 0
                    ? Math.round((resolvedConflicts.length / conflicts.length) * 100)
                    : 100}
                  %
                </p>
                <p className="text-sm text-muted-foreground">Resolution Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Explainability Notice */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Transparent Conflict Detection</AlertTitle>
        <AlertDescription>
          Each conflict includes a detailed explanation of why it was flagged and the recommended resolution strategy.
          The AI system provides full transparency into scheduling decisions to build trust and enable informed adjustments.
        </AlertDescription>
      </Alert>

      {/* Unresolved Conflicts */}
      {unresolvedConflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Unresolved Conflicts
            </CardTitle>
            <CardDescription>
              Review each conflict and apply the recommended resolution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {unresolvedConflicts.map((conflict) => (
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
                            {getTypeIcon(conflict.type)}
                          </div>
                          <div className="text-left">
                            <p className="font-medium">{getTypeLabel(conflict.type)}</p>
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {conflict.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {getSeverityBadge(conflict.severity)}
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
                          <p className="text-sm font-medium text-foreground mb-1">Recommended Resolution</p>
                          <p className="text-sm text-muted-foreground">{conflict.resolution}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground mb-1">Affected Slots</p>
                          <div className="flex gap-2">
                            {conflict.affectedSlots.map((slot) => (
                              <Badge key={slot} variant="secondary" className="font-mono text-xs">
                                {slot}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {!isAdmin && (
                          <div className="flex gap-2 pt-2">
                            <Button size="sm" onClick={() => resolveConflict(conflict.id)}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                              Apply Resolution
                            </Button>
                            <Button size="sm" variant="outline">
                              View in Timetable
                            </Button>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resolved Conflicts */}
      {resolvedConflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Resolved Conflicts
            </CardTitle>
            <CardDescription>
              Previously resolved conflicts for reference
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Resolution Applied</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolvedConflicts.map((conflict) => (
                  <TableRow key={conflict.id} className="text-muted-foreground">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTypeIcon(conflict.type)}
                        <span>{getTypeLabel(conflict.type)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {conflict.description}
                    </TableCell>
                    <TableCell>{getSeverityBadge(conflict.severity)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {conflict.resolution}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {conflicts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">No Conflicts Detected</h3>
            <p className="text-sm text-muted-foreground">
              The current timetable is conflict-free and fully optimized.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
