import { CaseAnalysisConfig } from "@siterra/contracts";
import { describe, expect, it } from "vitest";

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
    expect(valley?.seriesPairs).toEqual([
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
