import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { findCaseBundleAsset } from "@siterra/db";
import { bundlesDir } from "../../../../../../bundles-dir.ts";
import { database } from "../../../../../../database.ts";
import { fileResponse } from "../../../../../../file-response.ts";
import { problem } from "../../../../../../problem.ts";
import { requestOwner } from "../../../../../../session.ts";
import { type CachedPlaceBundle, placeCachePath } from "../../../../../../../../lib/live-place/ingest.ts";

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
    if (caseId.startsWith("case_loc_") && assetKey === "occurrences") {
      const cachePath = placeCachePath(caseId);
      if (existsSync(cachePath)) {
        try {
          const cached = JSON.parse(readFileSync(cachePath, "utf8")) as CachedPlaceBundle;
          if (cached.occurrences) {
            const body = Buffer.from(JSON.stringify(cached.occurrences), "utf8");
            const sha = createHash("sha256").update(body).digest("hex");
            return new Response(body, {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                ETag: `"sha256:${sha}"`,
                "Cache-Control": "private, no-cache",
              },
            });
          }
        } catch {
          // Fall through to 404
        }
      }
    }
    return problem(404, "not_found");
  }
  return fileResponse(request, file, {
    "Content-Type": file.contentType,
    ETag: `"${file.checksum}"`,
    "Cache-Control": "private, no-cache",
  });
}
