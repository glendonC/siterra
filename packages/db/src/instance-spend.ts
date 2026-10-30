import type { Pool, Tx } from "./client.ts";

// One instance's cap on live model spend (P6b): what the instance has spent, counted from the usage
// stored on model.completed events at list price, and the rule that refuses a new command whose
// worst case would pass the cap.

export interface InstanceSpendPolicy {
  /** The cap on live model spend in micro-USD; null decides nothing. */
  capMicroUsd: number | null;
  /** What one command may spend at most (its own cap): the reserve of every unfinished command. */
  perCommandMicroUsd: number;
}

/**
 * A live call that was billed but carries no price (usage missing from the stream) counts as this
 * much, so an unknown never reads as free. About twice the dearest call of the recorded runs.
 * A call that failed before any usage was reported (an HTTP error, a refusal by a spend guard) is
 * taken as unbilled, as the adapter takes it, and counts for nothing.
 */
export const UNPRICED_LIVE_CALL_MICRO_USD = 25_000;

const liveCallCostSql = `case
       when e.record->'usage'->>'estimatedCostMicroUsd' is not null
         then (e.record->'usage'->>'estimatedCostMicroUsd')::bigint
       when e.record->'usage'->>'status' = 'failed' and e.record->'usage'->>'inputTokens' is null
         then 0
       else ${String(UNPRICED_LIVE_CALL_MICRO_USD)} end`;

/**
 * Estimated live model spend of every case in the database, in micro-USD: stored usage at list
 * price, replay calls left out. Demo copies that expire are deleted with their events, so their
 * spend leaves this count.
 */
export async function liveSpendMicroUsd(db: Pool | Tx): Promise<number> {
  const result = await db.query<{ stored: string }>(
    `select coalesce(sum(${liveCallCostSql}), 0) as stored from events e
     where e.kind = 'model.completed' and e.record->'usage'->>'provider' is distinct from 'replay'`,
  );
  return Number(result.rows[0]?.stored ?? 0);
}

/**
 * Whether a new command may be accepted, decided under one advisory lock so two requests never
 * both take the last room: the stored spend, one command's reserve for every unfinished command
 * and this command's own must fit under the cap.
 */
export async function spendAllows(tx: Tx, policy: InstanceSpendPolicy): Promise<boolean> {
  if (policy.capMicroUsd === null) return true;
  await tx.query("select pg_advisory_xact_lock(hashtext('siterra_instance_spend'))");
  const open = await tx.query<{ unfinished: string }>(
    "select count(*) as unfinished from commands where status in ('accepted', 'running')",
  );
  const unfinished = Number(open.rows[0]?.unfinished ?? 0);
  const spent = await liveSpendMicroUsd(tx);
  return spent + (unfinished + 1) * policy.perCommandMicroUsd <= policy.capMicroUsd;
}
