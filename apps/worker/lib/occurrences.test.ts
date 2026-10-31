import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { searchOccurrencesTool } from "@siterra/agent";
import { readSnapshot } from "@siterra/db";
import { freshDatabase } from "@siterra/db/testing";
import type { TestDatabase } from "@siterra/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadAnalyses } from "./recipes.ts";
import { snapshotStore } from "./snapshot-store.ts";

// The occurrence search on the real seeds: the stored GBIF bundle of each place, read from the
// checksum-verified asset, with no live call. The values asserted are read from the bundle file in
// this test, not typed.

const OWNER = "scope_test_occurrences";
const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const signal = new AbortController().signal;
let db: TestDatabase;

beforeAll(async () => {
  db = await freshDatabase();
  const run = (extra: string[]) =>
    execFileSync(
      process.execPath,
      [
        `${repoDir}packages/db/src/run-seed.ts`,
        "load",
        "concept",
        OWNER,
        "http://127.0.0.1:4369/assets",
        ...extra,
      ],
      { cwd: repoDir, env: { ...process.env, DATABASE_URL: db.url }, stdio: "pipe" },
    );
  run([]);
  run(["--seed-dir", "data/case/calaveras-creek"]);
}, 90_000);

afterAll(async () => {
  await db.drop();
});

async function storeFor(caseId: string, root = repoDir) {
  const snapshot = await readSnapshot(db.pool, caseId, OWNER);
  if (!snapshot) throw new Error("seed not loaded");
  const analyses = await loadAnalyses(root, snapshot.records.dataBundleRecords);
  return {
    analyses,
    store: snapshotStore(
      { case: snapshot.case, records: snapshot.records },
      { sources: [], passages: [], missing: [] },
      analyses,
    ),
  };
}

async function search(
  store: Awaited<ReturnType<typeof storeFor>>["store"],
  caseId: string,
  args: unknown,
) {
  const tool = searchOccurrencesTool(store, caseId);
  const parsed = tool.parse(args);
  if (!parsed.ok) throw new Error(parsed.message);
  return tool.run(parsed.value, signal);
}

interface Found {
  results: {
    bundleId: string;
    matchedRecords: number;
    taxa: { scientificName: string; records: number }[];
    records: { gbifId: number; license: string; dataset: { title: string; key: string } }[];
  }[];
  note: string | null;
}

describe("the occurrence search on the real seeds", () => {
  it("reads the first place's stored bundle: every record comes with a dataset and a CC0 or CC BY licence", async () => {
    const { store, analyses } = await storeFor("case_aitbouguemez");
    expect(analyses.missing).toEqual([]);
    const summary = JSON.parse(
      readFileSync(
        `${repoDir}data/bundles/bundle_species_occurrences_ait_bouguemez/species-occurrences.json`,
        "utf8",
      ),
    ) as { counts: { kept: number }; by_group: Record<string, number> };
    const all = (
      await search(store, "case_aitbouguemez", { query: null, group: "plants", limit: 25 })
    ).output as Found;
    expect(all.results).toHaveLength(1);
    expect(all.results[0]?.bundleId).toBe("bundle_species_occurrences_ait_bouguemez");
    expect(all.results[0]?.matchedRecords).toBe(summary.by_group["plants"]);
    const records = all.results[0]?.records ?? [];
    expect(records.length).toBe(25);
    for (const r of records) {
      expect(["CC0-1.0", "CC-BY-4.0"]).toContain(r.license);
      expect(r.dataset.title.length).toBeGreaterThan(0);
    }
    const everything = (
      await search(store, "case_aitbouguemez", { query: "a", group: null, limit: 1 })
    ).output as Found;
    expect(everything.results[0]?.matchedRecords).toBeLessThanOrEqual(summary.counts.kept);
  });

  it("answers a plant the first place's source names with no record, and says that is no statement of absence", async () => {
    const { store } = await storeFor("case_aitbouguemez");
    const out = (
      await search(store, "case_aitbouguemez", {
        query: "Astragalus armatus",
        group: null,
        limit: 5,
      })
    ).output as Found;
    expect(out.results[0]?.matchedRecords).toBe(0);
    expect(out.note).toContain("says nothing about whether the species is present or absent");
  });

  it("keeps the two places apart: a case never reads the other place's records", async () => {
    const ait = await storeFor("case_aitbouguemez");
    const cal = await storeFor("case_calaveras_creek");
    const fromAit = (
      await search(ait.store, "case_aitbouguemez", { query: null, group: "fungi", limit: 3 })
    ).output as Found;
    const fromCal = (
      await search(cal.store, "case_calaveras_creek", { query: null, group: "fungi", limit: 3 })
    ).output as Found;
    expect(fromCal.results[0]?.bundleId).toBe("bundle_species_occurrences_calaveras_creek");
    expect(fromCal.results[0]?.matchedRecords).toBeGreaterThan(0);
    expect(fromAit.results[0]?.matchedRecords).toBe(0);
  });

  it("refuses an occurrence file that does not match its recorded checksum: the set is left out and named missing", async () => {
    const copy = mkdtempSync(join(tmpdir(), "siterra-occ-"));
    try {
      cpSync(
        join(repoDir, "data/bundles/bundle_species_occurrences_ait_bouguemez"),
        join(copy, "data/bundles/bundle_species_occurrences_ait_bouguemez"),
        { recursive: true },
      );
      cpSync(join(repoDir, "science/recipes"), join(copy, "science/recipes"), { recursive: true });
      const file = join(
        copy,
        "data/bundles/bundle_species_occurrences_ait_bouguemez/occurrences.json",
      );
      writeFileSync(file, readFileSync(file, "utf8").replace('"gbif_id"', '"gbif_id_x"'));
      const snapshot = await readSnapshot(db.pool, "case_aitbouguemez", OWNER);
      if (!snapshot) throw new Error("seed not loaded");
      const analyses = await loadAnalyses(copy, snapshot.records.dataBundleRecords);
      expect(analyses.occurrences).toEqual([]);
      expect(analyses.missing).toContain("bundle_species_occurrences_ait_bouguemez");
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });
});
