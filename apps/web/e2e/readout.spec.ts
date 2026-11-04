import { expect, test, type Page } from "@playwright/test";
import { OPEN_MAP_MIN, unionArea } from "../lib/budget/measure";
import { en } from "../lib/copy/en";
import { ly } from "../lib/copy/layers";
import { rd } from "../lib/copy/readout";
import { nextWords } from "../lib/readout/readout";
import {
  RECORD_WORDS,
  answerOf,
  atTheAnswer,
  crumbsOf,
  keyOf,
  keysOf,
  loadedRecord,
  readoutOn,
  recorded,
  shownLabels,
  shownSheets,
  viewsOf,
} from "./answer";
import { WORKSPACE, countState } from "./budget";
import { sharedCase } from "./demo-case";

// The answer (UI-2), the overview's home: once the land arrives at /valley it opens by itself on the case record, as
// one sheet: the question, the answer in one sentence, the verdicts on the explanations the sentence does not name,
// what each field check would tell apart (Next), the views each one key away (Look closer), and the review the plan
// asks for. /valley?run=<command id> is that run's own answer, which T swaps with its Analysis Steps. Every expected
// word is derived from the record the page loaded, or the recorded run's fixture, through lib/readout/readout.ts.

test.use({ viewport: { width: 1440, height: 900 } });

const PLACE = "Aït Bouguemez valley";
const HOME = () => `/valley?case=${sharedCase()}`;
const RUN = () => `/valley?case=${sharedCase()}&run=${recorded.commandId}`;

/** Opens an answer by its address and returns it with the record it reads and the model it should show. */
async function openAnswer(page: Page, path = HOME()) {
  const record = loadedRecord(page);
  const readout = await atTheAnswer(page, path);
  const { snapshot, listing } = await record;
  return { readout, snapshot, listing };
}

test("the land arrives on the answer: it opens by itself at /valley and says the case's answer in one sentence, in a visitor's words", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { readout, snapshot, listing } = await openAnswer(page);
  const model = answerOf(snapshot, listing);
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-readout", "");
  await expect(readout).toHaveCount(1);
  // the address stays the overview's, and the crumb names the answer
  await expect(page).toHaveURL(new RegExp(`/valley\\?case=${sharedCase()}$`));
  expect(await crumbsOf(page)).toEqual([PLACE, en["overview.crumb.results"].text]);
  // the case's own question, and the answer in one sentence: what the long record measured since its first year
  await expect(readout.locator("[data-run-question]")).toHaveText(snapshot.case.objective);
  expect(model.answer.claimKind).toBe("measurement");
  expect(model.answer.claim).toMatch(/^Since \d{4}, /);
  await expect(readout.locator("[data-readout-answer]")).toHaveText(model.answer.claim ?? "");
  // no tag or chip under it, and none of the record's own vocabulary anywhere in the column
  await expect(readout.locator("[data-readout-kind]")).toHaveCount(0);
  expect(await readout.innerText()).not.toMatch(RECORD_WORDS);
  // nothing of the old resting screen: no finding label round the arc, no See the Findings key
  await expect.poll(() => shownLabels(page)).toBe(0);
  await expect(keyOf(page, "↵")).toHaveCount(0);
  // the land settles on the sheet the answer reads, the vegetation trend, its label beside it
  await expect.poll(() => shownSheets(page), { timeout: 15_000 }).toEqual(["trend"]);
  await expect(page.locator("[data-layer-stack] [data-sheet='trend']")).toContainText(
    ly["layers.name.trend"].text,
  );
});

