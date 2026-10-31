// The cutaway's section line: a transect from the S2 bundle (bundle_transects_ait_bouguemez) projected to the model
// frame's EPSG:32629, and the plane geometry of cutting the catchment along it. The profile's heights are the
// bundle's; nothing here invents a height.

import { z } from "zod";
import type { Point } from "./geometry";
import { lonLatToUtm } from "./utm";

/** WorldCover classes drawn under the profile: tree cover, and cropland or built-up. */
const TREE = 10;
const CROP_OR_BUILT = new Set([40, 50]);

/** A place is named on the section only when the line passes this close to it (m). */
export const PLACE_ON_LINE_M = 100;

const run = z.object({ class: z.number().int(), from_m: z.number(), to_m: z.number() });

export const cutawayTransectSchema = z
  .object({
    /** The bundle files the fixture is built from (samples, then the line's summary), with their checksums. */
    sources: z
      .array(z.object({ path: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/) }))
      .min(1),
    transect: z.string(),
    label: z.string(),
    crs: z.string().regex(/^EPSG:326\d{2}$/),
    /** Distance along the line from its north end (m), easting and northing (m), elevation (m). */
    d: z.array(z.number()).min(2),
    E: z.array(z.number()),
    N: z.array(z.number()),
    h: z.array(z.number()),
    land_cover_runs: z.array(run),
    // null where the place's transect states no valley floor (U25b: Calaveras Creek's valley axis)
    valley_floor: z.object({ from_m: z.number(), to_m: z.number() }).nullable(),
  })
  .refine(
    (t) => t.E.length === t.d.length && t.N.length === t.d.length && t.h.length === t.d.length,
    {
      message: "d, E, N and h must have one value per sample",
    },
  );

export type CutawayTransect = z.infer<typeof cutawayTransectSchema>;

/** The parts of the two bundle files the fixture is built from. */
interface SamplesBundle {
  transects: Record<
    string,
    {
      columns: { distance_m: number[]; lon: number[]; lat: number[]; elevation_m: number[] };
      land_cover_runs: { class: number; from_m: number; to_m: number }[];
    }
  >;
}
interface TerrainBundle {
  transects: Record<
    string,
    { label: string; valley_floor: { from_m: number; to_m: number } | null }
  >;
}

const tenth = (v: number) => Math.round(v * 10) / 10;

/** The cutaway's transect from the bundle: samples projected to UTM zone `zone` north at 0.1 m. */
export function transectFixture(
  samples: SamplesBundle,
  terrain: TerrainBundle,
  id: string,
  sources: { path: string; sha256: string }[],
  zone: number,
): CutawayTransect {
  const s = samples.transects[id];
  const t = terrain.transects[id];
  if (!s || !t) throw new Error(`no transect ${id}`);
  const { distance_m, lon, lat, elevation_m } = s.columns;
  const EN = lon.map((x, i) => lonLatToUtm(x, lat[i] ?? 0, zone));
  return {
    sources,
    transect: id,
    label: t.label,
    crs: `EPSG:326${String(zone).padStart(2, "0")}`,
    d: distance_m.slice(),
    E: EN.map(([E]) => tenth(E)),
    N: EN.map(([, N]) => tenth(N)),
    h: elevation_m.slice(),
    land_cover_runs: s.land_cover_runs.map((r) => ({
      class: r.class,
      from_m: r.from_m,
      to_m: r.to_m,
    })),
    valley_floor: t.valley_floor
      ? { from_m: t.valley_floor.from_m, to_m: t.valley_floor.to_m }
      : null,
  };
}

export interface Cut {
  /** Unit vector along the line, north end to south end, in model x, z. */
  along: Point;
  /** Unit vector across the line, pointing east (positive x). */
  east: Point;
  /** Signed distance (km) east of the line of a model point; the kept block is where it is >= 0. */
  side(x: number, z: number): number;
  /** Bearing (degrees from north) of the section face's outward normal, which looks west. */
  faceBearing: number;
  /** For the relief shader's uCut: nx, nz, offset. */
  plane: [number, number, number];
}

