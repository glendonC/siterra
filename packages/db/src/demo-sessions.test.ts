import { CaseSnapshot } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { submitCommand } from "./commands.ts";
import { applyCommit } from "./commit.ts";
import { deleteExpiredDemoCases, startDemoSession } from "./demo-sessions.ts";
import { sessionInfo } from "./sessions.ts";
import { readSnapshot } from "./snapshot.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import {
  exampleCase,
  exampleCommandRequest,
  exampleCommit,
  exampleEvidence,
} from "./test-records.ts";

let db: TestDatabase;
let pool: Pool;
const seedOwner = "seed";
const seed = exampleCase("case_example_seed");

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  await createCase(pool, seed, seedOwner);
  await applyCommit(
    pool,
    exampleCommit(seed, {
      id: "commit_example_seed",
      expected: 1,
      upserts: [exampleEvidence(seed.id, "ev_example_seed")],
    }),
  );
});

afterAll(async () => {
  await db.drop();
});

async function activeDemoSessions(): Promise<number> {
  const result = await pool.query<{ n: string }>(
    "select count(*) as n from sessions where kind = 'demo' and expires_at > now()",
  );
  return Number(result.rows[0]?.n);
}

const settings = {
  seedCaseId: seed.id,
  seedOwnerScopeId: seedOwner,
  ttlSeconds: 3600,
  maxActiveSessions: 100,
  maxPerMinute: 1000,
};

