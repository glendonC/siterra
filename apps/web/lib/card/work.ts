// The work beat's card from the records: the question, what the request is doing now (the latest
// milestone of the command, or how many steps it planned), and once it ends, its outcome and the
// Observations it produced. The steps themselves are in the activity panel, so the card stays within its
// 45 words; a replay playing at reading pace holds the outcome until its steps have played. An
// Observations line shows only for a bundle that
// accepted observation evidence from this command's tasks cites: the case's precomputed bundles are
// input, not a result (demo plan, rule 3).

import type { CaseSnapshot, Task } from "@siterra/contracts";
import type { EventLog } from "../case/events";
import { en, format, type MessageId } from "../copy/en";
import { projectFindings } from "../projection/findings";
import type { ObservationLine } from "../projection/observations";
import { projectWork } from "../projection/work";
import type { CardContent } from "./content";

export type RequestOutcome = "running" | "succeeded" | "partial" | "failed" | "cancelled";

const CAUSES: Record<string, MessageId> = {
  round_limit: "work.cause.roundLimit",
  validation_rejected: "work.cause.rejected",
};
/** Codes that only say an earlier task failed; the cause is that task's. */
const DOWNSTREAM = new Set(["dependency_failed", "dependency_unresolved"]);
/** The scope refusal's failure code (packages/agent tasks/scope.ts OUT_OF_SCOPE). */
const OUT_OF_SCOPE = "out_of_scope";

export interface WorkCardOptions {
  /** A replay still playing at reading pace: the log is what has played so far, and the outcome waits. */
  pacing?: boolean;
}

export function workCard(
  s: CaseSnapshot,
  log: EventLog,
  commandId: string,
  observations: ObservationLine[],
  { pacing = false }: WorkCardOptions = {},
): CardContent {
  const work = projectWork(commandId, s.records.taskRecords, log.events);
  const latest = [...log.events].reverse().find((e) => e.commandId === commandId);
  const outcome = pacing ? "running" : requestOutcome(s, log, commandId);
  const ended = outcome !== "running";
  const tasks = commandTasks(s, commandId);
  const produced = producedObservations(s, tasks);
  const lines = ended ? observations.filter((o) => produced.bundleIds.has(o.bundleId)) : [];
  const findings = ended ? projectFindings(s, commandId) : undefined;
  const refused = ended && tasks.some((t) => t.failureCode === OUT_OF_SCOPE);
  return {
    // the worker gives the plan task the command's own text; before it exists, the case question
    question: tasks.find((t) => t.kind === "plan")?.question ?? s.case.objective,
    // the steps themselves are in the activity panel
    ...(refused ? { status: en["work.outOfScope"].text } : {}),
    working: refused
      ? en["work.outOfScopeDetail"].text
      : ended
        ? outcomeLine(outcome, tasks, acceptedFindings(s, tasks))
        : !pacing && work.steps.length > 0
          ? format("work.planning", { n: work.steps.length })
          : (latest?.message ?? en["work.received"].text),
    ...(lines.length > 0
      ? {
          section: {
            heading: en["work.observations"].text,
            lines: lines.map((o) =>
              format("work.observationLine", {
                label: o.label,
                available: o.available,
                total: o.total,
                first: o.first,
                last: o.last,
              }),
            ),
          },
        }
      : {}),
    ...(findings && findings.items.length > 0 ? { findings } : {}),
    sources: [],
    recordIds: [
      commandId,
      ...(lines.length > 0 ? produced.evidenceIds : []),
      ...lines.map((o) => o.bundleId),
      ...(findings ? findings.items.flatMap((f) => f.recordIds) : []),
    ],
  };
}

