import { createHash } from "node:crypto";
import {
  ContextFeature,
  DataBundle,
  EnvironmentalCase,
  type Evidence,
  InstrumentSpec,
  type Provenance,
  type Source,
} from "@siterra/contracts";
import { instrumentReferencedIds } from "@siterra/domain";
import { type HistoricalClimateSummary, rainTrendText } from "./climate-series.ts";
import type { OutlineDescription } from "./ingest-outline.ts";
import type { LiveResult } from "./planetary.ts";
import type { TerrainFile } from "./terrain-builder.ts";
import type { VegetationSeries } from "./vegetation-series.ts";

export interface LiveContextAndInstrumentsResult {
  contextFeatures: ContextFeature[];
  instruments: InstrumentSpec[];
  caseRecord: EnvironmentalCase;
  speciesBundle: DataBundle | null;
}

export function buildLiveContextAndInstruments(params: {
  caseId: string;
  slug: string;
  hash6: string;
  placeName: string;
  regionName: string;
  lon: number;
  lat: number;
  bbox: [number, number, number, number];
  now: string;
  geoId: string;
  bundleId: string;
  bandLimitM: number;
  outline: OutlineDescription;
  terrain: TerrainFile;
  climate: HistoricalClimateSummary;
  vegetation: LiveResult<VegetationSeries>;
  vegMeasured: boolean;
  vegWindowLabel: string;
  modisTitle: string;
  vegetationMissing: string;
  sources: readonly Source[];
  evidence: readonly Evidence[];
  evStudyId: string;
  measurementIds: {
    catchmentTrendId: string;
    precipTrendId: string;
    rainR2Id: string;
    fdrUpId: string;
    fdrDownId: string;
    bandTrendId: string;
    bandLimitId: string;
  };
  bundleProvenance: Provenance;
  ownerScopeId: string;
  question: string;
  unresolvedQuestions: string[];
  briefId: string;
  occurrencesPayload: Record<string, unknown> | undefined;
  bioSources: readonly Source[];
}): LiveContextAndInstrumentsResult {
  const {
    caseId,
    slug,
    hash6,
    placeName,
    regionName,
    lon,
    lat,
    bbox,
    now,
    geoId,
    bundleId,
    bandLimitM,
    outline,
    terrain,
    climate,
    vegetation,
    vegMeasured,
    vegWindowLabel,
    modisTitle,
    vegetationMissing,
    sources,
    evidence,
    evStudyId,
    measurementIds,
    bundleProvenance,
    ownerScopeId,
    question,
    unresolvedQuestions,
    briefId,
    occurrencesPayload,
    bioSources,
  } = params;

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

  const fdrCitations = [
    measurementIds.catchmentTrendId,
    measurementIds.fdrUpId,
    measurementIds.fdrDownId,
  ];
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
        vegMeasured && vegetation.status === "measured" && vegetation.value.areaTrend
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
              ink: `Vegetation trend across ${placeName}: ${vegMeasured && vegetation.status === "measured" ? `withheld (${vegetation.value.areaTrendWithheld ?? "too few growing seasons"})` : "not measured"}.`,
              grey: (vegMeasured && vegetation.status === "measured"
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
        citationIds: [measurementIds.bandTrendId, measurementIds.bandLimitId],
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
        citationIds: [measurementIds.rainR2Id, measurementIds.precipTrendId],
      },
    }),
  ].map((spec) =>
    // Each spec cites every record it names at its initial revision.
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
    currentBriefId: briefId,
    unresolvedQuestions,
    permissionProfile: "research_and_preparation_only",
    description: `Live-ingested environmental case for ${placeName} (${regionName}), centered at ${lat.toFixed(4)}°, ${lon.toFixed(4)}° (${outline.label}, ${outline.areaKm2.toFixed(1)} km²).`,
  });

  const speciesBundleId = `bnd_species_${slug}_${hash6}`;
  const speciesBundle = occurrencesPayload
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
        sourceIds: bioSources[0] ? [bioSources[0].id] : sources[0] ? [sources[0].id] : [],
        geoSelectionId: geoId,
        geoRevision: 1,
        periodIds: [],
        methodId: "species_occurrences",
        methodVersion: "1.0.0",
        manifestUri: `/api/cases/${caseId}/bundles/${speciesBundleId}/assets/occurrences`,
        contentHash: `sha256:${createHash("sha256")
          .update(JSON.stringify(occurrencesPayload))
          .digest("hex")}`,
        license: "CC BY 4.0",
        attribution: "Global Biodiversity Information Facility (GBIF) Data Publishers (CC BY 4.0)",
        provenance: bundleProvenance,
      })
    : null;

  return {
    contextFeatures,
    instruments,
    caseRecord,
    speciesBundle,
  };
}
