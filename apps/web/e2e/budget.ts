import type { Page } from "@playwright/test";
import type { BudgetItem } from "../lib/budget/measure";

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
