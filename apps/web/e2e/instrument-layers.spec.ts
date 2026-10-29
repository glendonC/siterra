import { expect, test, type Page } from "@playwright/test";
import { obsidian } from "../lib/theme/obsidian";
import { textReport } from "./instrument-text";

// The layer stack instrument (approved specimen A) at its design size: all five sheet labels are placed on their
// leaders within the instruments' budget (docs/reference/ux-architecture.md), no line of text overlaps another,
// none is under 12 CSS px or outside the frame, and the keyboard turns the model and brings it back.

test.use({ viewport: { width: 1440, height: 900 } });

test("keeps within the approved specimen's budget: five leaders, one of them warm", async ({
  page,
}) => {
  await page.goto("/instruments/layers");
  const root = page.locator("[data-instrument='layers']");
  await expect(root.locator("[data-sheet]").first()).toBeVisible();
  const strokes = await root
    .locator("svg line")
    .evaluateAll((lines) => lines.map((l) => l.getAttribute("stroke")));
  expect(strokes).toHaveLength(5);
  expect(strokes.filter((s) => s === obsidian.accent)).toHaveLength(1);
});

const labelTops = (page: Page) =>
  page
    .locator("[data-instrument='layers'] [data-sheet]")
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));

test("places five sheet labels without crowding the text", async ({ page }) => {
  await page.goto("/instruments/layers");
  const labels = page.locator("[data-instrument='layers'] [data-sheet]");
  await expect(labels).toHaveCount(5);
  for (const label of await labels.all()) await expect(label).toBeVisible();
  await expect(page.locator("[data-scale-note]")).toBeVisible();

  const report = await textReport(page, "[data-instrument='layers']");
  expect(report).toEqual({ overlaps: [], small: [], outside: [] });
});

test("turns with the arrow keys and returns with Home", async ({ page }) => {
  await page.goto("/instruments/layers");
  await expect(page.locator("[data-instrument='layers'] [data-sheet]").first()).toBeVisible();
  const before = await labelTops(page);
  await page.locator("[data-instrument='layers'] canvas").focus();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => (await labelTops(page)).some((t, i) => Math.abs(t - (before[i] ?? t)) > 0.5))
    .toBe(true);
  await page.keyboard.press("Home");
  await expect
    .poll(async () =>
      (await labelTops(page)).every((t, i) => Math.abs(t - (before[i] ?? t)) <= 0.5),
    )
    .toBe(true);
});
