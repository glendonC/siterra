import type { Page } from "@playwright/test";

// The instruments' text checks (docs/reference/ux-architecture.md, "The instruments' budget"): every drawn line of
// text, measured line by line, must not overlap another, be under 12 CSS px or leave the frame.
export function textReport(page: Page, selector: string) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
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
  }, selector);
}
