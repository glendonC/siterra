import { PlanReviewDecisionRequest } from "@siterra/contracts";
import { recordPlanReviewDecision } from "@siterra/db";
import { database } from "../../../database.ts";
import { json, problem, schemaIssues } from "../../../problem.ts";
import { fromApplicationOrigin, requestOwner } from "../../../session.ts";

export const dynamic = "force-dynamic";

/**
 * POST /api/cases/:id/review-decisions: records a reviewer's plan decision ("approved" or
 * "changes_requested", with an optional note up to 500 characters) on the case's latest Brief and
 * OperationalAction in demo mode, keeping externalExecutionEnabled false and sending nothing
 * externally.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const { caseId } = await context.params;
  const owner = fromApplicationOrigin(request) ? await requestOwner(request) : null;
  if (owner === null) {
    return problem(401, "unauthenticated");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "invalid_request", "The body is not JSON");
  }
  const parsed = PlanReviewDecisionRequest.safeParse(body);
  if (!parsed.success) {
    return problem(400, "invalid_request", undefined, schemaIssues(parsed.error));
  }
  const outcome = await recordPlanReviewDecision(database(), {
    caseId,
    ownerScopeId: owner,
    request: parsed.data,
  });
  switch (outcome.status) {
    case "created":
      return json(outcome.review, 201);
    case "replayed":
      return json(outcome.review, 200);
    case "idempotency_conflict":
      return problem(422, "idempotency_key_reused");
    case "not_found":
      return problem(404, "not_found");
  }
}
