import { currentMapVersion } from "@siterra/db";
import { mapDir } from "../map-dir.ts";
import { problem } from "../problem.ts";

export const dynamic = "force-dynamic";

/**
 * GET /api/map-assets: 307 to the current manifest, /api/map-assets/<version>/manifest.json, so a
 * client resolves the manifest's relative paths against the versioned URL it lands on.
 */
export function GET(): Response {
  const dir = mapDir();
  const version = dir === null ? null : currentMapVersion(dir);
  if (version === null) {
    return problem(404, "not_found");
  }
  return new Response(null, {
    status: 307,
    headers: { Location: `/api/map-assets/${version}/manifest.json`, "Cache-Control": "no-cache" },
  });
}
