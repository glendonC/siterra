import type { ModelCallResult, ModelRoute, ReplayOrigin } from "../model/types.ts";
import type { ToolName } from "../tools/tool.ts";
import type { ValidationResult } from "./validation.ts";

// Trace event drafts. The commit API assigns IDs, sequence numbers and the case revision; this
// package fills the rest. Messages come from the templates below, never from a model.

export type TraceKind =
  | "task.started"
  | "task.succeeded"
  | "task.partial"
  | "task.failed"
  | "task.cancelled"
  | "task.queued"
  | "model.started"
  | "model.completed"
  | "tool.started"
  | "tool.completed"
  | "validation.completed";

/** Mirrors ModelUsage in case.schema.json 1.7.0. */
export interface ModelUsageDraft {
  provider: string;
  model: string;
  requestId: string | null;
  status: "started" | "succeeded" | "refused" | "incomplete" | "failed";
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  estimatedCostMicroUsd: number | null;
  durationMs: number | null;
  reasoningTokens: number | null;
  webSearchCalls: number | null;
  /** Set on the replay route only, so lineage reads "synthetic" or "recorded" (contracts 1.7.0). */
  replayOrigin?: ReplayOrigin;
}

/** Mirrors ToolCallInfo in case.schema.json 1.2. */
export interface ToolCallDraft {
  name: ToolName;
  status: "started" | "succeeded" | "failed" | "rejected" | "cancelled";
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  argumentSummary: string;
  resultEntityIds: string[];
  errorCode: string | null;
  attempt: number;
}

export interface TraceEventDraft {
  kind: TraceKind;
  taskId: string;
  occurredAt: string;
  entityIds: string[];
  message: string;
  resultStatus: "succeeded" | "partial" | "failed" | "cancelled" | null;
  usage: ModelUsageDraft | null;
  tool: ToolCallDraft | null;
  validation: ValidationResult | null;
}

export interface TraceSink {
  emit(event: TraceEventDraft): void;
}

/** The provider label recorded with every call; a replay is never recorded as a provider call. */
export function providerLabel(route: ModelRoute): string {
  return route === "replay" ? "replay" : "meta_model_api";
}

/**
 * The limitation every record a task writes on the replay route carries, so a reader of the
 * record, not only of its model events, sees that no live model call wrote it (lead, after b30).
 * An unlabeled replay reads as synthetic.
 */
export function replayLimitation(route: ModelRoute, origin: ReplayOrigin | null): string[] {
  if (route !== "replay") return [];
  return [
    origin === "recorded"
      ? "Written from a recorded replay of an earlier model call, not a live model call."
      : "Written from a synthetic replay, not a model output or a live model call.",
  ];
}

/** "replay, synthetic" or "Model API": shown with every model event so replayed work is labeled. */
export function routeLabel(route: ModelRoute, origin: ReplayOrigin | null): string {
  return route === "replay" ? `replay, ${origin ?? "unlabeled"}` : "Model API";
}

export function usageDraft(call: ModelCallResult): ModelUsageDraft {
  return {
    provider: providerLabel(call.route),
    model: call.model,
    requestId: call.providerRequestId ?? call.providerResponseId,
    status: call.status,
    inputTokens: call.usage.inputTokens,
    outputTokens: call.usage.outputTokens,
    cachedInputTokens: call.usage.cachedTokens,
    estimatedCostMicroUsd:
      call.costEstimateUsd === null ? null : Math.round(call.costEstimateUsd * 1_000_000),
    durationMs: call.durationMs,
    reasoningTokens: call.usage.reasoningTokens,
    webSearchCalls: null,
    ...(call.route === "replay" && call.replayOrigin !== null
      ? { replayOrigin: call.replayOrigin }
      : {}),
  };
}

const CALL_STATUS_WORDS: Record<ModelCallResult["status"], string> = {
  succeeded: "finished",
  refused: "was refused by the model",
  incomplete: "ended incomplete",
  failed: "failed",
};

export const messages = {
  modelStarted: (model: string, route: string): string =>
    `Model call to ${model} (${route}) started.`,
  modelCompleted: (call: ModelCallResult): string =>
    `Model call to ${call.model} (${routeLabel(call.route, call.replayOrigin)}) ${CALL_STATUS_WORDS[call.status]}` +
    (call.errorCode ? ` with ${call.errorCode}` : "") +
    (call.attempts.length > 1 ? ` after ${call.attempts.length} attempts.` : "."),
  toolStarted: (name: string): string => `Tool ${name} started.`,
  toolCompleted: (name: string, status: ToolCallDraft["status"], results: number): string =>
    status === "succeeded"
      ? `Tool ${name} returned ${results} ${results === 1 ? "record" : "records"}.`
      : `Tool ${name} ${status}.`,
  validation: (result: ValidationResult): string =>
    result.outcome === "accepted"
      ? "Proposal accepted by validation."
      : `Proposal ${result.outcome} by validation with ${result.issues.length} ${result.issues.length === 1 ? "issue" : "issues"}.`,
  planQueued: (kind: string): string => `Task queued: ${kind.replaceAll("_", " ")}.`,
};
