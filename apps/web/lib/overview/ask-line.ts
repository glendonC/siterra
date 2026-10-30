// The ask's activity line after Enter, from the case session as the valley's work card and activity panel read it
// (lib/card/work.ts, lib/activity/activity.ts): while the request runs, the step now running (or the latest) with the
// model and route that served it, in the catalog's words; once it ends, the card's outcome line (complete, partial,
// failed with its cause, canceled, or the scope refusal); a request the server refused, in the catalog's words.
// And when the overview reopens its records: only for a case revision newer than the one it holds.

import type { CaseSnapshot } from "@siterra/contracts";
import { badgeOf, projectActivity } from "../activity/activity";
import { requestOutcome, workCard } from "../card/work";
import type { EventLog } from "../case/events";
import { en, format, type MessageId } from "../copy/en";

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
}: AskLineInput): string | null {
  if (!sent) return null;
  if (notice) return en[notice].text;
  if (!commandId) return en["work.received"].text;
  const ended = !pacing && requestOutcome(snapshot, log, commandId) !== "running";
  if (ended) return workCard(snapshot, log, commandId, [], { pacing }).working ?? null;
  const rows = projectActivity(snapshot.records.taskRecords, log.events, commandId, {
    playedOnly: pacing,
  });
  const row = rows.findLast((r) => r.state === "running") ?? rows.at(-1);
  if (!row) {
    const latest = log.events.findLast((e) => e.commandId === commandId);
    return latest?.message ?? en["work.received"].text;
  }
  // the model and its route, from the latest model call of that step
  const model = log.events
    .filter((e) => e.taskId === row.taskId && e.kind === "model.completed")
    .map(badgeOf)
    .findLast((b) => b !== undefined);
  return model
    ? format("ask.taskModel", { model, task: row.label, status: row.status })
    : format("ask.task", { task: row.label, status: row.status });
}

/**
 * Whether to reopen the instrument listing: the session holds a newer case revision than the records, and that
 * revision is not already being reopened.
 */
export function shouldReopen(held: number, session: number, reopening: number | null): boolean {
  return session > held && session !== reopening;
}
