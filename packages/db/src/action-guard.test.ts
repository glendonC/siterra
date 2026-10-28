import type { OperationalAction } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { CommitRejected, applyCommit } from "./commit.ts";
import { readSnapshot } from "./snapshot.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { exampleCase, exampleCommit } from "./test-records.ts";

const owner = "owner_example";
const record = exampleCase("case_example_action_guard");
const at = "2026-10-27T20:00:00Z";

let db: TestDatabase;
let pool: Pool;

function action(id: string, status: OperationalAction["status"], revision = 1): OperationalAction {
  return {
    recordType: "OperationalAction",
    id,
    revision,
    createdAt: at,
    updatedAt: at,
    caseId: record.id,
    title: "Example feasibility plan",
    description: "Synthetic test fixture.",
    kind: "feasibility_plan",
    status,
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
}

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  await createCase(pool, record, owner);
});

afterAll(async () => {
  await db.drop();
});

describe("SA-02, SA-03 and DF-05 (storage part): an action is prepared only by its reviews", () => {
  it("refuses a task commit that writes an action as prepared, and writes nothing", async () => {
    const commit = exampleCommit(record, {
      id: "commit_example_prepared",
      expected: 1,
      upserts: [action("act_example_skips_review", "prepared")],
    });
    await expect(applyCommit(pool, commit)).rejects.toBeInstanceOf(CommitRejected);
    await expect(applyCommit(pool, commit)).rejects.toMatchObject({
      code: "action_status_not_permitted",
    });
    const snapshot = await readSnapshot(pool, record.id, owner);
    expect([snapshot?.case.revision, snapshot?.records.operationalActionRecords]).toEqual([1, []]);
  });

  it("commits an action a task drafts or sends for review", async () => {
    const outcome = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_awaiting",
        expected: 1,
        upserts: [
          action("act_example_draft", "draft"),
          action("act_example_awaiting", "awaiting_review"),
        ],
      }),
    );
    expect(outcome.status).toBe("committed");
  });
});
