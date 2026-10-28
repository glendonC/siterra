import type { OperationalAction, ReviewDecision } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { consultationOutstanding, preparedAction } from "./action-status.ts";

const at = "2026-10-27T20:00:00Z";
const action: OperationalAction = {
  recordType: "OperationalAction",
  id: "act_example_plan",
  revision: 3,
  createdAt: at,
  updatedAt: at,
  caseId: "case_example_status",
  title: "Example field-validation plan",
  description: "Synthetic test fixture.",
  kind: "field_validation_plan",
  status: "awaiting_review",
  evidenceIds: [],
  interventionIds: [],
  dependsOnActionIds: [],
  resourceRequirementIds: [],
  requiredReviewRoles: ["scientific", "community_livelihood"],
  reviewDecisionIds: [],
  authorizationMode: "demo_only",
  externalExecutionEnabled: false,
  remainingConditions: [],
  preparedArtifactUri: null,
  sourceCaseRevision: 1,
};

function decision(
  id: string,
  role: ReviewDecision["role"],
  status: ReviewDecision["status"],
  revision = 3,
): ReviewDecision {
  return {
    recordType: "ReviewDecision",
    id,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId: action.caseId,
    actionId: action.id,
    reviewedEntityVersions: [{ entityId: action.id, revision }],
    caseRevisionReviewed: 4,
    role,
    actorId: null,
    authorityStatus: "not_established",
    mode: "demo",
    status,
    decisionAt: at,
    conditions: [],
    comments: "Synthetic.",
    stale: false,
  };
}

const none = new Map<string, OperationalAction["status"]>();

describe("preparedAction", () => {
  it("prepares on a scientific approval of the current version, keeping consultation outstanding", () => {
    const next = preparedAction(
      action,
      [decision("rev_example_s", "scientific", "approved")],
      none,
      "2026-10-27T21:00:00Z",
    );
    expect([
      next?.revision,
      next?.status,
      next?.remainingConditions,
      next?.reviewDecisionIds,
    ]).toEqual([4, "prepared", [consultationOutstanding], ["rev_example_s"]]);
  });

  it("does not prepare on a decision that is not approval, stale, or on an older version", () => {
    expect(
      preparedAction(
        action,
        [decision("rev_example_c", "scientific", "changes_requested")],
        none,
        at,
      ),
    ).toBeNull();
    expect(
      preparedAction(
        action,
        [{ ...decision("rev_example_t", "scientific", "approved"), stale: true }],
        none,
        at,
      ),
    ).toBeNull();
    expect(
      preparedAction(action, [decision("rev_example_o", "scientific", "approved", 2)], none, at),
    ).toBeNull();
  });

  it("waits for every action it depends on and never prepares from community review alone", () => {
    const dependent = { ...action, dependsOnActionIds: ["act_example_first"] };
    const approval = [decision("rev_example_s", "scientific", "approved")];
    expect(
      preparedAction(dependent, approval, new Map([["act_example_first", "awaiting_review"]]), at),
    ).toBeNull();
    expect(
      preparedAction(dependent, approval, new Map([["act_example_first", "prepared"]]), at)?.status,
    ).toBe("prepared");
    const communityOnly = { ...action, requiredReviewRoles: ["community_livelihood" as const] };
    expect(
      preparedAction(
        communityOnly,
        [decision("rev_example_d", "community_livelihood", "deferred")],
        none,
        at,
      ),
    ).toBeNull();
  });

  it("leaves an action that is not awaiting review", () => {
    expect(
      preparedAction(
        { ...action, status: "draft" },
        [decision("rev_example_s", "scientific", "approved")],
        none,
        at,
      ),
    ).toBeNull();
  });
});

describe("13b: only each role's latest decision on the current version counts", () => {
  const at2 = "2026-10-27T20:30:00Z";
  const timed = (d: ReviewDecision, when: string): ReviewDecision => ({
    ...d,
    decisionAt: when,
    createdAt: when,
  });

  it.each(["rejected", "changes_requested"] as const)(
    "approved, then %s: not prepared",
    (later) => {
      const decisions = [
        timed(decision("rev_example_first", "scientific", "approved"), at),
        timed(decision("rev_example_second", "scientific", later), at2),
      ];
      expect(preparedAction(action, decisions, none, at2)).toBeNull();
    },
  );

  it("changes requested, then approved: prepared", () => {
    const decisions = [
      timed(decision("rev_example_first", "scientific", "changes_requested"), at),
      timed(decision("rev_example_second", "scientific", "approved"), at2),
    ];
    expect(preparedAction(action, decisions, none, at2)?.status).toBe("prepared");
  });
});
