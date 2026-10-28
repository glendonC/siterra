import { ReplayTransport, parseReplayFile } from "@siterra/agent";
import type { ReplayStep } from "@siterra/agent";
import { createCase, eventsOfCommand, readSnapshot, submitCommand } from "@siterra/db";
import { exampleCase, exampleCommandRequest, freshDatabase } from "@siterra/db/testing";
import type { TestDatabase } from "@siterra/db/testing";
import { newId } from "@siterra/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { workerDb } from "./db.ts";
import { handlePlanJob } from "./plan-job.ts";

// The plan job against PLATFORM's real commit path, event log and command table on PostgreSQL
// (DATABASE_URL, a fresh database per run). The model output is a synthetic replay.

const OWNER = "scope_test_worker";
const CASE_ID = "case_test_worker";

function replay(text: string): ReplayTransport {
  const step: ReplayStep = {
    kind: "stream",
    requestId: "req_synthetic_db",
    events: [
      { type: "response.output_text.delta", delta: text },
      {
        type: "response.completed",
        response: {
          id: "resp_synthetic_db",
          status: "completed",
          output: [],
          usage: {
            input_tokens: 700,
            output_tokens: 150,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 40 },
          },
        },
      },
    ],
  };
  return new ReplayTransport(
    parseReplayFile({
      format: "siterra-model-replay@1",
      origin: "synthetic",
      model: "muse-spark-1.3",
      description: "Synthetic worker database test.",
      steps: [step],
    }),
  );
}

let db: TestDatabase;

beforeAll(async () => {
  db = await freshDatabase();
  await createCase(db.pool, exampleCase(CASE_ID, 1), OWNER);
});

afterAll(async () => {
  await db.drop();
});

describe("plan job on PostgreSQL", () => {
  it("commits the plan task, keeps a gapless event log and ends the command", async () => {
    const submitted = await submitCommand(db.pool, {
      caseId: CASE_ID,
      ownerScopeId: OWNER,
      request: exampleCommandRequest("key-test-worker-0001", "Which valley do you mean?"),
    });
    if (submitted.status !== "created") throw new Error(submitted.status);
    const command = submitted.command;
    const planTaskId = command.taskIds[0];
    if (planTaskId === undefined) throw new Error("no plan task ID");

    const plan = {
      interpretation: "The command does not name a place.",
      tasks: [],
      clarifyingQuestion: "Which valley do you mean?",
    };
    const result = await handlePlanJob(
      { caseId: CASE_ID, commandId: command.id, planTaskId },
      {
        db: workerDb(db.pool),
        transport: replay(JSON.stringify(plan)),
        corpus: { sources: [], passages: [], missing: [] },
        now: () => new Date(),
        newId: (prefix) => newId(prefix),
      },
    );
    expect(result.status === "ran" && result.outcome.status).toBe("succeeded");

    const snapshot = await readSnapshot(db.pool, CASE_ID, OWNER);
    const task = snapshot?.records.taskRecords.find((t) => t.id === planTaskId);
    expect(task).toMatchObject({ status: "succeeded", revision: 2, kind: "plan" });
    expect(snapshot?.case.revision).toBe(3);

    const events = await eventsOfCommand(db.pool, CASE_ID, command.id);
    expect(events.map((e) => e.kind)).toEqual([
      "command.accepted",
      "task.queued",
      "model.started",
      "model.completed",
      "validation.completed",
      "task.succeeded",
      "command.completed",
    ]);
    const sequences = events.map((e) => e.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(new Set(sequences).size).toBe(sequences.length);
    expect(events.find((e) => e.kind === "model.completed")?.usage).toMatchObject({
      provider: "replay",
      model: "muse-spark-1.3",
    });

    const again = await handlePlanJob(
      { caseId: CASE_ID, commandId: command.id, planTaskId },
      {
        db: workerDb(db.pool),
        transport: replay("{}"),
        corpus: { sources: [], passages: [], missing: [] },
        now: () => new Date(),
        newId: (prefix) => newId(prefix),
      },
    );
    expect(again).toEqual({ status: "skipped", reason: "already_terminal" });
  });
});
