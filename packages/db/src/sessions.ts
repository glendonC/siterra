import { randomBytes } from "node:crypto";
import { sha256Hex } from "@siterra/domain";
import type { Pool } from "./client.ts";

export const sessionCookieName = "__Host-session";

/** Creates a session and returns its token; only the token's SHA-256 is stored. */
export async function createSession(
  pool: Pool,
  args: { ownerScopeId: string; kind: "local" | "demo"; ttlSeconds: number | null },
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    `insert into sessions (id, owner_scope_id, kind, expires_at)
     values ($1, $2, $3, case when $4::integer is null then null else now() + make_interval(secs => $4::integer) end)`,
    [sha256Hex(token), args.ownerScopeId, args.kind, args.ttlSeconds],
  );
  return token;
}

/** The owner scope of an unexpired session, or null. */
export async function sessionOwner(pool: Pool, token: string): Promise<string | null> {
  const result = await pool.query<{ owner_scope_id: string }>(
    "select owner_scope_id from sessions where id = $1 and (expires_at is null or expires_at > now())",
    [sha256Hex(token)],
  );
  return result.rows[0]?.owner_scope_id ?? null;
}
