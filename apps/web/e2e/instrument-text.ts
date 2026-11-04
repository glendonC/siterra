import type { Page } from "@playwright/test";

// The instruments' text checks (docs/reference/ux-architecture.md, "The instruments' budget"): every drawn line of
// text, measured line by line, must not overlap another, be under 12 CSS px or leave the frame. Text that is not
// drawn is not measured: hidden by style, inside an element faded out to nothing (opacity 0, as the overview's
// finding labels stand behind the answer), or scrolled out of a box that scrolls (a column that scrolls in itself,
// whose rest a reader reaches by scrolling); a line such a box cuts is measured by the part of it that is drawn. A box
// that only hides what overflows it does not excuse its text: text cut off there is still measured.
export function textReport(page: Page, selector: string) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return { overlaps: ["no instrument"], small: [], outside: [] };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const frags: { name: string; l: number; r: number; t: number; b: number }[] = [];
    const small: string[] = [];
    const faded = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement)
        if (getComputedStyle(e).opacity === "0") return true;
      return false;
    };
    /** The part of the screen an element's text can be drawn in: every box round it that scrolls what overflows. */
    const scrolls = (v: string) => v === "auto" || v === "scroll";
    const clipOf = (el: Element) => {
      const box = { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity };
      for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (!scrolls(cs.overflowX) && !scrolls(cs.overflowY)) continue;
        const r = e.getBoundingClientRect();
        box.l = Math.max(box.l, r.left);
        box.t = Math.max(box.t, r.top);
        box.r = Math.min(box.r, r.right);
        box.b = Math.min(box.b, r.bottom);
      }
      return box;
    };
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      const text = node.textContent?.trim() ?? "";
      if (!text || !el || getComputedStyle(el).visibility === "hidden" || faded(el)) continue;
      if (el.closest("p[id]")) continue; // the screen-reader description of the keys
      const style = getComputedStyle(el);
      const range = document.createRange();
      range.selectNodeContents(node);
      const lh = parseFloat(style.lineHeight);
      const clip = clipOf(el);
      let drawn = false;
      for (const g of range.getClientRects()) {
        if (g.width <= 0.5 || g.height <= 0.5) continue;
        const h = Number.isFinite(lh) ? Math.min(lh, g.height) : g.height;
        const top = g.top + (g.height - h) / 2;
        const f = {
          name: text.slice(0, 30),
          l: Math.max(g.left, clip.l),
          r: Math.min(g.right, clip.r),
          t: Math.max(top, clip.t),
          b: Math.min(top + h, clip.b),
        };
        if (f.r - f.l <= 0.5 || f.b - f.t <= 0.5) continue;
        drawn = true;
        frags.push(f);
      }
      if (drawn && parseFloat(style.fontSize) < 12) small.push(text);
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
