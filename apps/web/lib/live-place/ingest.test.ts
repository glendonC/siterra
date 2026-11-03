import type * as NodeFs from "node:fs";
import { readFileSync, writeFileSync } from "node:fs";
import type { CaseSeedRecords, Pool } from "@siterra/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as LandcoverMod from "./landcover-change.ts";
import {
  classesFromCrop,
  computeLandCoverChange,
  fetchLandCoverChange,
} from "./landcover-change.ts";
import { type Bbox, parseNpy } from "./planetary.ts";
import { buildTerrainForBbox } from "./terrain-builder.ts";
import type * as VegetationMod from "./vegetation-series.ts";
import {
  REFERENCE_YEARS,
  VEGETATION_LIMITATIONS,
  VEGETATION_METHOD,
  type VegetationSeries,
  fetchVegetationSeries,
} from "./vegetation-series.ts";

// The live record for New York, ingested with the network and database stubbed: Open-Meteo answers with a
// known daily archive, every other service is unreachable, and the seed handed to the database is captured.
const captured: { seed: CaseSeedRecords | null } = { seed: null };
// A place cache file the stubbed disk holds, or null for none
const disk: { placeCache: string | null } = { placeCache: null };

vi.mock("@siterra/db", () => ({
  loadSeedCase: vi.fn((_pool: unknown, seed: CaseSeedRecords) => {
    captured.seed = seed;
    return Promise.resolve();
  }),
}));
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof NodeFs>();
  const isPlaceCache = (path: unknown) => String(path).includes("/cache/places/");
  return {
    ...fs,
    existsSync: (path: string) => isPlaceCache(path) && disk.placeCache !== null,
    readFileSync: (...args: Parameters<typeof fs.readFileSync>) =>
      isPlaceCache(args[0]) ? (disk.placeCache ?? "") : fs.readFileSync(...args),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
  };
});
vi.mock("../../app/api/geocode/route.ts", () => ({
  reverseGeocode: vi.fn(),
  formatCoordRegion: vi.fn(),
}));
vi.mock("./terrain-builder.ts", () => ({
  bboxAround: (lon: number, lat: number) => [lon - 0.12, lat - 0.09, lon + 0.12, lat + 0.09],
  polygonAreaM2: () => 1.5e8,
  terrainCachePath: () => "/dev/null",
  readOrBuildTerrain: vi.fn(() => Promise.resolve({ version: 2 })),
  buildTerrainForBbox: vi.fn((bbox: number[]) =>
    Promise.resolve({
      version: 2,
      gridSize: 2,
      width: 2,
      height: 2,
      bbox,
      minElevationM: 0,
      maxElevationM: 120,
      elevations: [0, 40, 80, 120],
      catchmentRing: [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[1]],
        [bbox[2], bbox[3]],
        [bbox[0], bbox[1]],
      ],
      streamPaths: [],
      elevationSource: "terrarium_z12",
      outline: { kind: "land_within_box", areaKm2: 312.4 },
    }),
  ),
}));
vi.mock("./context-fetcher.ts", () => ({
  fetchRegionalContextAndGovernance: vi.fn(() =>
    Promise.resolve({ contextSources: [], contextEvidence: [] }),
  ),
}));
vi.mock("./government-policy-fetcher.ts", () => ({
  fetchGovernmentPolicyAndOpenAccess: vi.fn(() => Promise.resolve({ sources: [], evidence: [] })),
}));
vi.mock("./biodiversity-fetcher.ts", () => ({
  fetchBiodiversityContext: vi.fn(() =>
    Promise.resolve({
      speciesCount: 0,
      topSpecies: [],
      sources: [],
      evidence: [],
      biodiversitySources: [],
      biodiversityEvidence: [],
    }),
  ),
}));
vi.mock("./llm-reasoner.ts", () => ({ reasonOverCaseWithLlm: vi.fn(() => Promise.resolve(null)) }));
vi.mock("./vegetation-series.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof VegetationMod>()),
  fetchVegetationSeries: vi.fn(() =>
    Promise.resolve({
      status: "missing" as const,
      source: "modis-13Q1-061" as const,
      reason: "http_error" as const,
      detail: "STAC search returned HTTP 503.",
      elapsedMs: 1,
    }),
  ),
}));
vi.mock("./landcover-change.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof LandcoverMod>()),
  fetchLandCoverChange: vi.fn(() =>
    Promise.resolve({
      status: "missing" as const,
      source: "io-lulc-annual-v02" as const,
      reason: "http_error" as const,
      detail: "STAC search returned HTTP 503.",
      elapsedMs: 1,
    }),
  ),
}));

