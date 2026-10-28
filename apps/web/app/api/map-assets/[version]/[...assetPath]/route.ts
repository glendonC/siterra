import { resolveMapAsset } from "@siterra/db";
import { fileResponse } from "../../../file-response.ts";
import { mapDir } from "../../../map-dir.ts";
import { problem } from "../../../problem.ts";

export const dynamic = "force-dynamic";

/**
 * GET /api/map-assets/:version/:path: a file the data/map manifest lists, for any visitor (public
 * display assets); immutable for its path, HTTP Range answered with 206.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ version: string; assetPath: string[] }> },
): Promise<Response> {
  const { version, assetPath } = await context.params;
  const dir = mapDir();
  const file =
    dir === null ? null : resolveMapAsset(dir, { version, assetPath: assetPath.join("/") });
  if (file === null) {
    return problem(404, "not_found");
  }
  return fileResponse(request, file, {
    "Content-Type": file.contentType,
    ETag: `"${file.sha256}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
  });
}
