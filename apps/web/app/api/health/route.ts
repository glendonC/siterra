import { readHealth } from "@siterra/db/health";
import { database } from "../database.ts";

export const dynamic = "force-dynamic";

/**
 * GET /api/health: the deployment's health (packages/db health.ts), public and never cached. 200 while
 * the web service can serve (ok or degraded: the worker is missing, stale or behind); 503 when the
 * database is unreachable or a migration is pending, so a host's health check holds a deploy back.
 */
export async function GET(): Promise<Response> {
  const health = await readHealth(database());
  return Response.json(health, {
    status: health.status === "unavailable" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
