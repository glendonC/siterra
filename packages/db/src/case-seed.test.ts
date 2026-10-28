import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CaseSnapshot } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCaseSeed, seedSnapshot } from "./case-seed.ts";
import type { Pool } from "./client.ts";
import { loadSeedCase } from "./seed.ts";
import { readSnapshot } from "./snapshot.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const args = {
  repoDir,
  mode: "concept" as const,
  ownerScopeId: "seed",
  assetBaseUri: "http://127.0.0.1:4350/case-assets/bundles/",
  importedAt: "2026-10-27T20:00:00Z",
};
const caseFile = JSON.parse(readFileSync(`${repoDir}data/case/case.json`, "utf8")) as {
  caseId: string;
  case: { title: string; objective: string; description: string; unresolvedQuestions: string[] };
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
    expect(seed?.sources).toHaveLength(14);
    expect(seed?.bundles.length).toBeGreaterThan(0);
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
