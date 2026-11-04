import { expect, test, type Page } from "@playwright/test";
import { en, format } from "../lib/copy/en";
import { textReport } from "./instrument-text";

// Rain and Greenness at its design size: one point per season (26), the four driest September to May totals ringed
// and labelled, a headline in plain words on how greenness follows rainfall year to year (never a raw value), the fit's
// R squared, slope and gate in the notes beside the plot, every total labelled with its window, and no line of text
// overlapping another, under 12 CSS px or outside the frame. The first place's windows are March to June (greenness)
// and September to May (rainfall), as its bundle states them.

test.use({ viewport: { width: 1440, height: 900 } });

const ROOT = "[data-instrument='rainfall']";
const GROWING = "March to June";
const RAINFALL = "September to May";

/** The view's words with its spaces made plain (the notes keep a number with its words by a no-break space). */
const wordsOf = async (page: Page) => (await page.locator(ROOT).innerText()).replace(/\s+/g, " ");

test("draws the 26 seasons, rings the four driest and leads with what the plot shows year to year", async ({
  page,
}) => {
  await page.goto("/instruments/rainfall");
  await expect(page.locator(`${ROOT} [data-season]`)).toHaveCount(26, { timeout: 60_000 });
  const driest = await page
    .locator(`${ROOT} [data-driest]`)
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-driest")));
  expect(driest).toEqual(["2001", "2024", "2016", "2023"]);
  const text = await wordsOf(page);
  // the headline: the fit's interval for its slope includes zero, so greenness follows rainfall only weakly
  expect(text).toContain(
    format("instrument.scatter.lead.weak", { growing: GROWING, rainfall: RAINFALL }),
  );
  expect(text).not.toContain("NDVI per decade");
  expect(text).toContain(format("instrument.scatter.axis.rain", { window: RAINFALL }));
  expect(text).toContain(format("instrument.scatter.axis.ndvi", { window: GROWING }));
  for (const label of ["2001, 369 mm", "2024, 391 mm", "2016, 419 mm", "2023, 421 mm"])
    expect(text).toContain(label);
  // the case's November to April totals never show here
  expect(text).not.toContain("November to April");
});

test("keeps the fit's numbers in the notes beside the plot: R squared and what it cannot say, the slope, the gate", async ({
  page,
}) => {
  await page.goto("/instruments/rainfall");
  await expect(page.locator(`${ROOT} [data-season]`)).toHaveCount(26, { timeout: 60_000 });
  const notes = page.locator(`${ROOT} [data-scatter-details]`);
  await expect(notes).toBeVisible();
  const said = (await notes.innerText()).replace(/\s+/g, " ");
  expect(said).toContain(format("instrument.scatter.r2", { r2: "0.037" }));
  expect(said).toMatch(/Each 100 mm more rain went with [+-]?\d\.\d{4} NDVI \(95% interval /);
  expect(said).toContain(en["instrument.scatter.gate"].text);
});

test("places the plot and its words without crowding the text", async ({ page }) => {
  await page.goto("/instruments/rainfall");
  await expect(page.locator(`${ROOT} [data-season]`)).toHaveCount(26, { timeout: 60_000 });
  expect(await textReport(page, ROOT)).toEqual({ overlaps: [], small: [], outside: [] });
});
