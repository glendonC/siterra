import { CommandRequest } from "@siterra/contracts";
import { submitCommand } from "@siterra/db";
import { database } from "../../../database.ts";
import { json, problem, schemaIssues } from "../../../problem.ts";
import { fromApplicationOrigin, requestOwner } from "../../../session.ts";

export const dynamic = "force-dynamic";

/**
 * POST /api/cases/:id/commands: 202 with the new Command, 200 with the stored one for a repeated
 * idempotency key, 422 when that key comes with a different body.
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
  const parsed = CommandRequest.safeParse(body);
  if (!parsed.success) {
    return problem(400, "invalid_request", undefined, schemaIssues(parsed.error));
  }
  const outcome = await submitCommand(database(), {
    caseId,
    ownerScopeId: owner,
    request: parsed.data,
  });
  switch (outcome.status) {
    case "created":
      return json(outcome.command, 202);
    case "existing":
      return json(outcome.command, 200);
    case "key_reused":
      return problem(422, "idempotency_key_reused");
    case "revision_ahead":
      return problem(400, "invalid_request", `The case is at revision ${outcome.currentRevision}`, [
        {
          code: "stale_reference",
          path: "/expectedCaseRevision",
          message: "Revision is ahead of the case",
        },
      ]);
    case "not_found":
      return problem(404, "not_found");
  }
}
