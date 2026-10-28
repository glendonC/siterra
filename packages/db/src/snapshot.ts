import type { CaseSnapshot, EnvironmentalCase, RecordCollections } from "@siterra/contracts";
import { caseSchemaVersion } from "@siterra/contracts";
import { type Pool, inTransaction } from "./client.ts";

/** Which RecordCollections list holds each record type. */
export const collectionOf = {
  Source: "sourceRecords",
  GeoSelection: "geoSelectionRecords",
  DataBundle: "dataBundleRecords",
  Task: "taskRecords",
  Evidence: "evidenceRecords",
  Measurement: "measurementRecords",
  TemporalObservation: "temporalObservationRecords",
  Hypothesis: "hypothesisRecords",
  Relationship: "relationshipRecords",
  CanvasComponent: "canvasComponentRecords",
  LayoutAction: "layoutActionRecords",
  Intervention: "interventionRecords",
  ResourceRequirement: "resourceRequirementRecords",
  ReviewDecision: "reviewDecisionRecords",
  OperationalAction: "operationalActionRecords",
  Brief: "briefRecords",
  EventRecordRow: "eventRecordRowRecords",
  ContextFeature: "contextFeatureRecords",
} as const satisfies Record<string, keyof RecordCollections>;

export function emptyCollections(): RecordCollections {
  return {
    sourceRecords: [],
    geoSelectionRecords: [],
    dataBundleRecords: [],
    taskRecords: [],
    evidenceRecords: [],
    measurementRecords: [],
    temporalObservationRecords: [],
    hypothesisRecords: [],
    relationshipRecords: [],
    canvasComponentRecords: [],
    layoutActionRecords: [],
    interventionRecords: [],
    resourceRequirementRecords: [],
    reviewDecisionRecords: [],
    operationalActionRecords: [],
    briefRecords: [],
    eventRecordRowRecords: [],
    contextFeatureRecords: [],
  };
}

/**
 * The case, the latest revision of every record and lastSequence, read in one repeatable-read
 * transaction so the records and the cursor agree (runtime view, reload). Null when the case does
 * not exist or belongs to another owner: both answer 404.
 */
export async function readSnapshot(
  pool: Pool,
  caseId: string,
  ownerScopeId: string,
): Promise<CaseSnapshot | null> {
  return inTransaction(
    pool,
    async (tx) => {
      const head = await tx.query<{ record: EnvironmentalCase; last_sequence: string }>(
        "select record, last_sequence from cases where id = $1 and owner_scope_id = $2",
        [caseId, ownerScopeId],
      );
      const row = head.rows[0];
      if (row === undefined) {
        return null;
      }
      const records = await tx.query<{ record_type: keyof typeof collectionOf; record: never }>(
        `select record_type, record from (
           select distinct on (entity_id) entity_id, record_type, record from records
           where case_id = $1 order by entity_id, revision desc
         ) latest
         union all
         select 'ReviewDecision', record from (
           select distinct on (entity_id) entity_id, record from review_records
           where case_id = $1 order by entity_id, revision desc
         ) latest_reviews`,
        [caseId],
      );
      const collections = emptyCollections();
      for (const r of records.rows) {
        const list = collections[collectionOf[r.record_type]] as unknown[];
        list.push(r.record);
      }
      for (const list of Object.values(collections) as { id: string }[][]) {
        list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      }
      return {
        recordType: "CaseSnapshot",
        schemaVersion: caseSchemaVersion,
        case: row.record,
        records: collections,
        lastSequence: Number(row.last_sequence),
      };
    },
    "repeatable read",
  );
}

/** The case's last sequence for the owner, or null when it is not theirs (event stream cursor). */
export async function lastSequenceOf(
  pool: Pool,
  caseId: string,
  ownerScopeId: string,
): Promise<number | null> {
  const result = await pool.query<{ last_sequence: string }>(
    "select last_sequence from cases where id = $1 and owner_scope_id = $2",
    [caseId, ownerScopeId],
  );
  const row = result.rows[0];
  return row === undefined ? null : Number(row.last_sequence);
}
