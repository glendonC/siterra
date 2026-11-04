// A question asked from the Ask, from the case session as the valley's work card reads it (lib/card/work.ts):
// - askStatus, the status line of its steps (AtWork): at work from Enter, answered, or one sentence saying why not
// - askLine, the work card's line for it (the step running with its model, then the outcome), which the completion
//   route's own test reads; the overview shows askStatus
// - shouldReopen: the overview reopens its records only for a case revision newer than the one it holds

import type { CaseSnapshot } from "@siterra/contracts";
import { badgeOf, projectActivity } from "../activity/activity";
import { requestOutcome, workCard } from "../card/work";
import type { EventLog } from "../case/events";
import { ak, type AskMessageId } from "../copy/ask";
import { en, format, type MessageId } from "../copy/en";
import { commandFindings } from "./results";

/** The server refused the question, or it never reached the server (no status and no code). */
export interface Refusal {
  httpStatus: number | null;
  /** The problem's code (quota_exhausted, unauthenticated, ...), when it gave one. */
  code: string | null;
  /** Whose limit refused it, for quota_exhausted (lib/case/command.ts). */
  limit?: "instance" | "session";
}

/**
 * Where a question asked from the Ask stands, as its steps' status line says it (AtWork): at work from Enter until it
 * ends; answered once it ends with what it found (complete or partial), when its steps hand over to its answer; or
 * stopped, with one plain sentence (lib/copy/ask.ts) saying why.
 */
export type AskStatus =
  | { state: "working"; commandId: string | null }
  | { state: "answered"; commandId: string }
  | { state: "stopped"; commandId: string | null; text: string };

export interface AskStatusInput {
  snapshot: CaseSnapshot;
  /** The log as shown: a replay started here plays at reading pace (usePacedLog). */
  log: EventLog;
  /** The accepted question, once the server answers. */
  commandId: string | null;
  /** Enter was pressed. */
  sent: boolean;
  /** The server refused the question, or it never reached the server. */
  refusal: Refusal | null;
  /** Events of the question are still waiting to be shown. */
  pacing: boolean;
  /** The question ended failed a while ago and the case record still holds none of its ended tasks: it is said
   *  without its cause. */
  causeOverdue: boolean;
}

/**
 * The status of the question sent from here, null before Enter. A refusal is said by its code (the quota's own words,
 * a visit that has ended, or a question that never reached the server); a failure by the failure code of the
 * question's task that failed first by itself, read from the case record as the work card reads it (lib/card/work.ts).
 * A failed question whose ended task the record does not hold yet stays at work until it does, or until the wait is
 * over, so its sentence does not change under the visitor's eyes.
 */
export function askStatus({
  snapshot,
  log,
  commandId,
  sent,
  refusal,
  pacing,
  causeOverdue,
}: AskStatusInput): AskStatus | null {
  if (!sent) return null;
  if (refusal) return { state: "stopped", commandId: null, text: refusedLine(refusal) };
  if (commandId === null) return { state: "working", commandId: null };
  const outcome = pacing ? "running" : requestOutcome(snapshot, log, commandId);
  if (outcome === "running") return { state: "working", commandId };
  if (outcome === "succeeded" || outcome === "partial") return { state: "answered", commandId };
  if (outcome === "cancelled")
    return { state: "stopped", commandId, text: ak["ask.stopped.stopped"].text };
  const code = failureOf(snapshot, commandId);
  if (code === undefined && !causeOverdue) return { state: "working", commandId };
  return { state: "stopped", commandId, text: ak[failedLine(code ?? null)].text };
}

/** Codes that only say an earlier task failed (lib/card/work.ts): the cause is that task's. */
const DOWNSTREAM = new Set(["dependency_failed", "dependency_unresolved"]);

/**
 * The failure code that says why the question ended: its first failed task's own (a task that failed only because an
 * earlier one did has none of its own), else a stopped task's; null when they name none; undefined while the case
 * record holds no failed or stopped task of the question.
 */
function failureOf(s: CaseSnapshot, commandId: string): string | null | undefined {
  const ended = s.records.taskRecords
    .filter((t) => t.commandId === commandId && (t.status === "failed" || t.status === "cancelled"))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (ended.length === 0) return undefined;
  const own = (status: string) =>
    ended.find((t) => t.status === status && t.failureCode && !DOWNSTREAM.has(t.failureCode))
      ?.failureCode;
  return own("failed") ?? own("cancelled") ?? null;
}

