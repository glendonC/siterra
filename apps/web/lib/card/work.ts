// The work beat's card from the records: the question, what the request is doing now (the latest
// milestone of the command, or its planned steps), and once it ends, its outcome and the Observations
// it produced. Steps show while the request runs; once it ends, the outcome and Observations take their
// place, so the card stays within its 45 words. An Observations line shows only for a bundle that
// accepted observation evidence from this command's tasks cites: the case's precomputed bundles are
// input, not a result (demo plan, rule 3).

import type { CaseSnapshot, Task } from "@siterra/contracts";
import type { EventLog } from "../case/events";
import { en, format, type MessageId } from "../copy/en";
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

export function workCard(
  s: CaseSnapshot,
  log: EventLog,
  commandId: string,
  observations: ObservationLine[],
): CardContent {
  const work = projectWork(commandId, s.records.taskRecords, log.events);
  const latest = [...log.events].reverse().find((e) => e.commandId === commandId);
  const outcome = requestOutcome(s, log, commandId);
  const ended = outcome !== "running";
  const showSteps = work.steps.length > 0 && !ended;
  const tasks = commandTasks(s, commandId);
  const produced = producedObservations(s, tasks);
  const lines = observations.filter((o) => produced.bundleIds.has(o.bundleId));
  return {
    // the worker gives the plan task the command's own text; before it exists, the case question
    question: tasks.find((t) => t.kind === "plan")?.question ?? s.case.objective,
    working: ended
      ? outcomeLine(outcome, tasks)
      : showSteps
        ? format("work.planning", { n: work.steps.length })
        : (latest?.message ?? en["work.received"].text),
    ...(showSteps ? { steps: work.steps } : {}),
    ...(!showSteps && lines.length > 0
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
    sources: [],
    recordIds: [
      commandId,
      ...(lines.length > 0 ? produced.evidenceIds : []),
      ...lines.map((o) => o.bundleId),
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

function outcomeLine(outcome: Exclude<RequestOutcome, "running">, tasks: Task[]): string {
  if (outcome === "succeeded") return en["work.complete"].text;
  if (outcome === "cancelled") return en["work.cancelled"].text;
  if (outcome === "partial") {
    const notDone = tasks.filter((t) => t.status !== "succeeded");
    return format("work.partial", {
      tasks: notDone.map((t) => en[`task.kind.${t.kind}`].text.toLowerCase()).join(", "),
    });
  }
  const code = tasks.find(
    (t) => t.status === "failed" && t.failureCode && !DOWNSTREAM.has(t.failureCode),
  )?.failureCode;
  let cause: MessageId = "work.cause.other";
  if (code) cause = CAUSES[code] ?? (/^http_5\d\d$/.test(code) ? "work.cause.modelDown" : cause);
  return format("work.failed", { cause: en[cause].text });
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
