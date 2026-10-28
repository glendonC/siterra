import { CaseAnalysisConfig } from "@siterra/contracts";
import { describe, expect, it } from "vitest";

import registry from "../../../../science/recipes/registry.json" with { type: "json" };
import seed from "../../../contracts/fixtures/case-snapshot-aitbouguemez-seed.json" with { type: "json" };
import { analysisConfigFor, caseAnalysisConfigs } from "./index.ts";

describe("case analysis configurations", () => {
  it("every configuration parses and is registered under its own case ID", () => {
    expect(caseAnalysisConfigs.length).toBeGreaterThan(0);
    for (const config of caseAnalysisConfigs) {
      expect(CaseAnalysisConfig.parse(config)).toEqual(config);
      expect(analysisConfigFor(config.caseId)).toBe(config);
    }
    expect(analysisConfigFor("case_not_configured")).toBeNull();
  });

  it("the valley keeps the pair, windows, decimals and season it had in code", () => {
    const valley = analysisConfigFor("case_aitbouguemez");
    expect(valley?.seriesPairs).toMatchObject([
      {
        id: "vegetation_rainfall",
        a: {
          label: "vegetation departure",
          metrics: ["ndvi_departure_area_median", "ndvi_departure_area_median_leave_one_year_out"],
        },
        b: {
          label: "rainfall departure",
          metrics: ["precipitation_departure_from_1991_2020_mean"],
          storedDecimals: 2,
        },
        windowsMonths: [0, 1, 2, 3],
      },
    ]);
  });

  it("the valley's bundle methods and aligned-month minimum come from the seed and the registry", () => {
    const valley = analysisConfigFor("case_aitbouguemez");
    const [pair] = valley?.seriesPairs ?? [];
    const validated = seed.records.dataBundleRecords
      .filter((b) => b.status === "validated")
      .map((b) => b.methodId);
    expect(validated).toContain(pair?.a.methodId);
    expect(validated).toContain(pair?.b.methodId);
    const aligned = registry.recipes.find((r) => r.recipeId === "aligned_antecedent");
    expect(aligned?.applicability.map((a) => a.minimum)).toContain(
      `${String(pair?.minAlignedMonths)} shared months`,
    );
    expect(valley?.rainfallSeason).toMatchObject({
      startMonth: 11,
      endMonth: 4,
      recipe: { recipeId: "season_summary", version: "1.0.0" },
    });
    expect(valley?.explanations.map((e) => e.id)).toEqual([
      "rainfall",
      "grazing",
      "land_use",
      "snow_terrain",
      "data_artefact",
    ]);
  });
});
