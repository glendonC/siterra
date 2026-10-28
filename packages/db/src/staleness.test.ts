import type { Evidence } from "@siterra/contracts";
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
