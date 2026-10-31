// Role-specific review decisions (review-and-authority.md), the only way a ReviewDecision is
// written: a person with a session records one role's decision on exact entity versions at the
// current case revision. Task commits cannot write one (commit.ts, review_not_permitted).
import {
  Brief,
  EnvironmentalCase,
  type EntityVersion,
  OperationalAction,
  type PlanReviewDecisionRequest,
  ReviewDecision,
  type ReviewRequest,
  type ValidationResult,
} from "@siterra/contracts";
import { canonicalJson, eventMessages, newId, sha256Hex } from "@siterra/domain";
import { preparedAction } from "./action-status.ts";
import { type Pool, type Tx, inTransaction, lockCase, notifyEvents } from "./client.ts";
import { insertEvents, setLastSequence } from "./events.ts";

type Decision = ReviewRequest["decision"];

/**
 * Decisions each role may record in demo mode. The community and livelihood role cannot be
 * completed inside the demo; its one control, "Mark consultation required", records a deferred
 * decision that always carries consultationCondition (lead decision, 27 Oct 2026). "Defer
 * decision" for another role records deferred with only the conditions sent.
 */
export const consultationCondition = "Local consultation required";

export const demoDecisions: Record<ReviewRequest["role"], readonly Decision[]> = {
  scientific: ["approved", "changes_requested", "rejected", "deferred"],
  community_livelihood: ["deferred"],
  program_coordination: ["approved", "changes_requested", "rejected", "deferred"],
};

export type ReviewOutcome =
  | { status: "created"; decision: ReviewDecision }
  | { status: "existing"; decision: ReviewDecision }
  | { status: "key_reused" }
  | { status: "not_permitted"; reason: string }
  | { status: "stale"; issues: ValidationResult["issues"] }
  | { status: "invalid"; issues: ValidationResult["issues"] }
  | { status: "not_found" };

export async function recordReview(
  pool: Pool,
  args: { caseId: string; ownerScopeId: string; request: ReviewRequest; now?: Date },
): Promise<ReviewOutcome> {
  const { caseId, request } = args;
  const now = (args.now ?? new Date()).toISOString();
  const requestHash = sha256Hex(canonicalJson(request));
  return inTransaction(pool, async (tx) => {
    const locked = await lockCase(tx, caseId);
    if (locked === null || locked.ownerScopeId !== args.ownerScopeId) {
      return { status: "not_found" };
    }
    const prior = await tx.query<{ record: ReviewDecision; request_hash: string }>(
      "select record, request_hash from review_records where case_id = $1 and idempotency_key = $2",
      [caseId, request.idempotencyKey],
    );
    const found = prior.rows[0];
    if (found !== undefined) {
      return found.request_hash === requestHash
        ? { status: "existing", decision: found.record }
        : { status: "key_reused" };
    }
    if (request.mode !== "demo") {
      return {
        status: "not_permitted",
        reason: "Real decisions need an established authority, which this build does not have",
      };
    }
    if (!demoDecisions[request.role].includes(request.decision)) {
      return {
        status: "not_permitted",
        reason: `The ${request.role} role cannot record ${request.decision} in demo mode`,
      };
    }

    const ids = request.reviewedEntityVersions.map((v) => v.entityId);
    const latest = await tx.query<{ entity_id: string; revision: number; record_type: string }>(
      `select distinct on (entity_id) entity_id, revision, record_type from records
       where case_id = $1 and entity_id = any($2::text[]) order by entity_id, revision desc`,
      [caseId, [...ids, ...(request.actionId === null ? [] : [request.actionId])]],
    );
    const current = new Map(latest.rows.map((row) => [row.entity_id, row]));
    const unknown: ValidationResult["issues"] = [];
    const stale: ValidationResult["issues"] = [];
    request.reviewedEntityVersions.forEach((version: EntityVersion, i) => {
      const row = current.get(version.entityId);
      if (row === undefined) {
        unknown.push({
          code: "unknown_reference",
          path: `/reviewedEntityVersions/${i}`,
          message: `${version.entityId} is not in this case`,
        });
      } else if (row.revision !== version.revision) {
        stale.push({
          code: "stale_reference",
          path: `/reviewedEntityVersions/${i}`,
          message: `${version.entityId} is at revision ${row.revision}, not ${version.revision}`,
        });
      }
    });
    if (
      request.actionId !== null &&
      current.get(request.actionId)?.record_type !== "OperationalAction"
    ) {
      unknown.push({
        code: "unknown_reference",
        path: "/actionId",
        message: `${request.actionId} is not an action of this case`,
      });
    }
    if (unknown.length > 0) {
      return { status: "invalid", issues: unknown };
    }
    if (request.caseRevisionReviewed !== locked.revision) {
      stale.push({
        code: "stale_reference",
        path: "/caseRevisionReviewed",
        message: `The case is at revision ${locked.revision}; review the current version`,
      });
    }
    if (stale.length > 0) {
      return { status: "stale", issues: stale };
    }

    const decision = ReviewDecision.parse({
      recordType: "ReviewDecision",
      id: newId("rev"),
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      actionId: request.actionId,
      reviewedEntityVersions: request.reviewedEntityVersions,
      caseRevisionReviewed: request.caseRevisionReviewed,
      role: request.role,
      actorId: null,
      authorityStatus: "not_established",
      mode: "demo",
      status: request.decision,
      decisionAt: now,
      conditions:
        request.role === "community_livelihood" &&
        !request.conditions.includes(consultationCondition)
          ? [...request.conditions, consultationCondition]
          : request.conditions,
      comments: request.comments,
      stale: false,
    });
    await tx.query(
      `insert into review_records (case_id, entity_id, revision, idempotency_key, request_hash, record)
       values ($1, $2, 1, $3, $4, $5)`,
      [caseId, decision.id, request.idempotencyKey, requestHash, JSON.stringify(decision)],
    );
    // Recompute the action: when this decision completes its reviews, the action becomes prepared
    // in a new case revision, inside this transaction.
    const prepared =
      decision.actionId === null
        ? null
        : await prepareActionIfReviewed(tx, caseId, decision.actionId, now);
    let caseRevision = locked.revision;
    if (prepared !== null) {
      caseRevision = locked.revision + 1;
      const caseRecord = EnvironmentalCase.parse({
        ...(locked.record as EnvironmentalCase),
        revision: caseRevision,
        updatedAt: now,
      });
      await tx.query(
        `insert into records (case_id, entity_id, revision, record_type, record, commit_id, case_revision)
         values ($1, $2, $3, 'OperationalAction', $4, null, $5)`,
        [caseId, prepared.id, prepared.revision, JSON.stringify(prepared), caseRevision],
      );
      await tx.query(
        "update cases set revision = $2, record = $3, updated_at = now() where id = $1",
        [caseId, caseRevision, JSON.stringify(caseRecord)],
      );
      await tx.query("insert into case_revisions (case_id, revision, record) values ($1, $2, $3)", [
        caseId,
        caseRevision,
        JSON.stringify(caseRecord),
      ]);
    }
    const { lastSequence } = await insertEvents(
      tx,
      { ...locked, revision: caseRevision },
      [
        {
          occurredAt: now,
          kind: "review.recorded",
          commandId: null,
          taskId: null,
          entityIds: [decision.id, ...(decision.actionId === null ? [] : [decision.actionId])],
          message: eventMessages.reviewRecorded(decision.role, request.decision),
          dedupeKey: `review.recorded:${decision.id}`,
          resultStatus: null,
          tool: null,
          usage: null,
          validation: null,
          spanId: null,
          parentSpanId: null,
        },
      ],
      caseRevision,
    );
    await setLastSequence(tx, caseId, lastSequence);
    await notifyEvents(tx, caseId);
    return { status: "created", decision };
  });
}

