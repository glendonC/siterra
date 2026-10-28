import type { FieldPlan } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { fieldPlanIssues } from "./field-plan.ts";

const context = {
  openGapIds: new Set(["ev_example_gap_grazing", "ev_example_gap_rain"]),
  hypothesisIds: new Set(["hyp_example_grazing", "hyp_example_drought"]),
};

function plan(overrides: Partial<FieldPlan> = {}): FieldPlan {
  return {
    objective: "Tell grazing pressure apart from the dry year in the upper band.",
    decisionInformed: "Whether a pasture rest is worth discussing with the commune.",
    strata: [
      {
        key: "upper_north",
        label: "Upper band, north-facing",
        definition: "Above 2600 m, aspect 315 to 45 degrees.",
        dataBundleId: null,
      },
      {
        key: "upper_south",
        label: "Upper band, south-facing",
        definition: "Above 2600 m, aspect 135 to 225 degrees.",
        dataBundleId: null,
      },
    ],
    measurements: [
      {
        what: "Herbaceous cover and grazing marks",
        method: "Quadrats along a transect",
        season: "Late spring",
        stratumKeys: ["upper_north", "upper_south"],
        fieldRole: "Local field team",
        resolvesGapIds: ["ev_example_gap_grazing"],
        discriminatesHypothesisIds: ["hyp_example_grazing", "hyp_example_drought"],
      },
    ],
    deferredGaps: [
      { gapId: "ev_example_gap_rain", reason: "Needs a station record the plan cannot collect." },
    ],
    permissions: ["Commune agreement to walk the upper pastures"],
    consultationSteps: ["Meet the agdal committee before the visit"],
    ...overrides,
  };
}

const action = (
  fieldPlan: FieldPlan | undefined,
  kind: "field_validation_plan" | "feasibility_plan" = "field_validation_plan",
) => ({
  id: "act_example_plan",
  kind,
  fieldPlan,
});

describe("DF-06 (domain part): field-validation plan rules", () => {
  it("accepts a plan whose measurements name gaps or hypotheses and that covers or defers every open gap", () => {
    expect(fieldPlanIssues(action(plan()), context)).toEqual([]);
  });

  it("needs a plan on a field_validation_plan and refuses one on any other kind", () => {
    expect(fieldPlanIssues(action(undefined), context)).toEqual([
      "act_example_plan: a field_validation_plan needs its field plan",
    ]);
    expect(fieldPlanIssues(action(plan(), "feasibility_plan"), context)).toEqual([
      "act_example_plan: only a field_validation_plan carries a field plan",
    ]);
    expect(fieldPlanIssues(action(undefined, "feasibility_plan"), context)).toEqual([]);
  });

  it("names a measurement without a purpose, unknown strata, gaps and hypotheses", () => {
    const base = plan().measurements[0];
    if (base === undefined) throw new Error("fixture");
    const issues = fieldPlanIssues(
      action(
        plan({
          measurements: [
            { ...base, resolvesGapIds: [], discriminatesHypothesisIds: [] },
            {
              ...base,
              stratumKeys: ["valley_floor"],
              resolvesGapIds: ["ev_example_unknown"],
              discriminatesHypothesisIds: ["hyp_example_unknown"],
            },
          ],
        }),
      ),
      context,
    );
    expect(issues).toEqual([
      "measurement 1: names no gap or hypothesis it would resolve",
      "measurement 2: stratum valley_floor is not defined",
      "measurement 2: ev_example_unknown is not an open gap",
      "measurement 2: hyp_example_unknown is not a hypothesis of the case",
      "open gap ev_example_gap_grazing is neither measured nor deferred with a reason",
    ]);
  });

  it("refuses a gap left open, deferred twice, both measured and deferred, or a stratum defined twice", () => {
    const strata = plan().strata;
    expect(fieldPlanIssues(action(plan({ deferredGaps: [] })), context)).toEqual([
      "open gap ev_example_gap_rain is neither measured nor deferred with a reason",
    ]);
    expect(
      fieldPlanIssues(
        action(
          plan({
            strata: [...strata, ...strata.slice(0, 1)],
            deferredGaps: [
              { gapId: "ev_example_gap_grazing", reason: "Synthetic reason." },
              { gapId: "ev_example_gap_rain", reason: "Synthetic reason." },
              { gapId: "ev_example_gap_rain", reason: "Synthetic reason." },
            ],
          }),
        ),
        context,
      ),
    ).toEqual([
      "stratum upper_north is defined twice",
      "gap ev_example_gap_grazing is both measured and deferred",
      "gap ev_example_gap_rain is deferred twice",
    ]);
  });
});
