import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { compareSeriesTool, listRecipesTool, readRecipeResultTool } from "@siterra/agent";
import type { ToolOutput } from "@siterra/agent";
import { readSnapshot } from "@siterra/db";
import { freshDatabase } from "@siterra/db/testing";
import type { TestDatabase } from "@siterra/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadAnalyses } from "./recipes.ts";
import type { Analyses } from "./recipes.ts";
import { snapshotStore } from "./snapshot-store.ts";

// The drought-challenge tools on the real case seed (data/bundles, science/recipes/registry.json),
// loaded by PLATFORM's run-seed.ts. compare_series is checked against the stored aligned_antecedent
// 1.1.1 result: code that only aligns, sums at stored precision and counts must give the same
// counts as the offline pipeline, for both vegetation references and every window.

const OWNER = "scope_test_recipes";
const CASE_ID = "case_aitbouguemez";
const repoDir = fileURLToPath(new URL("../../../", import.meta.url));

let db: TestDatabase;
let store: ReturnType<typeof snapshotStore>;
let analyses: Analyses;

const signal = new AbortController().signal;
interface Runnable {
  parse(args: unknown): { ok: true; value: unknown } | { ok: false; message: string };
  run(args: never, signal: AbortSignal): Promise<ToolOutput>;
}
function run(tool: Runnable, args: unknown): Promise<ToolOutput> {
  const parsed = tool.parse(args);
  if (!parsed.ok) throw new Error(parsed.message);
  return tool.run(parsed.value as never, signal);
}

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
    ],
    { cwd: repoDir, env: { ...process.env, DATABASE_URL: db.url }, stdio: "pipe" },
  );
  const snapshot = await readSnapshot(db.pool, CASE_ID, OWNER);
  if (!snapshot) throw new Error("seed not loaded");
  analyses = await loadAnalyses(repoDir, snapshot.records.dataBundleRecords);
  store = snapshotStore(
    {
      case: snapshot.case,
      records: { ...snapshot.records, sourceRecords: snapshot.records.sourceRecords },
    },
    { sources: [], passages: [], missing: [] },
    analyses,
  );
}, 60_000);

afterAll(async () => {
  await db.drop();
});

const revisionOf = async (id: string): Promise<number> =>
  (await store.readBundle(CASE_ID, id))?.revision ?? 0;

describe("drought-challenge tools on the real seed", () => {
  it("every registry recipe with a validated bundle is applicable, and every result loads", async () => {
    expect(analyses.missing).toEqual([]);
    const result = await run(listRecipesTool(store, CASE_ID), {});
    const recipes = (
      result.output as { recipes: { recipeId: string; status: string; bundleId: string | null }[] }
    ).recipes;
    expect(recipes.length).toBe(analyses.recipes.length);
    for (const r of recipes.filter((x) => x.status === "applicable")) {
      expect(analyses.results.some((x) => x.bundleId === r.bundleId)).toBe(true);
    }
    expect(recipes.find((r) => r.recipeId === "aligned_antecedent")?.status).toBe("applicable");
    expect(recipes.find((r) => r.recipeId === "season_summary")?.status).toBe("applicable");
    expect(recipes.find((r) => r.recipeId === "restrend_long_record")?.status).toBe("applicable");
    expect(recipes.find((r) => r.recipeId === "snow_cover_by_band")?.status).toBe("applicable");
    expect(recipes.find((r) => r.recipeId === "pixel_trend_long_record")?.status).toBe(
      "applicable",
    );
    expect(recipes.find((r) => r.recipeId === "season_trend_long_record")?.status).toBe(
      "applicable",
    );
    const departure = analyses.results.find((r) => r.recipeId === "monthly_departure")?.result;
    expect(departure).toMatchObject({ kind: "per_period_measurements" });
    expect(analyses.results.find((r) => r.recipeId === "terrain_strata")?.result).toMatchObject({
      kind: "map_layers",
    });
  });

  it("read_recipe_result returns restrend_long_record, snow_cover_by_band, pixel_trend_long_record and season_trend_long_record from the seed", async () => {
    for (const [recipeId, bundleId] of [
      ["restrend_long_record", "bundle_restrend_long_record_ait_bouguemez"],
      ["snow_cover_by_band", "bundle_snow_cover_by_band_ait_bouguemez"],
      ["pixel_trend_long_record", "bundle_pixel_trend_long_record_ait_bouguemez"],
      ["season_trend_long_record", "bundle_season_trend_long_record_ait_bouguemez"],
    ] as const) {
      const stored = analyses.results.find((r) => r.bundleId === bundleId);
      expect(stored?.recipeId).toBe(recipeId);
      const result = await run(readRecipeResultTool(store, CASE_ID), {
        recipeId,
        version: stored?.version ?? "1.0.0",
        bundleId,
      });
      expect(result.output).toMatchObject({
        label: "precomputed analysis",
        result: stored?.result,
      });
    }
  });

  it("a missing registry lists no recipes and is reported", async () => {
    const empty = await loadAnalyses("/nonexistent-siterra-root", []);
    expect(empty).toEqual({
      recipes: [],
      results: [],
      occurrences: [],
      missing: ["science/recipes/registry.json"],
    });
  });

  it("read_recipe_result returns season_summary as stored, labelled precomputed analysis", async () => {
    const bundleId = "bundle_season_summary_ait_bouguemez";
    const stored = analyses.results.find((r) => r.bundleId === bundleId);
    const result = await run(readRecipeResultTool(store, CASE_ID), {
      recipeId: "season_summary",
      version: stored?.version ?? "",
      bundleId,
    });
    expect(result.output).toMatchObject({ label: "precomputed analysis", result: stored?.result });
    expect(
      (result.output as { standardLimitations: string[] }).standardLimitations.length,
    ).toBeGreaterThan(0);
  });

  it("compare_series reproduces the stored aligned_antecedent counts for both references and all windows", async () => {
    const stored = analyses.results.find((r) => r.recipeId === "aligned_antecedent")?.result as {
      counts: Record<
        "all_years" | "leave_one_year_out",
        Record<string, { aligned_months: number; same_sign_months: number }>
      >;
    };
    const veg = "bundle_ndvi_departure_ait_bouguemez";
    const rain = "bundle_chirps_monthly_ait_bouguemez";
    const b = {
      bundleId: rain,
      bundleRevision: await revisionOf(rain),
      metric: "precipitation_departure_from_1991_2020_mean",
    };
    const references = {
      all_years: "ndvi_departure_area_median",
      leave_one_year_out: "ndvi_departure_area_median_leave_one_year_out",
    } as const;
    for (const [reference, metric] of Object.entries(references) as [
      keyof typeof references,
      string,
    ][]) {
      const result = await run(compareSeriesTool(store, CASE_ID), {
        a: { bundleId: veg, bundleRevision: await revisionOf(veg), metric },
        b,
      });
      const counts = (
        result.output as {
          counts: Record<string, { alignedMonths: number; sameSignMonths: number }>;
        }
      ).counts;
      for (const k of ["0", "1", "2", "3"]) {
        expect({ reference, k, ...counts[k] }).toEqual({
          reference,
          k,
          alignedMonths: stored.counts[reference][k]?.aligned_months,
          sameSignMonths: stored.counts[reference][k]?.same_sign_months,
        });
      }
    }
  });
});
