// Dynamic 3D terrain & overview data adapter for any ingested or static case on Earth.
// Fetches the TerrainFile (256 x 256 since version 2) from /api/terrain/[caseId] and builds the complete OverviewData
// (UTM relief Float32Array, WorldCover & elevation band ImageBitmaps, UTM catchment ring,
// stream reach heights, no slope or rain footprints (none measured), and RecordData from the case snapshot)
// so ValleyOverview renders the 3D terrain and interactive findings of any place on Earth.

import type { CaseSnapshot } from "@siterra/contracts";
import type { Rivers, TerrainMeta } from "../instruments/valley/fixtures";
import { lonLatToUtm } from "../instruments/valley/utm";
import type { ScatterData, ScatterSeason } from "../instruments/scatter/data";
import type { OverviewData } from "./data";
import type { FindingId } from "./findings";
import { olsIntercept, reference, referencesOf, type Season, type SeasonChart } from "./record";
import type { RecordData } from "./record-data";
import { decodeRuns, waterBodies, type WaterSource } from "../live-place/water-mask";

export interface LandCoverGrid {
  width: number;
  height: number;
  tree: number[];
  crop: number[];
  grass?: number[];
  water?: number[];
  bare?: number[];
}

export interface NamedPeak {
  name: string;
  elevationM?: number;
  lon: number;
  lat: number;
}

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

export interface TerrainFile {
  /** 1: 96 x 96 nearest-pixel zoom 11 (rebuilt on read); 2: 256 x 256 bilinear zoom 12. */
  version: 1 | 2;
  gridSize?: number;
  width: number;
  height: number;
  bbox: [number, number, number, number];
  /** Lowest and highest land elevation (m): water cells are left out (version 2), the whole grid if all is water. */
  minElevationM: number;
  maxElevationM: number;
  elevations: number[];
  elevationSource?: "terrarium_z12" | "terrarium_z11" | "open_meteo_16";
  despikedPixels?: number;
  /** Water on the elevation grid's nodes as encodeRuns wrote it (version 2 files built after the water mask). */
  waterMask?: { runs: number[]; source: WaterSource };
  /** Grid nodes that are land (not water); minElevationM and maxElevationM are over these when there are any. */
  landCells?: number;
  catchmentRing: [number, number][];
  streamPaths: [number, number][][];
  /** Where the drainage lines came from, and each mapped line's OpenStreetMap waterway kind when it was kept. */
  streamSource?: "openstreetmap" | "d8_dem" | "none";
  streamKinds?: string[];
  outline?: {
    kind: "watershed" | "drainage_within_box" | "land_within_box" | "box";
    fallback?: "no_land" | "outline_degenerate";
    outlet?: [number, number];
    areaKm2: number;
  };
  landCoverGrid?: LandCoverGrid;
  namedWaterways?: string[];
  namedPeaks?: NamedPeak[];
  protectedAreas?: string[];
  satelliteMeta?: SatelliteMeta;
}

function resolveCaseId(caseId?: string): string {
  if (caseId && caseId.trim().length > 0) return caseId.trim();
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("case");
    if (q && q.trim().length > 0) return q.trim();
  }
  return "case_aitbouguemez";
}

/**
 * Fetches the 3D terrain grid, catchmentRing, and streamPaths for `caseId`
 * (or the current `?case=` query param, defaulting to `case_aitbouguemez`).
 */
