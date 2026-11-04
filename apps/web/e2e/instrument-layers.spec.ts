import { expect, test, type Page } from "@playwright/test";
import { ly } from "../lib/copy/layers";
import { STACK_ORDER } from "../lib/overview/layers";
import {
  atTheAnswer,
  columnBox,
  loadedRecord,
  readoutOn,
  recorded,
  shownSheets,
  viewsOf,
} from "./answer";
import { sharedCase } from "./demo-case";
import { textReport } from "./instrument-text";

// Map Layers (approved specimen A, UI-2): the answer splits its own land into its sheets in place, with no address of
// its own, so the old address lands on the answer with its query kept. Split, each sheet the place has is named in one
// column right of the stack, top to bottom in stack order, clear of the answer's column, with no line of text over
// another, none under 12 CSS px and none outside the frame; Esc settles it back to the answer's one sheet.

test.use({ viewport: { width: 1440, height: 900 } });

/** Splits the answer's land by its Map Layers key, once the land has settled from its arrival. */
async function split(page: Page, path: string) {
  const record = loadedRecord(page);
  const readout = await atTheAnswer(page, path);
  const { snapshot, listing } = await record;
  await expect.poll(() => shownSheets(page), { timeout: 15_000 }).toEqual(["trend"]);
  const layers = viewsOf(snapshot, listing).find((v) => v.kind === "layers");
  if (!layers) throw new Error("the place offers no Map Layers");
  await page.keyboard.press(layers.key);
  return readout;
}

/** Each shown label's box. */
const boxes = (page: Page) =>
  page.locator("[data-layer-stack] [data-sheet]").evaluateAll((els) =>
    els
      .filter((e) => (e as HTMLElement).style.visibility === "visible")
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      }),
  );

test("the old Map Layers address lands on the answer, keeping its query", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/instruments/layers?case=${sharedCase()}&run=${recorded.commandId}`);
  await expect(page).toHaveURL(
    new RegExp(`/valley\\?case=${sharedCase()}&run=${recorded.commandId}$`),
  );
  await expect(readoutOn(page).locator("[data-run-question]")).toHaveText(recorded.question, {
    timeout: 90_000,
  });
  await page.goto("/instruments/layers");
  await expect(page).toHaveURL(/\/valley$/);
  await expect(readoutOn(page)).toBeVisible({ timeout: 90_000 });
});

test("split, the first place's five sheets are named in one column in stack order, clear of the answer and of each other; Esc settles it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const readout = await split(page, "/valley");
  await expect.poll(() => shownSheets(page), { timeout: 15_000 }).toEqual([...STACK_ORDER]);
  for (const id of STACK_ORDER)
    await expect(page.locator(`[data-layer-stack] [data-sheet='${id}'] b`)).toHaveText(
      ly[`layers.name.${id}`].text,
    );
  const shown = await boxes(page);
  // one column: every label starts at the same x, and they run down in stack order
  expect(new Set(shown.map((b) => Math.round(b.x))).size).toBe(1);
  const tops = shown.map((b) => b.y);
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  // clear of the answer's column
  const rail = await columnBox(page);
  for (const b of shown) expect(b.x).toBeGreaterThan(rail.x + rail.width);
  expect(await textReport(page, "[data-layer-stack]")).toEqual({
    overlaps: [],
    small: [],
    outside: [],
  });
  // Esc settles it: the answer's one sheet again, and the answer where it was
  await page.keyboard.press("Escape");
  await expect.poll(() => shownSheets(page), { timeout: 10_000 }).toEqual(["trend"]);
  await expect(readout).toBeVisible();
});

test("split, the second place shows its own four sheets, with no snow", async ({ page }) => {
  test.setTimeout(180_000);
  await split(page, "/valley?case=case_calaveras_creek");
  await expect
    .poll(() => shownSheets(page), { timeout: 15_000 })
    .toEqual(STACK_ORDER.filter((id) => id !== "snow"));
});
