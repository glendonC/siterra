import type * as NodeFs from "node:fs";
import type { CaseSeedRecords, Pool } from "@siterra/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The live record for New York, ingested with the network and database stubbed: Open-Meteo answers with a
// known daily archive, every other service is unreachable, and the seed handed to the database is captured.
const captured: { seed: CaseSeedRecords | null } = { seed: null };

vi.mock("@siterra/db", () => ({
  loadSeedCase: vi.fn((_pool: unknown, seed: CaseSeedRecords) => {
    captured.seed = seed;
    return Promise.resolve();
  }),
}));
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof NodeFs>()),
  existsSync: () => false,
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
vi.mock("../../app/api/geocode/route.ts", () => ({
  reverseGeocode: vi.fn(),
  formatCoordRegion: vi.fn(),
}));
vi.mock("./terrain-builder.ts", () => ({
  bboxAround: (lon: number, lat: number) => [lon - 0.12, lat - 0.09, lon + 0.12, lat + 0.09],
  polygonAreaM2: () => 1.5e8,
  terrainCachePath: () => "/dev/null",
  readOrBuildTerrain: vi.fn(),
  buildTerrainForBbox: vi.fn((bbox: number[]) =>
    Promise.resolve({
      version: 1,
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
});
