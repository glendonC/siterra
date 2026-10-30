import {
  MemoryCaseStore,
  MetaAdapter,
  ReplayTransport,
  caseToolRegistry,
  parseReplayFile,
  runBriefPackageTask,
} from "@siterra/agent";
import type { EvidenceRecord, InterventionRecord, TaskRecord } from "@siterra/agent";
import { applyCommit, createCase, isReviewRequest, readSnapshot, submitCommand } from "@siterra/db";
import {
  exampleCase,
  exampleCommandRequest,
  exampleCommit,
  freshDatabase,
} from "@siterra/db/testing";
import type { TestDatabase } from "@siterra/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { workerDb } from "./db.ts";

// The review requests brief_package writes pass PLATFORM's own commit gate (isReviewRequest), so
// a task commit can request a review and never records a decision. Synthetic records and a
// synthetic replay; nothing here is a request anyone made.

const AT = "2026-10-27T20:00:00.000Z";
const CASE_ID = "case_test_review_request";
const OWNER = "scope_test_review_request";
const provenance = {
  sourceLocators: [],
  dataBundleIds: [],
  methodId: null,
  methodVersion: null,
  inputVersions: [],
  generatedByTaskId: null,
  generatedAt: AT,
  verificationStatus: "unverified" as const,
  limitations: [],
};
const NEED: EvidenceRecord = {
  recordType: "Evidence",
  id: "ev_test_need",
  revision: 1,
  createdAt: AT,
  updatedAt: AT,
  caseId: CASE_ID,
  statement: "Who decides pasture rest dates must be checked locally.",
  claimKind: "field_requirement",
  status: "accepted",
  geoSelectionId: null,
  periodIds: [],
  measurementIds: [],
  provenance,
  interpretation: null,
  uncertainty: "Not quantified.",
  reviewDecisionIds: [],
};
const REST: InterventionRecord = {
  recordType: "Intervention",
  id: "int_test_rest",
  revision: 1,
  createdAt: AT,
  updatedAt: AT,
  caseId: CASE_ID,
  title: "Negotiated seasonal rest within existing institutions",
  description: "If the field check confirms who sets rest dates, a rest could be discussed.",
  status: "candidate",
  evidenceIds: ["ev_test_need"],
  hypothesisIds: [],
  assumptions: ["The existing institutions set rest dates."],
  ecologicalConsiderations: [],
  livelihoodConsiderations: [],
  resourceRequirementIds: [],
  fieldValidationNeeded: ["Who decides pasture rest dates."],
  requiredReviewRoles: ["community_livelihood"],
  provenance,
};
const need = (text: string) => ({
  text,
  claimKind: "field_requirement",
  evidenceIds: ["ev_test_need"],
});
const PACKAGE = {
  action: {
    kind: "field_validation_plan",
    title: "Field check of pasture rest roles",
    description:
      "Find out who sets pasture rest dates, to inform which candidate response reviewers consider.",
    fieldPlan: {
      objective: "Find out who sets pasture rest dates.",
      decisionInformed: "Which candidate response reviewers consider.",
      strata: [
        {
          key: "upper_band",
          label: "Upper grazing band",
          definition: "Pasture above the summer settlements, used in late spring.",
        },
      ],
      measurements: [
        {
          what: "Who sets rest dates",
          method: "Interviews with institution roles",
          season: "Spring",
          stratumKeys: ["upper_band"],
          fieldRole: "Local field team",
          resolvesGapIds: ["ev_test_need"],
          discriminatesHypothesisIds: [],
          fieldCheckId: null,
        },
      ],
      deferredGaps: [],
      permissions: ["Agreement of the local pasture institution before any visit."],
      consultationSteps: ["Consultation with the local pasture institution."],
    },
    resources: [],
    evidenceIds: ["ev_test_need"],
    interventionIds: ["int_test_rest"],
  },
  brief: {
    known: [],
    uncertain: [],
    nextMeasurements: [
      need("Who sets rest dates; interviews with institution roles; spring; upper band."),
    ],
    stakeholderRoles: [need("The local pasture institution and the program team.")],
    preparedActions: [],
    authorizationRequired: [],
    nextSteps: [],
  },
  reviewRoles: ["scientific", "community_livelihood", "program_coordination"],
};

function task(commandId: string): TaskRecord {
  return {
    recordType: "Task",
    id: "task_test_brief",
    revision: 1,
    createdAt: AT,
    updatedAt: AT,
    caseId: CASE_ID,
    commandId,
    kind: "brief_package",
    question: "What goes in the brief?",
    status: "running",
    dependsOnTaskIds: [],
    inputVersions: [
      { entityId: "ev_test_need", revision: 1 },
      { entityId: "int_test_rest", revision: 1 },
    ],
    allowedTools: ["read_case", "propose_package", "request_review", "propose_layout"],
    outputEntityIds: [],
    idempotencyKey: "test-brief-0001",
    attempt: 1,
    maxModelRounds: 2,
    deadlineAt: "2026-10-27T20:03:00.000Z",
    budgetMicroUsd: 500_000,
    spentMicroUsd: 0,
    checkpointId: null,
    failureCode: null,
    missingInputs: [],
    startedAt: AT,
    finishedAt: null,
  };
}

