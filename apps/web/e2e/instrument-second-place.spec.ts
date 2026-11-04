import { expect, test } from "@playwright/test";
import { en, format } from "../lib/copy/en";
import { rformat } from "../lib/copy/readout";
import {
  answerOf,
  atTheAnswer,
  loadedRecord,
  openView,
  readoutOn,
  shaped,
  shapedInside,
  viewsOf,
} from "./answer";
import { textReport } from "./instrument-text";

// The second place reads as itself (U25): a seed case named in the address opens that place's own demo copy, its
// names, area, question, answer and seasons come from its own record and bundles, and nothing of the first place
// shows. Its overview opens on its own answer (UI-2), whose views open its own land views.

test.use({ viewport: { width: 1440, height: 900 } });

const FIRST = /Aït Bouguemez|Bouguemez|Tabant|High Atlas|March to June|September to May/;
const SECOND = "/valley?case=case_calaveras_creek";

test("the second place's overview is its own: its land drawn from its own specs, and its own answer on it", async ({
  page,
}) => {
  const record = loadedRecord(page);
  // the record holds its land views now (P7b-6): the land is drawn, and its answer opens on it (U25b)
  const readout = await atTheAnswer(page, SECOND);
  await expect(page.locator("[data-overview-failed]")).toHaveCount(0);
  const root = page.locator("[data-overview-root]");
  await expect(root).toContainText("Calaveras Creek catchment");
  await expect(readout.locator("[data-run-question]")).toHaveText(
    "Is grazing changing the rangeland of the Calaveras Creek catchment?",
  );
  await expect(root).toContainText("Creek catchment: 257.46 km²");
  // its answer is its own record's: both of its shares are exactly zero, said in words (lib/readout/readout.ts)
  const { snapshot, listing } = await record;
  const { answer } = answerOf(snapshot, listing);
  expect(answer.claim).toBe(rformat("readout.answer.sharesNone", { from: answer.from ?? "" }));
  await expect(readout.locator("[data-readout-answer]")).toHaveText(answer.claim ?? "");
  // its findings are its own: the sheet its answer reads lifted on its own land, and the views its specs hold
  await expect(root.locator("[data-layer-stack] [data-sheet='trend']")).toHaveCSS(
    "visibility",
    "visible",
    { timeout: 15_000 },
  );
  await expect(readout.locator("[data-readout-views] button")).toHaveText(
    viewsOf(snapshot, listing).map((v) => `${v.key}${v.label}`),
  );
  expect(await page.locator("body").innerText()).not.toMatch(FIRST);
});

test("the second place's rainfall view uses its own windows and axes", async ({ page }) => {
  await page.goto("/instruments/rainfall?case=case_calaveras_creek");
  const view = page.locator("[data-instrument='rainfall']");
  await expect(view.locator("[data-season]").first()).toBeVisible({ timeout: 60_000 });
  await expect(view).toContainText(
    format("instrument.scatter.axis.rain", { window: "October to April" }),
  );
  await expect(view).toContainText(
    format("instrument.scatter.axis.ndvi", { window: "February to May" }),
  );
  await expect(view).toContainText(
    format("instrument.scatter.key.driest", { window: "October to April" }),
  );
  await expect(page.locator("[data-crumbs]").last()).toContainText("Calaveras Creek catchment");
  expect(await page.locator("body").innerText()).not.toMatch(FIRST);
});

test("the first place keeps its own seasons", async ({ page }) => {
  await page.goto("/instruments/rainfall?case=case_aitbouguemez");
  const view = page.locator("[data-instrument='rainfall']");
  await expect(view.locator("[data-season]").first()).toBeVisible({ timeout: 60_000 });
  await expect(view).toContainText(
    format("instrument.scatter.axis.rain", { window: "September to May" }),
  );
  await expect(view).toContainText(
    format("instrument.scatter.axis.ndvi", { window: "March to June" }),
  );
});