export async function loadValleyTerrain(
  caseId?: string,
  signal?: AbortSignal,
): Promise<TerrainFile> {
  const id = resolveCaseId(caseId);
  const res = await fetch(`/api/terrain/${encodeURIComponent(id)}`, {
    credentials: "same-origin",
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    throw new Error(`/api/terrain/${id}: HTTP ${String(res.status)}`);
  }
  return (await res.json()) as TerrainFile;
}

function pointInPolygon(
  ring: readonly (readonly [number, number])[],
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] ?? [0, 0];
    const [xj, yj] = ring[j] ?? [0, 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Maps a UTM point (E, N) in `zone` to fractional (col, row) on a lon/lat grid over bbox whose nodes sit on the
 * bbox edges (col 0 west, row 0 north). Inverts lonLatToUtm by Newton steps from the bbox centre's Jacobian, which
 * converges to well under a metre within a 20 km box.
 */
export function utmToGridMapper(
  bbox: readonly [number, number, number, number],
  zone: number,
  width: number,
  height: number,
): (E: number, N: number) => [number, number] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lon0 = (minLon + maxLon) / 2;
  const lat0 = (minLat + maxLat) / 2;
  const d = 1e-4;
  const [e0, n0] = lonLatToUtm(lon0, lat0, zone);
  const [eLon, nLon] = lonLatToUtm(lon0 + d, lat0, zone);
  const [eLat, nLat] = lonLatToUtm(lon0, lat0 + d, zone);
  const a = (eLon - e0) / d;
  const b = (eLat - e0) / d;
  const c = (nLon - n0) / d;
  const dd = (nLat - n0) / d;
  const det = a * dd - b * c;
  const spanLon = Math.max(1e-9, maxLon - minLon);
  const spanLat = Math.max(1e-9, maxLat - minLat);
  return (E, N) => {
    let lon = lon0;
    let lat = lat0;
    for (let k = 0; k < 3; k++) {
      const [e, n] = lonLatToUtm(lon, lat, zone);
      const rE = E - e;
      const rN = N - n;
      lon += (dd * rE - b * rN) / det;
      lat += (-c * rE + a * rN) / det;
    }
    return [((lon - minLon) / spanLon) * (width - 1), ((maxLat - lat) / spanLat) * (height - 1)];
  };
}

/** Bilinear value of a row-major grid at fractional (col, row), clamped to its edges. */
function bilinearAt(
  src: ArrayLike<number>,
  w: number,
  h: number,
  col: number,
  row: number,
): number {
  const fx = Math.max(0, Math.min(w - 1, col));
  const fy = Math.max(0, Math.min(h - 1, row));
  const c0 = Math.min(w - 2, Math.floor(fx));
  const r0 = Math.min(h - 2, Math.floor(fy));
  const tx = fx - c0;
  const ty = fy - r0;
  const v00 = src[r0 * w + c0] ?? 0;
  const v01 = src[r0 * w + c0 + 1] ?? 0;
  const v10 = src[(r0 + 1) * w + c0] ?? 0;
  const v11 = src[(r0 + 1) * w + c0 + 1] ?? 0;
  return (v00 * (1 - tx) + v01 * tx) * (1 - ty) + (v10 * (1 - tx) + v11 * tx) * ty;
}

async function bitmapFromRgba(
  pixels: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
): Promise<ImageBitmap> {
  if (typeof ImageData !== "undefined" && typeof createImageBitmap === "function") {
    const imageData = new ImageData(pixels, width, height);
    return createImageBitmap(imageData);
  }
  return {
    width,
    height,
    close: () => {},
    data: pixels,
  } as unknown as ImageBitmap;
}

function sampleLandCoverChannel(
  arr: readonly number[],
  srcW: number,
  srcH: number,
  rNorm: number,
  cNorm: number,
): number {
  const fy = Math.max(0, Math.min(srcH - 1, rNorm * (srcH - 1)));
  const fx = Math.max(0, Math.min(srcW - 1, cNorm * (srcW - 1)));
  const r0 = Math.floor(fy);
  const c0 = Math.floor(fx);
  const r1 = Math.min(srcH - 1, r0 + 1);
  const c1 = Math.min(srcW - 1, c0 + 1);
  const ty = fy - r0;
  const tx = fx - c0;
  const v00 = arr[r0 * srcW + c0] ?? 0;
  const v01 = arr[r0 * srcW + c1] ?? 0;
  const v10 = arr[r1 * srcW + c0] ?? 0;
  const v11 = arr[r1 * srcW + c1] ?? 0;
  const top = v00 * (1 - tx) + v01 * tx;
  const bot = v10 * (1 - tx) + v11 * tx;
  return Math.max(0, Math.min(255, Math.round(top * (1 - ty) + bot * ty)));
}

/**
 * Converts a `TerrainFile` into a full `OverviewData` structure ready for `mountOverview`.
 */
export async function overviewDataFromTerrain(terrain: TerrainFile): Promise<OverviewData> {
  const [minLon, minLat, maxLon, maxLat] = terrain.bbox;
  const centerLon = (minLon + maxLon) / 2;
  const zone = Math.max(1, Math.min(60, Math.floor((centerLon + 180) / 6) + 1));

  // Project bbox corners and catchmentRing into UTM metres
  const bboxCornersUtm = [
    lonLatToUtm(minLon, minLat, zone),
    lonLatToUtm(maxLon, minLat, zone),
    lonLatToUtm(maxLon, maxLat, zone),
    lonLatToUtm(minLon, maxLat, zone),
  ];
  const ringUtm: [number, number][] = terrain.catchmentRing.map(([lon, lat]) =>
    lonLatToUtm(lon, lat, zone),
  );

  const allPts = [...bboxCornersUtm, ...ringUtm];
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const [e, n] of allPts) {
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
    if (n < minN) minN = n;
    if (n > maxN) maxN = n;
  }

  const gridDim = 256;
  const spanE = Math.max(2000, maxE - minE);
  const spanN = Math.max(2000, maxN - minN);
  const squareSpan = Math.max(spanE, spanN) * 1.06;
  const centerE = (minE + maxE) / 2;
  const centerN = (minN + maxN) / 2;
  const E0 = centerE - squareSpan / 2;
  const N0 = centerN + squareSpan / 2;
  const res = squareSpan / gridDim;

  // each relief cell takes the DEM at its own place: the terrain grid is regular in lon/lat, the relief in UTM
  const srcW = terrain.width || terrain.gridSize || 64;
  const srcH = terrain.height || terrain.gridSize || 64;
  const toGrid = utmToGridMapper(terrain.bbox, zone, srcW, srcH);
  const relief = new Float32Array(new ArrayBuffer(gridDim * gridDim * 4));
  const cellCol = new Float32Array(gridDim * gridDim);
  const cellRow = new Float32Array(gridDim * gridDim);
  for (let r = 0; r < gridDim; r++) {
    const N = N0 - (r + 0.5) * res;
    for (let c = 0; c < gridDim; c++) {
      const idx = r * gridDim + c;
      const [col, row] = toGrid(E0 + (c + 0.5) * res, N);
      cellCol[idx] = col;
      cellRow[idx] = row;
      relief[idx] = bilinearAt(terrain.elevations, srcW, srcH, col, row);
    }
  }

  // water from the terrain file's mask: its share of each relief cell (smooth at the shore), and where a cell is
  // mostly water it is drawn flat at its water body's level; the land statistics below leave it out
  const waterNodes = terrain.waterMask ? decodeRuns(terrain.waterMask.runs, srcW * srcH) : null;
  const water = new Uint8Array(gridDim * gridDim);
  if (waterNodes) {
    const { body, levels } = waterBodies(waterNodes, terrain.elevations, srcW, srcH);
    for (let idx = 0; idx < relief.length; idx++) {
      const col = cellCol[idx] ?? 0;
      const row = cellRow[idx] ?? 0;
      const share = bilinearAt(waterNodes, srcW, srcH, col, row);
      water[idx] = Math.round(share * 255);
      if (share < 0.5) continue;
      // the level of the nearest water node's body
      const c0 = Math.round(Math.max(0, Math.min(srcW - 1, col)));
      const r0 = Math.round(Math.max(0, Math.min(srcH - 1, row)));
      let level: number | undefined;
      for (let d = 0; d <= 2 && level === undefined; d++) {
        for (let dr = -d; dr <= d && level === undefined; dr++) {
          for (let dc = -d; dc <= d; dc++) {
            const rr = r0 + dr;
            const cc = c0 + dc;
            if (rr < 0 || rr >= srcH || cc < 0 || cc >= srcW) continue;
            const b = body[rr * srcW + cc] ?? -1;
            if (b >= 0) {
              level = levels[b];
              break;
            }
          }
        }
      }
      if (level !== undefined) relief[idx] = level;
    }
  }
  const isWater = (idx: number) => (water[idx] ?? 0) >= 128;

  // Project stream paths into UTM first so we can carve realistic incised valley thalwegs and side-ridge detail
  const streamUtmPaths: [number, number][][] = terrain.streamPaths.map((path) =>
    path.map(([lon, lat]) => lonLatToUtm(lon, lat, zone)),
  );

  // Ensure sufficient vertical relief contrast and multi-scale ridge/valley articulation so 3D shader normals,
  // cast shadows, and 250 m contours read as sharp mountain topography (specimen D4)
  let rawMin = Infinity;
  let rawMax = -Infinity;
  for (let i = 0; i < relief.length; i++) {
    const v = relief[i] ?? 0;
    if (v < rawMin) rawMin = v;
    if (v > rawMax) rawMax = v;
  }
  const rawSpan = Math.max(1, rawMax - rawMin);
  const targetMinSpan = 120;
  const ampScale = rawSpan < targetMinSpan ? targetMinSpan / rawSpan : 1;
  const channelHalfWidth = Math.max(60, squareSpan * 0.045);
  const maxIncisionM = Math.min(18, Math.max(3, rawSpan * 0.025));

  for (let r = 0; r < gridDim; r++) {
    const N = N0 - (r + 0.5) * res;
    for (let c = 0; c < gridDim; c++) {
      const E = E0 + (c + 0.5) * res;
      const idx = r * gridDim + c;
      const baseH = rawMin + ((relief[idx] ?? rawMin) - rawMin) * ampScale;
      if (isWater(idx)) {
        relief[idx] = baseH;
        continue;
      }

      // Gentle stream-channel incision along real thalweg paths (no synthetic sine-wave spur noise)
      let minStreamDist = Infinity;
      for (const sp of streamUtmPaths) {
        for (let k = 0; k < sp.length; k += 2) {
          const pt = sp[k];
          if (!pt) continue;
          const d = Math.hypot(E - pt[0], N - pt[1]);
          if (d < minStreamDist) minStreamDist = d;
        }
      }
      const channelFactor = Math.min(1, minStreamDist / channelHalfWidth);
      const incision = (1 - channelFactor) * maxIncisionM;
      relief[idx] = baseH - incision;
    }
  }

  // Compute the elevation range and median of the land inside the outline (water drawn, not counted)
  const insideHeights: number[] = [];
  const insideFlags = new Uint8Array(gridDim * gridDim);
  for (let r = 0; r < gridDim; r++) {
    const N = N0 - (r + 0.5) * res;
    for (let c = 0; c < gridDim; c++) {
      const E = E0 + (c + 0.5) * res;
      const idx = r * gridDim + c;
      if (pointInPolygon(ringUtm, E, N)) {
        insideFlags[idx] = 1;
        if (!isWater(idx)) insideHeights.push(relief[idx] ?? 0);
      }
    }
  }

  if (insideHeights.length === 0) {
    // no outline cells, or no land inside it: the whole grid's land
    const anyInside = insideFlags.some(Boolean);
    for (let i = 0; i < relief.length; i++) {
      if (!anyInside) insideFlags[i] = 1;
      if (!isWater(i)) insideHeights.push(relief[i] ?? 0);
    }
  }

  insideHeights.sort((a, b) => a - b);
  const minH = insideHeights[0] ?? 0;
  const maxH = insideHeights[insideHeights.length - 1] ?? minH + 500;
  const medianH = insideHeights[Math.floor(insideHeights.length * 0.5)] ?? (minH + maxH) / 2;
  const lowBandLimit =
    insideHeights[Math.floor(insideHeights.length * 0.33)] ?? minH + (maxH - minH) * 0.33;
  const highBandLimit =
    insideHeights[Math.floor(insideHeights.length * 0.67)] ?? minH + (maxH - minH) * 0.67;

  // Build WorldCover + catchment mask RGBA bitmap and equal-area elevation bands RGBA bitmap
  const lcBuffer = new ArrayBuffer(gridDim * gridDim * 4);
  const lcPixels = new Uint8ClampedArray(lcBuffer);
  const bandsBuffer = new ArrayBuffer(gridDim * gridDim * 4);
  const bandsPixels = new Uint8ClampedArray(bandsBuffer);

  const lcGrid = terrain.landCoverGrid;
  const hasRealLandCover =
    lcGrid !== undefined &&
    lcGrid.width > 0 &&
    lcGrid.height > 0 &&
    Array.isArray(lcGrid.tree) &&
    Array.isArray(lcGrid.crop) &&
    lcGrid.tree.length === lcGrid.width * lcGrid.height &&
    lcGrid.crop.length === lcGrid.width * lcGrid.height;

  for (let r = 0; r < gridDim; r++) {
    for (let c = 0; c < gridDim; c++) {
      const idx = r * gridDim + c;
      const rNorm = Math.max(0, Math.min(1, (cellRow[idx] ?? 0) / Math.max(1, srcH - 1)));
      const cNorm = Math.max(0, Math.min(1, (cellCol[idx] ?? 0) / Math.max(1, srcW - 1)));
      const p = idx * 4;
      const inside = insideFlags[idx] === 1;
      if (!inside) {
        lcPixels[p + 3] = 255;
        bandsPixels[p + 3] = 255;
        continue;
      }
      const h = relief[idx] ?? minH;
      if (isWater(idx)) {
        // water: drawn (B inside), no land cover, no elevation band
        lcPixels[p + 2] = 255;
        lcPixels[p + 3] = 255;
        bandsPixels[p + 3] = 255;
        continue;
      }

      // WorldCover where it was read; without it no cover is drawn (none is guessed from the relief)
      const tree = hasRealLandCover
        ? sampleLandCoverChannel(lcGrid.tree, lcGrid.width, lcGrid.height, rNorm, cNorm)
        : 0;
      const crop = hasRealLandCover
        ? sampleLandCoverChannel(lcGrid.crop, lcGrid.width, lcGrid.height, rNorm, cNorm)
        : 0;

      lcPixels[p] = tree;
      lcPixels[p + 1] = crop;
      lcPixels[p + 2] = 255; // B = 255 marks inside the catchment
      lcPixels[p + 3] = 255;

      if (h <= lowBandLimit) {
        bandsPixels[p] = 255;
      } else if (h <= highBandLimit) {
        bandsPixels[p + 1] = 255;
      } else {
        bandsPixels[p + 2] = 255;
      }
      bandsPixels[p + 3] = 255;
    }
  }

  const [landcover, bands] = await Promise.all([
    bitmapFromRgba(lcPixels, gridDim, gridDim),
    bitmapFromRgba(bandsPixels, gridDim, gridDim),
  ]);

  // Helper to sample height from the relief grid at UTM (E, N)
  const heightAtUtm = (E: number, N: number): number => {
    const col = Math.max(0, Math.min(gridDim - 1, Math.round((E - E0) / res - 0.5)));
    const row = Math.max(0, Math.min(gridDim - 1, Math.round((N0 - N) / res - 0.5)));
    return relief[row * gridDim + col] ?? medianH;
  };

  // the drawn weight of each line, from what is known of it: a mapped waterway's OpenStreetMap kind (a river over a
  // stream); for D8 channels, the main stem (the channel draining the most) over its tributaries; otherwise one
  // weight for all, claiming no order that was not measured
  const orderOf = (idx: number): number => {
    const kind = terrain.streamKinds?.[idx];
    if (kind !== undefined) return kind === "river" ? 4 : kind === "stream" ? 3 : 2;
    if (terrain.streamSource === "d8_dem") return idx === 0 ? 4 : 3;
    return 3;
  };
  const reaches: Rivers["reaches"] = terrain.streamPaths
    .map((path, idx) => {
      const order = orderOf(idx);
      const pts: [number, number, number][] = path.map(([lon, lat]) => {
        const [E, N] = lonLatToUtm(lon, lat, zone);
        return [E, N, heightAtUtm(E, N)];
      });
      return { order, pts };
    })
    .filter((r) => r.pts.length >= 2);

  // No slope or rainfall cells for a live place: no per-cell greenness trend or rainfall is measured for it, so its
  // findings paint nothing on the land (the bundled cases' cells come from their own assets in data.ts)

  const meta: TerrainMeta = {
    frame: { origin_E: Math.round(centerE), origin_N: Math.round(centerN) },
    relief: {
      E0: Math.round(E0),
      N0: Math.round(N0),
      res,
      width: gridDim,
      height: gridDim,
      file: "dynamic.bin",
    },
    analysis: {
      E0: Math.round(E0),
      N0: Math.round(N0),
      res,
      width: gridDim,
      height: gridDim,
    },
  };

  return {
    zone,
    meta,
    relief,
    range: {
      min: Math.round(minH),
      max: Math.round(maxH),
      median: Math.round(medianH),
    },
    landcover,
    bands,
    ...(waterNodes ? { water } : {}),
    ring: ringUtm,
    rivers: { reaches },
    routes: [],
    footprints: { slope: null, rain: null },
    pixel: null,
  };
}

