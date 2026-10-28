import type { Prediction, PredictionTest } from "@siterra/contracts";
import { describe, expect, it } from "vitest";

import {
  MERGE_RULES_V1,
  MERGE_RULES_V2,
  hypothesisStatusOf,
  mergeBranches,
  mergeRulesFor,
  scorePrediction,
  testKey,
} from "./branches.ts";
import type { BranchScoring, MergeRules, ScoringRecord } from "./branches.ts";

// Synthetic scoring records: a vegetation side with two metrics over three months, a rainfall
// side, one co-movement window and two seasons. Nothing here is a real measurement.

const NONE: PredictionTest = {
  kind: "field_check",
  pairId: null,
  side: null,
  periodIds: [],
  windowMonths: null,
  seasonId: null,
  flag: null,
  fieldCheckId: null,
  expected: null,
};

const row = (id: string, metric: string, value: number | null) => ({
  id,
  metric,
  status: value === null ? "missing" : "available",
  value,
});

function record(): ScoringRecord {
  return {
    series: new Map([
      [
        "veg_rain:a",
        {
          bundleId: "bundle_test_veg",
          metrics: ["dep", "dep_loyo"],
          periods: new Map([
            [
              "period_2022-03",
              {
                measurements: [row("meas_a1", "dep", -0.02), row("meas_a1l", "dep_loyo", -0.01)],
                qualityFlags: [],
              },
            ],
            [
              "period_2022-04",
              {
                measurements: [row("meas_a2", "dep", -0.03), row("meas_a2l", "dep_loyo", 0.01)],
                qualityFlags: ["snow_suspected"],
              },
            ],
            [
              "period_2022-05",
              {
                measurements: [row("meas_a3", "dep", null), row("meas_a3l", "dep_loyo", null)],
                qualityFlags: null,
              },
            ],
          ]),
        },
      ],
    ]),
    coMovement: new Map([
      [
        "veg_rain:1",
        {
          kind: "counted",
          bundleIds: ["bundle_test_veg", "bundle_test_rain"],
          minAlignedMonths: 12,
          byMetric: [
            { metric: "dep", alignedMonths: 20, sameSignMonths: 14 },
            { metric: "dep_loyo", alignedMonths: 20, sameSignMonths: 12 },
          ],
          measurementIds: ["meas_a1", "meas_b1"],
        },
      ],
      [
        "veg_rain:3",
        {
          kind: "counted",
          bundleIds: ["bundle_test_veg", "bundle_test_rain"],
          minAlignedMonths: 12,
          byMetric: [{ metric: "dep", alignedMonths: 8, sameSignMonths: 8 }],
          measurementIds: [],
        },
      ],
    ]),
    seasons: {
      bundleId: "bundle_test_season",
      categories: new Map([
        ["season_2021-11_2022-04", "below_normal"],
        ["season_2022-11_2023-04", "near_normal"],
      ]),
    },
    fieldCheckIds: new Set(["grazing_exclosure"]),
  };
}

const sign = (periodIds: string[], expected: "negative" | "positive"): PredictionTest => ({
  ...NONE,
  kind: "departure_sign",
  pairId: "veg_rain",
  side: "a",
  periodIds,
  expected,
});
const season = (seasonId: string, expected: PredictionTest["expected"]): PredictionTest => ({
  ...NONE,
  kind: "season_category",
  seasonId,
  expected,
});
const field: PredictionTest = { ...NONE, fieldCheckId: "grazing_exclosure" };

const prediction = (key: string, test: PredictionTest, necessary = true): Prediction => ({
  key,
  necessary,
  test,
  wording: `Synthetic wording ${key}.`,
});