describe("demo sessions: an isolated copy of the seed case with quotas and expiry", () => {
  it("copies the seed case and its records under a new case ID that only the new session owns", async () => {
    const outcome = await startDemoSession(pool, settings);
    expect(outcome.status).toBe("created");
    if (outcome.status !== "created") return;
    const session = await sessionInfo(pool, outcome.token);
    expect(session?.kind).toBe("demo");
    const owner = session?.ownerScopeId ?? "";
    const copy = await readSnapshot(pool, outcome.caseId, owner);
    expect(CaseSnapshot.safeParse(copy).error?.issues ?? []).toEqual([]);
    expect(copy?.case.id).toBe(outcome.caseId);
    expect(copy?.case.revision).toBe(2);
    expect(copy?.records.evidenceRecords.map((e) => [e.id, e.caseId])).toEqual([
      ["ev_example_seed", outcome.caseId],
    ]);
    expect(copy?.lastSequence).toBe(1);
    expect(await readSnapshot(pool, outcome.caseId, seedOwner)).toBeNull();
    expect(await readSnapshot(pool, seed.id, owner)).toBeNull();
  });

  it("keeps the seed case unchanged when the copy is changed", async () => {
    const outcome = await startDemoSession(pool, settings);
    if (outcome.status !== "created") throw new Error(outcome.status);
    const owner = (await sessionInfo(pool, outcome.token))?.ownerScopeId ?? "";
    const copyCase = (await readSnapshot(pool, outcome.caseId, owner))?.case;
    if (copyCase === undefined) throw new Error("no copy");
    await applyCommit(
      pool,
      exampleCommit(copyCase, {
        id: "commit_example_copy",
        expected: 2,
        upserts: [exampleEvidence(outcome.caseId, "ev_example_copy")],
      }),
    );
    const seedSnapshot = await readSnapshot(pool, seed.id, seedOwner);
    expect(seedSnapshot?.case.revision).toBe(2);
    expect(seedSnapshot?.records.evidenceRecords.map((e) => e.id)).toEqual(["ev_example_seed"]);
  });

  it("refuses a session beyond the active-session limit", async () => {
    const active = await activeDemoSessions();
    expect(
      (await startDemoSession(pool, { ...settings, maxActiveSessions: active + 1 })).status,
    ).toBe("created");
    expect(await startDemoSession(pool, { ...settings, maxActiveSessions: active + 1 })).toEqual({
      status: "quota_exhausted",
      reason: "active_sessions",
    });
  });

  it("deletes the copy and the session once the session expired", async () => {
    const outcome = await startDemoSession(pool, { ...settings, ttlSeconds: 0 });
    if (outcome.status !== "created") throw new Error(outcome.status);
    expect(await sessionInfo(pool, outcome.token)).toBeNull();
    expect(await deleteExpiredDemoCases(pool)).toBeGreaterThanOrEqual(1);
    const left = await pool.query("select 1 from cases where id = $1", [outcome.caseId]);
    expect(left.rowCount).toBe(0);
  });

  it("answers seed_missing when the seed case is not loaded", async () => {
    expect(
      await startDemoSession(pool, { ...settings, seedCaseId: "case_example_absent" }),
    ).toEqual({
      status: "seed_missing",
    });
  });

  it("limits commands per case, while a repeated key still returns its command", async () => {
    const outcome = await startDemoSession(pool, settings);
    if (outcome.status !== "created") throw new Error(outcome.status);
    const owner = (await sessionInfo(pool, outcome.token))?.ownerScopeId ?? "";
    const base = { caseId: outcome.caseId, ownerScopeId: owner, maxCommands: 1 };
    const request = {
      ...exampleCommandRequest("quota-key-0001"),
      expectedCaseRevision: 2,
      context: { ...exampleCommandRequest("x").context, caseRevision: 2 },
    };
    const first = await submitCommand(pool, { ...base, request });
    expect(first.status).toBe("created");
    expect(
      await submitCommand(pool, {
        ...base,
        request: { ...request, idempotencyKey: "quota-key-0002" },
      }),
    ).toEqual({
      status: "quota_exhausted",
    });
    expect((await submitCommand(pool, { ...base, request })).status).toBe("existing");
  });

  it("never deletes a case of an owner that is not a demo owner, even with an expired demo-kind session", async () => {
    const real = exampleCase("case_example_real_owner");
    await createCase(pool, real, "owner_example_real");
    await pool.query(
      "insert into sessions (id, owner_scope_id, kind, expires_at) values ('probe-expired', 'owner_example_real', 'demo', now() - interval '1 hour')",
    );
    await deleteExpiredDemoCases(pool);
    expect((await readSnapshot(pool, real.id, "owner_example_real"))?.case.id).toBe(real.id);
  });

  it("refuses a session beyond the global creation rate", async () => {
    const recent = await pool.query<{ n: string }>(
      "select count(*) as n from sessions where kind = 'demo' and created_at > now() - interval '60 seconds'",
    );
    expect(
      await startDemoSession(pool, { ...settings, maxPerMinute: Number(recent.rows[0]?.n) }),
    ).toEqual({
      status: "quota_exhausted",
      reason: "creation_rate",
    });
  });

  it("does not copy the seed's review records into a demo copy", async () => {
    await pool.query(
      `insert into review_records (case_id, entity_id, revision, record)
       values ($1, 'rev_example_seed', 1, jsonb_build_object('recordType', 'ReviewDecision', 'id', 'rev_example_seed'))`,
      [seed.id],
    );
    const outcome = await startDemoSession(pool, settings);
    if (outcome.status !== "created") throw new Error(outcome.status);
    const copied = await pool.query("select 1 from review_records where case_id = $1", [
      outcome.caseId,
    ]);
    expect(copied.rowCount).toBe(0);
  });

  it("copies a live seed as concept while GATE-01 is not recorded", async () => {
    const liveSeed = { ...exampleCase("case_example_live_seed"), mode: "live" as const };
    await createCase(pool, liveSeed, seedOwner);
    const outcome = await startDemoSession(pool, { ...settings, seedCaseId: liveSeed.id });
    if (outcome.status !== "created") throw new Error(outcome.status);
    const owner = (await sessionInfo(pool, outcome.token))?.ownerScopeId ?? "";
    expect((await readSnapshot(pool, outcome.caseId, owner))?.case.mode).toBe("concept");
  });
});
