import { test } from "@playwright/test";

import { bootstrapRoleSessions, openWithSession } from "./support/session";

test.describe("Visual baseline capture", () => {
  test("capture dashboard, schedule grid, and conflicts panel", async ({ page, request }, testInfo) => {
    const { admin } = await bootstrapRoleSessions(request);

    await openWithSession(page, admin, "/dashboard");
    await page.screenshot({
      path: testInfo.outputPath("dashboard-metrics.png"),
      fullPage: true,
    });

    await page.goto("/schedule", { waitUntil: "networkidle" });
    await page.screenshot({
      path: testInfo.outputPath("schedule-weekly-grid.png"),
      fullPage: true,
    });

    await page.goto("/conflicts", { waitUntil: "networkidle" });
    await page.screenshot({
      path: testInfo.outputPath("conflicts-panel.png"),
      fullPage: true,
    });
  });
});
