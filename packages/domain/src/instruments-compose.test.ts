import { CaseAnalysisConfig } from "@siterra/contracts";
import type { Measurement } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import {
  type ComposeInputs,
  composeInstruments,
  roundHalfAwayFromZero,
} from "./instruments-compose.ts";

const at = "2026-10-29T12:00:00Z";
const ref = (bundleId: string, assetKey: string) => ({ bundleId, assetKey });

const scatterRule = {
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
    ink: "Rain explains {share} of the variation in greenness.",
    grey: "A fit over {seasons} seasons; it describes the record and does not explain it.",
    claimKind: "model_estimate",
    citationIds: ["meas_example_r2", "meas_example_n"],
    numbers: {
      share: { measurementId: "meas_example_r2", part: "value", decimals: 3 },
      seasons: { measurementId: "meas_example_n", part: "value", decimals: 0 },
    },
  },
};
const planRule = {
  from: "branch_merge",
  id: "field_plan_rule",
  whenExplanationIds: ["rainfall"],
  caption: {
    ink: "A field plan is proposed for the explanations still open.",
    grey: "Proposed, not scheduled.",
  },
};
const stackRule = {
  from: "parameters",
  id: "layer_stack_rule",
  whenExplanationIds: ["irrigation"],
  parameters: {
    kind: "layer_stack",
    geoSelectionId: "geo_example_plain",
    relief: ref("bundle_example_relief", "surface"),
    layers: [{ layer: "rainfall", data: ref("bundle_example_rain", "cells") }],
    drainageFeatureIds: ["ctx_example_drain"],
    placeFeatureIds: ["ctx_example_outlet"],
    selectedLayer: "rainfall",
  },
  caption: {
    ink: "Sheets stand over the relief.",
    grey: "Drawn from the cited bundles.",
    claimKind: "observation",
    citationIds: ["meas_example_r2"],
    numbers: {},
  },
};

const config = CaseAnalysisConfig.parse({
  configVersion: 1,
  caseId: "case_example_plain",
  areaLabel: "plain",
  seriesPairs: [
    {
      id: "pair",
      a: { label: "a", metrics: ["m"], methodId: "ma" },
      b: { label: "b", metrics: ["m"], methodId: "mb", storedDecimals: 2 },
      windowsMonths: [0],
      minAlignedMonths: 6,
    },
  ],
  fieldChecks: [],
  rainfallSeason: {
    id: "s",
    label: "Season",
    startMonth: 6,
    endMonth: 9,
    recipe: { recipeId: "season_summary", version: "1.0.0" },
  },
  explanations: [
    { id: "rainfall", label: "Rainfall", statement: "Less rain lowered greenness." },
    { id: "irrigation", label: "Irrigation", statement: "Less irrigation lowered greenness." },
  ],
  instruments: [scatterRule, planRule, stackRule],
});

const measurement = (id: string, value: number | null, extra: object = {}) =>
  ({
    recordType: "Measurement",
    id,
    revision: 2,
    status: value === null ? "missing" : "available",
    value,
    uncertainty: { kind: "not_quantified", lower: null, upper: null, level: null, method: null },
    ...extra,
  }) as unknown as Measurement;

function inputs(patch: Partial<ComposeInputs> = {}): ComposeInputs {
  return {
    caseId: "case_example_plain",
    config,
    openExplanationIds: ["rainfall", "irrigation"],
    geoSelectionId: "geo_example_plain",
    geoSelections: [{ id: "geo_example_plain", revision: 1 }] as never,
    dataBundles: [
      { id: "bundle_example_rain", revision: 3, status: "validated" },
      { id: "bundle_example_relief", revision: 1, status: "validated" },
    ] as never,
    contextFeatures: [
      { id: "ctx_example_drain", revision: 1, role: "drainage" },
      { id: "ctx_example_outlet", revision: 1, role: "outlet" },
    ] as never,
    measurements: [measurement("meas_example_r2", 0.03699), measurement("meas_example_n", 26)],
    evidence: [],
    branchMerges: [],
    hasAsset: () => true,
    now: at,
    ...patch,
  };
}

describe("roundHalfAwayFromZero", () => {
  it("rounds the decimal text once, half away from zero", () => {
    expect(roundHalfAwayFromZero(0.02675, 4)).toBe(0.0268);
    expect(roundHalfAwayFromZero(-0.02675, 4)).toBe(-0.0268);
    expect(roundHalfAwayFromZero(0.03699, 3)).toBe(0.037);
    expect(roundHalfAwayFromZero(26, 0)).toBe(26);
  });
});

