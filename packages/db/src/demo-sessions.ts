import { randomBytes } from "node:crypto";
import type { EnvironmentalCase } from "@siterra/contracts";
import { eventMessages, newId, sha256Hex } from "@siterra/domain";
import { type Pool, type Tx, inTransaction, notifyEvents } from "./client.ts";
import { insertEvents, setLastSequence } from "./events.ts";
import { permittedMode } from "./live-mode.ts";

export type DemoSessionOutcome =
  | { status: "created"; token: string; caseId: string; expiresAt: string }
  | { status: "quota_exhausted"; reason: "active_sessions" | "creation_rate" }
  | { status: "seed_missing" };

/**
 * Starts a public demo session on an isolated copy of the seed case (runtime view: "A public demo
 * session gets an isolated copy of the seed case with quotas and expiry"). Expired demo copies are
 * deleted first, so no scheduler is needed. The copy keeps every record revision and the seed's
 * case revision, under a new case ID and owner scope.
 */
export async function startDemoSession(
  pool: Pool,
  args: {
    seedCaseId: string;
    seedOwnerScopeId: string;
    ttlSeconds: number;
    maxActiveSessions: number;
    /** Demo sessions any visitor may start per minute, counted globally (no per-client data). */
    maxPerMinute: number;
  },
): Promise<DemoSessionOutcome> {
  return inTransaction(pool, async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtext('siterra_demo_sessions'))");
    await deleteExpiredDemoCasesIn(tx);
    const counts = await tx.query<{ active: string; recent: string }>(
      `select count(*) filter (where expires_at > now()) as active,
              count(*) filter (where created_at > now() - interval '60 seconds') as recent
       from sessions where kind = 'demo'`,
    );
    if (Number(counts.rows[0]?.active) >= args.maxActiveSessions) {
      return { status: "quota_exhausted", reason: "active_sessions" };
    }
    if (Number(counts.rows[0]?.recent) >= args.maxPerMinute) {
      return { status: "quota_exhausted", reason: "creation_rate" };
    }
    const seed = await tx.query<{ revision: number; record: EnvironmentalCase }>(
      "select revision, record from cases where id = $1 and owner_scope_id = $2",
      [args.seedCaseId, args.seedOwnerScopeId],
    );
    const seedRow = seed.rows[0];
    if (seedRow === undefined) {
      return { status: "seed_missing" };
    }
    const token = randomBytes(32).toString("base64url");
    const ownerScopeId = newId(demoOwnerPrefix.slice(0, -1));
    const caseId = newId("case");
    const session = await tx.query<{ expires_at: Date }>(
      `insert into sessions (id, owner_scope_id, kind, expires_at)
       values ($1, $2, 'demo', now() + make_interval(secs => $3::integer)) returning expires_at`,
      [sha256Hex(token), ownerScopeId, args.ttlSeconds],
    );
    const expiresAt = (session.rows[0]?.expires_at ?? new Date()).toISOString();
    const now = new Date().toISOString();
    const caseRecord: EnvironmentalCase = {
      ...seedRow.record,
      id: caseId,
      ownerScopeId,
      // A copy is never live before GATE-01 is recorded, whatever the seed says (live-mode.ts).
      mode: permittedMode(seedRow.record.mode),
      createdAt: now,
      updatedAt: now,
    };
    await tx.query(
      "insert into cases (id, owner_scope_id, revision, record) values ($1, $2, $3, $4)",
      [caseId, ownerScopeId, seedRow.revision, JSON.stringify(caseRecord)],
    );
    await tx.query("insert into case_revisions (case_id, revision, record) values ($1, $2, $3)", [
      caseId,
      seedRow.revision,
      JSON.stringify(caseRecord),
    ]);
    await tx.query(
      `insert into records (case_id, entity_id, revision, record_type, record, commit_id, case_revision)
       select $2, entity_id, revision, record_type, jsonb_set(record, '{caseId}', to_jsonb($2::text)), commit_id, case_revision
       from records where case_id = $1`,
      [args.seedCaseId, caseId],
    );
    const { lastSequence } = await insertEvents(
      tx,
      { id: caseId, ownerScopeId, revision: seedRow.revision, lastSequence: 0, record: caseRecord },
      [
        {
          occurredAt: now,
          kind: "case.committed",
          commandId: null,
          taskId: null,
          entityIds: [caseId],
          message: eventMessages.demoCopyOpened(),
          dedupeKey: `case.demo_copy:${caseId}`,
          resultStatus: null,
          tool: null,
          usage: null,
          validation: null,
          spanId: null,
          parentSpanId: null,
        },
      ],
      seedRow.revision,
    );
    await setLastSequence(tx, caseId, lastSequence);
    await notifyEvents(tx, caseId);
    return { status: "created", token, caseId, expiresAt };
  });
}

/** Owner scopes of demo sessions; only cases under such an owner are ever deleted. */
export const demoOwnerPrefix = "demo_";

/**
 * Deletes the demo copies whose session expired, then the expired demo sessions; returns the
 * cases deleted. Only a case whose owner scope starts with demo_ and whose demo session expired
 * is deleted, so a real owner's case never is. This is the one path that may delete case history:
 * it sets siterra.case_deletion, which the append-only guards honour only inside the cascade from
 * the cases row. The guards prevent mistakes; they do not stop someone holding the database
 * credentials.
 */
async function deleteExpiredDemoCasesIn(tx: Tx): Promise<number> {
  await tx.query("set local siterra.case_deletion = 'on'");
  const deleted = await tx.query(
    `delete from cases where starts_with(owner_scope_id, $1) and owner_scope_id in (
       select owner_scope_id from sessions where kind = 'demo' and expires_at <= now()
     )`,
    [demoOwnerPrefix],
  );
  await tx.query("delete from sessions where kind = 'demo' and expires_at <= now()");
  await tx.query("set local siterra.case_deletion = 'off'");
  return deleted.rowCount ?? 0;
}

export async function deleteExpiredDemoCases(pool: Pool): Promise<number> {
  return inTransaction(pool, async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtext('siterra_demo_sessions'))");
    return deleteExpiredDemoCasesIn(tx);
  });
}
