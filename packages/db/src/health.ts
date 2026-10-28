// Health of a deployment, shared by the web service and the worker: the worker writes a heartbeat
// while it runs; GET /api/health reads the database, the migrations, the worker heartbeat and the
// outbox backlog. The answer names states only, never a connection string, an error text or a
// worker ID.
import { randomBytes } from "node:crypto";
import type { Pool } from "./client.ts";
import { migrations } from "./migrate.ts";

/** How often a running worker refreshes its heartbeat. */
export const workerHeartbeatMs = 15_000;
/** A worker not seen for this long is stale (four missed heartbeats). */
export const workerStaleAfterSeconds = 60;
/** An outbox row older than this, not yet handed to the job queue, means the worker is behind. */
export const outboxBehindAfterSeconds = 30;
/** The longest the health check waits for the database. */
export const healthTimeoutMs = 3_000;

export type Health = {
  /** ok: all good; degraded: the web works but commands may not run; unavailable: the web cannot serve. */
  status: "ok" | "degraded" | "unavailable";
  database: "ok" | "unreachable";
  migrations: { expected: number; pending: string[] } | null;
  worker: { status: "ok" | "stale" | "none"; lastSeenAt: string | null } | null;
  outbox: { pending: number; oldestPendingSeconds: number | null } | null;
};

/** Writes this worker's heartbeat now; the worker ID is random per process. */
export async function recordWorkerHeartbeat(
  pool: Pool,
  worker: { id: string; startedAt: Date },
): Promise<void> {
  await pool.query(
    `insert into worker_heartbeats (worker_id, started_at, last_seen_at) values ($1, $2, now())
     on conflict (worker_id) do update set last_seen_at = now()`,
    [worker.id, worker.startedAt],
  );
}

/**
 * Removes the heartbeat rows of workers not seen within workerStaleAfterSeconds (stopped or crashed
 * processes); returns how many. A live worker that was only slow writes its row again on its next
 * beat.
 */
export async function trimStaleHeartbeats(pool: Pool): Promise<number> {
  const removed = await pool.query(
    "delete from worker_heartbeats where last_seen_at < now() - make_interval(secs => $1::integer)",
    [workerStaleAfterSeconds],
  );
  return removed.rowCount ?? 0;
}

/**
 * Starts the heartbeat of a worker process: trims the rows of stopped workers, writes one beat now,
 * then one every workerHeartbeatMs. A failed
 * write is reported to onError and retried on the next tick. Returns a function that stops it.
 */
export async function startWorkerHeartbeat(
  pool: Pool,
  onError: (error: unknown) => void = () => undefined,
): Promise<() => void> {
  const worker = { id: `worker_${randomBytes(8).toString("hex")}`, startedAt: new Date() };
  await trimStaleHeartbeats(pool);
  await recordWorkerHeartbeat(pool, worker);
  const timer = setInterval(() => {
    recordWorkerHeartbeat(pool, worker).catch(onError);
  }, workerHeartbeatMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("timeout"));
      }, ms).unref();
    }),
  ]);
}

/** The deployment's health, read in one round of queries. */
export async function readHealth(pool: Pool): Promise<Health> {
  try {
    return await withTimeout(readHealthOnce(pool), healthTimeoutMs);
  } catch {
    return {
      status: "unavailable",
      database: "unreachable",
      migrations: null,
      worker: null,
      outbox: null,
    };
  }
}

async function readHealthOnce(pool: Pool): Promise<Health> {
  const applied = await pool.query<{ name: string }>(
    "select name from schema_migrations where name = any($1::text[])",
    [migrations],
  );
  const appliedNames = new Set(applied.rows.map((r) => r.name));
  const pending = migrations.filter((name) => !appliedNames.has(name));
  const migrationState = { expected: migrations.length, pending };
  if (pending.length > 0) {
    return {
      status: "unavailable",
      database: "ok",
      migrations: migrationState,
      worker: null,
      outbox: null,
    };
  }
  const state = await pool.query<{
    last_seen_at: Date | null;
    seen_seconds_ago: number | null;
    pending: string;
    oldest_seconds: number | null;
  }>(
    `select
       (select max(last_seen_at) from worker_heartbeats) as last_seen_at,
       (select extract(epoch from now() - max(last_seen_at))::float8 from worker_heartbeats) as seen_seconds_ago,
       (select count(*) from outbox where dispatched_at is null) as pending,
       (select extract(epoch from now() - min(created_at))::float8 from outbox where dispatched_at is null) as oldest_seconds`,
  );
  const row = state.rows[0];
  const seenAgo = row?.seen_seconds_ago ?? null;
  const worker: NonNullable<Health["worker"]> = {
    status: seenAgo === null ? "none" : seenAgo <= workerStaleAfterSeconds ? "ok" : "stale",
    lastSeenAt: row?.last_seen_at?.toISOString() ?? null,
  };
  const oldest = row?.oldest_seconds ?? null;
  const outbox = {
    pending: Number(row?.pending ?? 0),
    oldestPendingSeconds: oldest === null ? null : Math.floor(oldest),
  };
  const behind = oldest !== null && oldest > outboxBehindAfterSeconds;
  return {
    status: worker.status === "ok" && !behind ? "ok" : "degraded",
    database: "ok",
    migrations: migrationState,
    worker,
    outbox,
  };
}
