import type { ModelUsage } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { applyCommit } from "./commit.ts";
import { appendEvents } from "./events.ts";
import { readLineage } from "./lineage.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { exampleCase, exampleCommit, exampleEvent, exampleEvidence } from "./test-records.ts";

const owner = "owner_example";
const record = exampleCase("case_example_lineage");
const replayTask = "task_example_replayed";
const liveTask = "task_example_live";

let db: TestDatabase;
let pool: Pool;

function usage(overrides: Partial<ModelUsage>): ModelUsage {
  return {
    provider: "replay",
    model: "example-model",
    requestId: null,
    status: "succeeded",
    inputTokens: 10,
    outputTokens: 5,
    cachedInputTokens: 0,
    estimatedCostMicroUsd: null,
    durationMs: 1,
    reasoningTokens: null,
    webSearchCalls: null,
    ...overrides,
  };
}

function modelEvent(
  key: string,
  taskId: string,
  kind: "model.started" | "model.completed",
  u: ModelUsage,
) {
  return { ...exampleEvent(key, kind), commandId: "cmd_example_platform", taskId, usage: u };
}

function evidenceBy(id: string, taskId: string | null) {
  const evidence = exampleEvidence(record.id, id);
  return { ...evidence, provenance: { ...evidence.provenance, generatedByTaskId: taskId } };
}

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  await createCase(pool, record, owner);
  const outcome = await applyCommit(
    pool,
    exampleCommit(record, {
      id: "commit_example_lineage",
      expected: 1,
      upserts: [
        evidenceBy("ev_example_replayed", replayTask),
        evidenceBy("ev_example_live", liveTask),
        evidenceBy("ev_example_no_task", null),
      ],
    }),
  );
  if (outcome.status !== "committed") throw new Error(outcome.status);
  await appendEvents(pool, record.id, [
    modelEvent(
      "lineage-1",
      replayTask,
      "model.started",
      usage({ status: "started", replayOrigin: "synthetic" }),
    ),
    modelEvent("lineage-2", replayTask, "model.completed", usage({ replayOrigin: "synthetic" })),
    modelEvent(
      "lineage-3",
      liveTask,
      "model.completed",
      usage({ provider: "meta_model_api", model: "Llama-4-Maverick" }),
    ),
  ]);
});

afterAll(async () => {
  await db.drop();
});

describe("record lineage: the producing task's model routes, for any reader of the record", () => {
  it("reads evidence written on the replay route as replayed, with its synthetic origin", async () => {
    const lineage = await readLineage(pool, {
      caseId: record.id,
      ownerScopeId: owner,
      entityId: "ev_example_replayed",
    });
    expect(lineage).toEqual({
      entityId: "ev_example_replayed",
      revision: 1,
      generatedByTaskId: replayTask,
      modelCalls: [{ provider: "replay", model: "example-model", replayOrigin: "synthetic" }],
      replayed: true,
    });
  });

  it("reads evidence from a live call as not replayed, and evidence with no task as having no model call", async () => {
    const live = await readLineage(pool, {
      caseId: record.id,
      ownerScopeId: owner,
      entityId: "ev_example_live",
    });
    expect([live?.replayed, live?.modelCalls]).toEqual([
      false,
      [{ provider: "meta_model_api", model: "Llama-4-Maverick", replayOrigin: null }],
    ]);
    const none = await readLineage(pool, {
      caseId: record.id,
      ownerScopeId: owner,
      entityId: "ev_example_no_task",
    });
    expect([none?.generatedByTaskId, none?.modelCalls, none?.replayed]).toEqual([null, [], false]);
  });

  it("answers null for another owner and an unknown record", async () => {
    expect(
      await readLineage(pool, {
        caseId: record.id,
        ownerScopeId: "owner_example_other",
        entityId: "ev_example_replayed",
      }),
    ).toBeNull();
    expect(
      await readLineage(pool, {
        caseId: record.id,
        ownerScopeId: owner,
        entityId: "ev_example_none",
      }),
    ).toBeNull();
  });
});
