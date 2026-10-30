import { type Pool, appendEvents, createCase, createSession, sessionCookieName } from "@siterra/db";
import {
  type TestDatabase,
  exampleCase,
  exampleCommandRequest,
  exampleEvent,
  freshDatabase,
} from "@siterra/db/testing";
import { COMMAND_SPEND_CAP_MICRO_USD } from "@siterra/domain";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type * as CommandsRoute from "./cases/[caseId]/commands/route.ts";
import { instanceSpendPolicy } from "./demo-config.ts";

// P6b on the web side: the cap read from the environment, and the command route refusing a new
// command, with a plain message, once the instance's live spend cap would be passed.

let db: TestDatabase;
let pool: Pool;
let commands: typeof CommandsRoute;
let cookie: string;
let n = 0;
const owner = "owner_example";
const origin = "http://127.0.0.1:4350";
const shared = globalThis as typeof globalThis & {
  siterraPool?: Pool;
  siterraHub?: { close: () => Promise<void> };
};

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  process.env["DATABASE_URL"] = db.url;
  shared.siterraPool = undefined;
  shared.siterraHub = undefined;
  commands = await import("./cases/[caseId]/commands/route.ts");
  cookie = `${sessionCookieName}=${await createSession(pool, { ownerScopeId: owner, kind: "local", ttlSeconds: 3600 })}`;
});

afterAll(async () => {
  await shared.siterraHub?.close();
  await shared.siterraPool?.end();
  await db.drop();
});

afterEach(() => {
  delete process.env["SITERRA_PUBLIC_SPEND_CAP_MICRO_USD"];
});

async function postCommand(): Promise<Response> {
  n += 1;
  const caseId = `case_example_web${String(n).padStart(3, "0")}`;
  await createCase(pool, exampleCase(caseId), owner);
  return commands.POST(
    new Request(`${origin}/api/cases/${caseId}/commands`, {
      method: "POST",
      body: JSON.stringify(exampleCommandRequest(`web-cap-${String(n).padStart(4, "0")}`)),
      headers: { cookie, origin, host: new URL(origin).host, "content-type": "application/json" },
    }),
    { params: Promise.resolve({ caseId }) },
  );
}

describe("instanceSpendPolicy", () => {
  it("has no cap by default and reserves one command's cap per command", () => {
    expect(instanceSpendPolicy()).toEqual({
      capMicroUsd: null,
      perCommandMicroUsd: COMMAND_SPEND_CAP_MICRO_USD,
    });
  });

  it("reads the cap in micro-USD, and refuses what is not a whole number", () => {
    process.env["SITERRA_PUBLIC_SPEND_CAP_MICRO_USD"] = "15000000";
    expect(instanceSpendPolicy().capMicroUsd).toBe(15_000_000);
    process.env["SITERRA_PUBLIC_SPEND_CAP_MICRO_USD"] = "0";
    expect(instanceSpendPolicy().capMicroUsd).toBe(0);
    process.env["SITERRA_PUBLIC_SPEND_CAP_MICRO_USD"] = "fifteen";
    expect(() => instanceSpendPolicy()).toThrow(/SITERRA_PUBLIC_SPEND_CAP_MICRO_USD/);
    process.env["SITERRA_PUBLIC_SPEND_CAP_MICRO_USD"] = "-5";
    expect(() => instanceSpendPolicy()).toThrow(/SITERRA_PUBLIC_SPEND_CAP_MICRO_USD/);
  });
});

describe("POST /api/cases/:id/commands under the instance's live spend cap", () => {
  it("accepts the command while the cap has room, and with no cap at all", async () => {
    expect((await postCommand()).status).toBe(202);
    process.env["SITERRA_PUBLIC_SPEND_CAP_MICRO_USD"] = "100000000000";
    expect((await postCommand()).status).toBe(202);
  });

  it("answers 429 quota_exhausted with a plain message, creating nothing, once the cap would be passed", async () => {
    process.env["SITERRA_PUBLIC_SPEND_CAP_MICRO_USD"] = "0";
    const before = await pool.query("select count(*) as n from commands");
    const response = await postCommand();
    expect(response.status).toBe(429);
    const body = (await response.json()) as { code: string; detail: string };
    expect(body.code).toBe("quota_exhausted");
    expect(body.detail).toBe(
      "This instance has reached its limit for live model questions. Try again later.",
    );
    expect((await pool.query("select count(*) as n from commands")).rows).toEqual(before.rows);
  });

  it("counts the stored live spend", async () => {
    await appendEvents(pool, "case_example_web001", [
      {
        ...exampleEvent("web-spend-0001", "model.completed"),
        usage: {
          provider: "meta_model_api",
          model: "muse-spark-1.3",
          requestId: null,
          status: "succeeded",
          inputTokens: 1,
          outputTokens: 1,
          cachedInputTokens: 0,
          estimatedCostMicroUsd: 1_000_000,
          durationMs: 1,
          reasoningTokens: 0,
          webSearchCalls: null,
        },
      },
    ]);
    const stored = (
      await pool.query<{ n: string }>(
        "select sum((record->'usage'->>'estimatedCostMicroUsd')::bigint) as n from events where kind = 'model.completed'",
      )
    ).rows[0]?.n;
    process.env["SITERRA_PUBLIC_SPEND_CAP_MICRO_USD"] = String(
      Number(stored) + COMMAND_SPEND_CAP_MICRO_USD - 1,
    );
    expect((await postCommand()).status).toBe(429);
    process.env["SITERRA_PUBLIC_SPEND_CAP_MICRO_USD"] = String(
      Number(stored) + COMMAND_SPEND_CAP_MICRO_USD + 10_000_000,
    );
    expect((await postCommand()).status).toBe(202);
  });
});