/** Writes nothing; returns the action's prepared revision when its reviews are complete, else null. */
async function prepareActionIfReviewed(
  tx: Tx,
  caseId: string,
  actionId: string,
  now: string,
): Promise<OperationalAction | null> {
  const latest = await tx.query<{ record: OperationalAction }>(
    `select distinct on (entity_id) record from records
     where case_id = $1 and record_type = 'OperationalAction'
     order by entity_id, revision desc`,
    [caseId],
  );
  const actions = new Map(latest.rows.map((row) => [row.record.id, row.record]));
  const action = actions.get(actionId);
  if (action === undefined) {
    return null;
  }
  const decisions = await tx.query<{ record: ReviewDecision }>(
    `select record from (
       select distinct on (entity_id) record from review_records
       where case_id = $1 order by entity_id, revision desc
     ) latest where record ->> 'actionId' = $2`,
    [caseId, actionId],
  );
  return preparedAction(
    action,
    decisions.rows.map((row) => row.record),
    new Map([...actions.values()].map((a) => [a.id, a.status])),
    now,
  );
}

export type PlanReviewOutcome =
  | { status: "created"; review: ReviewDecision }
  | { status: "replayed"; review: ReviewDecision }
  | { status: "idempotency_conflict" }
  | { status: "not_found" };

/**
 * Records a reviewer's plan decision ("approved" or "changes_requested", with an optional note up
 * to 500 characters) on the case's latest Brief and/or OperationalAction in demo mode, keeping
 * externalExecutionEnabled false and sending nothing externally.
 */
