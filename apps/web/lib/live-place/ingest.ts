import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  ContextFeature,
  DataBundle,
  EnvironmentalCase,
  Evidence,
  GeoSelection,
  InstrumentSpec,
  Measurement,
  type Provenance,
  Source,
  TemporalObservation,
} from "@siterra/contracts";
import { type CaseSeedRecords, type Pool, loadSeedCase } from "@siterra/db";
import { instrumentReferencedIds } from "@siterra/domain";
import { formatCoordRegion, reverseGeocode } from "../../app/api/geocode/route.ts";
import { fetchBiodiversityContext } from "./biodiversity-fetcher.ts";
import {
  type AnnualClimateSummary,
  type ClimateYearRow,
  CLIMATE_END_YEAR,
  CLIMATE_START_YEAR,
  type HistoricalClimateSummary,
  fetchHistoricalClimate,
  rainTrendText,
} from "./climate-series.ts";
import { fetchRegionalContextAndGovernance } from "./context-fetcher.ts";
import { fetchGovernmentPolicyAndOpenAccess } from "./government-policy-fetcher.ts";
import {
  IO_CLASS_LABELS,
  type IoClass,
  LANDCOVER_METHOD,
  fetchLandCoverChange,
} from "./landcover-change.ts";
import { fetchOpenAlexSources, synthesizePlaceQuestionAndEvidence } from "./literature.ts";
import { cachedLive, liveCacheKey } from "./live-cache.ts";
import { reasonOverCaseWithLlm } from "./llm-reasoner.ts";
import { type MissingValue, liveSource } from "./planetary.ts";
import { buildSatelliteSourcesAndEvidence } from "./satellite-fetcher.ts";
import { type SynthesizedCasePackage, synthesizeLiveCaseSnapshot } from "./snapshot-synthesizer.ts";
import {
  type TerrainFile,
  bboxAround,
  buildTerrainForBbox,
  polygonAreaM2,
  readOrBuildTerrain,
  terrainCachePath,
} from "./terrain-builder.ts";
import { VEGETATION_METHOD, fetchVegetationSeries } from "./vegetation-series.ts";

export {
  type AnnualClimateSummary,
  type ClimateYearRow,
  type HistoricalClimateSummary,
  type TerrainFile,
  bboxAround,
  buildTerrainForBbox,
  polygonAreaM2,
  readOrBuildTerrain,
  terrainCachePath,
};

const REPO_ROOT = process.cwd().endsWith("/apps/web")
  ? resolve(process.cwd(), "..", "..")
  : process.cwd();

export function placeCachePath(caseId: string): string {
  const safeId = caseId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(REPO_ROOT, ".local", "cache", "places", `${safeId}.json`);
}

export interface IngestPlaceInput {
  lon: number;
  lat: number;
  placeName?: string | undefined;
  regionName?: string | undefined;
  question?: string | undefined;
}

export interface IngestPlaceOutcome {
  caseId: string;
  created: boolean;
  placeName: string;
  regionName: string;
  question: string;
  outlet: [number, number];
  bbox: [number, number, number, number];
}

/** Version 2: vegetation values are recorded as not measured (version 1 records stated a rainfall-made NDVI). */
export const PLACE_CACHE_VERSION = 2;

/**
 * The live pipeline's method and version, stamped on every live bundle; run-reingest.ts treats a case built by
 * any other version as stale. 1.0.0 made NDVI from rainfall; 2.0.0 records vegetation as not measured; 2.1.0
 * names the outline by what the terrain drew (watershed, drainage area or land within the box); 2.2.0 wires
 * MODIS MOD13Q1 v061 growing-season NDVI and Impact Observatory 10 m annual LULC v02 land-cover change.
 */
export const LIVE_PIPELINE = {
  methodId: "open_meteo_era5_watershed_series",
  version: "2.2.0",
} as const;

export interface CachedPlaceBundle {
  version: typeof PLACE_CACHE_VERSION;
  /** The TerrainFile version the record was built from; a different terrain version makes the record stale. */
  terrainVersion: number;
  outcome: Omit<IngestPlaceOutcome, "created">;
  seed: CaseSeedRecords;
  synth: SynthesizedCasePackage;
  occurrences?: Record<string, unknown>;
}

/**
 * A place cache written by this version over the same terrain version, or null for any other (whose
 * records are not reused: band limits, areas and spans come from the terrain).
 */
function readPlaceCache(path: string, terrainVersion: number): CachedPlaceBundle | null {
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    version?: unknown;
    terrainVersion?: unknown;
    seed?: { bundles?: readonly { dataBundle?: { methodVersion?: unknown } }[] };
  };
  const bundleVersion = raw.seed?.bundles?.[0]?.dataBundle?.methodVersion;
  return raw.version === PLACE_CACHE_VERSION &&
    raw.terrainVersion === terrainVersion &&
    (bundleVersion === undefined || bundleVersion === LIVE_PIPELINE.version)
    ? (raw as CachedPlaceBundle)
    : null;
}

const MONTH_SHORT: Record<number, string> = {
  1: "jan",
  2: "feb",
  3: "mar",
  4: "apr",
  5: "may",
  6: "jun",
  7: "jul",
  8: "aug",
  9: "sep",
  10: "oct",
  11: "nov",
  12: "dec",
};

function growingPeriodId(months: readonly number[]): string {
  const first = months[0];
  const last = months[months.length - 1];
  const a = first !== undefined ? MONTH_SHORT[first] : undefined;
  const b = last !== undefined ? MONTH_SHORT[last] : undefined;
  return a && b ? `period_2000-2024_${a}_${b}` : "period_2000-2024_mar_jun";
}

function describeVegetationMissing(res: MissingValue, fallback: string): string {
  const spec = liveSource(res.source);
  const title = spec?.title ?? "MODIS Terra MOD13Q1 v6.1";
  if (res.reason === "timeout") {
    return `Not measured: ${title} passed the 20 s limit (${res.detail})`;
  }
  return `Not measured: ${title} was not retrieved (${res.reason}: ${res.detail}). ${fallback}`;
}

function describeLandCoverMissing(res: MissingValue): string {
  const spec = liveSource(res.source);
  const title = spec?.title ?? "Impact Observatory 10 m annual LULC v02";
  if (res.reason === "timeout") {
    return `Not measured: ${title} passed the 20 s limit (${res.detail})`;
  }
  return `Not measured: ${title} was not retrieved (${res.reason}: ${res.detail}).`;
}

/** The outline's name, role, method and limits as the GeoSelection states them, from TerrainFile.outline. */
export interface OutlineDescription {
  label: string;
  boundaryRole: "hydrological_unit" | "landscape_sample";
  selectionMethod: string;
  areaMethod: string;
  limitations: string[];
  areaKm2: number;
  areaM2: number;
  /** The polygon ring the GeoSelection holds: the terrain's outline, or the box when that ring is unusable. */
  ring: [number, number][];
  /** Whether the area is an upstream drainage area (a watershed, or the part of one inside the box). */
  drains: boolean;
}

const ELEVATION_SOURCE_WORDS: Record<NonNullable<TerrainFile["elevationSource"]>, string> = {
  terrarium_z12: "AWS Terrain Tiles (Terrarium encoding, zoom 12)",
  terrarium_z11: "AWS Terrain Tiles (Terrarium encoding, zoom 11)",
  open_meteo_16: "the Open-Meteo Elevation API (16 by 16 points, interpolated)",
};

