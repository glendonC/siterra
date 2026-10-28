import { EnvironmentalCase, type GeoSelection, type Source } from "@siterra/contracts";
import { type Pool, inTransaction, notifyEvents } from "./client.ts";
import type { ImportedBundle } from "./bundle-import.ts";
import { insertEvents, setLastSequence } from "./events.ts";

export type CaseSeedRecords = {
  caseRecord: EnvironmentalCase;
  geoSelections: readonly GeoSelection[];
  sources: readonly Source[];
  bundles: readonly ImportedBundle[];
};

/**
 * Writes a seed case at revision 1 with its geometry, sources and imported bundles, and one
 * case.committed event, in one transaction. Refuses a case ID that already exists, so a seed is
 * loaded once per owner copy.
 */
export async function loadSeedCase(
  pool: Pool,
  seed: CaseSeedRecords,
  ownerScopeId: string,
): Promise<{ records: number }> {
  const caseRecord = EnvironmentalCase.parse({ ...seed.caseRecord, revision: 1 });
  const records = [
    ...seed.geoSelections,
    ...seed.sources,
    ...seed.bundles.flatMap((b) => [b.dataBundle, ...b.temporalObservations, ...b.measurements]),
  ];
  return inTransaction(pool, async (tx) => {
    const inserted = await tx.query(
      "insert into cases (id, owner_scope_id, revision, record) values ($1, $2, 1, $3) on conflict (id) do nothing",
      [caseRecord.id, ownerScopeId, JSON.stringify(caseRecord)],
    );
    if (inserted.rowCount === 0) {
      throw new Error(`Case ${caseRecord.id} already exists`);
    }
    await tx.query("insert into case_revisions (case_id, revision, record) values ($1, 1, $2)", [
      caseRecord.id,
      JSON.stringify(caseRecord),
    ]);
    for (const record of records) {
      if (record.caseId !== caseRecord.id) {
        throw new Error(`${record.id} belongs to ${record.caseId}, not ${caseRecord.id}`);
      }
      await tx.query(
        `insert into records (case_id, entity_id, revision, record_type, record, case_revision)
         values ($1, $2, $3, $4, $5, 1)`,
        [caseRecord.id, record.id, record.revision, record.recordType, JSON.stringify(record)],
      );
    }
    const { lastSequence } = await insertEvents(
      tx,
      { id: caseRecord.id, ownerScopeId, revision: 1, lastSequence: 0, record: caseRecord },
      [
        {
          occurredAt: caseRecord.updatedAt,
          kind: "case.committed",
          commandId: null,
          taskId: null,
          entityIds: seed.bundles.map((b) => b.dataBundle.id),
          message: `Loaded ${seed.bundles.length} observation bundles`,
          dedupeKey: `case.seeded:${caseRecord.id}`,
          resultStatus: null,
          tool: null,
          usage: null,
          validation: null,
          spanId: null,
          parentSpanId: null,
        },
      ],
      1,
    );
    await setLastSequence(tx, caseRecord.id, lastSequence);
    await notifyEvents(tx, caseRecord.id);
    return { records: records.length };
  });
}
