import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  MetaAdapter,
  ReplayTransport,
  caseToolRegistry,
  loadReplayFile,
  runInstrumentCompositionTask,
} from "@siterra/agent";
import type { TaskRecord } from "@siterra/agent";
import { readSnapshot } from "@siterra/db";
import { freshDatabase } from "@siterra/db/testing";
import type { TestDatabase } from "@siterra/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { workerDb } from "./db.ts";
import { snapshotStore } from "./snapshot-store.ts";

// The recorded outcome of 'P4b live composition 2' (request fe5c9c1c-957b-4854-a3fc-f27c7ae20f9a),
// replayed through the instrument composition task on the real seed in a database of its own, so
// the seed's captions are the ones the live call saw. No live call is made.

const OWNER = "scope_test_instruments_recorded";
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

describe("the recorded live composition, replayed", () => {
  it(
    "replays the recorded outcome of 'P4b live composition 2': four components in the live order, no caption changed",
    { timeout: 60_000 },
    async () => {
      const recorded = loadReplayFile(
        fileURLToPath(
          new URL(
            "../../../packages/agent/src/model/fixtures/live-composition-2.json",
            import.meta.url,
          ),
        ),
      );
      expect(recorded.origin).toBe("recorded");
      expect(recorded.description).toContain("fe5c9c1c-957b-4854-a3fc-f27c7ae20f9a");
      expect(recorded.description).toContain("the reasoning item is omitted");
      // The identifiers and usage the live call returned (STATE and APPROVALS, 29 Oct 2026)
      const [step] = recorded.steps;
      const done =
        step?.kind === "stream"
          ? step.events.find((e) => (e as { type?: string }).type === "response.completed")
          : undefined;
      expect(step?.kind === "stream" && step.requestId).toBe(
        "fe5c9c1c-957b-4854-a3fc-f27c7ae20f9a",
      );
      expect(done).toMatchObject({
        response: {
          id: "resp_6ae3e05088e954a857b040ca",
          usage: {
            input_tokens: 1401,
            output_tokens: 2233,
            output_tokens_details: { reasoning_tokens: 1912 },
          },
        },
      });
      const before = await readSnapshot(db.pool, CASE_ID, OWNER);
      if (!before) throw new Error("seed not loaded");
      const store = snapshotStore(before, { sources: [], passages: [], missing: [] }, null);
      const task: TaskRecord = {
        recordType: "Task",
        id: "task_test_recorded",
        revision: 1,
        createdAt: AT.toISOString(),
        updatedAt: AT.toISOString(),
        caseId: CASE_ID,
        commandId: "cmd_test_recorded",
        kind: "instrument_composition",
        question: "Order the instruments for this question and check their caption sentences.",
        status: "queued",
        dependsOnTaskIds: [],
        inputVersions: [],
        allowedTools: ["propose_instruments"],
        outputEntityIds: [],
        idempotencyKey: "task-test-recorded-0001",
        attempt: 0,
        maxModelRounds: 2,
        deadlineAt: "2026-10-29T21:00:00.000Z",
        budgetMicroUsd: 500_000,
        spentMicroUsd: 0,
        checkpointId: null,
        failureCode: null,
        missingInputs: [],
        startedAt: null,
        finishedAt: null,
      };
      const db2 = workerDb(db.pool, () => AT);
      const queued = await db2.commit({
        caseId: CASE_ID,
        commandId: task.commandId,
        taskId: task.id,
        expectedCaseRevision: before.case.revision,
        idempotencyKey: "commit-test-recorded-queued",
        inputVersions: [],
        upserts: [task],
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
      const result = await runInstrumentCompositionTask(
        {
          task: { ...task, status: "running", attempt: 1 },
          expectedCaseRevision: before.case.revision + 1,
        },
        {
          adapter: new MetaAdapter({
            transport: new ReplayTransport(recorded),
            sleep: () => Promise.resolve(),
          }),
          trace: { emit: () => undefined },
          store,
          tools: caseToolRegistry(store, CASE_ID),
          newEvidenceId: () => "ev_test_unused",
          now: () => AT,
        },
      );
      expect(result.loop?.status).toBe("accepted");
      expect(result.loop?.calls[0]).toMatchObject({
        route: "replay",
        replayOrigin: "recorded",
        providerRequestId: "fe5c9c1c-957b-4854-a3fc-f27c7ae20f9a",
      });
      const records = result.commit.upserts.slice(1);
      expect(records.every((r) => r.recordType === "CanvasComponent")).toBe(true);
      expect(
        records.map((r) => (r.recordType === "CanvasComponent" ? r.entityIds[0] : null)),
      ).toEqual([
        "inst_layer_stack_valley",
        "inst_cross_section_valley",
        "inst_pixel_anatomy_valley",
        "inst_rainfall_scatter_valley",
      ]);
      expect((await db2.commit(result.commit)).status).toBe("committed");
    },
  );
});
