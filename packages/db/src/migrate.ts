import { readFileSync } from "node:fs";
import { sha256Hex } from "@siterra/domain";
import { inTransaction, type Pool } from "./client.ts";

/** Applied in this order; a file never changes once applied (its SHA-256 is recorded). */
export const migrations = ["case-record", "trace-and-outbox"] as const;

export function migrationSql(name: string): string {
  return readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8");
}

/** Applies pending migrations in one transaction under an advisory lock; returns their names. */
export async function migrate(pool: Pool): Promise<string[]> {
  return inTransaction(pool, async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtext('siterra_migrations'))");
    await tx.query(
      "create table if not exists schema_migrations (name text primary key, sha256 text not null, applied_at timestamptz not null default now())",
    );
    const applied = new Map(
      (
        await tx.query<{ name: string; sha256: string }>(
          "select name, sha256 from schema_migrations",
        )
      ).rows.map((row) => [row.name, row.sha256]),
    );
    const ran: string[] = [];
    for (const name of migrations) {
      const sql = migrationSql(name);
      const hash = sha256Hex(sql);
      const prior = applied.get(name);
      if (prior !== undefined) {
        if (prior !== hash) {
          throw new Error(`Migration ${name} changed after it was applied`);
        }
        continue;
      }
      await tx.query(sql);
      await tx.query("insert into schema_migrations (name, sha256) values ($1, $2)", [name, hash]);
      ran.push(name);
    }
    return ran;
  });
}
