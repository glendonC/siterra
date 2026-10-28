import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, endPools } from "./client.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";

let db: TestDatabase;

beforeAll(async () => {
  db = await freshDatabase();
});

afterAll(async () => {
  await db.drop();
});

describe("pools: a terminated idle client is handled, and a database drops only after its pools end", () => {
  it("passes a server-terminated idle client (57P01) to the pool's listener, and the next query works", async () => {
    const seen: string[] = [];
    const pool = createPool(db.url, {
      onIdleError: (error: Error & { code?: string }) => seen.push(error.code ?? "none"),
    });
    const pid = (await pool.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid;
    const admin = new pg.Client({ connectionString: db.url });
    await admin.connect();
    await admin.query("select pg_terminate_backend($1)", [pid]);
    await admin.end();
    for (let i = 0; i < 50 && seen.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(seen).toEqual(["57P01"]);
    expect((await pool.query<{ one: number }>("select 1 as one")).rows[0]?.one).toBe(1);
    await pool.end();
  });

  it("ends every open pool on one database and leaves pools on another", async () => {
    const other = await freshDatabase();
    const a = createPool(db.url);
    const b = createPool(db.url);
    const c = createPool(other.url);
    await Promise.all([a.query("select 1"), b.query("select 1"), c.query("select 1")]);
    await endPools(db.url);
    expect([a.ended, b.ended, c.ended]).toEqual([true, true, false]);
    await other.drop();
    expect(c.ended).toBe(true);
  });
});
