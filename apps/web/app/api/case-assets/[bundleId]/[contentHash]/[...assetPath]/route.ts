import { readFileSync } from "node:fs";
import { findBundlesDir, ownsBundle, resolveCaseAsset } from "@siterra/db";
import { parseByteRange } from "../../../../byte-range.ts";
import { database } from "../../../../database.ts";
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
  const headers = {
    "Content-Type": file.contentType,
    // The browser keeps the stated type and never sniffs a bundle file as script or HTML.
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    ETag: `"${file.checksum}"`,
    "Cache-Control": "private, max-age=31536000, immutable",
  };
  const range = parseByteRange(request.headers.get("range"), file.size);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${file.size}` },
    });
  }
  const bytes = readFileSync(file.absolutePath);
  if (range === null) {
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { ...headers, "Content-Length": String(file.size) },
    });
  }
  const part = bytes.subarray(range.start, range.end + 1);
  return new Response(new Uint8Array(part), {
    status: 206,
    headers: {
      ...headers,
      "Content-Length": String(part.length),
      "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
    },
  });
}