/**
 * Loads the 3D terrain for a `CaseSnapshot` from `/api/terrain/[caseId]` and builds `OverviewData`.
 */
export async function loadValleyOverviewData(
  snapshot: CaseSnapshot,
  signal?: AbortSignal,
): Promise<OverviewData> {
  const terrain = await loadValleyTerrain(snapshot.case.id, signal);
  return overviewDataFromTerrain(terrain);
}

const isTrendMetric = (metric: string): boolean =>
  metric === "ndvi_trend_per_decade" || metric === "ndvi_trend_unadjusted_per_decade";

const isBandMeasurement = (x: { id: string; aggregation?: string | null }): boolean => {
  const agg = x.aggregation?.toLowerCase() ?? "";
  return x.id.includes("_band_") || agg.includes("band") || agg.includes("below");
};

/** Two-sided 95% t quantile by degrees of freedom (table to 30, then conservative steps to the normal 1.96). */
function t975(df: number): number {
  const T = [
    12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16,
    2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052,
    2.048, 2.045, 2.042,
  ];
  if (df < 1) return Infinity;
  return T[df - 1] ?? (df <= 40 ? 2.021 : df <= 60 ? 2.0 : df <= 120 ? 1.98 : 1.96);
}

/**
 * Builds `RecordData` (26-year `SeasonChart`, `ScatterData`, and `RecordContext` Paper Specimen Card)
 * synchronously from a case's `InstrumentSpec`, `Measurement`, `Evidence`, and `Source` records
 * so findings render their chart and specimen card on frame 1 and when static bundle files are absent.
 */
