import type { ModelEvent, ToolCall, Usage } from "./types.ts";

// Stream event shapes follow Meta's Responses documentation (protocols/responses#streaming,
// error-handling#streaming-errors), mirrored in the META lane notes on 2026-10-27.

/** Mid-stream error codes that are worth one more attempt of the same request. */
const TRANSIENT_STREAM_CODES = new Set([
  "server_error",
  "server_shutting_down",
  "rate_limit_exceeded",
  "service_overloaded",
  "backend_unavailable",
]);

export type StreamOutcome = "completed" | "refused" | "incomplete" | "failed";

export interface FoldedStream {
  outcome: StreamOutcome;
  code: string | null;
  transient: boolean;
  responseId: string | null;
  text: string;
  refusal: string | null;
  incompleteReason: string | null;
  toolCalls: ToolCall[];
  replayItems: unknown[];
  usage: Usage;
}

export const EMPTY_USAGE: Usage = {
  inputTokens: null,
  outputTokens: null,
  cachedTokens: null,
  reasoningTokens: null,
};

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Rec)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readUsage(response: Rec | null): Usage {
  const u = rec(response?.["usage"]);
  if (!u) return EMPTY_USAGE;
  return {
    inputTokens: int(u["input_tokens"]),
    outputTokens: int(u["output_tokens"]),
    cachedTokens: int(rec(u["input_tokens_details"])?.["cached_tokens"]),
    reasoningTokens: int(rec(u["output_tokens_details"])?.["reasoning_tokens"]),
  };
}

function toolCallOf(item: Rec): ToolCall | null {
  if (item["type"] !== "function_call") return null;
  const callId = str(item["call_id"]);
  const name = str(item["name"]);
  const args = str(item["arguments"]);
  if (callId === null || name === null || args === null) return null;
  return { callId, name, arguments: args };
}

/** Output items an encrypted-reasoning replay needs, in their original order. */
function replayItemsOf(output: unknown[]): unknown[] {
  const items: unknown[] = [];
  for (const raw of output) {
    const item = rec(raw);
    if (!item) continue;
    if (item["type"] === "reasoning" && typeof item["encrypted_content"] === "string") {
      items.push({
        type: "reasoning",
        summary: list(item["summary"]),
        encrypted_content: item["encrypted_content"],
      });
    } else if (item["type"] === "function_call") {
      const call = toolCallOf(item);
      if (call) {
        items.push({
          type: "function_call",
          call_id: call.callId,
          name: call.name,
          arguments: call.arguments,
        });
      }
    }
  }
  return items;
}

function refusalIn(output: unknown[]): string | null {
  for (const raw of output) {
    for (const part of list(rec(raw)?.["content"])) {
      const p = rec(part);
      if (p?.["type"] === "refusal") return str(p["refusal"]) ?? "";
    }
  }
  return null;
}

function textIn(output: unknown[]): string {
  let text = "";
  for (const raw of output) {
    const item = rec(raw);
    if (item?.["type"] !== "message") continue;
    for (const part of list(item["content"])) {
      const p = rec(part);
      if (p?.["type"] === "output_text") text += str(p["text"]) ?? "";
    }
  }
  return text;
}

/**
 * Folds one attempt's raw stream into a result and emits normalized events as they arrive.
 * Partial function-call arguments are accumulated but never emitted.
 */
export async function foldStream(
  events: AsyncIterable<unknown>,
  attempt: number,
  emit: (event: ModelEvent) => void,
): Promise<FoldedStream> {
  let responseId: string | null = null;
  let text = "";
  let refusal: string | null = null;
  const proposed = new Map<string, ToolCall>();

  const propose = (call: ToolCall): void => {
    if (proposed.has(call.callId)) return;
    proposed.set(call.callId, call);
    emit({ type: "tool_proposal", attempt, call });
  };

  const finish = (
    outcome: StreamOutcome,
    response: Rec | null,
    code: string | null,
    transient: boolean,
    incompleteReason: string | null,
  ): FoldedStream => {
    const output = list(response?.["output"]);
    for (const raw of output) {
      const item = rec(raw);
      const call = item ? toolCallOf(item) : null;
      if (call) propose(call);
    }
    const usage = readUsage(response);
    emit({ type: "usage", attempt, usage });
    const finalRefusal = refusal ?? refusalIn(output);
    const finalText = text !== "" ? text : textIn(output);
    let result: StreamOutcome = outcome;
    if (outcome === "completed" && finalRefusal !== null) result = "refused";
    if (result === "completed") emit({ type: "completed", attempt });
    if (result === "refused") emit({ type: "refused", attempt, refusal: finalRefusal ?? "" });
    if (result === "incomplete") emit({ type: "incomplete", attempt, reason: incompleteReason });
    if (result === "failed") {
      emit({ type: "failed", attempt, code: code ?? "server_error", transient });
    }
    return {
      outcome: result,
      code: result === "failed" ? (code ?? "server_error") : null,
      transient: result === "failed" && transient,
      responseId: str(response?.["id"]) ?? responseId,
      text: result === "refused" ? "" : finalText,
      refusal: result === "refused" ? (finalRefusal ?? "") : null,
      incompleteReason: result === "incomplete" ? incompleteReason : null,
      toolCalls: [...proposed.values()],
      replayItems: replayItemsOf(output),
      usage,
    };
  };

  for await (const raw of events) {
    const ev = rec(raw);
    if (!ev) continue;
    const type = str(ev["type"]);
    switch (type) {
      case "response.created":
      case "response.in_progress":
        responseId = str(rec(ev["response"])?.["id"]) ?? responseId;
        break;
      case "response.output_text.delta": {
        const delta = str(ev["delta"]) ?? "";
        text += delta;
        if (delta !== "") emit({ type: "model_delta", attempt, text: delta });
        break;
      }
      case "response.refusal.done":
        refusal = str(ev["refusal"]) ?? "";
        break;
      case "response.output_item.done": {
        const item = rec(ev["item"]);
        const call = item ? toolCallOf(item) : null;
        if (call) propose(call);
        break;
      }
      case "response.completed":
        return finish("completed", rec(ev["response"]), null, false, null);
      case "response.incomplete": {
        const response = rec(ev["response"]);
        const reason = str(rec(response?.["incomplete_details"])?.["reason"]);
        return finish("incomplete", response, null, false, reason);
      }
      case "response.failed": {
        const response = rec(ev["response"]);
        const code = str(rec(response?.["error"])?.["code"]) ?? "server_error";
        return finish("failed", response, code, TRANSIENT_STREAM_CODES.has(code), null);
      }
      case "error": {
        const code = str(ev["code"]) ?? "server_error";
        return finish("failed", null, code, TRANSIENT_STREAM_CODES.has(code), null);
      }
      default:
        break;
    }
  }
  return finish("failed", null, "stream_ended_without_terminal", true, null);
}
