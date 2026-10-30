import type { Pool, Tx } from "./client.ts";

/**
 * The case ID whose analysis configuration applies to this case: the seed a demo copy was made
 * from, or the case itself when it is not a copy. A configuration is keyed by the seed's ID
 * (packages/domain cases), so every read of one for a stored case goes through here.
 */
export async function analysisCaseIdOf(db: Pool | Tx, caseId: string): Promise<string> {
  const result = await db.query<{ origin_case_id: string | null }>(
    "select origin_case_id from cases where id = $1",
    [caseId],
  );
  return result.rows[0]?.origin_case_id ?? caseId;
}
