import { type Pool, appendEvents, createCase, createSession, sessionCookieName } from "@siterra/db";
import { type TestDatabase, exampleCase, exampleEvent, freshDatabase } from "@siterra/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as UsageRoute from "./cases/[caseId]/usage/route.ts";

const owner = "owner_example";
const caseId = "case_example_usage_route";
const origin = "http://127.0.0.1:4350";

let db: TestDatabase;
let route: typeof UsageRoute;
let cookie = "";
const shared = globalThis as typeof globalThis & { siterraPool?: Pool };

beforeAll(async () => {
  db = await freshDatabase();
  process.env["DATABASE_URL"] = db.url;
  shared.siterraPool = undefined;
  route = await import("./cases/[caseId]/usage/route.ts");
  await createCase(db.pool, exampleCase(caseId), owner);
  await appendEvents(db.pool, caseId, [
    {
      ...exampleEvent("usage-route-1", "model.completed"),
      usage: {
        provider: "replay",
        model: "example-model",
        requestId: null,
        status: "succeeded",
        inputTokens: 10,
        outputTokens: 5,
        cachedInputTokens: 0,
        estimatedCostMicroUsd: 40,
        durationMs: 1,
        reasoningTokens: null,
        webSearchCalls: null,
        replayOrigin: "synthetic",
      },
    },
  ]);
  cookie = `${sessionCookieName}=${await createSession(db.pool, { ownerScopeId: owner, kind: "local", ttlSeconds: 3600 })}`;
});

afterAll(async () => {
  await shared.siterraPool?.end();
  await db.drop();
});

const params = (id: string) => ({ params: Promise.resolve({ caseId: id }) });
const get = (id: string, withCookie = true) =>
  new Request(`${origin}/api/cases/${id}/usage`, { headers: withCookie ? { cookie } : {} });

describe("GET /api/cases/:id/usage", () => {
  it("answers 200 with the replayed call apart at zero cost, 401 without a session, 404 for another case", async () => {
    const response = await route.GET(get(caseId), params(caseId));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      costIsEstimate: true,
      live: { calls: 0, estimatedCostMicroUsd: 0 },
      replay: { calls: 1 },
      rows: [{ route: "replay", replayOrigin: "synthetic", calls: 1, estimatedCostMicroUsd: 0 }],
    });
    expect((await route.GET(get(caseId, false), params(caseId))).status).toBe(401);
    expect((await route.GET(get("case_unknown"), params("case_unknown"))).status).toBe(404);
  });
});