test("the verdicts list each explanation the sentence does not name, under Fits, Not enough data or Does not fit; Next says what each check would tell apart", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { readout, snapshot, listing } = await openAnswer(page);
  const model = answerOf(snapshot, listing);
  // one row per verdict, in the record's order within it, each explanation once
  const grid = readout.locator("[data-readout-group='explanations']");
  await expect(grid.locator("dt")).toHaveText(
    model.verdicts.map((v) => rd[`readout.verdict.${v.status}`].text),
  );
  for (const v of model.verdicts)
    await expect(grid.locator(`[data-verdict='${v.status}'] [data-readout-branch]`)).toHaveText(
      v.rows.map((r) => `${r.label}${r.stale ? ` (${rd["readout.verdict.stale"].text})` : ""}`),
    );
  // every explanation the record holds is said once: in the answer's sentence or in the grid
  const shown = model.verdicts.flatMap((v) => v.rows.map((r) => r.explanationId));
  const named = model.answer.claimKind === "status" ? model.answer.claimIds : [];
  expect([...shown, ...named].sort()).toEqual(
    (model.explanations?.rows ?? []).map((r) => r.explanationId).sort(),
  );
  await expect(readout.locator("[data-readout-branch]")).toHaveCount(shown.length);
  // nothing in the grid is a control, and the arrows and Enter step through nothing
  await expect(grid.locator("button")).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  await expect(readout.locator("[data-selected], [aria-expanded='true']")).toHaveCount(0);
  await expect(readoutOn(page)).toBeVisible();

  // Next: one sentence per check of the field plan, in its order; a check drawn on the land is a button
  const checks = model.ground?.checks ?? [];
  expect(checks.length).toBeGreaterThan(0);
  const rows = readout.locator("[data-readout-group='ground'] [data-readout-check]");
  await expect(readout.locator("[data-readout-group='ground'] dt")).toHaveText(
    rd["readout.next.head"].text,
  );
  await expect(rows).toHaveText(checks.map((c) => nextWords(c)));
  for (const [i, c] of checks.entries()) {
    await expect(rows.nth(i)).toHaveAttribute("data-readout-check", c.fieldCheckId ?? c.number);
    await expect(rows.nth(i).locator("button")).toHaveCount(c.drawn ? 1 : 0);
  }
});

test("a drawn check lights its place on the land and names it there; pressed again it hands the land back to the answer's sheet", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { readout, snapshot, listing } = await openAnswer(page);
  const checks = answerOf(snapshot, listing).ground?.checks ?? [];
  const drawn = checks.find((c) => c.drawn);
  if (!drawn) throw new Error("the plan holds no check drawn on the land");
  await expect.poll(() => shownSheets(page), { timeout: 15_000 }).toEqual(["trend"]);
  const button = readout.locator(
    `[data-readout-check='${drawn.fieldCheckId ?? drawn.number}'] button`,
  );
  const place = page.locator("[data-readout-place]");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(place).toHaveCSS("visibility", "visible");
  // the place in the plan's own words; the column already names the check
  await expect(place.locator("b")).toHaveText(drawn.place ?? drawn.what);
  await expect(place).not.toContainText(drawn.number);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(place).toHaveCount(0);
  await expect.poll(() => shownSheets(page), { timeout: 10_000 }).toEqual(["trend"]);
});

