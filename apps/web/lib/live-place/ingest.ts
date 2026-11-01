import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  ContextFeature,
  DataBundle,
  EnvironmentalCase,
  GeoSelection,
  InstrumentSpec,
  Measurement,
  type Provenance,
  TemporalObservation,
} from "@siterra/contracts";
import { type CaseSeedRecords, type Pool, loadSeedCase } from "@siterra/db";
import { formatCoordRegion, reverseGeocode } from "../../app/api/geocode/route.ts";
import { fetchBiodiversityContext } from "./biodiversity-fetcher.ts";
import {
  type AnnualClimateSummary,
  type ClimateYearRow,
  type HistoricalClimateSummary,
  fetchHistoricalClimate,
} from "./climate-series.ts";
import { fetchRegionalContextAndGovernance } from "./context-fetcher.ts";
import { fetchGovernmentPolicyAndOpenAccess } from "./government-policy-fetcher.ts";
import { fetchOpenAlexSources, synthesizePlaceQuestionAndEvidence } from "./literature.ts";
import { reasonOverCaseWithLlm } from "./llm-reasoner.ts";
import { buildSatelliteSourcesAndEvidence } from "./satellite-fetcher.ts";
import {
  type SynthesizedCasePackage,
  synthesizeLiveCaseSnapshot,
} from "./snapshot-synthesizer.ts";
import {
  type TerrainFile,
  bboxAround,
  buildTerrainForBbox,
  polygonAreaM2,
  readOrBuildTerrain,
  terrainCachePath,
} from "./terrain-builder.ts";

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

export interface CachedPlaceBundle {
  version: 1;
  outcome: Omit<IngestPlaceOutcome, "created">;
  seed: CaseSeedRecords;
  synth: SynthesizedCasePackage;
  occurrences?: Record<string, unknown>;
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

  const { caseId, slug, hash6 } = deterministicCaseId(lon, lat, placeName);
  const bbox = bboxAround(lon, lat);

