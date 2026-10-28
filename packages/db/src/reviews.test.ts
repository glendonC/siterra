import type { OperationalAction, ReviewRequest } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { applyCommit } from "./commit.ts";
import { eventsAfter } from "./events.ts";
import { consultationCondition, recordReview } from "./reviews.ts";
import { readSnapshot } from "./snapshot.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { at, exampleCase, exampleCommit } from "./test-records.ts";

let db: TestDatabase;
let pool: Pool;
const owner = "owner_example";
const record = exampleCase("case_example_reviews");

function action(revision: number): OperationalAction {
  return {
    recordType: "OperationalAction",
    id: "act_example_field_plan",
    revision,
    createdAt: at,
    updatedAt: at,
    caseId: record.id,
    title: "Example feasibility plan",
    description: "Synthetic test fixture.",
    kind: "feasibility_plan",
    status: "awaiting_review",
    evidenceIds: [],
    interventionIds: [],
    dependsOnActionIds: [],
    resourceRequirementIds: [],
    requiredReviewRoles: ["scientific", "community_livelihood", "program_coordination"],
    reviewDecisionIds: [],
    authorizationMode: "demo_only",
    externalExecutionEnabled: false,
    remainingConditions: [],
    preparedArtifactUri: null,
    sourceCaseRevision: 1,
  };
}

function review(key: string, overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    role: "scientific",
    reviewedEntityVersions: [{ entityId: "act_example_field_plan", revision: 1 }],
    caseRevisionReviewed: 2,
    actionId: "act_example_field_plan",
    decision: "approved",
    conditions: [],
    comments: "Synthetic review comment.",
    mode: "demo",
    idempotencyKey: key,
    ...overrides,
  };
}

const submit = (request: ReviewRequest) =>
  recordReview(pool, { caseId: record.id, ownerScopeId: owner, request });

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  await createCase(pool, record, owner);
  await applyCommit(
    pool,
    exampleCommit(record, { id: "commit_example_action", expected: 1, upserts: [action(1)] }),
  );
});

afterAll(async () => {
  await db.drop();
});

describe("SA-03 (storage part): scientific review recorded while consultation stays outstanding", () => {
  it("records the scientific decision and the community deferral as separate demo decisions", async () => {
    const scientific = await submit(review("review-key-0001"));
    expect(scientific.status).toBe("created");
    const community = await submit(
      review("review-key-0002", {
        role: "community_livelihood",
        decision: "deferred",
        conditions: [],
      }),
    );
    expect(community.status).toBe("created");
    if (scientific.status !== "created" || community.status !== "created") return;
    for (const d of [scientific.decision, community.decision]) {
      expect([d.mode, d.authorityStatus, d.actorId, d.stale]).toEqual([
        "demo",
        "not_established",
        null,
        false,
      ]);
    }
    // "Mark consultation required": deferred with the consultation condition, so the case still
    // shows it although the scientific review is approved.
    expect([community.decision.status, community.decision.conditions]).toEqual([
      "deferred",
      [consultationCondition],
    ]);
    expect(scientific.decision.status).toBe("approved");
    const events = await eventsAfter(pool, record.id, 0);
    expect(events.filter((e) => e.kind === "review.recorded").map((e) => e.message)).toEqual([
      "Scientific review recorded in demo mode.",
      "Community consultation marked as required.",
    ]);
  });
});

describe("role and mode rules", () => {
  it('"Defer decision" by another role records deferred with no condition added', async () => {
    const deferred = await submit(
      review("review-key-0010", { role: "program_coordination", decision: "deferred" }),
    );
    expect(
      deferred.status === "created"
        ? [deferred.decision.status, deferred.decision.conditions]
        : null,
    ).toEqual(["deferred", []]);
  });

  it("refuses an approval by the community and livelihood role in the demo", async () => {
    expect((await submit(review("review-key-0003", { role: "community_livelihood" }))).status).toBe(
      "not_permitted",
    );
  });

  it("refuses a real-mode decision, since no authority can be established here", async () => {
    expect((await submit(review("review-key-0004", { mode: "real" }))).status).toBe(
      "not_permitted",
    );
  });
});

