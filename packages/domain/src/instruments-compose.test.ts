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
    expect(roundHalfAwayFromZero(0.285, 0, 2)).toBe(29);
    expect(roundHalfAwayFromZero(1.5e-7, 7)).toBe(2e-7);
    expect(roundHalfAwayFromZero(0, 3)).toBe(0);
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

  describe("specimen-style captions", () => {
    const interval = {
      kind: "interval",
      lower: 0.00457,
      upper: 0.01356,
      level: 0.95,
      method: "95% interval",
    };
    const period = {
      assetKey: "a",
      jsonPointer: "/x",
      stratum: "s",
      claimKind: "model_estimate",
      period: { start: "2000", end: "2025", window: "mar_jun" },
      lowerJsonPointer: "/l",
      upperJsonPointer: "/u",
    };
    const records = [
      measurement("meas_example_r2", 0.00906, { uncertainty: interval, source: period }),
      measurement("meas_example_n", 2316.8),
      measurement("meas_example_a", 0.4004),
      measurement("meas_example_b", 0.0596),
    ];
    const ruleWith = (
      ink: string,
      grey: string,
      numbers: object,
      citationIds: string[],
      holds?: object[],
    ) =>
      CaseAnalysisConfig.parse({
        ...config,
        instruments: [
          {
            ...scatterRule,
            caption: {
              ...scatterRule.caption,
              ink,
              grey,
              numbers,
              citationIds,
              ...(holds ? { holds } : {}),
            },
          },
        ],
      });
    const numbers = {
      trend: { measurementId: "meas_example_r2", part: "value", decimals: 4, style: "signed" },
      limit: { measurementId: "meas_example_n", part: "value", decimals: 0, style: "grouped" },
      start: { measurementId: "meas_example_r2", part: "period_start", decimals: 0 },
      end: { measurementId: "meas_example_r2", part: "period_end", decimals: 0 },
      cover: { sumOf: ["meas_example_a", "meas_example_b"], decimals: 0, style: "percent" },
      level: { measurementId: "meas_example_r2", part: "level", decimals: 0, style: "percent" },
      share: { measurementId: "meas_example_a", part: "value", decimals: 1, style: "percent" },
    };
    const cited = ["meas_example_r2", "meas_example_n", "meas_example_a", "meas_example_b"];

    it("writes signed, grouped, period, percent and summed numbers rounded once", () => {
      const cfg = ruleWith(
        "{trend} NDVI per decade below {limit} m, March to June, {start} to {end}.",
        "{cover} of the pixel is tree cover and cropland, {share} is tree cover; every {level} interval lies above zero.",
        numbers,
        cited,
      );
      const spec = composeInstruments(inputs({ config: cfg, measurements: records })).specs[0];
      expect(spec?.caption.ink).toBe(
        "+0.0091 NDVI per decade below 2,317 m, March to June, 2000 to 2025.",
      );
      expect(spec?.caption.grey).toBe(
        "46% of the pixel is tree cover and cropland, 40.0% is tree cover; every 95% interval lies above zero.",
      );
    });

    it("writes a negative number with a minus sign and a signed zero without one", () => {
      const cfg = ruleWith(
        "{trend} per decade, {zero}.",
        "A fit; {limit}.",
        {
          trend: { measurementId: "meas_example_r2", part: "value", decimals: 4, style: "signed" },
          zero: { measurementId: "meas_example_n", part: "value", decimals: 0, style: "signed" },
          limit: { measurementId: "meas_example_n", part: "value", decimals: 0 },
        },
        ["meas_example_r2", "meas_example_n"],
      );
      const spec = composeInstruments(
        inputs({
          config: cfg,
          measurements: [
            measurement("meas_example_r2", -0.00906),
            measurement("meas_example_n", 0),
          ],
        }),
      ).specs[0];
      expect(spec?.caption.ink).toBe("-0.0091 per decade, 0.");
    });

    it("blocks a held claim the record contradicts, and opens when it holds", () => {
      const holds = [{ measurementId: "meas_example_r2", part: "lower", above: 0 }];
      const cfg = ruleWith(
        "{trend} NDVI per decade.",
        "Every interval lies above zero.",
        { trend: numbers.trend },
        ["meas_example_r2"],
        holds,
      );
      expect(composeInstruments(inputs({ config: cfg, measurements: records })).specs).toHaveLength(
        1,
      );
      const crossing = measurement("meas_example_r2", 0.00906, {
        uncertainty: { ...interval, lower: -0.001 },
      });
      const blocked = composeInstruments(inputs({ config: cfg, measurements: [crossing] }));
      expect(blocked.specs).toEqual([]);
      expect(blocked.blocked[0]?.reasons).toEqual([
        "meas_example_r2 lower is not above 0, but the caption says it is",
      ]);
    });

    it("writes the native resolution of a Measurement, and blocks one that states none", () => {
      const cfg = ruleWith(
        "This {res} m pixel.",
        "A fit; {limit}.",
        {
          res: { measurementId: "meas_example_r2", part: "resolution_m", decimals: 0 },
          limit: numbers.limit,
        },
        ["meas_example_r2", "meas_example_n"],
      );
      const sized = measurement("meas_example_r2", 0.00906, { spatialResolutionM: 250 });
      expect(
        composeInstruments(inputs({ config: cfg, measurements: [sized, records[1] as never] }))
          .specs[0]?.caption.ink,
      ).toBe("This 250 m pixel.");
      const none = measurement("meas_example_r2", 0.00906, { spatialResolutionM: null });
      expect(
        composeInstruments(inputs({ config: cfg, measurements: [none, records[1] as never] }))
          .blocked[0]?.reasons[0],
      ).toContain("has no resolution_m to show");
    });

    it("does not accept a bound that is only reached: a lower end of exactly zero is not above zero", () => {
      const holds = [{ measurementId: "meas_example_r2", part: "lower", above: 0 }];
      const cfg = ruleWith(
        "{trend} NDVI per decade.",
        "Every interval lies above zero.",
        { trend: numbers.trend },
        ["meas_example_r2"],
        holds,
      );
      const zero = measurement("meas_example_r2", 0.00906, {
        uncertainty: { ...interval, lower: 0 },
      });
      expect(composeInstruments(inputs({ config: cfg, measurements: [zero] })).specs).toEqual([]);
    });

    it("blocks a period or level the Measurement does not state", () => {
      const cfg = ruleWith(
        "{start} to {end}.",
        "A fit; {level}.",
        {
          start: numbers.start,
          end: numbers.end,
          level: numbers.level,
        },
        ["meas_example_r2"],
      );
      const bare = measurement("meas_example_r2", 0.00906);
      expect(
        composeInstruments(inputs({ config: cfg, measurements: [bare] })).blocked[0]?.reasons,
      ).toEqual([
        "meas_example_r2 has no period_start to show (status available)",
        "meas_example_r2 has no period_end to show (status available)",
        "meas_example_r2 has no level to show (status available)",
      ]);
    });

    it("blocks a sum when one of its Measurements is not available", () => {
      const cfg = ruleWith(
        "{cover} of the pixel.",
        "A fit; {limit}.",
        { cover: numbers.cover, limit: numbers.limit },
        cited,
      );
      const result = composeInstruments(
        inputs({
          config: cfg,
          measurements: [
            records[1] as never,
            records[2] as never,
            measurement("meas_example_b", null),
          ],
        }),
      );
      expect(result.blocked[0]?.reasons[0]).toContain("meas_example_b");
    });
  });

  it("opens an instrument only when the bundles and asset keys it draws exist", () => {
    const drawn = (bundleId: string, assetKey: string) => ({
      ...scatterRule,
      parameters: {
        ...scatterRule.parameters,
        drawnAssets: [{ role: "catchment_outline", asset: { bundleId, assetKey } }],
      },
    });
    const withDrawn = (rule: unknown) =>
      CaseAnalysisConfig.parse({ ...config, instruments: [rule] });
    const ok = composeInstruments(
      inputs({ config: withDrawn(drawn("bundle_example_rain", "outline")) }),
    );
    expect(ok.specs[0]?.provenance.inputVersions).toContainEqual({
      entityId: "bundle_example_rain",
      revision: 3,
    });
    const missingBundle = composeInstruments(
      inputs({ config: withDrawn(drawn("bundle_example_gone", "outline")) }),
    );
    expect(missingBundle.blocked[0]?.reasons).toEqual([
      "The bundle bundle_example_gone is not in the case",
    ]);
    const missingKey = composeInstruments(
      inputs({
        config: withDrawn(drawn("bundle_example_rain", "outline")),
        hasAsset: (r) => r.assetKey !== "outline",
      }),
    );
    expect(missingKey.blocked[0]?.reasons).toEqual([
      "The bundle bundle_example_rain lists no asset outline",
    ]);
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