function dailyArchive() {
  const time: string[] = [];
  const precipitation_sum: number[] = [];
  const et0_fao_evapotranspiration: number[] = [];
  for (let d = Date.UTC(2000, 0, 1); d <= Date.UTC(2024, 11, 31); d += 86_400_000) {
    const date = new Date(d).toISOString().slice(0, 10);
    time.push(date);
    precipitation_sum.push(3 + (Number(date.slice(0, 4)) % 3) * 0.2);
    et0_fao_evapotranspiration.push(2);
  }
  return { time, precipitation_sum, et0_fao_evapotranspiration };
}

const pool = { query: vi.fn(() => Promise.resolve({ rowCount: 0, rows: [] })) } as unknown as Pool;

beforeEach(() => {
  captured.seed = null;
  disk.placeCache = null;
  vi.mocked(writeFileSync).mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL) =>
      Promise.resolve(
        String(url).startsWith("https://archive-api.open-meteo.com/")
          ? new Response(JSON.stringify({ daily: dailyArchive() }), { status: 200 })
          : new Response("unavailable", { status: 503 }),
      ),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** The smallest synthesized package the cache restore can persist. */
function cachedSynth() {
  const record = (recordType: string) => ({ id: `x_${recordType}`, revision: 1, recordType });
  return {
    task: record("Task"),
    fieldRequirementEvidence: [],
    hypotheses: [],
    explanationBranches: [],
    branchMerge: record("BranchMerge"),
    interventions: [],
    resourceRequirements: [],
    reviewDecisions: [],
    operationalAction: record("OperationalAction"),
    brief: record("Brief"),
  };
}

async function ingestNewYork() {
  const { ingestLocationCase } = await import("./ingest.ts");
  const outcome = await ingestLocationCase(
    pool,
    { lon: -74.00602, lat: 40.71273, placeName: "New York", regionName: "United States" },
    "seed",
  );
  const seed = captured.seed;
  if (!seed) throw new Error("no seed captured");
  const bundle = seed.bundles[0];
  if (!bundle) throw new Error("no bundle in the seed");
  return { outcome, seed, bundle };
}

describe("live record for New York", () => {
  it("records no vegetation value: every NDVI, fit and FDR measurement is missing with a reason", async () => {
    const { bundle } = await ingestNewYork();
    const vegetation = bundle.measurements.filter((m) => /ndvi|r_squared|fdr/.test(m.metric));
    expect(vegetation.length).toBeGreaterThan(25);
    for (const m of vegetation) {
      expect(m.status).toBe("missing");
      expect(m.value).toBeNull();
      expect(m.missingReason).toMatch(/Cannot measure vegetation change/);
    }
  });

  it("keeps the rainfall series and trend, each citing the Open-Meteo source and window", async () => {
    const { seed, bundle } = await ingestNewYork();
    const era5 = seed.sources.find((s) => s.id.startsWith("src_era5_"));
    const rain = bundle.measurements.filter((m) => m.metric.startsWith("precipitation_"));
    expect(rain).toHaveLength(26);
    for (const m of rain) {
      expect(m.status).toBe("available");
      expect(m.provenance.sourceLocators.map((l) => l.sourceId)).toEqual([era5?.id]);
      expect(m.provenance.limitations.join(" ")).toContain("Open-Meteo Historical Weather API");
      expect(m.provenance.limitations.join(" ")).toContain("2000 to 2024");
    }
    const trend = rain.find((m) => m.metric === "precipitation_trend_mm_per_decade");
    expect(trend?.uncertainty.kind).toBe("interval");
  });

  it("states no vegetation trend as observed in its evidence or captions", async () => {
    const { seed } = await ingestNewYork();
    const vegetationNumber = /[-+]?\d+\.\d+\s*(NDVI|per decade)/;
    for (const e of seed.evidence) {
      if (e.claimKind === "observation")
        expect(e.statement).not.toMatch(/vegetation|greenness|NDVI/i);
      expect(e.statement).not.toMatch(/[-+]?\d+\.\d+\s*NDVI/);
    }
    for (const spec of seed.instruments) {
      expect(spec.caption.ink).not.toMatch(/NDVI|R²/);
      if (/vegetation/i.test(spec.caption.ink)) expect(spec.caption.ink).toMatch(/not measured/);
      expect(spec.caption.ink.replace(/mm per decade/, "")).not.toMatch(vegetationNumber);
    }
  });

  it("records rainfall as missing with the stated reason when Open-Meteo does not answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("unavailable", { status: 503 }))),
    );
    const { seed, bundle } = await ingestNewYork();
    const rain = bundle.measurements.filter((m) => m.metric.startsWith("precipitation_"));
    expect(rain).toHaveLength(26);
    for (const m of rain) {
      expect(m.status).toBe("missing");
      expect(m.value).toBeNull();
      expect(m.missingReason).toMatch(/^Source unavailable: the Open-Meteo Historical Weather API/);
    }
    const era5 = seed.sources.find((s) => s.id.startsWith("src_era5_"));
    expect(era5?.accessStatus).toBe("unavailable");
    const climateEv = seed.evidence.find((e) => e.id.startsWith("ev_climate_"));
    expect(climateEv?.statement).toMatch(/^Source unavailable/);
    expect(climateEv?.statement).not.toMatch(/\d+\.\d+ mm per decade/);
    const rainCaption = seed.instruments.find((i) => i.parameters.kind === "rainfall_scatter");
    expect(rainCaption?.caption.ink).toMatch(/^Annual rainfall: not measured/);
    // not cached, so the next ingest asks the archive again
    const placeWrites = vi
      .mocked(writeFileSync)
      .mock.calls.filter((c) => String(c[0]).includes("/cache/places/"));
    expect(placeWrites).toEqual([]);
  });

  it("does not reuse a cached record built over another terrain version", async () => {
    const stale = await ingestNewYork();
    disk.placeCache = JSON.stringify({
      version: 2,
      terrainVersion: 0,
      outcome: { ...stale.outcome, placeName: "Stale New York" },
      seed: stale.seed,
      synth: cachedSynth(),
    });
    const fresh = await ingestNewYork();
    expect(fresh.outcome.placeName).toBe("New York");
    expect(fresh.seed).not.toBe(stale.seed);
  });

  it("reuses a cached record built over the same terrain version", async () => {
    const first = await ingestNewYork();
    disk.placeCache = JSON.stringify({
      version: 2,
      terrainVersion: 2,
      outcome: { ...first.outcome, placeName: "Cached New York" },
      seed: first.seed,
      synth: cachedSynth(),
    });
    const { ingestLocationCase } = await import("./ingest.ts");
    const outcome = await ingestLocationCase(
      pool,
      { lon: -74.00602, lat: 40.71273, placeName: "New York", regionName: "United States" },
      "seed",
    );
    expect(outcome.placeName).toBe("Cached New York");
  });

  it("names the outline by what the terrain drew, with its area and real elevation source", async () => {
    const { seed, bundle } = await ingestNewYork();
    const geo = seed.geoSelections[0];
    expect(geo?.label).toBe("Land within the 20 km box");
    expect(geo?.boundaryRole).toBe("landscape_sample");
    expect(geo?.areaM2).toBe(312_400_000);
    expect(geo?.selectionMethod).toContain("AWS Terrain Tiles (Terrarium encoding, zoom 12)");
    expect(geo?.selectionMethod).toContain("the 20 km box centred at 40.7127°, -74.0060°");
    // land within the box is not an upstream drainage area, so that value is missing with the reason
    const area = bundle.measurements.find((m) => m.metric === "drainage_outlet_upstream_area");
    expect(area?.status).toBe("missing");
    expect(area?.missingReason).toMatch(/^No watershed is drawn here/);
    expect(seed.caseRecord.description).toContain("Land within the 20 km box, 312.4 km²");
  });

  it("files the rainfall trend under a calendar-year period, not March to June", async () => {
    const { bundle } = await ingestNewYork();
    const trend = bundle.measurements.find((m) => m.metric === "precipitation_trend_mm_per_decade");
    expect(trend?.periodId).toBe("period_2000-2024_annual");
  });
});

