import { startDemoSession } from "@siterra/db";
import { database } from "../database.ts";
import { demoConfig } from "../demo-config.ts";
import { problem } from "../problem.ts";
import { fromApplicationOrigin, sessionCookie } from "../session.ts";

export const dynamic = "force-dynamic";

/** POST /api/demo-sessions: a session on an isolated, expiring copy of the seed case. */
export async function POST(request: Request): Promise<Response> {
  if (!fromApplicationOrigin(request)) {
    return problem(401, "unauthenticated");
  }
  const config = demoConfig();
  const outcome = await startDemoSession(database(), config);
  switch (outcome.status) {
    case "created":
      return Response.json(
        { caseId: outcome.caseId, expiresAt: outcome.expiresAt, commandQuota: config.commandQuota },
        {
          status: 201,
          headers: {
            "Set-Cookie": sessionCookie(outcome.token, config.ttlSeconds),
            "Cache-Control": "no-store",
          },
        },
      );
    case "quota_exhausted":
      return problem(
        429,
        "quota_exhausted",
        outcome.reason === "active_sessions"
          ? "Too many demo sessions are active; try again later"
          : "Too many demo sessions were started in the last minute; try again shortly",
      );
    case "seed_missing":
      return problem(500, "internal_error", "The seed case is not loaded");
  }
}