export function describeOutline(
  terrain: Pick<TerrainFile, "outline" | "elevationSource" | "catchmentRing" | "bbox">,
  placeName: string,
  lon: number,
  lat: number,
): OutlineDescription {
  const box = `the 20 km box centred at ${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  const dem =
    terrain.elevationSource === undefined
      ? "an elevation grid whose source is not recorded"
      : ELEVATION_SOURCE_WORDS[terrain.elevationSource];
  const notSurveyed = "Not a surveyed watershed, legal parcel or management boundary.";
  // A polygon ring needs four positions (three corners and the closing one); a shorter outline is not used
  const ringUsable = terrain.catchmentRing.length >= 4;
  const [minLon, minLat, maxLon, maxLat] = terrain.bbox;
  const boxRing: [number, number][] = [
    [minLon, minLat],
    [maxLon, minLat],
    [maxLon, maxLat],
    [minLon, maxLat],
    [minLon, minLat],
  ];
  const ring = ringUsable ? terrain.catchmentRing : boxRing;
  const kind = ringUsable ? terrain.outline?.kind : undefined;
  const fallback = ringUsable ? terrain.outline?.fallback : undefined;
  const gridArea = ringUsable ? terrain.outline?.areaKm2 : undefined;
  const areaKm2 = gridArea ?? Number((polygonAreaM2(ring) / 1e6).toFixed(1));
  const areaM2 = Math.round(areaKm2 * 1e6);
  const areaMethod =
    gridArea === undefined
      ? `Geodesic polygon area on the WGS84 ellipsoid (${areaKm2.toFixed(1)} km²).`
      : `Area of the elevation grid cells inside the outline (${areaKm2.toFixed(1)} km²).`;
  if (kind === "watershed")
    return {
      label: `${placeName} watershed`,
      boundaryRole: "hydrological_unit",
      selectionMethod: `Within ${box}: everything draining through the outlet, traced by D8 flow on ${dem}; the whole watershed lies inside the box.`,
      areaMethod,
      limitations: [`Traced from ${dem}, not mapped.`, notSurveyed],
      areaKm2,
      areaM2,
      ring,
      drains: true,
    };
  if (kind === "drainage_within_box")
    return {
      label: "Drainage area within the 20 km box",
      boundaryRole: "landscape_sample",
      selectionMethod: `Within ${box}: the area draining through the outlet, traced by D8 flow on ${dem}; the box cuts it, so it is part of a larger watershed.`,
      areaMethod,
      limitations: [
        "Part of a larger watershed: the box edge cuts the drainage area, so its area is a lower bound.",
        `Traced from ${dem}, not mapped.`,
        notSurveyed,
      ],
      areaKm2,
      areaM2,
      ring,
      drains: true,
    };
  if (kind === "land_within_box")
    return {
      label: "Land within the 20 km box",
      boundaryRole: "landscape_sample",
      selectionMethod:
        fallback === "outline_degenerate"
          ? `Within ${box}: the land around the point, clipped at water, from ${dem}. No watershed is drawn, because the basin outline had too few cells to draw.`
          : `Within ${box}: the land around the point, clipped at water, from ${dem}. No watershed is drawn, because the basin through the point is a small share of the box's land.`,
      areaMethod,
      limitations: [
        "Not a watershed: the land around the chosen point inside the box.",
        notSurveyed,
      ],
      areaKm2,
      areaM2,
      ring,
      drains: false,
    };
  if (kind === "box") {
    const noLand = fallback === "no_land";
    return {
      label: noLand ? "The 20 km box (no land in it)" : "The 20 km box (no outline could be drawn)",
      boundaryRole: "landscape_sample",
      selectionMethod: noLand
        ? `All of ${box}, from ${dem}: no land was found in the box, so the box itself is the outline.`
        : `All of ${box}, from ${dem}: no outline of the land or basin could be drawn, so the box itself stands in for it.`,
      areaMethod,
      limitations: [
        noLand
          ? "No land in the 20 km box: the whole box is water."
          : "No outline could be drawn inside the box, so the record holds the whole box.",
        notSurveyed,
      ],
      areaKm2,
      areaM2,
      ring,
      drains: false,
    };
  }
  return {
    label: "Area within the 20 km box",
    boundaryRole: "landscape_sample",
    selectionMethod: ringUsable
      ? `Within ${box}, from ${dem}; how the outline was drawn is not recorded in this terrain file.`
      : `All of ${box}, from ${dem}. The drawn outline had fewer than four points, so the whole box stands in for it.`,
    areaMethod,
    limitations: [
      ringUsable
        ? "How the outline was drawn is not recorded, so it is not called a watershed."
        : "No usable outline: the terrain's ring had fewer than four points, so the record holds the whole box.",
      notSurveyed,
    ],
    areaKm2,
    areaM2,
    ring,
    drains: false,
  };
}

function makeSlug(text: string): string {
  const cleaned = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 26)
    .replace(/_+$/g, "");
  return cleaned.length > 0 && /^[a-z0-9]/.test(cleaned) ? cleaned : "catchment";
}

export function deterministicCaseId(
  lon: number,
  lat: number,
  placeName: string,
): { caseId: string; slug: string; hash6: string } {
  const slug = makeSlug(placeName);
  const coordKey = `${lon.toFixed(3)},${lat.toFixed(3)}`;
  const hash6 = createHash("sha256").update(coordKey).digest("hex").slice(0, 6);
  return { caseId: `case_loc_${slug}_${hash6}`, slug, hash6 };
}

const NOT_QUANTIFIED = {
  kind: "not_quantified" as const,
  lower: null,
  upper: null,
  level: null,
  method: null,
};

async function persistSynthesizedPackage(
  pool: Pool,
  caseId: string,
  synth: SynthesizedCasePackage,
): Promise<void> {
  const extraRecords = [
    synth.task,
    ...synth.fieldRequirementEvidence,
    ...synth.hypotheses,
    ...synth.explanationBranches,
    synth.branchMerge,
    ...synth.interventions,
    ...synth.resourceRequirements,
    ...synth.reviewDecisions,
    synth.operationalAction,
    synth.brief,
  ];
  for (const r of extraRecords) {
    await pool.query(
      `INSERT INTO records (case_id, entity_id, revision, record_type, record, case_revision)
       VALUES ($1, $2, $3, $4, $5, 1)
       ON CONFLICT (case_id, entity_id, revision) DO NOTHING`,
      [caseId, r.id, r.revision, r.recordType, JSON.stringify(r)],
    );
  }
}

export async function ingestLocationCase(
  pool: Pool,
  input: IngestPlaceInput,
  ownerScopeId: string,
): Promise<IngestPlaceOutcome> {
  const lon = Number(input.lon.toFixed(5));
  const lat = Number(input.lat.toFixed(5));

  let placeName = input.placeName?.trim() ?? "";
  let regionName = input.regionName?.trim() ?? "";
  if (!placeName || !regionName) {
    const rev = await reverseGeocode(lon, lat);
    if (!placeName) placeName = rev.name;
    if (!regionName) regionName = rev.region || formatCoordRegion(lat, lon);
  }

  const { caseId } = deterministicCaseId(lon, lat, placeName);
  const bbox = bboxAround(lon, lat);

  const existing = await pool.query<{ record: EnvironmentalCase }>(
    "select record from cases where id = $1",
    [caseId],
  );
  if ((existing.rowCount ?? 0) > 0 && existing.rows[0]) {
    const existingTerrain = await readOrBuildTerrain(caseId, bbox);
    const hasMerge = await pool.query(
      "select 1 from records where case_id = $1 and record_type = 'BranchMerge' limit 1",
      [caseId],
    );
    if ((hasMerge.rowCount ?? 0) === 0 && existsSync(placeCachePath(caseId))) {
      try {
        const cached = readPlaceCache(placeCachePath(caseId), existingTerrain.version);
        if (cached) {
          await persistSynthesizedPackage(pool, caseId, cached.synth);
        }
      } catch {
        // Non-fatal
      }
    }
    const rec = existing.rows[0].record;
    return {
      caseId,
      created: false,
      placeName: rec.place?.name ?? placeName,
      regionName: rec.place?.region ?? regionName,
      question: rec.objective,
      outlet: [lon, lat],
      bbox,
    };
  }

  // Restore from local disk cache (.local/cache/places/<caseId>.json) if available
  const cacheFile = placeCachePath(caseId);
  if (existsSync(cacheFile)) {
    try {
      const cachedTerrain = await readOrBuildTerrain(caseId, bbox);
      const cached = readPlaceCache(cacheFile, cachedTerrain.version);
      if (cached) {
        await loadSeedCase(pool, cached.seed, ownerScopeId);
        await persistSynthesizedPackage(pool, caseId, cached.synth);
        return { ...cached.outcome, created: true };
      }
    } catch {
      // Regenerate below if cache is stale or invalid
    }
  }

  const built = await buildLiveCase({
    lon,
    lat,
    placeName,
    regionName,
    question: input.question,
    ownerScopeId,
  });
  const { outcome, seed, synth } = built;

  // A record with rainfall unavailable is not cached, so the next ingest of this place asks the archive again
  if (!built.rainUnavailable) {
    try {
      mkdirSync(dirname(cacheFile), { recursive: true });
      const cachedBundle: CachedPlaceBundle = {
        version: PLACE_CACHE_VERSION,
        terrainVersion: built.terrainVersion,
        outcome,
        seed,
        synth,
        ...(built.occurrences ? { occurrences: built.occurrences } : {}),
      };
      writeFileSync(cacheFile, JSON.stringify(cachedBundle));
    } catch {
      // Non-fatal if cache write fails
    }
  }

  try {
    await loadSeedCase(pool, seed, ownerScopeId);
    await persistSynthesizedPackage(pool, caseId, synth);
    return { ...outcome, created: true };
  } catch (err) {
    if (err instanceof Error && /already exists/i.test(err.message)) {
      await persistSynthesizedPackage(pool, caseId, synth);
      return { ...outcome, created: false };
    }
    throw err;
  }
}