describe("outline description", () => {
  const ring: [number, number][] = [
    [0, 0],
    [0.1, 0],
    [0.1, 0.1],
    [0, 0],
  ];
  const bbox: [number, number, number, number] = [-0.07, -0.04, 0.17, 0.14];
  it("calls only a whole watershed a hydrological unit", async () => {
    const { describeOutline } = await import("./ingest.ts");
    const shed = describeOutline(
      {
        catchmentRing: ring,
        bbox,
        elevationSource: "terrarium_z11",
        outline: { kind: "watershed", outlet: [0.05, 0.01], areaKm2: 88.2 },
      },
      "Queenstown",
      0.05,
      0.05,
    );
    expect([shed.label, shed.boundaryRole, shed.areaKm2, shed.drains]).toEqual([
      "Queenstown watershed",
      "hydrological_unit",
      88.2,
      true,
    ]);
    expect(shed.selectionMethod).toContain("zoom 11");
    const cut = describeOutline(
      {
        catchmentRing: ring,
        bbox,
        elevationSource: "open_meteo_16",
        outline: { kind: "drainage_within_box", areaKm2: 140 },
      },
      "Queenstown",
      0.05,
      0.05,
    );
    expect([cut.label, cut.boundaryRole, cut.drains]).toEqual([
      "Drainage area within the 20 km box",
      "landscape_sample",
      true,
    ]);
    expect(cut.limitations[0]).toMatch(/part of a larger watershed/i);
    expect(cut.selectionMethod).toContain("Open-Meteo Elevation API");
  });

  it("does not call an outline of unrecorded kind a watershed", async () => {
    const { describeOutline } = await import("./ingest.ts");
    const old = describeOutline({ catchmentRing: ring, bbox }, "Arkhust", 0.05, 0.05);
    expect(old.boundaryRole).toBe("landscape_sample");
    expect(old.label).not.toMatch(/watershed|catchment/i);
    expect(old.selectionMethod).toContain("source is not recorded");
  });

  it("holds the box, not a broken polygon, when the outline ring is too short", async () => {
    const { describeOutline } = await import("./ingest.ts");
    const short = describeOutline(
      {
        catchmentRing: [
          [0, 0],
          [0.1, 0],
          [0, 0],
        ],
        bbox,
        elevationSource: "terrarium_z12",
        outline: { kind: "watershed", areaKm2: 0.2 },
      },
      "Selected catchment",
      0.05,
      0.05,
    );
    expect([short.label, short.boundaryRole, short.drains]).toEqual([
      "Area within the 20 km box",
      "landscape_sample",
      false,
    ]);
    expect(short.ring).toEqual([
      [-0.07, -0.04],
      [0.17, -0.04],
      [0.17, 0.14],
      [-0.07, 0.14],
      [-0.07, -0.04],
    ]);
    expect(short.limitations[0]).toMatch(/fewer than four points/);
    // the box's own polygon area (polygonAreaM2 is stubbed in this file), not the watershed's grid count
    expect(short.areaMethod).toMatch(/^Geodesic polygon area/);
  });

  it("labels the box outline by why it fell back: no land or no outline could be drawn", async () => {
    const { describeOutline } = await import("./ingest.ts");
    const noLand = describeOutline(
      {
        catchmentRing: ring,
        bbox,
        elevationSource: "terrarium_z12",
        outline: { kind: "box", fallback: "no_land", areaKm2: 400 },
      },
      "Selected catchment",
      0.05,
      0.05,
    );
    expect([noLand.label, noLand.boundaryRole, noLand.areaKm2, noLand.drains]).toEqual([
      "The 20 km box (no land in it)",
      "landscape_sample",
      400,
      false,
    ]);
    expect(noLand.limitations[0]).toMatch(/no land in the 20 km box/i);

    const degenerateBox = describeOutline(
      {
        catchmentRing: ring,
        bbox,
        elevationSource: "terrarium_z12",
        outline: { kind: "box", fallback: "outline_degenerate", areaKm2: 400 },
      },
      "Selected catchment",
      0.05,
      0.05,
    );
    expect([degenerateBox.label, degenerateBox.boundaryRole, degenerateBox.drains]).toEqual([
      "The 20 km box (no outline could be drawn)",
      "landscape_sample",
      false,
    ]);
    expect(degenerateBox.limitations[0]).toMatch(/no outline could be drawn/i);

    const degenerateLand = describeOutline(
      {
        catchmentRing: ring,
        bbox,
        elevationSource: "terrarium_z12",
        outline: { kind: "land_within_box", fallback: "outline_degenerate", areaKm2: 185.4 },
      },
      "New York",
      0.05,
      0.05,
    );
    expect([degenerateLand.label, degenerateLand.boundaryRole, degenerateLand.drains]).toEqual([
      "Land within the 20 km box",
      "landscape_sample",
      false,
    ]);
  });
});

