import { type Outline, type OutlineKind, landWithinBox } from "./terrain-delineation.ts";

/**
 * Computes bbox (~20 km x 20 km) around (lon, lat) so both valley floor and flanking mountain ridges are captured.
 */
export function bboxAround(lon: number, lat: number): [number, number, number, number] {
  const halfKm = 10.0;
  const dLat = halfKm / 111.32;
  const cosLat = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const dLon = halfKm / (111.32 * cosLat);
  const minLon = Math.max(-179.95, Number((lon - dLon).toFixed(6)));
  const maxLon = Math.min(179.95, Number((lon + dLon).toFixed(6)));
  const minLat = Math.max(-84.95, Number((lat - dLat).toFixed(6)));
  const maxLat = Math.min(84.95, Number((lat + dLat).toFixed(6)));
  return [minLon, minLat, maxLon, maxLat];
}

/** Why an outline fell back to the box itself: no land in it, or every outline traced too small to draw. */
export type OutlineFallback = "no_land" | "outline_degenerate";

/** An outline of fewer cells than this is not drawn as the place's outline. */
export const MIN_OUTLINE_CELLS = 16;

/**
 * The ring a place is drawn and recorded with, never fewer than 4 points closed. The delineated outline when it
 * traces to at least 4 points over at least MIN_OUTLINE_CELLS cells; if a watershed kind does not, the land within
 * the box; if that does not either, or the box holds no land, the box itself, with the reason in `fallback`.
 */
export function outlineRing(
  outline: Outline,
  water: Uint8Array,
  w: number,
  h: number,
): { kind: OutlineKind; ring: [number, number][]; cells: number; fallback?: OutlineFallback } {
  const traced = (region: Uint8Array) => {
    let cells = 0;
    for (const v of region) cells += v;
    const ring = cells >= MIN_OUTLINE_CELLS ? traceRing(region, w, h) : [];
    return ring.length >= 4 ? { ring, cells } : null;
  };
  const box = (fallback: OutlineFallback) => ({
    kind: "box" as const,
    ring: traceRing(new Uint8Array(w * h).fill(1), w, h),
    cells: w * h,
    fallback,
  });
  if (!water.some((v) => v === 0)) return box("no_land");
  const own = traced(outline.region);
  if (own) return { kind: outline.kind, ...own };
  if (outline.kind !== "land_within_box") {
    const land = traced(landWithinBox(water, w, h, outline.from));
    if (land) return { kind: "land_within_box", ...land, fallback: "outline_degenerate" };
  }
  return box("outline_degenerate");
}

/**
 * The outer boundary of a region of grid nodes as a closed ring in fractional (col, row): marching squares at the
 * half-way level between nodes, the longest loop kept (holes and stray islands dropped), then Douglas-Peucker at
 * `tolerance` cells so the 78 m staircase becomes straight runs, then points every `maxStep` cells at most along
 * them. Counter-clockwise in (col, -row), first point repeated last.
 */
