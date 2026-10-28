import { randomBytes } from "node:crypto";
import { sha256Hex } from "@siterra/domain";
import type { Pool } from "./client.ts";

export const sessionCookieName = "__Host-session";

/**
 * Creates a local session and returns its token; only the token's SHA-256 is stored. Demo sessions
 * are created only by startDemoSession, with their own demo_ owner scope.
 */
export async function createSession(
  pool: Pool,
  args: { ownerScopeId: string; kind: "local"; ttlSeconds: number | null },
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    `insert into sessions (id, owner_scope_id, kind, expires_at)
     values ($1, $2, $3, case when $4::integer is null then null else now() + make_interval(secs => $4::integer) end)`,
    [sha256Hex(token), args.ownerScopeId, args.kind, args.ttlSeconds],
  );
  return token;
}

export type SessionInfo = { ownerScopeId: string; kind: "local" | "demo" };

/** The owner scope and kind of an unexpired session, or null. */
export async function sessionInfo(pool: Pool, token: string): Promise<SessionInfo | null> {
  const result = await pool.query<{ owner_scope_id: string; kind: "local" | "demo" }>(
    "select owner_scope_id, kind from sessions where id = $1 and (expires_at is null or expires_at > now())",
    [sha256Hex(token)],
  );
  const row = result.rows[0];
  return row === undefined ? null : { ownerScopeId: row.owner_scope_id, kind: row.kind };
}

/** The owner scope of an unexpired session, or null. */
export async function sessionOwner(pool: Pool, token: string): Promise<string | null> {
  return (await sessionInfo(pool, token))?.ownerScopeId ?? null;
}
