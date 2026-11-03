import { createHash } from "node:crypto";
import {
  DataBundle,
  type Evidence,
  type GeoSelection,
  Measurement,
  type Provenance,
  type Source,
  TemporalObservation,
} from "@siterra/contracts";
import {
  CLIMATE_END_YEAR,
  CLIMATE_START_YEAR,
  type HistoricalClimateSummary,
} from "./climate-series.ts";
import { LIVE_PIPELINE, type OutlineDescription } from "./ingest-outline.ts";
import {
  NOT_QUANTIFIED,
  buildLiveSourcesAndProvenance,
  buildLulcMeasurementsAndEvidence,
  growingPeriodId,
} from "./ingest-sources-builder.ts";
import type { LandCoverChange } from "./landcover-change.ts";
import type { LiveResult } from "./planetary.ts";
import type { TerrainFile } from "./terrain-builder.ts";
import type { VegetationSeries } from "./vegetation-series.ts";

export interface LiveSourcesAndBundleResult {
  sources: Source[];
  geoSelection: GeoSelection;
  dataBundle: DataBundle;
  temporalObservations: TemporalObservation[];
  measurements: Measurement[];
  lulcEvidence: Evidence[];
  periodIds: string[];
  bandLimitM: number;
  bundleProvenance: Provenance;
  recordProvenance: Provenance;
  vegetationMissing: string;
  vegWindowLabel: string;
  modisTitle: string;
  vegMeasured: boolean;
  rainUnavailable: boolean;
  measurementIds: {
    catchmentTrendId: string; precipTrendId: string; rainR2Id: string;
    fdrUpId: string; fdrDownId: string; bandTrendId: string; bandLimitId: string;
  };
}

export function buildLiveSourcesAndBundle(params: {
  caseId: string; slug: string; hash6: string; placeName: string;
  lon: number; lat: number; now: string; geoId: string; bundleId: string;
  outline: OutlineDescription; terrain: TerrainFile; climate: HistoricalClimateSummary;
  vegetation: LiveResult<VegetationSeries>; landCover: LiveResult<LandCoverChange>;
  oaSources: readonly Source[]; satSources: readonly Source[];
  regionalSources: readonly Source[]; govSources: readonly Source[]; bioSources: readonly Source[];
}): LiveSourcesAndBundleResult {
  const {
    caseId, slug, hash6, placeName, now, geoId, bundleId,
    outline, terrain, climate, vegetation, landCover,
  } = params;

  const {
    sources, modisSource, lulcSource, modisTitle, modisAttribution,
    lulcTitle, lulcLicense, lulcAttribution, vegMeasured, lulcMeasured,
    rainUnavailable, vegetationMissing, vegWindowLabel, geoSelection,
    bundleProvenance, recordProvenance, rainProvenance, demProvenance,
    notMeasuredProvenance, vegProvenance, lulcProvenance,
  } = buildLiveSourcesAndProvenance(params);

  const { areaKm2 } = outline;
  const climateSource = climate.source;

  // The record keeps one period per calendar year whether or not rainfall was retrieved for it
  const recordYears: number[] = [];
  for (let yr = CLIMATE_START_YEAR; yr <= CLIMATE_END_YEAR; yr++) recordYears.push(yr);
  const rainByYear = new Map(climate.years.map((y) => [y.year, y] as const));
  const vegByYear = new Map(
    vegMeasured && vegetation.status === "measured"
      ? vegetation.value.seasons.map((s) => [s.year, s] as const)
      : [],
  );
  const periodIds = recordYears.map((yr) => `period_${String(yr)}-06`);

  const makeMeasurement = (
    id: string, metric: string, value: number, unit: string, periodId: string,
    aggregation: string, validPixelCount: number | null, spatialResolutionM: number | null,
    uncertainty: Measurement["uncertainty"] = NOT_QUANTIFIED,
    provenance: Provenance = recordProvenance,
    totalPixelCount: number | null = validPixelCount,
    validFraction: number | null = validPixelCount !== null ? 1 : null,
  ): Measurement =>
    Measurement.parse({
      recordType: "Measurement", id, revision: 1, createdAt: now, updatedAt: now,
      caseId, metric, value, unit, status: "available", missingReason: null,
      geoSelectionId: geoId, geoRevision: 1, periodId, dataBundleId: bundleId,
      aggregation, validPixelCount, totalPixelCount, validFraction,
      spatialResolutionM, uncertainty, provenance,
    });

  // A value nobody measured: status missing, no number, and the reason stated
  const makeNotMeasured = (
    id: string, metric: string, unit: string, periodId: string,
    aggregation: string, missingReason: string = vegetationMissing,
  ): Measurement =>
    Measurement.parse({
      recordType: "Measurement", id, revision: 1, createdAt: now, updatedAt: now,
      caseId, metric, value: null, unit, status: "missing", missingReason,
      geoSelectionId: geoId, geoRevision: 1, periodId, dataBundleId: bundleId,
      aggregation, validPixelCount: null, totalPixelCount: null, validFraction: null,
      spatialResolutionM: null, uncertainty: NOT_QUANTIFIED,
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
    const ndviAggregation =
      vegMeasured && vegetation.status === "measured"
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
      vegMeasured && vegetation.status === "measured" && vegYr && vegYr.meanNdvi !== null
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
            vegMeasured && vegetation.status === "measured"
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

  const summaryPeriodId =
    vegMeasured && vegetation.status === "measured"
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

  const vegPixelsTested =
    vegMeasured && vegetation.status === "measured"
      ? (vegetation.value.pixelShares?.pixelsTested ?? null)
      : null;
  const vegTestedFraction =
    vegMeasured &&
    vegetation.status === "measured" &&
    vegPixelsTested !== null &&
    vegetation.value.analysisPixels > 0
      ? Number((vegPixelsTested / vegetation.value.analysisPixels).toFixed(4))
      : null;

  measurements.push(
    vegMeasured && vegetation.status === "measured" && vegetation.value.areaTrend
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
          vegMeasured && vegetation.status === "measured"
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
    vegMeasured && vegetation.status === "measured" && vegetation.value.pixelShares
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
    vegMeasured && vegetation.status === "measured" && vegetation.value.pixelShares
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

  const { lulcMeasurements, lulcEvidence } = buildLulcMeasurementsAndEvidence({
    caseId,
    slug,
    hash6,
    placeName,
    now,
    geoId,
    landCover,
    lulcMeasured,
    lulcTitle,
    lulcLicense,
    lulcProvenance,
    makeMeasurement,
    makeNotMeasured,
  });
  measurements.push(...lulcMeasurements);

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

  return {
    sources,
    geoSelection,
    dataBundle,
    temporalObservations,
    measurements,
    lulcEvidence,
    periodIds,
    bandLimitM,
    bundleProvenance,
    recordProvenance,
    vegetationMissing,
    vegWindowLabel,
    modisTitle,
    vegMeasured,
    rainUnavailable,
    measurementIds: {
      catchmentTrendId: mCatchmentTrendId,
      precipTrendId: mPrecipTrendId,
      rainR2Id: mRainR2Id,
      fdrUpId: mFdrUpId,
      fdrDownId: mFdrDownId,
      bandTrendId: mBandTrendId,
      bandLimitId: mBandLimitId,
    },
  };
}
