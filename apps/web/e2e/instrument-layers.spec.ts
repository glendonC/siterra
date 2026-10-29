import { expect, test, type Page } from "@playwright/test";
import { obsidian } from "../lib/theme/obsidian";

// The layer stack instrument (approved specimen A) at its design size: all five sheet labels are placed on their
// leaders within the instruments' budget (docs/reference/ux-architecture.md), no line of text overlaps another,
// none is under 12 CSS px or outside the frame, and the keyboard turns the model and brings it back.

test.use({ viewport: { width: 1440, height: 900 } });

test("keeps within the approved specimen's budget: five leaders, one of them warm", async ({
  page,
}) => {
  await page.goto("/instruments/layers");
  const root = page.locator("[data-instrument='layers']");
  await expect(root.locator("[data-sheet]").first()).toBeVisible();
  const strokes = await root
    .locator("svg line")
    .evaluateAll((lines) => lines.map((l) => l.getAttribute("stroke")));
  expect(strokes).toHaveLength(5);
  expect(strokes.filter((s) => s === obsidian.accent)).toHaveLength(1);
});

const labelTops = (page: Page) =>
  page
    .locator("[data-instrument='layers'] [data-sheet]")
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));

test("places five sheet labels without crowding the text", async ({ page }) => {
  await page.goto("/instruments/layers");
  const labels = page.locator("[data-instrument='layers'] [data-sheet]");
  await expect(labels).toHaveCount(5);
  for (const label of await labels.all()) await expect(label).toBeVisible();
  await expect(page.locator("[data-scale-note]")).toBeVisible();

  const report = await page.evaluate(() => {
    const root = document.querySelector("[data-instrument='layers']");
    if (!root) return { overlaps: ["no instrument"], small: [], outside: [] };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const frags: { name: string; l: number; r: number; t: number; b: number }[] = [];
    const small: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      const text = node.textContent?.trim() ?? "";
      if (!text || !el || getComputedStyle(el).visibility === "hidden") continue;
      if (el.closest("p[id]")) continue; // the screen-reader description of the keys
      const style = getComputedStyle(el);
      if (parseFloat(style.fontSize) < 12) small.push(text);
      const range = document.createRange();
      range.selectNodeContents(node);
      const lh = parseFloat(style.lineHeight);
      for (const g of range.getClientRects()) {
        if (g.width <= 0.5 || g.height <= 0.5) continue;
        const h = Number.isFinite(lh) ? Math.min(lh, g.height) : g.height;
        const t = g.top + (g.height - h) / 2;
        frags.push({ name: text.slice(0, 30), l: g.left, r: g.right, t, b: t + h });
      }
    }
    const overlaps: string[] = [];
    for (let i = 0; i < frags.length; i++)
      for (let j = i + 1; j < frags.length; j++) {
        const a = frags[i];
        const c = frags[j];
        if (
          a &&
          c &&
          a.name !== c.name &&
          a.l < c.r - 0.5 &&
          c.l < a.r - 0.5 &&
          a.t < c.b - 0.5 &&
          c.t < a.b - 0.5
        )
          overlaps.push(`${a.name} | ${c.name}`);
      }
    const outside = frags
      .filter((f) => f.l < 0 || f.t < 0 || f.r > innerWidth || f.b > innerHeight)
      .map((f) => f.name);
    return { overlaps, small, outside };
  });
  expect(report).toEqual({ overlaps: [], small: [], outside: [] });
});

test("turns with the arrow keys and returns with Home", async ({ page }) => {
  await page.goto("/instruments/layers");
  await expect(page.locator("[data-instrument='layers'] [data-sheet]").first()).toBeVisible();
  const before = await labelTops(page);
  await page.locator("[data-instrument='layers'] canvas").focus();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => (await labelTops(page)).some((t, i) => Math.abs(t - (before[i] ?? t)) > 0.5))
    .toBe(true);
  await page.keyboard.press("Home");
  await expect
    .poll(async () =>
      (await labelTops(page)).every((t, i) => Math.abs(t - (before[i] ?? t)) <= 0.5),
    )
    .toBe(true);
});
