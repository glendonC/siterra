// The case's event log as the interface holds it: events in sequence order, each once, however often a
// reconnect replays them (RL-03), and the cursor to resume from.

import type { Event } from "@siterra/contracts";

export interface EventLog {
  events: Event[];
  lastSequence: number;
}

export const EMPTY_LOG: EventLog = { events: [], lastSequence: 0 };

/** Adds events, ignoring any already held, keeping sequence order. */
export function appendEvents(log: EventLog, incoming: Event[]): EventLog {
  const fresh = incoming.filter((e) => e.sequence > log.lastSequence);
  if (fresh.length === 0) return log;
  const seen = new Set(log.events.map((e) => e.sequence));
  const events = [...log.events, ...fresh.filter((e) => !seen.has(e.sequence))].sort(
    (a, b) => a.sequence - b.sequence,
  );
  return { events, lastSequence: events.at(-1)?.sequence ?? log.lastSequence };
}

/** The latest commission's command ID, from its command.accepted event. */
export function latestCommandId(log: EventLog): string | undefined {
  for (let i = log.events.length - 1; i >= 0; i--) {
    const e = log.events[i];
    if (e?.kind === "command.accepted" && e.commandId) return e.commandId;
  }
  return undefined;
}

/** True when an event changes records the snapshot holds, so the snapshot should be read again. */
export function changesRecords(e: Event): boolean {
  return e.kind === "case.committed" || e.kind.startsWith("task.") || e.kind === "entity.stale";
}
