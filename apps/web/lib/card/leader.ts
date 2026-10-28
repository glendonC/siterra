// The one leader from the card to its place (design language rule 5): out of the card's left edge level
// with the line it belongs to, a short horizontal run, then straight to the place. It ends in a small dot
// on a located thing, or in a short tick across the catchment line when the card is about the whole area.

export interface Point {
  x: number;
  y: number;
}

export type LeaderEnd = "dot" | "tick";

export interface LeaderGeometry {
  /** SVG path of the leader line. */
  d: string;
  end: LeaderEnd;
  /** The dot's centre, or the tick as an SVG path. */
  dot?: Point;
  tick?: string;
}

/** Horizontal run out of the card before the leader turns toward its place, CSS px. */
export const LEADER_RUN_PX = 28;
/** Offset from the top of the anchoring line to the leader's start, CSS px (half a 22 px line plus 1). */
export const LEADER_ANCHOR_DY = 12;
const TICK_HALF_PX = 6;

const f = (n: number) => n.toFixed(1);

export function leaderGeometry(
  cardLeft: number,
  anchorTop: number,
  target: Point,
  end: LeaderEnd,
): LeaderGeometry {
  const sy = anchorTop + LEADER_ANCHOR_DY;
  const kx = cardLeft - LEADER_RUN_PX;
  const d = `M${f(cardLeft)} ${f(sy)} L${f(kx)} ${f(sy)} L${f(target.x)} ${f(target.y)}`;
  if (end === "dot") return { d, end, dot: target };
  // the tick crosses the last segment at right angles
  const dx = target.x - kx;
  const dy = target.y - sy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * TICK_HALF_PX;
  const ny = (dx / len) * TICK_HALF_PX;
  return {
    d,
    end,
    tick: `M${f(target.x - nx)} ${f(target.y - ny)} L${f(target.x + nx)} ${f(target.y + ny)}`,
  };
}

/** The point of a projected outline nearest to where the leader turns, for a card about the whole area. */
export function nearestOnOutline(outline: Point[], from: Point): Point | undefined {
  let best: Point | undefined;
  let bestD = Infinity;
  for (const p of outline) {
    const dd = Math.hypot(p.x - from.x, p.y - from.y);
    if (dd < bestD) {
      bestD = dd;
      best = p;
    }
  }
  return best;
}