export function traceRing(
  region: Uint8Array,
  w: number,
  h: number,
  tolerance = 0.75,
  maxStep = 2,
): [number, number][] {
  // pad by one so a region touching the grid edge still closes, along the edge nodes themselves
  const at = (r: number, c: number) =>
    r >= 0 && r < h && c >= 0 && c < w ? (region[r * w + c] ?? 0) : 0;
  const key = (x: number, y: number) => `${String(Math.round(x * 2))},${String(Math.round(y * 2))}`;
  const next = new Map<string, [number, number][]>();
  const segs: Array<[[number, number], [number, number]]> = [];
  for (let r = -1; r < h; r++) {
    for (let c = -1; c < w; c++) {
      const tl = at(r, c);
      const tr = at(r, c + 1);
      const br = at(r + 1, c + 1);
      const bl = at(r + 1, c);
      const code = tl * 8 + tr * 4 + br * 2 + bl;
      if (code === 0 || code === 15) continue;
      // edge midpoints, clamped to the grid so a region along the edge is cut along its edge nodes
      const cl = (x: number, y: number): [number, number] => [
        Math.max(0, Math.min(w - 1, x)),
        Math.max(0, Math.min(h - 1, y)),
      ];
      const top = cl(c + 0.5, r);
      const right = cl(c + 1, r + 0.5);
      const bottom = cl(c + 0.5, r + 1);
      const left = cl(c, r + 0.5);
      const add = (a: [number, number], b: [number, number]) => {
        if (key(...a) !== key(...b)) segs.push([a, b]);
      };
      // segments oriented with the region on their left in (col, row) screen space
      switch (code) {
        case 1:
          add(bottom, left);
          break;
        case 2:
          add(right, bottom);
          break;
        case 3:
          add(right, left);
          break;
        case 4:
          add(top, right);
          break;
        case 5:
          add(top, left);
          add(bottom, right);
          break;
        case 6:
          add(top, bottom);
          break;
        case 7:
          add(top, left);
          break;
        case 8:
          add(left, top);
          break;
        case 9:
          add(bottom, top);
          break;
        case 10:
          add(left, bottom);
          add(right, top);
          break;
        case 11:
          add(right, top);
          break;
        case 12:
          add(left, right);
          break;
        case 13:
          add(bottom, right);
          break;
        case 14:
          add(left, bottom);
          break;
        default:
          break;
      }
    }
  }
  for (const [a, b] of segs) {
    const list = next.get(key(...a)) ?? [];
    list.push(b);
    next.set(key(...a), list);
  }
  const loops: [number, number][][] = [];
  for (const [a] of segs) {
    const ka = key(...a);
    if (!(next.get(ka)?.length ?? 0)) continue;
    const loop: [number, number][] = [a];
    let cur = a;
    for (let guard = 0; guard < segs.length + 1; guard++) {
      const list = next.get(key(...cur));
      const nb = list?.pop();
      if (!nb) break;
      cur = nb;
      loop.push(cur);
      if (key(...cur) === ka) break;
    }
    if (loop.length > 3) loops.push(loop);
  }
  const areaOf = (ring: readonly [number, number][]) => {
    let s = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const p = ring[i] ?? [0, 0];
      const q = ring[i + 1] ?? [0, 0];
      s += p[0] * -q[1] - q[0] * -p[1];
    }
    return s / 2;
  };
  let outer: [number, number][] = [];
  let outerArea = 0;
  for (const loop of loops) {
    const a = Math.abs(areaOf(loop));
    if (a > outerArea) {
      outerArea = a;
      outer = loop;
    }
  }
  if (outer.length < 4) return [];
  const simple = douglasPeucker(outer, tolerance);
  if (areaOf(simple) < 0) simple.reverse();
  // then no segment longer than maxStep cells: the land's walls and its framing are drawn from the ring's vertices,
  // so a long straight run would cut through the relief between two far vertices
  const dense: [number, number][] = [];
  for (let i = 0; i < simple.length - 1; i++) {
    const a = simple[i] ?? [0, 0];
    const b = simple[i + 1] ?? [0, 0];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxStep));
    for (let k = 0; k < steps; k++) {
      dense.push([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
    }
  }
  const first = dense[0];
  if (first) dense.push([first[0], first[1]]);
  return dense;
}

function douglasPeucker(pts: readonly [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [i0, i1] = stack.pop() ?? [0, 0];
    const a = pts[i0] ?? [0, 0];
    const b = pts[i1] ?? [0, 0];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    let worst = -1;
    let worstD = tol;
    for (let i = i0 + 1; i < i1; i++) {
      const p = pts[i] ?? [0, 0];
      const d =
        len === 0
          ? Math.hypot(p[0] - a[0], p[1] - a[1])
          : Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / len;
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([i0, worst], [worst, i1]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Geodesic polygon area approximation in square metres on WGS84 sphere.
 */
export function polygonAreaM2(ring: readonly [number, number][]): number {
  if (ring.length < 4) return 144_000_000;
  const R = 6371008.8;
  const deg = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const p1 = ring[i] ?? [0, 0];
    const p2 = ring[i + 1] ?? [0, 0];
    const lon1 = p1[0] * deg;
    const lat1 = p1[1] * deg;
    const lon2 = p2[0] * deg;
    const lat2 = p2[1] * deg;
    sum += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  const area = Math.abs((sum * R * R) / 2.0);
  return Math.max(1_000_000, Math.round(area));
}