describe("composeInstruments", () => {
  it("composes a complete spec from a rule, writing the cited numbers into the caption", () => {
    const { specs } = composeInstruments(inputs());
    const scatter = specs.find((s) => s.id === "inst_rainfall_scatter_rule");
    expect(scatter?.caption.ink).toBe("Rain explains 0.037 of the variation in greenness.");
    expect(scatter?.caption.grey).toContain("over 26 seasons");
    expect(scatter?.status).toBe("ready");
    expect(scatter?.provenance.inputVersions).toEqual(
      expect.arrayContaining([
        { entityId: "geo_example_plain", revision: 1 },
        { entityId: "bundle_example_rain", revision: 3 },
        { entityId: "meas_example_r2", revision: 2 },
      ]),
    );
    expect(scatter?.provenance.dataBundleIds).toEqual(["bundle_example_rain"]);
  });

  it("is deterministic: the same records give the same specs", () => {
    expect(composeInstruments(inputs())).toEqual(composeInstruments(inputs()));
  });

  it("does not open a rule whose explanations are not in play", () => {
    const result = composeInstruments(inputs({ openExplanationIds: ["rainfall"] }));
    expect(result.notOpened).toEqual(["layer_stack_rule"]);
    expect(result.specs.map((s) => s.id)).toEqual(["inst_rainfall_scatter_rule"]);
  });

  it("reports a missing bundle, an unvalidated bundle and a missing asset as blocked, never as a spec", () => {
    const missing = composeInstruments(
      inputs({
        dataBundles: [{ id: "bundle_example_rain", revision: 3, status: "validated" }] as never,
      }),
    );
    expect(missing.blocked.find((b) => b.ruleId === "layer_stack_rule")?.reasons).toEqual([
      "The bundle bundle_example_relief is not in the case",
    ]);
    expect(missing.specs.map((s) => s.id)).not.toContain("inst_layer_stack_rule");

    const unvalidated = composeInstruments(
      inputs({
        dataBundles: [
          { id: "bundle_example_rain", revision: 3, status: "processing" },
          { id: "bundle_example_relief", revision: 1, status: "validated" },
        ] as never,
      }),
    );
    expect(unvalidated.blocked.map((b) => b.ruleId)).toContain("rainfall_scatter_rule");

    const noAsset = composeInstruments(inputs({ hasAsset: (r) => r.assetKey !== "surface" }));
    expect(noAsset.blocked.find((b) => b.ruleId === "layer_stack_rule")?.reasons).toEqual([
      "The bundle bundle_example_relief lists no asset surface",
    ]);
  });

  it("blocks a rule whose cited Measurement is missing, unavailable or has no interval end", () => {
    const gone = composeInstruments(inputs({ measurements: [measurement("meas_example_n", 26)] }));
    expect(gone.blocked[0]?.reasons[0]).toContain("meas_example_r2 is not in the case");
    const empty = composeInstruments(
      inputs({
        measurements: [measurement("meas_example_r2", null), measurement("meas_example_n", 26)],
      }),
    );
    expect(empty.blocked.find((b) => b.ruleId === "rainfall_scatter_rule")?.reasons[0]).toContain(
      "has no value to show",
    );
  });

  it("blocks a feature of the wrong role", () => {
    const wrong = composeInstruments(
      inputs({
        contextFeatures: [
          { id: "ctx_example_drain", revision: 1, role: "transect" },
          { id: "ctx_example_outlet", revision: 1, role: "outlet" },
        ] as never,
      }),
    );
    expect(wrong.blocked.find((b) => b.ruleId === "layer_stack_rule")?.reasons).toEqual([
      "ctx_example_drain has the role transect, not drainage",
    ]);
  });

  it("blocks a caption with a prohibited phrase", () => {
    const bad = CaseAnalysisConfig.parse({
      ...config,
      instruments: [
        {
          ...scatterRule,
          caption: { ...scatterRule.caption, ink: "Rain proves {share} of the change." },
        },
      ],
    });
    const result = composeInstruments(inputs({ config: bad }));
    expect(result.blocked[0]?.reasons.join()).toContain("banned word");
    expect(result.specs).toEqual([]);
  });

  it("rounds the decimal text once, half away from zero, in the caption", () => {
    const result = composeInstruments(
      inputs({
        measurements: [measurement("meas_example_r2", 0.02675), measurement("meas_example_n", 26)],
      }),
    );
    expect(result.specs.find((s) => s.id === "inst_rainfall_scatter_rule")?.caption.ink).toBe(
      "Rain explains 0.027 of the variation in greenness.",
    );
    const four = CaseAnalysisConfig.parse({
      ...config,
      instruments: [
        {
          ...scatterRule,
          caption: {
            ...scatterRule.caption,
            numbers: {
              ...scatterRule.caption.numbers,
              share: { measurementId: "meas_example_r2", part: "value", decimals: 4 },
            },
          },
        },
      ],
    });
    const spec = composeInstruments(
      inputs({
        config: four,
        measurements: [measurement("meas_example_r2", 0.02675), measurement("meas_example_n", 26)],
      }),
    ).specs[0];
    expect(spec?.caption.ink).toBe("Rain explains 0.0268 of the variation in greenness.");
  });

  it("does not show a number of a Measurement whose status is not available", () => {
    const result = composeInstruments(
      inputs({
        measurements: [
          measurement("meas_example_r2", 0.05, { status: "excluded" }),
          measurement("meas_example_n", 26),
        ],
      }),
    );
    expect(result.blocked.find((b) => b.ruleId === "rainfall_scatter_rule")?.reasons[0]).toContain(
      "has no value to show (status excluded)",
    );
  });

  it("blocks a citation that is neither Evidence nor a Measurement of the case, a missing area and a long sentence", () => {
    const withCitation = CaseAnalysisConfig.parse({
      ...config,
      instruments: [
        {
          ...scatterRule,
          caption: {
            ...scatterRule.caption,
            citationIds: [...scatterRule.caption.citationIds, "ev_example_gone"],
          },
        },
      ],
    });
    expect(composeInstruments(inputs({ config: withCitation })).blocked[0]?.reasons).toEqual([
      "ev_example_gone is not Evidence or a Measurement of the case",
    ]);
    expect(
      composeInstruments(inputs({ geoSelections: [] })).blocked.map((b) => b.reasons[0]),
    ).toContain("geo_example_plain is not a GeoSelection of the case");
    const long = CaseAnalysisConfig.parse({
      ...config,
      instruments: [
        {
          ...scatterRule,
          caption: {
            ...scatterRule.caption,
            ink: "Rain explains {share} of the variation. ".repeat(6).trim(),
          },
        },
      ],
    });
    expect(composeInstruments(inputs({ config: long })).blocked[0]?.reasons.join()).toContain(
      "over 200",
    );
  });

  it("blocks a slot that has no number even when the configuration was not parsed", () => {
    const loose = {
      ...config,
      instruments: [
        {
          ...scatterRule,
          caption: { ...scatterRule.caption, ink: "Rain explains {missing} of it." },
        },
      ],
    } as unknown as CaseAnalysisConfig;
    expect(composeInstruments(inputs({ config: loose })).blocked[0]?.reasons).toContain(
      "The slot {missing} has no number",
    );
  });

  it("blocks a grey sentence over its limit and a prohibited phrase in the grey sentence", () => {
    const grey = (text: string) =>
      CaseAnalysisConfig.parse({
        ...config,
        instruments: [
          { ...scatterRule, caption: { ...scatterRule.caption, grey: `${text} {seasons}` } },
        ],
      });
    const longGrey = grey("word ".repeat(50));
    expect(composeInstruments(inputs({ config: longGrey })).blocked[0]?.reasons.join()).toContain(
      "over 240",
    );
    const causal = grey("The greenness fell due to the dry seasons, over");
    expect(composeInstruments(inputs({ config: causal })).blocked[0]?.reasons.join()).toContain(
      "prohibited phrase",
    );
    const banned = grey("A significant fit over");
    expect(composeInstruments(inputs({ config: banned })).blocked[0]?.reasons.join()).toContain(
      "banned word",
    );
  });

  it("ignores a branch merge that has no field plan", () => {
    const result = composeInstruments(
      inputs({
        branchMerges: [{ id: "merge_example_1", revision: 4 }] as never,
        evidence: [
          { id: "ev_example_gap", revision: 1, claimKind: "field_requirement", status: "accepted" },
        ] as never,
      }),
    );
    expect(result.blocked.find((b) => b.ruleId === "field_plan_rule")?.reasons).toEqual([
      "The case holds no branch merge with a field plan",
    ]);
  });

  it("opens the field plan only with a branch merge that has one and accepted field requirements to cite", () => {
    const none = composeInstruments(inputs());
    expect(none.blocked.find((b) => b.ruleId === "field_plan_rule")?.reasons).toEqual([
      "The case holds no branch merge with a field plan",
      "The case holds no accepted field_requirement Evidence for the plan to cite",
    ]);
    const open = composeInstruments(
      inputs({
        branchMerges: [
          { id: "merge_example_1", revision: 4, fieldPlan: { measurements: [], unseparated: [] } },
        ] as never,
        evidence: [
          { id: "ev_example_gap", revision: 1, claimKind: "field_requirement", status: "accepted" },
        ] as never,
      }),
    );
    const plan = open.specs.find((s) => s.id === "inst_field_plan_rule");
    expect(plan?.parameters).toMatchObject({
      kind: "field_plan",
      branchMergeId: "merge_example_1",
      actionId: null,
    });
    expect(plan?.caption.citationIds).toEqual(["ev_example_gap"]);
    expect(plan?.provenance.inputVersions).toContainEqual({
      entityId: "merge_example_1",
      revision: 4,
    });
  });
});
