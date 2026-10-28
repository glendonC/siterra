import { describe, expect, it } from "vitest";

import { MetaAdapter } from "./adapter.ts";
import type { SpendGuard } from "./adapter.ts";
import { estimateCostUsd } from "./pricing.ts";
import { RecordingTransport, SecretInRecordingError, assertNoSecrets } from "./recorder.ts";
import { ReplayTransport, loadReplayFile, parseReplayFile } from "./replay.ts";
import type { ReplayStep } from "./replay.ts";
import { strictSubsetIssues } from "./strict-schema.ts";
import type { ModelTransport } from "./transport.ts";
import type { ModelEvent, ModelRequest } from "./types.ts";

// Every replay here is synthetic: written by hand from Meta's documented event shapes. None of
// these tests reaches a provider, and none shows that the live route works.

const fixture = (name: string): URL => new URL(`./fixtures/${name}`, import.meta.url);

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["case_code", "status_word", "note"],
  properties: {
    case_code: { type: "string" },
    status_word: { type: "string", enum: ["supported", "contradicted", "cannot_be_assessed"] },
    note: { type: "string" },
  },
};

const READ_CASE = {
  name: "read_case",
  description: "Return the case summary for a case ID.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["case_id"],
    properties: { case_id: { type: "string" } },
  },
};

function request(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    model: "muse-spark-1.3",
    promptVersion: "test@1",
    instructions: "Synthetic test.",
    input: [{ kind: "user_text", text: "Return the answer." }],
    output: { name: "answer", schema: ANSWER_SCHEMA },
    tools: [],
    maxOutputTokens: 1500,
    reasoningEffort: "low",
    ...overrides,
  };
}

function synthetic(steps: ReplayStep[]): ReplayTransport {
  return new ReplayTransport(
    parseReplayFile({
      format: "siterra-model-replay@1",
      origin: "synthetic",
      model: "muse-spark-1.3",
      description: "Synthetic test steps.",
      steps,
    }),
  );
}

const completedStream = loadReplayFile(fixture("structured-completed.json")).steps[0];

