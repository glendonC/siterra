import { entityId } from "@siterra/contracts";
import { readTrace } from "@siterra/db";
import { database } from "../../../database.ts";
import { json, problem } from "../../../problem.ts";
import { requestOwner } from "../../../session.ts";

export const dynamic = "force-dynamic";

/** GET /api/cases/:id/trace?commandId=: the command's spans and events, allowlisted attributes only. */
export async function GET(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const { caseId } = await context.params;
  const owner = await requestOwner(request);
  if (owner === null) {
    return problem(401, "unauthenticated");
  }
  const commandId = entityId.safeParse(new URL(request.url).searchParams.get("commandId"));
  if (!commandId.success) {
    return problem(400, "invalid_request", "commandId names a command of this case");
  }
  const trace = await readTrace(database(), {
    caseId,
    commandId: commandId.data,
    ownerScopeId: owner,
  });
  return trace === null ? problem(404, "not_found") : json(trace);
}
