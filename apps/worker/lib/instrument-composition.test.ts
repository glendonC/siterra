import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  MetaAdapter,
  ReplayTransport,
  caseToolRegistry,
  parseReplayFile,
  runInstrumentCompositionTask,
} from "@siterra/agent";
import type { TaskRecord } from "@siterra/agent";
import { readSnapshot } from "@siterra/db";
import { freshDatabase } from "@siterra/db/testing";
import type { TestDatabase } from "@siterra/db/testing";
import { instrumentComponentIssues, instrumentSpecIssues } from "@siterra/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { workerDb } from "./db.ts";
import { snapshotStore } from "./snapshot-store.ts";

// The instrument composition task on the real case seed, replay only: the four instruments the
// composer put in the seed are ordered and one caption is reworded by a synthetic replay answer,
// and the commit goes through the real commit transaction, so the database's own guards (INST-01
// to INST-03) judge what the task wrote. No live model call is made.

const OWNER = "scope_test_instruments";
const CASE_ID = "case_aitbouguemez";
const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const AT = new Date("2026-10-29T20:00:00.000Z");

let db: TestDatabase;

beforeAll(async () => {
  db = await freshDatabase();
  execFileSync(
    process.execPath,
    [
      `${repoDir}packages/db/src/run-seed.ts`,
      "load",
      "concept",
      OWNER,
      "http://127.0.0.1:4369/assets",
    ],
    { cwd: repoDir, env: { ...process.env, DATABASE_URL: db.url }, stdio: "pipe" },
  );
}, 60_000);

afterAll(async () => {
  await db.drop();
});

const ids = {
  rain: "inst_rainfall_scatter_valley",
  stack: "inst_layer_stack_valley",
  section: "inst_cross_section_valley",
  pixel: "inst_pixel_anatomy_valley",
};

function replay(text: string): ReplayTransport {
  return new ReplayTransport(
    parseReplayFile({
      format: "siterra-model-replay@1",
      origin: "synthetic",
      model: "muse-spark-1.3",
      description: "Synthetic answer for the instrument composition test.",
      steps: [
        {
          kind: "stream",
          requestId: "req_synthetic_instruments",
          events: [
            { type: "response.output_text.delta", delta: text },
            {
              type: "response.completed",
              response: {
                id: "resp_synthetic_instruments",
                status: "completed",
                output: [],
                usage: {
                  input_tokens: 2500,
                  output_tokens: 400,
                  input_tokens_details: { cached_tokens: 0 },
                  output_tokens_details: { reasoning_tokens: 50 },
                },
              },
            },
          ],
        },
      ],
    }),
  );
}

describe("instrument composition on the real seed, replay only", () => {
  it(
    "orders the four valley instruments and rewords one caption, and the real commit accepts it",
    { timeout: 60_000 },
    async () => {
      const before = await readSnapshot(db.pool, CASE_ID, OWNER);
      if (!before) throw new Error("seed not loaded");
      expect((before.records.instrumentSpecRecords ?? []).map((s) => s.id).sort()).toEqual(
        Object.values(ids).sort(),
      );
      const current = (id: string) => {
        const s = (before.records.instrumentSpecRecords ?? []).find((r) => r.id === id);
        if (!s) throw new Error(`no ${id}`);
        return s;
      };
      const reworded =
        "September to May rainfall explains little of the change in March to June greenness (R squared 0.037), as the record stands.";
      const answer = {
        order: [ids.stack, ids.section, ids.pixel, ids.rain],
        captions: Object.values(ids).map((id) => ({
          specId: id,
          ink: id === ids.rain ? reworded : current(id).caption.ink,
          grey: current(id).caption.grey,
        })),
      };
      const store = snapshotStore(before, { sources: [], passages: [], missing: [] }, null);
      const task: TaskRecord = {
        recordType: "Task",
        id: "task_test_instruments",
        revision: 1,
        createdAt: AT.toISOString(),
        updatedAt: AT.toISOString(),
        caseId: CASE_ID,
        commandId: "cmd_test_instruments",
        kind: "instrument_composition",
        question: "Order the instruments for this question and check their caption sentences.",
        status: "running",
        dependsOnTaskIds: [],
        inputVersions: [],
        allowedTools: ["propose_instruments"],
        outputEntityIds: [],
        idempotencyKey: "task-test-instruments-0001",
        attempt: 1,
        maxModelRounds: 2,
        deadlineAt: "2026-10-29T21:00:00.000Z",
        budgetMicroUsd: 500_000,
        spentMicroUsd: 0,
        checkpointId: null,
        failureCode: null,
        missingInputs: [],
        startedAt: AT.toISOString(),
        finishedAt: null,
      };
      // The plan's commit writes the queued task first; do the same so the next revision follows it
      const queued = await workerDb(db.pool, () => AT).commit({
        caseId: CASE_ID,
        commandId: task.commandId,
        taskId: task.id,
        expectedCaseRevision: before.case.revision,
        idempotencyKey: "commit-test-instruments-queued",
        inputVersions: [],
        upserts: [{ ...task, status: "queued", startedAt: null }],
        events: [
          {
            kind: "task.queued",
            taskId: task.id,
            occurredAt: AT.toISOString(),
            entityIds: [task.id],
            message: "Queued.",
            resultStatus: null,
            usage: null,
            tool: null,
            validation: null,
          },
        ],
      });
      expect(queued.status).toBe("committed");
      const revision = before.case.revision + 1;
      const transport = replay(JSON.stringify(answer));
      const result = await runInstrumentCompositionTask(
        { task, expectedCaseRevision: revision },
        {
          adapter: new MetaAdapter({ transport, sleep: () => Promise.resolve() }),
          trace: { emit: () => undefined },
          store,
          tools: caseToolRegistry(store, CASE_ID),
          newEvidenceId: () => "ev_test_unused",
          now: () => AT,
        },
      );
      expect(result.loop?.status).toBe("accepted");

      const outcome = await workerDb(db.pool, () => AT).commit(result.commit);
      expect(outcome.status).toBe("committed");

      const after = await readSnapshot(db.pool, CASE_ID, OWNER);
      const components = after?.records.canvasComponentRecords
        .filter((c) => c.id.startsWith("comp_") && c.entityIds[0]?.startsWith("inst_"))
        .sort((a, b) => a.order - b.order);
      expect(components?.map((c) => c.entityIds[0])).toEqual(answer.order);
      expect(components?.map((c) => c.section)).toEqual([
        "place",
        "place",
        "observations",
        "observations",
      ]);
      const rain = (after?.records.instrumentSpecRecords ?? [])
        .filter((s) => s.id === ids.rain)
        .sort((a, b) => b.revision - a.revision)[0];
      expect(rain).toMatchObject({ revision: 2, status: "ready" });
      expect(rain?.caption.ink).toBe(reworded);
      // The binding rule the commit enforced, read back
      for (const c of components ?? []) {
        const spec = (after?.records.instrumentSpecRecords ?? [])
          .filter((s) => s.id === c.entityIds[0])
          .sort((a, b) => b.revision - a.revision)[0];
        expect(instrumentComponentIssues(c, spec), c.id).toEqual([]);
        if (spec) expect(instrumentSpecIssues(spec)).toEqual([]);
      }
      const taskAfter = after?.records.taskRecords.find((t) => t.id === "task_test_instruments");
      expect(taskAfter).toMatchObject({ status: "succeeded", kind: "instrument_composition" });
    },
  );
});
