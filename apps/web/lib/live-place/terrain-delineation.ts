const D8: ReadonlyArray<readonly [number, number, number]> = [
  [-1, 0, 1],
  [-1, 1, Math.SQRT2],
  [0, 1, 1],
  [1, 1, Math.SQRT2],
  [1, 0, 1],
  [1, -1, Math.SQRT2],
  [0, -1, 1],
  [-1, -1, Math.SQRT2],
];

/** The rise priority flood gives each filled cell over the cell it drains to, so flats drain (m). */
const FILL_EPSILON_M = 1e-3;

/** A binary min-heap of grid cells keyed by height, ties by insertion order. */
class CellHeap {
  private readonly keys: number[] = [];
  private readonly cells: number[] = [];
  private readonly order: number[] = [];
  private count = 0;
  get size(): number {
    return this.keys.length;
  }
  push(cell: number, key: number): void {
    this.keys.push(key);
    this.cells.push(cell);
    this.order.push(this.count++);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.cells[0] ?? -1;
    const lastKey = this.keys.pop() ?? 0;
    const lastCell = this.cells.pop() ?? -1;
    const lastOrder = this.order.pop() ?? 0;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.cells[0] = lastCell;
      this.order[0] = lastOrder;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.less(l, m)) m = l;
        if (r < this.keys.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private less(a: number, b: number): boolean {
    const ka = this.keys[a] ?? 0;
    const kb = this.keys[b] ?? 0;
    return ka < kb || (ka === kb && (this.order[a] ?? 0) < (this.order[b] ?? 0));
  }
  private swap(a: number, b: number): void {
    for (const arr of [this.keys, this.cells, this.order]) {
      const t = arr[a] ?? 0;
      arr[a] = arr[b] ?? 0;
      arr[b] = t;
    }
  }
}

/**
 * Depression filling by priority flood with epsilon (Barnes, Lehman and Mulla 2014): from every cell where water
 * leaves the grid (the box edge, and water bodies), each cell is raised to at least a hair above the cell it is
 * reached from, so every land cell has a downhill path to an edge or to water. Returns the filled heights.
 */
export function priorityFloodFill(
  elevations: readonly number[],
  w: number,
  h: number,
  water: Uint8Array,
): Float64Array {
  const filled = new Float64Array(w * h);
  const done = new Uint8Array(w * h);
  const heap = new CellHeap();
  for (let k = 0; k < w * h; k++) {
    const r = Math.floor(k / w);
    const c = k % w;
    if (water[k] || r === 0 || c === 0 || r === h - 1 || c === w - 1) {
      const v = elevations[k] ?? 0;
      filled[k] = v;
      done[k] = 1;
      heap.push(k, v);
    }
  }
  while (heap.size > 0) {
    const k = heap.pop();
    const r = Math.floor(k / w);
    const c = k % w;
    for (const [dr, dc] of D8) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr >= h || cc < 0 || cc >= w) continue;
      const nk = rr * w + cc;
      if (done[nk]) continue;
      done[nk] = 1;
      const v = Math.max(elevations[nk] ?? 0, (filled[k] ?? 0) + FILL_EPSILON_M);
      filled[nk] = v;
      heap.push(nk, v);
    }
  }
  return filled;
}

/**
 * D8 flow on a filled grid: each land cell drains to its steepest downhill neighbour (drop over distance); water
 * cells and cells with no lower neighbour (the box edge) drain out of the grid (-1).
 */
export function d8FlowTargets(
  filled: Float64Array,
  w: number,
  h: number,
  water: Uint8Array,
): Int32Array {
  const target = new Int32Array(w * h).fill(-1);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const k = r * w + c;
      if (water[k]) continue;
      let best = 0;
      for (const [dr, dc, dist] of D8) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= h || cc < 0 || cc >= w) continue;
        const nk = rr * w + cc;
        const slope = ((filled[k] ?? 0) - (filled[nk] ?? 0)) / dist;
        if (slope > best) {
          best = slope;
          target[k] = nk;
        }
      }
    }
  }
  return target;
}

