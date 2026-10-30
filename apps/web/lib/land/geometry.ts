// What a scene needs to know about a catchment's shape and height to frame it, from the case's own outline and
// relief, so that no camera, base or depth is tuned to one place. The constants are the D4 overview's for the
// Aït Bouguemez valley written as shares of that land's own size and height range, so that its approved look is kept
// and another land gets the same proportions.

import type { ReliefRange } from "./terrain";

type Ring = readonly (readonly number[])[];

/**
 * The bearing (degrees clockwise from north, 0 to 180) of the outline's long axis: the principal axis of its
 * vertices. A camera on this bearing looks along the land's length, so the land stands compact on screen.
 */
export function longAxisBearing(ring: Ring): number {
  const all = ring.map((p) => [p[0] ?? 0, p[1] ?? 0] as const);
  // a closed ring repeats its first vertex last: count it once
  const [first] = all;
  const last = all[all.length - 1];
  const pts =
    all.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]
      ? all.slice(0, -1)
      : all;
  const n = pts.length || 1;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n;
  const cy = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - cx) ** 2;
    syy += (y - cy) ** 2;
    sxy += (x - cx) * (y - cy);
  }
  const fromEast = (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI;
  return (((90 - fromEast) % 180) + 180) % 180;
}

/** The outline's bounding box diagonal (km). */
export function extentKm(ring: Ring): number {
  const xs = ring.map((p) => p[0] ?? 0);
  const ys = ring.map((p) => p[1] ?? 0);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 1000;
}

/** The D4 valley's diagonal (km), against which distances in km scale. */
const D4_EXTENT_KM = 47.9;

export interface LandFrame {
  /** The elevation the model's y = 0 stands at (m): a tenth of the range under the lowest height, to 100 m. */
  base: number;
  /** The height the overview's camera turns about (m). */
  target: number;
  /** How far below the rim the land's walls reach (m). */
  wall: number;
  /** The rim foot used to fit the land on screen (m below the rim). */
  rimFoot: number;
  /** Above this height (m) nothing can be hidden by the land. */
  ceiling: number;
  /** The bearing the overview looks from (degrees). */
  bearing: number;
  /** Scale for distances in km set on the D4 valley (1 for it). */
  kmScale: number;
}

export function landFrame(ring: Ring, range: ReliefRange): LandFrame {
  const r = Math.max(range.max - range.min, 1);
  return {
    base: Math.floor((range.min - 0.1 * r) / 100) * 100,
    target: range.min + 0.37 * r,
    wall: 0.355 * r,
    rimFoot: 0.177 * r,
    ceiling: range.max + 0.04 * r,
    bearing: longAxisBearing(ring),
    kmScale: extentKm(ring) / D4_EXTENT_KM,
  };
}
