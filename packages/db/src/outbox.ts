import { type Pool, inTransaction } from "./client.ts";

export type OutboxRow = {
  id: number;
  caseId: string;
  commandId: string | null;
  queue: string;
  jobKey: string;
  payload: unknown;
};

/**
 * Hands undispatched outbox rows to send() in id order and marks the ones it accepted. send() must
 * enqueue with jobKey as the stable job key, so a repeated dispatch is harmless (runtime view).
 * Rows locked by another dispatcher are skipped.
 */
export async function dispatchOutbox(
  pool: Pool,
  send: (row: OutboxRow) => Promise<void>,
  limit = 50,
): Promise<number> {
  return inTransaction(pool, async (tx) => {
    const result = await tx.query<{
      id: string;
      case_id: string;
      command_id: string | null;
      queue: string;
      job_key: string;
      payload: unknown;
    }>(
      `select id, case_id, command_id, queue, job_key, payload from outbox
       where dispatched_at is null order by id limit $1 for update skip locked`,
      [limit],
    );
    for (const row of result.rows) {
      await send({
        id: Number(row.id),
        caseId: row.case_id,
        commandId: row.command_id,
        queue: row.queue,
        jobKey: row.job_key,
        payload: row.payload,
      });
      await tx.query("update outbox set dispatched_at = now() where id = $1", [row.id]);
    }
    return result.rows.length;
  });
}
