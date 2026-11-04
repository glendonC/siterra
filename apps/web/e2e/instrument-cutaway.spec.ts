import { expect, test, type Page } from "@playwright/test";
import { en } from "../lib/copy/en";
import { instrumentPalette } from "../lib/theme/instruments";
import { shaped } from "./answer";
import { textReport } from "./instrument-text";

// Elevation Bands (approved specimen B) at its design size: the three band blocks and the two published statements
// are placed within the instruments' budget (docs/reference/ux-architecture.md), no hairline is warm (the cut line is
// the one warm line, drawn in the scene), no line of text overlaps another, none is under 12 CSS px or outside the
// frame, each statement waits behind its plain-word label, the headline leads with where greenness changed most in
// words, and the keyboard turns the model and brings it back.

test.use({ viewport: { width: 1440, height: 900 } });

const ROOT = "[data-instrument='cutaway']";

test("keeps within the approved specimen's budget", async ({ page }) => {
  await page.goto("/instruments/cutaway");
  const root = page.locator(ROOT);
  await expect(root.locator("[data-band]").first()).toBeVisible({ timeout: 60_000 });
  await expect(root.locator("[data-band]")).toHaveCount(3);
  await expect(root.locator("[data-statement]")).toHaveCount(2);
  // the section passes the case record's Tabant, and names it once
  await expect(root.locator("[data-place]")).toHaveCount(1);
  await expect(root.locator("[data-place]")).toBeVisible();
  const strokes = await root
    .locator("svg line")
    .evaluateAll((lines) => lines.map((l) => l.getAttribute("stroke")));
  expect(strokes).toHaveLength(6);
  // in either theme the view may follow, no hairline is the accent
  expect(strokes).not.toContain(instrumentPalette("light").accent);
  expect(strokes).not.toContain(instrumentPalette("obsidian").accent);
});

const bandTops = (page: Page) =>
  page
    .locator(`${ROOT} [data-band]`)
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));

test("places the bands and statements without crowding the text, and says the drawn scale in words", async ({
  page,
}) => {
  await page.goto("/instruments/cutaway");
  await expect(page.locator(`${ROOT} [data-band]`).first()).toBeVisible({ timeout: 60_000 });
  for (const el of await page.locator(`${ROOT} [data-band], ${ROOT} [data-statement]`).all())
    await expect(el).toBeVisible();
  await expect(page.locator(`${ROOT} [data-scale-note]`)).toHaveText(
    shaped(en["instrument.layers.scale"].text),
  );
  expect(await textReport(page, ROOT)).toEqual({ overlaps: [], small: [], outside: [] });
});

test("each published statement waits behind its plain-word label and opens its words on focus", async ({
  page,
}) => {
  await page.goto("/instruments/cutaway");
  const chips = page.locator(`${ROOT} [data-statement-chip]`);
  await expect(chips).toHaveText(
    [en["instrument.cutaway.at.upper_slope"].text, en["instrument.cutaway.at.valley_floor"].text],
    { timeout: 60_000 },
  );
  // at rest no statement's words are on the section (decision 16)
  await expect(page.locator(`${ROOT} [data-statement-text]`)).toHaveCount(0);
  for (const id of ["upper_slope", "valley_floor"]) {
    const chip = page.locator(`${ROOT} [data-statement-chip='${id}']`);
    await chip.focus();
    await expect(chip).toHaveAttribute("aria-expanded", "true");
    const words = page.locator(`${ROOT} [data-statement='${id}'] [data-statement-text]`);
    await expect(words).toBeVisible();
    expect((await words.innerText()).length).toBeGreaterThan(20);
    expect(await textReport(page, ROOT)).toEqual({ overlaps: [], small: [], outside: [] });
    await chip.blur();
    await expect(words).toHaveCount(0);
  }
});

test("turns with the arrow keys and returns with Home", async ({ page }) => {
  await page.goto("/instruments/cutaway");
  await expect(page.locator(`${ROOT} [data-band]`).first()).toBeVisible({ timeout: 60_000 });
  const before = await bandTops(page);
  await page.locator(`${ROOT} canvas`).focus();
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(async () => (await bandTops(page)).some((t, i) => Math.abs(t - (before[i] ?? t)) > 0.5))
    .toBe(true);
  await page.keyboard.press("Home");
  await expect
    .poll(async () => (await bandTops(page)).every((t, i) => Math.abs(t - (before[i] ?? t)) <= 0.5))
    .toBe(true);
});

test("the headline comes in at once, with a quiet line while the section is drawn, and leads with words (U28f)", async ({
  page,
}) => {
  await page.goto("/instruments/cutaway");
  const root = page.locator(ROOT);
  const headline = root.locator("[data-cut-headline]");
  await expect(headline).toBeVisible({ timeout: 10_000 });
  await expect(root.locator("[data-band]").first()).toBeVisible({ timeout: 60_000 });
  await expect(root.locator("[data-cut-drawing]")).toHaveCount(0);
  // where greenness changed most, by elevation band, in words; the raw values stay in the band blocks
  await expect(headline.locator("p").first()).toHaveText(
    shaped(en["instrument.cutaway.lead.rose"].text, en["instrument.cutaway.lead.fell"].text),
  );
});