describe("stale versions and retries", () => {
  it("returns the stored decision for a repeated key and refuses the key with another body", async () => {
    const first = await submit(review("review-key-0005", { decision: "changes_requested" }));
    expect(first.status).toBe("created");
    expect(await submit(review("review-key-0005", { decision: "changes_requested" }))).toEqual({
      status: "existing",
      decision: first.status === "created" ? first.decision : null,
    });
    expect(await submit(review("review-key-0005", { decision: "rejected" }))).toEqual({
      status: "key_reused",
    });
  });

  it("refuses an unknown entity, then a stale case revision, then a stale entity version", async () => {
    const unknown = await submit(
      review("review-key-0006", {
        reviewedEntityVersions: [{ entityId: "act_example_missing", revision: 1 }],
      }),
    );
    expect(unknown.status).toBe("invalid");
    await applyCommit(
      pool,
      exampleCommit(record, { id: "commit_example_action_2", expected: 2, upserts: [action(2)] }),
    );
    const staleCase = await submit(review("review-key-0007", { caseRevisionReviewed: 2 }));
    expect(staleCase.status).toBe("stale");
    const staleEntity = await submit(review("review-key-0008", { caseRevisionReviewed: 3 }));
    expect(staleEntity).toMatchObject({
      status: "stale",
      issues: [{ code: "stale_reference", path: "/reviewedEntityVersions/0" }],
    });
    const current = await submit(
      review("review-key-0009", {
        caseRevisionReviewed: 3,
        reviewedEntityVersions: [{ entityId: "act_example_field_plan", revision: 2 }],
      }),
    );
    expect(current.status).toBe("created");
  });
});

describe("SA-03 (action part): an action is prepared only when its completable reviews approve it", () => {
  it("stays awaiting review while program review is missing, then is prepared (demo) with consultation outstanding", async () => {
    const other = exampleCase("case_example_prepare");
    await createCase(pool, other, owner);
    const plan = {
      ...action(1),
      caseId: other.id,
      requiredReviewRoles: ["scientific", "community_livelihood", "program_coordination"] as const,
    };
    await applyCommit(
      pool,
      exampleCommit(other, {
        id: "commit_example_prepare",
        expected: 1,
        upserts: [{ ...plan, requiredReviewRoles: [...plan.requiredReviewRoles] }],
      }),
    );
    const decide = (key: string, overrides: Partial<ReviewRequest>) =>
      recordReview(pool, {
        caseId: other.id,
        ownerScopeId: owner,
        request: review(key, overrides),
      });

    expect((await decide("prepare-0001", {})).status).toBe("created");
    let snapshot = await readSnapshot(pool, other.id, owner);
    expect(snapshot?.records.operationalActionRecords.map((a) => [a.revision, a.status])).toEqual([
      [1, "awaiting_review"],
    ]);
    expect(snapshot?.case.revision).toBe(2);

    expect(
      (await decide("prepare-0002", { role: "community_livelihood", decision: "deferred" })).status,
    ).toBe("created");
    const program = await decide("prepare-0003", { role: "program_coordination" });
    expect(program.status).toBe("created");
    snapshot = await readSnapshot(pool, other.id, owner);
    const prepared = snapshot?.records.operationalActionRecords[0];
    expect([prepared?.revision, prepared?.status, snapshot?.case.revision]).toEqual([
      2,
      "prepared",
      3,
    ]);
    expect(prepared?.remainingConditions).toEqual([
      "Community consultation outstanding",
      "Local consultation required",
    ]);
    expect(prepared?.reviewDecisionIds).toHaveLength(3);
    expect(prepared?.externalExecutionEnabled).toBe(false);

    const late = await decide("prepare-0004", { decision: "changes_requested" });
    expect(late.status).toBe("stale");
  });
});
