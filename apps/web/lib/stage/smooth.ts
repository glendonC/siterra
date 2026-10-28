// Display smoothing of the catchment outline: a circular moving average over 2k + 1 vertices, as DESIGN B
// drew the approved arrival (catchmentUV, smooth 2). The 30 m outline comes from a raster and steps at
// every cell; the record's geometry is never changed, only the drawn line.

import type { Feature, MultiPolygon, Polygon, Position } from "./geo";

export function smoothRing(ring: Position[], k = 2): Position[] {
  const closed =
    ring.length > 1 && ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1];
  const open = closed ? ring.slice(0, -1) : ring.slice();
  const n = open.length;
  if (n < 2 * k + 1) return ring;
  const out: Position[] = [];
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    for (let d = -k; d <= k; d++) {
      const p = open[(i + d + n) % n];
      x += p?.[0] ?? 0;
      y += p?.[1] ?? 0;
    }
    out.push([x / (2 * k + 1), y / (2 * k + 1)]);
  }
  const first = out[0];
  if (first) out.push([first[0], first[1]]);
  return out;
}

/** The same feature with every ring smoothed for display. */
export function smoothFeature(f: Feature, k = 2): Feature {
  const g = f.geometry;
  const geometry: Polygon | MultiPolygon =
    g.type === "Polygon"
      ? { type: "Polygon", coordinates: g.coordinates.map((r) => smoothRing(r, k)) }
      : {
          type: "MultiPolygon",
          coordinates: g.coordinates.map((p) => p.map((r) => smoothRing(r, k))),
        };
  return { ...f, geometry };
}
