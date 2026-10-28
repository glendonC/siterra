import { readUsage } from "@siterra/db";
import { database } from "../../../database.ts";
import { json, problem } from "../../../problem.ts";
import { requestOwner } from "../../../session.ts";

export const dynamic = "force-dynamic";

/**
 * GET /api/cases/:id/usage: the case's model calls and tokens per route, provider and model, with
 * estimated live cost; replayed calls are listed apart and cost nothing (TR-06).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const { caseId } = await context.params;
  const owner = await requestOwner(request);
  if (owner === null) {
    return problem(401, "unauthenticated");
  }
  const usage = await readUsage(database(), { caseId, ownerScopeId: owner });
  return usage === null ? problem(404, "not_found") : json(usage);
}
