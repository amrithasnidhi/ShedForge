import { expect, test } from "@playwright/test";

import { bootstrapRoleSessions, openWithSession } from "./support/session";

test.describe("Role workflows", () => {
  test("admin can open dashboard and schedule workspace", async ({ page, request }) => {
    const { admin } = await bootstrapRoleSessions(request);

    await openWithSession(page, admin, "/dashboard");
    await expect(page.getByText(/dashboard|system analytics/i).first()).toBeVisible();

    await page.goto("/schedule", { waitUntil: "networkidle" });
    await expect(page.getByText(/schedule workspace|weekly timetable grid/i).first()).toBeVisible();
  });

  test("faculty can open dashboard and my schedule", async ({ page, request }) => {
    const { faculty } = await bootstrapRoleSessions(request);

    await openWithSession(page, faculty, "/faculty-dashboard");
    await expect(page.getByText(/faculty profile mapping required|dashboard/i).first()).toBeVisible();

    await page.goto("/my-schedule", { waitUntil: "networkidle" });
    await expect(page.getByText(/my schedule|weekly timetable/i).first()).toBeVisible();
  });

  test("student can open dashboard and my timetable", async ({ page, request }) => {
    const { student } = await bootstrapRoleSessions(request);

    await openWithSession(page, student, "/student-dashboard");
    await expect(page.getByText(/student dashboard|my timetable|overview/i).first()).toBeVisible();

    await page.goto("/my-timetable", { waitUntil: "networkidle" });
    await expect(page.getByText(/my timetable|weekly timetable/i).first()).toBeVisible();
  });
});