/** Cells draining through each cell, itself included (a count of cells). */
function flowAccumulation(target: Int32Array, filled: Float64Array): Float64Array {
  const n = target.length;
  const acc = new Float64Array(n).fill(1);
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => (filled[b] ?? 0) - (filled[a] ?? 0),
  );
  for (const k of order) {
    const t = target[k] ?? -1;
    if (t >= 0) acc[t] = (acc[t] ?? 0) + (acc[k] ?? 0);
  }
  return acc;
}

/**
 * What the outline is. A watershed: everything draining through the outlet, all inside the box. A drainage area
 * within the box: the same, but the box cuts it, so it is part of a larger watershed. Land within the box: where a
 * watershed means little (the outlet's basin under MIN_BASIN_SHARE of the box's land, as on a coast or in a city
 * by the water), the land around the point inside the box, clipped at the water.
 */
export type OutlineKind = "watershed" | "drainage_within_box" | "land_within_box" | "box";

/** A basin smaller than this share of the box's land is not shown as the place's outline. */
export const MIN_BASIN_SHARE = 0.03;

export interface Outline {
  kind: OutlineKind;
  /** Grid nodes inside the outline. */
  region: Uint8Array;
  /** The outlet node (watershed kinds), row-major index. */
  outlet?: number;
  /** The land node the outline starts from: the point, or the land nearest it. */
  from: number;
  /** D8 targets on the filled grid, for the channels. */
  target: Int32Array;
  acc: Float64Array;
}

/**
 * The outline for the point at node `start` (the box centre is the chosen place). From the point, follow the D8
 * flow downhill on the filled grid until it leaves the box or meets water; the last land cell is the outlet and the
 * basin is every cell draining through it. A basin touching the box edge anywhere but at its outlet is cut by the
 * box. A basin under MIN_BASIN_SHARE of the box's land falls back to the land within the box: the connected land
 * (with any water it encloses) around the point, water that reaches the box edge left out.
 */
export function delineateOutline(
  elevations: readonly number[],
  w: number,
  h: number,
  water: Uint8Array,
  start: number,
): Outline {
  const n = w * h;
  const filled = priorityFloodFill(elevations, w, h, water);
  const target = d8FlowTargets(filled, w, h, water);
  const acc = flowAccumulation(target, filled);
  const onEdge = (k: number) => {
    const r = Math.floor(k / w);
    const c = k % w;
    return r === 0 || c === 0 || r === h - 1 || c === w - 1;
  };
  let landCells = 0;
  for (let k = 0; k < n; k++) if (!water[k]) landCells++;

  // the point itself, or the nearest land to it
  let from = start;
  if (water[from]) {
    let best = Infinity;
    const r0 = Math.floor(start / w);
    const c0 = start % w;
    for (let k = 0; k < n; k++) {
      if (water[k]) continue;
      const d = Math.hypot(Math.floor(k / w) - r0, (k % w) - c0);
      if (d < best) {
        best = d;
        from = k;
      }
    }
  }

  let outlet = from;
  const seen = new Set<number>();
  for (;;) {
    seen.add(outlet);
    const t = target[outlet] ?? -1;
    if (t < 0 || water[t] || seen.has(t)) break;
    outlet = t;
  }

  // every cell whose flow passes through the outlet
  const upstream: number[][] = Array.from({ length: n }, () => []);
  for (let k = 0; k < n; k++) {
    const t = target[k] ?? -1;
    if (t >= 0) upstream[t]?.push(k);
  }
  const basin = new Uint8Array(n);
  const stack = [outlet];
  basin[outlet] = 1;
  let basinCells = 0;
  let cut = false;
  while (stack.length > 0) {
    const k = stack.pop() ?? 0;
    basinCells++;
    if (k !== outlet && onEdge(k)) cut = true;
    for (const u of upstream[k] ?? []) {
      if (!basin[u]) {
        basin[u] = 1;
        stack.push(u);
      }
    }
  }

  if (landCells > 0 && basinCells >= MIN_BASIN_SHARE * landCells) {
    return {
      kind: cut ? "drainage_within_box" : "watershed",
      region: basin,
      outlet,
      from,
      target,
      acc,
    };
  }

  return { kind: "land_within_box", region: landWithinBox(water, w, h, from), from, target, acc };
}

