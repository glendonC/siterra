import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CaseSnapshot } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCaseSeed, seedSnapshot } from "./case-seed.ts";
import type { Pool } from "./client.ts";
import { loadSeedCase } from "./seed.ts";
import { applyCommit } from "./commit.ts";
import { readSnapshot } from "./snapshot.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { exampleCommit, exampleEvidence } from "./test-records.ts";

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const args = {
  repoDir,
  mode: "concept" as const,
  ownerScopeId: "seed",
  importedAt: "2026-10-27T20:00:00Z",
};
const caseFile = JSON.parse(readFileSync(`${repoDir}data/case/case.json`, "utf8")) as {
  caseId: string;
  case: {
    title: string;
    location: string;
    place: { name: string; region: string };
    objective: string;
    description: string;
    unresolvedQuestions: string[];
  };
};

let db: TestDatabase;
let pool: Pool;

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
});

afterAll(async () => {
  await db.drop();
});

describe("the case seed in data/case/", () => {
  it("verifies every pinned file and imports every source and bundle without an issue", () => {
    const { seed, issues } = readCaseSeed(args);
    expect(issues).toEqual([]);
    expect(seed?.sources).toHaveLength(16);
    expect(seed?.bundles.map((b) => b.dataBundle.id).sort()).toEqual([
      "bundle_aligned_antecedent_ait_bouguemez",
      "bundle_chirps_monthly_ait_bouguemez",
      "bundle_coverage_summary_ait_bouguemez",
      "bundle_drainage_network_ait_bouguemez",
      "bundle_land_cover_ait_bouguemez",
      "bundle_ndvi_departure_ait_bouguemez",
      "bundle_optical_visibility_ait_bouguemez",
      "bundle_pixel_anatomy_ait_bouguemez",
      "bundle_pixel_trend_long_record_ait_bouguemez",
      "bundle_proposed_routes_ait_bouguemez",
      "bundle_relief_ait_bouguemez",
      "bundle_restrend_long_record_ait_bouguemez",
      "bundle_s2_ndvi_monthly_ait_bouguemez",
      "bundle_season_summary_ait_bouguemez",
      "bundle_season_trend_long_record_ait_bouguemez",
      "bundle_snow_cover_by_band_ait_bouguemez",
      "bundle_terrain_strata_ait_bouguemez",
      "bundle_transects_ait_bouguemez",
    ]);
  });

  it("takes the case words from the case object of case.json, unchanged", () => {
    const record = readCaseSeed(args).seed?.caseRecord;
    expect(record?.id).toBe(caseFile.caseId);
    expect([
      record?.title,
      record?.objective,
      record?.description,
      record?.unresolvedQuestions,
    ]).toEqual([
      caseFile.case.title,
      caseFile.case.objective,
      caseFile.case.description,
      caseFile.case.unresolvedQuestions,
    ]);
    expect([record?.status, record?.mode, record?.revision]).toEqual(["draft", "concept", 1]);
  });

  it("states the place of the case in the record, with the region as the approved location line", () => {
    const record = readCaseSeed(args).seed?.caseRecord;
    expect(record?.place).toEqual(caseFile.case.place);
    expect(record?.place?.region).toBe(caseFile.case.location);
    expect(record?.place?.name).toBe("Aït Bouguemez valley");
  });

  it("RL-04 (seed part): loads into one snapshot equal to the fixture builder's", async () => {
    const { seed } = readCaseSeed(args);
    if (seed === null) throw new Error("A pinned seed file does not match");
    expect((await loadSeedCase(pool, seed, "seed")).records).toBeGreaterThan(0);
    const snapshot = await readSnapshot(pool, seed.caseRecord.id, "seed");
    expect(CaseSnapshot.safeParse(snapshot).error?.issues ?? []).toEqual([]);
    expect(snapshot?.records.geoSelectionRecords.map((g) => g.id)).toEqual([
      "geo_ait_bouguemez_catchment",
    ]);
    expect(snapshot?.lastSequence).toBe(1);
    expect(seedSnapshot(seed)).toEqual(snapshot);
  });
});

describe("the UI fixture packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json", () => {
  it("is the snapshot the loader builds from the seed today (regenerate with run-seed.ts fixture)", () => {
    const fixture = CaseSnapshot.parse(
      JSON.parse(
        readFileSync(
          `${repoDir}packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json`,
          "utf8",
        ),
      ),
    );
    const { seed } = readCaseSeed({
      ...args,
      mode: fixture.case.mode,
      importedAt: fixture.case.createdAt,
    });
    if (seed === null) throw new Error("A pinned seed file does not match");
    expect(seedSnapshot(seed)).toEqual(fixture);
  });
});

