import { ReviewRequest } from "@siterra/contracts";
import { recordReview } from "@siterra/db";
import { database } from "../../../database.ts";
import { json, problem, schemaIssues } from "../../../problem.ts";
import { fromApplicationOrigin, requestOwner } from "../../../session.ts";

export const dynamic = "force-dynamic";

/**
 * POST /api/cases/:id/reviews: 201 with the new ReviewDecision, 200 for a repeated idempotency key,
 * 409 when a reviewed version or the case revision is no longer current, 422 when the role cannot
 * record that decision in that mode or the key comes with another body.
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
  const parsed = ReviewRequest.safeParse(body);
  if (!parsed.success) {
    return problem(400, "invalid_request", undefined, schemaIssues(parsed.error));
  }
  const outcome = await recordReview(database(), {
    caseId,
    ownerScopeId: owner,
    request: parsed.data,
  });
  switch (outcome.status) {
    case "created":
      return json(outcome.decision, 201);
    case "existing":
      return json(outcome.decision, 200);
    case "key_reused":
      return problem(422, "idempotency_key_reused");
    case "not_permitted":
      return problem(422, "decision_not_permitted", outcome.reason, [
        { code: "authority", path: "/decision", message: outcome.reason },
      ]);
    case "stale":
      return problem(
        409,
        "stale_versions",
        "Case changed; review the current version",
        outcome.issues,
      );
    case "invalid":
      return problem(400, "invalid_request", undefined, outcome.issues);
    case "not_found":
      return problem(404, "not_found");
  }
}
