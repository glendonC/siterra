// Water on a live place's elevation grid: the mask the terrain builder stores with the terrain file and the
// overview draws from. Pure functions with no screen imports, so the server pipeline can load it under plain node.

/** WorldCover classes as satellite-fetcher.ts decodes them (0 to 255 per class channel; all zero: no reading). */
export interface WaterLandCover {
  width: number;
  height: number;
  tree: number[];
  crop: number[];
  grass?: number[];
  water?: number[];
  bare?: number[];
}

/** A cell of a water body more than this above the body's level is shore, not water (DEM noise on a lake is less). */
export const SHORE_TOLERANCE_M = 3;

/** Run lengths of a 0/1 mask in row-major order, alternating: first a land (0) run, then water (1), and so on. */
export function encodeRuns(mask: Uint8Array): number[] {
  const runs: number[] = [];
  let value = 0;
  let run = 0;
  for (const v of mask) {
    const b = v ? 1 : 0;
    if (b === value) {
      run++;
    } else {
      runs.push(run);
      value = b;
      run = 1;
    }
  }
  runs.push(run);
  return runs;
}

/** The mask encodeRuns wrote, or null when the runs do not cover exactly n cells. */
export function decodeRuns(runs: readonly number[], n: number): Uint8Array | null {
  const mask = new Uint8Array(n);
  let k = 0;
  let value = 0;
  for (const run of runs) {
    if (!Number.isInteger(run) || run < 0 || k + run > n) return null;
    if (value) mask.fill(1, k, k + run);
    k += run;
    value = 1 - value;
  }
  return k === n ? mask : null;
}

/**
 * The connected water bodies of a mask (8 neighbours) and each one's level. A lake's surface is flat in the DEM:
 * when at least 40% of a body's cells lie within 1 m of its median, the level is that median (a shore caught in
 * the body does not lift it). Otherwise the DEM holds bathymetry, and the level is its 90th percentile, the
 * shallow margin, near the surface (near 0 m at sea).
 */
export function waterBodies(
  mask: Uint8Array,
  elevations: readonly number[],
  w: number,
  h: number,
): { body: Int32Array; levels: number[] } {
  const body = new Int32Array(w * h).fill(-1);
  const levels: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || body[start] !== -1) continue;
    const id = levels.length;
    const heights: number[] = [];
    body[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const k = stack.pop() ?? 0;
      heights.push(elevations[k] ?? 0);
      const r = Math.floor(k / w);
      const c = k % w;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= h || cc < 0 || cc >= w) continue;
          const nk = rr * w + cc;
          if (mask[nk] && body[nk] === -1) {
            body[nk] = id;
            stack.push(nk);
          }
        }
      }
    }
    heights.sort((a, b) => a - b);
    const median = heights[Math.floor(0.5 * (heights.length - 1))] ?? 0;
    const nearMedian = heights.filter((v) => Math.abs(v - median) <= 1).length;
    levels.push(
      nearMedian >= 0.4 * heights.length
        ? median
        : (heights[Math.floor(0.9 * (heights.length - 1))] ?? median),
    );
  }
  return { body, levels };
}

/** Where the water mask came from: WorldCover with Terrarium for the sea beyond its tiles, or Terrarium alone. */
export type WaterSource = "worldcover_terrarium" | "terrarium";

/**
 * Water on the terrain grid's nodes. With a WorldCover grid: its permanent water class (80; herbaceous wetland,
 * class 90, stays land), plus cells at or below 0 m where WorldCover has no reading (open sea beyond its land
 * tiles). Without one: cells at or below 0 m connected to the box edge (the sea; a closed hollow below sea level
 * stays land). Then any cell more than SHORE_TOLERANCE_M above its water body's level is dropped as shore.
 * Elevation at or below 0 m alone is not water: low city blocks and polders sit there.
 */
export function buildWaterMask(
  elevations: readonly number[],
  w: number,
  h: number,
  lc?: WaterLandCover,
): { mask: Uint8Array; source: WaterSource } {
  const n = w * h;
  const seed = new Uint8Array(n);
  const lcN = lc ? lc.width * lc.height : 0;
  const lcWater = lc?.water;
  const withWorldCover =
    lc !== undefined && lcN > 0 && lcWater?.length === lcN && lc.tree.length === lcN;
  if (withWorldCover) {
    for (let r = 0; r < h; r++) {
      const lr = Math.min(lc.height - 1, Math.floor((r / Math.max(1, h - 1)) * lc.height));
      for (let c = 0; c < w; c++) {
        const lcc = Math.min(lc.width - 1, Math.floor((c / Math.max(1, w - 1)) * lc.width));
        const q = lr * lc.width + lcc;
        const wv = lcWater[q] ?? 0;
        const noReading = !lc.tree[q] && !lc.crop[q] && !lc.grass?.[q] && !wv && !lc.bare?.[q];
        const k = r * w + c;
        seed[k] = wv >= 250 || (noReading && (elevations[k] ?? 1) <= 0) ? 1 : 0;
      }
    }
  } else {
    const stack: number[] = [];
    const push = (k: number) => {
      if (!seed[k] && (elevations[k] ?? 1) <= 0) {
        seed[k] = 1;
        stack.push(k);
      }
    };
    for (let c = 0; c < w; c++) {
      push(c);
      push((h - 1) * w + c);
    }
    for (let r = 0; r < h; r++) {
      push(r * w);
      push(r * w + w - 1);
    }
    while (stack.length > 0) {
      const k = stack.pop() ?? 0;
      const r = Math.floor(k / w);
      const c = k % w;
      if (r > 0) push(k - w);
      if (r < h - 1) push(k + w);
      if (c > 0) push(k - 1);
      if (c < w - 1) push(k + 1);
    }
  }
  const { body, levels } = waterBodies(seed, elevations, w, h);
  const mask = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const b = body[k] ?? -1;
    if (b >= 0 && (elevations[k] ?? 0) <= (levels[b] ?? 0) + SHORE_TOLERANCE_M) mask[k] = 1;
  }
  return { mask, source: withWorldCover ? "worldcover_terrarium" : "terrarium" };
}
