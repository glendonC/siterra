import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fetchOpenMeteoGrid, fetchTerrariumGrid, interpolateGrid } from "./dem-grid.ts";
import * as elevationSources from "./elevation-sources.ts";
import {
  ELEVATION_METHOD,
  type ElevationGrid,
  type ElevationSourceId,
} from "./elevation-sources.ts";
import { type NamedPeak, fetchRealHydrology } from "./hydrology-fetcher.ts";
import * as imagery from "./imagery.ts";
import type { TrueColourImage, TrueColourSelectionRule } from "./imagery.ts";
import { cachedLive, liveCacheKey } from "./live-cache.ts";
import { type LandCoverGrid, fetchSatelliteLandCover } from "./satellite-fetcher.ts";
import { buildWaterMask, encodeRuns, type WaterSource } from "./water-mask.ts";

export { fetchOpenMeteoGrid, fetchTerrariumGrid };

const REPO_ROOT = process.cwd().endsWith("/apps/web")
  ? resolve(process.cwd(), "..", "..")
  : process.cwd();

export interface SatelliteMeta {
  worldCoverItemId?: string;
  worldCoverYear?: number;
  worldCoverTileUrl?: string;
  sentinel2ItemId?: string;
  sentinel2ItemIds?: string[];
  sentinel2Datetime?: string;
  sentinel2Date?: string;
  sentinel2CloudCover?: number;
  sentinel2SceneCloudCover?: number;
  sentinel2SnowCover?: number;
  sentinel2Platform?: string;
  sentinel2SelectionRule?: TrueColourSelectionRule;
  sentinel2Selection?: string;
  sentinel2Attribution?: string;
  elevationSourceId?: ElevationSourceId;
  elevationSurface?: ElevationGrid["surface"];
  elevationNominalResolutionM?: number;
  elevationVerticalDatum?: string;
  elevationItemIds?: string[];
  elevationAttribution?: string;
  metaCanopyQuadKey?: string;
  metaCanopyTileUrl?: string;
  treeCoverPct?: number;
  croplandPct?: number;
  grasslandPct?: number;
  waterPct?: number;
  barePct?: number;
}

export interface ElevationModelMeta {
  source: ElevationSourceId;
  surface: ElevationGrid["surface"];
  nominalResolutionM: number;
  verticalDatum: string;
  itemIds: string[];
  attribution: string;
  noReadingShare: number;
  noReadingAtSeaShare: number | null;
  tried: ElevationGrid["tried"];
}

export interface TerrainTrueColour {
  width: number;
  height: number;
  /** Base64-encoded PNG (row 0 north, over bbox). */
  pngBase64: string;
  itemIds: string[];
  datetime: string;
  date: string;
  platform: string;
  sceneCloudPct: number;
  boxCloudPct: number;
  boxSnowPct: number;
  selectionRule: TrueColourSelectionRule;
  attribution: string;
  selection: string;
}

/** Bumped when the stored grid changes meaning; readOrBuildTerrain rebuilds any other version in place. */
export const TERRAIN_FILE_VERSION = 2;
/** Elevation grid nodes a side: the overview's own 256 x 256 relief grid. */
export const TERRAIN_GRID_SIZE = 256;

/** Where the drawn drainage lines came from: mapped waterways, the DEM's D8 flow, or none. */
export type StreamSource = "openstreetmap" | "d8_dem" | "none";

/** Where the stored elevations came from. */
export type ElevationSource = "terrarium_z12" | "terrarium_z11" | "open_meteo_16";

/** Neither elevation source could be read for the box: no land is drawn, and the failure says so. */
export class ElevationUnavailableError extends Error {
  constructor(bbox: readonly number[]) {
    super(
      `Elevation unavailable for ${bbox.map((v) => v.toFixed(4)).join(", ")}: the Terrarium tiles and the Open-Meteo elevation grid could not be read.`,
    );
    this.name = "ElevationUnavailableError";
  }
}

