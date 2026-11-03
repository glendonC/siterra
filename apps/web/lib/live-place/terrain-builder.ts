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
import {
  MIN_BASIN_SHARE,
  type Outline,
  type OutlineKind,
  d8FlowTargets,
  delineateOutline,
  landWithinBox,
  priorityFloodFill,
  traceChannels,
} from "./terrain-delineation.ts";
import {
  MIN_OUTLINE_CELLS,
  type OutlineFallback,
  bboxAround,
  outlineRing,
  polygonAreaM2,
  traceRing,
} from "./terrain-outline-ring.ts";
import { type WaterSource, buildWaterMask, encodeRuns } from "./water-mask.ts";

export {
  MIN_BASIN_SHARE,
  MIN_OUTLINE_CELLS,
  type Outline,
  type OutlineFallback,
  type OutlineKind,
  bboxAround,
  d8FlowTargets,
  delineateOutline,
  fetchOpenMeteoGrid,
  fetchTerrariumGrid,
  landWithinBox,
  outlineRing,
  polygonAreaM2,
  priorityFloodFill,
  traceChannels,
  traceRing,
};

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
  /** Lowest and highest land elevation (m): water cells are left out, or the whole grid if all is water. */
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
