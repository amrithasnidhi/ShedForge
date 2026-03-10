import { expect, test } from "@playwright/test";
import { checkA11y, injectAxe } from "axe-playwright";

import { bootstrapRoleSessions, openWithSession } from "./support/session";

test.describe("Accessibility smoke", () => {
  test("dashboard and schedule have no critical/serious violations", async ({ page, request }) => {
    const { admin } = await bootstrapRoleSessions(request);

    await openWithSession(page, admin, "/dashboard");
    await injectAxe(page);
    await checkA11y(
      page,
      undefined,
      {
        includedImpacts: ["critical", "serious"],
      },
      false,
    );

    await page.goto("/schedule", { waitUntil: "networkidle" });
    await injectAxe(page);
    await checkA11y(
      page,
      undefined,
      {
        includedImpacts: ["critical", "serious"],
      },
      false,
    );

    await expect(page).toHaveURL(/schedule/);
  });
});
