import { expect, test } from "@playwright/test";
import { textReport } from "./instrument-text";

// The field plan page on the seed case, whose listing holds no field plan spec: the page says the record holds no
// field plan instrument and draws no check (the plan itself is reviewed on the recorded 28 Oct run in the lane's preview).

test.use({ viewport: { width: 1440, height: 900 } });

const ROOT = "[data-instrument='field']";

test("says the record holds no field plan and draws no check", async ({ page }) => {
  await page.goto("/instruments/field");
  await expect(page.locator(`${ROOT} [data-field-plan='blocked']`)).toBeVisible();
  await expect(page.locator(`${ROOT} [data-check]`)).toHaveCount(0);
  // true whether or not the case holds a branch merge: it states only what the listing holds
  await expect(page.locator(ROOT)).toContainText("This case's record holds no field plan yet.");
  expect(await textReport(page, ROOT)).toEqual({ overlaps: [], small: [], outside: [] });
});
