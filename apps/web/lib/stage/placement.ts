// Where the names on the ground go, computed from the catchment outline so they follow the record.
// Same rules as the approved hero: the valley name over the broad eastern part, read across the screen;
// the study-area label just outside the long northern edge, read along it.

import type { Feature, Position } from "./geo";

const M_PER_DEG_LAT = 111320;

interface LocalFrame {
  toXY: (p: Position) => { x: number; y: number };
  toLonLat: (x: number, y: number) => [number, number];
}

/** Metres east (x) and north (y) of an origin, flat-earth; good to a few metres over a valley. */
export function localFrame(lon0: number, lat0: number): LocalFrame {
  const mx = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  return {
    toXY: (p) => ({ x: (p[0] - lon0) * mx, y: (p[1] - lat0) * M_PER_DEG_LAT }),
    toLonLat: (x, y) => [lon0 + x / mx, lat0 + y / M_PER_DEG_LAT],
  };
}

function outerRing(f: Feature): Position[] {
  const g = f.geometry;
  if (g.type === "Polygon") return g.coordinates[0] ?? [];
  // the largest part by vertex count stands in for the main outline
  return g.coordinates
    .flatMap((p) => p.slice(0, 1))
    .reduce<Position[]>((a, b) => (b.length > a.length ? b : a), []);
}

function centroidOfVertices(ring: Position[]): [number, number] {
  const open = ring.slice(0, -1);
  const x = open.reduce((s, p) => s + p[0], 0);
  const y = open.reduce((s, p) => s + p[1], 0);
  return [x / open.length, y / open.length];
}

export interface GroundAnchor {
  lon: number;
  lat: number;
  /** Compass direction the text reads toward. */
  readingBearingDeg: number;
}

/**
 * The valley name: the mean of the outline's vertices more than `eastOfM` east of a reference place,
 * moved by `shiftM` (east, north), read toward `readingBearingDeg`.
 */
export function valleyNameAnchor(
  catchment: Feature,
  reference: { lon: number; lat: number },
  opts: { eastOfM: number; shiftM: { east: number; north: number }; readingBearingDeg: number },
): GroundAnchor {
  const ring = outerRing(catchment);
  const frame = localFrame(reference.lon, reference.lat);
  const east = ring
    .slice(0, -1)
    .map(frame.toXY)
    .filter((p) => p.x > opts.eastOfM);
  if (east.length === 0) throw new Error("No outline east of the reference place");
  const mx = east.reduce((s, p) => s + p.x, 0) / east.length + opts.shiftM.east;
  const my = east.reduce((s, p) => s + p.y, 0) / east.length + opts.shiftM.north;
  const [lon, lat] = frame.toLonLat(mx, my);
  return { lon, lat, readingBearingDeg: opts.readingBearingDeg };
}

/**
 * The study-area label: between the westmost and eastmost outline vertices north of the centre within a
 * longitude band, pushed `outM` outward (northward side), read along that edge from west to east.
 */
export function northEdgeAnchor(
  catchment: Feature,
  opts: { lonBand: [number, number]; outM: number },
): GroundAnchor {
  const ring = outerRing(catchment);
  const [clon, clat] = centroidOfVertices(ring);
  const frame = localFrame(clon, clat);
  const north = ring
    .slice(0, -1)
    .filter((p) => p[0] > opts.lonBand[0] && p[0] < opts.lonBand[1] && p[1] > clat)
    .map(frame.toXY);
  if (north.length < 2) throw new Error("Too few outline vertices on the northern edge");
  const a = north.reduce((b, p) => (p.x < b.x ? p : b));
  const b = north.reduce((c, p) => (p.x > c.x ? p : c));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  // the normal on the north side of the west-to-east direction
  const nx = -dy / len;
  const ny = dx / len;
  const [lon, lat] = frame.toLonLat(
    (a.x + b.x) / 2 + nx * opts.outM,
    (a.y + b.y) / 2 + ny * opts.outM,
  );
  const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return { lon, lat, readingBearingDeg: bearing };
}
