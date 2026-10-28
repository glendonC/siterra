import type { MetaAdapter } from "../model/adapter.ts";
import type { InputItem, ModelCallResult, ModelRequest, ToolCall } from "../model/types.ts";
import { ToolFailure } from "../tools/tool.ts";
import type { ToolHandler } from "../tools/tool.ts";
import { messages, routeLabel, usageDraft } from "./trace.ts";
import type { ToolCallDraft, TraceSink } from "./trace.ts";
import type { Checked, ValidationIssue, ValidationResult } from "./validation.ts";

// One task's model loop: model turns, read and deterministic tool calls, then a structured final
// proposal that host code validates. A rejected proposal gets one repair turn
// (docs/reference/agent-orchestration.md#validation); the round limit comes from host code.

export const DEFAULT_MAX_ROUNDS = 6;

export type LoopStatus =
  "accepted" | "rejected" | "refused" | "incomplete" | "model_failed" | "round_limit" | "cancelled";

export interface LoopResult<T> {
  status: LoopStatus;
  value: T | null;
  /** The last validation outcome, or null when no proposal reached validation. */
  validation: ValidationResult | null;
  failureCode: string | null;
  calls: ModelCallResult[];
  repaired: boolean;
}

export interface LoopOptions<T> {
  adapter: MetaAdapter;
  request: Omit<ModelRequest, "input" | "tools">;
  input: readonly InputItem[];
  tools: readonly ToolHandler<never>[];
  /** Host validation of the final output. `ok` with issues means a partial result: valid items only. */
  validate: (outputText: string) => Checked<T> | Promise<Checked<T>>;
  taskId: string;
  trace: TraceSink;
  now: () => Date;
  signal?: AbortSignal;
  maxRounds?: number;
}

function repairText(issues: readonly ValidationIssue[], outputText: string): string {
  const lines = issues.map((i) => `- ${i.code} at ${i.path}: ${i.message}`).join("\n");
  return (
    "Your previous proposal failed validation. Return a corrected proposal that fixes every issue.\n" +
    `Issues:\n${lines}\nPrevious proposal:\n${outputText}`
  );
}

export async function runTaskLoop<T>(options: LoopOptions<T>): Promise<LoopResult<T>> {
  const signal = options.signal ?? new AbortController().signal;
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const handlers = new Map(options.tools.map((t) => [t.name as string, t]));
  const toolDefs = options.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
  const input: InputItem[] = [...options.input];
  const calls: ModelCallResult[] = [];
  let repaired = false;
  let validation: ValidationResult | null = null;
  const stamp = (): string => options.now().toISOString();

  const done = (status: LoopStatus, failureCode: string | null, value: T | null = null) => ({
    status,
    value,
    validation,
    failureCode,
    calls,
    repaired,
  });

  for (let round = 1; round <= maxRounds; round += 1) {
    if (signal.aborted) return done("cancelled", "cancelled");
    const route = routeLabel(options.adapter.route, options.adapter.replayOrigin);
    options.trace.emit({
      kind: "model.started",
      taskId: options.taskId,
      occurredAt: stamp(),
      entityIds: [],
      message: messages.modelStarted(options.request.model, route),
      resultStatus: null,
      usage: null,
      tool: null,
      validation: null,
    });
    const call = await options.adapter.call(
      { ...options.request, input, tools: toolDefs },
      { signal },
    );
    calls.push(call);
    options.trace.emit({
      kind: "model.completed",
      taskId: options.taskId,
      occurredAt: stamp(),
      entityIds: [],
      message: messages.modelCompleted(call),
      resultStatus: null,
      usage: usageDraft(call),
      tool: null,
      validation: null,
    });

    if (call.status === "refused") return done("refused", "model_refused");
    if (call.status === "incomplete")
      return done("incomplete", call.incompleteReason ?? "incomplete");
    if (call.status === "failed") {
      if (call.errorCode === "cancelled") return done("cancelled", "cancelled");
      return done("model_failed", call.errorCode ?? "model_failed");
    }

    if (call.toolCalls.length > 0) {
      input.push({ kind: "replay", items: call.replayItems });
      for (const toolCall of call.toolCalls) {
        input.push({
          kind: "tool_output",
          callId: toolCall.callId,
          output: JSON.stringify(await runTool(toolCall, handlers, options, signal)),
        });
      }
      continue;
    }

    const checked = await options.validate(call.outputText);
    validation = checked.ok
      ? { outcome: checked.issues.length > 0 ? "partial" : "accepted", issues: checked.issues }
      : { outcome: "rejected", issues: checked.issues };
    options.trace.emit({
      kind: "validation.completed",
      taskId: options.taskId,
      occurredAt: stamp(),
      entityIds: [],
      message: messages.validation(validation),
      resultStatus: null,
      usage: null,
      tool: null,
      validation,
    });
    if (checked.ok) return done("accepted", null, checked.value);
    if (repaired) return done("rejected", "validation_rejected");
    repaired = true;
    input.push({ kind: "replay", items: call.replayItems });
    input.push({ kind: "user_text", text: repairText(checked.issues, call.outputText) });
  }
  return done("round_limit", "round_limit");
}

async function runTool(
  call: ToolCall,
  handlers: Map<string, ToolHandler<never>>,
  options: Pick<LoopOptions<unknown>, "now" | "taskId" | "trace">,
  signal: AbortSignal,
): Promise<unknown> {
  const handler = handlers.get(call.name);
  const startedAt = options.now();
  const emit = (
    kind: "tool.started" | "tool.completed",
    tool: ToolCallDraft,
    message: string,
  ): void => {
    options.trace.emit({
      kind,
      taskId: options.taskId,
      occurredAt: options.now().toISOString(),
      entityIds: tool.resultEntityIds,
      message,
      resultStatus: null,
      usage: null,
      tool,
      validation: null,
    });
  };
  // A tool the task was not given is refused without running anything; the trace cannot name it
  // with a ToolName, so the refusal goes back to the model only.
  if (!handler) return { error: "tool_not_allowed", message: `${call.name} is not available` };

  let args: unknown;
  try {
    args = JSON.parse(call.arguments) as unknown;
  } catch {
    args = undefined;
  }
  const parsed = handler.parse(args);
  const base = {
    name: handler.name,
    startedAt: startedAt.toISOString(),
    argumentSummary: parsed.ok ? handler.summarize(parsed.value) : "Arguments did not validate.",
    attempt: 1,
  };
  emit(
    "tool.started",
    {
      ...base,
      status: "started",
      endedAt: null,
      durationMs: null,
      resultEntityIds: [],
      errorCode: null,
    },
    messages.toolStarted(handler.name),
  );
  const finish = (
    status: ToolCallDraft["status"],
    ids: string[],
    errorCode: string | null,
  ): void => {
    const ended = options.now();
    emit(
      "tool.completed",
      {
        ...base,
        status,
        endedAt: ended.toISOString(),
        durationMs: ended.getTime() - startedAt.getTime(),
        resultEntityIds: ids,
        errorCode,
      },
      messages.toolCompleted(handler.name, status, ids.length),
    );
  };
  if (!parsed.ok) {
    finish("rejected", [], "invalid_arguments");
    return { error: "invalid_arguments", message: parsed.message };
  }
  try {
    const result = await handler.run(parsed.value, signal);
    finish("succeeded", result.resultEntityIds, null);
    return result.output;
  } catch (error) {
    if (error instanceof ToolFailure) {
      finish("failed", [], error.code);
      return { error: error.code, message: error.message };
    }
    finish("failed", [], "tool_error");
    return { error: "tool_error", message: "the tool failed" };
  }
}