test("the second place's land views draw from its own record: no snow where it does not apply, its own scale", async ({
  page,
}) => {
  // (its Map Layers split, four sheets and no snow, is in instrument-layers.spec.ts)
  // the cut: no snow strips, the one line saying why, a vertical scale from its own section, no statement labels
  await page.goto("/instruments/cutaway?case=case_calaveras_creek");
  const cut = page.locator("[data-instrument='cutaway']");
  await expect(cut.locator("[data-band]")).toHaveCount(3, { timeout: 60_000 });
  await expect(cut.locator("[data-no-snow]")).toHaveText(en["instrument.cutaway.noSnow"].text);
  await expect(cut.locator("[data-statement-chip]")).toHaveCount(0);
  await expect(cut.locator("[data-scale-note]")).toHaveText(
    shaped(en["instrument.layers.scale"].text),
  );
  await expect(cut.locator("[data-scale-note]")).not.toContainText("2.5");
  expect(await textReport(page, "[data-instrument='cutaway']")).toEqual({
    overlaps: [],
    small: [],
    outside: [],
  });
  expect(await page.locator("body").innerText()).not.toMatch(FIRST);
});

test("the second place's answer states both of its area shares, each with its direction, since its record's first year", async ({
  page,
}) => {
  const record = loadedRecord(page);
  const readout = await atTheAnswer(page, SECOND);
  const { snapshot, listing } = await record;
  const { answer } = answerOf(snapshot, listing);
  // a measured claim that reads both shares from the same years, greening and browning
  expect(answer.claimKind).toBe("measurement");
  expect(answer.claimIds).toHaveLength(2);
  expect(answer.from).toMatch(/^\d{4}$/);
  const sentence = readout.locator("[data-readout-answer]");
  await expect(sentence).toContainText(`Since ${answer.from ?? ""}`);
  await expect(sentence).toContainText("greened");
  await expect(sentence).toContainText("browned");
});

/** What a pixel did, in any of the catalog's ways of saying it. */
const PIXEL_LEAD = shapedInside(
  en["instrument.pixel.lead.greener"].text,
  en["instrument.pixel.lead.browner"].text,
  en["instrument.pixel.lead.flat"].text,
);

test("the second place's pixel says what its own pixel did, over its own season, and nothing of the first place's", async ({
  page,
}) => {
  await page.goto("/instruments/pixel?case=case_calaveras_creek");
  const view = page.locator("[data-instrument='pixel']");
  await expect(view.locator("[data-step]")).toHaveCount(6, { timeout: 60_000 });
  await expect(view).toContainText(PIXEL_LEAD);
  await expect(view).toContainText(
    shapedInside(format("instrument.pixel.trend", { window: "February to May" })),
  );
  expect(await page.locator("body").innerText()).not.toMatch(FIRST);
});

test("the first place's pixel says what its own pixel did, over its own season", async ({
  page,
}) => {
  await page.goto("/instruments/pixel?case=case_aitbouguemez");
  const view = page.locator("[data-instrument='pixel']");
  await expect(view.locator("[data-step]")).toHaveCount(6, { timeout: 60_000 });
  await expect(view).toContainText(PIXEL_LEAD);
  await expect(view).toContainText(
    shapedInside(format("instrument.pixel.trend", { window: "March to June" })),
  );
});

test("the second place's field check step has no published context and no species line, its record publishing none", async ({
  page,
}) => {
  await atTheAnswer(page, SECOND);
  await openView(page, "pixel");
  const view = page.locator("[data-instrument='pixel'][data-around]");
  await view.locator("[data-step='06']").click();
  await expect(view.locator("[data-step='06']")).toHaveAttribute("aria-expanded", "true");
  const part = view.locator("[data-part='06']");
  await expect(part).toContainText(en["instrument.pixel.field.proposed"].text);
  await expect(part).toContainText(en["instrument.pixel.field.records"].text);
  await expect(part).not.toContainText(en["instrument.pixel.field.noSpectrum"].text);
  await expect(part).not.toContainText(/et al\./);
});

test("a view opened in place keeps the place in the address, so a reload stays on the second place", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await atTheAnswer(page, SECOND);
  // the cut through the elevation bands (Map Layers splits the land in place instead, with no address of its own)
  await openView(page, "cutaway");
  await expect(page).toHaveURL(/\/instruments\/cutaway\?case=case_calaveras_creek$/, {
    timeout: 15_000,
  });
  await page.reload();
  await expect(page.locator("[data-crumbs]").last()).toContainText("Calaveras Creek catchment", {
    timeout: 90_000,
  });
  await expect(page).toHaveURL(/case=case_calaveras_creek/);
  // Esc goes back to the second place's own answer, under its own address
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/valley\?case=case_calaveras_creek$/, { timeout: 15_000 });
  await expect(readoutOn(page)).toBeVisible({ timeout: 90_000 });
  await expect(readoutOn(page).locator("[data-run-question]")).toHaveText(
    "Is grazing changing the rangeland of the Calaveras Creek catchment?",
  );
});
