import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { EnvironmentalCase } from "@siterra/contracts";
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
import { buildLiveSourcesAndBundle } from "./ingest-bundle-builder.ts";
import { buildLiveContextAndInstruments } from "./ingest-instruments-builder.ts";
import {
  type CachedPlaceBundle,
  type IngestPlaceInput,
  type IngestPlaceOutcome,
  LIVE_PIPELINE,
  type LiveCaseBuild,
  type OutlineDescription,
  PLACE_CACHE_VERSION,
  describeOutline,
  deterministicCaseId,
  placeCachePath,
} from "./ingest-outline.ts";
import { LANDCOVER_METHOD, fetchLandCoverChange } from "./landcover-change.ts";
import { fetchOpenAlexSources, synthesizePlaceQuestionAndEvidence } from "./literature.ts";
import { cachedLive, liveCacheKey } from "./live-cache.ts";
import { reasonOverCaseWithLlm } from "./llm-reasoner.ts";
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
  type CachedPlaceBundle,
  type ClimateYearRow,
  type HistoricalClimateSummary,
  type IngestPlaceInput,
  type IngestPlaceOutcome,
  LIVE_PIPELINE,
  type LiveCaseBuild,
  type OutlineDescription,
  PLACE_CACHE_VERSION,
  type TerrainFile,
  bboxAround,
  buildTerrainForBbox,
  describeOutline,
  deterministicCaseId,
  placeCachePath,
  polygonAreaM2,
  readOrBuildTerrain,
  terrainCachePath,
};

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
  const bundleId = `bundle_loc_${slug}_${hash6}`;

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

  const outline = describeOutline(terrain, placeName, lon, lat);
  const { areaKm2 } = outline;

  const {
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
    measurementIds,
  } = buildLiveSourcesAndBundle({
    caseId,
    slug,
    hash6,
    placeName,
    lon,
    lat,
    now,
    geoId,
    bundleId,
    outline,
    terrain,
    climate,
    vegetation,
    landCover,
    oaSources,
    satSources: satRecords.sources,
    regionalSources: regionalCtx.contextSources,
    govSources: govPolicy.sources,
    bioSources: bioCtx.sources,
  });

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
      catchmentTrendId: measurementIds.catchmentTrendId,
      precipTrendId: measurementIds.precipTrendId,
      rainR2Id: measurementIds.rainR2Id,
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
    measurementIds,
    llmResult,
  });

  const { contextFeatures, instruments, caseRecord, speciesBundle } =
    buildLiveContextAndInstruments({
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
      briefId: synth.brief.id,
      occurrencesPayload: bioCtx.occurrencesPayload,
      bioSources: bioCtx.sources,
    });

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