describe("ingest with a too-short outline ring", () => {
  it("records the box instead of throwing", async () => {
    vi.mocked(buildTerrainForBbox).mockImplementationOnce((bbox) =>
      Promise.resolve({
        version: 2,
        gridSize: 2,
        width: 2,
        height: 2,
        bbox,
        minElevationM: 0,
        maxElevationM: 120,
        elevations: [0, 40, 80, 120],
        catchmentRing: [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[1]],
          [bbox[0], bbox[1]],
        ],
        streamPaths: [],
        elevationSource: "terrarium_z12",
        outline: { kind: "watershed", areaKm2: 0.2 },
      }),
    );
    const { seed } = await ingestNewYork();
    const geo = seed.geoSelections[0];
    expect(geo?.label).toBe("Area within the 20 km box");
    const geometry = geo?.geometry;
    expect(geometry?.type === "Polygon" ? geometry.coordinates[0]?.length : 0).toBe(5);
  });
});

function sampleVegetationSeries(withheld = false): VegetationSeries {
  const seasons = Array.from({ length: 25 }, (_, i) => ({
    year: 2000 + i,
    meanNdvi: Number((0.42 + i * 0.0012).toFixed(4)),
    validPixelShare: Number((0.85 + (i % 5) * 0.02).toFixed(4)),
    compositesKept: 8,
    compositesExpected: 8,
  }));
  return {
    window: {
      months: [5, 6, 7, 8],
      label: "May to August",
      rule: "The four consecutive months with the highest mean NDVI on the mean seasonal cycle of 2003, 2012, 2021 (reference years fixed in code), chosen before any trend was computed; a window that crosses the year end belongs to the year it starts.",
      referenceYears: [...REFERENCE_YEARS],
      referenceCycle: [0.2, 0.22, 0.3, 0.41, 0.52, 0.58, 0.6, 0.55, 0.44, 0.33, 0.25, 0.21],
    },
    qaRule:
      "Terra MOD13Q1 v6.1 only; NDVI = DN / 10000 kept where pixel reliability is 0 or 1 and -0.2 <= NDVI <= 1.0; a season's value per pixel is the mean of kept composites, defined when at least half of the window's 16-day periods are kept",
    method: { ...VEGETATION_METHOD },
    seasons,
    yearsUsed: seasons.map((s) => s.year),
    placePixels: 140,
    analysisPixels: 112,
    areaTrend: withheld
      ? null
      : {
          perDecade: 0.012,
          sen95PerDecade: [0.0085, 0.0155],
          mannKendallP: 0.0012,
          seasonsUsed: 25,
        },
    areaTrendWithheld: withheld
      ? "Only 11 of 25 seasons had a value for at least 70% of the place's pixels; an area trend needs at least 15."
      : null,
    pixelShares: {
      pixelsTested: 108,
      upward: 0.3148,
      downward: 0.0463,
      includesZero: 0.6389,
      fdrUpward: 0.2222,
      fdrDownward: 0.0185,
      fdrQ: 0.05,
      chancePerDirection: 0.025,
    },
    grid: {
      width: 14,
      height: 10,
      pixelSizeM: 231.656,
      boundsSinusoidal: [0, 0, 1000, 1000],
      inPlace: new Uint8Array(140).fill(1),
      seasonMeans: new Float32Array(25 * 140).fill(0.45),
      slopePerDecade: new Float32Array(140).fill(0.012),
    },
    unreadComposites: [],
    limitations: [...VEGETATION_LIMITATIONS],
  };
}

