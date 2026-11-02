import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  fetchOpenMeteoGrid,
  fetchTerrariumGrid,
  interpolateGrid,
  synthesizeCoarseGrid,
} from "./dem-grid.ts";
import { buildWaterMask, encodeRuns, type WaterSource } from "../overview/terrain.ts";
import { type NamedPeak, fetchRealHydrology } from "./hydrology-fetcher.ts";
import { type LandCoverGrid, fetchSatelliteLandCover } from "./satellite-fetcher.ts";

export { fetchOpenMeteoGrid, fetchTerrariumGrid };

const REPO_ROOT = process.cwd().endsWith("/apps/web")
  ? resolve(process.cwd(), "..", "..")
  : process.cwd();

export interface SatelliteMeta {
  worldCoverItemId?: string;
  worldCoverYear?: number;
  worldCoverTileUrl?: string;
  sentinel2ItemId?: string;
  sentinel2Datetime?: string;
  sentinel2CloudCover?: number;
  sentinel2Platform?: string;
  metaCanopyQuadKey?: string;
  metaCanopyTileUrl?: string;
  treeCoverPct?: number;
  croplandPct?: number;
  grasslandPct?: number;
  waterPct?: number;
  barePct?: number;
}

/** Bumped when the stored grid changes meaning; readOrBuildTerrain rebuilds any other version in place. */
export const TERRAIN_FILE_VERSION = 2;
/** Elevation grid nodes a side: the overview's own 256 x 256 relief grid. */
export const TERRAIN_GRID_SIZE = 256;

/** Where the stored elevations came from. */
export type ElevationSource = "terrarium_z12" | "terrarium_z11" | "open_meteo_16" | "synthetic";

export interface TerrainFile {
  version: 2;
  gridSize: number;
  width: number;
  height: number;
  bbox: [number, number, number, number];
  minElevationM: number;
  maxElevationM: number;
  elevations: number[];
  elevationSource?: ElevationSource;
  /** Terrarium pixels replaced as defects before sampling (dem-grid.ts despikeMosaic), when the source is Terrarium. */
  despikedPixels?: number;
  /** Water on the elevation grid's nodes (lib/overview/terrain.ts buildWaterMask, encodeRuns). */
  waterMask?: { runs: number[]; source: WaterSource };
  /** Grid nodes that are land; minElevationM and maxElevationM are over these when there are any. */
  landCells?: number;
  catchmentRing: [number, number][];
  streamPaths: [number, number][][];
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

const D8_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [-1, 0, 1],
  [-1, 1, Math.SQRT2],
  [0, 1, 1],
  [1, 1, Math.SQRT2],
  [1, 0, 1],
  [1, -1, Math.SQRT2],
  [0, -1, 1],
  [-1, -1, Math.SQRT2],
];

/**
 * Computes D8 flow directions and flow accumulation across the elevation grid after conditioning
 * subtle flats toward the basin outlet.
 */
function computeD8Flow(
  elevations: readonly number[],
  width: number,
  height: number,
  outletRow: number,
  outletCol: number,
): {
  flowTarget: Int32Array;
  accumulation: Float32Array;
} {
  const n = width * height;
  const cond = new Float64Array(n);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const idx = r * width + c;
      const distToOutlet = Math.hypot(r - outletRow, c - outletCol);
      cond[idx] = (elevations[idx] ?? 0) + distToOutlet * 0.05;
    }
  }

  const flowTarget = new Int32Array(n).fill(-1);
  for (let r = 1; r < height - 1; r++) {
    for (let c = 1; c < width - 1; c++) {
      const idx = r * width + c;
      const h0 = cond[idx] ?? 0;
      let bestSlope = 0;
      let bestTarget = -1;
      for (const [dr, dc, dist] of D8_OFFSETS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
        const nIdx = nr * width + nc;
        const drop = h0 - (cond[nIdx] ?? h0);
        const slope = drop / dist;
        if (slope > bestSlope) {
          bestSlope = slope;
          bestTarget = nIdx;
        }
      }
      flowTarget[idx] = bestTarget;
    }
  }

  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => (cond[b] ?? 0) - (cond[a] ?? 0),
  );
  const accumulation = new Float32Array(n).fill(1);
  for (const idx of order) {
    const target = flowTarget[idx] ?? -1;
    if (target >= 0 && target < n) {
      accumulation[target] = (accumulation[target] ?? 1) + (accumulation[idx] ?? 1);
    }
  }

  return { flowTarget, accumulation };
}

