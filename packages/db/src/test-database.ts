// Test support: a fresh, migrated database per test file on the cluster DATABASE_URL names.
import { randomBytes } from "node:crypto";
import pg from "pg";
import { type Pool, createPool, endPools } from "./client.ts";
import { migrate } from "./migrate.ts";

export type TestDatabase = { pool: Pool; url: string; drop: () => Promise<void> };

export async function freshDatabase(): Promise<TestDatabase> {
  const base = process.env["DATABASE_URL"];
  if (base === undefined || base === "") {
    throw new Error(
      "Database tests need DATABASE_URL (start the cluster: zsh .local/pg.zsh start)",
    );
  }
  const name = `siterra_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = new URL(base);
  url.pathname = `/${name}`;
  const pool = createPool(url.toString());
  await migrate(pool);
  return {
    pool,
    url: url.toString(),
    // Every pool on this database ends before the forced drop, so the drop terminates no client a
    // pool still holds (a terminated idle client surfaced as PostgreSQL 57P01 in some runs).
    drop: async () => {
      await endPools(url.toString());
      const cleanup = new pg.Client({ connectionString: base });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
}
