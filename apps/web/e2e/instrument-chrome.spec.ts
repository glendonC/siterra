import { expect, test, type Page } from "@playwright/test";
import { en } from "../lib/copy/en";
import { VIEW_LABEL } from "../lib/overview/actions";
import { overlayView } from "../lib/sources/overlay";
import {
  atTheAnswer,
  columnBox,
  crumbsOf,
  keysOf,
  loadedRecord,
  openView,
  readoutOn,
  shownLabels,
  viewsOf,
} from "./answer";

// The controls every screen after the opening shares (decisions 1 to 4, 30 Oct 2026): the breadcrumb that starts at
// the place, Esc one level back, S the sources and W the limits (one overlay, its tab by the key), the theme toggle
// where the answer has it, and the keys that work now, Esc Back last, on the overview and in a view. The overview's
// home is the answer (UI-2), which offers no view reset. Enter is never pressed in the ask here.

const PLACE = "Aït Bouguemez valley";
const FINDINGS = en["overview.crumb.results"].text;

const overlay = (page: Page, tab?: "sources" | "limits") =>
  page.locator(tab ? `[data-sources-overlay][data-tab='${tab}']` : "[data-sources-overlay]");

test.use({ viewport: { width: 1440, height: 900 } });

test("the overview's answer: one key bar, S the sources, W the limits, Esc one level at a time", async ({
  page,
}) => {
  const record = loadedRecord(page);
  await atTheAnswer(page);
  const { snapshot, listing } = await record;
  // the top left holds the place and the answer's crumb
  expect(await crumbsOf(page)).toEqual([PLACE, FINDINGS]);
  // the case answer's keys: its views, the brief (the case holds one), the ask, the sources, the limits, Back last;
  // no Analysis Steps (a run's answer has them), no view reset, no See the Findings, no species key
  const n = viewsOf(snapshot, listing).length;
  expect(
    await keysOf(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-key"))),
  ).toEqual([n > 1 ? `1 to ${String(n)}` : "1", "E", "/", "S", "W", "Esc"]);
  // nothing else floats on the overview: no thinking pill, no data line, no ask circle, no view cluster, no
  // bottom-left legend, no mode line
  for (const gone of [
    "[data-thinking-toggle]",
    "[data-sources-line]",
    "[data-ask]",
    "[data-view-control]",
    "[data-routes-entry]",
    "[data-verdict-entry]",
    "[data-mode-line]",
  ])
    await expect(page.locator(gone), gone).toHaveCount(0);
  // W opens the record's own limits under their plain headings; S switches the same overlay to the sources; Esc
  // closes it before anything else
  const { side, main } = overlayView(snapshot).limits;
  await page.keyboard.press("w");
  await expect(overlay(page, "limits").locator("[data-limits] > :first-child")).toHaveText(
    [...side, ...main].map((s) => s.heading),
  );
  await page.keyboard.press("s");
  await expect(overlay(page, "sources")).toBeVisible();
  await expect(overlay(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(overlay(page)).toHaveCount(0);
  await expect(readoutOn(page)).toBeVisible();
  // a view one level down, and Esc back up to the answer at once
  await openView(page, "cutaway");
  await expect
    .poll(async () => (await crumbsOf(page)).slice(-3))
    .toEqual([PLACE, FINDINGS, en[VIEW_LABEL.cutaway].text]);
  await page.keyboard.press("Escape");
  await expect(readoutOn(page)).toBeVisible({ timeout: 2_000 });
  await expect.poll(() => crumbsOf(page)).toEqual([PLACE, FINDINGS]);
  // S opens the sources, S again closes them; Esc closes them before it goes back a level
  await page.keyboard.press("s");
  await expect(overlay(page, "sources")).toBeVisible();
  await page.keyboard.press("s");
  await expect(overlay(page)).toHaveCount(0);
  await page.keyboard.press("s");
  await expect(overlay(page, "sources")).toBeVisible();
  // its close is the key bar's Esc and the word beside it
  await expect(overlay(page).locator("[data-sources-close]")).toHaveText(
    `Esc${en["chrome.close"].text}`,
  );
  await page.keyboard.press("Escape");
  await expect(overlay(page)).toHaveCount(0);
  await expect(readoutOn(page)).toBeVisible();
  // at the top level, Esc returns to the opening
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
});

test("a view by its address: the trail from its place, R and the view control on a 3D view, the theme toggle, Esc back to the answer", async ({
  page,
}) => {
  await page.goto("/instruments/cutaway");
  await expect(page.locator("[data-band]").first()).toBeVisible({ timeout: 60_000 });
  expect(await crumbsOf(page)).toEqual([PLACE, FINDINGS, en[VIEW_LABEL.cutaway].text]);
  await expect(page.locator("[data-view-control]")).toBeVisible();
  await expect(keysOf(page)).toHaveText(["/Ask", "SSources", "WLimits", "EscBack"]);
  // the theme toggle switches the view's theme
  const shell = page.locator("[data-shell='cutaway']");
  const before = await shell.getAttribute("data-theme");
  await page.locator("[data-theme-toggle]").click();
  await expect(shell).toHaveAttribute("data-theme", before === "obsidian" ? "light" : "obsidian");
  await page.keyboard.press("s");
  await expect(overlay(page, "sources")).toBeVisible();
  // the tab bar switches between the two
  await overlay(page).locator("[data-sources-tab='limits']").click();
  await expect(overlay(page, "limits")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay(page)).toHaveCount(0);
  await page.keyboard.press("w");
  await expect(overlay(page, "limits")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/valley$/);
  await expect(readoutOn(page)).toBeVisible({ timeout: 90_000 });
});

test("a flat view offers no view control and no R", async ({ page }) => {
  await page.goto("/instruments/rainfall");
  await expect(page.locator("[data-season]").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-view-control]")).toHaveCount(0);
  await expect(keysOf(page)).toHaveText(["/Ask", "SSources", "WLimits", "EscBack"]);
});

test("the answer's sheet is named on the land, clear of the column and the key bar, and the land still turns under it", async ({
  page,
}) => {
  const readout = await atTheAnswer(page);
  // the measured finding's sheet stands on the land as the answer's proof, named right of the column; no finding
  // label is left round the arc
  const sheet = page.locator("[data-overview-root] [data-layer-stack] [data-sheet='trend']");
  await expect(sheet).toHaveCSS("visibility", "visible", { timeout: 15_000 });
  await expect.poll(() => shownLabels(page)).toBe(0);
  /** A box drawn by an element and its children (the label's own box is placed by a transform). */
  const drawn = () =>
    sheet.evaluate((el) => {
      const rs = [el, ...Array.from(el.querySelectorAll("*"))]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      const x0 = Math.min(...rs.map((r) => r.left));
      const y0 = Math.min(...rs.map((r) => r.top));
      return {
        x: x0,
        y: y0,
        width: Math.max(...rs.map((r) => r.right)) - x0,
        height: Math.max(...rs.map((r) => r.bottom)) - y0,
      };
    });
  const meet = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const [caption, rail, keys] = await Promise.all([
    drawn(),
    columnBox(page),
    page.locator("[data-key-legend]").boundingBox(),
  ]);
  if (!keys) throw new Error("the key bar");
  expect(caption.x).toBeGreaterThan(rail.x + rail.width);
  expect(meet(caption, rail)).toBe(false);
  expect(meet(caption, keys)).toBe(false);
  // a drag turns the land under the answer, which stays
  await page.mouse.move(900, 500);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) await page.mouse.move(900 - i * 8, 500);
  await page.mouse.up();
  await expect(page.locator("[data-view-moved]")).toHaveCount(1);
  await expect(readout).toBeVisible();
  expect(await crumbsOf(page)).toEqual([PLACE, FINDINGS]);
});
