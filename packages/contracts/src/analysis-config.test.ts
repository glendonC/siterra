import { describe, expect, it } from "vitest";

import { CaseAnalysisConfig, maxExplanations } from "./analysis-config.ts";

// A synthetic configuration for a place that is not the valley: a dry season that does not wrap the
// year and a soil moisture pair. Nothing here describes a real place.
const OTHER_PLACE = {
  configVersion: 1,
  caseId: "case_example_plain",
  areaLabel: "plain",
  seriesPairs: [
    {
      id: "vegetation_soil_moisture",
      a: { label: "vegetation departure", metrics: ["evi_departure_area_median"] },
      b: {
        label: "soil moisture departure",
        metrics: ["soil_moisture_departure"],
        storedDecimals: 3,
      },
      windowsMonths: [0, 1],
    },
  ],
  rainfallSeason: {
    id: "rainy_season",
    label: "June to September rainy season",
    startMonth: 6,
    endMonth: 9,
    recipe: { recipeId: "season_summary", version: "1.0.0" },
  },
  explanations: [
    {
      id: "rainfall",
      label: "Rainfall",
      statement: "Lower rainfall lowered greenness on the plain.",
    },
    {
      id: "irrigation",
      label: "Irrigation",
      statement: "Less irrigation lowered greenness on the plain.",
    },
  ],
};

describe("case analysis configuration", () => {
  it("accepts a place other than the valley", () => {
    expect(CaseAnalysisConfig.safeParse(OTHER_PLACE).success).toBe(true);
  });

  it("refuses months outside 1 to 12, repeated IDs and more explanations than the cap", () => {
    const bad = (patch: object) =>
      CaseAnalysisConfig.safeParse({ ...OTHER_PLACE, ...patch }).success;
    expect(bad({ rainfallSeason: { ...OTHER_PLACE.rainfallSeason, endMonth: 13 } })).toBe(false);
    expect(bad({ explanations: [OTHER_PLACE.explanations[0], OTHER_PLACE.explanations[0]] })).toBe(
      false,
    );
    const many = Array.from({ length: maxExplanations + 1 }, (_, i) => ({
      id: `explanation_${String(i)}`,
      label: `Explanation ${String(i)}`,
      statement: "A candidate explanation.",
    }));
    expect(bad({ explanations: many })).toBe(false);
    expect(bad({ seriesPairs: [] })).toBe(false);
    expect(bad({ extra: true })).toBe(false);
  });
});
