import { expect, test, type Page } from "@playwright/test";
import { en } from "../lib/copy/en";
import { PIXEL_STEPS, shapedInside } from "./answer";
import { textReport } from "./instrument-text";

// Inside One Pixel (approved specimen C) by its own address: what the pixel did in plain words over one ordered list
// of six steps, each named by what it shows and opening alone under its own row (02 at first); no line of text
// overlapping another, under 12 CSS px or outside the frame with any step open; and the mix model worked from the
// keyboard in its step: a focused boundary moves with the arrow keys, Home and the reset button bring back the
// measured shares.

test.use({ viewport: { width: 1440, height: 900 } });

const ROOT = "[data-instrument='pixel']";
const sliders = (page: Page) => page.locator(`${ROOT} [role='slider']`);
const values = (page: Page) =>
  sliders(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-valuenow")));

/** Opens one step under its row. */
async function openStep(page: Page, id: string) {
  const row = page.locator(`${ROOT} [data-step='${id}']`);
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
}

test("keeps within the approved specimen's budget: the statement in words over six steps, one open", async ({
  page,
}) => {
  await page.goto("/instruments/pixel");
  await expect(page.locator(`${ROOT} [data-step]`)).toHaveText(
    PIXEL_STEPS.map(([id, name]) => `${id}${en[name].text}`),
    { timeout: 60_000 },
  );
  await expect(page.locator(`${ROOT} [data-step][aria-expanded='true']`)).toHaveCount(1);
  await expect(page.locator(`${ROOT} [data-step='02']`)).toHaveAttribute("aria-expanded", "true");
  // what the pixel did leads, in words; its figure is the detail under it
  await expect(page.locator(ROOT)).toContainText(
    shapedInside(
      en["instrument.pixel.lead.greener"].text,
      en["instrument.pixel.lead.browner"].text,
      en["instrument.pixel.lead.flat"].text,
    ),
  );
  await expect(page.locator(ROOT)).toContainText(shapedInside(en["instrument.pixel.trend"].text));
  // the mix model's three boundaries and its one figure wait in their step
  await expect(sliders(page)).toHaveCount(3);
  await expect(page.locator(`${ROOT} [class*='roFigure']`)).toHaveCount(1);
});

test("places every step's words without crowding the text", async ({ page }) => {
  await page.goto("/instruments/pixel");
  await expect(page.locator(`${ROOT} [data-step]`)).toHaveCount(6, { timeout: 60_000 });
  for (const [id] of PIXEL_STEPS) {
    await openStep(page, id);
    // every step is read before the test fails, so one run names each step that crowds
    expect.soft(await textReport(page, ROOT), `step ${id}`).toEqual({
      overlaps: [],
      small: [],
      outside: [],
    });
  }
});

test("moves a class boundary with the keys and returns to the measured shares", async ({
  page,
}) => {
  await page.goto("/instruments/pixel");
  await expect(page.locator(`${ROOT} [data-step]`)).toHaveCount(6, { timeout: 60_000 });
  await openStep(page, "05");
  await expect(sliders(page).first()).toBeVisible();
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
  await expect(delta).toHaveText(shapedInside(en["instrument.pixel.model.delta"].text));
  await page.keyboard.press("Home");
  await expect.poll(() => values(page)).toEqual(measured);
  await expect(delta).toHaveCount(0);
  await sliders(page).nth(1).press("Shift+ArrowLeft");
  await page
    .locator(`${ROOT} button[class*='textButton']`, {
      hasText: en["instrument.pixel.model.reset"].text,
    })
    .click();
  await expect.poll(() => values(page)).toEqual(measured);
});