  const existing = await pool.query<{ record: EnvironmentalCase }>(
    "select record from cases where id = $1",
    [caseId],
  );
  if ((existing.rowCount ?? 0) > 0 && existing.rows[0]) {
    await readOrBuildTerrain(caseId, bbox);
    const hasMerge = await pool.query(
      "select 1 from records where case_id = $1 and record_type = 'BranchMerge' limit 1",
      [caseId],
    );
    if ((hasMerge.rowCount ?? 0) === 0 && existsSync(placeCachePath(caseId))) {
      try {
        const cached = JSON.parse(readFileSync(placeCachePath(caseId), "utf8")) as CachedPlaceBundle;
        if (cached?.synth) {
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
      const cached = JSON.parse(readFileSync(cacheFile, "utf8")) as CachedPlaceBundle;
      if (cached?.version === 1 && cached.seed && cached.synth) {
        await readOrBuildTerrain(caseId, bbox);
        await loadSeedCase(pool, cached.seed, ownerScopeId);
        await persistSynthesizedPackage(pool, caseId, cached.synth);
        return { ...cached.outcome, created: true };
      }
    } catch {
      // Regenerate below if cache is stale or invalid
    }
  }

  const now = new Date().toISOString();
  const geoId = `geo_loc_${slug}_${hash6}`;
  const [terrain, climate, oaSources, regionalCtx, govPolicy, bioCtx] = await Promise.all([
    buildTerrainForBbox(bbox, caseId),
    fetchHistoricalClimate(lon, lat),
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

  const sources = [
    ...oaSources,
    ...satRecords.sources,
    ...regionalCtx.contextSources,
    ...govPolicy.sources,
    ...bioCtx.sources,
  ];
  const areaM2 = polygonAreaM2(terrain.catchmentRing);
  const areaKm2 = Number((areaM2 / 1e6).toFixed(1));

  const geoSelection = GeoSelection.parse({
    recordType: "GeoSelection",
    id: geoId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    label: `${placeName} catchment (hydrological analysis extent)`,
    geometryStatus: "analysis_ready",
    geometry: { type: "Polygon", coordinates: [terrain.catchmentRing] },
    crs: "EPSG:4326",
    boundaryRole: "hydrological_unit",
    boundarySourceIds: [sources[0]!.id],
    selectionMethod: `12 km × 12 km watershed relief delineation centered at ${lat.toFixed(4)}°, ${lon.toFixed(4)}° from Copernicus GLO-30 DEM and Open-Meteo Elevation Grid.`,
    areaM2,
    areaMethod: `Geodesic polygon area on WGS84 ellipsoid (${areaKm2.toFixed(1)} km²).`,
    limitations: [
      "Automated watershed boundary derived from 30 m / 90 m elevation grid; not a legal parcel or surveyed management boundary.",
    ],
  });

  const bundleId = `bundle_loc_${slug}_${hash6}`;
  const periodIds = climate.years.map((y) => `period_${String(y.year)}-06`);
  const contentHash = `1220${createHash("sha256").update(`${bundleId}:${now}`).digest("hex")}`;

  const bundleProvenance: Provenance = {
    sourceLocators: [],
    dataBundleIds: [],
    methodId: "open_meteo_era5_watershed_series",
    methodVersion: "1.0.0",
    inputVersions: [{ entityId: geoId, revision: 1 }],
    generatedByTaskId: null,
    generatedAt: now,
    verificationStatus: "computed_checked",
    limitations: [
      "Derived from ERA5 / Open-Meteo historical archive (2000–2024) and Copernicus DEM relief over the catchment.",
    ],
  };

  const recordProvenance: Provenance = {
    ...bundleProvenance,
    inputVersions: [
      { entityId: geoId, revision: 1 },
      { entityId: bundleId, revision: 1 },
    ],
  };

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
      totalPixelCount: validPixelCount,
      validFraction: validPixelCount !== null ? 1 : null,
      spatialResolutionM,
      uncertainty,
      provenance: recordProvenance,
    });

  const temporalObservations: TemporalObservation[] = [];
  const measurements: Measurement[] = [];

  for (const yrRow of climate.years) {
    const pId = `period_${String(yrRow.year)}-06`;
    const mPrecipId = `meas_precip_${slug}_${hash6}_${String(yrRow.year)}`;
    const mNdviId = `meas_ndvi_${slug}_${hash6}_${String(yrRow.year)}`;
    measurements.push(
      makeMeasurement(
        mPrecipId,
        "precipitation_annual_mm",
        yrRow.precipMm,
        "mm",
        pId,
        `Annual precipitation total (${String(yrRow.year)}) across ${placeName}.`,
        64,
        1000,
      ),
      makeMeasurement(
        mNdviId,
        "ndvi_growing_season_mean",
        yrRow.ndvi,
        "NDVI",
        pId,
        `Growing-season vegetation index (${String(yrRow.year)}) across ${placeName}.`,
        4096,
        250,
      ),
    );
    temporalObservations.push(
      TemporalObservation.parse({
        recordType: "TemporalObservation",
        id: `obs_loc_${slug}_${hash6}_${String(yrRow.year)}`,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        caseId,
        periodId: pId,
        startDate: `${String(yrRow.year)}-06-01`,
        endDateExclusive: `${String(yrRow.year)}-07-01`,
        seasonDefinition: `Annual growing season ${String(yrRow.year)} (UTC)`,
        geoSelectionId: geoId,
        geoRevision: 1,
        dataBundleId: bundleId,
        measurementIds: [mPrecipId, mNdviId],
        mapAssetUri: null,
        mapAssetHash: null,
        mapStatus: "missing",
        qualityFlags: [],
        provenance: recordProvenance,
      }),
    );
  }

  const summaryPeriodId = "period_2000-2024_mar_jun";
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

  measurements.push(
    makeMeasurement(
      mCatchmentTrendId,
      "ndvi_trend_unadjusted_per_decade",
      climate.ndviTrendPerDecade,
      "NDVI per decade",
      summaryPeriodId,
      `Ordinary least squares slope per decade of growing-season vegetation index across ${placeName} (2000–2024).`,
      4096,
      250,
      {
        kind: "interval",
        lower: climate.ndviLowerPerDecade,
        upper: climate.ndviUpperPerDecade,
        level: 0.95,
        method: "95% confidence interval of ordinary least squares linear trend (2000–2024).",
      },
    ),
    makeMeasurement(
      mPrecipTrendId,
      "precipitation_trend_mm_per_decade",
      climate.precipTrendMmPerDecade,
      "mm per decade",
      summaryPeriodId,
      "25-year linear trend in annual precipitation (mm per decade, 2000–2024) from Open-Meteo / ERA5 archive.",
      64,
      1000,
    ),
    makeMeasurement(
      mRainR2Id,
      "rainfall_fit_r_squared",
      climate.rSquared,
      "dimensionless (R squared)",
      summaryPeriodId,
      "R squared of linear fit between seasonal precipitation and vegetation productivity over 25 seasons (2000–2024).",
      null,
      null,
    ),
    makeMeasurement(
      mFdrUpId,
      "area_share_upward_fdr",
      climate.upwardFdrShare,
      "share of analysis cells (0 to 1)",
      summaryPeriodId,
      "Share of catchment cells with positive greening trend under FDR control (2000–2024).",
      4096,
      250,
    ),
    makeMeasurement(
      mFdrDownId,
      "area_share_downward_fdr",
      climate.downwardFdrShare,
      "share of analysis cells (0 to 1)",
      summaryPeriodId,
      "Share of catchment cells with downward browning trend under FDR control (2000–2024).",
      4096,
      250,
    ),
    makeMeasurement(
      mBandTrendId,
      "ndvi_trend_unadjusted_per_decade",
      climate.lowBandTrendPerDecade,
      "NDVI per decade",
      summaryPeriodId,
      `Valley-floor elevation band (< ${String(bandLimitM)} m) vegetation trend per decade (2000–2024).`,
      1365,
      250,
    ),
    makeMeasurement(
      mBandLimitId,
      "elevation_band_limit",
      bandLimitM,
      "m",
      summaryPeriodId,
      `Lower equal-area elevation band boundary (${String(bandLimitM)} m) from catchment DEM.`,
      null,
      30,
    ),
    makeMeasurement(
      mAreaKm2Id,
      "drainage_outlet_upstream_area",
      areaKm2,
      "km2",
      summaryPeriodId,
      `Geodesic upstream catchment area (${areaKm2.toFixed(1)} km²).`,
      null,
      30,
    ),
  );

  const dataBundle = DataBundle.parse({
    recordType: "DataBundle",
    id: bundleId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    label: `25-Year Historical Climate & Relief Synthesis for ${placeName} (2000–2024)`,
    status: "validated",
    datasetId: "ERA5 / Open-Meteo Historical Archive & Copernicus DEM GLO-30",
    datasetVersion: "2024.12",
    sourceIds: [sources[0]!.id, sources[1]!.id],
    geoSelectionId: geoId,
    geoRevision: 1,
    periodIds,
    methodId: "open_meteo_era5_watershed_series",
    methodVersion: "1.0.0",
    manifestUri: `/api/terrain/${caseId}`,
    contentHash,
    license: "CC BY 4.0",
    attribution:
      "Copernicus DEM GLO-30 © DLR e.V. / Airbus Defence and Space GmbH provided under COPERNICUS by the EU and ESA; ERA5 / Open-Meteo Historical Weather API (CC BY 4.0); OpenStreetMap contributors (ODbL 1.0)",
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
    sourceIds: [sources[0]!.id],
  };

  const contextFeatures: ContextFeature[] = [
    ContextFeature.parse({
      ...ctxBase,
      id: outletFeatureId,
      name: "Catchment outlet",
      role: "outlet",
      geometry: { type: "Point", coordinates: [lon, lat] },
      method: `Watershed pour point and coordinate anchor (${lat.toFixed(4)}°, ${lon.toFixed(4)}°) for ${placeName}.`,
      datasetId: "Copernicus DEM GLO-30; OpenStreetMap contributors",
      attribution: "Copernicus DEM GLO-30; outlet input © OpenStreetMap contributors",
      license: "Copernicus DEM licence; ODbL-1.0",
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
          [
            bbox[0] + (bbox[2] - bbox[0]) * 0.2,
            bbox[1] + (bbox[3] - bbox[1]) * 0.2,
          ],
          [lon, lat],
          [
            bbox[0] + (bbox[2] - bbox[0]) * 0.8,
            bbox[1] + (bbox[3] - bbox[1]) * 0.8,
          ],
        ],
      },
      method: `Cross-valley elevation profile across ${placeName} (${terrain.minElevationM.toFixed(0)} m to ${terrain.maxElevationM.toFixed(0)} m).`,
      datasetId: "Copernicus DEM GLO-30",
      attribution: "Copernicus DEM GLO-30",
      license: "CC BY 4.0",
      limitations: ["Analytical cross-section profile across the DEM grid."],
    }),
  ];

  const { question, unresolvedQuestions, evidence: baseEvidence, evStudyId } =
    synthesizePlaceQuestionAndEvidence({
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
      sources,
    });

  const evidence = [
    ...baseEvidence,
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

  const fdrCitations =
    climate.downwardFdrShare > climate.upwardFdrShare
      ? [mCatchmentTrendId, mFdrDownId, mFdrUpId]
      : [mCatchmentTrendId, mFdrUpId, mFdrDownId];
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
      caption: {
        ink: `Catchment trend of ${climate.ndviTrendPerDecade >= 0 ? "+" : ""}${climate.ndviTrendPerDecade.toFixed(4)} NDVI per decade across ${placeName}.`,
        grey: "25-year growing-season record (2000–2024) over the delineated watershed.",
        claimKind: "model_estimate",
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
              text: evidence[0]!.statement.slice(0, 195),
              evidenceIds: [evStudyId],
            },
          },
        ],
      },
      caption: {
        ink: `Valley floor below ${bandLimitM.toLocaleString("en")} m shifts at ${climate.lowBandTrendPerDecade >= 0 ? "+" : ""}${climate.lowBandTrendPerDecade.toFixed(4)} NDVI per decade.`,
        grey: `Elevation range ${terrain.minElevationM.toFixed(0)} m to ${terrain.maxElevationM.toFixed(0)} m across ${placeName}.`,
        claimKind: "model_estimate",
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
        ink: `Rainfall explains R² = ${climate.rSquared.toFixed(3)} of interannual variance (${climate.precipTrendMmPerDecade >= 0 ? "+" : ""}${climate.precipTrendMmPerDecade.toFixed(1)} mm/decade).`,
        grey: "25-year Open-Meteo / ERA5 precipitation record (2000–2024).",
        claimKind: "model_estimate",
        citationIds: [mRainR2Id, mPrecipTrendId],
      },
    }),
  ];

  const llmResult = await reasonOverCaseWithLlm({
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

  const mode =
    process.env["SITERRA_LIVE_APPROVED"] === "gate01-passed" ? "live" : "concept";
  const caseRecord = EnvironmentalCase.parse({
    recordType: "EnvironmentalCase",
    id: caseId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    title: `Watershed dynamics and land change in ${placeName}`,
    objective: question,
    place: { name: placeName, region: regionName },
    status: "draft",
    mode,
    ownerScopeId,
    activeGeoSelectionId: geoId,
    currentBriefId: synth.brief.id,
    unresolvedQuestions,
    permissionProfile: "research_and_preparation_only",
    description: `Live-ingested environmental case for ${placeName} (${regionName}), centered at ${lat.toFixed(4)}°, ${lon.toFixed(4)}° (${areaKm2.toFixed(1)} km² watershed extent).`,
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
        sourceIds: bioCtx.sources[0] ? [bioCtx.sources[0].id] : [sources[0]!.id],
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

  try {
    mkdirSync(dirname(cacheFile), { recursive: true });
    const cachedBundle: CachedPlaceBundle = {
      version: 1,
      outcome: {
        caseId,
        placeName,
        regionName,
        question,
        outlet: [lon, lat],
        bbox,
      },
      seed,
      synth,
      ...(bioCtx.occurrencesPayload ? { occurrences: bioCtx.occurrencesPayload } : {}),
    };
    writeFileSync(cacheFile, JSON.stringify(cachedBundle));
  } catch {
    // Non-fatal if cache write fails
  }

  try {
    await loadSeedCase(pool, seed, ownerScopeId);
    await persistSynthesizedPackage(pool, caseId, synth);
    return {
      caseId,
      created: true,
      placeName,
      regionName,
      question,
      outlet: [lon, lat],
      bbox,
    };
  } catch (err) {
    if (err instanceof Error && /already exists/i.test(err.message)) {
      await persistSynthesizedPackage(pool, caseId, synth);
      return {
        caseId,
        created: false,
        placeName,
        regionName,
        question,
        outlet: [lon, lat],
        bbox,
      };
    }
    throw err;
  }
}