function adapterOn(transport: ModelTransport, delays: number[] = [], spend?: SpendGuard) {
  return new MetaAdapter({
    transport,
    sleep: (ms) => {
      delays.push(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    deadlines: { firstEventMs: 50, idleMs: 50 },
    ...(spend ? { spend } : {}),
  });
}

describe("request body", () => {
  it("sends store false, encrypted reasoning, a strict schema and a stream", async () => {
    const transport = new ReplayTransport(loadReplayFile(fixture("structured-completed.json")));
    await adapterOn(transport).call(request({ tools: [READ_CASE] }));
    const body = transport.opened[0];
    expect(body?.["store"]).toBe(false);
    expect(body?.["include"]).toEqual(["reasoning.encrypted_content"]);
    expect(body?.["stream"]).toBe(true);
    expect(body?.["tool_choice"]).toBe("auto");
    expect(body?.["text"]).toEqual({
      format: { type: "json_schema", name: "answer", schema: ANSWER_SCHEMA, strict: true },
    });
  });

  it("refuses to send a schema outside the strict subset, without a call", async () => {
    const transport = new ReplayTransport(loadReplayFile(fixture("structured-completed.json")));
    const open = { type: "object", properties: { a: { type: "string" } }, required: [] };
    const result = await adapterOn(transport).call(
      request({ output: { name: "bad", schema: open } }),
    );
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("schema_outside_strict_subset");
    expect(transport.opened).toHaveLength(0);
  });

  it("lists every strict subset violation with a path", () => {
    const issues = strictSubsetIssues({
      type: "object",
      properties: { a: { oneOf: [{ type: "string" }] }, b: { type: "object", properties: {} } },
      required: ["a"],
    });
    expect(issues).toEqual([
      "$: object must set additionalProperties false",
      "$.b: property must be required",
      "$.a: oneOf is not allowed",
      "$.b: object must set additionalProperties false",
    ]);
  });
});

describe("normalized stream", () => {
  it("TR-02 a completed structured answer carries text, usage, cost, IDs and the replay label", async () => {
    const events: ModelEvent[] = [];
    const transport = new ReplayTransport(loadReplayFile(fixture("structured-completed.json")));
    const result = await adapterOn(transport).call(request(), { onEvent: (e) => events.push(e) });
    expect(result.status).toBe("succeeded");
    expect(JSON.parse(result.outputText) as unknown).toEqual({
      case_code: "TEST-01",
      status_word: "cannot_be_assessed",
      note: "synthetic",
    });
    expect(result.route).toBe("replay");
    expect(result.replayOrigin).toBe("synthetic");
    expect(result.providerResponseId).toBe("resp_synthetic_structured_1");
    expect(result.providerRequestId).toBe("req_synthetic_structured_1");
    expect(result.usage).toEqual({
      inputTokens: 412,
      outputTokens: 96,
      cachedTokens: 0,
      reasoningTokens: 40,
    });
    expect(result.costEstimateUsd).toBeCloseTo((412 * 1.25 + 96 * 4.25) / 1e6, 12);
    expect(events.map((e) => e.type)).toEqual(["model_delta", "model_delta", "usage", "completed"]);
  });

  it("a tool round trip proposes complete arguments and replays encrypted reasoning", async () => {
    const events: ModelEvent[] = [];
    const transport = new ReplayTransport(loadReplayFile(fixture("tool-round-trip.json")));
    const adapter = adapterOn(transport);
    const turn1 = await adapter.call(request({ tools: [READ_CASE] }), {
      onEvent: (e) => events.push(e),
    });
    expect(turn1.status).toBe("succeeded");
    expect(turn1.toolCalls).toEqual([
      { callId: "call_synthetic_1", name: "read_case", arguments: '{"case_id":"case_synthetic"}' },
    ]);
    expect(events.filter((e) => e.type === "tool_proposal")).toHaveLength(1);
    expect(turn1.replayItems).toEqual([
      { type: "reasoning", summary: [], encrypted_content: "synthetic-encrypted-reasoning-2" },
      {
        type: "function_call",
        call_id: "call_synthetic_1",
        name: "read_case",
        arguments: '{"case_id":"case_synthetic"}',
      },
    ]);

    const turn2 = await adapter.call(
      request({
        tools: [READ_CASE],
        input: [
          { kind: "user_text", text: "Return the answer." },
          { kind: "replay", items: turn1.replayItems },
          { kind: "tool_output", callId: "call_synthetic_1", output: '{"case_code":"K-7351"}' },
        ],
      }),
    );
    expect(turn2.status).toBe("succeeded");
    expect(JSON.parse(turn2.outputText) as unknown).toMatchObject({ case_code: "K-7351" });
    expect(transport.opened[1]?.["input"]).toEqual([
      { role: "user", content: [{ type: "input_text", text: "Return the answer." }] },
      ...turn1.replayItems,
      {
        type: "function_call_output",
        call_id: "call_synthetic_1",
        output: '{"case_code":"K-7351"}',
      },
    ]);
    expect(turn2.usage.cachedTokens).toBe(256);
  });

  it("a refusal surfaces as refused with no answer text", async () => {
    const transport = new ReplayTransport(loadReplayFile(fixture("refusal.json")));
    const result = await adapterOn(transport).call(request());
    expect(result.status).toBe("refused");
    expect(result.refusal).toBe("I can't help with that.");
    expect(result.outputText).toBe("");
    expect(result.toolCalls).toEqual([]);
  });

  it("an incomplete response carries its reason and no partial text", async () => {
    const transport = new ReplayTransport(loadReplayFile(fixture("incomplete.json")));
    const result = await adapterOn(transport).call(request());
    expect(result.status).toBe("incomplete");
    expect(result.incompleteReason).toBe("max_output_tokens");
    expect(result.outputText).toBe("");
    expect(result.attempts).toHaveLength(1);
  });
});

describe("retries", () => {
  it("RL-01 a provider 5xx is retried twice with backoff, then the call fails", async () => {
    const delays: number[] = [];
    const error: ReplayStep = { kind: "http_error", status: 500, code: null, retryAfter: null };
    const transport = synthetic([error, error, error]);
    const result = await adapterOn(transport, delays).call(request());
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("http_500");
    expect(result.attempts.map((a) => a.httpStatus)).toEqual([500, 500, 500]);
    expect(delays).toEqual([1500, 2500]);
    expect(transport.remaining).toBe(0);
    expect(result.costEstimateUsd).toBe(0);
  });

  it("honors Retry-After on a 503 and succeeds on the next attempt", async () => {
    const delays: number[] = [];
    const busy: ReplayStep = {
      kind: "http_error",
      status: 503,
      code: "service_overloaded",
      retryAfter: "60",
    };
    if (!completedStream) throw new Error("fixture missing");
    const result = await adapterOn(synthetic([busy, completedStream]), delays).call(request());
    expect(result.status).toBe("succeeded");
    expect(delays).toEqual([60_000]);
    expect(result.attempts.map((a) => a.code)).toEqual(["service_overloaded", null]);
  });

  it.each([400, 401, 402, 403, 404, 413])("never retries HTTP %i", async (status) => {
    const delays: number[] = [];
    const transport = synthetic([
      { kind: "http_error", status, code: null, retryAfter: null },
      { kind: "http_error", status, code: null, retryAfter: null },
    ]);
    const result = await adapterOn(transport, delays).call(request());
    expect(result.status).toBe("failed");
    expect(result.attempts).toHaveLength(1);
    expect(delays).toEqual([]);
    expect(transport.remaining).toBe(1);
  });

  it("retries a stream with no first event, then reports the timeout", async () => {
    const stall: ReplayStep = { kind: "stall", requestId: null, events: [] };
    const result = await adapterOn(synthetic([stall, stall, stall])).call(request());
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("first_event_timeout");
    expect(result.attempts).toHaveLength(3);
    expect(result.costEstimateUsd).toBeNull();
  });

  it("retries a stream that goes idle after its first event", async () => {
    const idle: ReplayStep = {
      kind: "stall",
      requestId: null,
      events: [{ type: "response.created", response: { id: "resp_synthetic_idle" } }],
    };
    if (!completedStream) throw new Error("fixture missing");
    const result = await adapterOn(synthetic([idle, completedStream])).call(request());
    expect(result.status).toBe("succeeded");
    expect(result.attempts.map((a) => a.code)).toEqual(["idle_timeout", null]);
  });

  it("retries a mid-stream server_shutting_down error event", async () => {
    const shutdown: ReplayStep = {
      kind: "stream",
      requestId: null,
      events: [
        { type: "response.created", response: { id: "resp_synthetic_shutdown" } },
        { type: "error", code: "server_shutting_down", message: "draining" },
      ],
    };
    if (!completedStream) throw new Error("fixture missing");
    const result = await adapterOn(synthetic([shutdown, completedStream])).call(request());
    expect(result.status).toBe("succeeded");
    expect(result.attempts.map((a) => a.code)).toEqual(["server_shutting_down", null]);
  });

  it("does not retry a response.failed with a non-transient code", async () => {
    const failed: ReplayStep = {
      kind: "stream",
      requestId: null,
      events: [
        {
          type: "response.failed",
          response: {
            id: "resp_synthetic_failed",
            status: "failed",
            error: { code: "invalid_prompt" },
          },
        },
      ],
    };
    const transport = synthetic([failed, failed]);
    const result = await adapterOn(transport).call(request());
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("invalid_prompt");
    expect(transport.remaining).toBe(1);
  });
});

describe("spend and cancellation", () => {
  it("stops before a call the spend guard cannot reserve", async () => {
    const transport = new ReplayTransport(loadReplayFile(fixture("structured-completed.json")));
    const guard: SpendGuard = { reserve: () => false, settle: () => undefined };
    const result = await adapterOn(transport, [], guard).call(request());
    expect(result.errorCode).toBe("budget_exhausted");
    expect(transport.opened).toHaveLength(0);
  });

  it("settles each reservation with the computed estimate", async () => {
    const settled: [number, number | null][] = [];
    const guard: SpendGuard = {
      reserve: () => true,
      settle: (reserved, estimate) => settled.push([reserved, estimate]),
    };
    const transport = new ReplayTransport(loadReplayFile(fixture("structured-completed.json")));
    await adapterOn(transport, [], guard).call(request());
    expect(settled).toHaveLength(1);
    const [reserved, estimate] = settled[0] ?? [0, null];
    expect(estimate).toBe(
      estimateCostUsd("muse-spark-1.3", {
        inputTokens: 412,
        outputTokens: 96,
        cachedTokens: 0,
        reasoningTokens: 40,
      }),
    );
    expect(reserved).toBeGreaterThan(estimate ?? Infinity);
  });

  it("a cancelled call makes no request", async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = new ReplayTransport(loadReplayFile(fixture("structured-completed.json")));
    const result = await adapterOn(transport).call(request(), { signal: controller.signal });
    expect(result.errorCode).toBe("cancelled");
    expect(transport.opened).toHaveLength(0);
  });
});

describe("replay labels and recording", () => {
  it("refuses a request for a model the replay does not hold", async () => {
    const transport = new ReplayTransport(loadReplayFile(fixture("structured-completed.json")));
    const result = await adapterOn(transport).call(request({ model: "muse-spark-1.2" }));
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("replay_model_mismatch");
  });

  it("every fixture is labeled synthetic", () => {
    for (const name of [
      "structured-completed.json",
      "tool-round-trip.json",
      "refusal.json",
      "incomplete.json",
    ]) {
      const file = loadReplayFile(fixture(name));
      expect(file.origin).toBe("synthetic");
      expect(file.description.startsWith("Synthetic")).toBe(true);
    }
  });

  it("a recording replays to the same result and is labeled recorded", async () => {
    const recorder = new RecordingTransport(
      new ReplayTransport(loadReplayFile(fixture("tool-round-trip.json"))),
    );
    const first = await adapterOn(recorder).call(request({ tools: [READ_CASE] }));
    const file = recorder.toReplayFile(
      "muse-spark-1.3",
      "Recorded in a test from a synthetic replay.",
    );
    expect(file.origin).toBe("recorded");
    const again = await adapterOn(new ReplayTransport(file)).call(request({ tools: [READ_CASE] }));
    expect(again.replayOrigin).toBe("recorded");
    expect(again.toolCalls).toEqual(first.toolCalls);
    expect(again.usage).toEqual(first.usage);
  });

  it("TR-03 a recording holding a credential-like string is refused", () => {
    const file = parseReplayFile({
      format: "siterra-model-replay@1",
      origin: "recorded",
      model: "muse-spark-1.3",
      description: "test",
      steps: [
        {
          kind: "stream",
          requestId: null,
          events: [{ note: ["LLM", "12345", "abcdef"].join("_") }],
        },
      ],
    });
    expect(() => {
      assertNoSecrets(file);
    }).toThrow(SecretInRecordingError);
  });
});
