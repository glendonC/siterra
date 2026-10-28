// Role-specific review decisions (review-and-authority.md), the only way a ReviewDecision is
// written: a person with a session records one role's decision on exact entity versions at the
// current case revision. Task commits cannot write one (commit.ts, review_not_permitted).
import {
  type EntityVersion,
  ReviewDecision,
  type ReviewRequest,
  type ValidationResult,
} from "@siterra/contracts";
import { canonicalJson, eventMessages, newId, sha256Hex } from "@siterra/domain";
import { type Pool, inTransaction, lockCase, notifyEvents } from "./client.ts";
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
    const { lastSequence } = await insertEvents(
      tx,
      locked,
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
      locked.revision,
    );
    await setLastSequence(tx, caseId, lastSequence);
    await notifyEvents(tx, caseId);
    return { status: "created", decision };
  });
}
