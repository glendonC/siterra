import { Commit, EnvironmentalCase, type EntityVersion } from "@siterra/contracts";
import { canonicalJson, eventMessages } from "@siterra/domain";
import { z } from "zod";
import { type Pool, type Tx, inTransaction, lockCase, notifyEvents } from "./client.ts";
import { EventDraft, insertEvents, setLastSequence } from "./events.ts";
import { writeStaleDependents } from "./staleness.ts";

/**
 * A commit as the worker proposes it: a Commit whose events are drafts, because the database
 * assigns sequences. resultKey is the logical task result key (caseId, commandId, task kind,
 * inputHash); a retry that finds it committed gets the earlier result.
 */
export const CommitProposal = Commit.omit({ events: true }).extend({
  events: z.array(EventDraft).min(1),
  resultKey: z.string().min(1).nullable(),
});
export type CommitProposal = z.infer<typeof CommitProposal>;

export type CommitOutcome =
  | { status: "committed"; commit: Commit; rebasedFrom: number | null }
  | { status: "duplicate"; commitId: string; newCaseRevision: number }
  | { status: "stale"; currentRevision: number; changedInputs: EntityVersion[] }
  | { status: "not_found" };

/** A commit that breaks a storage rule; nothing is written. */
export class CommitRejected extends Error {
  readonly code:
    "revision_conflict" | "case_mismatch" | "duplicate_entity" | "review_not_permitted";
  constructor(code: CommitRejected["code"], message: string) {
    super(message);
    this.name = "CommitRejected";
    this.code = code;
  }
}

type Upsert = Commit["upserts"][number] | Commit["layoutActions"][number];

async function latestRevisions(
  tx: Tx,
  caseId: string,
  entityIds: string[],
): Promise<Map<string, { revision: number; recordType: string }>> {
  const result = await tx.query<{ entity_id: string; revision: number; record_type: string }>(
    `select distinct on (entity_id) entity_id, revision, record_type from (
       select entity_id, revision, record_type from records where case_id = $1 and entity_id = any($2::text[])
       union all
       select entity_id, revision, 'ReviewDecision' from review_records where case_id = $1 and entity_id = any($2::text[])
     ) all_revisions
     order by entity_id, revision desc`,
    [caseId, entityIds],
  );
  return new Map(
    result.rows.map((row) => [
      row.entity_id,
      { revision: row.revision, recordType: row.record_type },
    ]),
  );
}

/** Inputs whose latest revision is no longer the one the commit was computed from. */
async function changedInputs(
  tx: Tx,
  caseId: string,
  inputs: readonly EntityVersion[],
): Promise<EntityVersion[]> {
  const latest = await latestRevisions(
    tx,
    caseId,
    inputs.map((input) => input.entityId),
  );
  return inputs.filter((input) => latest.get(input.entityId)?.revision !== input.revision);
}

function withoutRevisionFields(record: EnvironmentalCase): string {
  const { revision: _revision, updatedAt: _updatedAt, ...rest } = record;
  return canonicalJson(rest);
}

/**
 * Applies a commit atomically against the expected case revision (data-contracts.md, idempotency,
 * revisions and recovery). When the case moved on, the commit rebases only if its inputs are
 * unchanged and it leaves the case fields as they were; otherwise it is stale and nothing is written.
 */