describe("scoring a prediction against the record", () => {
  it("departure_sign is met only when every value of every configured metric has the sign", () => {
    const one = scorePrediction(prediction("p1", sign(["period_2022-03"], "negative")), record());
    expect(one).toMatchObject({ outcome: "met", dataAdequate: true, reasonCode: null });
    expect(one.measurementIds).toEqual(["meas_a1", "meas_a1l"]);
    const two = scorePrediction(
      prediction("p1", sign(["period_2022-03", "period_2022-04"], "negative")),
      record(),
    );
    expect(two).toMatchObject({ outcome: "not_met", dataAdequate: true });
    expect(two.observed).toContain("3 of 4");
  });

  it("a missing value leaves the prediction not testable on inadequate data, never not met", () => {
    const score = scorePrediction(
      prediction("p1", sign(["period_2022-03", "period_2022-05"], "positive")),
      record(),
    );
    expect(score).toMatchObject({
      outcome: "not_testable",
      dataAdequate: false,
      reasonCode: "value_not_available",
    });
  });

  it("names a period or series the record does not hold", () => {
    expect(
      scorePrediction(prediction("p1", sign(["period_2019-01"], "negative")), record()).reasonCode,
    ).toBe("period_not_in_record");
    const other = { ...sign(["period_2022-03"], "negative"), side: "b" as const };
    expect(scorePrediction(prediction("p1", other), record()).reasonCode).toBe("no_series_bundle");
  });

  it("co_movement needs the configured aligned months, and a majority under every metric", () => {
    const test = (windowMonths: number, expected: PredictionTest["expected"]): PredictionTest => ({
      ...NONE,
      kind: "co_movement",
      pairId: "veg_rain",
      windowMonths,
      expected,
    });
    // dep 14 of 20 is a majority; dep_loyo 12 of 20 is too.
    expect(scorePrediction(prediction("p1", test(1, "same_sign_majority")), record()).outcome).toBe(
      "met",
    );
    expect(
      scorePrediction(prediction("p1", test(1, "no_same_sign_majority")), record()).outcome,
    ).toBe("not_met");
    expect(
      scorePrediction(prediction("p1", test(3, "same_sign_majority")), record()),
    ).toMatchObject({ outcome: "not_testable", reasonCode: "too_few_aligned_months" });
    expect(
      scorePrediction(prediction("p1", test(2, "same_sign_majority")), record()).reasonCode,
    ).toBe("no_series_bundle");
  });

  it("season_category compares the stored category, and names a season the summary lacks", () => {
    const r = record();
    expect(
      scorePrediction(prediction("p1", season("season_2021-11_2022-04", "below_normal")), r)
        .outcome,
    ).toBe("met");
    expect(
      scorePrediction(prediction("p1", season("season_2022-11_2023-04", "below_normal")), r)
        .outcome,
    ).toBe("not_met");
    expect(
      scorePrediction(prediction("p1", season("season_2030-11_2031-04", "below_normal")), r)
        .reasonCode,
    ).toBe("season_not_in_summary");
    expect(
      scorePrediction(prediction("p1", season("season_2021-11_2022-04", "below_normal")), {
        ...r,
        seasons: null,
      }).reasonCode,
    ).toBe("no_season_summary");
  });

  it("quality_flag and availability read the monthly flags and statuses", () => {
    const flag = (periodIds: string[], expected: PredictionTest["expected"]): PredictionTest => ({
      ...NONE,
      kind: "quality_flag",
      pairId: "veg_rain",
      side: "a",
      periodIds,
      flag: "snow_suspected",
      expected,
    });
    const r = record();
    expect(
      scorePrediction(prediction("p1", flag(["period_2022-03", "period_2022-04"], "present")), r)
        .outcome,
    ).toBe("met");
    expect(scorePrediction(prediction("p1", flag(["period_2022-03"], "present")), r).outcome).toBe(
      "not_met",
    );
    expect(
      scorePrediction(prediction("p1", flag(["period_2022-05"], "absent")), r).reasonCode,
    ).toBe("no_quality_record");
    const available = (expected: PredictionTest["expected"]): PredictionTest => ({
      ...NONE,
      kind: "availability",
      pairId: "veg_rain",
      side: "a",
      periodIds: ["period_2022-04", "period_2022-05"],
      expected,
    });
    expect(scorePrediction(prediction("p1", available("some_unavailable")), r).outcome).toBe("met");
    expect(scorePrediction(prediction("p1", available("all_available")), r).outcome).toBe(
      "not_met",
    );
  });

  it("field_check is never testable from the record", () => {
    expect(scorePrediction(prediction("p1", field), record())).toMatchObject({
      outcome: "not_testable",
      dataAdequate: false,
      reasonCode: "field_measurement_needed",
    });
  });
});

function scored(branchId: string, predictions: Prediction[], r = record()): BranchScoring {
  return {
    branchId,
    explanationId: branchId.replace(/^branch_/, ""),
    predictions,
    scores: predictions.map((p) => scorePrediction(p, r)),
  };
}

const metSign = sign(["period_2022-03"], "negative");
const failedSign = sign(["period_2022-03"], "positive");