/**
 * The land within the box around node `from`: water reaching the box edge is outside; the land and any water it
 * encloses, connected to `from` (4 neighbours), inside.
 */
export function landWithinBox(water: Uint8Array, w: number, h: number, from: number): Uint8Array {
  const n = w * h;
  const onEdge = (k: number) => {
    const r = Math.floor(k / w);
    const c = k % w;
    return r === 0 || c === 0 || r === h - 1 || c === w - 1;
  };
  const outerWater = new Uint8Array(n);
  const ws: number[] = [];
  for (let k = 0; k < n; k++) {
    if (water[k] && onEdge(k)) {
      outerWater[k] = 1;
      ws.push(k);
    }
  }
  while (ws.length > 0) {
    const k = ws.pop() ?? 0;
    const r = Math.floor(k / w);
    const c = k % w;
    for (const [dr, dc] of D8) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr >= h || cc < 0 || cc >= w) continue;
      const nk = rr * w + cc;
      if (water[nk] && !outerWater[nk]) {
        outerWater[nk] = 1;
        ws.push(nk);
      }
    }
  }
  const region = new Uint8Array(n);
  const rs = [from];
  region[from] = 1;
  while (rs.length > 0) {
    const k = rs.pop() ?? 0;
    const r = Math.floor(k / w);
    const c = k % w;
    for (const [dr, dc] of D8.filter(([dr2, dc2]) => dr2 === 0 || dc2 === 0)) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr >= h || cc < 0 || cc >= w) continue;
      const nk = rr * w + cc;
      if (!outerWater[nk] && !region[nk]) {
        region[nk] = 1;
        rs.push(nk);
      }
    }
  }
  return region;
}

/** Channels drain at least this area (km²) before they are drawn. */
const CHANNEL_MIN_KM2 = 1;

/**
 * Drainage lines computed from the D8 flow inside a watershed outline: the main stem from the outlet up the
 * largest upstream branch, then up to two tributaries joining it with the largest drainage, each followed while
 * it drains at least CHANNEL_MIN_KM2. Computed from the DEM, not mapped streams. Fractional (col, row) paths.
 */
export function traceChannels(
  outline: Outline,
  w: number,
  cellKm2: number,
): Array<Array<[number, number]>> {
  const { target, acc, region, outlet } = outline;
  if (outlet === undefined) return [];
  const minCells = Math.max(8, CHANNEL_MIN_KM2 / Math.max(1e-9, cellKm2));
  const upstream = new Map<number, number[]>();
  for (let k = 0; k < target.length; k++) {
    const t = target[k] ?? -1;
    if (t >= 0 && region[k]) {
      const list = upstream.get(t) ?? [];
      list.push(k);
      upstream.set(t, list);
    }
  }
  const climb = (from: number): number[] => {
    const path = [from];
    let cur = from;
    for (;;) {
      const ups = (upstream.get(cur) ?? []).filter((u) => (acc[u] ?? 0) >= minCells);
      if (ups.length === 0) break;
      ups.sort((a, b) => (acc[b] ?? 0) - (acc[a] ?? 0));
      cur = ups[0] ?? cur;
      path.push(cur);
    }
    return path;
  };
  if ((acc[outlet] ?? 0) < minCells) return [];
  const main = climb(outlet);
  const onMain = new Set(main);
  const joins: Array<[number, number]> = [];
  for (const k of main) {
    for (const u of upstream.get(k) ?? []) {
      if (!onMain.has(u) && (acc[u] ?? 0) >= minCells) joins.push([u, acc[u] ?? 0]);
    }
  }
  joins.sort((a, b) => b[1] - a[1]);
  const paths = [main, ...joins.slice(0, 2).map(([u]) => climb(u))];
  return paths
    .filter((p) => p.length >= 3)
    .map((p) => p.reverse().map((k): [number, number] => [k % w, Math.floor(k / w)]));
}