export async function recordPlanReviewDecision(
  pool: Pool,
  args: {
    caseId: string;
    ownerScopeId: string;
    request: PlanReviewDecisionRequest;
    now?: Date;
  },
): Promise<PlanReviewOutcome> {
  const { caseId, request } = args;
  const now = (args.now ?? new Date()).toISOString();
  const idempotencyKey = request.idempotencyKey ?? newId("idem");
  const requestHash = sha256Hex(
    canonicalJson({ decision: request.decision, note: request.note ?? null }),
  );
  return inTransaction(pool, async (tx) => {
    const locked = await lockCase(tx, caseId);
    if (locked === null || locked.ownerScopeId !== args.ownerScopeId) {
      return { status: "not_found" };
    }
    if (request.idempotencyKey !== undefined) {
      const prior = await tx.query<{ record: ReviewDecision; request_hash: string }>(
        "select record, request_hash from review_records where case_id = $1 and idempotency_key = $2",
        [caseId, request.idempotencyKey],
      );
      const found = prior.rows[0];
      if (found !== undefined) {
        return found.request_hash === requestHash
          ? { status: "replayed", review: found.record }
          : { status: "idempotency_conflict" };
      }
    }

    const latestRows = await tx.query<{ record_type: string; record: unknown }>(
      `select distinct on (record_type) record_type, record
       from records
       where case_id = $1 and record_type in ('Brief', 'OperationalAction')
       order by record_type, revision desc, entity_id desc`,
      [caseId],
    );
    const latestBrief = latestRows.rows.find((r) => r.record_type === "Brief")?.record as
      Brief | undefined;
    const latestAction = latestRows.rows.find((r) => r.record_type === "OperationalAction")
      ?.record as OperationalAction | undefined;

    const reviewedEntityVersions: EntityVersion[] = [
      ...(latestBrief !== undefined
        ? [{ entityId: latestBrief.id, revision: latestBrief.revision }]
        : []),
      ...(latestAction !== undefined
        ? [{ entityId: latestAction.id, revision: latestAction.revision }]
        : []),
    ];
    if (reviewedEntityVersions.length === 0) {
      reviewedEntityVersions.push({ entityId: caseId, revision: locked.revision });
    }

    const trimmedNote = request.note?.trim() ?? "";
    const comments =
      trimmedNote.length > 0
        ? trimmedNote
        : request.decision === "approved"
          ? "Approved in plan review."
          : "Changes requested in plan review.";

    const review = ReviewDecision.parse({
      recordType: "ReviewDecision",
      id: newId("rev"),
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      actionId: latestAction?.id ?? null,
      reviewedEntityVersions,
      caseRevisionReviewed: locked.revision,
      role: "program_coordination",
      actorId: null,
      authorityStatus: "not_established",
      mode: "demo",
      status: request.decision,
      decisionAt: now,
      conditions: [],
      comments,
      stale: false,
    });

    await tx.query(
      `insert into review_records (case_id, entity_id, revision, idempotency_key, request_hash, record)
       values ($1, $2, 1, $3, $4, $5)`,
      [caseId, review.id, idempotencyKey, requestHash, JSON.stringify(review)],
    );

    let caseRevision = locked.revision;
    const updatedEntityIds: string[] = [review.id];
    if (latestBrief !== undefined || latestAction !== undefined) {
      caseRevision = locked.revision + 1;
      if (latestBrief !== undefined) {
        const updatedBrief = Brief.parse({
          ...latestBrief,
          revision: latestBrief.revision + 1,
          updatedAt: now,
          status: request.decision === "approved" ? "prepared" : "ready_for_review",
          reviewDecisionIds: [...new Set([...latestBrief.reviewDecisionIds, review.id])],
        });
        await tx.query(
          `insert into records (case_id, entity_id, revision, record_type, record, commit_id, case_revision)
           values ($1, $2, $3, 'Brief', $4, null, $5)`,
          [
            caseId,
            updatedBrief.id,
            updatedBrief.revision,
            JSON.stringify(updatedBrief),
            caseRevision,
          ],
        );
        updatedEntityIds.push(updatedBrief.id);
      }
      if (latestAction !== undefined) {
        const updatedAction = OperationalAction.parse({
          ...latestAction,
          revision: latestAction.revision + 1,
          updatedAt: now,
          externalExecutionEnabled: false,
          reviewDecisionIds: [...new Set([...latestAction.reviewDecisionIds, review.id])],
        });
        await tx.query(
          `insert into records (case_id, entity_id, revision, record_type, record, commit_id, case_revision)
           values ($1, $2, $3, 'OperationalAction', $4, null, $5)`,
          [
            caseId,
            updatedAction.id,
            updatedAction.revision,
            JSON.stringify(updatedAction),
            caseRevision,
          ],
        );
        updatedEntityIds.push(updatedAction.id);
      }
      const caseRecord = EnvironmentalCase.parse({
        ...(locked.record as EnvironmentalCase),
        revision: caseRevision,
        updatedAt: now,
      });
      await tx.query(
        "update cases set revision = $2, record = $3, updated_at = now() where id = $1",
        [caseId, caseRevision, JSON.stringify(caseRecord)],
      );
      await tx.query("insert into case_revisions (case_id, revision, record) values ($1, $2, $3)", [
        caseId,
        caseRevision,
        JSON.stringify(caseRecord),
      ]);
    }

    const { lastSequence } = await insertEvents(
      tx,
      { ...locked, revision: caseRevision },
      [
        {
          occurredAt: now,
          kind: "review.recorded",
          commandId: null,
          taskId: null,
          entityIds: updatedEntityIds,
          message: eventMessages.reviewRecorded(review.role, request.decision),
          dedupeKey: `review.recorded:${review.id}`,
          resultStatus: null,
          tool: null,
          usage: null,
          validation: null,
          spanId: null,
          parentSpanId: null,
        },
      ],
      caseRevision,
    );
    await setLastSequence(tx, caseId, lastSequence);
    await notifyEvents(tx, caseId);
    return { status: "created", review };
  });
}