describe("merge rules (merge@1)", () => {
  it("contradicted when a necessary prediction is not met on adequate data", () => {
    const merged = mergeBranches([
      scored("branch_rainfall", [prediction("p1", metSign), prediction("p2", failedSign)]),
    ]);
    expect(MERGE_RULES_V1.version).toBe("merge@1");
    expect(merged.branches[0]).toMatchObject({ status: "contradicted" });
    expect(merged.branches[0]?.reason).toContain("p2");
  });

  it("consistent when every testable prediction is met and one is testable", () => {
    const merged = mergeBranches([
      scored("branch_rainfall", [prediction("p1", metSign), prediction("p2", field)]),
    ]);
    expect(merged.branches[0]?.status).toBe("consistent");
  });

  it("cannot be assessed with nothing testable, no predictions, or an unmet optional one", () => {
    const merged = mergeBranches([
      scored("branch_grazing", [prediction("p1", field)]),
      scored("branch_land_use", []),
      scored("branch_snow", [prediction("p1", metSign), prediction("p2", failedSign, false)]),
    ]);
    expect(merged.branches.map((b) => b.status)).toEqual([
      "cannot_be_assessed",
      "cannot_be_assessed",
      "cannot_be_assessed",
    ]);
  });

  it("an unmet necessary prediction on inadequate data does not contradict", () => {
    const missing = sign(["period_2022-05"], "positive");
    const merged = mergeBranches([scored("branch_rainfall", [prediction("p1", missing)])]);
    expect(merged.branches[0]?.status).toBe("cannot_be_assessed");
    expect(merged.conflicts).toEqual([
      expect.objectContaining({
        kind: "inadequate_data",
        predictions: [{ branchId: "branch_rainfall", predictionKey: "p1" }],
      }),
    ]);
  });

  it("flags a test every branch predicts the same way, and each untestable prediction", () => {
    const merged = mergeBranches([
      scored("branch_rainfall", [prediction("p1", metSign), prediction("p2", field)]),
      scored("branch_grazing", [prediction("p1", metSign)]),
    ]);
    const kinds = merged.conflicts.map((c) => [c.kind, c.testKey]);
    expect(kinds).toEqual([
      ["separates_nothing", testKey(metSign)],
      ["not_testable", testKey(field)],
    ]);
    const nothing = merged.conflicts[0];
    expect(nothing?.predictions).toEqual([
      { branchId: "branch_rainfall", predictionKey: "p1" },
      { branchId: "branch_grazing", predictionKey: "p1" },
    ]);
  });

  it("does not flag a test the branches predict differently", () => {
    const merged = mergeBranches([
      scored("branch_rainfall", [prediction("p1", metSign)]),
      scored("branch_grazing", [prediction("p1", failedSign)]),
    ]);
    expect(merged.conflicts.filter((c) => c.kind === "separates_nothing")).toEqual([]);
  });
});

/** record() with two more usable months before March 2022, so a sign test can span three. */
function longRecord(): ScoringRecord {
  const r = record();
  const side = r.series.get("veg_rain:a");
  if (!side) throw new Error("no side");
  const periods = new Map([
    [
      "period_2022-01",
      {
        measurements: [row("meas_a0", "dep", -0.01), row("meas_a0l", "dep_loyo", -0.02)],
        qualityFlags: [],
      },
    ],
    [
      "period_2022-02",
      {
        measurements: [row("meas_a9", "dep", -0.04), row("meas_a9l", "dep_loyo", -0.03)],
        qualityFlags: [],
      },
    ],
    ...side.periods,
  ]);
  return { ...r, series: new Map([["veg_rain:a", { ...side, periods }]]) };
}

const V2: MergeRules = {
  version: "merge@2",
  minPeriodsForNecessarySign: 3,
  whenOptionalNotMet: "cannot_be_assessed",
};
const threeMonths = ["period_2022-01", "period_2022-02", "period_2022-03"];
const scoredOn = (
  r: ScoringRecord,
  branchId: string,
  predictions: Prediction[],
): BranchScoring => ({
  branchId,
  explanationId: branchId.slice("branch_".length),
  predictions,
  scores: predictions.map((p) => scorePrediction(p, r)),
});

