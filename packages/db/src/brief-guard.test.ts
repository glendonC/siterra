import type { Brief } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { CommitRejected, applyCommit, uncoveredBriefCitations } from "./commit.ts";
import { readSnapshot } from "./snapshot.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { exampleCase, exampleCommit, exampleEvidence } from "./test-records.ts";

const owner = "owner_example";
const record = exampleCase("case_example_brief_guard");
const evidence = exampleEvidence(record.id, "ev_example_guard");

let db: TestDatabase;
let pool: Pool;

function brief(
  id: string,
  lists: Partial<Pick<Brief, "evidenceIds" | "hypothesisIds" | "interventionIds" | "actionIds">>,
  cites: { entityId: string; revision: number }[],
): Brief {
  return {
    recordType: "Brief",
    id,
    revision: 1,
    createdAt: evidence.createdAt,
    updatedAt: evidence.updatedAt,
    caseId: record.id,
    title: "Synthetic brief",
    status: "draft",
    sourceCaseRevision: 1,
    evidenceIds: [],
    hypothesisIds: [],
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
    provenance: { ...evidence.provenance, inputVersions: cites },
    ...lists,
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

describe("a brief cites every evidence, hypothesis and intervention it names (DF-03 guard)", () => {
  it("lists the names its provenance does not cite, at any revision; other records list none", () => {
    expect(
      uncoveredBriefCitations(
        brief(
          "brief_example_lists",
          {
            evidenceIds: ["ev_example_a"],
            hypothesisIds: ["hyp_example_a"],
            interventionIds: ["int_example_a"],
            actionIds: ["act_example_a"],
          },
          [
            { entityId: "ev_example_a", revision: 3 },
            { entityId: "hyp_example_a", revision: 1 },
          ],
        ),
      ),
    ).toEqual(["int_example_a"]);
    expect(uncoveredBriefCitations(evidence)).toEqual([]);
  });

  it("refuses a commit with an uncited brief and writes nothing", async () => {
    const commit = exampleCommit(record, {
      id: "commit_example_guard_refused",
      expected: 1,
      upserts: [evidence, brief("brief_example_uncited", { evidenceIds: [evidence.id] }, [])],
    });
    await expect(applyCommit(pool, commit)).rejects.toBeInstanceOf(CommitRejected);
    await expect(applyCommit(pool, commit)).rejects.toMatchObject({
      code: "brief_inputs_not_cited",
      message: `brief_example_uncited: provenance.inputVersions does not cite ${evidence.id}`,
    });
    const snapshot = await readSnapshot(pool, record.id, owner);
    expect([snapshot?.case.revision, snapshot?.records.briefRecords]).toEqual([1, []]);
  });

  it("commits a brief that cites what it names; action IDs are not required to be cited", async () => {
    const outcome = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_guard_ok",
        expected: 1,
        upserts: [
          evidence,
          brief(
            "brief_example_cited",
            { evidenceIds: [evidence.id], actionIds: ["act_example_guard"] },
            [{ entityId: evidence.id, revision: 1 }],
          ),
        ],
      }),
    );
    expect(outcome.status).toBe("committed");
  });
});
