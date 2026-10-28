import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import { createPool, type Pool } from "./client.ts";
import { submitCommand } from "./commands.ts";
import { outboxBehindAfterSeconds, readHealth, startWorkerHeartbeat } from "./health.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { exampleCase, exampleCommandRequest } from "./test-records.ts";

let db: TestDatabase;
let pool: Pool;

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
});

afterAll(async () => {
  await db.drop();
});

describe("deployment health: database, migrations, worker heartbeat and outbox backlog", () => {
  it("is degraded with no worker, then ok once a worker heartbeat is written", async () => {
    expect(await readHealth(pool)).toEqual({
      status: "degraded",
      database: "ok",
      migrations: { expected: 4, pending: [] },
      worker: { status: "none", lastSeenAt: null },
      outbox: { pending: 0, oldestPendingSeconds: null },
    });
    const stop = await startWorkerHeartbeat(pool);
    const health = await readHealth(pool);
    stop();
    expect([health.status, health.worker?.status]).toEqual(["ok", "ok"]);
    expect(health.worker?.lastSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("is degraded when the worker is stale or the outbox is behind", async () => {
    await pool.query("update worker_heartbeats set last_seen_at = now() - interval '120 seconds'");
    expect((await readHealth(pool)).worker?.status).toBe("stale");
    await startWorkerHeartbeat(pool).then((stop) => {
      stop();
    });
    await createCase(pool, exampleCase("case_example_health"), "owner_example");
    await submitCommand(pool, {
      caseId: "case_example_health",
      ownerScopeId: "owner_example",
      request: exampleCommandRequest("health-key-0001"),
    });
    const fresh = await readHealth(pool);
    expect([fresh.status, fresh.outbox?.pending]).toEqual(["ok", 1]);
    await pool.query(`update outbox set created_at = now() - make_interval(secs => $1::integer)`, [
      outboxBehindAfterSeconds + 30,
    ]);
    const behind = await readHealth(pool);
    expect(behind.status).toBe("degraded");
    expect(behind.outbox?.oldestPendingSeconds).toBeGreaterThanOrEqual(
      outboxBehindAfterSeconds + 30,
    );
  });

  it("is unavailable while a migration is pending, and when the database cannot be reached", async () => {
    await pool.query("delete from schema_migrations where name = 'worker-heartbeat'");
    expect(await readHealth(pool)).toEqual({
      status: "unavailable",
      database: "ok",
      migrations: { expected: 4, pending: ["worker-heartbeat"] },
      worker: null,
      outbox: null,
    });
    const nowhere = createPool("postgres://siterra@127.0.0.1:4359/siterra_none", {
      onIdleError: () => undefined,
    });
    expect(await readHealth(nowhere)).toEqual({
      status: "unavailable",
      database: "unreachable",
      migrations: null,
      worker: null,
      outbox: null,
    });
    await nowhere.end();
  });
});
