import type { Task } from "@siterra/contracts";

import type { JsonSchema } from "../model/types.ts";

// Function tools offered to a model are reads and deterministic computation only
// (docs/reference/agent-orchestration.md#tools-and-permissions). Proposals are never tools: they
// are the structured final output of a task.

/** Tool names in Task.allowedTools of the case contracts. */
export type ToolName = Task["allowedTools"][number];

export type ParsedArgs<A> = { ok: true; value: A } | { ok: false; message: string };

export interface ToolOutput {
  /** JSON-serializable value returned to the model as the function call output. */
  output: unknown;
  /** Record IDs the result refers to, for the trace. */
  resultEntityIds: string[];
}

export class ToolFailure extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolFailure";
    this.code = code;
  }
}

export interface ToolHandler<A = unknown> {
  readonly name: ToolName;
  readonly description: string;
  readonly parameters: JsonSchema;
  parse(args: unknown): ParsedArgs<A>;
  /** Sanitized, human-readable summary for the trace (at most 500 characters), written by code. */
  summarize(args: A): string;
  /** Throws `ToolFailure` for an expected refusal (unknown bundle, stale revision). */
  run(args: A, signal: AbortSignal): Promise<ToolOutput>;
  /**
   * The datasets a data load reads, by ID. A refused or failed load names them as blocked inputs
   * of the task unless a later load of the same dataset succeeds.
   */
  datasetIds?(args: A): string[];
}
