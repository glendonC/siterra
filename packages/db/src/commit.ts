import {
  type CanvasComponent,
  Commit,
  EnvironmentalCase,
  type EntityVersion,
  type InstrumentSpec,
  isInstrumentKind,
} from "@siterra/contracts";
import {
  canonicalJson,
  eventMessages,
  fieldPlanIssues,
  instrumentComponentIssues,
  instrumentSpecIssues,
  uncitedInstrumentInputs,
} from "@siterra/domain";
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
    | "revision_conflict"
    | "case_mismatch"
    | "duplicate_entity"
    | "review_not_permitted"
    | "brief_inputs_not_cited"
    | "instrument_inputs_not_cited"
    | "instrument_invalid"
    | "action_status_not_permitted"
    | "field_plan_invalid";
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
 * A review request as a task may write it: a first revision in state requested, demo mode,
 * authority not established, no actor, no decision time, no conditions, not stale, and as its
 * comment exactly the host catalog text for its role (eventMessages.reviewRequested), never model
 * text. Anything that records or pre-fills a decision is not a request.
 */
export function isReviewRequest(record: Upsert): boolean {
  return (
    record.recordType === "ReviewDecision" &&
    record.revision === 1 &&
    record.status === "requested" &&
    record.mode === "demo" &&
    record.authorityStatus === "not_established" &&
    record.actorId === null &&
    record.decisionAt === null &&
    record.conditions.length === 0 &&
    !record.stale &&
    record.comments === eventMessages.reviewRequested(record.role)
  );
}

/**
 * The evidence, hypotheses and interventions a brief names that its provenance.inputVersions does
 * not cite at some revision. Staleness follows exact versions only (data-contracts.md, principle 2),
 * so a brief naming an input it does not cite would never go stale when that input changes.
 */
export function uncoveredBriefCitations(record: Upsert): string[] {
  if (record.recordType !== "Brief") return [];
  const cited = new Set(record.provenance.inputVersions.map((v) => v.entityId));
  return [...record.evidenceIds, ...record.hypothesisIds, ...record.interventionIds].filter(
    (id) => !cited.has(id),
  );
}

/**
 * The records an instrument spec names that its provenance.inputVersions does not cite (INST-01).
 * Staleness follows exact versions only (data-contracts.md, principle 2), so a spec naming a bundle,
 * area, feature or statement it does not cite would never go stale when that record changes.
 */
export function uncoveredInstrumentCitations(record: Upsert): string[] {
  return record.recordType === "InstrumentSpec" ? uncitedInstrumentInputs(record) : [];
}

/**
 * The instrument rules for what a commit writes: a layer_stack lists distinct layers and selects
 * one of them (INST-03), and an instrument component binds the one spec of its own kind at that
 * spec's current revision (INST-02), looked up among the commit's own writes first and then in the
 * case.
 */
async function instrumentProblems(
  tx: Tx,
  caseId: string,
  writes: readonly Upsert[],
): Promise<string[]> {
  const specs = new Map<string, InstrumentSpec>();
  const components: CanvasComponent[] = [];
  for (const record of writes) {
    if (record.recordType === "InstrumentSpec") specs.set(record.id, record);
    else if (record.recordType === "CanvasComponent" && isInstrumentKind(record.componentKind)) {
      components.push(record);
    }
  }
  const missing = components
    .map((component) => component.entityVersions[0]?.entityId)
    .filter((id): id is string => id !== undefined && !specs.has(id));
  if (missing.length > 0) {
    const stored = await tx.query<{ record: InstrumentSpec }>(
      `select distinct on (entity_id) record from records
       where case_id = $1 and record_type = 'InstrumentSpec' and entity_id = any($2::text[])
       order by entity_id, revision desc`,
      [caseId, missing],
    );
    for (const row of stored.rows) specs.set(row.record.id, row.record);
  }
  return [
    ...[...specs.values()]
      .filter((spec) => writes.includes(spec))
      .flatMap((spec) => instrumentSpecIssues(spec)),
    ...components.flatMap((component) =>
      instrumentComponentIssues(component, specs.get(component.entityVersions[0]?.entityId ?? "")),
    ),
  ];
}

