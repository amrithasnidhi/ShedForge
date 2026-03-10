import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const baseUrl = (process.env.PERF_FRONTEND_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const samples = Number(process.env.PERF_FRONTEND_SAMPLE_COUNT ?? 5);
const reportPath = process.env.PERF_FRONTEND_REPORT_PATH ?? "frontend/perf-results/frontend-latency-smoke.json";
const avgBudget = Number(process.env.PERF_FRONTEND_AVG_BUDGET_MS ?? 1200);
const p95Budget = Number(process.env.PERF_FRONTEND_P95_BUDGET_MS ?? 2500);

const routes = ["/", "/dashboard", "/schedule"];

function percentile(values, pct) {
  const ordered = [...values].sort((a, b) => a - b);
  const idx = Math.min(ordered.length - 1, Math.max(0, Math.round(((pct / 100) * (ordered.length - 1)))));
  return ordered[idx] ?? 0;
}

async function measureRoute(route) {
  const latencies = [];
  for (let i = 0; i < samples; i += 1) {
    const start = performance.now();
    const response = await fetch(`${baseUrl}${route}`);
    const elapsed = performance.now() - start;
    if (!response.ok && response.status !== 404) {
      throw new Error(`Unexpected status ${response.status} for ${route}`);
    }
    latencies.push(Number(elapsed.toFixed(2)));
  }

  const avg = Number((latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(2));
  const p95 = Number(percentile(latencies, 95).toFixed(2));
  const max = Number(Math.max(...latencies).toFixed(2));

  return {
    route,
    samplesMs: latencies,
    avgMs: avg,
    p95Ms: p95,
    maxMs: max,
  };
}

async function main() {
  const endpointReports = [];
  for (const route of routes) {
    endpointReports.push(await measureRoute(route));
  }

  const output = {
    baseUrl,
    samples,
    avgBudgetMs: avgBudget,
    p95BudgetMs: p95Budget,
    routes: endpointReports,
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const failures = [];
  for (const route of endpointReports) {
    if (route.avgMs > avgBudget) {
      failures.push(`${route.route} avg ${route.avgMs}ms > ${avgBudget}ms`);
    }
    if (route.p95Ms > p95Budget) {
      failures.push(`${route.route} p95 ${route.p95Ms}ms > ${p95Budget}ms`);
    }
  }

  if (failures.length > 0) {
    console.error("Frontend performance smoke failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Frontend performance smoke passed. Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
