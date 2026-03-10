"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listActivityLogs, type ActivityLogItem } from "@/lib/activity-api";
import {
  fetchHealthLive,
  fetchHealthReady,
  type HealthLiveStatus,
  type HealthReadyStatus,
} from "@/lib/health-api";
import { fetchSystemInfo, triggerSystemBackup, type SystemInfo } from "@/lib/system-api";

export default function HelpPage() {
  return <HelpContent />;
}

function HelpContent() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canViewActivity = user?.role === "admin" || user?.role === "scheduler";

  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [liveStatus, setLiveStatus] = useState<HealthLiveStatus | null>(null);
  const [readyStatus, setReadyStatus] = useState<HealthReadyStatus | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [backupResult, setBackupResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      fetchSystemInfo(),
      canViewActivity ? listActivityLogs() : Promise.resolve([] as ActivityLogItem[]),
      fetchHealthLive(),
      fetchHealthReady(),
    ])
      .then(([infoResult, activityResult, liveResult, readyResult]) => {
        const errors: string[] = [];
        if (infoResult.status === "fulfilled") {
          setInfo(infoResult.value);
        } else {
          errors.push(
            infoResult.reason instanceof Error ? infoResult.reason.message : "Unable to load system info",
          );
        }
        if (activityResult.status === "fulfilled") {
          setActivityLogs(activityResult.value.slice(0, 12));
        } else {
          errors.push(
            activityResult.reason instanceof Error ? activityResult.reason.message : "Unable to load activity logs",
          );
        }
        if (liveResult.status === "fulfilled") {
          setLiveStatus(liveResult.value);
        } else {
          errors.push(liveResult.reason instanceof Error ? liveResult.reason.message : "Unable to load liveness probe");
        }
        if (readyResult.status === "fulfilled") {
          setReadyStatus(readyResult.value);
        } else {
          errors.push(readyResult.reason instanceof Error ? readyResult.reason.message : "Unable to load readiness probe");
        }
        setError(errors.length ? errors.join(" ") : null);
      });
  }, [canViewActivity]);

  const handleBackup = async () => {
    setError(null);
    setBackupResult(null);
    try {
      const result = await triggerSystemBackup();
      setBackupResult(result.backup_file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup failed");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Help & System Info</h1>
        <p className="text-sm text-muted-foreground">Usage guidance and operational system metadata.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">System Information</CardTitle>
          <CardDescription>Live status metadata from backend APIs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p><span className="font-medium">Project:</span> {info?.name ?? ""}</p>
          <p><span className="font-medium">API Prefix:</span> {info?.api_prefix ?? ""}</p>
          <p><span className="font-medium">Timestamp:</span> {info?.timestamp ? new Date(info.timestamp).toLocaleString() : ""}</p>
          <div>
            <p className="font-medium mb-2">Help Sections</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              {(info?.help_sections ?? []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Service Health</CardTitle>
          <CardDescription>Liveness and readiness probes used for integration diagnostics.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <span className="font-medium">Liveness:</span>{" "}
            {liveStatus?.status?.toUpperCase() ?? ""}
          </p>
          <p>
            <span className="font-medium">Readiness:</span>{" "}
            {readyStatus?.status?.toUpperCase() ?? ""}
          </p>
          <p>
            <span className="font-medium">Database:</span>{" "}
            {readyStatus
              ? readyStatus.database.ok
                ? readyStatus.database.schema_ok
                  ? "Connected and schema-compatible"
                  : "Connected with schema drift"
                : "Unavailable"
              : ""}
          </p>
          <p>
            <span className="font-medium">SMTP:</span>{" "}
            {readyStatus?.smtp.configured ? "Configured" : "Not configured"}
          </p>
          {readyStatus?.database.missing_tables.length ? (
            <p className="text-destructive">
              Missing tables: {readyStatus.database.missing_tables.join(", ")}
            </p>
          ) : null}
          {readyStatus && Object.keys(readyStatus.database.missing_columns).length ? (
            <p className="text-destructive">
              Missing columns:{" "}
              {Object.entries(readyStatus.database.missing_columns)
                .map(([tableName, columns]) => `${tableName}(${columns.join(", ")})`)
                .join("; ")}
            </p>
          ) : null}
          {readyStatus?.database.error ? (
            <p className="text-destructive">Database error: {readyStatus.database.error}</p>
          ) : null}
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Backup Trigger</CardTitle>
            <CardDescription>Manual JSON backup export for administrative control.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => void handleBackup()}>Trigger Backup</Button>
            {backupResult ? <p className="text-sm text-success">Backup created: {backupResult}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {canViewActivity ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <CardDescription>Audit log entries for privileged operations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activityLogs.map((item) => (
              <div key={item.id} className="border rounded-md p-3 text-sm space-y-1">
                <p className="font-medium">{item.action}</p>
                <p className="text-muted-foreground">
                  {item.entity_type ?? "system"} {item.entity_id ? `(${item.entity_id})` : ""}
                </p>
                <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
              </div>
            ))}
            {!activityLogs.length ? <p className="text-sm text-muted-foreground">No activity logs available.</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
