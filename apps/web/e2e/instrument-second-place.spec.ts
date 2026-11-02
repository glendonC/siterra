import { expect, test } from "@playwright/test";
import { textReport } from "./instrument-text";

// The second place reads as itself (U25): a seed case named in the address opens that place's own demo copy, its
// names, area, question and seasons come from its own record and bundles, and nothing of the first place shows.

test.use({ viewport: { width: 1440, height: 900 } });

const FIRST = /Aït Bouguemez|Bouguemez|Tabant|High Atlas|March to June|September to May/;

test("the second place's overview is its own: its land drawn from its own specs, with its own findings", async ({
  page,
}) => {
  await page.goto("/valley?case=case_calaveras_creek");
  const root = page.locator("[data-overview-root]");
  await expect(root).toContainText("Calaveras Creek catchment", { timeout: 60_000 });
  await expect(root).toContainText(
    "Is grazing changing the rangeland of the Calaveras Creek catchment?",
  );
  await expect(page.locator("[data-case-answer]")).toContainText(
    "Since 2000 no clear change in greenness across the catchment.",
  );
  await expect(root).toContainText("Creek catchment: 257.46 km²");
  // the record holds its land views now (P7b-6): the land is drawn with the findings its specs cite (U25b)
  await expect(page.locator("[data-overview-root][data-ready]")).toBeAttached({ timeout: 90_000 });
  await expect(page.locator("[data-overview-failed]")).toHaveCount(0);
  await expect(page.locator("[data-finding]")).toHaveCount(4);
  expect(await page.locator("body").innerText()).not.toMatch(FIRST);
});

test("the second place's rainfall view uses its own windows and axes", async ({ page }) => {
  await page.goto("/instruments/rainfall?case=case_calaveras_creek");
  const view = page.locator("[data-instrument='rainfall']");
  await expect(view.locator("[data-season]").first()).toBeVisible({ timeout: 60_000 });
  await expect(view).toContainText("October to April rainfall, mm");
  await expect(view).toContainText("February to May NDVI, catchment mean");
  await expect(view).toContainText("The four driest October to April totals");
  await expect(page.locator("[data-crumbs]").last()).toContainText("Calaveras Creek catchment");
  expect(await page.locator("body").innerText()).not.toMatch(FIRST);
});

test("the first place keeps its own seasons", async ({ page }) => {
  await page.goto("/instruments/rainfall?case=case_aitbouguemez");
  const view = page.locator("[data-instrument='rainfall']");
  await expect(view.locator("[data-season]").first()).toBeVisible({ timeout: 60_000 });
  await expect(view).toContainText("September to May rainfall, mm");
  await expect(view).toContainText("March to June NDVI, catchment mean");
});

test("the second place's land views draw from its own record: no snow where it does not apply, its own scale", async ({
  page,
}) => {
  // the layer stack: the sheets the spec names, no snow sheet
  await page.goto("/instruments/layers?case=case_calaveras_creek");
  const layers = page.locator("[data-instrument='layers']");
  await expect(layers.locator("[data-sheet]")).toHaveCount(4, { timeout: 60_000 });
  await expect(layers.locator("[data-sheet='snow']")).toHaveCount(0);
  // the cut: no snow strips, the one line saying why, a vertical scale from its own section, no statement chips
  await page.goto("/instruments/cutaway?case=case_calaveras_creek");
  const cut = page.locator("[data-instrument='cutaway']");
  await expect(cut.locator("[data-band]")).toHaveCount(3, { timeout: 60_000 });
  await expect(cut.locator("[data-no-snow]")).toHaveText(
    "No snow drawn: the sampled winters showed almost none.",
  );
  await expect(cut.locator("[data-statement-chip]")).toHaveCount(0);
  await expect(cut.locator("[data-scale-note]")).not.toContainText("2.5");
  expect(await textReport(page, "[data-instrument='cutaway']")).toEqual({
    overlaps: [],
    small: [],
    outside: [],
  });
  expect(await page.locator("body").innerText()).not.toMatch(FIRST);
});

test("the second place shows both of its area shares, each with its direction", async ({
  page,
}) => {
  await page.goto("/valley?case=case_calaveras_creek");
  const fdr = page.locator("[data-finding='fdr']");
  await expect(fdr).toContainText("No places pass trend check", { timeout: 60_000 });
  await expect(fdr).toContainText("0.0% greening, 0.0% browning");
});

test("the second place's pixel asks its own question, not the first place's", async ({ page }) => {
  await page.goto("/instruments/pixel?case=case_calaveras_creek");
  const view = page.locator("[data-instrument='pixel']");
  await expect(view).toContainText("What is one pixel's trend made of?", { timeout: 60_000 });
  await expect(view).not.toContainText("greener while its pasture");
});

test("the first place's pixel asks the question its record states", async ({ page }) => {
  await page.goto("/instruments/pixel?case=case_aitbouguemez");
  await expect(page.locator("[data-instrument='pixel']")).toContainText(
    "Why can a pixel get greener while its pasture does not?",
    { timeout: 60_000 },
  );
});

test("the second place's field check card has no context step and no species line, its record publishing none", async ({
  page,
}) => {
  await page.goto("/valley?case=case_calaveras_creek");
  await expect(page.locator("[data-overview-root][data-ready]")).toBeAttached({ timeout: 90_000 });
  await page.locator("[data-finding='pixel']").click();
  await page.locator("[data-record] [data-actions] a").first().click();
  const view = page.locator("[data-instrument='pixel'][data-around]");
  await view.locator("[data-chip='06']").click();
  const card = view.locator("[data-part='06']");
  await expect(card).toContainText("Proposed field check. Not measured.");
  await expect(card.getByText("Records plant cover by species and palatability")).toBeVisible();
  await expect(card.locator("[data-field-context-step]")).toHaveCount(0);
  await expect(card).not.toContainText("No spectrum");
});

test("a view opened in place keeps the place in the address, so a reload stays on the second place", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/valley?case=case_calaveras_creek");
  await expect(page.locator("[data-overview-root][data-ready]")).toBeAttached({ timeout: 90_000 });
  await page.locator("[data-finding='rain']").click();
  await page.locator("[data-record] [data-actions] a").nth(1).click();
  await expect(page).toHaveURL(/\/instruments\/layers\?case=case_calaveras_creek$/, {
    timeout: 15_000,
  });
  await page.reload();
  await expect(page.locator("[data-crumbs]").last()).toContainText("Calaveras Creek catchment", {
    timeout: 90_000,
  });
  await expect(page).toHaveURL(/case=case_calaveras_creek/);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/valley\?case=case_calaveras_creek$/, { timeout: 15_000 });
});
