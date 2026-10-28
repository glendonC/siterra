import { EnvironmentalCase } from "@siterra/contracts";
import { type Pool, inTransaction } from "./client.ts";

/** Creates a case at the revision its record states; false when the ID is taken. */
export async function createCase(
  pool: Pool,
  record: EnvironmentalCase,
  ownerScopeId: string,
): Promise<boolean> {
  const parsed = EnvironmentalCase.parse(record);
  return inTransaction(pool, async (tx) => {
    const inserted = await tx.query(
      `insert into cases (id, owner_scope_id, revision, record) values ($1, $2, $3, $4)
       on conflict (id) do nothing`,
      [parsed.id, ownerScopeId, parsed.revision, JSON.stringify(parsed)],
    );
    if (inserted.rowCount === 0) {
      return false;
    }
    await tx.query("insert into case_revisions (case_id, revision, record) values ($1, $2, $3)", [
      parsed.id,
      parsed.revision,
      JSON.stringify(parsed),
    ]);
    return true;
  });
}
