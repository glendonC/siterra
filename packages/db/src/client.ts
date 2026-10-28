import pg from "pg";

export type Pool = pg.Pool;
export type Tx = pg.PoolClient;

/** Every pool createPool opened, until it has ended; endPools closes those on one database. */
const openPools = new Set<Pool>();

/**
 * A pool on DATABASE_URL. An idle client the server ends (a restart, pg_terminate_backend, a dropped
 * test database) is emitted as an error on the pool, which Node treats as unhandled without a
 * listener; pg has already removed that client, and the next query opens a new one. The default
 * listener logs the PostgreSQL code only, never the connection string.
 */
export function createPool(
  connectionString: string | undefined = process.env["DATABASE_URL"],
  options: { onIdleError?: (error: Error) => void } = {},
): Pool {
  if (connectionString === undefined || connectionString === "") {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new pg.Pool({ connectionString, max: 10 });
  pool.on(
    "error",
    options.onIdleError ??
      ((error: Error & { code?: string }) => {
        console.error(`PostgreSQL idle client ended (${error.code ?? "no code"})`);
      }),
  );
  openPools.add(pool);
  return pool;
}

/**
 * Ends every pool createPool opened on connectionString that has not ended, so a database can be
 * dropped without terminating a client a pool still holds. Used by the test database helper.
 */
export async function endPools(connectionString: string): Promise<void> {
  const ending: Promise<void>[] = [];
  for (const pool of openPools) {
    if (pool.ended) {
      openPools.delete(pool);
    } else if (pool.options.connectionString === connectionString) {
      openPools.delete(pool);
      if (!pool.ending) ending.push(pool.end());
    }
  }
  await Promise.all(ending);
}

export type Isolation = "read committed" | "repeatable read" | "serializable";

/** Runs fn in one transaction; rolls back on any error and rethrows it. */
export async function inTransaction<T>(
  pool: Pool,
  fn: (tx: Tx) => Promise<T>,
  isolation: Isolation = "read committed",
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`begin isolation level ${isolation}`);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** The case row locked for this transaction, or null when the case does not exist. */
export type LockedCase = {
  id: string;
  ownerScopeId: string;
  revision: number;
  lastSequence: number;
  record: unknown;
};

export async function lockCase(tx: Tx, caseId: string): Promise<LockedCase | null> {
  const result = await tx.query<{
    id: string;
    owner_scope_id: string;
    revision: number;
    last_sequence: string;
    record: unknown;
  }>(
    "select id, owner_scope_id, revision, last_sequence, record from cases where id = $1 for update",
    [caseId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    ownerScopeId: row.owner_scope_id,
    revision: row.revision,
    lastSequence: Number(row.last_sequence),
    record: row.record,
  };
}

/** Wakes event streams of this case after the transaction commits (NOTIFY is transactional). */
export const eventChannel = "siterra_events";

export async function notifyEvents(tx: Tx, caseId: string): Promise<void> {
  await tx.query("select pg_notify($1, $2)", [eventChannel, caseId]);
}
