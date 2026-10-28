// The work beat, projected from Task records and their events. Each step line is the question the task
// answers; a running step shows its latest progress message, and a failed, partial or waiting step says
// why in its own message (host-written, from events). Status
// changes only from events; there are no percentages and no invented progress (CMP-07 rules).

import type { Event, Task } from "@siterra/contracts";
import type { CardStep, StepState } from "../card/content";

export type TaskView = Pick<
  Task,
  "id" | "commandId" | "kind" | "question" | "status" | "createdAt"
>;
export type EventView = Pick<Event, "taskId" | "sequence" | "kind" | "message">;

const STATE: Record<Task["status"], StepState> = {
  queued: "queued",
  running: "running",
  awaiting_input: "needs_input",
  awaiting_review: "done",
  succeeded: "done",
  partial: "partial",
  failed: "failed",
  cancelled: "cancelled",
};

/** Events whose message says what a task did or is doing. */
const MILESTONE_KINDS = new Set<Event["kind"]>([
  "task.progress",
  "task.succeeded",
  "task.partial",
  "task.failed",
  "task.awaiting_input",
]);

/** States whose line is the task's own latest message; a done or queued step reads as its question. */
const MESSAGE_STATES = new Set<StepState>(["running", "failed", "partial", "needs_input"]);

export interface WorkProjection {
  steps: CardStep[];
  running: boolean;
}

export function projectWork(
  commandId: string,
  tasks: TaskView[],
  events: EventView[],
): WorkProjection {
  const own = tasks
    .filter((t) => t.commandId === commandId && t.kind !== "plan")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const latest = new Map<string, EventView>();
  for (const e of events) {
    if (!e.taskId || !MILESTONE_KINDS.has(e.kind)) continue;
    const prev = latest.get(e.taskId);
    if (!prev || e.sequence > prev.sequence) latest.set(e.taskId, e);
  }
  const steps = own.map((t, i) => ({
    n: i + 1,
    text:
      (MESSAGE_STATES.has(STATE[t.status]) ? latest.get(t.id)?.message : undefined) ?? t.question,
    state: STATE[t.status],
    taskId: t.id,
  }));
  return { steps, running: steps.some((s) => s.state === "running" || s.state === "queued") };
}
