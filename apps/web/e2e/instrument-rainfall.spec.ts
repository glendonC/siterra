import { expect, test } from "@playwright/test";
import { textReport } from "./instrument-text";

// The rainfall scatter at its design size: one point per season (26), the four driest September to May totals
// ringed and labelled, the fit's R squared, every total labelled with its window, and no line of text overlapping
// another, under 12 CSS px or outside the frame.

test.use({ viewport: { width: 1440, height: 900 } });

const ROOT = "[data-instrument='rainfall']";

test("draws the 26 seasons, rings the four driest and states the fit", async ({ page }) => {
  await page.goto("/instruments/rainfall");
  await expect(page.locator(`${ROOT} [data-season]`)).toHaveCount(26);
  const driest = await page
    .locator(`${ROOT} [data-driest]`)
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-driest")));
  expect(driest).toEqual(["2001", "2024", "2016", "2023"]);
  const text = (await page.locator(ROOT).innerText()).replace(/\s+/g, " ");
  expect(text).toContain("R squared 0.037");
  expect(text).toContain("September to May rainfall, mm");
  for (const label of ["2001, 369 mm", "2024, 391 mm", "2016, 419 mm", "2023, 421 mm"])
    expect(text).toContain(label);
  // the case's November to April totals never show here
  expect(text).not.toContain("November to April");
});

test("places the plot and its words without crowding the text, at rest and with the fit's details open", async ({
  page,
}) => {
  await page.goto("/instruments/rainfall");
  await expect(page.locator(`${ROOT} [data-season]`)).toHaveCount(26);
  expect(await textReport(page, ROOT)).toEqual({ overlaps: [], small: [], outside: [] });
  await page.locator(`${ROOT} [data-scatter-more]`).click();
  await expect(page.locator(`${ROOT} [data-scatter-details]`)).toBeVisible();
  expect(await textReport(page, ROOT)).toEqual({ overlaps: [], small: [], outside: [] });
});

test("keeps one short line on what the fit cannot say; the caveat, interval and gate wait behind a step", async ({
  page,
}) => {
  await page.goto("/instruments/rainfall");
  await expect(page.locator(`${ROOT} [data-season]`)).toHaveCount(26);
  await expect(page.locator(`${ROOT} [data-scatter-why]`)).toHaveText(
    "The fit says nothing about why.",
  );
  const details = page.locator(`${ROOT} [data-scatter-details]`);
  await expect(details).toBeHidden();
  const more = page.locator(`${ROOT} [data-scatter-more]`);
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(details).toContainText("95%");
  await expect(details).toContainText("says nothing about why");
  await expect(details).toContainText("precondition is not met");
});
