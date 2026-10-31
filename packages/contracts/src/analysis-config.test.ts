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
      a: {
        label: "vegetation departure",
        metrics: ["evi_departure_area_median"],
        methodId: "evi_departure",
      },
      b: {
        label: "soil moisture departure",
        metrics: ["soil_moisture_departure"],
        methodId: "soil_moisture_monthly",
        storedDecimals: 3,
      },
      windowsMonths: [0, 1],
      minAlignedMonths: 6,
    },
  ],
  fieldChecks: [
    {
      id: "irrigation_channels",
      label: "Channel Survey",
      method: "Irrigation channels in use, walked and mapped.",
      basis: "Synthetic test check.",
      separates: [["irrigation", "rainfall"]],
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
    expect(
      CaseAnalysisConfig.safeParse({ ...OTHER_PLACE, whenOptionalNotMet: "consistent" }).success,
    ).toBe(true);
    expect(
      CaseAnalysisConfig.safeParse({ ...OTHER_PLACE, whenOptionalNotMet: "cannot_be_assessed" })
        .success,
    ).toBe(true);
    expect(
      CaseAnalysisConfig.safeParse({ ...OTHER_PLACE, whenOptionalNotMet: "contradicted" }).success,
    ).toBe(false);
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
    const [pair] = OTHER_PLACE.seriesPairs;
    expect(bad({ seriesPairs: [{ ...pair, minAlignedMonths: 0 }] })).toBe(false);
    expect(bad({ seriesPairs: [{ ...pair, a: { ...pair?.a, methodId: undefined } }] })).toBe(false);
    const check = OTHER_PLACE.fieldChecks[0];
    expect(bad({ fieldChecks: [check, check] })).toBe(false);
  });

  it("a field check separates named pairs of two different configured explanations, once each", () => {
    const check = OTHER_PLACE.fieldChecks[0];
    const withPairs = (separates: unknown) =>
      CaseAnalysisConfig.safeParse({ ...OTHER_PLACE, fieldChecks: [{ ...check, separates }] })
        .success;
    expect(withPairs([["rainfall", "irrigation"]])).toBe(true);
    expect(withPairs([])).toBe(false);
    expect(withPairs([["rainfall", "rainfall"]])).toBe(false);
    expect(withPairs([["rainfall", "grazing"]])).toBe(false);
    expect(
      withPairs([
        ["rainfall", "irrigation"],
        ["irrigation", "rainfall"],
      ]),
    ).toBe(false);
    expect(withPairs([["rainfall"]])).toBe(false);
    const { method: _m, ...noMethod } = check ?? {};
    expect(CaseAnalysisConfig.safeParse({ ...OTHER_PLACE, fieldChecks: [noMethod] }).success).toBe(
      false,
    );
  });
});

