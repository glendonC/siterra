import { requestCancel } from "@siterra/db";
import { database } from "../../../database.ts";
import { json, problem } from "../../../problem.ts";
import { fromApplicationOrigin, requestOwner } from "../../../session.ts";

export const dynamic = "force-dynamic";

/** POST /api/commands/:id/cancel: 202 while the command can still stop, 409 once it is terminal. */
export async function POST(
  request: Request,
  context: { params: Promise<{ commandId: string }> },
): Promise<Response> {
  const { commandId } = await context.params;
  const owner = fromApplicationOrigin(request) ? await requestOwner(request) : null;
  if (owner === null) {
    return problem(401, "unauthenticated");
  }
  const outcome = await requestCancel(database(), { commandId, ownerScopeId: owner });
  switch (outcome.status) {
    case "requested":
      return json(outcome.command, 202);
    case "terminal":
      return problem(409, "command_not_cancellable");
    case "not_found":
      return problem(404, "not_found");
  }
}