export interface TerrainFile {
  version: 2;
  gridSize: number;
  width: number;
  height: number;
  bbox: [number, number, number, number];
  /** Lowest and highest land elevation (m): water cells are left out (version 2), the whole grid if all is water. */
  minElevationM: number;
  maxElevationM: number;
  elevations: number[];
  elevationSource?: ElevationSource;
  /** Measured STAC DEM metadata (USGS 3DEP 1/3 arc-second bare-earth or Copernicus DEM GLO-30) when used. */
  elevationModel?: ElevationModelMeta;
  /** Snow-free growing-season Sentinel-2 L2A true-colour composite over bbox when retrieved. */
  trueColour?: TerrainTrueColour;
  /** Terrarium pixels replaced as defects before sampling (dem-grid.ts despikeMosaic), when the source is Terrarium. */
  despikedPixels?: number;
  /** Water on the elevation grid's nodes (water-mask.ts buildWaterMask, encodeRuns). */
  waterMask?: { runs: number[]; source: WaterSource };
  /** Grid nodes that are land; minElevationM and maxElevationM are over these when there are any. */
  landCells?: number;
  /** The outline's ring (lon, lat, counter-clockwise, closed); what it is says `outline`. */
  catchmentRing: [number, number][];
  outline?: {
    kind: OutlineKind;
    /** Set when the delineated outline could not be drawn and a simpler one stands in, and why. */
    fallback?: OutlineFallback;
    /** Where the watershed drains out (watershed kinds). */
    outlet?: [number, number];
    /** Area inside the outline from the grid's nodes (km²). */
    areaKm2: number;
  };
  streamPaths: [number, number][][];
  streamSource?: StreamSource;
  /** Each mapped stream's OpenStreetMap `waterway` tag when `streamSource` is `"openstreetmap"`. */
  streamKinds?: string[];
  landCoverGrid?: LandCoverGrid;
  namedWaterways?: string[];
  namedPeaks?: NamedPeak[];
  protectedAreas?: string[];
  satelliteMeta?: SatelliteMeta;
}

export function terrainCachePath(caseId: string): string {
  const safeId = caseId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(REPO_ROOT, ".local", "cache", "terrain", `${safeId}.json`);
}

function legacyTmpCachePath(caseId: string): string {
  return `/tmp/siterra-terrain-${caseId}.json`;
}

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

/** WorldCover read for the same bbox by an earlier build, kept when a rebuild cannot reach Planetary Computer. */
export interface EarlierLandCover {
  landCoverGrid: LandCoverGrid;
  satelliteMeta?: SatelliteMeta;
}

