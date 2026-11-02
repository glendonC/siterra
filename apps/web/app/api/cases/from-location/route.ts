import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { surfaceOfLand, type LandGrid } from "../../../../components/journey/globe-choice.ts";
import { ingestLocationCase } from "../../../../lib/live-place/ingest.ts";
import { database } from "../../database.ts";
import { demoConfig } from "../../demo-config.ts";
import { mapDir } from "../../map-dir.ts";
import { json, problem, schemaIssues } from "../../problem.ts";

export const dynamic = "force-dynamic";

const fromLocationBodySchema = z.object({
  lon: z.number().finite().min(-180).max(180),
  lat: z.number().finite().min(-90).max(90),
  placeName: z.string().trim().max(120).optional(),
  regionName: z.string().trim().max(160).optional(),
  question: z.string().trim().max(500).optional(),
});

let landGrid: LandGrid | null | undefined;

/** The globe's land share grid from the map folder, read once; null when the folder or file is missing. */
function worldLand(): LandGrid | null {
  if (landGrid !== undefined) return landGrid;
  landGrid = null;
  try {
    const dir = mapDir();
    if (!dir) return null;
    const globe = join(dir, "globe");
    for (const name of readdirSync(globe)) {
      const m = /^dots-land-.*-(\d+)x(\d+)\.uint8\.bin\.gz$/.exec(name);
      if (!m) continue;
      const w = Number(m[1]);
      const h = Number(m[2]);
      const data = new Uint8Array(gunzipSync(readFileSync(join(globe, name))));
      if (data.length === w * h) landGrid = { w, h, data };
      break;
    }
  } catch {
    landGrid = null;
  }
  return landGrid;
}

/**
 * POST /api/cases/from-location: ingests any coordinate on Earth into a schema-validated
 * EnvironmentalCase in Postgres (with elevation grid, 25-year precipitation/NDVI series, and
 * OpenAlex literature sources) and writes its 64x64 3D terrain mesh to /tmp/siterra-terrain-<caseId>.json.
 */
export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return problem(400, "invalid_request", "Request body must be valid JSON");
  }

  const parsed = fromLocationBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return problem(
      400,
      "invalid_request",
      "Invalid coordinate or place payload",
      schemaIssues(parsed.error),
    );
  }

  // open water gets no case: no land share anywhere in the box a case would span (the globe refuses it too)
  if (surfaceOfLand(worldLand(), parsed.data.lon, parsed.data.lat) === "water") {
    return problem(
      422,
      "invalid_request",
      "This point is open water, with no land within 10 km. Pick a point on land or a coast; no case was built.",
    );
  }

  try {
    const config = demoConfig();
    const outcome = await ingestLocationCase(database(), parsed.data, config.seedOwnerScopeId);
    return json(outcome, outcome.created ? 201 : 200);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Failed to ingest location case";
    return problem(500, "internal_error", detail);
  }
}