/** The cut through two model points (x, z), the north end first. */
export function makeCut(north: Point, south: Point): Cut {
  const dx = south[0] - north[0];
  const dz = south[1] - north[1];
  const L = Math.hypot(dx, dz) || 1;
  const along: Point = [dx / L, dz / L];
  let east: Point = [along[1], -along[0]];
  if (east[0] < 0) east = [-east[0], -east[1]];
  const off = north[0] * east[0] + north[1] * east[1];
  const bearing = (Math.atan2(-east[0], east[1]) * 180) / Math.PI;
  return {
    along,
    east,
    side: (x, z) => x * east[0] + z * east[1] - off,
    faceBearing: (bearing + 360) % 360,
    plane: [east[0], east[1], off],
  };
}

/**
 * The parts of a closed ring on the kept side (side >= 0), as open runs that end exactly on the cut. The ring is
 * walked from a vertex on the other side, so a run is never split where the ring closes.
 */
export function runsEastOf(ring: readonly Point[], side: (p: Point) => number): Point[][] {
  const n = ring.length;
  const start = ring.findIndex((p) => side(p) < 0);
  if (start < 0) return [ring.slice()];
  const runs: Point[][] = [];
  let cur: Point[] | null = null;
  for (let k = 0; k < n; k++) {
    const a = ring[(start + k) % n];
    const b = ring[(start + k + 1) % n];
    if (!a || !b) continue;
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) cur?.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (sa >= 0) {
        if (cur) {
          cur.push(p);
          runs.push(cur);
        }
        cur = null;
      } else cur = [p];
    }
  }
  return runs.filter((r) => r.length > 1);
}

/** Even-odd test of a point against a ring in the same coordinates. */
export function pointInRing(ring: readonly Point[], x: number, y: number): boolean {
  let inside = false;
  for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
    const p = ring[a];
    const q = ring[b];
    if (!p || !q) continue;
    if (p[1] > y !== q[1] > y && x < ((q[0] - p[0]) * (y - p[1])) / (q[1] - p[1]) + p[0])
      inside = !inside;
  }
  return inside;
}

/** Easting, northing and height at a distance (m) along the line, linear between samples. */
export function atDistance(t: CutawayTransect, dm: number): [number, number, number] {
  const { d, E, N, h } = t;
  let i = d.findIndex((v) => v >= dm) - 1;
  i = Math.min(d.length - 2, Math.max(0, i));
  const d0 = d[i] ?? 0;
  const d1 = d[i + 1] ?? d0;
  const f = d1 > d0 ? Math.min(1, Math.max(0, (dm - d0) / (d1 - d0))) : 0;
  const lerp = (a: number[]) => (a[i] ?? 0) + ((a[i + 1] ?? 0) - (a[i] ?? 0)) * f;
  return [lerp(E), lerp(N), lerp(h)];
}

/** The sample nearest a point (E, N), and how far (m) the point lies from it. */
export function nearestSample(t: CutawayTransect, E: number, N: number) {
  let i = 0;
  let best = Infinity;
  t.E.forEach((e, k) => {
    const dd = Math.hypot(e - E, (t.N[k] ?? 0) - N);
    if (dd < best) {
      best = dd;
      i = k;
    }
  });
  return { i, offset_m: best };
}

export interface CoverRun {
  cover: "tree" | "crop";
  from_m: number;
  to_m: number;
}

/** Tree cover and cropland or built-up runs along the line, clipped to the valley floor; none where it states none. */
export function floorCoverRuns(t: CutawayTransect): CoverRun[] {
  if (!t.valley_floor) return [];
  const { from_m: lo, to_m: hi } = t.valley_floor;
  const out: CoverRun[] = [];
  for (const r of t.land_cover_runs) {
    const cover = r.class === TREE ? "tree" : CROP_OR_BUILT.has(r.class) ? "crop" : null;
    const from = Math.max(r.from_m, lo);
    const to = Math.min(r.to_m, hi);
    if (cover && to > from) out.push({ cover, from_m: from, to_m: to });
  }
  return out;
}
