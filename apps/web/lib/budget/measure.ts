// The visual budget (VC-04, VC-05) as design language 1.3 counts it: one card of at most 45 words, one
// leader, at most five labels on the land, one action; credits and key hints are not counted. A land label
// may be a two-line block (a place name with its region, or a measured label with its honesty line) and
// counts once; each line has at most six words, except an honesty line, which is exempt (lead decision,
// 27 Oct 2026). The open-map share keeps the docs' minimum per state. Pure: the browser only measures.

export type BudgetRole =
  "card" | "leader" | "land-label" | "action" | "island" | "command" | "key-hint" | "credit";

export type ShellState = "arrival" | "working" | "reading" | "review";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BudgetLine {
  text: string;
  /** An honesty line (marked so in the string catalog) is exempt from the word cap. */
  honesty: boolean;
}

export interface BudgetItem {
  role: BudgetRole;
  text: string;
  rect: Rect;
  /** The lines of a land label block; a single line when absent. */
  lines?: BudgetLine[];
}

export const LIMITS = {
  cards: 1,
  leaders: 1,
  landLabels: 5,
  wordsPerLabelLine: 6,
  cardWords: 45,
  actions: 1,
} as const;

/** Minimum share of the viewport left uncovered by islands (ux-architecture.md visual budget). */
export const OPEN_MAP_MIN: Record<ShellState, number> = {
  arrival: 0.75,
  working: 0.6,
  reading: 0.55,
  review: 0.45,
};

/** Words as a reader counts them: tokens with a letter or a digit ("/" and "↵" are not words). */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/** Area of the union of rectangles, clipped to the viewport, by sweeping the distinct x edges. */
export function unionArea(rects: Rect[], viewport: { width: number; height: number }): number {
  const clipped = rects
    .map((r) => ({
      x0: Math.max(0, r.x),
      x1: Math.min(viewport.width, r.x + r.width),
      y0: Math.max(0, r.y),
      y1: Math.min(viewport.height, r.y + r.height),
    }))
    .filter((r) => r.x1 > r.x0 && r.y1 > r.y0);
  const xs = [...new Set(clipped.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i];
    const b = xs[i + 1];
    if (a === undefined || b === undefined) continue;
    const spans = clipped
      .filter((r) => r.x0 <= a && r.x1 >= b)
      .map((r) => [r.y0, r.y1] as const)
      .sort((p, q) => p[0] - q[0]);
    // merge the sorted spans: add each run of overlapping spans once
    let covered = 0;
    let run: [number, number] | undefined;
    for (const [y0, y1] of spans) {
      if (run && y0 <= run[1]) run[1] = Math.max(run[1], y1);
      else {
        if (run) covered += run[1] - run[0];
        run = [y0, y1];
      }
    }
    if (run) covered += run[1] - run[0];
    area += covered * (b - a);
  }
  return area;
}

export interface BudgetReport {
  counts: {
    cards: number;
    leaders: number;
    landLabels: number;
    actions: number;
    cardWords: number;
  };
  openMapShare: number;
  violations: string[];
}

/** Roles whose boxes cover the map. Leaders and land labels are drawn on the map, not over it. */
const COVERING: BudgetRole[] = ["card", "island", "command", "action", "key-hint"];

export function checkBudget(
  items: BudgetItem[],
  viewport: { width: number; height: number },
  state: ShellState,
): BudgetReport {
  const of = (role: BudgetRole) => items.filter((i) => i.role === role);
  const cards = of("card");
  const landLabels = of("land-label");
  const cardWords = cards.reduce((s, c) => s + countWords(c.text), 0);
  const counts = {
    cards: cards.length,
    leaders: of("leader").length,
    landLabels: landLabels.length,
    actions: of("action").length,
    cardWords,
  };
  const covered = unionArea(
    items.filter((i) => COVERING.includes(i.role)).map((i) => i.rect),
    viewport,
  );
  const openMapShare = 1 - covered / (viewport.width * viewport.height);

  const violations: string[] = [];
  if (counts.cards > LIMITS.cards)
    violations.push(`${counts.cards} cards (at most ${LIMITS.cards})`);
  if (counts.leaders > LIMITS.leaders)
    violations.push(`${counts.leaders} leaders (at most ${LIMITS.leaders})`);
  if (counts.actions > LIMITS.actions)
    violations.push(`${counts.actions} primary actions (at most ${LIMITS.actions})`);
  if (counts.landLabels > LIMITS.landLabels)
    violations.push(`${counts.landLabels} labels on the land (at most ${LIMITS.landLabels})`);
  for (const l of landLabels) {
    for (const line of l.lines ?? [{ text: l.text, honesty: false }]) {
      const n = countWords(line.text);
      if (!line.honesty && n > LIMITS.wordsPerLabelLine)
        violations.push(
          `land label line of ${n} words (at most ${LIMITS.wordsPerLabelLine}): ${line.text}`,
        );
    }
  }
  if (cardWords > LIMITS.cardWords)
    violations.push(`card of ${cardWords} words (at most ${LIMITS.cardWords})`);
  if (openMapShare < OPEN_MAP_MIN[state])
    violations.push(
      `open map ${(openMapShare * 100).toFixed(1)}% (at least ${OPEN_MAP_MIN[state] * 100}% in ${state})`,
    );
  return { counts, openMapShare, violations };
}