test("Look closer: each view one key away; Map Layers splits the land in place and Esc settles it; a view opens in place and Esc comes straight back", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { readout, snapshot, listing } = await openAnswer(page);
  const views = viewsOf(snapshot, listing);
  const rows = readout.locator("[data-readout-views] button");
  await expect(readout.locator("[data-readout-views] dt")).toHaveText(
    rd["readout.views.head"].text,
  );
  await expect(rows).toHaveText(views.map((v) => `${v.key}${v.label}`));
  await expect.poll(() => shownSheets(page), { timeout: 15_000 }).toEqual(["trend"]);

  // Map Layers: the land splits into its sheets beside the answer, its row pressed, the address unchanged
  const layers = views.find((v) => v.kind === "layers");
  if (!layers) throw new Error("the case offers no Map Layers");
  const layersRow = rows.nth(Number(layers.key) - 1);
  await expect(layersRow).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press(layers.key);
  await expect(layersRow).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await shownSheets(page)).length).toBeGreaterThan(2);
  await expect(page).toHaveURL(new RegExp(`/valley\\?case=${sharedCase()}$`));
  await expect(readoutOn(page)).toBeVisible();
  // Esc settles it and leaves the answer where it is
  await page.keyboard.press("Escape");
  await expect(layersRow).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => shownSheets(page), { timeout: 10_000 }).toEqual(["trend"]);
  await expect(readoutOn(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/valley\\?case=${sharedCase()}$`));

  // the cut through the bands opens in place under its own address and name; Esc brings the answer back at once
  const cut = views.find((v) => v.kind === "cutaway");
  if (!cut) throw new Error("the case offers no cut through the bands");
  await page.keyboard.press(cut.key);
  await expect(page).toHaveURL(new RegExp(`${cut.href}\\?case=${sharedCase()}$`), {
    timeout: 15_000,
  });
  await expect(page.locator("[data-instrument='cutaway']").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect
    .poll(async () => (await crumbsOf(page)).slice(-3))
    .toEqual([PLACE, en["overview.crumb.results"].text, cut.label]);
  await page.keyboard.press("Escape");
  await expect(readoutOn(page)).toBeVisible({ timeout: 2_000 });
  await expect(page).toHaveURL(new RegExp(`/valley\\?case=${sharedCase()}$`));
  await expect(page.locator("[data-instrument]")).toHaveCount(0, { timeout: 10_000 });
});

test("the key bar on the case's answer: 1 to N Look Closer, E Export Brief, / Ask, S Sources, W Limits, Esc Back last; Esc and Back go to the Landing", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { snapshot, listing } = await openAnswer(page);
  const n = viewsOf(snapshot, listing).length;
  // the record holds a brief, so E exports it; the case's own answer has no steps of its own, so no T
  expect(snapshot.records.briefRecords.length).toBeGreaterThan(0);
  await expect(keysOf(page)).toHaveText([
    `1 to ${String(n)}${rd["readout.key.views"].text}`,
    `E${rd["readout.key.brief"].text}`,
    `/${en["chrome.key.ask"].text}`,
    `S${en["chrome.key.sources"].text}`,
    `W${en["chrome.key.scope"].text}`,
    `Esc${en["chrome.key.back"].text}`,
  ]);
  // T does nothing here: the recorded run asked another question
  await page.keyboard.press("t");
  await page.waitForTimeout(1_500);
  await expect(page.locator("[data-at-work]")).toHaveCount(0);
  await expect(readoutOn(page)).toBeVisible();
  // Esc leaves the place for the Landing
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/\?start$/);
});

test("the key bar's Back and the place crumb from the answer go to the Landing too", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await atTheAnswer(page, HOME());
  await keyOf(page, "Esc").click();
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  // the Landing opened the visitor a demo copy of their own (a first visit, to it): its answer has the same crumbs
  await atTheAnswer(page, "/valley");
  await page.locator("[data-crumbs]").getByRole("button", { name: PLACE }).click();
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
});

test("the run's answer lives at /valley?run=: its own question and sentence; T shows its steps and T again comes back; a reload keeps it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { readout, snapshot, listing } = await openAnswer(page, RUN());
  const run = answerOf(recorded.snapshot, listing);
  await expect(readout.locator("[data-run-question]")).toHaveText(recorded.question);
  expect(run.answer.claimKind).toBe("status");
  await expect(readout.locator("[data-readout-answer]")).toHaveText(run.answer.claim ?? "");
  expect(await readout.innerText()).not.toMatch(RECORD_WORDS);
  // its own verdicts, and its own record: no brief to export, no review; T for its steps
  await expect(readout.locator("[data-readout-group='explanations'] dt")).toHaveText(
    run.verdicts.map((v) => rd[`readout.verdict.${v.status}`].text),
  );
  await expect(readout.locator("[data-readout-review]")).toHaveCount(0);
  // the views are the place's own, whichever record the answer reads
  await expect(keysOf(page)).toHaveText([
    `1 to ${String(viewsOf(snapshot, listing).length)}${rd["readout.key.views"].text}`,
    `T${en["chrome.key.thinking"].text}`,
    `/${en["chrome.key.ask"].text}`,
    `S${en["chrome.key.sources"].text}`,
    `W${en["chrome.key.scope"].text}`,
    `Esc${en["chrome.key.back"].text}`,
  ]);

  // T: the run's steps under their own crumb; steps opened by T stay until T again
  const steps = page.locator("[data-at-work][data-run-layer]");
  await page.keyboard.press("t");
  await expect(steps).toBeVisible({ timeout: 15_000 });
  await expect(steps.locator("[data-run-question]")).toHaveText(recorded.question);
  expect(await crumbsOf(page)).toEqual([PLACE, en["chrome.key.thinking"].text]);
  await expect(keyOf(page, "T")).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(6_000);
  await expect(steps).toBeVisible();
  await expect(page.locator("[data-readout]")).toHaveCount(0);
  await page.keyboard.press("t");
  await expect(readoutOn(page)).toBeVisible({ timeout: 15_000 });
  await expect(readoutOn(page).locator("[data-readout-answer]")).toHaveText(run.answer.claim ?? "");
  await expect(page).toHaveURL(new RegExp(`[?&]run=${recorded.commandId}`));

  // a reload keeps the run's answer; the plain address is the case's own
  await page.reload();
  await expect(readoutOn(page).locator("[data-readout-answer]")).toHaveText(
    run.answer.claim ?? "",
    {
      timeout: 90_000,
    },
  );
  await atTheAnswer(page, HOME());
  await expect(readoutOn(page).locator("[data-run-question]")).not.toHaveText(recorded.question);
});

test("a run that plays hands over to its own answer by itself once it is done, and each input restarts the wait", async ({
  page,
}) => {
  test.setTimeout(240_000);
  // the first place's recorded run, played from its start (as the journey's arrival plays it)
  await page.goto(`/valley?case=${sharedCase()}&mode=run`);
  const steps = page.locator("[data-at-work][data-run-layer]");
  await expect(steps).toBeVisible({ timeout: 90_000 });
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-at-work", "done", {
    timeout: 120_000,
  });
  // a key every 2.5 s: without the restarts the answer would have taken over 4 s after the run was done
  for (let i = 0; i < 3; i++) {
    await expect(steps).toBeVisible();
    await page.keyboard.press("Shift");
    await page.waitForTimeout(2_500);
  }
  await expect(steps).toBeVisible();
  await expect(page.locator("[data-readout]")).toHaveCount(0);
  // left alone, it hands over to the run's own answer, which the address then names
  await expect(readoutOn(page)).toBeVisible({ timeout: 10_000 });
  await expect(steps).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`[?&]run=${recorded.commandId}`));
  await expect(readoutOn(page).locator("[data-run-question]")).toHaveText(recorded.question);
});

// The answer's islands: its rail, which runs from the question to above the key bar (the answer's own root spans the
// viewport and draws nothing, so its children are counted), the breadcrumb and the key bar. Anything else counted on
// screen covers the map by its own box.
const ISLANDS = ["[data-overview-root] [data-readout] > *", "[data-crumbs]", "[data-key-legend]"];

/** The state's count once it has settled (two readings 250 ms apart agree), with its unobstructed map share. */
async function settledCount(page: Page, label: string) {
  let last = "";
  for (let i = 0; i < 24; i++) {
    const count = await countState(page, { islands: ISLANDS });
    const key = JSON.stringify(count);
    if (key === last) {
      const { width, height } = count.viewport;
      const openMap = 1 - unionArea(count.covering, count.viewport) / (width * height);
      test.info().annotations.push({
        type: `budget: ${label} at ${String(width)} by ${String(height)}`,
        description: `${String(count.textItems.length)} text items, ${String(count.controls.length)} controls, ${String(count.expanded.length)} expanded, ${(openMap * 100).toFixed(1)}% of the map unobstructed`,
      });
      return { ...count, openMap };
    }
    last = key;
    await page.waitForTimeout(250);
  }
  throw new Error(`the ${label} state did not settle`);
}

for (const size of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test.describe(`at ${String(size.width)} by ${String(size.height)}`, () => {
    test.use({ viewport: size });

    test("the answer's reading state keeps the visual budget: 40 text items, 19 controls, 2 expanded, 55% of the map open", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const { snapshot, listing } = await openAnswer(page);
      // the land is drawn, so the open map is the map; the first visit's split has settled
      await expect(page.locator("[data-overview-failed]")).toHaveCount(0);
      await expect.poll(() => shownSheets(page), { timeout: 15_000 }).toEqual(["trend"]);
      const reading = await settledCount(page, "reading");
      // the count reads the answer, not an empty screen: its sentence (an item is cut to 60 characters) and Next
      expect(reading.textItems).toContain(
        (answerOf(snapshot, listing).answer.claim ?? "").slice(0, 60),
      );
      expect(reading.textItems).toContain(rd["readout.next.head"].text);
      // each limit is checked on its own (soft), so one run reports every number
      expect
        .soft(reading.textItems.length, reading.textItems.join(" | "))
        .toBeLessThanOrEqual(WORKSPACE.reading.textItems);
      expect
        .soft(reading.controls.length, reading.controls.join(" | "))
        .toBeLessThanOrEqual(WORKSPACE.reading.controls);
      expect
        .soft(reading.expanded.length, reading.expanded.join(" | "))
        .toBeLessThanOrEqual(WORKSPACE.reading.expanded);
      expect.soft(reading.openMap).toBeGreaterThanOrEqual(OPEN_MAP_MIN.reading);
    });
  });
}
