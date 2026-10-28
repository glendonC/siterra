// The pg-boss job queue on the case database (runtime view: the outbox dispatcher enqueues with a
// stable job key, so repeated dispatch is harmless). pg-boss lives in its own schema; its tables
// are installed by migrate.ts from pg-boss's construction plan, never by pg-boss at start.
import { createHash } from "node:crypto";
import { PgBoss, getConstructionPlans } from "pg-boss";
import type { Pool } from "./client.ts";
import { type OutboxRow, dispatchOutbox } from "./outbox.ts";

export const jobSchema = "pgboss";

/** The SQL that installs pg-boss 12.37.1's tables in the job schema (applied once by migrate.ts). */
export function jobQueueSql(): string {
  return getConstructionPlans(jobSchema);
}

/**
 * A UUID derived from the outbox job key (SHA-256, version and variant bits set as for a name-based
 * UUID), so the same key always names the same job and a second send of it inserts nothing.
 */
export function jobIdOf(jobKey: string): string {
  const hex = createHash("sha256")
    .update(`siterra-job:${jobKey}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Opens pg-boss on the migrated schema without letting it migrate, supervise or schedule; the
 * worker that consumes jobs starts its own instance with the options it needs.
 */
export async function openJobQueue(connectionString: string): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString,
    schema: jobSchema,
    migrate: false,
    supervise: false,
    schedule: false,
  });
  boss.on("error", () => undefined);
  await boss.start();
  return boss;
}

/**
 * Moves undispatched outbox rows into pg-boss. Each job's id comes from its outbox job key, so a
 * crash between enqueue and marking the row only repeats an insert pg-boss ignores. Queues are
 * created on first use.
 */
export async function dispatchOutboxToJobs(pool: Pool, boss: PgBoss, limit = 50): Promise<number> {
  const known = new Set((await boss.getQueues()).map((queue) => queue.name));
  return dispatchOutbox(
    pool,
    async (row: OutboxRow) => {
      if (!known.has(row.queue)) {
        await boss.createQueue(row.queue);
        known.add(row.queue);
      }
      await boss.send(row.queue, row.payload as object, { id: jobIdOf(row.jobKey) });
    },
    limit,
  );
}