function sampleLandCoverChange() {
  const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  const crop2017 = new Uint8Array(fixture("io-lulc-18t-2017-central-park.npy"));
  const crop2023 = new Uint8Array(fixture("io-lulc-18t-2023-central-park.npy"));
  const parseClasses = (bytes: Uint8Array) => {
    const arr = parseNpy(bytes);
    if (!arr) throw new Error("fixture did not parse");
    return classesFromCrop(arr, 32, 32);
  };
  const c2017 = parseClasses(crop2017);
  const c2023 = parseClasses(crop2023);
  const bbox: Bbox = [-73.975, 40.775, -73.955, 40.79];
  return computeLandCoverChange(
    [2017, 2018, 2019, 2020, 2021, 2022, 2023].map((year) => ({
      year,
      itemIds: [`18T-${String(year)}`],
      classes: year === 2017 ? c2017 : c2023,
    })),
    { width: 32, height: 32, bbox, inPlace: new Uint8Array(32 * 32).fill(1) },
  );
}

describe("MODIS vegetation and Impact Observatory land-cover wiring in ingest", () => {
  it("wires measured MODIS vegetation and Impact Observatory land cover under a 20 s cap", async () => {
    const vegSeries = sampleVegetationSeries(false);
    const lcChange = sampleLandCoverChange();
    vi.mocked(fetchVegetationSeries).mockResolvedValueOnce({
      status: "measured",
      value: vegSeries,
      provenance: {
        source: "modis-13Q1-061",
        items: ["MOD13Q1.A2000129.h12v04.061.1", "MOD13Q1.A2024209.h12v04.061.1"],
        window: { start: "2000-05-08", end: "2024-09-12" },
        method: { id: "live_vegetation_trend", version: "1.0.0" },
        retrievedAt: "2026-11-02T12:00:00.000Z",
        elapsedMs: 120,
      },
    });
    vi.mocked(fetchLandCoverChange).mockResolvedValueOnce({
      status: "measured",
      value: lcChange,
      provenance: {
        source: "io-lulc-annual-v02",
        items: lcChange.years.flatMap((y) => y.itemIds),
        window: { start: "2017-01-01", end: "2023-12-31" },
        method: { id: "live_landcover_change", version: "1.0.0" },
        retrievedAt: "2026-11-02T12:00:00.000Z",
        elapsedMs: 85,
      },
    });

    const { outcome, seed, bundle } = await ingestNewYork();

    expect(vi.mocked(fetchVegetationSeries)).toHaveBeenCalledWith(
      expect.any(Array),
      undefined,
      expect.objectContaining({ timeoutMs: 20_000 }),
    );
    expect(vi.mocked(fetchLandCoverChange)).toHaveBeenCalledWith(
      expect.any(Array),
      undefined,
      expect.objectContaining({ timeoutMs: 20_000 }),
    );

    // 25 ndvi_growing_season_mean records with validFraction = validPixelShare
    const ndviYearly = bundle.measurements.filter((m) => m.metric === "ndvi_growing_season_mean");
    expect(ndviYearly).toHaveLength(25);
    for (let i = 0; i < 25; i++) {
      const m = ndviYearly[i];
      const expected = vegSeries.seasons[i];
      expect(m?.status).toBe("available");
      expect(m?.value).toBe(expected?.meanNdvi);
      expect(m?.validFraction).toBe(expected?.validPixelShare);
      expect(m?.totalPixelCount).toBe(112);
      expect(m?.aggregation).toContain("May to August");
      expect(m?.aggregation).toContain("2003, 2012, 2021");
      expect(m?.aggregation).toContain("pixel reliability is 0 or 1");
      expect(m?.aggregation).toContain("112 analysis pixels");
      expect(m?.aggregation).toContain("live_vegetation_trend@1.0.0");
    }

    // meas_catchment_trend from areaTrend (Sen slope, 95% interval, Mann-Kendall p)
    const catchmentTrend = bundle.measurements.find((m) =>
      m.id.startsWith("meas_catchment_trend_"),
    );
    expect(catchmentTrend?.status).toBe("available");
    expect(catchmentTrend?.value).toBe(0.012);
    expect(catchmentTrend?.periodId).toBe("period_2000-2024_may_aug");
    expect(catchmentTrend?.uncertainty).toMatchObject({
      kind: "interval",
      lower: 0.0085,
      upper: 0.0155,
      level: 0.95,
    });
    expect(catchmentTrend?.uncertainty.method).toContain("0.0012");

    // FDR shares (fdrUpward, fdrDownward)
    const fdrUp = bundle.measurements.find((m) => m.metric === "area_share_upward_fdr");
    const fdrDown = bundle.measurements.find((m) => m.metric === "area_share_downward_fdr");
    expect(fdrUp?.status).toBe("available");
    expect(fdrUp?.value).toBe(0.2222);
    expect(fdrUp?.validPixelCount).toBe(108);
    expect(fdrUp?.totalPixelCount).toBe(112);
    expect(fdrDown?.status).toBe("available");
    expect(fdrDown?.value).toBe(0.0185);

    // Band trend and rainfall fit stay missing
    const bandTrend = bundle.measurements.find((m) => m.id.startsWith("meas_band_low_"));
    const rainR2 = bundle.measurements.find((m) => m.metric === "rainfall_fit_r_squared");
    expect(bandTrend?.status).toBe("missing");
    expect(bandTrend?.value).toBeNull();
    expect(rainR2?.status).toBe("missing");
    expect(rainR2?.value).toBeNull();

    // Sources from LIVE_SOURCES
    const modisSrc = seed.sources.find((s) => s.id.startsWith("src_modis_"));
    expect(modisSrc?.accessStatus).toBe("retrieved");
    expect(modisSrc?.notes.join(" ")).toContain("May to August");
    expect(modisSrc?.notes.join(" ")).toContain("2003, 2012, 2021");
    expect(modisSrc?.notes.join(" ")).toContain("112 analysis pixels");

    // Land cover shares per year (2017 to 2023), change, and transitions with Impact Observatory source and limitation
    const lulcSrc = seed.sources.find((s) => s.id.startsWith("src_lulc_"));
    expect(lulcSrc?.accessStatus).toBe("retrieved");
    expect(lulcSrc?.title).toContain("Impact Observatory 10 m annual LULC v02");
    expect(lulcSrc?.license).toBe("CC BY 4.0");
    expect(lulcSrc?.notes.join(" ")).toContain("2017, 2018, 2019, 2020, 2021, 2022, 2023");
    expect(lulcSrc?.notes.join(" ")).toContain("live_landcover_change@1.0.0");
    expect(lulcSrc?.notes.join(" ")).toMatch(
      /difference in classification rather than a change on the ground/,
    );

    const lulcChange = bundle.measurements.find((m) => m.metric === "landcover_changed_share");
    expect(lulcChange?.status).toBe("available");
    expect(lulcChange?.value).toBe(0.0586);
    expect(lulcChange?.provenance.limitations.join(" ")).toMatch(
      /difference in classification rather than a change on the ground/,
    );
    const builtShares = bundle.measurements.filter(
      (m) => m.metric === "landcover_share_built_area",
    );
    expect(builtShares).toHaveLength(7);
    expect(builtShares[0]?.value).toBe(0.6865);
    expect(builtShares[6]?.value).toBe(0.709);
    const treesToBuilt = bundle.measurements.find(
      (m) => m.metric === "landcover_transition_trees_to_built_area",
    );
    expect(treesToBuilt?.status).toBe("available");
    expect(treesToBuilt?.value).toBe(0.0244);

    // Default question asks about vegetation when measured, without presupposing greening or browning
    expect(outcome.question).toBe(
      "How have vegetation and rainfall changed in New York since 2000, and what land cover does it have?",
    );
  });

  it("withholds meas_catchment_trend with areaTrendWithheld when areaTrend is null", async () => {
    const vegWithheld = sampleVegetationSeries(true);
    vi.mocked(fetchVegetationSeries).mockResolvedValueOnce({
      status: "measured",
      value: vegWithheld,
      provenance: {
        source: "modis-13Q1-061",
        items: ["MOD13Q1.A2000129.h12v04.061.1"],
        window: { start: "2000-05-08", end: "2024-09-12" },
        method: { id: "live_vegetation_trend", version: "1.0.0" },
        retrievedAt: "2026-11-02T12:00:00.000Z",
        elapsedMs: 90,
      },
    });
    const { bundle } = await ingestNewYork();
    const catchmentTrend = bundle.measurements.find((m) =>
      m.id.startsWith("meas_catchment_trend_"),
    );
    expect(catchmentTrend?.status).toBe("missing");
    expect(catchmentTrend?.value).toBeNull();
    expect(catchmentTrend?.missingReason).toBe(vegWithheld.areaTrendWithheld);
  });

  it("keeps values missing with the timeout reason when the 20 s cap is exceeded", async () => {
    vi.mocked(fetchVegetationSeries).mockResolvedValueOnce({
      status: "missing",
      source: "modis-13Q1-061",
      reason: "timeout",
      detail: "Timed out after 20000 ms.",
      elapsedMs: 20_000,
    });
    vi.mocked(fetchLandCoverChange).mockResolvedValueOnce({
      status: "missing",
      source: "io-lulc-annual-v02",
      reason: "timeout",
      detail: "Timed out after 20000 ms.",
      elapsedMs: 20_000,
    });
    const { bundle } = await ingestNewYork();
    const catchmentTrend = bundle.measurements.find((m) =>
      m.id.startsWith("meas_catchment_trend_"),
    );
    expect(catchmentTrend?.status).toBe("missing");
    expect(catchmentTrend?.missingReason).toMatch(/20 s limit.*Timed out after 20000 ms/);
    const lulcChange = bundle.measurements.find((m) => m.metric === "landcover_changed_share");
    expect(lulcChange?.status).toBe("missing");
    expect(lulcChange?.missingReason).toMatch(/20 s limit.*Timed out after 20000 ms/);
  });
});
