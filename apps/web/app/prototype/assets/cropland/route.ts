import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findBundlesDir } from "@siterra/db";

/**
 * GET /prototype/assets/cropland: the departure bundle's mapped cropland and buildings (ESA WorldCover 2021),
 * for the /prototype screen only. Read only.
 */
export function GET(): Response {
  const dir = findBundlesDir(process.cwd());
  const file =
    dir === null ? null : join(dir, "bundle_ndvi_departure_ait_bouguemez", "excluded-land.geojson");
  if (file === null || !existsSync(file)) return new Response(null, { status: 404 });
  return new Response(readFileSync(file), {
    headers: { "Content-Type": "application/geo+json", "Cache-Control": "public, max-age=3600" },
  });
}
