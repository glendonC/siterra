import { expect, test, type Request } from "@playwright/test";
import { textReport } from "./instrument-text";

// The briefing shell around each instrument (docs/reference/ux-architecture.md, "The instruments' budget"): a quiet
// switcher of four views at the top right with the current one marked, the command line 480 x 44 CSS px at y 796 of
// the 1440 x 900 design (specimens A and B) with no text within 24 px of it except the credit line, which keeps the
// specimens' own gap of 16 px (their command line ends at y 840, their two-line credit starts at y 856), and Enter
// carrying the typed text to the valley without sending anything.

test.use({ viewport: { width: 1440, height: 900 } });

const CMD = { x: 480, y: 796, width: 480, height: 44 };
const CLEAR = 24;
const CREDIT_GAP = 16;
const PAGES = ["layers", "cutaway", "pixel"] as const;
/** An element each instrument shows once its words are placed. */
const READY: Record<(typeof PAGES)[number], string> = {
  layers: "[data-sheet]",
  cutaway: "[data-band]",
  pixel: "[role='slider']",
};

for (const id of PAGES) {
  test(`frames the ${id} instrument with the switcher and the command line`, async ({ page }) => {
    await page.goto(`/instruments/${id}`);
    await expect(page.locator(READY[id]).first()).toBeVisible();
    const nav = page.locator("nav");
    await expect(nav.locator("a")).toHaveCount(4);
    await expect(nav.locator("a[aria-current='page']")).toHaveCount(1);
    expect(await page.locator("[data-command]").boundingBox()).toEqual(CMD);
    const frags = await page.evaluate(() => {
      const out: {
        t: string;
        credit: boolean;
        top: number;
        bottom: number;
        left: number;
        right: number;
      }[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!n.textContent?.trim() || !el || el.closest("[data-command], p[id]")) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const g of r.getClientRects())
          if (g.width > 0.5)
            out.push({
              t: n.textContent.trim().slice(0, 30),
              credit: Boolean(el.closest("[class*='credit']")),
              top: g.top,
              bottom: g.bottom,
              left: g.left,
              right: g.right,
            });
      }
      return out;
    });
    const end = CMD.y + CMD.height;
    const near = frags.filter((f) => {
      const across = f.right > CMD.x - CLEAR && f.left < CMD.x + CMD.width + CLEAR;
      const gap = f.credit ? CREDIT_GAP : CLEAR;
      return across && f.bottom > CMD.y - CLEAR && f.top < end + gap;
    });
    expect(near.map((f) => f.t)).toEqual([]);
    expect(await textReport(page, "[data-shell]")).toEqual({
      overlaps: [],
      small: [],
      outside: [],
    });
  });
}

test("Enter carries the typed text to the valley and sends nothing", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r: Request) => {
    if (r.method() !== "GET") sent.push(`${r.method()} ${r.url()}`);
  });
  await page.goto("/instruments/layers");
  const input = page.locator("[data-command] input");
  await input.fill("Is the valley floor greener since 2019?");
  await input.press("Enter");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  expect(await page.evaluate(() => sessionStorage.getItem("siterra.valleyQuestion"))).toBe(
    "Is the valley floor greener since 2019?",
  );
  expect(sent).toEqual([]);
});
