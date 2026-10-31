import { expect, test, type Page } from "@playwright/test";
import { textReport } from "./instrument-text";

// The pixel anatomy instrument (approved specimen C) at its design size: six numbered panels within the instruments'
// budget (docs/reference/ux-architecture.md), no line of text overlapping another, under 12 CSS px or outside the
// frame, and the mix model worked from the keyboard: a focused boundary moves with the arrow keys, Home and the
// reset button bring back the measured shares.

test.use({ viewport: { width: 1440, height: 900 } });

const ROOT = "[data-instrument='pixel']";
const sliders = (page: Page) => page.locator(`${ROOT} [role='slider']`);
const values = (page: Page) =>
  sliders(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-valuenow")));

test("keeps within the approved specimen's budget", async ({ page }) => {
  await page.goto("/instruments/pixel");
  await expect(sliders(page)).toHaveCount(3);
  const heads = await page
    .locator(`${ROOT} [class*='panelHead'] [class*='num']`)
    .evaluateAll((els) => els.map((e) => e.textContent));
  expect(heads.sort()).toEqual(["01", "02", "03", "04", "05", "06"]);
  await expect(page.locator(`${ROOT} [class*='roFigure']`)).toHaveCount(1);
  // the catchment outline and the band limit come from the DEM, so its licence notice shows
  await expect(page.locator("[data-sources-line]")).toContainText("Copernicus DEM");
  await page.keyboard.press("s");
  await expect(page.locator("[data-sources-panel]")).toContainText(
    "Produced using Copernicus WorldDEM-30",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-sources-panel]")).toHaveCount(0);
  // the bundle's own note on how the pixel was chosen
  await expect(page.locator(`${ROOT} [data-pixel-note]`)).toHaveText(
    "This pixel is an illustration chosen by judgment, not a sample.",
  );
});

test("places every panel without crowding the text", async ({ page }) => {
  await page.goto("/instruments/pixel");
  await expect(sliders(page)).toHaveCount(3);
  expect(await textReport(page, ROOT)).toEqual({ overlaps: [], small: [], outside: [] });
});

test("moves a class boundary with the keys and returns to the measured shares", async ({
  page,
}) => {
  await page.goto("/instruments/pixel");
  await expect(sliders(page)).toHaveCount(3);
  const measured = await values(page);
  const figure = page.locator(`${ROOT} [class*='roFigure']`);
  const before = await figure.textContent();
  // at the measured shares no change line (U28d); once a boundary moves, the change in model NDVI from the mix
  const delta = page.locator(`${ROOT} [class*='roDelta']`);
  await expect(delta).toHaveCount(0);
  await sliders(page).nth(1).focus();
  for (let k = 0; k < 4; k++) await page.keyboard.press("Shift+ArrowLeft");
  await expect.poll(() => values(page)).not.toEqual(measured);
  await expect(figure).not.toHaveText(before ?? "");
  await expect(delta).toContainText("in model NDVI from the measured mix");
  await page.keyboard.press("Home");
  await expect.poll(() => values(page)).toEqual(measured);
  await expect(delta).toHaveCount(0);
  await sliders(page).nth(1).press("Shift+ArrowLeft");
  await page.locator(`${ROOT} button[class*='textButton']`).click();
  await expect.poll(() => values(page)).toEqual(measured);
});
