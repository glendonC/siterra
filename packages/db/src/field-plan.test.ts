import type { Evidence, FieldPlan, Hypothesis, OperationalAction } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { applyCommit } from "./commit.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { exampleCase, exampleCommit, exampleEvidence } from "./test-records.ts";

const record = exampleCase("case_example_field_plan");
const at = "2026-10-27T20:00:00Z";

let db: TestDatabase;
let pool: Pool;
let revision = 1;

function gap(id: string): Evidence {
  return { ...exampleEvidence(record.id, id), claimKind: "field_requirement", status: "accepted" };
}

const hypothesis: Hypothesis = {
  recordType: "Hypothesis",
  id: "hyp_example_grazing",
  revision: 1,
  createdAt: at,
  updatedAt: at,
  caseId: record.id,
  statement: "Synthetic hypothesis statement.",
  status: "inconclusive",
  supportingEvidenceIds: [],
  contradictingEvidenceIds: [],
  missingEvidence: ["Synthetic missing evidence."],
  alternativeHypothesisIds: [],
  assessment: "Synthetic assessment.",
  provenance: exampleEvidence(record.id, "ev_example_unused").provenance,
};

function plan(gapIds: string[], deferred: string[] = []): FieldPlan {
  return {
    objective: "Synthetic objective.",
    decisionInformed: "Synthetic decision.",
    strata: [
      { key: "upper", label: "Upper band", definition: "Synthetic stratum.", dataBundleId: null },
    ],
    measurements: [
      {
        what: "Synthetic measurement",
        method: "Synthetic method",
        season: "Late spring",
        stratumKeys: ["upper"],
        fieldRole: "Local field team",
        resolvesGapIds: gapIds,
        discriminatesHypothesisIds: [hypothesis.id],
      },
    ],
    deferredGaps: deferred.map((gapId) => ({ gapId, reason: "Synthetic reason." })),
    permissions: [],
    consultationSteps: [],
  };
}

function action(
  id: string,
  fieldPlan: FieldPlan | undefined,
  status: OperationalAction["status"] = "awaiting_review",
  rev = 1,
): OperationalAction {
  return {
    recordType: "OperationalAction",
    id,
    revision: rev,
    createdAt: at,
    updatedAt: at,
    caseId: record.id,
    title: "Synthetic field-validation plan",
    description: "Synthetic test fixture.",
    kind: "field_validation_plan",
    status,
    evidenceIds: [],
    interventionIds: [],
    dependsOnActionIds: [],
    resourceRequirementIds: [],
    requiredReviewRoles: ["scientific"],
    reviewDecisionIds: [],
    authorizationMode: "demo_only",
    externalExecutionEnabled: false,
    remainingConditions: [],
    preparedArtifactUri: null,
    sourceCaseRevision: 1,
    ...(fieldPlan === undefined ? {} : { fieldPlan }),
  };
}

async function commit(id: string, upserts: Parameters<typeof exampleCommit>[1]["upserts"]) {
  const outcome = await applyCommit(
    pool,
    exampleCommit(record, { id, expected: revision, upserts }),
  );
  if (outcome.status === "committed") revision += 1;
  return outcome;
}

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  await createCase(pool, record, "owner_example");
  await commit("commit_example_fp_setup", [gap("ev_example_gap_grazing"), hypothesis]);
});

afterAll(async () => {
  await db.drop();
});

describe("DF-06 (storage part): a field-validation plan resolves or defers every open gap", () => {
  it("commits a plan whose measurement resolves the open gap", async () => {
    expect(
      (
        await commit("commit_example_fp_ok", [
          action("act_example_fp_ok", plan(["ev_example_gap_grazing"])),
        ])
      ).status,
    ).toBe("committed");
  });

  it("refuses a field-validation plan with no plan, and one that leaves a gap open", async () => {
    await expect(
      commit("commit_example_fp_none", [action("act_example_fp_none", undefined)]),
    ).rejects.toMatchObject({
      code: "field_plan_invalid",
      message: "act_example_fp_none: a field_validation_plan needs its field plan",
    });
    await expect(
      commit("commit_example_fp_open", [action("act_example_fp_open", plan([]))]),
    ).rejects.toMatchObject({
      code: "field_plan_invalid",
      message: "open gap ev_example_gap_grazing is neither measured nor deferred with a reason",
    });
  });

  it("counts a gap written in the same commit, so the plan must cover it too", async () => {
    await expect(
      commit("commit_example_fp_new_gap", [
        gap("ev_example_gap_rain"),
        action("act_example_fp_new", plan(["ev_example_gap_grazing"])),
      ]),
    ).rejects.toMatchObject({
      code: "field_plan_invalid",
      message: "open gap ev_example_gap_rain is neither measured nor deferred with a reason",
    });
    expect(
      (
        await commit("commit_example_fp_deferred", [
          gap("ev_example_gap_rain"),
          action(
            "act_example_fp_deferred",
            plan(["ev_example_gap_grazing"], ["ev_example_gap_rain"]),
          ),
        ])
      ).status,
    ).toBe("committed");
  });

  it("does not check a plan again when it is cancelled", async () => {
    expect(
      (
        await commit("commit_example_fp_cancel", [
          action("act_example_fp_ok", plan(["ev_example_gap_grazing"]), "cancelled", 2),
        ])
      ).status,
    ).toBe("committed");
  });
});