export async function buildTerrainForBbox(
  bbox: [number, number, number, number],
  caseId?: string,
  earlier?: EarlierLandCover,
): Promise<TerrainFile> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const cy = (minLat + maxLat) / 2;
  const coarseSize = 16;
  const targetSize = TERRAIN_GRID_SIZE;

  const fetchElev = () =>
    caseId
      ? cachedLive<ElevationGrid>(
          "elevation",
          liveCacheKey(bbox, undefined, `${ELEVATION_METHOD.version}@${String(targetSize)}`),
          () => elevationSources.fetchElevation(bbox, targetSize, { timeoutMs: 12_000 }),
        )
      : elevationSources.fetchElevation(bbox, targetSize, { timeoutMs: 12_000 });
  const fetchPhoto = () =>
    caseId
      ? imagery.cachedTrueColour(bbox, { size: targetSize, timeoutMs: 12_000 })
      : imagery.fetchTrueColour(bbox, { size: targetSize, timeoutMs: 12_000 });

  const [elevationResult, hydrology, fetched, trueColourResult] = await Promise.all([
    fetchElev().catch(() => null),
    fetchRealHydrology(bbox),
    fetchSatelliteLandCover(bbox),
    fetchPhoto().catch(() => null),
  ]);
  // the same box's WorldCover from an earlier build stands in when this fetch came back without it
  const satellite =
    !fetched.landCoverGrid && earlier
      ? { ...earlier.satelliteMeta, ...fetched, landCoverGrid: earlier.landCoverGrid }
      : fetched;

  let elevations: number[];
  let elevationSource: ElevationSource | undefined;
  let elevationModel: ElevationModelMeta | undefined;
  let despikedPixels: number | undefined;

  if (elevationResult?.status === "measured") {
    const grid = elevationResult.value;
    elevations = Array.from(grid.elevationsM, (v) =>
      Number.isFinite(v) ? Number(v.toFixed(1)) : 0,
    );
    elevationModel = {
      source: grid.source,
      surface: grid.surface,
      nominalResolutionM: grid.nominalResolutionM,
      verticalDatum: grid.verticalDatum,
      itemIds: grid.itemIds,
      attribution: grid.attribution,
      noReadingShare: grid.noReadingShare,
      noReadingAtSeaShare: grid.noReadingAtSeaShare,
      tried: grid.tried,
    };
  } else {
    const terrarium = await fetchTerrariumGrid(bbox, targetSize);
    if (terrarium) {
      elevations = terrarium.elevations;
      elevationSource = terrarium.zoom === 12 ? "terrarium_z12" : "terrarium_z11";
      despikedPixels = terrarium.despikedPixels;
    } else {
      // Open-Meteo's elevation grid (16 x 16 points, Copernicus DEM 90 m) is coarse and labelled as such; with neither
      // source there is no land to draw, and nothing stands in for it
      const liveCoarse = await fetchOpenMeteoGrid(bbox, coarseSize);
      if (!liveCoarse) throw new ElevationUnavailableError(bbox);
      elevationSource = "open_meteo_16";
      elevations = interpolateGrid(liveCoarse, coarseSize, targetSize);
    }
  }

  // water is mapped once here; the elevations stay as measured, and the land's own range leaves water out
  const water = buildWaterMask(elevations, targetSize, targetSize, satellite.landCoverGrid);
  let landCells = 0;
  let minElevationM = Infinity;
  let maxElevationM = -Infinity;
  for (let i = 0; i < elevations.length; i++) {
    if (water.mask[i]) continue;
    const v = elevations[i] ?? 0;
    landCells++;
    if (v < minElevationM) minElevationM = v;
    if (v > maxElevationM) maxElevationM = v;
  }
  if (landCells === 0) {
    minElevationM = elevations.reduce((m, v) => Math.min(m, v), Infinity);
    maxElevationM = elevations.reduce((m, v) => Math.max(m, v), -Infinity);
  }

  // the outline: a watershed delineated from the chosen point (the box centre), or the land within the box
  const toLonLat = ([col, row]: [number, number]): [number, number] => [
    Number((minLon + (col / (targetSize - 1)) * (maxLon - minLon)).toFixed(6)),
    Number((maxLat - (row / (targetSize - 1)) * (maxLat - minLat)).toFixed(6)),
  ];
  const centre = Math.round((targetSize - 1) / 2) * targetSize + Math.round((targetSize - 1) / 2);
  const outline = delineateOutline(elevations, targetSize, targetSize, water.mask, centre);
  const drawn = outlineRing(outline, water.mask, targetSize, targetSize);
  const catchmentRing = drawn.ring.map(toLonLat);
  const outlineCells = drawn.cells;
  const cellKm2 =
    ((maxLon - minLon) * 111.32 * Math.cos((cy * Math.PI) / 180) * (maxLat - minLat) * 111.32) /
    ((targetSize - 1) * (targetSize - 1));

  // mapped OpenStreetMap waterways when Overpass has them; otherwise, inside a watershed, drainage lines computed
  // from the D8 flow (none on land within the box, where they would mean little)
  const d8Channels =
    drawn.kind !== "watershed" && drawn.kind !== "drainage_within_box"
      ? []
      : traceChannels(outline, targetSize, cellKm2).map((p) => p.map(toLonLat));
  const streamSource: StreamSource =
    hydrology.streamPaths.length > 0 ? "openstreetmap" : d8Channels.length > 0 ? "d8_dem" : "none";
  const streamPaths = hydrology.streamPaths.length > 0 ? hydrology.streamPaths : d8Channels;
  const streamKinds =
    streamSource === "openstreetmap" && hydrology.streamKinds.length === streamPaths.length
      ? hydrology.streamKinds
      : undefined;

  const tc: TrueColourImage | null =
    trueColourResult?.status === "measured" ? trueColourResult.value : null;
  const trueColour: TerrainTrueColour | undefined =
    tc && tc.png.byteLength > 0
      ? {
          width: tc.width,
          height: tc.height,
          pngBase64: Buffer.from(tc.png).toString("base64"),
          itemIds: tc.itemIds,
          datetime: tc.datetime,
          date: tc.date,
          platform: tc.platform,
          sceneCloudPct: tc.sceneCloudPct,
          boxCloudPct: tc.boxCloudPct,
          boxSnowPct: tc.boxSnowPct,
          selectionRule: tc.selectionRule,
          attribution: tc.attribution,
          selection: tc.selection,
        }
      : undefined;

  const s2ItemId = tc?.itemIds[0] ?? satellite.sentinel2ItemId;
  const s2Datetime = tc?.datetime ?? satellite.sentinel2Datetime;
  const s2CloudCover = tc?.boxCloudPct ?? satellite.sentinel2CloudCover;
  const s2Platform = tc?.platform ?? satellite.sentinel2Platform;

  const satelliteMeta: SatelliteMeta = {
    ...(satellite.worldCoverItemId ? { worldCoverItemId: satellite.worldCoverItemId } : {}),
    ...(satellite.worldCoverYear !== undefined ? { worldCoverYear: satellite.worldCoverYear } : {}),
    ...(satellite.worldCoverTileUrl ? { worldCoverTileUrl: satellite.worldCoverTileUrl } : {}),
    ...(s2ItemId ? { sentinel2ItemId: s2ItemId } : {}),
    ...(tc?.itemIds ? { sentinel2ItemIds: tc.itemIds } : {}),
    ...(s2Datetime ? { sentinel2Datetime: s2Datetime } : {}),
    ...(tc?.date ? { sentinel2Date: tc.date } : {}),
    ...(s2CloudCover !== undefined ? { sentinel2CloudCover: s2CloudCover } : {}),
    ...(tc
      ? { sentinel2SceneCloudCover: tc.sceneCloudPct, sentinel2SnowCover: tc.boxSnowPct }
      : {}),
    ...(s2Platform ? { sentinel2Platform: s2Platform } : {}),
    ...(tc
      ? {
          sentinel2SelectionRule: tc.selectionRule,
          sentinel2Selection: tc.selection,
          sentinel2Attribution: tc.attribution,
        }
      : {}),
    ...(elevationModel
      ? {
          elevationSourceId: elevationModel.source,
          elevationSurface: elevationModel.surface,
          elevationNominalResolutionM: elevationModel.nominalResolutionM,
          elevationVerticalDatum: elevationModel.verticalDatum,
          elevationItemIds: elevationModel.itemIds,
          elevationAttribution: elevationModel.attribution,
        }
      : {}),
    ...(satellite.metaCanopyQuadKey ? { metaCanopyQuadKey: satellite.metaCanopyQuadKey } : {}),
    ...(satellite.metaCanopyTileUrl ? { metaCanopyTileUrl: satellite.metaCanopyTileUrl } : {}),
    ...(satellite.treeCoverPct !== undefined ? { treeCoverPct: satellite.treeCoverPct } : {}),
    ...(satellite.croplandPct !== undefined ? { croplandPct: satellite.croplandPct } : {}),
    ...(satellite.grasslandPct !== undefined ? { grasslandPct: satellite.grasslandPct } : {}),
    ...(satellite.waterPct !== undefined ? { waterPct: satellite.waterPct } : {}),
    ...(satellite.barePct !== undefined ? { barePct: satellite.barePct } : {}),
  };

  const terrain: TerrainFile = {
    version: TERRAIN_FILE_VERSION,
    gridSize: targetSize,
    width: targetSize,
    height: targetSize,
    bbox,
    minElevationM: Number(minElevationM.toFixed(1)),
    maxElevationM: Number(maxElevationM.toFixed(1)),
    elevations,
    ...(elevationSource ? { elevationSource } : {}),
    ...(elevationModel ? { elevationModel } : {}),
    ...(trueColour ? { trueColour } : {}),
    ...(despikedPixels !== undefined ? { despikedPixels } : {}),
    waterMask: { runs: encodeRuns(water.mask), source: water.source },
    landCells,
    catchmentRing,
    outline: {
      kind: drawn.kind,
      ...(drawn.fallback ? { fallback: drawn.fallback } : {}),
      ...(outline.outlet !== undefined &&
      drawn.kind === outline.kind &&
      drawn.kind !== "land_within_box"
        ? {
            outlet: toLonLat([
              outline.outlet % targetSize,
              Math.floor(outline.outlet / targetSize),
            ]),
          }
        : {}),
      areaKm2: Number((outlineCells * cellKm2).toFixed(1)),
    },
    streamPaths,
    streamSource,
    ...(streamKinds ? { streamKinds } : {}),
    ...(satellite.landCoverGrid ? { landCoverGrid: satellite.landCoverGrid } : {}),
    ...(hydrology.namedWaterways.length > 0 ? { namedWaterways: hydrology.namedWaterways } : {}),
    ...(hydrology.namedPeaks.length > 0 ? { namedPeaks: hydrology.namedPeaks } : {}),
    ...(hydrology.protectedAreas.length > 0 ? { protectedAreas: hydrology.protectedAreas } : {}),
    ...(Object.keys(satelliteMeta).length > 0 ? { satelliteMeta } : {}),
  };

  if (caseId) {
    try {
      const path = terrainCachePath(caseId);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(terrain));
    } catch {
      try {
        writeFileSync(legacyTmpCachePath(caseId), JSON.stringify(terrain));
      } catch {
        // Non-fatal
      }
    }
  }
  return terrain;
}

export async function readOrBuildTerrain(
  caseId: string,
  bbox: [number, number, number, number],
): Promise<TerrainFile> {
  let earlier: EarlierLandCover | undefined;
  for (const path of [terrainCachePath(caseId), legacyTmpCachePath(caseId)]) {
    if (existsSync(path)) {
      try {
        const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<
          Omit<TerrainFile, "version">
        > & { version?: unknown };
        if (
          raw.version === TERRAIN_FILE_VERSION &&
          Array.isArray(raw.elevations) &&
          raw.elevations.length === (raw.width ?? 0) * (raw.height ?? 0)
        ) {
          return raw as TerrainFile;
        }
        const sameBox =
          Array.isArray(raw.bbox) &&
          raw.bbox.every((v, i) => Math.abs(v - (bbox[i] ?? NaN)) < 1e-6);
        if (sameBox && raw.landCoverGrid && !earlier) {
          earlier = {
            landCoverGrid: raw.landCoverGrid,
            ...(raw.satelliteMeta ? { satelliteMeta: raw.satelliteMeta } : {}),
          };
        }
      } catch {
        // Regenerate below
      }
    }
  }
  return buildTerrainForBbox(bbox, caseId, earlier);
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
