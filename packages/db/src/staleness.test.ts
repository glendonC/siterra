import type { Brief, Evidence, Hypothesis } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { applyCommit } from "./commit.ts";
import { eventsAfter } from "./events.ts";
import { recordReview } from "./reviews.ts";
import { readSnapshot } from "./snapshot.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { exampleCase, exampleCommit, exampleEvidence } from "./test-records.ts";

let db: TestDatabase;
let pool: Pool;
const owner = "owner_example";
const record = exampleCase("case_example_staleness");

function accepted(id: string, revision: number, cites: [string, number][]): Evidence {
  const evidence = exampleEvidence(record.id, id, revision);
  return {
    ...evidence,
    status: "accepted",
    provenance: {
      ...evidence.provenance,
      inputVersions: cites.map(([entityId, r]) => ({ entityId, revision: r })),
    },
  };
}

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  await createCase(pool, record, owner);
});

afterAll(async () => {
  await db.drop();
});

describe("DF-03 and SA-04 (storage part): a changed input stales exactly its dependents, review included", () => {
  it("marks the dependent statement and the review on it stale in the same commit; history stays readable", async () => {
    await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_st1",
        expected: 1,
        upserts: [
          accepted("ev_example_base", 1, []),
          accepted("ev_example_dependent", 1, [["ev_example_base", 1]]),
          accepted("ev_example_other", 1, []),
        ],
      }),
    );
    const decision = await recordReview(pool, {
      caseId: record.id,
      ownerScopeId: owner,
      request: {
        role: "scientific",
        reviewedEntityVersions: [{ entityId: "ev_example_dependent", revision: 1 }],
        caseRevisionReviewed: 2,
        actionId: null,
        decision: "approved",
        conditions: [],
        comments: "Synthetic review comment.",
        mode: "demo",
        idempotencyKey: "staleness-review-0001",
      },
    });
    if (decision.status !== "created") throw new Error(decision.status);

    const outcome = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_st2",
        expected: 2,
        upserts: [accepted("ev_example_base", 2, [])],
      }),
    );
    if (outcome.status !== "committed") throw new Error(outcome.status);
    expect(outcome.commit.upserts.map((u) => [u.id, u.revision]).sort()).toEqual([
      ["ev_example_base", 2],
      ["ev_example_dependent", 2],
      [decision.decision.id, 2],
    ]);
    const staleEvent = outcome.commit.events.find((e) => e.kind === "entity.stale");
    expect(staleEvent?.entityIds.sort()).toEqual(
      [decision.decision.id, "ev_example_dependent"].sort(),
    );
    expect(staleEvent?.message).toBe("2 records need reassessment after an input changed");

    const snapshot = await readSnapshot(pool, record.id, owner);
    const evidence = new Map(
      snapshot?.records.evidenceRecords.map((e) => [e.id, [e.revision, e.status]]),
    );
    expect(evidence.get("ev_example_dependent")).toEqual([2, "stale"]);
    expect(evidence.get("ev_example_other")).toEqual([1, "accepted"]);
    expect(
      snapshot?.records.reviewDecisionRecords.map((d) => [d.revision, d.stale, d.status]),
    ).toEqual([[2, true, "approved"]]);

    const history = await pool.query<{ revision: number; stale: boolean }>(
      "select revision, (record ->> 'stale')::boolean as stale from review_records where case_id = $1 order by revision",
      [record.id],
    );
    expect(history.rows).toEqual([
      { revision: 1, stale: false },
      { revision: 2, stale: true },
    ]);
    expect(
      (await eventsAfter(pool, record.id, 0)).filter((e) => e.kind === "entity.stale"),
    ).toHaveLength(1);

    const fresh = await recordReview(pool, {
      caseId: record.id,
      ownerScopeId: owner,
      request: {
        role: "scientific",
        reviewedEntityVersions: [{ entityId: "ev_example_dependent", revision: 1 }],
        caseRevisionReviewed: 3,
        actionId: null,
        decision: "approved",
        conditions: [],
        comments: "Synthetic review comment.",
        mode: "demo",
        idempotencyKey: "staleness-review-0002",
      },
    });
    expect(fresh.status).toBe("stale");
  });

  it("a change of state stales only when it withdraws the record (a51)", async () => {
    const before = await readSnapshot(pool, record.id, owner);
    const revision = before?.case.revision ?? 0;
    const base = { ...accepted("ev_example_state", 1, []), status: "provisional" as const };
    const dependent = accepted("ev_example_state_dep", 1, [["ev_example_state", 1]]);
    await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_st3",
        expected: revision,
        upserts: [base, dependent],
      }),
    );

    const acceptedOnly = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_st4",
        expected: revision + 1,
        upserts: [{ ...base, revision: 2, status: "accepted" }],
      }),
    );
    if (acceptedOnly.status !== "committed") throw new Error(acceptedOnly.status);
    expect(acceptedOnly.commit.upserts.map((u) => u.id)).toEqual(["ev_example_state"]);
    expect(acceptedOnly.commit.events.some((e) => e.kind === "entity.stale")).toBe(false);

    const withdrawn = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_st5",
        expected: revision + 2,
        upserts: [{ ...base, revision: 3, status: "superseded" }],
      }),
    );
    if (withdrawn.status !== "committed") throw new Error(withdrawn.status);
    expect(withdrawn.commit.upserts.map((u) => u.id).sort()).toEqual([
      "ev_example_state",
      "ev_example_state_dep",
    ]);
  });
});

