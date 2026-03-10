"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpenCheck,
  CircleAlert,
  Database,
  MailCheck,
  RefreshCw,
  Server,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { listActivityLogs, type ActivityLogItem } from "@/lib/activity-api";
import { fetchHealthLive, fetchHealthReady, type HealthLiveStatus, type HealthReadyStatus } from "@/lib/health-api";
import { fetchSystemInfo, triggerSystemBackup, type SystemInfo } from "@/lib/system-api";

type HelpArticle = {
  id: string;
  title: string;
  audience: "all" | "admin_scheduler" | "faculty_student";
  summary: string;
  steps: string[];
  links: Array<{ label: string; href: string }>;
};

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "publish-flow",
    title: "How timetable publishing works",
    audience: "all",
    summary: "Draft timetables are generated, validated, and then published to role-specific audiences.",
    steps: [
      "Generate and validate a draft from Generator.",
      "Review conflicts and apply recommended fixes.",
      "Publish the final version from Schedule to release role-specific views.",
    ],
    links: [
      { label: "Open Generator", href: "/generator" },
      { label: "Open Schedule", href: "/schedule" },
    ],
  },
  {
    id: "constraints-management",
    title: "Managing timetable constraints",
    audience: "admin_scheduler",
    summary: "Maintain institution-level and program-level constraints before running scheduling jobs.",
    steps: [
      "Configure semester and program constraints.",
      "Set break, lunch, and blocked slots.",
      "Run generation and review constraint report violations.",
    ],
    links: [
      { label: "Open Constraints", href: "/constraints" },
      { label: "Open Settings", href: "/settings" },
    ],
  },
  {
    id: "change-requests",
    title: "Handling timetable change requests",
    audience: "faculty_student",
    summary: "Use issue channels to request shifts, room changes, and conflict corrections.",
    steps: [
      "Raise a clear issue with day, slot, section, and reason.",
      "Track status from notifications and issue thread.",
      "Confirm the final approved change in timetable view.",
    ],
    links: [
      { label: "Open Issues", href: "/issues" },
      { label: "Open Notifications", href: "/notifications" },
    ],
  },
  {
    id: "incident-response",
    title: "If data does not load",
    audience: "all",
    summary: "Follow a standard quick triage before escalating an incident.",
    steps: [
      "Check backend liveness and readiness status in this Help page.",
      "Verify database schema compatibility and SMTP readiness.",
      "If still failing, create a high-priority issue with screenshots and endpoint error details.",
    ],
    links: [{ label: "Report an Issue", href: "/issues" }],
  },
];

type QuickAction = {
  label: string;
  description: string;
  href: string;
};

function statusBadgeVariant(ok: boolean): "secondary" | "destructive" {
  return ok ? "secondary" : "destructive";
}

