import { Event, caseSchemaVersion, entityId } from "@siterra/contracts";
import { newId } from "@siterra/domain";
import type { z } from "zod";
import {
  type LockedCase,
  type Pool,
  type Tx,
  inTransaction,
  lockCase,
  notifyEvents,
} from "./client.ts";

/**
 * An event as a writer proposes it. The database assigns the per-case sequence and the case
 * revision, so sequences stay gapless and monotonic whoever writes (data-contracts.md, events).
 */
export const EventDraft = Event.omit({
  recordType: true,
  schemaVersion: true,
  id: true,
  caseId: true,
  sequence: true,
  caseRevision: true,
}).extend({ id: entityId.optional() });
export type EventDraft = z.infer<typeof EventDraft>;

/**
 * Inserts drafts after the case's last sequence, skipping any whose dedupeKey is already stored, and
 * returns the stored events. The caller holds the case lock and updates last_sequence.
 */
export async function insertEvents(
  tx: Tx,
  locked: LockedCase,
  drafts: readonly EventDraft[],
  caseRevision: number,
): Promise<{ events: Event[]; lastSequence: number }> {
  const parsed = drafts.map((draft) => EventDraft.parse(draft));
  const keys = parsed.map((draft) => draft.dedupeKey);
  const stored = await tx.query<{ dedupe_key: string }>(
    "select dedupe_key from events where case_id = $1 and dedupe_key = any($2::text[])",
    [locked.id, keys],
  );
  const seen = new Set(stored.rows.map((row) => row.dedupe_key));
  const events: Event[] = [];
  let sequence = locked.lastSequence;
  for (const draft of parsed) {
    if (seen.has(draft.dedupeKey)) {
      continue;
    }
    seen.add(draft.dedupeKey);
    sequence += 1;
    const event = Event.parse({
      ...draft,
      recordType: "Event",
      schemaVersion: caseSchemaVersion,
      id: draft.id ?? newId("evt"),
      caseId: locked.id,
      sequence,
      caseRevision,
    });
    await tx.query(
      `insert into events (case_id, sequence, id, kind, command_id, task_id, dedupe_key, record, occurred_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        locked.id,
        sequence,
        event.id,
        event.kind,
        event.commandId,
        event.taskId,
        event.dedupeKey,
        JSON.stringify(event),
        event.occurredAt,
      ],
    );
    events.push(event);
  }
  return { events, lastSequence: sequence };
}

export async function setLastSequence(tx: Tx, caseId: string, lastSequence: number): Promise<void> {
  await tx.query("update cases set last_sequence = $2 where id = $1", [caseId, lastSequence]);
}

/**
 * Appends events outside a commit (task, model and tool progress): they carry the current case
 * revision and do not change it. Returns the stored events; null when the case does not exist.
 */
export async function appendEvents(
  pool: Pool,
  caseId: string,
  drafts: readonly EventDraft[],
): Promise<Event[] | null> {
  return inTransaction(pool, async (tx) => {
    const locked = await lockCase(tx, caseId);
    if (locked === null) {
      return null;
    }
    const { events, lastSequence } = await insertEvents(tx, locked, drafts, locked.revision);
    if (events.length > 0) {
      await setLastSequence(tx, caseId, lastSequence);
      await notifyEvents(tx, caseId);
    }
    return events;
  });
}

/** Persisted events with a sequence above the cursor, in sequence order. */
export async function eventsAfter(
  pool: Pool,
  caseId: string,
  after: number,
  limit = 500,
): Promise<Event[]> {
  const result = await pool.query<{ record: Event }>(
    "select record from events where case_id = $1 and sequence > $2 order by sequence limit $3",
    [caseId, after, limit],
  );
  return result.rows.map((row) => row.record);
}

/** The command's events in sequence order (trace inspector). */
export async function eventsOfCommand(
  pool: Pool,
  caseId: string,
  commandId: string,
): Promise<Event[]> {
  const result = await pool.query<{ record: Event }>(
    "select record from events where case_id = $1 and command_id = $2 order by sequence",
    [caseId, commandId],
  );
  return result.rows.map((row) => row.record);
}
