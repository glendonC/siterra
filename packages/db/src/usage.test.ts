import type { ModelUsage } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { appendEvents } from "./events.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { exampleCase, exampleEvent } from "./test-records.ts";
import { readUsage } from "./usage.ts";

const owner = "owner_example";
const record = exampleCase("case_example_usage");
const other = exampleCase("case_example_usage_other");

let db: TestDatabase;
let pool: Pool;

function usage(overrides: Partial<ModelUsage>): ModelUsage {
  return {
    provider: "meta_model_api",
    model: "example-model-a",
    requestId: null,
    status: "succeeded",
    inputTokens: 1000,
    outputTokens: 200,
    cachedInputTokens: 100,
    estimatedCostMicroUsd: 1500,
    durationMs: 10,
    reasoningTokens: 50,
    webSearchCalls: null,
    ...overrides,
  };
}

let n = 0;
function event(kind: "model.started" | "model.completed", u: ModelUsage) {
  n += 1;
  return { ...exampleEvent(`usage-key-${String(n).padStart(4, "0")}`, kind), usage: u };
}

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  await createCase(pool, record, owner);
  await createCase(pool, other, owner);
  await appendEvents(pool, record.id, [
    event("model.started", usage({ status: "started", inputTokens: null, outputTokens: null })),
    event("model.completed", usage({})),
    event("model.completed", usage({ estimatedCostMicroUsd: null })),
    event(
      "model.completed",
      usage({
        status: "failed",
        inputTokens: null,
        outputTokens: null,
        cachedInputTokens: null,
        reasoningTokens: null,
        estimatedCostMicroUsd: 0,
      }),
    ),
    event("model.completed", usage({ model: "example-model-b", estimatedCostMicroUsd: 700 })),
    event(
      "model.completed",
      usage({ provider: "replay", replayOrigin: "synthetic", estimatedCostMicroUsd: 9999 }),
    ),
    event("model.completed", usage({ provider: "replay", replayOrigin: "synthetic" })),
    event("model.completed", usage({ provider: "replay", replayOrigin: "recorded" })),
    event("model.completed", usage({ provider: "replay" })),
  ]);
  await appendEvents(pool, other.id, [
    event("model.completed", usage({ estimatedCostMicroUsd: 123456 })),
  ]);
});

afterAll(async () => {
  await db.drop();
});

describe("TR-06 (platform part): model usage per case, route, provider and model", () => {
  it("sums completed calls only, keeps replay apart at zero cost, and counts what is unknown", async () => {
    const result = await readUsage(pool, { caseId: record.id, ownerScopeId: owner });
    const common = {
      inputTokens: 1000,
      outputTokens: 200,
      cachedInputTokens: 100,
      reasoningTokens: 50,
    };
    expect(result).toEqual({
      caseId: record.id,
      costIsEstimate: true,
      live: { calls: 4, estimatedCostMicroUsd: 2200 },
      replay: { calls: 4 },
      rows: [
        {
          route: "live",
          provider: "meta_model_api",
          model: "example-model-a",
          replayOrigin: null,
          calls: 3,
          unsuccessfulCalls: 1,
          inputTokens: 2000,
          outputTokens: 400,
          cachedInputTokens: 200,
          reasoningTokens: 100,
          callsWithoutTokens: 1,
          estimatedCostMicroUsd: 1500,
          callsWithoutCost: 1,
        },
        {
          route: "live",
          provider: "meta_model_api",
          model: "example-model-b",
          replayOrigin: null,
          calls: 1,
          unsuccessfulCalls: 0,
          ...common,
          callsWithoutTokens: 0,
          estimatedCostMicroUsd: 700,
          callsWithoutCost: 0,
        },
        {
          route: "replay",
          provider: "replay",
          model: "example-model-a",
          replayOrigin: null,
          calls: 1,
          unsuccessfulCalls: 0,
          ...common,
          callsWithoutTokens: 0,
          estimatedCostMicroUsd: 0,
          callsWithoutCost: 0,
        },
        {
          route: "replay",
          provider: "replay",
          model: "example-model-a",
          replayOrigin: "recorded",
          calls: 1,
          unsuccessfulCalls: 0,
          ...common,
          callsWithoutTokens: 0,
          estimatedCostMicroUsd: 0,
          callsWithoutCost: 0,
        },
        {
          route: "replay",
          provider: "replay",
          model: "example-model-a",
          replayOrigin: "synthetic",
          calls: 2,
          unsuccessfulCalls: 0,
          inputTokens: 2000,
          outputTokens: 400,
          cachedInputTokens: 200,
          reasoningTokens: 100,
          callsWithoutTokens: 0,
          estimatedCostMicroUsd: 0,
          callsWithoutCost: 0,
        },
      ],
    });
  });

  it("answers null for another owner, and an empty case has no rows", async () => {
    expect(
      await readUsage(pool, { caseId: record.id, ownerScopeId: "owner_example_other" }),
    ).toBeNull();
    const empty = exampleCase("case_example_usage_empty");
    await createCase(pool, empty, owner);
    expect(await readUsage(pool, { caseId: empty.id, ownerScopeId: owner })).toMatchObject({
      live: { calls: 0, estimatedCostMicroUsd: 0 },
      replay: { calls: 0 },
      rows: [],
    });
  });
});