describe("DF-03 (storage part, brief): a changed input stales the hypothesis, the brief and the review on it", () => {
  it("follows evidence to hypothesis to brief to review in one commit, and leaves an uncited brief alone", async () => {
    const before = await readSnapshot(pool, record.id, owner);
    const revision = before?.case.revision ?? 0;
    const base = accepted("ev_example_brief_base", 1, []);
    const provenance = base.provenance;
    const hypothesis: Hypothesis = {
      recordType: "Hypothesis",
      id: "hyp_example_brief",
      revision: 1,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
      caseId: record.id,
      statement: "Synthetic hypothesis statement.",
      status: "consistent",
      supportingEvidenceIds: [base.id],
      contradictingEvidenceIds: [],
      missingEvidence: [],
      alternativeHypothesisIds: [],
      assessment: "Synthetic assessment.",
      provenance: { ...provenance, inputVersions: [{ entityId: base.id, revision: 1 }] },
    };
    const brief = (id: string, cites: { entityId: string; revision: number }[]): Brief => ({
      recordType: "Brief",
      id,
      revision: 1,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
      caseId: record.id,
      title: "Synthetic brief",
      status: "ready_for_review",
      sourceCaseRevision: revision,
      evidenceIds: [],
      hypothesisIds: cites.map((c) => c.entityId),
      interventionIds: [],
      actionIds: [],
      known: [],
      uncertain: [],
      nextMeasurements: [],
      stakeholderRoles: [],
      preparedActions: [],
      authorizationRequired: [],
      nextSteps: [],
      reviewDecisionIds: [],
      limitations: [],
      mode: "concept",
      provenance: { ...provenance, inputVersions: cites },
    });
    const first = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_brief1",
        expected: revision,
        upserts: [
          base,
          hypothesis,
          brief("brief_example_cites", [{ entityId: hypothesis.id, revision: 1 }]),
          brief("brief_example_uncited", []),
        ],
      }),
    );
    if (first.status !== "committed") throw new Error(first.status);
    const review = await recordReview(pool, {
      caseId: record.id,
      ownerScopeId: owner,
      request: {
        role: "scientific",
        reviewedEntityVersions: [{ entityId: "brief_example_cites", revision: 1 }],
        caseRevisionReviewed: revision + 1,
        actionId: null,
        decision: "approved",
        conditions: [],
        comments: "Synthetic review comment.",
        mode: "demo",
        idempotencyKey: "staleness-brief-review-0001",
      },
    });
    if (review.status !== "created") throw new Error(review.status);

    const changed = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_brief2",
        expected: revision + 1,
        upserts: [accepted("ev_example_brief_base", 2, [])],
      }),
    );
    if (changed.status !== "committed") throw new Error(changed.status);
    expect(changed.commit.upserts.map((u) => u.id).sort()).toEqual(
      [
        "brief_example_cites",
        "ev_example_brief_base",
        "hyp_example_brief",
        review.decision.id,
      ].sort(),
    );
    const snapshot = await readSnapshot(pool, record.id, owner);
    const briefs = new Map(
      snapshot?.records.briefRecords.map((b) => [b.id, [b.revision, b.status]]),
    );
    expect(briefs.get("brief_example_cites")).toEqual([2, "stale"]);
    expect(briefs.get("brief_example_uncited")).toEqual([1, "ready_for_review"]);
    expect(
      snapshot?.records.hypothesisRecords.find((h) => h.id === "hyp_example_brief")?.status,
    ).toBe("stale");
    expect(
      snapshot?.records.reviewDecisionRecords.find((d) => d.id === review.decision.id)?.stale,
    ).toBe(true);
  });
});
