import { createHash } from "node:crypto";

import type { TraceEventDraft, TraceSink } from "./trace.ts";

// Turns trace drafts into PLATFORM's EventDraft shape (packages/db/src/events.ts): adds the command
// ID, a dedupeKey and the span fields. The key covers the task attempt and the event's ordinal in
// that attempt, so a re-delivered event is dropped while a retried task run keeps its own events.

export interface EventDraftRecord extends Omit<TraceEventDraft, "kind" | "taskId"> {
  kind: TraceEventDraft["kind"] | "command.completed";
  /** Null for command-level events. */
  taskId: string | null;
  commandId: string;
  dedupeKey: string;
  spanId: string | null;
  parentSpanId: string | null;
}

const COMMAND_WORDS = {
  succeeded: "Command completed.",
  partial: "Command completed in part; the tasks list what was not done.",
  failed: "Command failed; the tasks list why.",
  cancelled: "Command cancelled.",
} as const;

/** The command.completed event, keyed like PLATFORM's command.accepted (`<kind>:<commandId>`). */
export function commandCompletedDraft(
  commandId: string,
  status: keyof typeof COMMAND_WORDS,
  taskIds: string[],
  at: string,
): EventDraftRecord {
  return {
    kind: "command.completed",
    taskId: null,
    commandId,
    occurredAt: at,
    entityIds: [commandId, ...taskIds],
    message: COMMAND_WORDS[status],
    resultStatus: status,
    usage: null,
    tool: null,
    validation: null,
    dedupeKey: `command.completed:${commandId}`,
    spanId: null,
    parentSpanId: null,
  };
}

export function dedupeKey(taskId: string, attempt: number, kind: string, ordinal: number): string {
  const digest = createHash("sha256")
    .update([taskId, String(attempt), kind, String(ordinal)].join("\u0000"))
    .digest("hex");
  return `evt-${digest.slice(0, 32)}`;
}

/** A sink that numbers each task's events and hands complete drafts to `append`. */
export class NumberedEventSink implements TraceSink {
  readonly #commandId: string;
  readonly #attemptOf: (taskId: string) => number;
  readonly #append: (draft: EventDraftRecord) => void;
  readonly #ordinals = new Map<string, number>();

  constructor(
    commandId: string,
    attemptOf: (taskId: string) => number,
    append: (draft: EventDraftRecord) => void,
  ) {
    this.#commandId = commandId;
    this.#attemptOf = attemptOf;
    this.#append = append;
  }

  emit(event: TraceEventDraft): void {
    const ordinal = (this.#ordinals.get(event.taskId) ?? 0) + 1;
    this.#ordinals.set(event.taskId, ordinal);
    const attempt = this.#attemptOf(event.taskId);
    this.#append({
      ...event,
      commandId: this.#commandId,
      dedupeKey: dedupeKey(event.taskId, attempt, event.kind, ordinal),
      spanId: null,
      parentSpanId: null,
    });
  }
}
