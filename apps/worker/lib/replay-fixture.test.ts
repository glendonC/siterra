import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chooseTransport, describeRoute, loadReplayFile } from "@siterra/agent";
import { eventsOfCommand, readSnapshot, submitCommand } from "@siterra/db";
import { freshDatabase } from "@siterra/db/testing";
import type { TestDatabase } from "@siterra/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startWorker } from "./main.ts";

// The synthetic seed-commission replay (apps/worker/fixtures) driving the real worker on the real
// seed: what the local slice and the UI tests run in concept mode. Nothing here is a model output.

const OWNER = "scope_test_replay_fixture";
const CASE_ID = "case_aitbouguemez";
const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const FIXTURE = fileURLToPath(
  new URL("../fixtures/seed-commission.synthetic.replay.json", import.meta.url),
);

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

async function commission(key: string, text: string): Promise<string> {
  const before = await readSnapshot(db.pool, CASE_ID, OWNER);
  if (!before) throw new Error("seed not loaded");
  const submitted = await submitCommand(db.pool, {
    caseId: CASE_ID,
    ownerScopeId: OWNER,
    request: {
      text,
      intent: "commission",
      context: {
        caseRevision: before.case.revision,
        geoSelectionId: null,
        geoRevision: null,
        periodIds: [],
        focusedEntityIds: [],
        dataBundleIds: [],
        locale: "en",
      },
      expectedCaseRevision: before.case.revision,
      idempotencyKey: key,
    },
  });
  if (submitted.status !== "created") throw new Error(submitted.status);
  return submitted.command.id;
}

async function settled(commandId: string): Promise<string> {
  for (let i = 0; i < 300; i += 1) {
    const r = await db.pool.query<{ status: string }>("select status from commands where id = $1", [
      commandId,
    ]);
    const status = r.rows[0]?.status ?? "";
    if (!["accepted", "running"].includes(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return "timeout";
}

describe("synthetic seed-commission replay", () => {
  it("is labelled synthetic in its file name, header and route", () => {
    const file = loadReplayFile(FIXTURE);
    expect(FIXTURE).toMatch(/\.synthetic\.replay\.json$/);
    expect(file.origin).toBe("synthetic");
    expect(file.description.startsWith("SYNTHETIC")).toBe(true);
    expect(describeRoute(chooseTransport({ SITERRA_REPLAY_FILE: FIXTURE })).label).toBe(
      "Replay (synthetic), not a live model call",
    );
  });

  it(
    "runs a commission through plan and two concurrent observation tasks, twice",
    { timeout: 90_000 },
    async () => {
      const stop = await startWorker({
        DATABASE_URL: db.url,
        SITERRA_REPO_ROOT: repoDir,
        SITERRA_REPLAY_FILE: FIXTURE,
      });
      try {
        const first = await commission(
          "key-test-replay-fixture-1",
          "What do the records show for spring 2022?",
        );
        expect(await settled(first)).toBe("succeeded");
        const second = await commission("key-test-replay-fixture-2", "Show spring 2022 again.");
        expect(await settled(second)).toBe("succeeded");
        const after = await readSnapshot(db.pool, CASE_ID, OWNER);
        const statements = (after?.records.evidenceRecords ?? []).map((e) => e.statement).sort();
        expect(statements).toHaveLength(4);
        expect(new Set(statements).size).toBe(2);
        expect(
          after?.records.evidenceRecords.every(
            (e) => e.claimKind === "observation" && e.status === "accepted",
          ),
        ).toBe(true);

        // The record itself says it came from a synthetic replay, and so does the usage of every
        // model event of the task that wrote it (lead, after b30).
        const records = after?.records.evidenceRecords ?? [];
        for (const e of records) {
          expect(e.provenance.limitations).toContain(
            "Written from a synthetic replay, not a model output or a live model call.",
          );
        }
        const events = [
          ...(await eventsOfCommand(db.pool, CASE_ID, first)),
          ...(await eventsOfCommand(db.pool, CASE_ID, second)),
        ];
        for (const taskId of new Set(records.map((e) => e.provenance.generatedByTaskId))) {
          const usage = events
            .filter((ev) => ev.taskId === taskId && ev.kind === "model.completed")
            .map((ev) => `${ev.usage?.provider ?? ""} ${ev.usage?.replayOrigin ?? ""}`);
          expect(usage.length).toBeGreaterThan(0);
          expect(usage.every((p) => p === "replay synthetic")).toBe(true);
        }
      } finally {
        await stop();
      }
    },
  );
});
