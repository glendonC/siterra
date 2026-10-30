import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildCatalog, listRecipesTool } from "@siterra/agent";
import type { ToolOutput } from "@siterra/agent";
import { analysisConfigFor } from "@siterra/domain/cases";
import { readSnapshot } from "@siterra/db";
import { freshDatabase } from "@siterra/db/testing";
import type { TestDatabase } from "@siterra/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadAnalyses } from "./recipes.ts";
import type { Analyses } from "./recipes.ts";
import { snapshotStore } from "./snapshot-store.ts";

// The second place on the same tools: its seed, loaded with --seed-dir, gives the agent the recipes
// its own bundles hold and reports, as gaps, the series and season it has no bundle for.

const OWNER = "scope_test_recipes_calaveras";
const CASE_ID = "case_calaveras_creek";
const repoDir = fileURLToPath(new URL("../../../", import.meta.url));

let db: TestDatabase;
let store: ReturnType<typeof snapshotStore>;
let analyses: Analyses;

const signal = new AbortController().signal;

beforeAll(async () => {
  db = await freshDatabase();
  execFileSync(
    process.execPath,
    [
      `${repoDir}packages/db/src/run-seed.ts`,
      "load",
      "concept",
      OWNER,
      "http://127.0.0.1:4369/assets",
      "--seed-dir",
      "data/case/calaveras-creek",
    ],
    { cwd: repoDir, env: { ...process.env, DATABASE_URL: db.url }, stdio: "pipe" },
  );
  const snapshot = await readSnapshot(db.pool, CASE_ID, OWNER);
  if (!snapshot) throw new Error("seed not loaded");
  analyses = await loadAnalyses(repoDir, snapshot.records.dataBundleRecords);
  store = snapshotStore(
    { case: snapshot.case, records: snapshot.records },
    { sources: [], passages: [], missing: [] },
    analyses,
  );
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe("the agent's tools on the Calaveras Creek seed", () => {
  it("applies the recipes its own bundles hold at the registry's versions and blocks the two it has none for", async () => {
    expect(analyses.missing).toEqual([]);
    const tool = listRecipesTool(store, CASE_ID);
    const parsed = tool.parse({});
    if (!parsed.ok) throw new Error(parsed.message);
    const result: ToolOutput = await tool.run(parsed.value, signal);
    const recipes = (result.output as { recipes: { recipeId: string; status: string }[] }).recipes;
    const status = (id: string) => recipes.find((r) => r.recipeId === id)?.status;
    for (const id of [
      "restrend_long_record",
      "pixel_trend_long_record",
      "season_trend_long_record",
      "snow_cover_by_band",
      "terrain_strata",
      "drainage_network",
      "land_cover_classes",
      "terrain_relief",
    ]) {
      expect(status(id), id).toBe("applicable");
    }
    for (const id of ["season_summary", "monthly_departure", "aligned_antecedent"]) {
      expect(status(id), id).toBe("blocked");
    }
  });

  it("builds the branch catalog from the place's configuration: its strata, and the missing series as gaps", async () => {
    const config = analysisConfigFor(CASE_ID);
    if (config === null) throw new Error("no configuration");
    const catalog = await buildCatalog(store, CASE_ID, config);
    expect(catalog.trendStrata).toEqual(config.trendSummary?.strata);
    expect(catalog.seasonIds).toEqual([]);
    expect(catalog.gaps).toEqual([
      "vegetation departure (vegetation_rainfall side a): no validated monthly_departure bundle in this case.",
      "October to April wet season: no validated season_summary 1.0.0 result in this case.",
    ]);
    expect(catalog.fieldChecks.map((c) => c.id)).toContain("reservoir_records");
  });
});
