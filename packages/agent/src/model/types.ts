// Provider-neutral types for the model boundary. Provider event shapes never leave
// packages/agent/src/model; everything above it sees only these types.

/** Where a call was answered. `replay` plays a stored event sequence; nothing reaches a provider. */
export type ModelRoute = "model_api" | "replay";

/** A replay sequence is either written by hand from the documented event shapes or recorded from a real call. */
export type ReplayOrigin = "synthetic" | "recorded";

export type ReasoningEffort = "low" | "medium" | "high";

/** A JSON Schema object inside Meta's strict subset (checked by `assertStrictSubset`). */
export type JsonSchema = Record<string, unknown>;

export interface FunctionTool {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface OutputSchema {
  name: string;
  schema: JsonSchema;
}

/**
 * Items a task loop sends to the model. `replay` carries the opaque output items of an
 * earlier turn (reasoning with encrypted content, function calls) back unchanged.
 */
export type InputItem =
  | { kind: "user_text"; text: string }
  | { kind: "replay"; items: readonly unknown[] }
  | { kind: "tool_output"; callId: string; output: string };

export interface ModelRequest {
  model: string;
  /** Prompt version recorded with the call; the prompt text itself is never traced. */
  promptVersion: string;
  instructions: string;
  input: readonly InputItem[];
  output: OutputSchema;
  tools: readonly FunctionTool[];
  maxOutputTokens: number;
  reasoningEffort: ReasoningEffort;
}

export interface Usage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
}

export interface ToolCall {
  callId: string;
  name: string;
  /** Complete argument text from the finished item; partial streamed text is never exposed. */
  arguments: string;
}

/** Normalized stream events, in the order the adapter emits them. */
export type ModelEvent =
  | { type: "model_delta"; attempt: number; text: string }
  | { type: "tool_proposal"; attempt: number; call: ToolCall }
  | { type: "usage"; attempt: number; usage: Usage }
  | { type: "completed"; attempt: number }
  | { type: "refused"; attempt: number; refusal: string }
  | { type: "incomplete"; attempt: number; reason: string | null }
  | { type: "failed"; attempt: number; code: string; transient: boolean };

export type CallStatus = "succeeded" | "refused" | "incomplete" | "failed";

export interface CallAttempt {
  attempt: number;
  outcome: CallStatus;
  code: string | null;
  httpStatus: number | null;
  delayBeforeMs: number;
  /** Null when the attempt never opened a stream (an HTTP error) or the stream reported none. */
  usage: Usage | null;
  costEstimateUsd: number | null;
}

/** What one model call produced. Every field here may be traced except `outputText` and `replayItems`. */
export interface ModelCallResult {
  status: CallStatus;
  model: string;
  route: ModelRoute;
  replayOrigin: ReplayOrigin | null;
  promptVersion: string;
  providerResponseId: string | null;
  providerRequestId: string | null;
  outputText: string;
  refusal: string | null;
  incompleteReason: string | null;
  toolCalls: ToolCall[];
  /** Opaque output items to send back in the next turn of the same task. */
  replayItems: unknown[];
  usage: Usage;
  /** Computed by code from the dated price table; null when usage is incomplete. */
  costEstimateUsd: number | null;
  errorCode: string | null;
  attempts: CallAttempt[];
  durationMs: number;
}
