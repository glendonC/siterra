import { createHash } from "node:crypto";
import { Evidence, GeoSelection, type Measurement, type Provenance, Source } from "@siterra/contracts";
import type { HistoricalClimateSummary } from "./climate-series.ts";
import { LIVE_PIPELINE, type OutlineDescription } from "./ingest-outline.ts";
import { IO_CLASS_LABELS, type IoClass, LANDCOVER_METHOD, type LandCoverChange } from "./landcover-change.ts";
import { type LiveResult, type MissingValue, liveSource } from "./planetary.ts";
import { VEGETATION_METHOD, type VegetationSeries } from "./vegetation-series.ts";

const MONTH_SHORT: Record<number, string> = {
  1: "jan", 2: "feb", 3: "mar", 4: "apr", 5: "may", 6: "jun",
  7: "jul", 8: "aug", 9: "sep", 10: "oct", 11: "nov", 12: "dec",
};

export function growingPeriodId(months: readonly number[]): string {
  const first = months[0];
  const last = months[months.length - 1];
  const a = first !== undefined ? MONTH_SHORT[first] : undefined;
  const b = last !== undefined ? MONTH_SHORT[last] : undefined;
  return a && b ? `period_2000-2024_${a}_${b}` : "period_2000-2024_mar_jun";
}

export function describeVegetationMissing(res: MissingValue, fallback: string): string {
  const spec = liveSource(res.source);
  const title = spec?.title ?? "MODIS Terra MOD13Q1 v6.1";
  if (res.reason === "timeout") {
    return `Not measured: ${title} passed the 20 s limit (${res.detail})`;
  }
  return `Not measured: ${title} was not retrieved (${res.reason}: ${res.detail}). ${fallback}`;
}

export function describeLandCoverMissing(res: MissingValue): string {
  const spec = liveSource(res.source);
  const title = spec?.title ?? "Impact Observatory 10 m annual LULC v02";
  if (res.reason === "timeout") {
    return `Not measured: ${title} passed the 20 s limit (${res.detail})`;
  }
  return `Not measured: ${title} was not retrieved (${res.reason}: ${res.detail}).`;
}

export const NOT_QUANTIFIED = {
  kind: "not_quantified" as const,
  lower: null,
  upper: null,
  level: null,
  method: null,
};

export interface LiveSourcesAndProvenance {
  sources: Source[];
  modisSource: Source;
  lulcSource: Source;
  modisTitle: string;
  modisAttribution: string;
  lulcTitle: string;
  lulcLicense: string;
  lulcAttribution: string;
  vegMeasured: boolean;
  lulcMeasured: boolean;
  rainUnavailable: boolean;
  vegetationMissing: string;
  vegWindowLabel: string;
  geoSelection: GeoSelection;
  bundleProvenance: Provenance;
  recordProvenance: Provenance;
  rainProvenance: Provenance;
  demProvenance: Provenance;
  notMeasuredProvenance: Provenance;
  vegProvenance: Provenance;
  lulcProvenance: Provenance;
}

export function buildLiveSourcesAndProvenance(params: {
  caseId: string; slug: string; hash6: string; placeName: string;
  lon: number; lat: number; now: string; geoId: string; bundleId: string;
  outline: OutlineDescription; climate: HistoricalClimateSummary;
  vegetation: LiveResult<VegetationSeries>; landCover: LiveResult<LandCoverChange>;
  oaSources: readonly Source[]; satSources: readonly Source[];
  regionalSources: readonly Source[]; govSources: readonly Source[]; bioSources: readonly Source[];
}): LiveSourcesAndProvenance {
  const {
    caseId, slug, hash6, placeName, lon, lat, now, geoId, bundleId,
    outline, climate, vegetation, landCover,
    oaSources, satSources, regionalSources, govSources, bioSources,
  } = params;

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
  const satSourceIds = new Set(satSources.map((s) => s.id));
  const sources = [
    ...datasetSources.filter((s) => !satSourceIds.has(s.id)),
    modisSource,
    lulcSource,
    ...satSources,
    ...regionalSources,
    ...govSources,
    ...bioSources,
  ];

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
    areaM2: outline.areaM2,
    areaMethod: outline.areaMethod,
    limitations: outline.limitations,
  });

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
      ? [{ sourceId: demSourceId, locator: "terrain elevation grid for the analysis box", excerpt: null }]
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

  return {
    sources, modisSource, lulcSource, modisTitle, modisAttribution,
    lulcTitle, lulcLicense, lulcAttribution, vegMeasured, lulcMeasured,
    rainUnavailable, vegetationMissing, vegWindowLabel, geoSelection,
    bundleProvenance, recordProvenance, rainProvenance, demProvenance,
    notMeasuredProvenance, vegProvenance, lulcProvenance,
  };
}

export function buildLulcMeasurementsAndEvidence(params: {
  caseId: string;
  slug: string;
  hash6: string;
  placeName: string;
  now: string;
  geoId: string;
  landCover: LiveResult<LandCoverChange>;
  lulcMeasured: boolean;
  lulcTitle: string;
  lulcLicense: string;
  lulcProvenance: Provenance;
  makeMeasurement: (
    id: string,
    metric: string,
    value: number,
    unit: string,
    periodId: string,
    aggregation: string,
    validPixelCount: number | null,
    spatialResolutionM: number | null,
    uncertainty?: Measurement["uncertainty"],
    provenance?: Provenance,
    totalPixelCount?: number | null,
    validFraction?: number | null,
  ) => Measurement;
  makeNotMeasured: (
    id: string,
    metric: string,
    unit: string,
    periodId: string,
    aggregation: string,
    missingReason?: string,
  ) => Measurement;
}): { lulcMeasurements: Measurement[]; lulcEvidence: Evidence[] } {
  const {
    caseId, slug, hash6, placeName, now, geoId, landCover, lulcMeasured,
    lulcTitle, lulcLicense, lulcProvenance, makeMeasurement, makeNotMeasured,
  } = params;

  const lulcMeasurements: Measurement[] = [];
  const lulcPeriodId =
    lulcMeasured && landCover.status === "measured"
      ? `period_${String(landCover.value.firstYear)}-${String(landCover.value.lastYear)}_annual`
      : "period_2017-2023_annual";
  const mLulcChangedId = `meas_lulc_change_${slug}_${hash6}`;

  if (lulcMeasured && landCover.status === "measured") {
    lulcMeasurements.push(
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
        lulcMeasurements.push(
          makeMeasurement(
            `meas_lulc_${cls}_${slug}_${hash6}_${String(yr.year)}`,
            `landcover_share_${cls}`,
            yr.shares[cls],
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
      lulcMeasurements.push(
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
  } else if (landCover.status === "missing") {
    lulcMeasurements.push(
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

  const lulcEvidence: Evidence[] =
    lulcMeasured && landCover.status === "measured"
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

  return { lulcMeasurements, lulcEvidence };
}
