// The package's field check markers on the land (UI-2 package 1f; the lead, after "Founder instance smoke 4"): checks
// that share an anchor stand as one marker whose label carries their numbers ("01 02 05"); the card names the check
// the open step is about. Where two markers' labels would meet, the later one's stem rises a level, so no two labels
// ever overlap; a label that carries a name can stand left of its stem, away from a card at the right. Pure: points
// in, stems and label boxes out (CSS px).

export interface MarkerPoint {
  x: number;
  y: number;
  behind: boolean;
}

export interface MarkerGroup {
  at: MarkerPoint;
  /** The checks (indices into the view's measures) standing here, in their order. */
  members: number[];
  /** The stem's height (px): the label sits at its top. */
  stem: number;
  /** The label stands left of the stem (away from a card at the right), else right of it. */
  flip: boolean;
  /** The label's box on screen. */
  box: { x0: number; y0: number; x1: number; y1: number };
}

/** Points nearer than this (px) are one anchor. */
export const SAME_ANCHOR = 8;
/** The stem at rest, and how much a stem rises for each level when labels would meet (px). */
export const STEM = 132;
export const LEVEL = 26;
/** The label's offsets from the stem: its left edge, and its bottom below the stem's top (px; the briefing's CSS). */
export const LABEL_LEFT = 8;
export const LABEL_DROP = 14;
export const LABEL_H = 18;
/** Room kept between two labels (px). */
const GAP = 6;

/** Width (px) of a label: its numbers in the mono face and, when open, the check's name in the sans face at 14 px. */
export function labelWidth(numbers: number, name: string | null): number {
  const nums = numbers * 15.5 + Math.max(0, numbers - 1) * 6;
  return Math.ceil(nums + (name ? 6 + name.length * 7.3 : 0));
}

/** The checks grouped by anchor: a check joins the first group whose point is within SAME_ANCHOR px of its own. */
export function groupByAnchor(
  points: readonly (MarkerPoint | null)[],
): { at: MarkerPoint; members: number[] }[] {
  const groups: { at: MarkerPoint; members: number[] }[] = [];
  points.forEach((p, i) => {
    if (!p) return;
    const g = groups.find((x) => Math.hypot(x.at.x - p.x, x.at.y - p.y) < SAME_ANCHOR);
    if (g) g.members.push(i);
    else groups.push({ at: p, members: [i] });
  });
  return groups;
}

const meets = (a: MarkerGroup["box"], b: MarkerGroup["box"]) =>
  a.x0 < b.x1 + GAP && b.x0 < a.x1 + GAP && a.y0 < b.y1 + GAP && b.y0 < a.y1 + GAP;

/**
 * Each group's stem and label box: groups are placed from left to right, and a group whose label would meet one
 * already placed rises a level at a time until it meets none.
 */
export function layoutMarkers(
  points: readonly (MarkerPoint | null)[],
  width: (members: readonly number[]) => number,
  /** The check the open step is about, and the side its card stands on: that check's label stands away from it. */
  open: { member: number; cardSide: "left" | "right" } | null = null,
): MarkerGroup[] {
  const placed: MarkerGroup[] = [];
  const groups = groupByAnchor(points).sort((a, b) => a.at.x - b.at.x || a.at.y - b.at.y);
  for (const g of groups) {
    const w = width(g.members);
    const flip = open !== null && open.cardSide === "right" && g.members.includes(open.member);
    for (let level = 0; ; level++) {
      const stem = STEM + level * LEVEL;
      const y1 = g.at.y - stem + LABEL_DROP;
      const x0 = flip ? g.at.x - LABEL_LEFT - w : g.at.x + LABEL_LEFT;
      const box = { x0, y0: y1 - LABEL_H, x1: x0 + w, y1 };
      if (level >= 12 || !placed.some((p) => meets(p.box, box))) {
        placed.push({ at: g.at, members: g.members, stem, flip, box });
        break;
      }
    }
  }
  return placed;
}
