// The next-steps package as a briefing you step through (the lead's decision 16, 30 Oct 19:55): a headline on
// arrival, then five steps, one at a time, each a card of at most three short lines. The lines are the record's
// own, never shortened or rewritten: a step whose lines would pass the card's word budget pages them, one page per
// press, so a long line is never cut and nothing is crowded. Everything in full stays in the exported brief. Pure.

import type { PackageLine, PackageMeasure, PackageResponse, PackageView } from "./package";

/**
 * A card's word budget: about two short lines (decision 16a: at most three lines of about 12 words; the lead, 20:12:
 * step frames under about 40 words with the card's kicker, the markers and the keys).
 */
export const CARD_WORDS = 24;
/** At most three lines on one card. */
export const CARD_LINES = 3;

export type StepId = "known" | "open" | "checks" | "responses" | "approve";

export interface StepLine {
  text: string;
  chips: number[];
}

export type Page =
  | { kind: "lines"; lines: StepLine[] }
  /** One field check: its marker on the land (by its index in the view's measures) and its card. */
  | { kind: "check"; measure: number }
  | { kind: "responses"; responses: PackageResponse[] };

export interface Step {
  id: StepId;
  pages: Page[];
}

export const words = (s: string): number => (s.trim().match(/\S+/g) ?? []).length;

/**
 * Lines packed into pages in their own order: a page takes lines while it holds at most CARD_LINES and CARD_WORDS
 * words; a single line longer than the budget is a page by itself, whole.
 */
export function pagesOf(lines: readonly StepLine[]): Page[] {
  const pages: Page[] = [];
  let cur: StepLine[] = [];
  let n = 0;
  for (const l of lines) {
    const w = words(l.text);
    if (cur.length > 0 && (cur.length >= CARD_LINES || n + w > CARD_WORDS)) {
      pages.push({ kind: "lines", lines: cur });
      cur = [];
      n = 0;
    }
    cur.push(l);
    n += w;
  }
  if (cur.length) pages.push({ kind: "lines", lines: cur });
  return pages;
}

const asLines = (ls: readonly PackageLine[]): StepLine[] =>
  ls.map((l) => ({ text: l.text, chips: l.chips }));

/** The responses side by side, none ranked: their titles only, at most three a page. */
function responsePages(rs: readonly PackageResponse[]): Page[] {
  const out: Page[] = [];
  for (let i = 0; i < rs.length; i += CARD_LINES)
    out.push({ kind: "responses", responses: rs.slice(i, i + CARD_LINES) });
  return out;
}

/** The five steps the record can fill, in the briefing's order; a step with nothing in the record is left out. */
export function stepsOf(view: PackageView): Step[] {
  const approve = pagesOf(asLines(view.authorization));
  const steps: Step[] = [
    { id: "known", pages: pagesOf(asLines(view.known)) },
    { id: "open", pages: pagesOf(asLines(view.uncertain)) },
    {
      id: "checks",
      pages:
        view.measures.length > 0
          ? view.measures.map((_, i): Page => ({ kind: "check", measure: i }))
          : pagesOf(asLines(view.measureNext)),
    },
    { id: "responses", pages: responsePages(view.responses) },
    { id: "approve", pages: approve },
  ];
  return steps.filter((s) => s.pages.length > 0);
}

/** A field check's card lines: what it is, where and when, and who carries it out, each a record field. */
export function checkLines(m: PackageMeasure): string[] {
  const where = m.places.map((p) => p.label).join(", ");
  return [where ? `${where}, ${m.season}` : m.season, m.fieldRole];
}

/** Where a stepper stands: a step and a page in it. */
export interface Cursor {
  step: number;
  page: number;
}

/** The next page, then the next step's first page; past the last page it stays. */
export function nextOf(steps: readonly Step[], c: Cursor): Cursor {
  const s = steps[c.step];
  if (!s) return c;
  if (c.page + 1 < s.pages.length) return { step: c.step, page: c.page + 1 };
  if (c.step + 1 < steps.length) return { step: c.step + 1, page: 0 };
  return c;
}

/** The previous page, then the previous step's last page; before the first page it stays. */
export function previousOf(steps: readonly Step[], c: Cursor): Cursor {
  if (c.page > 0) return { step: c.step, page: c.page - 1 };
  const p = steps[c.step - 1];
  return p ? { step: c.step - 1, page: p.pages.length - 1 } : c;
}
