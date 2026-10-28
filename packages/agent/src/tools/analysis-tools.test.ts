import { describe, expect, it } from "vitest";

import {
  AT,
  CASE_ID,
  TEST_ANALYSIS_CONFIG,
  bundle,
  measurement,
  testStore,
} from "../testing/case-fixture.ts";
import type { EvidenceRecord } from "../tasks/records.ts";
import {
  compareSeriesTool,
  listRecipesTool,
  previousPeriod,
  readEvidenceTool,
  readRecipeResultTool,
} from "./analysis-tools.ts";
import type { MemoryCaseStore } from "./store.ts";
import type { ParsedArgs, ToolOutput } from "./tool.ts";

// Synthetic series and recipes in a synthetic case; every value is invented.

interface Runnable {
  parse(args: unknown): ParsedArgs<unknown>;
  run(args: never, signal: AbortSignal): Promise<ToolOutput>;
}
const signal = new AbortController().signal;
function run(tool: Runnable, args: unknown): Promise<ToolOutput> {
  const parsed = tool.parse(args);
  if (!parsed.ok) throw new Error(parsed.message);
  return tool.run(parsed.value as never, signal);
}

/** A store with a vegetation series (a) and a rainfall series (b) over four months. */
function seriesStore(): MemoryCaseStore {
  const store = testStore();
  const periods = ["period_2021-12", "period_2022-01", "period_2022-02", "period_2022-03"];
  store.bundles.push(
    bundle({ id: "bundle_test_veg", revision: 1, periodIds: periods }),
    bundle({ id: "bundle_test_rain", revision: 1, periodIds: periods }),
  );
  const veg = [0.01, -0.02, 0, 0.03];
  const rain = [10.25, -5.5, -1.25, 2.5];
  periods.forEach((p, i) => {
    store.measurements.push(
      measurement(p, veg[i] ?? null, {
        id: `meas_test_veg_${String(i)}`,
        dataBundleId: "bundle_test_veg",
        metric: "ndvi_departure_area_median_leave_one_year_out",
      }),
      measurement(p, rain[i] ?? null, {
        id: `meas_test_rain_${String(i)}`,
        dataBundleId: "bundle_test_rain",
        metric: "precipitation_departure_from_1991_2020_mean",
      }),
    );
  });
  return store;
}

const ARGS = {
  a: {
    bundleId: "bundle_test_veg",
    bundleRevision: 1,
    metric: "ndvi_departure_area_median_leave_one_year_out",
  },
  b: {
    bundleId: "bundle_test_rain",
    bundleRevision: 1,
    metric: "precipitation_departure_from_1991_2020_mean",
  },
};