/** Failure codes the follow-up route (lib/live-place/follow-up.ts) and the worker's tasks end with, by their words. */
const FAILED: Record<string, AskMessageId> = {
  model_not_configured: "ask.stopped.notAvailable",
  model_unreachable: "ask.stopped.unreachable",
  model_timeout: "ask.stopped.slow",
  command_deadline: "ask.stopped.slow",
  model_refused: "ask.stopped.declined",
  validation_rejected: "ask.stopped.unmatched",
  stale_inputs: "ask.stopped.changed",
  round_limit: "ask.stopped.steps",
  out_of_scope: "ask.stopped.scope",
};

/** The sentence for a failure code: its own words, an HTTP status the model service answered with (http_503), or
 *  the plain fact that no step finished. */
export function failedLine(code: string | null): AskMessageId {
  if (code === null) return "ask.stopped.other";
  const known = FAILED[code];
  if (known) return known;
  const http = /^http_(\d{3})$/.exec(code);
  if (!http) return "ask.stopped.other";
  const status = Number(http[1]);
  if (status === 401 || status === 403) return "ask.stopped.notAvailable";
  if (status === 408 || status === 504) return "ask.stopped.slow";
  if (status === 429) return "ask.stopped.busy";
  if (status >= 500) return "ask.stopped.down";
  return "ask.stopped.declined";
}

/** The sentence for a refusal: the quota's own words, a visit that has ended, or a question that never arrived. */
export function refusedLine(r: Refusal): string {
  if (r.code === "quota_exhausted")
    return en[r.limit === "instance" ? "work.instanceLimit" : "work.quotaUsed"].text;
  if (r.httpStatus === 401 || r.httpStatus === 404) return ak["ask.stopped.visitEnded"].text;
  return ak["ask.stopped.notSent"].text;
}

/** The line, and the findings count a completed request offers as a button (the results view). */
export interface AskLine {
  text: string;
  findings: number | null;
}

export interface AskLineInput {
  snapshot: CaseSnapshot;
  /** The log as shown: a replay started here plays at reading pace (usePacedLog). */
  log: EventLog;
  /** The accepted request, once the server answers. */
  commandId: string | null;
  /** Enter was pressed. */
  sent: boolean;
  /** The server refused the request. */
  notice: MessageId | null;
  /** Events of the request are still waiting to be shown. */
  pacing: boolean;
}

export function askLine({
  snapshot,
  log,
  commandId,
  sent,
  notice,
  pacing,
}: AskLineInput): AskLine | null {
  if (!sent) return null;
  const line = (text: string): AskLine => ({ text, findings: null });
  if (notice) return line(en[notice].text);
  if (!commandId) return line(en["work.received"].text);
  const outcome = pacing ? "running" : requestOutcome(snapshot, log, commandId);
  // a completed request: the work card's "Complete." with its findings count as the way to the results
  if (outcome === "succeeded")
    return { text: en["ask.complete"].text, findings: commandFindings(snapshot, commandId).length };
  if (outcome !== "running") {
    const working = workCard(snapshot, log, commandId, [], { pacing }).working;
    return working ? line(working) : null;
  }
  const rows = projectActivity(snapshot.records.taskRecords, log.events, commandId, {
    playedOnly: pacing,
  });
  const row = rows.findLast((r) => r.state === "running") ?? rows.at(-1);
  if (!row) {
    const latest = log.events.findLast((e) => e.commandId === commandId);
    return line(latest?.message ?? en["work.received"].text);
  }
  // the model and its route, from the latest model call of that step
  const model = log.events
    .filter((e) => e.taskId === row.taskId && e.kind === "model.completed")
    .map(badgeOf)
    .findLast((b) => b !== undefined);
  return line(
    model
      ? format("ask.taskModel", { model, task: row.label, status: row.status })
      : format("ask.task", { task: row.label, status: row.status }),
  );
}

/**
 * Whether to reopen the instrument listing: the session holds a newer case revision than the records, and that
 * revision is not already being reopened.
 */
export function shouldReopen(held: number, session: number, reopening: number | null): boolean {
  return session > held && session !== reopening;
}