describe("DF-03 (seed part): superseding a real bundle reaches evidence citing its measurements", () => {
  it("marks the evidence stale and leaves the measurement as recorded", async () => {
    const snapshot = await readSnapshot(pool, caseFile.caseId, "seed");
    if (snapshot === null) throw new Error("load the seed first");
    const measurement = snapshot.records.measurementRecords.find((m) => m.status === "available");
    const bundle = snapshot.records.dataBundleRecords.find(
      (b) => b.id === measurement?.dataBundleId,
    );
    if (measurement === undefined || bundle === undefined) throw new Error("no measurement");
    const base = exampleEvidence(caseFile.caseId, "ev_example_seed_obs");
    const evidence = {
      ...base,
      status: "accepted" as const,
      provenance: {
        ...base.provenance,
        inputVersions: [{ entityId: measurement.id, revision: measurement.revision }],
      },
    };
    const revision = snapshot.case.revision;
    await applyCommit(
      pool,
      exampleCommit(snapshot.case, {
        id: "commit_example_seed_ev",
        expected: revision,
        upserts: [evidence],
      }),
    );
    const outcome = await applyCommit(
      pool,
      exampleCommit(snapshot.case, {
        id: "commit_example_seed_sup",
        expected: revision + 1,
        upserts: [{ ...bundle, revision: bundle.revision + 1, status: "superseded" }],
      }),
    );
    if (outcome.status !== "committed") throw new Error(outcome.status);
    expect(outcome.commit.upserts.map((u) => u.id).sort()).toEqual(
      [
        bundle.id,
        "ev_example_seed_obs",
        // The instruments built on this bundle, directly or through bundles that read CHIRPS
        // (the rainfall fit, the pixel trend, the rainfall sheet) go stale too.
        "inst_cross_section_valley",
        "inst_layer_stack_valley",
        "inst_pixel_anatomy_valley",
        "inst_rainfall_scatter_valley",
      ].sort(),
    );
    const after = await readSnapshot(pool, caseFile.caseId, "seed");
    expect(after?.records.evidenceRecords.find((e) => e.id === "ev_example_seed_obs")?.status).toBe(
      "stale",
    );
    expect(after?.records.measurementRecords.find((m) => m.id === measurement.id)?.revision).toBe(
      measurement.revision,
    );
  });
});

describe("contracts 1.5: each source keeps the language the corpus manifest checked", () => {
  it("maps language onto every Source, SCI-144 as es", () => {
    const manifest = JSON.parse(
      readFileSync(`${repoDir}data/case/corpus-manifest.json`, "utf8"),
    ) as {
      sources: { sourceRecordId: string; language?: string }[];
    };
    const sources = readCaseSeed(args).seed?.sources ?? [];
    expect(sources.map((s) => [s.id, s.language])).toEqual(
      manifest.sources.map((s) => [s.sourceRecordId, s.language]),
    );
    expect(sources.find((s) => s.id === "src_SCI-144")?.language).toBe("es");
  });
});

describe("the seed case is never live before GATE-01 is recorded", () => {
  it("defaults to concept", () => {
    const { mode: _mode, ...rest } = args;
    expect(readCaseSeed(rest).seed?.caseRecord.mode).toBe("concept");
  });

  it("refuses live without the recorded approval, and accepts it with gate01-passed", () => {
    expect(() => readCaseSeed({ ...args, mode: "live", env: {} })).toThrow(/GATE-01/);
    expect(() =>
      readCaseSeed({ ...args, mode: "live", env: { SITERRA_LIVE_APPROVED: "yes" } }),
    ).toThrow(/GATE-01/);
    const approved = readCaseSeed({
      ...args,
      mode: "live",
      env: { SITERRA_LIVE_APPROVED: "gate01-passed" },
    });
    expect(approved.seed?.caseRecord.mode).toBe("live");
  });

  it("the committed UI fixture is concept", () => {
    const fixture = JSON.parse(
      readFileSync(
        `${repoDir}packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json`,
        "utf8",
      ),
    ) as { case: { mode: string } };
    expect(fixture.case.mode).toBe("concept");
  });
});

describe("contracts 1.6: the seed carries the context features of data/case/context-features.json", () => {
  it("returns the outlet, Tabant and the Aït Ouchi locator as Point records in EPSG:4326 (the lines come from the bundles)", () => {
    const { seed, issues } = readCaseSeed(args);
    if (seed === null) throw new Error("A pinned seed file does not match");
    expect(issues).toEqual([]);
    const records = (seedSnapshot(seed).records.contextFeatureRecords ?? []).filter(
      (r) => r.geometry.type === "Point",
    );
    expect(records.map((r) => [r.id, r.role, r.crs])).toEqual([
      ["ctx_ait_ouchi_locator", "settlement_locator", "EPSG:4326"],
      ["ctx_catchment_outlet", "outlet", "EPSG:4326"],
      ["ctx_tabant", "settlement", "EPSG:4326"],
    ]);
    const outlet = records.find((r) => r.id === "ctx_catchment_outlet");
    expect(outlet?.geometry).toEqual({ type: "Point", coordinates: [-6.5372222, 31.6377778] });
    expect(records.find((r) => r.id === "ctx_ait_ouchi_locator")?.sourceIds).toEqual([
      "src_SCI-04",
    ]);
  });

  it("18b: the outlet is outlet_snapped of the case geometry and credits its OpenStreetMap input", () => {
    const geometry = JSON.parse(
      readFileSync(`${repoDir}data/case/geometry/ait-bouguemez-catchment.geojson`, "utf8"),
    ) as { features: { properties: { outlet_snapped: [number, number] } }[] };
    const { seed } = readCaseSeed(args);
    if (seed === null) throw new Error("A pinned seed file does not match");
    const outlet = seedSnapshot(seed).records.contextFeatureRecords?.find(
      (r) => r.id === "ctx_catchment_outlet",
    );
    expect(outlet?.geometry.coordinates).toEqual(geometry.features[0]?.properties.outlet_snapped);
    expect(outlet?.method).toContain("river way 326552769");
    expect(outlet?.method).toContain("SCI-36");
    expect(outlet?.datasetId).toContain("SCI-36");
    expect(outlet?.sourceIds).toEqual([]);
    expect(outlet?.attribution).toContain("Copernicus WorldDEM-30");
    expect(outlet?.attribution).toContain("© OpenStreetMap contributors");
    expect(outlet?.license).toContain("ODbL-1.0");
    const places = seedSnapshot(seed).records.contextFeatureRecords?.filter(
      (r) => r.role !== "outlet",
    );
    for (const place of places ?? []) expect(place.attribution).not.toContain("OpenStreetMap");
  });
});
