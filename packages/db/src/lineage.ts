// How a record was produced, for any reader of the record (TR-01, TR-05): the task its provenance
// names and the route of every model call that task made, read from the stored model events. A record
// written on the replay route reads as replayed, with its origin, wherever it is read, not only in
// the interface.
import type { ModelUsage } from "@siterra/contracts";
import type { Pool } from "./client.ts";

export type ModelCallRoute = {
  provider: string;
  model: string;
  /** synthetic or recorded on the replay route; null on the live route or before contracts 1.7. */
  replayOrigin: "synthetic" | "recorded" | null;
};

export type RecordLineage = {
  entityId: string;
  revision: number;
  generatedByTaskId: string | null;
  /** Distinct routes of the producing task's model calls, in the order first seen. */
  modelCalls: ModelCallRoute[];
  /** True when any model call of the producing task ran on the replay route. */
  replayed: boolean;
};

/** The lineage of the latest revision of a record of this owner's case, or null when there is none. */
export async function readLineage(
  pool: Pool,
  args: { caseId: string; ownerScopeId: string; entityId: string },
): Promise<RecordLineage | null> {
  const record = await pool.query<{ revision: number; task_id: string | null }>(
    `select r.revision, r.record->'provenance'->>'generatedByTaskId' as task_id
     from records r join cases k on k.id = r.case_id
     where r.case_id = $1 and k.owner_scope_id = $2 and r.entity_id = $3
     order by r.revision desc limit 1`,
    [args.caseId, args.ownerScopeId, args.entityId],
  );
  const row = record.rows[0];
  if (row === undefined) return null;
  const modelCalls: ModelCallRoute[] = [];
  if (row.task_id !== null) {
    const events = await pool.query<{ usage: ModelUsage | null }>(
      `select record->'usage' as usage from events
       where case_id = $1 and task_id = $2 and kind in ('model.started', 'model.completed')
       order by sequence`,
      [args.caseId, row.task_id],
    );
    for (const { usage } of events.rows) {
      if (usage === null) continue;
      const route: ModelCallRoute = {
        provider: usage.provider,
        model: usage.model,
        replayOrigin: usage.replayOrigin ?? null,
      };
      if (
        !modelCalls.some(
          (c) =>
            c.provider === route.provider &&
            c.model === route.model &&
            c.replayOrigin === route.replayOrigin,
        )
      ) {
        modelCalls.push(route);
      }
    }
  }
  return {
    entityId: args.entityId,
    revision: row.revision,
    generatedByTaskId: row.task_id,
    modelCalls,
    replayed: modelCalls.some((c) => c.provider === "replay"),
  };
}
