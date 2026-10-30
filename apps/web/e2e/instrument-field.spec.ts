import { expect, test } from "@playwright/test";
import { textReport } from "./instrument-text";

// The field plan page on the seed case, which holds no branch merge: the page says no field plan is proposed yet
// and draws no check (the plan itself is reviewed on the recorded 28 Oct run in the lane's preview, never here).

test.use({ viewport: { width: 1440, height: 900 } });

const ROOT = "[data-instrument='field']";

test("says no field plan is proposed yet and draws no check", async ({ page }) => {
  await page.goto("/instruments/field");
  await expect(page.locator(`${ROOT} [data-field-plan='blocked']`)).toBeVisible();
  await expect(page.locator(`${ROOT} [data-check]`)).toHaveCount(0);
  await expect(page.locator(ROOT)).toContainText("No field plan yet.");
  expect(await textReport(page, ROOT)).toEqual({ overlaps: [], small: [], outside: [] });
});