/** The brief_package commit draft over the synthetic records, from one synthetic replay step. */
async function briefDraft(running: TaskRecord, expectedCaseRevision: number) {
  const store = new MemoryCaseStore();
  store.evidence.push(NEED);
  store.interventions.push(REST);
  let n = 0;
  const replay = parseReplayFile({
    format: "siterra-model-replay@1",
    origin: "synthetic",
    model: "muse-spark-1.3",
    description: "Synthetic brief package answer for a test.",
    steps: [
      {
        kind: "stream",
        requestId: "req_synthetic_brief",
        events: [
          { type: "response.output_text.delta", delta: JSON.stringify(PACKAGE) },
          {
            type: "response.completed",
            response: {
              id: "resp_synthetic_brief",
              status: "completed",
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          },
        ],
      },
    ],
  });
  const { commit } = await runBriefPackageTask(
    { task: running, expectedCaseRevision },
    {
      adapter: new MetaAdapter({
        transport: new ReplayTransport(replay),
        sleep: () => Promise.resolve(),
      }),
      trace: { emit: () => undefined },
      store,
      tools: caseToolRegistry(store, CASE_ID),
      newEvidenceId: () => `ev_test_${String((n += 1))}`,
      newRecordId: (prefix) => `${prefix}_test_${String((n += 1))}`,
      now: () => new Date(AT),
    },
  );
  return commit;
}

describe("brief_package review requests", () => {
  it("pass the commit gate for requests, one per role, with the catalog comment", async () => {
    const commit = await briefDraft(task("cmd_test_brief"), 3);
    const requests = commit.upserts.filter((r) => r.recordType === "ReviewDecision");
    expect(requests.map((r) => r.role)).toEqual([
      "scientific",
      "community_livelihood",
      "program_coordination",
    ]);
    for (const r of requests) expect(isReviewRequest(r), r.id).toBe(true);
  });
});

describe("brief_package on PostgreSQL", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await freshDatabase();
  });
  afterAll(async () => {
    await db.drop();
  });

  it("commits through PLATFORM's commit, and a revised input stales the brief and its review requests", async () => {
    const caseRecord = exampleCase(CASE_ID, 1);
    await createCase(db.pool, caseRecord, OWNER);
    const submitted = await submitCommand(db.pool, {
      caseId: CASE_ID,
      ownerScopeId: OWNER,
      request: exampleCommandRequest("key-test-brief-stale-1"),
    });
    if (submitted.status !== "created") throw new Error(submitted.status);
    const running = task(submitted.command.id);
    const base = (await readSnapshot(db.pool, CASE_ID, OWNER))?.case.revision ?? 0;
    // The inputs the brief rests on, committed first as an earlier task would have.
    const setup = await applyCommit(
      db.pool,
      exampleCommit(
        { ...caseRecord, revision: base },
        {
          id: "commit_test_brief_inputs",
          expected: base,
          upserts: [NEED, REST, running],
        },
      ),
    );
    if (setup.status !== "committed") throw new Error(setup.status);

    const outcome = await workerDb(db.pool).commit(await briefDraft(running, base + 1));
    expect(outcome.status).toBe("committed");
    const after = await readSnapshot(db.pool, CASE_ID, OWNER);
    const [brief] = after?.records.briefRecords ?? [];
    expect(brief).toMatchObject({ revision: 1, status: "ready_for_review" });
    expect(brief?.provenance.inputVersions.map((v) => v.entityId).sort()).toEqual([
      "ev_test_need",
      "int_test_rest",
    ]);
    expect(after?.records.reviewDecisionRecords.map((r) => [r.status, r.stale])).toEqual([
      ["requested", false],
      ["requested", false],
      ["requested", false],
    ]);

    const revised = await applyCommit(
      db.pool,
      exampleCommit(
        { ...caseRecord, revision: base + 2 },
        {
          id: "commit_test_brief_revision",
          expected: base + 2,
          upserts: [
            {
              ...NEED,
              revision: 2,
              statement: "Who sets pasture rest dates must be checked locally.",
            },
          ],
        },
      ),
    );
    if (revised.status !== "committed") throw new Error(revised.status);
    const stale = await readSnapshot(db.pool, CASE_ID, OWNER);
    expect(stale?.records.briefRecords.map((b) => [b.revision, b.status])).toEqual([[2, "stale"]]);
    expect(stale?.records.reviewDecisionRecords.every((r) => r.stale)).toBe(true);
  });
});