/**
 * The field-plan rules (DF-06, @siterra/domain fieldPlanIssues) for the actions a commit drafts or
 * sends for review, against the case's current gaps and hypotheses including those the commit
 * writes. A cancelled, blocked or superseded action is not checked again.
 */
async function fieldPlanProblems(
  tx: Tx,
  caseId: string,
  writes: readonly Upsert[],
): Promise<string[]> {
  const plans = writes.filter(
    (record) =>
      record.recordType === "OperationalAction" &&
      (record.status === "draft" || record.status === "awaiting_review") &&
      (record.kind === "field_validation_plan" || record.fieldPlan !== undefined),
  );
  if (plans.length === 0) return [];
  const stored = await tx.query<{ entity_id: string; record: Upsert }>(
    `select distinct on (entity_id) entity_id, record from records
     where case_id = $1 and record_type in ('Evidence', 'Hypothesis')
     order by entity_id, revision desc`,
    [caseId],
  );
  const current = new Map<string, Upsert>(stored.rows.map((r) => [r.entity_id, r.record]));
  for (const record of writes) current.set(record.id, record);
  const openGapIds = new Set<string>();
  const hypothesisIds = new Set<string>();
  for (const record of current.values()) {
    if (
      record.recordType === "Evidence" &&
      record.claimKind === "field_requirement" &&
      record.status === "accepted"
    ) {
      openGapIds.add(record.id);
    } else if (record.recordType === "Hypothesis") {
      hypothesisIds.add(record.id);
    }
  }
  return plans.flatMap((record) =>
    record.recordType === "OperationalAction"
      ? fieldPlanIssues(record, { openGapIds, hypothesisIds })
      : [],
  );
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
    // and a role (review-and-authority.md). A task commit may only request a review (request_review
    // in the brief_package task): a new record in state requested that decides nothing.
    const review = writes.find(
      (record) => record.recordType === "ReviewDecision" && !isReviewRequest(record),
    );
    if (review !== undefined) {
      throw new CommitRejected(
        "review_not_permitted",
        `${review.id}: a task commit may only request a review, not record a decision`,
      );
    }
    // An action becomes prepared only when its reviews complete (reviews.ts, action-status.ts); a
    // task commit that writes it prepared would skip the reviews and the outstanding conditions.
    const prepared = writes.find(
      (record) => record.recordType === "OperationalAction" && record.status === "prepared",
    );
    if (prepared !== undefined) {
      throw new CommitRejected(
        "action_status_not_permitted",
        `${prepared.id}: an action is prepared only by its reviews, not by a task commit`,
      );
    }
    for (const record of writes) {
      const uncovered = uncoveredBriefCitations(record);
      if (uncovered.length > 0) {
        throw new CommitRejected(
          "brief_inputs_not_cited",
          `${record.id}: provenance.inputVersions does not cite ${uncovered.join(", ")}`,
        );
      }
    }
    for (const record of writes) {
      const uncited = uncoveredInstrumentCitations(record);
      if (uncited.length > 0) {
        throw new CommitRejected(
          "instrument_inputs_not_cited",
          `${record.id}: provenance.inputVersions does not cite ${uncited.join(", ")}`,
        );
      }
    }
    const instrumentIssues = await instrumentProblems(tx, proposal.caseId, writes);
    if (instrumentIssues.length > 0) {
      throw new CommitRejected("instrument_invalid", instrumentIssues.join("; "));
    }
    const planProblems = await fieldPlanProblems(tx, proposal.caseId, writes);
    if (planProblems.length > 0) {
      throw new CommitRejected("field_plan_invalid", planProblems.join("; "));
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
      if (record.recordType === "ReviewDecision") {
        await tx.query(
          "insert into review_records (case_id, entity_id, revision, record) values ($1, $2, $3, $4)",
          [proposal.caseId, record.id, record.revision, JSON.stringify(record)],
        );
        continue;
      }
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
