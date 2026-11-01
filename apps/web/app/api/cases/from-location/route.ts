import { z } from "zod";
import { ingestLocationCase } from "../../../../lib/live-place/ingest.ts";
import { database } from "../../database.ts";
import { demoConfig } from "../../demo-config.ts";
import { json, problem, schemaIssues } from "../../problem.ts";

export const dynamic = "force-dynamic";

const fromLocationBodySchema = z.object({
  lon: z.number().finite().min(-180).max(180),
  lat: z.number().finite().min(-90).max(90),
  placeName: z.string().trim().max(120).optional(),
  regionName: z.string().trim().max(160).optional(),
  question: z.string().trim().max(500).optional(),
});

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
    return problem(400, "invalid_request", "Invalid coordinate or place payload", schemaIssues(parsed.error));
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