/** A live place's whole record, built from the live sources; nothing is written or cached. */
export interface LiveCaseBuild {
  outcome: Omit<IngestPlaceOutcome, "created">;
  seed: CaseSeedRecords;
  synth: SynthesizedCasePackage;
  /** Open-Meteo did not answer: the rainfall values are missing with a reason. */
  rainUnavailable: boolean;
  /** The 20 km box holds no land (outline kind box, fallback no_land). */
  noLand: boolean;
  terrainVersion: number;
  occurrences: Record<string, unknown> | null;
}

/**
 * Fetches the live sources for a place and builds its case record and synthesized package, the
 * same records an ingest writes (ingestLocationCase) and a re-ingest appends as new revisions.
 */
export async function buildLiveCase(input: {
  lon: number;
  lat: number;
  placeName: string;
  regionName: string;
  question?: string | undefined;
  ownerScopeId: string;
  /** False keeps the model out of the build entirely (the re-ingest script). */
  allowModel?: boolean | undefined;
}): Promise<LiveCaseBuild> {
  const { lon, lat, placeName, regionName, ownerScopeId } = input;
  const { caseId, slug, hash6 } = deterministicCaseId(lon, lat, placeName);
  const bbox = bboxAround(lon, lat);
  const now = new Date().toISOString();
  const geoId = `geo_loc_${slug}_${hash6}`;
  const [terrain, climate, vegetation, landCover, oaSources, regionalCtx, govPolicy, bioCtx] =
    await Promise.all([
      buildTerrainForBbox(bbox, caseId),
      fetchHistoricalClimate(lon, lat),
      cachedLive("vegetation", liveCacheKey(bbox, undefined, VEGETATION_METHOD.version), () =>
        fetchVegetationSeries(bbox, undefined, { timeoutMs: 20_000 }),
      ),
      cachedLive("landcover", liveCacheKey(bbox, undefined, LANDCOVER_METHOD.version), () =>
        fetchLandCoverChange(bbox, undefined, { timeoutMs: 20_000 }),
      ),
      fetchOpenAlexSources(caseId, slug, hash6, placeName, regionName, now),
      fetchRegionalContextAndGovernance({
        caseId,
        slug,
        hash6,
        lon,
        lat,
        placeName,
        regionName,
        geoId,
        now,
      }),
      fetchGovernmentPolicyAndOpenAccess({
        caseId,
        slug,
        hash6,
        placeName,
        regionName,
        geoId,
        now,
        question: input.question,
      }),
      fetchBiodiversityContext({
        bbox,
        lon,
        lat,
        caseId,
        slug,
        hash6,
        placeName,
        regionName,
        geoId,
        now,
      }),
    ]);

  const satRecords = terrain.satelliteMeta
    ? buildSatelliteSourcesAndEvidence({
        caseId,
        slug,
        hash6,
        placeName,
        regionName,
        geoId,
        now,
        satellite: terrain.satelliteMeta,
      })
    : { sources: [], evidence: [] };

  const vegMeasured = vegetation.status === "measured";
  const lulcMeasured = landCover.status === "measured";
  const modisSpec = liveSource("modis-13Q1-061");
  const lulcSpec = liveSource("io-lulc-annual-v02");
  const modisTitle = modisSpec?.title ?? "MODIS Terra MOD13Q1 v6.1";
  const modisLicense =
    modisSpec?.license ??
    "Openly shared without restriction (EOSDIS Data Use and Citation Guidance)";
  const modisAttribution =
    modisSpec?.attribution ??
    "MOD13Q1 v6.1, NASA EOSDIS Land Processes DAAC, via Microsoft Planetary Computer";
  const lulcTitle = "Impact Observatory 10 m annual LULC v02";
  const lulcLicense = lulcSpec?.license ?? "CC BY 4.0";
  const lulcAttribution =
    lulcSpec?.attribution ?? "Land cover: Impact Observatory, Microsoft and Esri, CC BY 4.0";

  const modisSource = Source.parse({
    recordType: "Source",
    id: `src_modis_${slug}_${hash6}`,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    title: `${modisTitle} growing-season NDVI series for ${placeName} (2000 to 2024)`,
    url: "https://planetarycomputer.microsoft.com/dataset/modis-13Q1-061",
    publisher: "NASA EOSDIS Land Processes DAAC via Microsoft Planetary Computer STAC",
    authors: ["Didan, K.", "NASA LP DAAC"],
    publicationDate: "2024-12-31",
    language: "en",
    accessedAt: now,
    sourceKind: "official_dataset",
    accessStatus: vegMeasured ? "retrieved" : "unavailable",
    license: modisLicense,
    redistributionStatus: "permitted",
    contentHash: vegMeasured
      ? `sha256:${createHash("sha256").update(`modis-13Q1-061:${caseId}:${VEGETATION_METHOD.version}`).digest("hex")}`
      : null,
    notes: vegMeasured
      ? [
          modisAttribution,
          `Growing window: ${vegetation.value.window.label} (months ${vegetation.value.window.months.join(", ")}), reference years ${vegetation.value.window.referenceYears.join(", ")}.`,
          `QA rule: ${vegetation.value.qaRule}. Coverage denominator: ${String(vegetation.value.analysisPixels)} analysis pixels of ${String(vegetation.value.placePixels)} place pixels (${String(vegetation.value.grid.pixelSizeM)} m sinusoidal grid).`,
          `Method: ${vegetation.value.method.id}@${vegetation.value.method.version}.`,
          ...vegetation.value.limitations,
        ]
      : [modisAttribution, describeVegetationMissing(vegetation, climate.vegetation.reason)],
  });
  const lulcSource = Source.parse({
    recordType: "Source",
    id: `src_lulc_${slug}_${hash6}`,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    title: `${lulcTitle} (${lulcSpec?.title ?? "10 m Annual Land Use Land Cover"}) for ${placeName} (2017 to 2023)`,
    url: "https://planetarycomputer.microsoft.com/dataset/io-lulc-annual-v02",
    publisher: "Impact Observatory / Microsoft Planetary Computer STAC",
    authors: ["Impact Observatory", "Esri", "Microsoft Planetary Computer"],
    publicationDate: "2024-12-31",
    language: "en",
    accessedAt: now,
    sourceKind: "official_dataset",
    accessStatus: lulcMeasured ? "retrieved" : "unavailable",
    license: lulcLicense,
    redistributionStatus: "permitted",
    contentHash: lulcMeasured
      ? `sha256:${createHash("sha256").update(`io-lulc-annual-v02:${caseId}:${LANDCOVER_METHOD.version}`).digest("hex")}`
      : null,
    notes: lulcMeasured
      ? [
          lulcAttribution,
          `Annual 9-class land cover for ${landCover.value.years.map((y) => String(y.year)).join(", ")} (${String(landCover.value.comparedPoints)} compared points).`,
          `Method: ${landCover.provenance.method.id}@${landCover.provenance.method.version}.`,
          ...landCover.value.limitations,
        ]
      : [lulcAttribution, describeLandCoverMissing(landCover)],
  });

  const rainUnavailable = climate.status !== "measured";
  const datasetSources = rainUnavailable
    ? oaSources.map((s) =>
        s.id.startsWith("src_era5_")
          ? Source.parse({
              ...s,
              accessStatus: "unavailable",
              contentHash: null,
              notes: [...s.notes, climate.unavailableReason ?? "Not retrieved."],
            })
          : s,
      )
    : oaSources;
  const sources = [
    ...datasetSources,
    modisSource,
    lulcSource,
    ...satRecords.sources,
    ...regionalCtx.contextSources,
    ...govPolicy.sources,
    ...bioCtx.sources,
  ];
  const outline = describeOutline(terrain, placeName, lon, lat);
  const { areaKm2, areaM2 } = outline;

  const geoSelection = GeoSelection.parse({
    recordType: "GeoSelection",
    id: geoId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    label: outline.label,
    geometryStatus: "analysis_ready",
    geometry: { type: "Polygon", coordinates: [outline.ring] },
    crs: "EPSG:4326",
    boundaryRole: outline.boundaryRole,
    boundarySourceIds: sources[0] ? [sources[0].id] : [],
    selectionMethod: outline.selectionMethod,
    areaM2,
    areaMethod: outline.areaMethod,
    limitations: outline.limitations,
  });

  const bundleId = `bundle_loc_${slug}_${hash6}`;
  // The record keeps one period per calendar year whether or not rainfall was retrieved for it
  const recordYears: number[] = [];
  for (let yr = CLIMATE_START_YEAR; yr <= CLIMATE_END_YEAR; yr++) recordYears.push(yr);
  const rainByYear = new Map(climate.years.map((y) => [y.year, y] as const));
  const vegByYear = new Map(
    vegMeasured ? vegetation.value.seasons.map((s) => [s.year, s] as const) : [],
  );
  const periodIds = recordYears.map((yr) => `period_${String(yr)}-06`);

  const climateSource = climate.source;
  const era5SourceId = sources.find((s) => s.id.startsWith("src_era5_"))?.id ?? null;
  const demSourceId = sources.find((s) => s.id.startsWith("src_dem_"))?.id ?? null;
  const vegetationMissing = vegMeasured
    ? climate.vegetation.reason
    : describeVegetationMissing(vegetation, climate.vegetation.reason);
  const vegWindowLabel = vegMeasured ? vegetation.value.window.label : "growing season";

  const bundleProvenance: Provenance = {
    sourceLocators: [],
    dataBundleIds: [],
    methodId: LIVE_PIPELINE.methodId,
    methodVersion: LIVE_PIPELINE.version,
    inputVersions: [{ entityId: geoId, revision: 1 }],
    generatedByTaskId: null,
    generatedAt: now,
    verificationStatus: "computed_checked",
    limitations: [
      rainUnavailable
        ? (climate.unavailableReason ?? "Rainfall is not measured.")
        : `Rainfall: ${climateSource.label} (${climateSource.window}).`,
      "Relief: the terrain elevation grid built for this place (AWS Terrain Tiles, Terrarium encoding, when reachable).",
      ...(vegMeasured
        ? [
            `Vegetation: ${modisTitle} (${vegWindowLabel}, reference years ${vegetation.value.window.referenceYears.join(", ")}; QA rule: ${vegetation.value.qaRule}; coverage denominator: ${String(vegetation.value.analysisPixels)} analysis pixels of ${String(vegetation.value.placePixels)} place pixels).`,
            ...vegetation.value.limitations,
          ]
        : [vegetationMissing]),
      ...(lulcMeasured
        ? [
            `Land cover: ${lulcTitle} (${String(landCover.value.firstYear)} to ${String(landCover.value.lastYear)}, ${lulcLicense}).`,
            ...landCover.value.limitations,
          ]
        : []),
    ],
  };

  const recordProvenance: Provenance = {
    ...bundleProvenance,
    inputVersions: [
      { entityId: geoId, revision: 1 },
      { entityId: bundleId, revision: 1 },
    ],
  };

  // Each value cites the source it was computed from, or says it was not measured
  const rainProvenance: Provenance = {
    ...recordProvenance,
    sourceLocators:
      era5SourceId && !rainUnavailable
        ? [
            {
              sourceId: era5SourceId,
              locator: `${climateSource.url ?? ""} daily precipitation_sum and et0_fao_evapotranspiration, nearest grid cell to ${lat.toFixed(4)}, ${lon.toFixed(4)}, ${climateSource.window}`,
              excerpt: null,
            },
          ]
        : [],
    limitations: [
      `${climateSource.label} (${climateSource.window}).`,
      "Reanalysis values for one grid cell, not a rain gauge and not an average over the catchment.",
    ],
  };
  const demProvenance: Provenance = {
    ...recordProvenance,
    sourceLocators: demSourceId
      ? [
          {
            sourceId: demSourceId,
            locator: "terrain elevation grid for the analysis box",
            excerpt: null,
          },
        ]
      : [],
    limitations: [
      "Computed from the terrain elevation grid built for this place (AWS Terrain Tiles, Terrarium encoding, when reachable).",
    ],
  };
  const notMeasuredProvenance: Provenance = {
    ...recordProvenance,
    verificationStatus: "unverified",
    limitations: [vegetationMissing],
  };
  const vegProvenance: Provenance = vegMeasured
    ? {
        ...recordProvenance,
        methodId: vegetation.value.method.id,
        methodVersion: vegetation.value.method.version,
        sourceLocators: [
          {
            sourceId: modisSource.id,
            locator: `${modisTitle} 250 m NDVI, ${vegWindowLabel}, reference years ${vegetation.value.window.referenceYears.join(", ")}, QA rule: ${vegetation.value.qaRule}, coverage denominator: ${String(vegetation.value.analysisPixels)} analysis pixels of ${String(vegetation.value.placePixels)} place pixels`,
            excerpt: null,
          },
        ],
        limitations: [
          `Growing window: ${vegWindowLabel} (reference years ${vegetation.value.window.referenceYears.join(", ")}).`,
          `QA rule: ${vegetation.value.qaRule}. Coverage denominator: ${String(vegetation.value.analysisPixels)} analysis pixels of ${String(vegetation.value.placePixels)} place pixels.`,
          ...vegetation.value.limitations,
        ],
      }
    : notMeasuredProvenance;
  const lulcProvenance: Provenance = lulcMeasured
    ? {
        ...recordProvenance,
        methodId: landCover.provenance.method.id,
        methodVersion: landCover.provenance.method.version,
        sourceLocators: [
          {
            sourceId: lulcSource.id,
            locator: `${lulcTitle}, annual maps ${String(landCover.value.firstYear)} to ${String(landCover.value.lastYear)}`,
            excerpt: null,
          },
        ],
        limitations: [
          `${lulcTitle} (${String(landCover.value.firstYear)} to ${String(landCover.value.lastYear)}, ${lulcLicense}).`,
          ...landCover.value.limitations,
        ],
      }
    : notMeasuredProvenance;

  const makeMeasurement = (
    id: string,
    metric: string,
    value: number,
    unit: string,
    periodId: string,
    aggregation: string,
    validPixelCount: number | null,
    spatialResolutionM: number | null,
    uncertainty: Measurement["uncertainty"] = NOT_QUANTIFIED,
    provenance: Provenance = recordProvenance,
    totalPixelCount: number | null = validPixelCount,
    validFraction: number | null = validPixelCount !== null ? 1 : null,
  ): Measurement =>
    Measurement.parse({
      recordType: "Measurement",
      id,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      metric,
      value,
      unit,
      status: "available",
      missingReason: null,
      geoSelectionId: geoId,
      geoRevision: 1,
      periodId,
      dataBundleId: bundleId,
      aggregation,
      validPixelCount,
      totalPixelCount,
      validFraction,
      spatialResolutionM,
      uncertainty,
      provenance,
    });

  // A value nobody measured: status missing, no number, and the reason stated
  const makeNotMeasured = (
    id: string,
    metric: string,
    unit: string,
    periodId: string,
    aggregation: string,
    missingReason: string = vegetationMissing,
  ): Measurement =>
    Measurement.parse({
      recordType: "Measurement",
      id,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      metric,
      value: null,
      unit,
      status: "missing",
      missingReason,
      geoSelectionId: geoId,
      geoRevision: 1,
      periodId,
      dataBundleId: bundleId,
      aggregation,
      validPixelCount: null,
      totalPixelCount: null,
      validFraction: null,
      spatialResolutionM: null,
      uncertainty: NOT_QUANTIFIED,
      provenance: { ...notMeasuredProvenance, limitations: [missingReason] },
    });

  const temporalObservations: TemporalObservation[] = [];
  const measurements: Measurement[] = [];

  for (const year of recordYears) {
    const yrRow = rainByYear.get(year);
    const vegYr = vegByYear.get(year);
    const pId = `period_${String(year)}-06`;
    const mPrecipId = `meas_precip_${slug}_${hash6}_${String(year)}`;
    const mNdviId = `meas_ndvi_${slug}_${hash6}_${String(year)}`;
    const rainAggregation = `Calendar-year total of daily precipitation (${String(year)}), ${climateSource.label}, nearest grid cell to ${placeName}.`;
    const ndviAggregation = vegMeasured
      ? `Growing-season mean NDVI (${String(year)}, ${vegWindowLabel}) across ${placeName}, ${modisTitle}; reference years ${vegetation.value.window.referenceYears.join(", ")}; QA rule: ${vegetation.value.qaRule}; coverage denominator: ${String(vegetation.value.analysisPixels)} analysis pixels of ${String(vegetation.value.placePixels)} place pixels; method ${vegetation.value.method.id}@${vegetation.value.method.version}.`
      : `Growing-season vegetation index (${String(year)}) across ${placeName}: not measured.`;
    measurements.push(
      yrRow
        ? makeMeasurement(
            mPrecipId,
            "precipitation_annual_mm",
            yrRow.precipMm,
            "mm",
            pId,
            rainAggregation,
            null,
            null,
            NOT_QUANTIFIED,
            rainProvenance,
          )
        : makeNotMeasured(
            mPrecipId,
            "precipitation_annual_mm",
            "mm",
            pId,
            rainAggregation,
            climate.unavailableReason ??
              `Not measured: the archive returned days missing in ${String(year)}, so no total is given.`,
          ),
      vegMeasured && vegYr && vegYr.meanNdvi !== null
        ? makeMeasurement(
            mNdviId,
            "ndvi_growing_season_mean",
            vegYr.meanNdvi,
            "NDVI",
            pId,
            ndviAggregation,
            Math.round(vegYr.validPixelShare * vegetation.value.analysisPixels),
            vegetation.value.grid.pixelSizeM,
            NOT_QUANTIFIED,
            vegProvenance,
            vegetation.value.analysisPixels,
            vegYr.validPixelShare,
          )
        : makeNotMeasured(
            mNdviId,
            "ndvi_growing_season_mean",
            "NDVI",
            pId,
            ndviAggregation,
            vegMeasured
              ? `Not measured: ${String(year)} ${vegWindowLabel} had valid pixel share ${String(vegYr?.validPixelShare ?? 0)} across ${placeName} (${modisTitle}, QA rule: ${vegetation.value.qaRule}, coverage denominator: ${String(vegetation.value.analysisPixels)} analysis pixels).`
              : vegetationMissing,
          ),
    );
    temporalObservations.push(
      TemporalObservation.parse({
        recordType: "TemporalObservation",
        id: `obs_loc_${slug}_${hash6}_${String(year)}`,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        caseId,
        periodId: pId,
        startDate: `${String(year)}-01-01`,
        endDateExclusive: `${String(year + 1)}-01-01`,
        seasonDefinition: `Calendar year ${String(year)} (UTC)`,
        geoSelectionId: geoId,
        geoRevision: 1,
        dataBundleId: bundleId,
        measurementIds: [mPrecipId, mNdviId],
        mapAssetUri: null,
        mapAssetHash: null,
        mapStatus: "missing",
        qualityFlags: [],
        provenance: rainProvenance,
      }),
    );
  }

  const summaryPeriodId = vegMeasured
    ? growingPeriodId(vegetation.value.window.months)
    : "period_2000-2024_mar_jun";
  // the rainfall trend is fitted to calendar-year totals, not to a March to June window
  const annualPeriodId = "period_2000-2024_annual";
  const mCatchmentTrendId = `meas_catchment_trend_${slug}_${hash6}`;
  const mPrecipTrendId = `meas_precip_trend_${slug}_${hash6}`;
  const mRainR2Id = `meas_rain_r2_${slug}_${hash6}`;
  const mFdrUpId = `meas_fdr_up_${slug}_${hash6}`;
  const mFdrDownId = `meas_fdr_down_${slug}_${hash6}`;
  const mBandTrendId = `meas_band_low_${slug}_${hash6}`;
  const mBandLimitId = `meas_band_limit_${slug}_${hash6}`;
  const mAreaKm2Id = `meas_area_km2_${slug}_${hash6}`;
  const bandLimitM = Math.round(
    terrain.minElevationM + (terrain.maxElevationM - terrain.minElevationM) * 0.38,
  );
  const precipYears = climate.years.length;
  const precipInterval: Measurement["uncertainty"] =
    climate.precipTrendLowerMmPerDecade !== null && climate.precipTrendUpperMmPerDecade !== null
      ? {
          kind: "interval",
          lower: climate.precipTrendLowerMmPerDecade,
          upper: climate.precipTrendUpperMmPerDecade,
          level: 0.95,
          method: `95% Student t interval of the ordinary least squares slope over ${String(precipYears)} calendar years.`,
        }
      : NOT_QUANTIFIED;

  const vegPixelsTested = vegMeasured ? (vegetation.value.pixelShares?.pixelsTested ?? null) : null;
  const vegTestedFraction =
    vegMeasured && vegPixelsTested !== null && vegetation.value.analysisPixels > 0
      ? Number((vegPixelsTested / vegetation.value.analysisPixels).toFixed(4))
      : null;

  measurements.push(
    vegMeasured && vegetation.value.areaTrend
      ? makeMeasurement(
          mCatchmentTrendId,
          "ndvi_trend_unadjusted_per_decade",
          vegetation.value.areaTrend.perDecade,
          "NDVI per decade",
          summaryPeriodId,
          `Theil-Sen slope of ${vegWindowLabel} mean NDVI across ${placeName} over ${String(vegetation.value.areaTrend.seasonsUsed)} seasons (2000 to 2024; Mann-Kendall p = ${vegetation.value.areaTrend.mannKendallP.toFixed(4)}), ${modisTitle}; reference years ${vegetation.value.window.referenceYears.join(", ")}; QA rule: ${vegetation.value.qaRule}; coverage denominator: ${String(vegetation.value.analysisPixels)} analysis pixels of ${String(vegetation.value.placePixels)} place pixels; method ${vegetation.value.method.id}@${vegetation.value.method.version}.`,
          vegPixelsTested ?? vegetation.value.analysisPixels,
          vegetation.value.grid.pixelSizeM,
          {
            kind: "interval",
            lower: vegetation.value.areaTrend.sen95PerDecade[0],
            upper: vegetation.value.areaTrend.sen95PerDecade[1],
            level: 0.95,
            method: `95% Sen confidence interval of the Theil-Sen slope over ${String(vegetation.value.areaTrend.seasonsUsed)} seasons (Mann-Kendall two-sided p = ${vegetation.value.areaTrend.mannKendallP.toFixed(4)}, ${vegetation.value.method.id}@${vegetation.value.method.version}).`,
          },
          vegProvenance,
          vegetation.value.analysisPixels,
          vegTestedFraction ?? 1,
        )
      : makeNotMeasured(
          mCatchmentTrendId,
          "ndvi_trend_unadjusted_per_decade",
          "NDVI per decade",
          summaryPeriodId,
          `Vegetation trend per decade across ${placeName}: not measured.`,
          vegMeasured
            ? (vegetation.value.areaTrendWithheld ??
                "Not measured: too few growing seasons met the coverage threshold.")
            : vegetationMissing,
        ),
    climate.precipTrendMmPerDecade === null
      ? makeNotMeasured(
          mPrecipTrendId,
          "precipitation_trend_mm_per_decade",
          "mm per decade",
          annualPeriodId,
          `Ordinary least squares trend of calendar-year precipitation (${climateSource.window}), ${climateSource.label}: not measured.`,
          climate.unavailableReason ?? "Rainfall is not measured.",
        )
      : makeMeasurement(
          mPrecipTrendId,
          "precipitation_trend_mm_per_decade",
          climate.precipTrendMmPerDecade,
          "mm per decade",
          annualPeriodId,
          `Ordinary least squares trend of calendar-year precipitation over ${String(precipYears)} years (${climateSource.window}), ${climateSource.label}.`,
          null,
          null,
          precipInterval,
          rainProvenance,
        ),
    makeNotMeasured(
      mRainR2Id,
      "rainfall_fit_r_squared",
      "dimensionless (R squared)",
      summaryPeriodId,
      "Share of yearly vegetation change that rainfall explains: not measured.",
      vegMeasured
        ? "Not measured: no regression fit of growing-season NDVI against rainfall has been computed for this place."
        : `${vegetationMissing} Rainfall cannot be fitted against a vegetation series that does not exist.`,
    ),
    vegMeasured && vegetation.value.pixelShares
      ? makeMeasurement(
          mFdrUpId,
          "area_share_upward_fdr",
          vegetation.value.pixelShares.fdrUpward,
          "share of analysis cells (0 to 1)",
          summaryPeriodId,
          `Share of ${String(vegetation.value.analysisPixels)} analysis pixels (${String(vegetation.value.pixelShares.pixelsTested)} tested) with a Benjamini-Hochberg FDR-significant (q <= ${String(vegetation.value.pixelShares.fdrQ)}) upward growing-season NDVI trend (${vegWindowLabel}, 2000 to 2024), ${modisTitle}; reference years ${vegetation.value.window.referenceYears.join(", ")}; QA rule: ${vegetation.value.qaRule}; coverage denominator: ${String(vegetation.value.analysisPixels)} analysis pixels of ${String(vegetation.value.placePixels)} place pixels; method ${vegetation.value.method.id}@${vegetation.value.method.version}.`,
          vegetation.value.pixelShares.pixelsTested,
          vegetation.value.grid.pixelSizeM,
          NOT_QUANTIFIED,
          vegProvenance,
          vegetation.value.analysisPixels,
          vegTestedFraction,
        )
      : makeNotMeasured(
          mFdrUpId,
          "area_share_upward_fdr",
          "share of analysis cells (0 to 1)",
          summaryPeriodId,
          "Share of cells with a significant upward vegetation trend: not measured.",
          `${vegetationMissing} No cell-level trend test has run.`,
        ),
    vegMeasured && vegetation.value.pixelShares
      ? makeMeasurement(
          mFdrDownId,
          "area_share_downward_fdr",
          vegetation.value.pixelShares.fdrDownward,
          "share of analysis cells (0 to 1)",
          summaryPeriodId,
          `Share of ${String(vegetation.value.analysisPixels)} analysis pixels (${String(vegetation.value.pixelShares.pixelsTested)} tested) with a Benjamini-Hochberg FDR-significant (q <= ${String(vegetation.value.pixelShares.fdrQ)}) downward growing-season NDVI trend (${vegWindowLabel}, 2000 to 2024), ${modisTitle}; reference years ${vegetation.value.window.referenceYears.join(", ")}; QA rule: ${vegetation.value.qaRule}; coverage denominator: ${String(vegetation.value.analysisPixels)} analysis pixels of ${String(vegetation.value.placePixels)} place pixels; method ${vegetation.value.method.id}@${vegetation.value.method.version}.`,
          vegetation.value.pixelShares.pixelsTested,
          vegetation.value.grid.pixelSizeM,
          NOT_QUANTIFIED,
          vegProvenance,
          vegetation.value.analysisPixels,
          vegTestedFraction,
        )
      : makeNotMeasured(
          mFdrDownId,
          "area_share_downward_fdr",
          "share of analysis cells (0 to 1)",
          summaryPeriodId,
          "Share of cells with a significant downward vegetation trend: not measured.",
          `${vegetationMissing} No cell-level trend test has run.`,
        ),
    makeNotMeasured(
      mBandTrendId,
      "ndvi_trend_unadjusted_per_decade",
      "NDVI per decade",
      summaryPeriodId,
      `Vegetation trend below ${String(bandLimitM)} m: not measured.`,
      vegMeasured
        ? `Not measured: MODIS 250 m NDVI is not stratified by elevation band below ${String(bandLimitM)} m in this live build.`
        : vegetationMissing,
    ),
    makeMeasurement(
      mBandLimitId,
      "elevation_band_limit",
      bandLimitM,
      "m",
      summaryPeriodId,
      `Lower elevation band limit (${String(bandLimitM)} m): 38% of the way from the lowest to the highest point of the terrain grid.`,
      null,
      null,
      NOT_QUANTIFIED,
      demProvenance,
    ),
    outline.drains
      ? makeMeasurement(
          mAreaKm2Id,
          "drainage_outlet_upstream_area",
          areaKm2,
          "km2",
          summaryPeriodId,
          `${outline.label}: ${outline.areaMethod}`,
          null,
          null,
          NOT_QUANTIFIED,
          demProvenance,
        )
      : makeNotMeasured(
          mAreaKm2Id,
          "drainage_outlet_upstream_area",
          "km2",
          summaryPeriodId,
          `Upstream drainage area for ${placeName}: not measured.`,
          `No watershed is drawn here: the outline is ${outline.label.toLowerCase()} (${areaKm2.toFixed(1)} km²), not an upstream drainage area.`,
        ),
  );

  const lulcPeriodId = lulcMeasured
    ? `period_${String(landCover.value.firstYear)}-${String(landCover.value.lastYear)}_annual`
    : "period_2017-2023_annual";
  const mLulcChangedId = `meas_lulc_change_${slug}_${hash6}`;
  if (lulcMeasured) {
    measurements.push(
      makeMeasurement(
        mLulcChangedId,
        "landcover_changed_share",
        landCover.value.changedShare,
        "share of analysis cells (0 to 1)",
        lulcPeriodId,
        `Share of 10 m sample points (${String(landCover.value.comparedPoints)} compared) whose Impact Observatory annual land-cover class differed between ${String(landCover.value.firstYear)} and ${String(landCover.value.lastYear)} across ${placeName} (${lulcTitle}, ${lulcLicense}; method ${landCover.provenance.method.id}@${landCover.provenance.method.version}). ${landCover.value.limitations.join(" ")}`,
        landCover.value.comparedPoints,
        10,
        NOT_QUANTIFIED,
        lulcProvenance,
      ),
    );
    const activeLulcClasses = (Object.keys(IO_CLASS_LABELS) as IoClass[]).filter((cls) =>
      landCover.value.years.some((y) => y.shares[cls] > 0),
    );
    for (const yr of landCover.value.years) {
      const yrPeriodId = `period_${String(yr.year)}_annual`;
      const yrValidShare = Number((1 - yr.noReadingShare).toFixed(4));
      const yrValidPixels = Math.round(yrValidShare * landCover.value.comparedPoints);
      for (const cls of activeLulcClasses) {
        const share = yr.shares[cls];
        measurements.push(
          makeMeasurement(
            `meas_lulc_${cls}_${slug}_${hash6}_${String(yr.year)}`,
            `landcover_share_${cls}`,
            share,
            "share of analysis cells (0 to 1)",
            yrPeriodId,
            `Share of 10 m sample points classified as ${IO_CLASS_LABELS[cls].toLowerCase()} in ${String(yr.year)} across ${placeName} (${lulcTitle}, ${lulcLicense}; method ${landCover.provenance.method.id}@${landCover.provenance.method.version}).`,
            yrValidPixels,
            10,
            NOT_QUANTIFIED,
            lulcProvenance,
            landCover.value.comparedPoints,
            yrValidShare,
          ),
        );
      }
    }
    for (const tr of landCover.value.transitions.slice(0, 6)) {
      measurements.push(
        makeMeasurement(
          `meas_lulc_tr_${tr.from}_${tr.to}_${slug}_${hash6}`,
          `landcover_transition_${tr.from}_to_${tr.to}`,
          tr.share,
          "share of analysis cells (0 to 1)",
          lulcPeriodId,
          `Share of 10 m sample points classified as ${IO_CLASS_LABELS[tr.from].toLowerCase()} in ${String(landCover.value.firstYear)} and ${IO_CLASS_LABELS[tr.to].toLowerCase()} in ${String(landCover.value.lastYear)} across ${placeName} (${lulcTitle}, ${lulcLicense}; method ${landCover.provenance.method.id}@${landCover.provenance.method.version}). ${landCover.value.limitations[0] ?? ""}`,
          landCover.value.comparedPoints,
          10,
          NOT_QUANTIFIED,
          lulcProvenance,
        ),
      );
    }
  } else {
    measurements.push(
      makeNotMeasured(
        mLulcChangedId,
        "landcover_changed_share",
        "share of analysis cells (0 to 1)",
        lulcPeriodId,
        `Share of 10 m sample points whose Impact Observatory annual land-cover class differed between 2017 and 2023 across ${placeName}: not measured.`,
        describeLandCoverMissing(landCover),
      ),
    );
  }

  const lulcEvidence: Evidence[] = lulcMeasured
    ? [
        Evidence.parse({
          recordType: "Evidence",
          id: `ev_lulc_${slug}_${hash6}`,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          caseId,
          statement: (() => {
            const lastYr = landCover.value.years[landCover.value.years.length - 1];
            const topClasses = lastYr
              ? (Object.entries(lastYr.shares) as [IoClass, number][])
                  .filter(([, s]) => s >= 0.01)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([k, s]) => `${IO_CLASS_LABELS[k].toLowerCase()} ${(s * 100).toFixed(1)}%`)
                  .join(", ")
              : "no dominant class";
            const topTr = landCover.value.transitions[0];
            const trWords = topTr
              ? `largest mapped class difference ${IO_CLASS_LABELS[topTr.from].toLowerCase()} to ${IO_CLASS_LABELS[topTr.to].toLowerCase()} (${(topTr.share * 100).toFixed(1)}% of points)`
              : "no class transition between the endpoint maps";
            return `Impact Observatory 10 m annual land cover (${String(landCover.value.firstYear)} to ${String(landCover.value.lastYear)}) across ${placeName}: ${String(landCover.value.lastYear)} shares ${topClasses}; ${trWords}.`;
          })(),
          claimKind: "observation",
          status: "accepted",
          geoSelectionId: geoId,
          periodIds: [lulcPeriodId],
          measurementIds: [mLulcChangedId],
          provenance: lulcProvenance,
          interpretation: null,
          uncertainty:
            landCover.value.limitations[0] ??
            "Each year is a composite of model predictions from Sentinel-2 imagery; a class change between two years can be a difference in classification rather than a change on the ground.",
          reviewDecisionIds: [],
        }),
      ]
    : [];

  const dataBundle = DataBundle.parse({
    recordType: "DataBundle",
    id: bundleId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    label: `Rainfall series (${climate.source.window}) and relief for ${placeName}`,
    status: "validated",
    datasetId: "Open-Meteo Historical Weather API (ERA5) & AWS Terrain Tiles (Terrarium)",
    datasetVersion: "2024.12",
    sourceIds: [
      ...sources.slice(0, 2).map((s) => s.id),
      ...(vegMeasured ? [modisSource.id] : []),
      ...(lulcMeasured ? [lulcSource.id] : []),
    ],
    geoSelectionId: geoId,
    geoRevision: 1,
    periodIds,
    methodId: LIVE_PIPELINE.methodId,
    methodVersion: LIVE_PIPELINE.version,
    manifestUri: `/api/terrain/${caseId}`,
    // a hash of what the bundle holds, so an unchanged rebuild hashes the same
    contentHash: `1220${createHash("sha256")
      .update(JSON.stringify(measurements.map((m) => [m.id, m.status, m.value, m.unit])))
      .digest("hex")}`,
    license: "CC BY 4.0",
    attribution: [
      "Elevation: AWS Terrain Tiles (Tilezen Terrarium), sources as listed in tilezen/joerd docs/attribution.md",
      "Open-Meteo Historical Weather API, ERA5 reanalysis (CC BY 4.0)",
      ...(vegMeasured ? [modisAttribution] : []),
      ...(lulcMeasured ? [lulcAttribution] : []),
      "OpenStreetMap contributors (ODbL 1.0)",
    ].join("; "),
    provenance: bundleProvenance,
  });

  const outletFeatureId = `ctx_outlet_${slug}_${hash6}`;
  const settlementFeatureId = `ctx_place_${slug}_${hash6}`;
  const transectFeatureId = `ctx_transect_${slug}_${hash6}`;
  const ctxBase = {
    recordType: "ContextFeature" as const,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    crs: "EPSG:4326" as const,
    sourceIds: sources[0] ? [sources[0].id] : [],
  };

  const contextFeatures: ContextFeature[] = [
    ContextFeature.parse({
      ...ctxBase,
      id: outletFeatureId,
      name: "Catchment outlet",
      role: "outlet",
      geometry: { type: "Point", coordinates: [lon, lat] },
      method: `Watershed pour point and coordinate anchor (${lat.toFixed(4)}°, ${lon.toFixed(4)}°) for ${placeName}.`,
      datasetId: "AWS Terrain Tiles (Terrarium); OpenStreetMap contributors",
      attribution:
        "AWS Terrain Tiles (Tilezen Terrarium); outlet input © OpenStreetMap contributors",
      license: "Terrain Tiles source licences (tilezen/joerd); ODbL-1.0",
      limitations: [
        "Hydrological analysis pour point on the DEM grid; not a surveyed stream gauge.",
      ],
    }),
    ContextFeature.parse({
      ...ctxBase,
      id: settlementFeatureId,
      name: placeName,
      role: "settlement",
      geometry: { type: "Point", coordinates: [lon, lat] },
      method: `Gazetteer and OpenStreetMap reference location for ${placeName} (${regionName}).`,
      datasetId: "OpenStreetMap / Nominatim Gazetteer",
      attribution: "OpenStreetMap contributors, ODbL 1.0",
      license: "ODbL-1.0",
      limitations: [
        "Reference point for orientation and labels only; not an administrative boundary.",
      ],
    }),
    ContextFeature.parse({
      ...ctxBase,
      id: transectFeatureId,
      name: `${placeName} elevation transect`,
      role: "transect",
      geometry: {
        type: "LineString",
        coordinates: [
          [bbox[0] + (bbox[2] - bbox[0]) * 0.2, bbox[1] + (bbox[3] - bbox[1]) * 0.2],
          [lon, lat],
          [bbox[0] + (bbox[2] - bbox[0]) * 0.8, bbox[1] + (bbox[3] - bbox[1]) * 0.8],
        ],
      },
      method: `Cross-valley elevation profile across ${placeName} (${terrain.minElevationM.toFixed(0)} m to ${terrain.maxElevationM.toFixed(0)} m).`,
      datasetId: "AWS Terrain Tiles (Terrarium)",
      attribution: "AWS Terrain Tiles (Tilezen Terrarium)",
      license: "Terrain Tiles source licences (tilezen/joerd)",
      limitations: ["Analytical cross-section profile across the DEM grid."],
    }),
  ];

  const {
    question,
    unresolvedQuestions,
    evidence: baseEvidence,
    evStudyId,
  } = synthesizePlaceQuestionAndEvidence({
    caseId,
    slug,
    hash6,
    placeName,
    regionName,
    userQuestion: input.question,
    now,
    geoId,
    periodIds,
    measurementIds: {
      catchmentTrendId: mCatchmentTrendId,
      precipTrendId: mPrecipTrendId,
      rainR2Id: mRainR2Id,
    },
    recordProvenance,
    terrain,
    climate,
    vegetation,
    sources,
  });

  const evidence = [
    ...baseEvidence,
    ...lulcEvidence,
    ...satRecords.evidence,
    ...regionalCtx.contextEvidence,
    ...govPolicy.evidence,
    ...bioCtx.evidence,
  ];

  const specProv: Provenance = {
    sourceLocators: [],
    dataBundleIds: [bundleId],
    methodId: "instrument_composer",
    methodVersion: "1.0.0",
    inputVersions: [
      { entityId: geoId, revision: 1 },
      { entityId: bundleId, revision: 1 },
    ],
    generatedByTaskId: null,
    generatedAt: now,
    verificationStatus: "computed_checked",
    limitations: ["Composed from live watershed ingestion records."],
  };

  const fdrCitations = [mCatchmentTrendId, mFdrUpId, mFdrDownId];
  const signedRain = rainTrendText(climate);
  const specBase = {
    recordType: "InstrumentSpec" as const,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    status: "ready" as const,
    provenance: specProv,
  };

  const instruments: InstrumentSpec[] = [
    InstrumentSpec.parse({
      ...specBase,
      id: `inst_layers_${slug}_${hash6}`,
      parameters: {
        kind: "layer_stack",
        geoSelectionId: geoId,
        relief: { bundleId, assetKey: "relief_grid" },
        layers: [
          {
            layer: "vegetation_trend",
            data: { bundleId, assetKey: "vegetation_trend" },
          },
          { layer: "rainfall", data: { bundleId, assetKey: "rainfall_cells" } },
        ],
        drainageFeatureIds: [],
        placeFeatureIds: [settlementFeatureId],
        selectedLayer: "vegetation_trend",
      },
      caption:
        vegMeasured && vegetation.value.areaTrend
          ? {
              ink: `Growing-season NDVI trend ${vegetation.value.areaTrend.perDecade >= 0 ? "+" : ""}${vegetation.value.areaTrend.perDecade.toFixed(4)} per decade across ${placeName} (2000 to 2024, ${vegWindowLabel}).`,
              grey: `${modisTitle}, ${String(vegetation.value.areaTrend.seasonsUsed)} seasons; upward FDR ${((vegetation.value.pixelShares?.fdrUpward ?? 0) * 100).toFixed(1)}%, downward FDR ${((vegetation.value.pixelShares?.fdrDownward ?? 0) * 100).toFixed(1)}% (${String(vegetation.value.pixelShares?.pixelsTested ?? vegetation.value.analysisPixels)} of ${String(vegetation.value.analysisPixels)} pixels).`.slice(
                0,
                240,
              ),
              claimKind: "observation",
              citationIds: fdrCitations,
            }
          : {
              ink: `Vegetation trend across ${placeName}: ${vegMeasured ? `withheld (${vegetation.value.areaTrendWithheld ?? "too few growing seasons"})` : "not measured"}.`,
              grey: (vegMeasured
                ? `${modisTitle} (${vegWindowLabel}, reference years ${vegetation.value.window.referenceYears.join(", ")}).`
                : vegetationMissing
              ).slice(0, 240),
              claimKind: "field_requirement",
              citationIds: fdrCitations,
            },
    }),
    InstrumentSpec.parse({
      ...specBase,
      id: `inst_section_${slug}_${hash6}`,
      parameters: {
        kind: "cross_section",
        geoSelectionId: geoId,
        transectFeatureId,
        relief: { bundleId, assetKey: "relief_grid" },
        profile: { bundleId, assetKey: "transect_profile" },
        bands: { bundleId, assetKey: "elevation_bands" },
        bandTrends: { bundleId, assetKey: "band_trends" },
        snow: { bundleId, assetKey: "snow_bands" },
        drainageFeatureIds: [],
        placeFeatureIds: [settlementFeatureId],
        statements: [
          {
            evidenceId: evStudyId,
            placement: "valley_floor",
            display: {
              text: (evidence[0]?.statement ?? "").slice(0, 195),
              evidenceIds: [evStudyId],
            },
          },
        ],
      },
      caption: {
        ink: `Vegetation trend below ${bandLimitM.toLocaleString("en")} m: not measured.`,
        grey: `Elevation range ${terrain.minElevationM.toFixed(0)} m to ${terrain.maxElevationM.toFixed(0)} m across ${placeName}, from the terrain elevation grid.`,
        claimKind: "field_requirement",
        citationIds: [mBandTrendId, mBandLimitId],
      },
    }),
    InstrumentSpec.parse({
      ...specBase,
      id: `inst_rain_${slug}_${hash6}`,
      parameters: {
        kind: "rainfall_scatter",
        geoSelectionId: geoId,
        seasons: { bundleId, assetKey: "rain_seasons" },
        fit: { bundleId, assetKey: "rain_fit" },
      },
      caption: {
        ink:
          signedRain === null
            ? "Annual rainfall: not measured; how much of vegetation change it explains: not measured."
            : `Annual rainfall trend ${signedRain} mm per decade; how much of vegetation change it explains is not measured.`,
        grey: (signedRain === null
          ? (climate.unavailableReason ?? "Rainfall is not measured.")
          : `${climate.source.label}, ${String(climate.years.length)} calendar years (${climate.source.window}).`
        ).slice(0, 240),
        claimKind: "model_estimate",
        citationIds: [mRainR2Id, mPrecipTrendId],
      },
    }),
  ].map((spec) =>
    // each spec cites every record it names (INST-01), all at their first revision here
    InstrumentSpec.parse({
      ...spec,
      provenance: {
        ...spec.provenance,
        inputVersions: [
          ...new Map(
            [
              ...spec.provenance.inputVersions,
              ...instrumentReferencedIds(spec).map((entityId) => ({ entityId, revision: 1 })),
            ].map((v) => [v.entityId, v] as const),
          ).values(),
        ],
      },
    }),
  );

  // allowModel false never reaches the model, whatever key the environment or keychain holds
  const llmResult =
    input.allowModel === false
      ? null
      : await reasonOverCaseWithLlm({
          placeName,
          regionName,
          lon,
          lat,
          minElevationM: terrain.minElevationM,
          maxElevationM: terrain.maxElevationM,
          areaKm2,
          climate,
          sources,
          question,
        });

  const synth = synthesizeLiveCaseSnapshot({
    caseId,
    slug,
    hash6,
    placeName,
    regionName,
    question,
    now,
    geoId,
    bundleId,
    periodIds,
    bandLimitM,
    terrain,
    climate,
    sources,
    evidence,
    measurementIds: {
      catchmentTrendId: mCatchmentTrendId,
      precipTrendId: mPrecipTrendId,
      rainR2Id: mRainR2Id,
      fdrUpId: mFdrUpId,
      fdrDownId: mFdrDownId,
      bandTrendId: mBandTrendId,
      bandLimitId: mBandLimitId,
    },
    llmResult,
  });

  const mode = process.env["SITERRA_LIVE_APPROVED"] === "gate01-passed" ? "live" : "concept";
  const caseRecord = EnvironmentalCase.parse({
    recordType: "EnvironmentalCase",
    id: caseId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    title: `Land and water of ${placeName}`,
    objective: question,
    place: { name: placeName, region: regionName },
    status: "draft",
    mode,
    ownerScopeId,
    activeGeoSelectionId: geoId,
    currentBriefId: synth.brief.id,
    unresolvedQuestions,
    permissionProfile: "research_and_preparation_only",
    description: `Live-ingested environmental case for ${placeName} (${regionName}), centered at ${lat.toFixed(4)}°, ${lon.toFixed(4)}° (${outline.label}, ${areaKm2.toFixed(1)} km²).`,
  });

  const speciesBundleId = `bnd_species_${slug}_${hash6}`;
  const speciesBundle = bioCtx.occurrencesPayload
    ? DataBundle.parse({
        recordType: "DataBundle",
        id: speciesBundleId,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        caseId,
        label: `GBIF Georeferenced Species Occurrences for ${placeName}`,
        status: "validated",
        datasetId: "GBIF Occurrence Download API",
        datasetVersion: now.slice(0, 10),
        sourceIds: bioCtx.sources[0] ? [bioCtx.sources[0].id] : sources[0] ? [sources[0].id] : [],
        geoSelectionId: geoId,
        geoRevision: 1,
        periodIds: [],
        methodId: "species_occurrences",
        methodVersion: "1.0.0",
        manifestUri: `/api/cases/${caseId}/bundles/${speciesBundleId}/assets/occurrences`,
        contentHash: `sha256:${createHash("sha256")
          .update(JSON.stringify(bioCtx.occurrencesPayload))
          .digest("hex")}`,
        license: "CC BY 4.0",
        attribution: "Global Biodiversity Information Facility (GBIF) Data Publishers (CC BY 4.0)",
        provenance: bundleProvenance,
      })
    : null;

  const seed: CaseSeedRecords = {
    caseRecord,
    geoSelections: [geoSelection],
    sources: [...sources],
    bundles: [
      { dataBundle, temporalObservations, measurements },
      ...(speciesBundle
        ? [{ dataBundle: speciesBundle, temporalObservations: [], measurements: [] }]
        : []),
    ],
    contextFeatures,
    evidence,
    instruments,
  };

  const noLand = terrain.outline?.kind === "box" && terrain.outline.fallback === "no_land";
  return {
    outcome: { caseId, placeName, regionName, question, outlet: [lon, lat], bbox },
    seed,
    synth,
    rainUnavailable,
    noLand,
    terrainVersion: terrain.version,
    occurrences: bioCtx.occurrencesPayload ?? null,
  };
}