export function fallbackRecordData(id: FindingId, snapshot: CaseSnapshot): RecordData {
  const specs = snapshot.records.instrumentSpecRecords ?? [];
  const sectionSpec = specs.find((s) => s.parameters.kind === "cross_section");
  const pixelSpec = specs.find((s) => s.parameters.kind === "pixel_anatomy");
  const sectionDisplay =
    sectionSpec?.parameters.kind === "cross_section"
      ? (sectionSpec.parameters.statements.find((x) => x.placement === "valley_floor")?.display ??
        sectionSpec.parameters.statements[0]?.display)
      : undefined;
  const pixelDisplay =
    pixelSpec?.parameters.kind === "pixel_anatomy"
      ? pixelSpec.parameters.contextDisplay?.[0]
      : undefined;
  const specDisplay =
    id === "pixel" ? (pixelDisplay ?? sectionDisplay) : (sectionDisplay ?? pixelDisplay);

  const citedEv =
    (specDisplay?.evidenceIds ?? [])
      .map((eid) => snapshot.records.evidenceRecords.find((x) => x.id === eid))
      .find((x) => x !== undefined) ??
    snapshot.records.evidenceRecords.find(
      (x) =>
        (x.claimKind === "scientific_context" || x.claimKind === "observation") &&
        x.provenance.sourceLocators.length > 0,
    ) ??
    snapshot.records.evidenceRecords.find((x) => x.provenance.sourceLocators.length > 0) ??
    snapshot.records.evidenceRecords[0];

  const rawExcerpt = citedEv?.provenance.sourceLocators[0]?.excerpt ?? null;
  const cleanExcerpt = rawExcerpt ? rawExcerpt.replace(/^Abstract excerpt:\s*/i, "").trim() : null;
  const contextIds =
    specDisplay?.evidenceIds && specDisplay.evidenceIds.length > 0
      ? specDisplay.evidenceIds
      : citedEv
        ? [citedEv.id]
        : [];
  const peerSource =
    snapshot.records.sourceRecords.find((s) => s.sourceKind === "peer_reviewed") ?? null;
  const isDynamic =
    snapshot.case.id.startsWith("case_loc_") ||
    snapshot.records.dataBundleRecords.some((b) => b.id.startsWith("bundle_loc_"));
  const contextText = isDynamic
    ? (cleanExcerpt ??
      specDisplay?.text ??
      citedEv?.statement ??
      peerSource?.notes[0] ??
      peerSource?.title ??
      null)
    : (specDisplay?.text ??
      cleanExcerpt ??
      citedEv?.statement ??
      peerSource?.notes[0] ??
      peerSource?.title ??
      null);
  const resolvedRefs = referencesOf(snapshot, contextIds);
  const references =
    resolvedRefs.length > 0 ? resolvedRefs : peerSource ? [reference(peerSource, ["1"])] : [];
  const context =
    contextText && references.length > 0
      ? {
          text: contextText,
          references,
        }
      : null;

  const rawSeasons: Season[] = snapshot.records.measurementRecords
    .filter((m) => m.metric === "ndvi_growing_season_mean" && m.value !== null)
    .map((m) => {
      const yrMatch = m.periodId.match(/(\d{4})/) ?? m.id.match(/(\d{4})/);
      const year = yrMatch?.[1] ? Number.parseInt(yrMatch[1], 10) : NaN;
      return {
        year,
        ndvi: m.value ?? NaN,
      };
    })
    .filter((s) => Number.isFinite(s.year) && Number.isFinite(s.ndvi))
    .sort((a, b) => a.year - b.year);

  // charts only from what the record measured: the whole area's season series with its trend and the trend's
  // interval; no band or pixel series is recorded for these places, and nothing stands in for a missing one
  if (id === "band" || id === "catchment" || id === "pixel") {
    const m =
      id === "catchment"
        ? snapshot.records.measurementRecords.find(
            (x) => isTrendMetric(x.metric) && !isBandMeasurement(x) && x.value !== null,
          )
        : undefined;
    const slopePerDecade = m?.value ?? null;
    const lower = m?.uncertainty.lower ?? null;
    const upper = m?.uncertainty.upper ?? null;
    const chart: SeasonChart | null =
      rawSeasons.length >= 2 && slopePerDecade !== null && lower !== null && upper !== null
        ? {
            seasons: rawSeasons,
            slopePerDecade,
            intercept: olsIntercept(rawSeasons, slopePerDecade / 10),
            lower,
            upper,
            fit: "ols",
          }
        : null;
    return { chart, scatter: null, context };
  }

  // the rainfall scatter only from seasons with both a recorded greenness and a recorded rainfall; its fit, interval
  // and R squared computed from them (the record's own R squared when it states one)
  if (id === "rain") {
    const rainMap = new Map<number, number>();
    for (const m of snapshot.records.measurementRecords) {
      if (m.metric === "precipitation_annual_mm" && m.value !== null) {
        const yrMatch = m.periodId.match(/(\d{4})/) ?? m.id.match(/(\d{4})/);
        const yr = yrMatch?.[1] ? Number.parseInt(yrMatch[1], 10) : NaN;
        if (Number.isFinite(yr)) {
          rainMap.set(yr, m.value);
        }
      }
    }
    const seasons: ScatterSeason[] = rawSeasons
      .map((s) => {
        const rain_mm = rainMap.get(s.year);
        return rain_mm !== undefined ? { year: s.year, ndvi: s.ndvi, rain_mm } : null;
      })
      .filter((x): x is ScatterSeason => x !== null);
    const n = seasons.length;
    if (n < 3) return { chart: null, scatter: null, context };

    const meanX = seasons.reduce((acc, s) => acc + s.rain_mm, 0) / n;
    const meanY = seasons.reduce((acc, s) => acc + s.ndvi, 0) / n;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const s of seasons) {
      const dx = s.rain_mm - meanX;
      const dy = s.ndvi - meanY;
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
    }
    if (sxx <= 0) return { chart: null, scatter: null, context };
    const slopePerMm = sxy / sxx;
    const intercept = meanY - slopePerMm * meanX;
    let sse = 0;
    for (const s of seasons) sse += (s.ndvi - (intercept + slopePerMm * s.rain_mm)) ** 2;
    const halfWidth = t975(n - 2) * Math.sqrt(sse / Math.max(1, n - 2) / sxx) * 100;
    const r2M = snapshot.records.measurementRecords.find(
      (x) => x.metric === "rainfall_ndvi_r_squared" || x.metric === "rainfall_fit_r_squared",
    );
    const rSquared = r2M?.value ?? (syy > 0 ? (sxy * sxy) / (sxx * syy) : 0);
    const slopePer100 = slopePerMm * 100;
    const driest = [...seasons].sort((a, b) => a.rain_mm - b.rain_mm).slice(0, 4);

    const scatter: ScatterData = {
      period: [seasons[0]?.year ?? 0, seasons[n - 1]?.year ?? 0],
      windows: { growing: "mar_jun", rainfall: "sep_may" },
      seasons,
      fit: {
        intercept,
        slope_per_mm: slopePerMm,
        slope_per_100_mm: slopePer100,
        lower: slopePer100 - halfWidth,
        upper: slopePer100 + halfWidth,
        level: 0.95,
        r_squared: rSquared,
        interval_above_zero: slopePer100 - halfWidth > 0,
      },
      status: "available",
      driest,
    };
    return { chart: null, scatter, context };
  }

  return { chart: null, scatter: null, context };
}
