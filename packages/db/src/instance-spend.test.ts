import type { Command, ModelUsage } from "@siterra/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { setCommandStatus, submitCommand } from "./commands.ts";
import { appendEvents } from "./events.ts";
import { UNPRICED_LIVE_CALL_MICRO_USD, liveSpendMicroUsd } from "./instance-spend.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { exampleCase, exampleCommandRequest, exampleEvent } from "./test-records.ts";

// P6b: one instance's cap on live model spend, counted from stored usage at list price and checked
// when a command is accepted.

let db: TestDatabase;
let pool: Pool;
let n = 0;
const owner = "owner_example";
const policy = (capMicroUsd: number | null, perCommandMicroUsd = 500_000) => ({
  capMicroUsd,
  perCommandMicroUsd,
});

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
});

afterAll(async () => {
  await db.drop();
});

/** Every test starts with no unfinished command, so the reserve of earlier tests does not count. */
beforeEach(async () => {
  const open = await pool.query<{ id: string }>(
    "select id from commands where status in ('accepted', 'running')",
  );
  for (const row of open.rows) await setCommandStatus(pool, row.id, "cancelled");
});

async function submit(spendCap?: ReturnType<typeof policy>) {
  n += 1;
  const caseId = `case_example_cap${String(n).padStart(3, "0")}`;
  await createCase(pool, exampleCase(caseId), owner);
  const outcome = await submitCommand(pool, {
    caseId,
    ownerScopeId: owner,
    request: exampleCommandRequest(`instance-cap-${String(n).padStart(4, "0")}`),
    ...(spendCap ? { spendCap } : {}),
  });
  return { caseId, outcome };
}

const created = (outcome: Awaited<ReturnType<typeof submit>>["outcome"]): Command => {
  if (outcome.status !== "created") throw new Error(`not created: ${outcome.status}`);
  return outcome.command;
};

async function storeCall(
  usage: Partial<ModelUsage> & { provider: string },
  status: ModelUsage["status"] = "succeeded",
) {
  n += 1;
  const caseId = `case_example_call${String(n).padStart(3, "0")}`;
  await createCase(pool, exampleCase(caseId), owner);
  await appendEvents(pool, caseId, [
    {
      ...exampleEvent(`cap-call-${String(n)}`, "model.completed"),
      usage: {
        model: "muse-spark-1.3",
        requestId: null,
        status,
        inputTokens: 100,
        outputTokens: 10,
        cachedInputTokens: 0,
        estimatedCostMicroUsd: 0,
        durationMs: 1,
        reasoningTokens: 0,
        webSearchCalls: null,
        ...usage,
      },
    },
  ]);
}

describe("liveSpendMicroUsd: counted from stored usage across every case", () => {
  it("sums priced live calls, leaves replay calls out and charges an unpriced live call a flat amount", async () => {
    const before = await liveSpendMicroUsd(pool);
    await storeCall({ provider: "meta_model_api", estimatedCostMicroUsd: 11_607 });
    await storeCall({ provider: "meta_model_api", estimatedCostMicroUsd: 3_633 });
    await storeCall({
      provider: "replay",
      replayOrigin: "recorded",
      estimatedCostMicroUsd: 99_999,
    });
    await storeCall({ provider: "meta_model_api", estimatedCostMicroUsd: null });
    expect(await liveSpendMicroUsd(pool)).toBe(
      before + 11_607 + 3_633 + UNPRICED_LIVE_CALL_MICRO_USD,
    );
  });

  it("counts a call that failed before any usage was reported as unbilled, and one that failed after usage as unpriced", async () => {
    const before = await liveSpendMicroUsd(pool);
    await storeCall(
      {
        provider: "meta_model_api",
        estimatedCostMicroUsd: null,
        inputTokens: null,
        outputTokens: null,
      },
      "failed",
    );
    expect(await liveSpendMicroUsd(pool)).toBe(before);
    await storeCall({ provider: "meta_model_api", estimatedCostMicroUsd: null }, "failed");
    expect(await liveSpendMicroUsd(pool)).toBe(before + UNPRICED_LIVE_CALL_MICRO_USD);
  });
});

describe("submitCommand with an instance spend cap", () => {
  it("changes nothing without a policy, or with no cap", async () => {
    expect(created((await submit()).outcome).status).toBe("accepted");
    expect(created((await submit(policy(null))).outcome).status).toBe("accepted");
  });

  it("accepts a command while stored spend plus the reserve of every unfinished command and its own fit under the cap", async () => {
    const spent = await liveSpendMicroUsd(pool);
    expect((await submit(policy(spent + 500_000))).outcome.status).toBe("created");
  });

  it("refuses it once stored spend plus its own reserve would pass the cap, creating nothing", async () => {
    const spent = await liveSpendMicroUsd(pool);
    const { caseId, outcome } = await submit(policy(spent + 499_999));
    expect(outcome).toEqual({ status: "budget_exhausted" });
    const rows = await pool.query("select 1 from commands where case_id = $1", [caseId]);
    expect(rows.rowCount).toBe(0);
    const events = await pool.query(
      "select 1 from events where case_id = $1 and kind = 'command.accepted'",
      [caseId],
    );
    expect(events.rowCount).toBe(0);
  });

  it("reserves one command's cap for each unfinished command, and releases it when the command ends", async () => {
    const spent = await liveSpendMicroUsd(pool);
    const p = policy(spent + 1_000_000);
    const a = created((await submit(p)).outcome);
    const b = created((await submit(p)).outcome);
    expect((await submit(p)).outcome).toEqual({ status: "budget_exhausted" });
    await setCommandStatus(pool, a.id, "succeeded");
    expect((await submit(p)).outcome.status).toBe("created");
    await setCommandStatus(pool, b.id, "failed");
  });

  it("counts calls already stored: a spent cap refuses every new command", async () => {
    await storeCall({ provider: "meta_model_api", estimatedCostMicroUsd: 400_000 });
    const spent = await liveSpendMicroUsd(pool);
    expect((await submit(policy(spent))).outcome).toEqual({ status: "budget_exhausted" });
  });

  it("returns the stored command for a repeated key without deciding again", async () => {
    const first = await submit(policy(null));
    const command = created(first.outcome);
    const again = await submitCommand(pool, {
      caseId: first.caseId,
      ownerScopeId: owner,
      request: exampleCommandRequest(`instance-cap-${String(n).padStart(4, "0")}`),
      spendCap: policy(0),
    });
    expect(again).toEqual({ status: "existing", command });
  });
});