function smoothPolyline(pts: readonly [number, number][]): [number, number][] {
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (pts.length < 3 || !first || !last) return [...pts];
  let curr: [number, number][] = [...pts];
  for (let pass = 0; pass < 2; pass++) {
    const next: [number, number][] = [first];
    for (let i = 0; i < curr.length - 1; i++) {
      const p0 = curr[i];
      const p1 = curr[i + 1];
      if (!p0 || !p1) continue;
      next.push([
        Number((0.75 * p0[0] + 0.25 * p1[0]).toFixed(6)),
        Number((0.75 * p0[1] + 0.25 * p1[1]).toFixed(6)),
      ]);
      next.push([
        Number((0.25 * p0[0] + 0.75 * p1[0]).toFixed(6)),
        Number((0.25 * p0[1] + 0.75 * p1[1]).toFixed(6)),
      ]);
    }
    next.push(last);
    curr = next;
  }
  return curr;
}

/**
 * Delineates a counter-clockwise watershed divide ring (~180 vertices) and extracts dendritic
 * stream reaches routed along the DEM grid.
 */
function buildCatchmentAndStreams(
  bbox: [number, number, number, number],
  elevations: readonly number[],
  width: number,
  height: number,
): {
  catchmentRing: [number, number][];
  streamPaths: [number, number][][];
  outletLonLat: [number, number];
} {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const cx = (minLon + maxLon) / 2;
  const cy = (minLat + maxLat) / 2;
  const spanLon = maxLon - minLon;
  const spanLat = maxLat - minLat;

  const elevAtNorm = (nx: number, ny: number): number => {
    const col = Math.max(0, Math.min(width - 1, Math.round((nx + 1) * 0.5 * (width - 1))));
    const row = Math.max(0, Math.min(height - 1, Math.round((1 - (ny + 1) * 0.5) * (height - 1))));
    return elevations[row * width + col] ?? 0;
  };

  const steps = 180;
  let lowestAngle = -Math.PI * 0.65;
  let lowestElev = Infinity;
  for (let i = 0; i < 72; i++) {
    const theta = (i / 72) * Math.PI * 2;
    const e = elevAtNorm(0.7 * Math.cos(theta), 0.7 * Math.sin(theta));
    if (e < lowestElev) {
      lowestElev = e;
      lowestAngle = theta;
    }
  }

  const seedPhase = Math.abs(Math.sin(cx * 12.9898 + cy * 78.233)) * Math.PI * 2;
  const rawRadii: number[] = [];
  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const rel = theta - lowestAngle;
    const elongation = 1.0 + 0.24 * Math.cos(rel * 2) - 0.11 * Math.cos(rel);
    const subBasinLobes =
      0.09 * Math.sin(rel * 3 + seedPhase) +
      0.065 * Math.cos(rel * 5 - seedPhase * 0.7) +
      0.04 * Math.sin(rel * 8 + seedPhase * 1.3);
    const baseR = Math.max(0.42, Math.min(0.88, 0.68 * elongation + subBasinLobes));

    let bestR = baseR;
    let bestScore = -Infinity;
    for (let dr = -0.14; dr <= 0.14; dr += 0.02) {
      const rCand = Math.max(0.38, Math.min(0.9, baseR + dr));
      const e = elevAtNorm(rCand * Math.cos(theta), rCand * Math.sin(theta));
      const penalty = Math.abs(dr) * 110;
      const score = e - penalty;
      if (score > bestScore) {
        bestScore = score;
        bestR = rCand;
      }
    }
    rawRadii.push(bestR);
  }

  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    let sum = 0;
    let wSum = 0;
    for (let k = -2; k <= 2; k++) {
      const w = 3 - Math.abs(k);
      const rVal = rawRadii[(i + k + steps) % steps] ?? 0.68;
      sum += rVal * w;
      wSum += w;
    }
    const theta = (i / steps) * Math.PI * 2;
    const r = Math.max(0.38, Math.min(0.9, sum / wSum));
    const lon = Number((cx + r * (spanLon * 0.5) * Math.cos(theta)).toFixed(6));
    const lat = Number((cy + r * (spanLat * 0.5) * Math.sin(theta)).toFixed(6));
    ring.push([lon, lat]);
  }
  if (ring[0]) {
    ring.push([ring[0][0], ring[0][1]]);
  }

  const outletRadius = 0.71 * 1.12 * 0.93;
  const outletLon = Number(
    (cx + outletRadius * (spanLon * 0.46) * Math.cos(lowestAngle)).toFixed(6),
  );
  const outletLat = Number(
    (cy + outletRadius * (spanLat * 0.46) * Math.sin(lowestAngle)).toFixed(6),
  );

  const outletCol = Math.max(
    2,
    Math.min(
      width - 3,
      Math.round((1 + outletRadius * 0.88 * Math.cos(lowestAngle)) * 0.5 * (width - 1)),
    ),
  );
  const outletRow = Math.max(
    2,
    Math.min(
      height - 3,
      Math.round((1 - outletRadius * 0.88 * Math.sin(lowestAngle)) * 0.5 * (height - 1)),
    ),
  );

  const { flowTarget } = computeD8Flow(elevations, width, height, outletRow, outletCol);

  const headAngle = lowestAngle + Math.PI;
  const makeThalwegStream = (
    startAngleOffset: number,
    startRadius: number,
    curveBias: number,
  ): [number, number][] => {
    const startTheta = headAngle + startAngleOffset;
    const sx = startRadius * Math.cos(startTheta);
    const sy = startRadius * Math.sin(startTheta);
    const ex = outletRadius * 0.88 * Math.cos(lowestAngle);
    const ey = outletRadius * 0.88 * Math.sin(lowestAngle);
    const perpX = -Math.sin(lowestAngle);
    const perpY = Math.cos(lowestAngle);

    const startCol = Math.max(2, Math.min(width - 3, Math.round((sx + 1) * 0.5 * (width - 1))));
    const startRow = Math.max(
      2,
      Math.min(height - 3, Math.round((1 - (sy + 1) * 0.5) * (height - 1))),
    );
    const d8Pts: [number, number][] = [];
    const visited = new Set<number>();
    let curr = startRow * width + startCol;
    while (curr >= 0 && !visited.has(curr) && d8Pts.length < 48) {
      visited.add(curr);
      const r = Math.floor(curr / width);
      const c = curr % width;
      const lon = minLon + (c / (width - 1)) * spanLon;
      const lat = maxLat - (r / (height - 1)) * spanLat;
      d8Pts.push([Number(lon.toFixed(6)), Number(lat.toFixed(6))]);
      if (Math.hypot(r - outletRow, c - outletCol) <= 2.2) break;
      curr = flowTarget[curr] ?? -1;
    }

    const nPts = 28;
    const rawPts: [number, number][] = [];
    for (let k = 0; k < nPts; k++) {
      const t = k / (nPts - 1);
      const bend = Math.sin(t * Math.PI) * curveBias + Math.sin(t * Math.PI * 3) * 0.025;
      const guideLon = cx + (sx + (ex - sx) * t + perpX * bend * (1 - t * 0.6)) * (spanLon * 0.5);
      const guideLat = cy + (sy + (ey - sy) * t + perpY * bend * (1 - t * 0.6)) * (spanLat * 0.5);

      const dPt =
        d8Pts.length >= 8
          ? d8Pts[Math.min(d8Pts.length - 1, Math.floor(t * (d8Pts.length - 1)))]
          : undefined;
      if (dPt) {
        const wD8 = (1 - t) * 0.45;
        rawPts.push([
          Number((guideLon * (1 - wD8) + dPt[0] * wD8).toFixed(6)),
          Number((guideLat * (1 - wD8) + dPt[1] * wD8).toFixed(6)),
        ]);
      } else {
        rawPts.push([Number(guideLon.toFixed(6)), Number(guideLat.toFixed(6))]);
      }
    }
    return smoothPolyline(rawPts).slice(0, 32);
  };

  const streamPaths: [number, number][][] = [
    makeThalwegStream(0, 0.64, 0.03),
    makeThalwegStream(0.52, 0.58, 0.08),
    makeThalwegStream(-0.48, 0.56, -0.07),
  ];

  return {
    catchmentRing: ring,
    streamPaths,
    outletLonLat: [outletLon, outletLat],
  };
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
  const cx = (minLon + maxLon) / 2;
  const cy = (minLat + maxLat) / 2;
  const coarseSize = 16;
  const targetSize = TERRAIN_GRID_SIZE;

  const [terrarium, hydrology, fetched] = await Promise.all([
    fetchTerrariumGrid(bbox, targetSize),
    fetchRealHydrology(bbox),
    fetchSatelliteLandCover(bbox),
  ]);
  // the same box's WorldCover from an earlier build stands in when this fetch came back without it
  const satellite =
    !fetched.landCoverGrid && earlier
      ? { ...earlier.satelliteMeta, ...fetched, landCoverGrid: earlier.landCoverGrid }
      : fetched;

  let elevations: number[];
  let elevationSource: ElevationSource;
  if (terrarium) {
    elevations = terrarium.elevations;
    elevationSource = terrarium.zoom === 12 ? "terrarium_z12" : "terrarium_z11";
  } else {
    const liveCoarse = await fetchOpenMeteoGrid(bbox, coarseSize);
    const coarse = liveCoarse ?? synthesizeCoarseGrid(cx, cy, coarseSize);
    elevationSource = liveCoarse ? "open_meteo_16" : "synthetic";
    elevations = interpolateGrid(coarse, coarseSize, targetSize);
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

  const { catchmentRing, streamPaths: d8StreamPaths } = buildCatchmentAndStreams(
    bbox,
    elevations,
    targetSize,
    targetSize,
  );

  // Use real OpenStreetMap Overpass river/stream polylines when present, supplementing with D8 reaches if fewer than 2
  const streamPaths =
    hydrology.streamPaths.length >= 2
      ? hydrology.streamPaths
      : hydrology.streamPaths.length === 1
        ? [...hydrology.streamPaths.slice(0, 1), ...d8StreamPaths.slice(0, 2)]
        : d8StreamPaths;

  const satelliteMeta: SatelliteMeta = {
    ...(satellite.worldCoverItemId ? { worldCoverItemId: satellite.worldCoverItemId } : {}),
    ...(satellite.worldCoverYear !== undefined ? { worldCoverYear: satellite.worldCoverYear } : {}),
    ...(satellite.worldCoverTileUrl ? { worldCoverTileUrl: satellite.worldCoverTileUrl } : {}),
    ...(satellite.sentinel2ItemId ? { sentinel2ItemId: satellite.sentinel2ItemId } : {}),
    ...(satellite.sentinel2Datetime ? { sentinel2Datetime: satellite.sentinel2Datetime } : {}),
    ...(satellite.sentinel2CloudCover !== undefined
      ? { sentinel2CloudCover: satellite.sentinel2CloudCover }
      : {}),
    ...(satellite.sentinel2Platform ? { sentinel2Platform: satellite.sentinel2Platform } : {}),
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
    elevationSource,
    ...(terrarium ? { despikedPixels: terrarium.despikedPixels } : {}),
    waterMask: { runs: encodeRuns(water.mask), source: water.source },
    landCells,
    catchmentRing,
    streamPaths,
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
