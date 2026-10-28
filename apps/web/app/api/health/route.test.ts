import type { Pool } from "@siterra/db";
import { startWorkerHeartbeat } from "@siterra/db/health";
import { type TestDatabase, freshDatabase } from "@siterra/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as HealthRoute from "./route.ts";

let db: TestDatabase;
let route: typeof HealthRoute;
const shared = globalThis as typeof globalThis & { siterraPool?: Pool };

beforeAll(async () => {
  db = await freshDatabase();
  process.env["DATABASE_URL"] = db.url;
  shared.siterraPool = undefined;
  route = await import("./route.ts");
});

afterAll(async () => {
  await shared.siterraPool?.end();
  await db.drop();
});

describe("GET /api/health", () => {
  it("answers 200 degraded without a worker, 200 ok with one, never cached, with no connection string", async () => {
    const before = await route.GET();
    expect(before.status).toBe(200);
    expect(before.headers.get("cache-control")).toBe("no-store");
    const text = await before.text();
    expect(text).not.toContain(db.url);
    expect(text).not.toContain("postgres");
    expect(JSON.parse(text)).toMatchObject({
      status: "degraded",
      database: "ok",
      worker: { status: "none" },
    });
    const stop = await startWorkerHeartbeat(db.pool);
    const after = await route.GET();
    stop();
    expect([after.status, ((await after.json()) as { status: string }).status]).toEqual([
      200,
      "ok",
    ]);
  });

  it("answers 503 while a migration is pending", async () => {
    await db.pool.query("delete from schema_migrations where name = 'worker-heartbeat'");
    const response = await route.GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "unavailable",
      migrations: { pending: ["worker-heartbeat"] },
    });
  });
});