export default function HelpPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canViewActivity = user?.role === "admin" || user?.role === "scheduler";

  const [query, setQuery] = useState("");
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [liveStatus, setLiveStatus] = useState<HealthLiveStatus | null>(null);
  const [readyStatus, setReadyStatus] = useState<HealthReadyStatus | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [backupResult, setBackupResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);

  const quickActions = useMemo<QuickAction[]>(() => {
    const shared: QuickAction[] = [
      {
        label: "Issues",
        description: "Report and track scheduling or system problems.",
        href: "/issues",
      },
      {
        label: "Feedback",
        description: "Submit workflow suggestions and usability feedback.",
        href: "/feedback",
      },
      {
        label: "Notifications",
        description: "Monitor operational updates and approvals.",
        href: "/notifications",
      },
    ];

    if (user?.role === "admin" || user?.role === "scheduler") {
      return [
        {
          label: "Generator",
          description: "Run scheduling jobs and review live execution logs.",
          href: "/generator",
        },
        {
          label: "Constraints",
          description: "Configure algorithm constraints and validation boundaries.",
          href: "/constraints",
        },
        ...shared,
      ];
    }

    if (user?.role === "faculty") {
      return [
        {
          label: "My Schedule",
          description: "Review your weekly schedule and assignments.",
          href: "/my-schedule",
        },
        ...shared,
      ];
    }

    return [
      {
        label: "My Timetable",
        description: "Review your class-wise timetable and updates.",
        href: "/my-timetable",
      },
      ...shared,
    ];
  }, [user?.role]);

  const filteredArticles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const role = user?.role ?? "student";
    const visible = HELP_ARTICLES.filter((article) => {
      if (article.audience === "all") return true;
      if (article.audience === "admin_scheduler") {
        return role === "admin" || role === "scheduler";
      }
      return role === "faculty" || role === "student";
    });

    if (!normalized) return visible;
    return visible.filter((article) => {
      return (
        article.title.toLowerCase().includes(normalized) ||
        article.summary.toLowerCase().includes(normalized) ||
        article.steps.some((step) => step.toLowerCase().includes(normalized))
      );
    });
  }, [query, user?.role]);

  const diagnostics = useMemo(() => {
    const dbHealthy = Boolean(readyStatus?.database.ok && readyStatus.database.schema_ok);
    return [
      {
        id: "api",
        icon: <Server className="h-4 w-4" />,
        title: "Backend API",
        ok: liveStatus?.status === "ok",
        detail: liveStatus ? `Liveness: ${liveStatus.status.toUpperCase()}` : "No liveness response yet.",
        action: "If down, restart backend service and verify API URL configuration.",
      },
      {
        id: "db",
        icon: <Database className="h-4 w-4" />,
        title: "Database",
        ok: dbHealthy,
        detail: readyStatus
          ? readyStatus.database.ok
            ? readyStatus.database.schema_ok
              ? "Connected and schema-compatible."
              : "Connected, but schema mismatch detected."
            : "Database is not reachable."
          : "No readiness response yet.",
        action: "Run pending migrations and validate connection credentials.",
      },
      {
        id: "smtp",
        icon: <MailCheck className="h-4 w-4" />,
        title: "Email Delivery",
        ok: Boolean(readyStatus?.smtp.configured),
        detail: readyStatus?.smtp.configured ? "SMTP is configured for notifications." : "SMTP is not configured.",
        action: "Set SMTP host, sender, and auth variables in backend environment settings.",
      },
    ];
  }, [liveStatus, readyStatus]);

  const loadSupportSnapshot = async () => {
    setLoading(true);
    setError(null);

    const [infoResult, activityResult, liveResult, readyResult] = await Promise.allSettled([
      fetchSystemInfo(),
      canViewActivity ? listActivityLogs() : Promise.resolve([] as ActivityLogItem[]),
      fetchHealthLive(),
      fetchHealthReady(),
    ]);

    const errors: string[] = [];
    if (infoResult.status === "fulfilled") {
      setInfo(infoResult.value);
    } else {
      errors.push(infoResult.reason instanceof Error ? infoResult.reason.message : "Unable to load system info.");
    }

    if (activityResult.status === "fulfilled") {
      setActivityLogs(activityResult.value.slice(0, 12));
    } else {
      errors.push(activityResult.reason instanceof Error ? activityResult.reason.message : "Unable to load activity logs.");
    }

    if (liveResult.status === "fulfilled") {
      setLiveStatus(liveResult.value);
    } else {
      errors.push(liveResult.reason instanceof Error ? liveResult.reason.message : "Unable to load liveness probe.");
    }

    if (readyResult.status === "fulfilled") {
      setReadyStatus(readyResult.value);
    } else {
      errors.push(readyResult.reason instanceof Error ? readyResult.reason.message : "Unable to load readiness probe.");
    }

    setError(errors.length ? errors.join(" ") : null);
    setLoading(false);
  };

  useEffect(() => {
    void loadSupportSnapshot();
  }, [canViewActivity]);

  const handleBackup = async () => {
    setError(null);
    setBackupResult(null);
    setBackupLoading(true);
    try {
      const result = await triggerSystemBackup();
      setBackupResult(result.backup_file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 p-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Help & Support Center</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Centralized documentation, diagnostics, and recovery guidance for timetable operations.
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadSupportSnapshot()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {loading ? "Refreshing..." : "Refresh Snapshot"}
          </Button>
        </div>
        <Separator />
        <div className="grid gap-3 p-6 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Role" value={(user?.role ?? "unknown").toUpperCase()} icon={<ShieldCheck className="h-4 w-4" />} />
          <MetricTile label="API Status" value={liveStatus?.status?.toUpperCase() ?? "-"} icon={<Server className="h-4 w-4" />} />
          <MetricTile
            label="DB Readiness"
            value={
              readyStatus
                ? readyStatus.database.ok
                  ? readyStatus.database.schema_ok
                    ? "READY"
                    : "SCHEMA DRIFT"
                  : "DOWN"
                : "-"
            }
            icon={<Database className="h-4 w-4" />}
          />
          <MetricTile
            label="SMTP"
            value={readyStatus?.smtp.configured ? "CONFIGURED" : "NOT CONFIGURED"}
            icon={<MailCheck className="h-4 w-4" />}
          />
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
              <CardDescription>Navigate to the most-used support workflows.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {quickActions.map((action) => (
                <Link key={action.href} href={action.href} className="rounded-lg border p-4 transition-colors hover:bg-muted/50">
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{action.description}</p>
                  <p className="mt-2 inline-flex items-center text-xs font-medium text-primary">
                    Open <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                  </p>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Knowledge Base</CardTitle>
              <CardDescription>Search playbooks and support runbooks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search help articles, procedures, and troubleshooting steps"
              />
              <Accordion type="single" collapsible className="w-full">
                {filteredArticles.map((article) => (
                  <AccordionItem key={article.id} value={article.id}>
                    <AccordionTrigger className="text-left">{article.title}</AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">{article.summary}</p>
                      <div className="space-y-2">
                        {article.steps.map((step, index) => (
                          <p key={`${article.id}-step-${index}`} className="text-sm">
                            {index + 1}. {step}
                          </p>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {article.links.map((entry) => (
                          <Button key={`${article.id}-${entry.href}`} asChild size="sm" variant="outline">
                            <Link href={entry.href}>{entry.label}</Link>
                          </Button>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              {!filteredArticles.length ? (
                <p className="text-sm text-muted-foreground">No help articles matched your search.</p>
              ) : null}
            </CardContent>
          </Card>

          {canViewActivity ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Operational Activity</CardTitle>
                <CardDescription>Audit stream for privileged actions and important changes.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {activityLogs.length ? (
                  activityLogs.map((item) => (
                    <div key={item.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{item.action}</p>
                        <Badge variant="outline">{new Date(item.created_at).toLocaleString()}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.entity_type ?? "system"} {item.entity_id ? `(${item.entity_id})` : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No recent activity logs available.</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Runtime Diagnostics</CardTitle>
              <CardDescription>Live service checks and recovery recommendations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {diagnostics.map((diagnostic) => (
                <div key={diagnostic.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {diagnostic.icon}
                      {diagnostic.title}
                    </p>
                    <Badge variant={statusBadgeVariant(diagnostic.ok)}>{diagnostic.ok ? "Healthy" : "Attention"}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{diagnostic.detail}</p>
                  {!diagnostic.ok ? <p className="mt-2 text-xs text-amber-700">{diagnostic.action}</p> : null}
                </div>
              ))}

              {readyStatus?.database.missing_tables.length ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <p className="text-xs font-medium text-destructive">Missing Tables</p>
                  <p className="mt-1 text-xs text-destructive">{readyStatus.database.missing_tables.join(", ")}</p>
                </div>
              ) : null}

              {readyStatus && Object.keys(readyStatus.database.missing_columns).length ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <p className="text-xs font-medium text-destructive">Missing Columns</p>
                  <p className="mt-1 text-xs text-destructive">
                    {Object.entries(readyStatus.database.missing_columns)
                      .map(([tableName, columns]) => `${tableName}(${columns.join(", ")})`)
                      .join("; ")}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Platform Information</CardTitle>
              <CardDescription>Current runtime metadata and feature flags.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoLine label="Project" value={info?.name ?? "-"} />
              <InfoLine label="API Prefix" value={info?.api_prefix ?? "-"} />
              <InfoLine
                label="Timestamp"
                value={info?.timestamp ? new Date(info.timestamp).toLocaleString() : "-"}
              />
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Help Sections</p>
                <div className="flex flex-wrap gap-2">
                  {(info?.help_sections ?? []).length ? (
                    info?.help_sections.map((item) => (
                      <Badge key={item} variant="outline">
                        {item}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No help sections returned by backend.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Escalation Workflow</CardTitle>
              <CardDescription>Standard path to resolve unresolved operational issues.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Check relevant runbook and confirm issue scope.
              </p>
              <p className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Raise an issue with screenshots, role, program, and failing endpoint.
              </p>
              <p className="flex items-start gap-2">
                <Activity className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Track notifications and verify final fix in timetable views.
              </p>
            </CardContent>
          </Card>

          {isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Administrative Recovery</CardTitle>
                <CardDescription>Manual backup for incident recovery and audit traceability.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={() => void handleBackup()} disabled={backupLoading}>
                  <Wrench className="mr-2 h-4 w-4" />
                  {backupLoading ? "Running Backup..." : "Trigger Backup"}
                </Button>
                {backupResult ? <p className="text-xs text-emerald-700">Backup created: {backupResult}</p> : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetricTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 text-xs last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
