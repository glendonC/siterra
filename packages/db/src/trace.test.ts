import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { submitCommand } from "./commands.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { exampleCase, exampleCommandRequest } from "./test-records.ts";
import { SpanRejected, type SpanRecord, readTrace, recordSpan } from "./trace.ts";

let db: TestDatabase;
let pool: Pool;
let commandId = "";
const owner = "owner_example";
const record = exampleCase("case_example_trace");

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  await createCase(pool, record, owner);
  const submitted = await submitCommand(pool, {
    caseId: record.id,
    ownerScopeId: owner,
    request: exampleCommandRequest("trace-key-0001"),
  });
  if (submitted.status !== "created") throw new Error(submitted.status);
  commandId = submitted.command.id;
});

afterAll(async () => {
  await db.drop();
});

function span(
  spanId: string,
  attributes: SpanRecord["attributes"],
  parentSpanId: string | null = null,
): SpanRecord {
  return {
    caseId: record.id,
    taskId: null,
    traceId: commandId,
    spanId,
    parentSpanId,
    name: "chat example-model",
    kind: "CLIENT",
    startedAt: "2026-10-27T20:00:00.000Z",
    endedAt: null,
    status: "unset",
    attributes,
  };
}

describe("TR-03 (storage part): spans never hold content", () => {
  it("refuses a content attribute and stores nothing", async () => {
    await expect(
      recordSpan(pool, span("span-content", { "gen_ai.input.messages": "synthetic" })),
    ).rejects.toBeInstanceOf(SpanRejected);
    await expect(
      recordSpan(pool, span("span-content", { "gen_ai.tool.call.arguments": "{}" })),
    ).rejects.toBeInstanceOf(SpanRejected);
    const stored = await pool.query("select 1 from spans where span_id = 'span-content'");
    expect(stored.rowCount).toBe(0);
  });

  it("refuses an attribute outside the allowlisted namespaces", async () => {
    await expect(
      recordSpan(pool, span("span-other", { "http.request.body": "synthetic" })),
    ).rejects.toThrow();
  });
});

describe("TR-03 (storage part): content keys are refused with every key under them", () => {
  it.each([
    "gen_ai.prompt.0.content",
    "gen_ai.completion.0.content",
    "gen_ai.input.messages.0",
    "gen_ai.tool.call.arguments.query",
  ])("refuses %s", async (key) => {
    await expect(
      recordSpan(pool, span(`span-${key}`, { [key]: "synthetic" })),
    ).rejects.toBeInstanceOf(SpanRejected);
    const stored = await pool.query("select 1 from spans where span_id = $1", [`span-${key}`]);
    expect(stored.rowCount).toBe(0);
  });

  it.each(["siterra.prompt", "siterra.source_text"])(
    "refuses %s, a siterra key outside the list",
    async (key) => {
      await expect(
        recordSpan(pool, span(`span-${key}`, { [key]: "synthetic" })),
      ).rejects.toBeInstanceOf(SpanRejected);
    },
  );

  it("caps string values at 256 code points and arrays at 32 items", async () => {
    await expect(
      recordSpan(pool, span("span-long", { "gen_ai.response.id": "x".repeat(257) })),
    ).rejects.toBeInstanceOf(SpanRejected);
    await expect(
      recordSpan(
        pool,
        span("span-many", {
          "gen_ai.response.finish_reasons": Array.from({ length: 33 }, () => "stop"),
        }),
      ),
    ).rejects.toBeInstanceOf(SpanRejected);
    await recordSpan(
      pool,
      span("span-allowed", {
        "gen_ai.response.id": "x".repeat(256),
        "siterra.attempts": 2,
        "siterra.refused": false,
      }),
    );
    const stored = await pool.query("select 1 from spans where span_id = 'span-allowed'");
    expect(stored.rowCount).toBe(1);
  });
});

describe("TR-02 (storage part): the trace of a command", () => {
  it("returns its spans in start order and its events in sequence order; finishing a span updates it once", async () => {
    await recordSpan(
      pool,
      span("span-model", {
        "gen_ai.request.model": "example-model",
        "gen_ai.usage.input_tokens": 12,
      }),
    );
    await recordSpan(pool, {
      ...span("span-model", {
        "gen_ai.request.model": "example-model",
        "gen_ai.usage.output_tokens": 3,
      }),
      endedAt: "2026-10-27T20:00:01.000Z",
      status: "ok",
    });
    await recordSpan(pool, {
      ...span("span-model", {}),
      endedAt: "2026-10-27T20:00:09.000Z",
      status: "error",
    });
    const trace = await readTrace(pool, { caseId: record.id, commandId, ownerScopeId: owner });
    const model = trace?.spans.filter((s) => s.spanId === "span-model") ?? [];
    expect(model.map((s) => [s.spanId, s.status, s.endedAt, s.attributes])).toEqual([
      [
        "span-model",
        "ok",
        "2026-10-27T20:00:01.000Z",
        { "gen_ai.request.model": "example-model", "gen_ai.usage.output_tokens": 3 },
      ],
    ]);
    expect(trace?.events.map((e) => e.kind)).toEqual(["command.accepted"]);
  });

  it("answers null for another owner", async () => {
    expect(
      await readTrace(pool, { caseId: record.id, commandId, ownerScopeId: "owner_example_other" }),
    ).toBeNull();
  });
});
