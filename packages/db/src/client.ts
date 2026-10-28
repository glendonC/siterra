import pg from "pg";

export type Pool = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(
  connectionString: string | undefined = process.env["DATABASE_URL"],
): Pool {
  if (connectionString === undefined || connectionString === "") {
    throw new Error("DATABASE_URL is not set");
  }
  return new pg.Pool({ connectionString, max: 10 });
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
