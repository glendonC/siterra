import { findCaseBundleAsset } from "@siterra/db";
import { bundlesDir } from "../../../../../../bundles-dir.ts";
import { database } from "../../../../../../database.ts";
import { fileResponse } from "../../../../../../file-response.ts";
import { problem } from "../../../../../../problem.ts";
import { requestOwner } from "../../../../../../session.ts";

export const dynamic = "force-dynamic";

/**
 * GET /api/cases/:id/bundles/:bundleId/assets/:assetKey: the file the bundle's collection lists under
 * that key, for the revision of the bundle the case holds, served only when its bytes match the
 * checksum the collection lists. The key names whatever revision the case holds now, so the answer is
 * revalidated, not cached as immutable (the hash-addressed case-assets route is the immutable one).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ caseId: string; bundleId: string; assetKey: string }> },
): Promise<Response> {
  const { caseId, bundleId, assetKey } = await context.params;
  const owner = await requestOwner(request);
  if (owner === null) {
    return problem(401, "unauthenticated");
  }
  const file = await findCaseBundleAsset(database(), {
    caseId,
    ownerScopeId: owner,
    bundleId,
    assetKey,
    bundlesDir: bundlesDir(),
  });
  if (file === null) {
    return problem(404, "not_found");
  }
  return fileResponse(request, file, {
    "Content-Type": file.contentType,
    ETag: `"${file.checksum}"`,
    "Cache-Control": "private, no-cache",
  });
}
