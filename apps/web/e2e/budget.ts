import type { Page } from "@playwright/test";
import type { BudgetItem, Rect } from "../lib/budget/measure";

/**
 * The workspace states' limits (docs/reference/ux-architecture.md, "Visual budget"; acceptance VC-04 and VC-05).
 * Reading: 5 islands, 19 controls, 2 expanded components, 40 text items, and at least 55% of the map unobstructed
 * (OPEN_MAP_MIN.reading in lib/budget/measure.ts). The evidence matrix expanded (ledger level 2) is a deliberately
 * expanded state: 70 text items, and Reading's islands, controls and open map.
 */
export const WORKSPACE = {
  reading: { controls: 19, expanded: 2, textItems: 40 },
  ledgerLevel2: { controls: 19, textItems: 70 },
} as const;

export interface StateCount {
  /** One entry per text item: a visible run of words, as "text" (cut to 60 characters). */
  textItems: string[];
  /** The interactive controls a reader can reach on screen, by their words or accessible name. */
  controls: string[];
  /** Open disclosures: visible controls marked aria-expanded="true", and the blocks the caller names. */
  expanded: string[];
  /** The boxes that cover the map: each named island, and every counted item or control outside the islands. */
  covering: Rect[];
  viewport: { width: number; height: number };
}

/**
 * Counts a workspace state as the visual budget counts it (docs/reference/ux-architecture.md, "Visual budget"):
 * an element counts only when visible, meaning a box a reader can see (wider and taller than 1 px, so a
 * screen-reader-only text is not counted), not hidden by style or by a transparent ancestor, and on top where it is
 * drawn (the centre of one of its line boxes hits it or what it holds; text scrolled out of its column or covered
 * does not count). A text item is one run of words: an element whose own text holds a letter or a digit, with the
 * words of any element inside it that also has words of its own (an identifier set in mono inside a sentence)
 * belonging to it. Labels inside graphics are not text items (SVG text, and a key hint's glyph box, so a key hint
 * counts once, by its label), and attribution is excluded (the data line and the Sources panel).
 */
export async function countState(
  page: Page,
  options: { islands: string[]; expandedBlocks?: string[] },
): Promise<StateCount> {
  return page.evaluate(
    ({ islands, expandedBlocks, attribution }) => {
      const shown = (el: Element): boolean => {
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return false;
        if (getComputedStyle(el).visibility === "hidden") return false;
        for (let e: Element | null = el; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.display === "none" || Number(cs.opacity) === 0) return false;
        }
        return true;
      };
      const onTop = (el: Element): boolean =>
        Array.from(el.getClientRects()).some((r) => {
          if (r.width <= 1 || r.height <= 1) return false;
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return top !== null && (top === el || el.contains(top));
        });
      const seen = (el: Element) => shown(el) && onTop(el);
      const ownText = (el: Element) =>
        Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? "")
          .join("")
          .replace(/\s+/g, " ")
          .trim();
      const hasWords = (t: string) => /[\p{L}\p{N}]/u.test(t);
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const islandEls = islands
        .flatMap((s) => Array.from(document.querySelectorAll(s)))
        .filter(shown);
      const inIsland = (el: Element) => islandEls.some((i) => i === el || i.contains(el));

      const texts: Element[] = [];
      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        if (el.closest(`svg, kbd, ${attribution}`)) continue;
        if (!hasWords(ownText(el))) continue;
        let inner = false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement)
          if (hasWords(ownText(a))) {
            inner = true;
            break;
          }
        if (!inner && seen(el)) texts.push(el);
      }
      const controls = Array.from(
        document.querySelectorAll(
          "button, a[href], input, select, textarea, summary, [role='button'], [role='link']",
        ),
      ).filter((el) => !el.closest(attribution) && seen(el));
      const expanded = [
        ...Array.from(document.querySelectorAll("[aria-expanded='true']")).filter(seen),
        ...expandedBlocks.flatMap((s) => Array.from(document.querySelectorAll(s))).filter(shown),
      ];
      const name = (el: Element) =>
        (
          (el instanceof HTMLElement ? el.innerText : el.textContent) ||
          el.getAttribute("aria-label") ||
          el.tagName.toLowerCase()
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60);
      return {
        textItems: texts.map((el) => ownText(el).slice(0, 60)),
        controls: controls.map(name),
        expanded: expanded.map(name),
        covering: [
          ...islandEls.map(box),
          ...[...texts, ...controls].filter((el) => !inIsland(el)).map(box),
        ],
        viewport: { width: innerWidth, height: innerHeight },
      };
    },
    {
      islands: options.islands,
      expandedBlocks: options.expandedBlocks ?? [],
      attribution: "[data-sources-line], [data-sources-panel]",
    },
  );
}

// Collects every visible element that carries data-budget, with its text and box in CSS pixels. Visible means
// a box with area, not hidden by style, and on top at its centre (hit-tested), or drawn on the map (land
// labels and leaders, which sit under the chrome by design).
export async function collectBudget(page: Page): Promise<BudgetItem[]> {
  return page.evaluate(() => {
    const out: {
      role: string;
      text: string;
      rect: { x: number; y: number; width: number; height: number };
      lines?: { text: string; honesty: boolean }[];
    }[] = [];
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement | SVGElement>("[data-budget]"),
    )) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      const role = el.dataset.budget ?? "";
      const onMap = role === "land-label" || role === "leader";
      if (!onMap) {
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!top || !(el === top || el.contains(top))) continue;
      }
      const input = el.querySelector("input");
      // an SVG element (the leader) has no innerText
      const text =
        el.dataset.budgetText ??
        (input ? input.value : el instanceof HTMLElement ? el.innerText : el.textContent);
      const lines = el.dataset.budgetLines
        ? (JSON.parse(el.dataset.budgetLines) as { text: string; honesty: boolean }[])
        : undefined;
      out.push({
        role,
        text: text.trim(),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        ...(lines ? { lines } : {}),
      });
    }
    return out;
  }) as Promise<BudgetItem[]>;
}
