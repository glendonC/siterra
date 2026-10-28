// The activity panel, projected from the request's Task records and its event log: one row per task in the
// order it was queued, with its status, the models and tools it used, what it returned, the proposals
// validation rejected and the rule that fired, the inputs it is blocked on, and why it failed. Every line
// is a catalog string filled from a record or an event's own message; nothing is inferred.

import type { Event, Task, ValidationResult } from "@siterra/contracts";
import { failureCause } from "../card/work";
import { en, format, type MessageId } from "../copy/en";

export type ActivityLineKind = "returned" | "check" | "rejected" | "blocked" | "cause";

export interface ActivityLine {
  kind: ActivityLineKind;
  text: string;
}

export interface ActivityRow {
  taskId: string;
  label: string;
  question: string;
  state: Task["status"];
  status: string;
  /** The models and tools the step used, in the order they first ran. */
  badges: string[];
  lines: ActivityLine[];
}

export type TaskView = Pick<
  Task,
  | "id"
  | "commandId"
  | "kind"
  | "question"
  | "status"
  | "failureCode"
  | "missingInputs"
  | "createdAt"
>;
export type EventView = Pick<
  Event,
  "sequence" | "kind" | "commandId" | "taskId" | "message" | "tool" | "usage" | "validation"
>;

const STATUS: Record<Task["status"], MessageId> = {
  queued: "task.queued",
  running: "task.running",
  awaiting_input: "task.needs_input",
  awaiting_review: "task.awaiting_review",
  succeeded: "task.done",
  partial: "task.partial",
  failed: "task.failed",
  cancelled: "task.cancelled",
};

/** The status a task event puts its task in. */
const EVENT_STATE: Partial<Record<Event["kind"], Task["status"]>> = {
  "task.queued": "queued",
  "task.started": "running",
  "task.progress": "running",
  "task.awaiting_input": "awaiting_input",
  "task.succeeded": "succeeded",
  "task.partial": "partial",
  "task.failed": "failed",
  "task.cancelled": "cancelled",
};

/** Task events whose message says what the step came to. */
const OUTCOME_KINDS = new Set<Event["kind"]>([
  "task.progress",
  "task.awaiting_input",
  "task.succeeded",
  "task.partial",
  "task.failed",
  "task.cancelled",
]);

/** A model's display name from its ID: the words without the version, for example Muse Spark. */
export function modelName(id: string): string {
  return id
    .replace(/-\d+(\.\d+)*$/, "")
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Whether the request's model calls were replayed, and from what: synthetic, recorded, or neither. */
export function replayOrigin(
  events: readonly EventView[],
  commandId: string,
): "synthetic" | "recorded" | undefined {
  for (const e of events)
    if (e.commandId === commandId && e.usage?.provider === "replay")
      return e.usage.replayOrigin ?? "synthetic";
  return undefined;
}

function route(usage: NonNullable<Event["usage"]>): string {
  if (usage.provider === "replay")
    return en[
      usage.replayOrigin === "recorded" ? "activity.route.recorded" : "activity.route.synthetic"
    ].text;
  return usage.provider === "meta_model_api" ? en["activity.route.modelApi"].text : usage.provider;
}

function badgeOf(e: EventView): string | undefined {
  if (e.kind === "model.completed" && e.usage)
    return format("activity.model", { model: modelName(e.usage.model), route: route(e.usage) });
  if (e.kind === "tool.started" && e.tool) {
    const t = e.tool.name;
    return format(t.startsWith("propose_") ? "activity.proposal" : "activity.code", { tool: t });
  }
  return undefined;
}

function rejectedLines(v: ValidationResult): ActivityLine[] {
  return v.issues.map((i) => ({
    kind: "rejected" as const,
    text: format("activity.rejected", { rule: en[`rule.${i.code}`].text, code: i.code }),
  }));
}

export interface ActivityOptions {
  /** A paced replay: a step shows once one of its events has played. */
  playedOnly?: boolean;
}

export function projectActivity(
  tasks: readonly TaskView[],
  events: readonly EventView[],
  commandId: string,
  { playedOnly = false }: ActivityOptions = {},
): ActivityRow[] {
  const own = events.filter((e) => e.commandId === commandId);
  const firstSeen = new Map<string, number>();
  for (const e of own)
    if (e.taskId && !firstSeen.has(e.taskId)) firstSeen.set(e.taskId, e.sequence);
  const order = (t: TaskView) => firstSeen.get(t.id) ?? Number.MAX_SAFE_INTEGER;
  return tasks
    .filter((t) => t.commandId === commandId && (!playedOnly || firstSeen.has(t.id)))
    .sort((a, b) => order(a) - order(b) || a.createdAt.localeCompare(b.createdAt))
    .map((t) => {
      const mine = own.filter((e) => e.taskId === t.id);
      let state: Task["status"] | undefined;
      const badges: string[] = [];
      const lines: ActivityLine[] = [];
      for (const e of mine) {
        state = EVENT_STATE[e.kind] ?? state;
        // a step with no task.started event (the plan) runs once its first model or tool call starts
        if (
          (e.kind === "model.started" || e.kind === "tool.started") &&
          (!state || state === "queued")
        )
          state = "running";
        const badge = badgeOf(e);
        if (badge && !badges.includes(badge)) badges.push(badge);
        if (e.kind === "tool.completed") lines.push({ kind: "returned", text: e.message });
        if (e.kind === "validation.completed" && e.validation) {
          lines.push({ kind: "check", text: e.message });
          lines.push(...rejectedLines(e.validation));
        }
        if (OUTCOME_KINDS.has(e.kind)) lines.push({ kind: "returned", text: e.message });
      }
      // before its first task event the record is all there is
      const now = state ?? t.status;
      if (t.missingInputs.length > 0 && ["awaiting_input", "partial", "failed"].includes(now))
        lines.push({
          kind: "blocked",
          text: format("activity.blocked", { inputs: t.missingInputs.join(", ") }),
        });
      if (now === "failed" && t.failureCode) {
        const words = failureCause(t.failureCode);
        lines.push({
          kind: "cause",
          text: format("activity.cause", { cause: words ? en[words].text : t.failureCode }),
        });
      }
      return {
        taskId: t.id,
        label: en[`task.kind.${t.kind}`].text,
        question: t.question,
        state: now,
        status: en[STATUS[now]].text,
        badges,
        lines,
      };
    });
}

/** The log as a reading-pace replay shows it: the request's first n events, and every other event. */
export function pacedEvents<E extends Pick<Event, "commandId">>(
  events: readonly E[],
  commandId: string,
  n: number,
): E[] {
  let seen = 0;
  return events.filter((e) => e.commandId !== commandId || seen++ < n);
}