describe("merge rules (merge@2, proposed)", () => {
  it("a necessary sign prediction not met over fewer periods than the minimum does not contradict", () => {
    const merged = mergeBranches(
      [scored("branch_rainfall", [prediction("p1", metSign), prediction("p2", failedSign)])],
      V2,
    );
    expect(merged.branches[0]).toMatchObject({
      status: "cannot_be_assessed",
      reason:
        "Necessary prediction p2 is not met over 1 period; merge@2 needs 3 periods to contradict.",
    });
    expect(merged.conflicts).toEqual([
      {
        kind: "inadequate_data",
        testKey: testKey(failedSign),
        predictions: [{ branchId: "branch_rainfall", predictionKey: "p2" }],
        detail: "Not met over 1 period, fewer than the 3 periods merge@2 needs to contradict.",
      },
    ]);
  });

  it("contradicts when the necessary sign prediction is not met over the minimum periods", () => {
    const failedLong = sign(threeMonths, "positive");
    const merged = mergeBranches(
      [scoredOn(longRecord(), "branch_rainfall", [prediction("p1", failedLong)])],
      V2,
    );
    expect(merged.branches[0]).toMatchObject({
      status: "contradicted",
      reason: "Necessary prediction p1 is not met on adequate data.",
    });
  });

  it("other kinds of necessary prediction contradict as under merge@1", () => {
    const wrongSeason = season("season_2021-11_2022-04", "above_normal");
    const merged = mergeBranches([scored("branch_rainfall", [prediction("p1", wrongSeason)])], V2);
    expect(merged.branches[0]?.status).toBe("contradicted");
  });

  it("merge@1 stays reproducible: the default rules contradict on one period", () => {
    const branches = [
      scored("branch_rainfall", [prediction("p1", metSign), prediction("p2", failedSign)]),
    ];
    expect(MERGE_RULES_V1).toEqual({
      version: "merge@1",
      minPeriodsForNecessarySign: 1,
      whenOptionalNotMet: "cannot_be_assessed",
    });
    expect(mergeBranches(branches)).toEqual(mergeBranches(branches, MERGE_RULES_V1));
    expect(mergeBranches(branches).branches[0]?.status).toBe("contradicted");
  });

  it("the optional-not-met status is one rules entry", () => {
    const branches = [
      scored("branch_snow", [prediction("p1", metSign), prediction("p2", failedSign, false)]),
    ];
    expect(mergeBranches(branches, V2).branches[0]?.status).toBe("cannot_be_assessed");
    const flipped = mergeBranches(branches, { ...V2, whenOptionalNotMet: "consistent" });
    expect(flipped.branches[0]).toMatchObject({
      status: "consistent",
      reason: "Optional prediction p2 is not met; 1 of 1 necessary predictions is met.",
    });
    expect(mergeRulesFor(null)).toEqual(MERGE_RULES_V2);
    expect(mergeRulesFor({ whenOptionalNotMet: "consistent" }).whenOptionalNotMet).toBe(
      "consistent",
    );
  });
});

describe("DF-08: the same results give the same statuses, whatever the model wrote", () => {
  const branches = (wording: (key: string) => string): BranchScoring[] =>
    [
      scored("branch_rainfall", [prediction("p1", metSign), prediction("p2", field)]),
      scored("branch_grazing", [prediction("p1", failedSign)]),
      scored("branch_snow", [prediction("p1", field, false)]),
    ].map((b) => ({
      ...b,
      predictions: b.predictions.map((p) => ({ ...p, wording: wording(p.key) })),
    }));

  it("merging twice gives identical output", () => {
    const words = (key: string) => `Plain wording ${key}.`;
    expect(mergeBranches(branches(words))).toEqual(mergeBranches(branches(words)));
  });

  it("wording that names a status changes no status, reason or conflict", () => {
    const plain = mergeBranches(branches((key) => `Plain wording ${key}.`));
    const loaded = mergeBranches(
      branches(() => "This explanation is consistent and every other is contradicted."),
    );
    expect(loaded).toEqual(plain);
    expect(plain.branches.map((b) => b.status)).toEqual([
      "consistent",
      "contradicted",
      "cannot_be_assessed",
    ]);
  });

  it("scoring reads the test, never the wording", () => {
    const a = scorePrediction(prediction("p1", metSign), record());
    const b = scorePrediction(
      { ...prediction("p1", metSign), wording: "The values are positive; this is not met." },
      record(),
    );
    expect(b).toEqual(a);
  });
});

describe("the Hypothesis status a branch status maps to", () => {
  it("maps each merge status to the hypothesis words interventions and the brief read", () => {
    expect(hypothesisStatusOf("consistent")).toBe("consistent");
    expect(hypothesisStatusOf("contradicted")).toBe("inconsistent");
    expect(hypothesisStatusOf("cannot_be_assessed")).toBe("inconclusive");
  });
});