describe("compare_series", () => {
  it("aligns on shared periods, sums antecedent windows at stored precision and counts same signs", async () => {
    const result = await run(compareSeriesTool(seriesStore(), CASE_ID), ARGS);
    const output = result.output as {
      counts: Record<string, { alignedMonths: number; sameSignMonths: number }>;
      rows: { periodId: string; b: { windows: Record<string, number | null> } }[];
    };
    expect(output.rows.map((r) => r.b.windows)).toEqual([
      { "0": 10.25, "1": null, "2": null, "3": null },
      { "0": -5.5, "1": 4.75, "2": null, "3": null },
      { "0": -1.25, "1": -6.75, "2": 3.5, "3": null },
      { "0": 2.5, "1": 1.25, "2": -4.25, "3": 6 },
    ]);
    // a = 0.01, -0.02, 0 (no sign, left out), 0.03.
    expect(output.counts).toEqual({
      "0": { alignedMonths: 3, sameSignMonths: 3 },
      "1": { alignedMonths: 2, sameSignMonths: 1 },
      "2": { alignedMonths: 1, sameSignMonths: 0 },
      "3": { alignedMonths: 1, sameSignMonths: 1 },
    });
    expect(result.resultEntityIds).toContain("meas_test_rain_3");
  });

  it("refuses series on different geometry revisions, stale bundles and unknown metrics", async () => {
    const store = seriesStore();
    for (const m of store.measurements.filter((x) => x.dataBundleId === "bundle_test_rain"))
      m.geoRevision = 2;
    await expect(run(compareSeriesTool(store, CASE_ID), ARGS)).rejects.toMatchObject({
      code: "area_mismatch",
    });
    await expect(
      run(compareSeriesTool(seriesStore(), CASE_ID), {
        ...ARGS,
        a: { ...ARGS.a, bundleRevision: 2 },
      }),
    ).rejects.toMatchObject({ code: "stale_reference" });
    await expect(
      run(compareSeriesTool(seriesStore(), CASE_ID), {
        ...ARGS,
        a: { ...ARGS.a, metric: "ndvi_departure_area_median" },
      }),
    ).rejects.toMatchObject({ code: "unknown_metric" });
  });

  it("refuses raw series: only the recipe's departures may be aligned (a56)", async () => {
    for (const args of [
      { ...ARGS, a: { ...ARGS.a, metric: "ndvi_area_median" } },
      { ...ARGS, b: { ...ARGS.b, metric: "precipitation_catchment_total" } },
      { a: ARGS.b, b: ARGS.a },
    ]) {
      await expect(run(compareSeriesTool(seriesStore(), CASE_ID), args)).rejects.toMatchObject({
        code: "not_a_departure_series",
      });
    }
  });

  it("aligns the pair another place's configuration allows, with its windows and decimals", async () => {
    const store = seriesStore();
    const moisture = [0.0104, -0.0052, -0.0014, 0.0026];
    for (const m of store.measurements) {
      if (m.dataBundleId === "bundle_test_veg") m.metric = "evi_departure_area_median";
      if (m.dataBundleId === "bundle_test_rain") {
        m.metric = "soil_moisture_departure";
        m.value = moisture[Number(m.id.slice(-1))] ?? null;
      }
    }
    store.analysisConfigs.set(CASE_ID, {
      ...TEST_ANALYSIS_CONFIG,
      seriesPairs: [
        {
          id: "vegetation_soil_moisture",
          a: {
            label: "vegetation departure",
            metrics: ["evi_departure_area_median"],
            methodId: "test_veg_departure",
          },
          b: {
            label: "soil moisture departure",
            metrics: ["soil_moisture_departure"],
            methodId: "test_soil_moisture",
            storedDecimals: 3,
          },
          windowsMonths: [0, 1],
          minAlignedMonths: 2,
        },
      ],
    });
    const args = {
      a: { ...ARGS.a, metric: "evi_departure_area_median" },
      b: { ...ARGS.b, metric: "soil_moisture_departure" },
    };
    const output = (await run(compareSeriesTool(store, CASE_ID), args)).output as {
      windowsMonths: number[];
      counts: Record<string, { alignedMonths: number; sameSignMonths: number }>;
      rows: { b: { windows: Record<string, number | null> } }[];
    };
    expect(output.windowsMonths).toEqual([0, 1]);
    expect(output.rows.map((r) => r.b.windows)).toEqual([
      { "0": 0.01, "1": null },
      { "0": -0.005, "1": 0.005 },
      { "0": -0.001, "1": -0.007 },
      { "0": 0.003, "1": 0.001 },
    ]);
    // The valley's pair is not this place's, so it is refused here.
    await expect(run(compareSeriesTool(store, CASE_ID), ARGS)).rejects.toMatchObject({
      code: "not_a_departure_series",
    });
  });

  it("refuses every pair when the case has no analysis configuration", async () => {
    const store = seriesStore();
    store.analysisConfigs.clear();
    await expect(run(compareSeriesTool(store, CASE_ID), ARGS)).rejects.toMatchObject({
      code: "no_case_config",
    });
  });

  it("steps back one month across a year", () => {
    expect(previousPeriod("period_2022-01")).toBe("period_2021-12");
    expect(previousPeriod("period_2022-11")).toBe("period_2022-10");
    expect(previousPeriod("2022-01")).toBeNull();
  });
});

