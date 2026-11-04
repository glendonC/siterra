import { expect, test, type Page } from "@playwright/test";
import type { CaseSnapshot } from "@siterra/contracts";
import { format } from "../lib/copy/en";
import { overlayView } from "../lib/sources/overlay";
import { keyOf, loadedRecord } from "./answer";
import { textReport } from "./instrument-text";

// The data credits on every current screen (decision 5, 30 Oct 2026): the case's datasets and their licence notices sit
// behind the Sources key (S), one step away, read from the case record (the one Sources and Limits overlay): each
// dataset once with its credits and licences whole, and every publication with its link. No data line stays on any
// screen (HUD-2, decision A, 2 Nov 2026; UI-2 for the views): the names, the notices and the drawn relief's
// exaggeration are all inside Sources. What it should list is derived from the record the page loaded
// (lib/sources/overlay.ts), so no credit is typed by hand.

const inFrame = (
  box: { x: number; y: number; width: number; height: number } | null,
  vw: number,
  vh: number,
) => {
  expect(box).not.toBeNull();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(24);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vw - 24);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(vh);
};

const sourcesOn = (page: Page) => page.locator("[data-sources-overlay][data-tab='sources']");

/** The datasets the overlay lists, by their ids, in order. */
const listed = (page: Page) =>
  sourcesOn(page)
    .locator("[data-dataset]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-dataset")));

/** Every credit, licence and publication the case's record holds is in the open Sources, once and whole. */
async function holdsTheRecord(page: Page, snapshot: CaseSnapshot) {
  const view = overlayView(snapshot);
  const panel = sourcesOn(page);
  expect(await listed(page)).toEqual(view.datasets.map((d) => d.datasetId));
  for (const d of view.datasets) {
    const row = panel.locator(`[data-dataset='${d.datasetId}']`);
    await expect(row, d.datasetId).toContainText(d.name);
    for (const c of d.credits) await expect(row, d.datasetId).toContainText(c);
  }
  for (const c of view.mapCredits)
    await expect(panel.locator("[data-map-credits]")).toContainText(c);
  await expect(panel.locator("[data-publication]")).toHaveCount(view.publications.length);
  for (const p of view.publications)
    await expect(panel.locator(`[data-publication='${p.sourceId}'] a`)).toHaveAttribute(
      "href",
      p.url,
    );
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`the overview keeps every credit and the relief's exaggeration one key away, in Sources, at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const record = loadedRecord(page);
    await page.goto("/valley");
    await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
      timeout: 60_000,
    });
    const { snapshot } = await record;
    await expect(page.locator("[data-sources-line]")).toHaveCount(0);
    await keyOf(page, "S").click();
    const panel = sourcesOn(page);
    await expect(panel).toBeVisible();
    await holdsTheRecord(page, snapshot);
    // the drawn relief's exaggeration is said with the data (decision 16, moved by decision A); the overview draws its
    // land 2.5 times its height (EXAG, lib/overview/scene/overview-camera.ts)
    await expect(panel.locator("[data-relief]")).toHaveText(
      format("chrome.relief.note", { value: 2.5 }),
    );
    inFrame(
      await panel.locator("[data-sources-sheet]").boundingBox(),
      viewport.width,
      viewport.height,
    );
    // no notice is set in monospace
    expect(
      await panel
        .locator("[data-notice]")
        .first()
        .evaluate((el) => getComputedStyle(el).fontFamily),
    ).not.toMatch(/mono/i);
  });
}

for (const name of ["cutaway", "pixel", "rainfall", "field"] as const) {
  test(`the ${name} view draws no data line and keeps the case's credits behind Sources`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const record = loadedRecord(page);
    await page.goto(`/instruments/${name}`);
    await expect(keyOf(page, "S")).toBeVisible({ timeout: 60_000 });
    const { snapshot } = await record;
    await expect(page.locator("[data-sources-line]")).toHaveCount(0);
    await page.keyboard.press("s");
    await expect(sourcesOn(page)).toBeVisible();
    await holdsTheRecord(page, snapshot);
  });
}

// The long lists read calmly (the owner, 3 Nov 2026: no visible scrollbar, no tiny text): each column that holds more
// than it shows scrolls with no bar drawn, fades the edge with more to read, and is a keyboard stop the page keys
// scroll; no word in the overlay is under 12 px.
test("the Sources and Limits columns scroll with no bar, fade where there is more, take the keys, and set no word under 12 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/valley");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 60_000,
  });
  for (const [key, tab] of [
    ["s", "sources"],
    ["w", "limits"],
  ] as const) {
    await page.keyboard.press(key);
    const overlay = page.locator(`[data-sources-overlay][data-tab='${tab}']`);
    await expect(overlay).toBeVisible();
    const columns = overlay.locator("[role='tabpanel'] > *");
    const read = () =>
      columns.evaluateAll((els) =>
        els.map((el) => ({
          scrolls: el.scrollHeight > el.clientHeight + 2,
          bar: getComputedStyle(el).scrollbarWidth,
          fade: el.getAttribute("data-fade"),
          stop: el.getAttribute("tabindex"),
        })),
      );
    // the credits under Sources and the coverage months under Limits are longer than their columns
    const seen = await read();
    expect(seen.some((c) => c.scrolls)).toBe(true);
    for (const c of seen) {
      expect(c.bar).toBe("none");
      expect([c.fade, c.stop]).toEqual(c.scrolls ? ["bottom", "0"] : [null, null]);
    }
    expect((await textReport(page, "[data-sources-overlay]")).small).toEqual([]);
  }
  // the keyboard: from the close, Tab reaches the Limits side column, then the main one; Page Down scrolls it and both
  // edges fade mid-way, End brings its last line in and only the top fades
  await page.locator("[data-sources-overlay] [data-sources-close]").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("[data-sources-overlay] [role='tabpanel'] > aside")).toBeFocused();
  await page.keyboard.press("Tab");
  const main = page.locator("[data-sources-overlay] [role='tabpanel'] > section");
  await expect(main).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(main).toHaveAttribute("data-fade", "both");
  await page.keyboard.press("End");
  await expect(main).toHaveAttribute("data-fade", "top");
});
