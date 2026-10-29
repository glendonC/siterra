// SA-09 (platform part): the database a demo runs on holds no example IDs or synthetic contract
// values. Checked on the real seed loaded as the demo seed owner, on a demo copy of it, and on the
// committed UI fixture.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCaseSeed } from "./case-seed.ts";
import type { Pool } from "./client.ts";
import { startDemoSession } from "./demo-sessions.ts";
import { loadSeedCase } from "./seed.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Example-shaped IDs and synthetic markers in a body of text. Every entity ID in schemas/examples
 * carries "example" (case_example_atlas, ev_example_...); the other ID-field values there are
 * dataset, method and period names (chirps_departure, event_extraction, event_record,
 * period_2022-04) that follow the real naming, so they are not leakage. Test records say
 * "Synthetic ..." (test-records.ts).
 */
function leaks(text: string): string[] {
  // `shift_example` is a key of the pixel anatomy bundle's own asset, named in the JSON pointer of a
  // Measurement source (/model/shift_example/ndvi); it is data the bundle holds, not an example ID.
  const found = [
    ...new Set(text.match(/[a-z]+_example[A-Za-z0-9_-]*|example_[A-Za-z0-9_-]+/g)),
  ].filter((id) => id !== "shift_example");
  if (/synthetic/i.test(text)) found.push("synthetic");
  return found;
}

let db: TestDatabase;
let pool: Pool;

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  const { seed, issues } = readCaseSeed({
    repoDir,
    ownerScopeId: "seed",
    importedAt: "2026-10-27T20:00:00Z",
  });
  if (seed === null || issues.length > 0) throw new Error("The seed did not load cleanly");
  await loadSeedCase(pool, seed, "seed");
});

afterAll(async () => {
  await db.drop();
});

describe("SA-09 (platform part): no example IDs or synthetic contract values in the demo database", () => {
  it("the scan finds example IDs, example-shaped names and synthetic markers", () => {
    expect(leaks('{"id":"case_example_atlas"}')).toEqual(["case_example_atlas"]);
    expect(leaks('{"owner":"owner_example_local"}')).toEqual(["owner_example_local"]);
    expect(leaks('{"message":"Synthetic event"}')).toEqual(["synthetic"]);
    expect(leaks('{"periodId":"period_2022-04","title":"Monthly rainfall"}')).toEqual([]);
  });

  it("holds none in the seed case and a demo copy of it, in every table a case writes", async () => {
    const outcome = await startDemoSession(pool, {
      seedCaseId: "case_aitbouguemez",
      seedOwnerScopeId: "seed",
      ttlSeconds: 3600,
      maxActiveSessions: 10,
      maxPerMinute: 10,
    });
    expect(outcome.status).toBe("created");
    const dump = await pool.query<{ source: string; body: string }>(
      `select 'cases' as source, (id || ' ' || owner_scope_id || ' ' || record::text) as body from cases
       union all select 'case_revisions', record::text from case_revisions
       union all select 'records', entity_id || ' ' || record::text from records
       union all select 'events', record::text from events
       union all select 'sessions', owner_scope_id from sessions`,
    );
    const counts = Object.fromEntries(
      ["cases", "records", "events", "sessions"].map((s) => [
        s,
        dump.rows.filter((r) => r.source === s).length,
      ]),
    );
    expect(counts["cases"]).toBe(2);
    expect(counts["records"]).toBeGreaterThan(100);
    expect(counts["sessions"]).toBe(1);
    const found = dump.rows.flatMap((r) => leaks(r.body).map((l) => `${r.source}: ${l}`));
    expect([...new Set(found)]).toEqual([]);
  });

  it("holds none in the committed UI fixture", () => {
    const fixture = readFileSync(
      `${repoDir}packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json`,
      "utf8",
    );
    expect(leaks(fixture)).toEqual([]);
  });
});
