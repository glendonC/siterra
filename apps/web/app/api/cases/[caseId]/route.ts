import { readSnapshot } from "@siterra/db";
import { database } from "../../database.ts";
import { json, problem } from "../../problem.ts";
import { requestOwner } from "../../session.ts";

export const dynamic = "force-dynamic";

/** GET /api/cases/:id: case, records and lastSequence from one transaction. */
export async function GET(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const { caseId } = await context.params;
  const owner = await requestOwner(request);
  if (owner === null) {
    return problem(401, "unauthenticated");
  }
  const snapshot = await readSnapshot(database(), caseId, owner);
  return snapshot === null ? problem(404, "not_found") : json(snapshot);
}
