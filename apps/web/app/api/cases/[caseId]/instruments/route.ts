import { readInstruments } from "@siterra/db";
import { bundlesDir } from "../../../bundles-dir.ts";
import { database } from "../../../database.ts";
import { json, problem } from "../../../problem.ts";
import { requestOwner } from "../../../session.ts";

export const dynamic = "force-dynamic";

/**
 * GET /api/cases/:id/instruments[?revision=N]: the instrument specs of the case as of a case revision
 * (the current one by default), the components that bind them, and each bundle asset they name
 * resolved against its bundle (available with its immutable URL and checksum, or why not). Read only.
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
  const asked = new URL(request.url).searchParams.get("revision");
  if (asked !== null && !/^[1-9][0-9]{0,8}$/.test(asked)) {
    return problem(400, "invalid_request", "revision is a whole number of 1 or more");
  }
  const listing = await readInstruments(database(), {
    caseId,
    ownerScopeId: owner,
    bundlesDir: bundlesDir(),
    revision: asked === null ? undefined : Number(asked),
  });
  return listing === null ? problem(404, "not_found") : json(listing);
}
