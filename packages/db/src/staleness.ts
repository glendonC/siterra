import { type CaseRecord, isMaterialChange, propagateStaleness } from "@siterra/domain";
import type { Tx } from "./client.ts";

/**
 * Writes a stale revision of every current record that rests on an older revision of an entity
 * this commit wrote (packages/domain staleness.ts), in the commit's own transaction, and returns
 * them. Review decisions go to review_records; their earlier revisions stay readable.
 */
export async function writeStaleDependents(
  tx: Tx,
  args: {
    caseId: string;
    written: readonly CaseRecord[];
    caseRevision: number;
    commitId: string;
    now: string;
  },
): Promise<CaseRecord[]> {
  const writtenIds = args.written.map((w) => w.id);
  const current = await tx.query<{ record: CaseRecord }>(
    `select record from (
       select distinct on (entity_id) entity_id, revision, record from (
         select entity_id, revision, record from records
         where case_id = $1 and not (entity_id = any($2::text[]))
         union all
         select entity_id, revision, record from review_records
         where case_id = $1 and not (entity_id = any($2::text[]))
       ) combined
       order by entity_id, revision desc
     ) latest`,
    [args.caseId, writtenIds],
  );
  // Only a material change stales dependents; compare each write with the revision before it.
  const previous = await tx.query<{ record: CaseRecord }>(
    `select r.record from records r
     join unnest($2::text[], $3::int[]) as w(entity_id, revision)
       on r.entity_id = w.entity_id and r.revision = w.revision - 1
     where r.case_id = $1`,
    [args.caseId, writtenIds, args.written.map((w) => w.revision)],
  );
  const before = new Map(previous.rows.map((row) => [row.record.id, row.record]));
  const material = args.written.filter((w) => isMaterialChange(before.get(w.id), w));
  const stale = propagateStaleness(
    current.rows.map((row) => row.record),
    new Map(material.map((w) => [w.id, w.revision])),
    args.now,
  );
  for (const record of stale) {
    if (record.recordType === "ReviewDecision") {
      await tx.query(
        "insert into review_records (case_id, entity_id, revision, record) values ($1, $2, $3, $4)",
        [args.caseId, record.id, record.revision, JSON.stringify(record)],
      );
    } else {
      await tx.query(
        `insert into records (case_id, entity_id, revision, record_type, record, commit_id, case_revision)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          args.caseId,
          record.id,
          record.revision,
          record.recordType,
          JSON.stringify(record),
          args.commitId,
          args.caseRevision,
        ],
      );
    }
  }
  return stale;
}
