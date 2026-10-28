import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PgBoss } from "pg-boss";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { planJobKey, planQueue, submitCommand } from "./commands.ts";
import { dispatchOutboxToJobs, jobIdOf, openJobQueue } from "./job-queue.ts";
import { migrate } from "./migrate.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { exampleCase, exampleCommandRequest } from "./test-records.ts";

let db: TestDatabase;
let pool: Pool;
let boss: PgBoss;
const owner = "owner_example";

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  boss = await openJobQueue(db.url);
});

afterAll(async () => {
  await boss.stop({ graceful: false });
  await db.drop();
});

describe("the pg-boss schema and the outbox dispatcher", () => {
  it("installs the pg-boss schema as a recorded migration", async () => {
    const applied = await pool.query<{ name: string }>(
      "select name from schema_migrations order by applied_at, name",
    );
    expect(applied.rows.map((r) => r.name)).toContain("pg-boss-schema");
    expect(await boss.schemaVersion()).toBeGreaterThan(0);
    expect(await migrate(pool)).toEqual([]);
  });

  it("derives one stable UUID per job key", () => {
    expect(jobIdOf("plan:cmd_example")).toBe(jobIdOf("plan:cmd_example"));
    expect(jobIdOf("plan:cmd_example")).not.toBe(jobIdOf("plan:cmd_other"));
    expect(jobIdOf("plan:cmd_example")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("enqueues the plan job of a command once, even when dispatched again", async () => {
    const record = exampleCase("case_example_jobs");
    await createCase(pool, record, owner);
    const created = await submitCommand(pool, {
      caseId: record.id,
      ownerScopeId: owner,
      request: exampleCommandRequest("jobs-key-0001"),
    });
    if (created.status !== "created") throw new Error(created.status);
    expect(await dispatchOutboxToJobs(pool, boss)).toBe(1);
    await pool.query("update outbox set dispatched_at = null");
    expect(await dispatchOutboxToJobs(pool, boss)).toBe(1);
    const jobs = await boss.fetch(planQueue, { batchSize: 10 });
    expect(jobs.map((job) => job.id)).toEqual([jobIdOf(planJobKey(created.command.id))]);
    expect(jobs[0]?.data).toEqual({
      caseId: record.id,
      commandId: created.command.id,
      planTaskId: created.command.taskIds[0],
    });
  });
});