export async function applyCommit(pool: Pool, input: CommitProposal): Promise<CommitOutcome> {
  const proposal = CommitProposal.parse(input);
  return inTransaction(pool, async (tx) => {
    const locked = await lockCase(tx, proposal.caseId);
    if (locked === null) {
      return { status: "not_found" };
    }
    const prior = await tx.query<{ id: string; new_case_revision: number }>(
      `select id, new_case_revision from commits
       where case_id = $1 and (idempotency_key = $2 or ($3::text is not null and result_key = $3))`,
      [proposal.caseId, proposal.idempotencyKey, proposal.resultKey],
    );
    const found = prior.rows[0];
    if (found !== undefined) {
      return { status: "duplicate", commitId: found.id, newCaseRevision: found.new_case_revision };
    }

    let expected = proposal.expectedCaseRevision;
    let caseAfter = proposal.caseAfter;
    let rebasedFrom: number | null = null;
    if (expected !== locked.revision) {
      const changed = await changedInputs(tx, proposal.caseId, proposal.inputVersions);
      const base = await tx.query<{ record: EnvironmentalCase }>(
        "select record from case_revisions where case_id = $1 and revision = $2",
        [proposal.caseId, expected],
      );
      const baseRecord = base.rows[0]?.record;
      const caseFieldsUnchanged =
        baseRecord !== undefined &&
        withoutRevisionFields(baseRecord) === withoutRevisionFields(caseAfter);
      if (expected > locked.revision || changed.length > 0 || !caseFieldsUnchanged) {
        return { status: "stale", currentRevision: locked.revision, changedInputs: changed };
      }
      rebasedFrom = expected;
      expected = locked.revision;
      caseAfter = { ...(locked.record as EnvironmentalCase), updatedAt: caseAfter.updatedAt };
    }
    const newRevision = expected + 1;
    caseAfter = EnvironmentalCase.parse({ ...caseAfter, revision: newRevision });
    if (caseAfter.id !== proposal.caseId) {
      throw new CommitRejected(
        "case_mismatch",
        `caseAfter ${caseAfter.id} is not case ${proposal.caseId}`,
      );
    }

    const writes: Upsert[] = [...proposal.upserts, ...proposal.layoutActions];
    // Review decisions are recorded only through the review endpoint, by a person with a session
    // and a role (review-and-authority.md); a task commit can never write one.
    const review = writes.find((record) => record.recordType === "ReviewDecision");
    if (review !== undefined) {
      throw new CommitRejected(
        "review_not_permitted",
        `${review.id}: review decisions are not written by task commits`,
      );
    }
    const ids = writes.map((record) => record.id);
    if (new Set(ids).size !== ids.length) {
      throw new CommitRejected("duplicate_entity", "A commit writes each entity at most once");
    }
    const latest = await latestRevisions(tx, proposal.caseId, ids);
    for (const record of writes) {
      if (record.caseId !== proposal.caseId) {
        throw new CommitRejected("case_mismatch", `${record.id} belongs to ${record.caseId}`);
      }
      const current = latest.get(record.id);
      const expectedRevision = current === undefined ? 1 : current.revision + 1;
      if (
        record.revision !== expectedRevision ||
        (current !== undefined && current.recordType !== record.recordType)
      ) {
        throw new CommitRejected(
          "revision_conflict",
          `${record.id} revision ${record.revision} does not follow stored revision ${current?.revision ?? 0}`,
        );
      }
    }
    for (const record of writes) {
      await tx.query(
        `insert into records (case_id, entity_id, revision, record_type, record, commit_id, case_revision)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          proposal.caseId,
          record.id,
          record.revision,
          record.recordType,
          JSON.stringify(record),
          proposal.id,
          newRevision,
        ],
      );
    }

    // A newer revision makes every record that rests on the older one stale (DF-03), in this
    // transaction, with one entity.stale event naming them.
    const now = new Date().toISOString();
    const stale = await writeStaleDependents(tx, {
      caseId: proposal.caseId,
      written: writes,
      caseRevision: newRevision,
      commitId: proposal.id,
      now,
    });
    const staleEvent: EventDraft[] =
      stale.length === 0
        ? []
        : [
            {
              occurredAt: now,
              kind: "entity.stale",
              commandId: proposal.commandId,
              taskId: proposal.taskId,
              entityIds: stale.map((record) => record.id),
              message: eventMessages.entitiesStale(stale.length),
              dedupeKey: `entity.stale:${proposal.id}`,
              resultStatus: null,
              tool: null,
              usage: null,
              validation: null,
              spanId: null,
              parentSpanId: null,
            },
          ];

    await tx.query(
      "update cases set revision = $2, record = $3, updated_at = now() where id = $1",
      [proposal.caseId, newRevision, JSON.stringify(caseAfter)],
    );
    await tx.query(
      "insert into case_revisions (case_id, revision, record, commit_id) values ($1, $2, $3, $4)",
      [proposal.caseId, newRevision, JSON.stringify(caseAfter), proposal.id],
    );
    const { events, lastSequence } = await insertEvents(
      tx,
      { ...locked, revision: newRevision },
      [...proposal.events, ...staleEvent],
      newRevision,
    );
    await tx.query(
      `insert into commits (case_id, id, command_id, task_id, idempotency_key, result_key, expected_case_revision, new_case_revision)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        proposal.caseId,
        proposal.id,
        proposal.commandId,
        proposal.taskId,
        proposal.idempotencyKey,
        proposal.resultKey,
        expected,
        newRevision,
      ],
    );
    await setLastSequence(tx, proposal.caseId, lastSequence);
    await notifyEvents(tx, proposal.caseId);

    const { resultKey: _resultKey, ...commitFields } = proposal;
    const commit = Commit.parse({
      ...commitFields,
      expectedCaseRevision: expected,
      newCaseRevision: newRevision,
      caseAfter,
      upserts: [...proposal.upserts, ...stale],
      events,
    });
    return { status: "committed", commit, rebasedFrom };
  });
}
