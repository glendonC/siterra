import { findBundlesDir, ownsBundle, resolveCaseAsset } from "@siterra/db";
import { database } from "../../../../database.ts";
import { fileResponse } from "../../../../file-response.ts";
import { problem } from "../../../../problem.ts";
import { requestOwner } from "../../../../session.ts";

export const dynamic = "force-dynamic";

function bundlesDir(): string | null {
  const configured = process.env["SITERRA_BUNDLES_DIR"];
  return configured !== undefined && configured !== "" ? configured : findBundlesDir(process.cwd());
}

/**
 * GET /api/case-assets/:bundleId/:contentHash/:path: a file a bundle's manifest lists, for a session
 * whose cases hold that bundle with that content hash; HTTP Range answered with 206.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ bundleId: string; contentHash: string; assetPath: string[] }> },
): Promise<Response> {
  const { bundleId, contentHash, assetPath } = await context.params;
  const owner = await requestOwner(request);
  if (owner === null) {
    return problem(401, "unauthenticated");
  }
  const dir = bundlesDir();
  if (
    dir === null ||
    !(await ownsBundle(database(), { ownerScopeId: owner, bundleId, contentHash }))
  ) {
    return problem(404, "not_found");
  }
  const file = resolveCaseAsset(dir, { bundleId, contentHash, assetPath: assetPath.join("/") });
  if (file === null) {
    return problem(404, "not_found");
  }
  return fileResponse(request, file, {
    "Content-Type": file.contentType,
    ETag: `"${file.checksum}"`,
    "Cache-Control": "private, max-age=31536000, immutable",
  });
}