describe("read_evidence", () => {
  it("returns stored records and names unknown IDs", async () => {
    const store = testStore();
    const record: EvidenceRecord = {
      recordType: "Evidence",
      id: "ev_test_one",
      revision: 2,
      createdAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
      caseId: CASE_ID,
      statement: "A synthetic statement.",
      claimKind: "observation",
      status: "accepted",
      geoSelectionId: null,
      periodIds: ["period_2022-04"],
      measurementIds: ["meas_test_2022-04"],
      provenance: {
        sourceLocators: [],
        dataBundleIds: [],
        methodId: null,
        methodVersion: null,
        inputVersions: [],
        generatedByTaskId: null,
        generatedAt: AT.toISOString(),
        verificationStatus: "computed_checked",
        limitations: [],
      },
      interpretation: null,
      uncertainty: "Not quantified.",
      reviewDecisionIds: [],
    };
    store.evidence.push(record);
    const result = await run(readEvidenceTool(store, CASE_ID), {
      evidenceIds: ["ev_test_one", "ev_test_none"],
    });
    expect(result.output).toMatchObject({
      records: [{ evidenceId: "ev_test_one", revision: 2, measurementIds: ["meas_test_2022-04"] }],
      unknown: ["ev_test_none"],
    });
    expect(readEvidenceTool(store, CASE_ID).parse({ evidenceIds: [] }).ok).toBe(false);
  });
});

describe("recipes", () => {
  function recipeStore(): MemoryCaseStore {
    const store = testStore();
    store.recipes.push(
      {
        recipeId: "test_recipe",
        version: "1.0.0",
        title: "T",
        question: "Q",
        outputs: [],
        standardLimitations: ["Verbatim limit."],
        priority: "P0",
      },
      {
        recipeId: "test_missing",
        version: "1.0.0",
        title: "M",
        question: "Q",
        outputs: [],
        standardLimitations: [],
        priority: "P0",
      },
      {
        recipeId: "test_versioned",
        version: "2.0.0",
        title: "V",
        question: "Q",
        outputs: [],
        standardLimitations: [],
        priority: "P0",
      },
    );
    store.bundles.push(
      bundle({
        id: "bundle_test_recipe",
        revision: 1,
        methodId: "test_recipe",
        methodVersion: "1.0.0",
        periodIds: [],
      }),
      bundle({
        id: "bundle_test_versioned",
        revision: 1,
        methodId: "test_versioned",
        methodVersion: "1.0.0",
        periodIds: [],
      }),
    );
    store.recipeResults.push({
      caseId: CASE_ID,
      bundleId: "bundle_test_recipe",
      recipeId: "test_recipe",
      version: "1.0.0",
      result: { value: 1 },
    });
    return store;
  }

  it("list_recipes marks recipes without a validated result as blocked with the reason", async () => {
    const result = await run(listRecipesTool(recipeStore(), CASE_ID), {});
    expect(
      (
        result.output as {
          recipes: { recipeId: string; status: string; blockedReason: string | null }[];
        }
      ).recipes,
    ).toEqual([
      expect.objectContaining({
        recipeId: "test_recipe",
        status: "applicable",
        blockedReason: null,
      }),
      expect.objectContaining({
        recipeId: "test_missing",
        status: "blocked",
        blockedReason: "No validated precomputed result for this recipe in this case.",
      }),
      expect.objectContaining({
        recipeId: "test_versioned",
        status: "blocked",
        blockedReason: "The case holds version 1.0.0, not 2.0.0.",
      }),
    ]);
  });

  it("read_recipe_result returns the stored result labelled precomputed analysis, with its limitations", async () => {
    const result = await run(readRecipeResultTool(recipeStore(), CASE_ID), {
      recipeId: "test_recipe",
      version: "1.0.0",
      bundleId: "bundle_test_recipe",
    });
    expect(result.output).toMatchObject({
      label: "precomputed analysis",
      result: { value: 1 },
      standardLimitations: ["Verbatim limit."],
    });
    await expect(
      run(readRecipeResultTool(recipeStore(), CASE_ID), {
        recipeId: "test_recipe",
        version: "2.0.0",
        bundleId: "bundle_test_recipe",
      }),
    ).rejects.toMatchObject({ code: "recipe_mismatch" });
  });
});
