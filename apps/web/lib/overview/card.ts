// Where a card about a terrain feature stands: beside its anchor, on the side with room, never over
// the subject it describes, never off the screen, never over the controls fixed at the edges; it keeps its side while
// the camera moves unless another side is clearly better. Design px at 1440 x 900.

import { ASK_AT } from "./arc";

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Side = "right" | "left" | "upRight" | "upLeft" | "downRight" | "downLeft";
const SIDES: readonly Side[] = ["right", "left", "upRight", "upLeft", "downRight", "downLeft"];

/** The screen a card may use, and the edge controls it keeps clear of (breadcrumb and question, view control,
 * key legend and data line, the ask disc on the arc). */
export const CARD_BOUNDS: Box = { x0: 40, y0: 110, x1: 1400, y1: 860 };
export const EDGE_ZONES: readonly Box[] = [
  { x0: 0, y0: 0, x1: 520, y1: 100 },
  { x0: 600, y0: 820, x1: 840, y1: 900 },
  { x0: 1020, y0: 800, x1: 1440, y1: 900 },
  { x0: ASK_AT.x - 72, y0: ASK_AT.y - 72, x1: ASK_AT.x + 72, y1: ASK_AT.y + 72 },
];

/** The gap between the anchor and the card's nearest edge (the leader's length at least). */
const GAP = 64;

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** The card's box on one side of the anchor; a card beside it may sit higher or lower along it (`along`, 0 to 1). */
export function boxAt(
  anchor: { x: number; y: number },
  w: number,
  h: number,
  side: Side,
  along = 0.35,
): Box {
  const right = side === "right" || side === "upRight" || side === "downRight";
  const x0 = right ? anchor.x + GAP : anchor.x - GAP - w;
  const y0 =
    side === "right" || side === "left"
      ? anchor.y - h * along
      : side === "upRight" || side === "upLeft"
        ? anchor.y - GAP * 0.6 - h
        : anchor.y + GAP * 0.6;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

/** How far along its side a card beside the anchor may sit, nearest the middle first. */
const ALONG = [0.35, 0.6, 0.15, 0.85] as const;

/** How bad a box is: over the subject, off the screen, over the edge controls (shares of its own area). */
export function penalty(box: Box, subject: Box): number {
  const area = Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0));
  const inside = overlap(box, CARD_BOUNDS);
  return (
    (4 * overlap(box, subject)) / area +
    (10 * (area - inside)) / area +
    EDGE_ZONES.reduce((s, z) => s + (5 * overlap(box, z)) / area, 0)
  );
}

/**
 * The card's place: the side with the least penalty (keeping the previous side unless another is better by a clear
 * margin), then nudged inside the screen. Returns the box and the side.
 */
export function placeCard(
  anchor: { x: number; y: number },
  w: number,
  h: number,
  subject: Box,
  previous: Side | null,
): { box: Box; side: Side } {
  let best: { side: Side; along: number; p: number } | null = null;
  for (const side of SIDES)
    for (const along of side === "right" || side === "left" ? ALONG : [0.35]) {
      const p =
        penalty(boxAt(anchor, w, h, side, along), subject) -
        (side === previous ? 0.35 : 0) +
        Math.abs(along - 0.35) * 0.2;
      if (!best || p < best.p) best = { side, along, p };
    }
  const side = best?.side ?? "right";
  const b = boxAt(anchor, w, h, side, best?.along ?? 0.35);
  const dx = Math.max(CARD_BOUNDS.x0 - b.x0, 0) - Math.max(b.x1 - CARD_BOUNDS.x1, 0);
  const dy = Math.max(CARD_BOUNDS.y0 - b.y0, 0) - Math.max(b.y1 - CARD_BOUNDS.y1, 0);
  return { box: { x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy }, side };
}

/** The point on a box's edge nearest an outside point (where the leader meets the card). */
export function nearestOnBox(p: { x: number; y: number }, b: Box): { x: number; y: number } {
  return { x: Math.min(b.x1, Math.max(b.x0, p.x)), y: Math.min(b.y1, Math.max(b.y0, p.y)) };
}
