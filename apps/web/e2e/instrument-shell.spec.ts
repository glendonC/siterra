import { expect, test, type Request } from "@playwright/test";
import { textReport } from "./instrument-text";

// The briefing shell around each instrument (docs/reference/ux-architecture.md, "The instruments' budget"): a quiet
// switcher of six views at the top right with the current one marked and Valley leading to the overview at /valley;
// the ask (approved specimen D4) resting as a 44 x 44 CSS px circle at the bottom centre, in the band the command line
// kept (y 796 to 840 of the 1440 x 900 design), with no text within 24 px of it except the credit line, which
// keeps the specimens' gap of 16 px. The ask opens by its circle or "/" and sends nothing; Enter (which carries the
// text to the overview) is not pressed here, as no test presses Enter in the ask.

test.use({ viewport: { width: 1440, height: 900 } });

const ASK = { x: 698, y: 796, width: 44, height: 44 };
const CLEAR = 24;
const CREDIT_GAP = 16;
const PAGES = ["layers", "cutaway", "pixel", "rainfall", "field"] as const;
/** An element each instrument shows once its words are placed. */
const READY: Record<(typeof PAGES)[number], string> = {
  layers: "[data-sheet]",
  cutaway: "[data-band]",
  pixel: "[role='slider']",
  rainfall: "[data-season]",
  // the seed case holds no field plan: the page says so
  field: "[data-field-plan]",
};

for (const id of PAGES) {
  test(`frames the ${id} instrument with the switcher and the ask`, async ({ page }) => {
    await page.goto(`/instruments/${id}`);
    await expect(page.locator(READY[id]).first()).toBeVisible();
    const nav = page.locator("nav[aria-label='Instruments']");
    await expect(nav.locator("a")).toHaveCount(6);
    await expect(nav.locator("a[aria-current='page']")).toHaveCount(1);
    await expect(nav.locator("a").first()).toHaveAttribute("href", "/valley");
    expect(await page.locator("[data-ask]").boundingBox()).toEqual(ASK);
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
        if (!n.textContent?.trim() || !el || el.closest("[data-ask], p[id]")) continue;
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
    const end = ASK.y + ASK.height;
    const near = frags.filter((f) => {
      const across = f.right > ASK.x - CLEAR && f.left < ASK.x + ASK.width + CLEAR;
      const gap = f.credit ? CREDIT_GAP : CLEAR;
      return across && f.bottom > ASK.y - CLEAR && f.top < end + gap;
    });
    expect(near.map((f) => f.t)).toEqual([]);
    expect(await textReport(page, "[data-shell]")).toEqual({
      overlaps: [],
      small: [],
      outside: [],
    });
  });
}

test("the ask opens by its circle and by the slash key and sends nothing", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r: Request) => {
    // opening the demo copy of the seed case is the one write a page makes before anything is asked
    if (r.method() !== "GET" && new URL(r.url()).pathname !== "/api/demo-sessions")
      sent.push(`${r.method()} ${r.url()}`);
  });
  await page.goto("/instruments/layers");
  await expect(page.locator("[data-sheet]").first()).toBeVisible();
  const ask = page.locator("[data-ask]");
  const input = page.locator("input[name='question']");
  await ask.click();
  await expect(input).toBeFocused();
  await input.pressSequentially("Is the valley floor greener since 2019?");
  await expect(input).toHaveValue("Is the valley floor greener since 2019?");
  await page.keyboard.press("Escape");
  await expect(ask).toHaveAttribute("aria-expanded", "false");
  await page.locator("body").click({ position: { x: 20, y: 450 } });
  await page.keyboard.press("/");
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(ask).toHaveAttribute("aria-expanded", "false");
  expect(sent).toEqual([]);
});