function commandTasks(s: CaseSnapshot, commandId: string): Task[] {
  return s.records.taskRecords
    .filter((t) => t.commandId === commandId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Accepted observation evidence that this command's tasks generated, and the bundles it cites. */
function producedObservations(s: CaseSnapshot, tasks: Task[]) {
  const taskIds = new Set(tasks.map((t) => t.id));
  const bundleOf = new Map(s.records.measurementRecords.map((m) => [m.id, m.dataBundleId]));
  const evidenceIds: string[] = [];
  const bundleIds = new Set<string>();
  for (const e of s.records.evidenceRecords) {
    const by = e.provenance.generatedByTaskId;
    if (e.claimKind !== "observation" || e.status !== "accepted" || !by || !taskIds.has(by))
      continue;
    evidenceIds.push(e.id);
    for (const id of e.provenance.dataBundleIds) bundleIds.add(id);
    for (const id of e.measurementIds) {
      const b = bundleOf.get(id);
      if (b) bundleIds.add(b);
    }
  }
  return { evidenceIds, bundleIds };
}

/** Accepted evidence of any claim kind that this command's tasks generated. */
function acceptedFindings(s: CaseSnapshot, tasks: Task[]): number {
  const taskIds = new Set(tasks.map((t) => t.id));
  return s.records.evidenceRecords.filter(
    (e) => e.status === "accepted" && taskIds.has(e.provenance.generatedByTaskId ?? ""),
  ).length;
}

function outcomeLine(
  outcome: Exclude<RequestOutcome, "running">,
  tasks: Task[],
  findings: number,
): string {
  if (outcome === "succeeded") return format("work.complete", { n: findings });
  if (outcome === "cancelled") return en["work.cancelled"].text;
  if (outcome === "partial") {
    const notDone = tasks.filter((t) => t.status !== "succeeded");
    return format("work.partial", {
      tasks: notDone.map((t) => en[`task.kind.${t.kind}`].text).join(", "),
    });
  }
  const code = tasks.find(
    (t) => t.status === "failed" && t.failureCode && !DOWNSTREAM.has(t.failureCode),
  )?.failureCode;
  const cause = (code ? failureCause(code) : undefined) ?? "work.cause.other";
  return format("work.failed", { cause: en[cause].text });
}

/** Plain words for a task's failure code, when the catalog has them. */
export function failureCause(code: string): MessageId | undefined {
  if (code === OUT_OF_SCOPE) return "work.outOfScopeDetail";
  return CAUSES[code] ?? (/^http_5\d\d$/.test(code) ? "work.cause.modelDown" : undefined);
}

/**
 * The request's outcome from the case record: the result its command.completed event states, otherwise
 * what its tasks add up to, by the coordinator's rule (none usable is failed, all succeeded is
 * succeeded, anything between is partial).
 */
export function requestOutcome(s: CaseSnapshot, log: EventLog, commandId: string): RequestOutcome {
  const mine = log.events.filter((e) => e.commandId === commandId);
  const completed = mine.findLast((e) => e.kind === "command.completed");
  if (completed?.resultStatus) return completed.resultStatus;
  const tasks = commandTasks(s, commandId);
  if (mine.some((e) => e.kind === "task.cancelled") || tasks.some((t) => t.status === "cancelled"))
    return "cancelled";
  const open = tasks.some((t) =>
    ["queued", "running", "awaiting_input", "awaiting_review"].includes(t.status),
  );
  if (open || (tasks.length === 0 && !completed)) return "running";
  const usable = tasks.filter((t) => t.status === "succeeded" || t.status === "partial").length;
  if (usable === 0) return "failed";
  return tasks.every((t) => t.status === "succeeded") ? "succeeded" : "partial";
}

/** True while the command still has work queued or running. */
export function commandRunning(s: CaseSnapshot, log: EventLog, commandId: string): boolean {
  const done = log.events.some(
    (e) =>
      e.commandId === commandId && (e.kind === "command.completed" || e.kind === "task.cancelled"),
  );
  if (done) return false;
  const tasks = s.records.taskRecords.filter((t) => t.commandId === commandId);
  return tasks.length === 0 || tasks.some((t) => t.status === "queued" || t.status === "running");
}