describe("case analysis configuration: instrument rules", () => {
  const ref = (bundleId: string, assetKey: string) => ({ bundleId, assetKey });
  const scatter = {
    from: "parameters",
    id: "rainfall_scatter_rule",
    whenExplanationIds: ["rainfall"],
    parameters: {
      kind: "rainfall_scatter",
      geoSelectionId: "geo_example_plain",
      seasons: ref("bundle_example_rain", "tables"),
      fit: ref("bundle_example_rain", "summary"),
    },
    caption: {
      ink: "Rainfall explains {share} of the greenness.",
      grey: "A fit over {seasons} seasons; not a cause.",
      claimKind: "model_estimate",
      citationIds: ["meas_example_r2", "meas_example_n"],
      numbers: {
        share: { measurementId: "meas_example_r2", part: "value", decimals: 3 },
        seasons: { measurementId: "meas_example_n", part: "value", decimals: 0 },
      },
    },
  };
  const fieldPlan = {
    from: "branch_merge",
    id: "field_plan_rule",
    whenExplanationIds: ["rainfall", "irrigation"],
    caption: { ink: "A field plan is proposed.", grey: "Proposed, not scheduled." },
  };
  const withRules = (...instruments: unknown[]) =>
    CaseAnalysisConfig.safeParse({ ...OTHER_PLACE, instruments }).success;

  it("accepts a configuration without rules, with a parameter rule and with a field plan rule", () => {
    expect(CaseAnalysisConfig.safeParse(OTHER_PLACE).success).toBe(true);
    expect(withRules(scatter)).toBe(true);
    expect(withRules(scatter, fieldPlan)).toBe(true);
  });

  it("refuses a rule that names an explanation the configuration does not hold", () => {
    expect(withRules({ ...scatter, whenExplanationIds: ["grazing"] })).toBe(false);
    expect(withRules({ ...fieldPlan, whenExplanationIds: ["grazing"] })).toBe(false);
  });

  it("refuses repeated rule IDs and an empty explanation list", () => {
    expect(withRules(scatter, scatter)).toBe(false);
    expect(withRules({ ...scatter, whenExplanationIds: [] })).toBe(false);
  });

  it("refuses a caption placeholder with no number, a number never used, and an uncited number", () => {
    const caption = scatter.caption;
    expect(
      withRules({ ...scatter, caption: { ...caption, ink: "Rainfall explains {missing}." } }),
    ).toBe(false);
    expect(withRules({ ...scatter, caption: { ...caption, grey: "A fit; not a cause." } })).toBe(
      false,
    );
    expect(
      withRules({ ...scatter, caption: { ...caption, citationIds: ["meas_example_r2"] } }),
    ).toBe(false);
  });

  it("refuses a digit written into caption text, because every number comes from a cited Measurement", () => {
    const caption = scatter.caption;
    expect(
      withRules({
        ...scatter,
        caption: { ...caption, ink: "Rainfall explains {share} of 26 seasons." },
      }),
    ).toBe(false);
    expect(
      withRules({ ...fieldPlan, caption: { ink: "Plan 1 is proposed.", grey: "Proposed." } }),
    ).toBe(false);
  });

  it("accepts signed, percent and grouped slots, period and level parts, sums and held claims", () => {
    const caption = {
      ...scatter.caption,
      ink: "{trend} NDVI per decade below {limit} m, March to June, {start} to {end}.",
      grey: "{cover} of the pixel is tree cover and cropland; every {level} interval lies above zero.",
      citationIds: ["meas_example_r2", "meas_example_n", "meas_example_a", "meas_example_b"],
      numbers: {
        trend: { measurementId: "meas_example_r2", part: "value", decimals: 4, style: "signed" },
        limit: { measurementId: "meas_example_n", part: "value", decimals: 0, style: "grouped" },
        start: { measurementId: "meas_example_r2", part: "period_start", decimals: 0 },
        end: { measurementId: "meas_example_r2", part: "period_end", decimals: 0 },
        cover: { sumOf: ["meas_example_a", "meas_example_b"], decimals: 0, style: "percent" },
        level: { measurementId: "meas_example_r2", part: "level", decimals: 0, style: "percent" },
      },
      holds: [{ measurementId: "meas_example_r2", part: "lower", above: 0 }],
    };
    expect(withRules({ ...scatter, caption })).toBe(true);
    expect(
      withRules({
        ...scatter,
        caption: {
          ...caption,
          holds: [{ measurementId: "meas_example_gone", part: "lower", above: 0 }],
        },
      }),
    ).toBe(false);
    expect(
      withRules({
        ...scatter,
        caption: {
          ...caption,
          citationIds: ["meas_example_r2", "meas_example_n", "meas_example_a"],
        },
      }),
    ).toBe(false);
    expect(
      withRules({
        ...scatter,
        caption: {
          ...caption,
          numbers: { ...caption.numbers, cover: { sumOf: ["meas_example_a"], decimals: 0 } },
        },
      }),
    ).toBe(false);
    expect(
      withRules({
        ...scatter,
        caption: {
          ...caption,
          numbers: {
            ...caption.numbers,
            trend: { measurementId: "meas_example_r2", part: "value", decimals: 4, style: "bold" },
          },
        },
      }),
    ).toBe(false);
  });

  it("refuses parameters that name a field the kind does not have, and a rule for a field plan with parameters", () => {
    expect(
      withRules({ ...scatter, parameters: { ...scatter.parameters, camera: [1, 2, 3] } }),
    ).toBe(false);
    expect(withRules({ ...fieldPlan, parameters: scatter.parameters })).toBe(false);
  });
});

describe("the configuration note", () => {
  it("is optional, and accepts one to six hundred characters of text", () => {
    expect(CaseAnalysisConfig.safeParse(OTHER_PLACE).success).toBe(true);
    expect(
      CaseAnalysisConfig.safeParse({ ...OTHER_PLACE, note: "Drafted from the schema alone." })
        .success,
    ).toBe(true);
    expect(CaseAnalysisConfig.safeParse({ ...OTHER_PLACE, note: "x".repeat(600) }).success).toBe(
      true,
    );
  });

  it("refuses an empty note and one over six hundred characters", () => {
    expect(CaseAnalysisConfig.safeParse({ ...OTHER_PLACE, note: "" }).success).toBe(false);
    expect(CaseAnalysisConfig.safeParse({ ...OTHER_PLACE, note: "x".repeat(601) }).success).toBe(
      false,
    );
  });

  it("accepts up to 3 unique suggestedQuestions and refuses duplicate IDs or >3", () => {
    const validQuestions = [
      {
        id: "valley_greener",
        question: "Is grazing changing the shared pastures of the Aït Bouguemez valley?",
        measurementId: "meas_trend_unadjusted_catchment_mar_jun",
      },
      {
        id: "pixel_trees",
        question: "Why can a pixel get greener while its pasture does not?",
        measurementId: "meas_pixel_anatomy_share_tree_cover_2021",
      },
      {
        id: "rainfall_change",
        question: "How much of the valley's greenness change does wet-season rainfall explain?",
        measurementId: "meas_rainfall_fit_r_squared_catchment_mar_jun",
      },
    ];
    expect(
      CaseAnalysisConfig.safeParse({ ...OTHER_PLACE, suggestedQuestions: validQuestions }).success,
    ).toBe(true);
    expect(
      CaseAnalysisConfig.safeParse({
        ...OTHER_PLACE,
        suggestedQuestions: [
          ...validQuestions,
          {
            id: "fourth_question",
            question: "What else is changing?",
            measurementId: "meas_trend_unadjusted_catchment_mar_jun",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      CaseAnalysisConfig.safeParse({
        ...OTHER_PLACE,
        suggestedQuestions: [validQuestions[0], validQuestions[0]],
      }).success,
    ).toBe(false);
  });
});
