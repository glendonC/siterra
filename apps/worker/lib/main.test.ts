import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCase, eventsOfCommand, submitCommand } from "@siterra/db";
import { exampleCase, exampleCommandRequest, freshDatabase } from "@siterra/db/testing";
import type { TestDatabase } from "@siterra/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WORKER_TIMING, dispatchOnce, startWorker, workerQueue } from "./main.ts";

// The whole worker on PostgreSQL: a submitted command goes through the outbox into a pg-boss job,
// and the plan job finishes it. The model output is a synthetic replay file; nothing is live.

const OWNER = "scope_test_main";
const CASE_ID = "case_test_main";

let db: TestDatabase;
let replayFile: string;
let corpusRoot: string;

beforeAll(async () => {
  db = await freshDatabase();
  await createCase(db.pool, exampleCase(CASE_ID, 1), OWNER);
  corpusRoot = await mkdtemp(join(tmpdir(), "siterra-worker-"));
  await writeFile(join(corpusRoot, "manifest.json"), JSON.stringify({ sources: [] }));
  replayFile = join(corpusRoot, "replay.json");
  const plan = {
    interpretation: "The command does not name a place.",
    tasks: [],
    clarifyingQuestion: "Which valley do you mean?",
  };
  await writeFile(
    replayFile,
    JSON.stringify({
      format: "siterra-model-replay@1",
      origin: "synthetic",
      model: "muse-spark-1.3",
      description: "Synthetic worker process test.",
      steps: [
        {
          kind: "stream",
          requestId: "req_synthetic_main",
          events: [
            { type: "response.output_text.delta", delta: JSON.stringify(plan) },
            {
              type: "response.completed",
              response: {
                id: "resp_synthetic_main",
                status: "completed",
                output: [],
                usage: {
                  input_tokens: 600,
                  output_tokens: 120,
                  input_tokens_details: { cached_tokens: 0 },
                  output_tokens_details: { reasoning_tokens: 30 },
                },
              },
            },
          ],
        },
      ],
    }),
  );
});

afterAll(async () => {
  await db.drop();
});

describe("outbox dispatch", () => {
  it("a second dispatch of the same outbox row adds no job (a44)", async () => {
    await createCase(db.pool, exampleCase("case_test_dispatch", 1), OWNER);
    const submitted = await submitCommand(db.pool, {
      caseId: "case_test_dispatch",
      ownerScopeId: OWNER,
      request: exampleCommandRequest("key-test-dispatch-0001"),
    });
    if (submitted.status !== "created") throw new Error(submitted.status);
    const commandId = submitted.command.id;
    const boss = workerQueue(db.url);
    await boss.start();
    const jobs = async (): Promise<number> => {
      const r = await db.pool.query<{ n: string }>(
        "select count(*) as n from pgboss.job where name = 'plan' and data->>'commandId' = $1",
        [commandId],
      );
      return Number(r.rows[0]?.n ?? 0);
    };
    try {
      expect(await dispatchOnce(db.pool, boss)).toBe(1);
      expect(await jobs()).toBe(1);
      // A crash after the enqueue but before the row was marked: the row is dispatched again.
      await db.pool.query("update outbox set dispatched_at = null where command_id = $1", [
        commandId,
      ]);
      expect(await dispatchOnce(db.pool, boss)).toBe(1);
      expect(await jobs()).toBe(1);
    } finally {
      await db.pool.query("delete from pgboss.job where data->>'commandId' = $1", [commandId]);
      await boss.stop();
    }
  });
});

describe("worker process", () => {
  it(
    "dispatches the outbox to pg-boss and finishes the plan job",
    { timeout: 60_000 },
    async () => {
      const stop = await startWorker({
        DATABASE_URL: db.url,
        SITERRA_REPO_ROOT: corpusRoot,
        SITERRA_CORPUS_MANIFEST: "manifest.json",
        SITERRA_REPLAY_FILE: replayFile,
      });
      try {
        const submitted = await submitCommand(db.pool, {
          caseId: CASE_ID,
          ownerScopeId: OWNER,
          request: exampleCommandRequest("key-test-main-0001", "Which valley do you mean?"),
        });
        if (submitted.status !== "created") throw new Error(submitted.status);
        const commandId = submitted.command.id;
        let kinds: string[] = [];
        for (let i = 0; i < 200 && !kinds.includes("command.completed"); i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          kinds = (await eventsOfCommand(db.pool, CASE_ID, commandId)).map((e) => e.kind);
        }
        expect(kinds).toEqual([
          "command.accepted",
          "task.queued",
          "model.started",
          "model.completed",
          "validation.completed",
          "task.succeeded",
          "command.completed",
        ]);
        const status = await db.pool.query<{ status: string }>(
          "select status from commands where id = $1",
          [commandId],
        );
        expect(status.rows[0]?.status).toBe("succeeded");
      } finally {
        await stop();
      }
    },
  );
});

describe("worker timing (PF-05)", () => {
  it("polls the outbox every 250 ms and the plan queue every 0.5 s, pg-boss's minimum", () => {
    expect(WORKER_TIMING).toEqual({ outboxPollMs: 250, jobPollingIntervalSeconds: 0.5 });
  });
});
