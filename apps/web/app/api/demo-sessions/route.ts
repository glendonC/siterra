import { listSeedCases, startDemoSession } from "@siterra/db";
import { z } from "zod";
import { database } from "../database.ts";
import { demoConfig } from "../demo-config.ts";
import { problem, schemaIssues } from "../problem.ts";
import { fromApplicationOrigin, sessionCookie } from "../session.ts";

export const dynamic = "force-dynamic";

const DemoSessionRequest = z.strictObject({ seedCaseId: z.string().min(1).optional() });

/**
 * POST /api/demo-sessions: a session on an isolated, expiring copy of a seed case. The body is
 * optional; { seedCaseId } picks a case from GET /api/seed-cases, and with none the configured
 * default is copied.
 */
export async function POST(request: Request): Promise<Response> {
  if (!fromApplicationOrigin(request)) {
    return problem(401, "unauthenticated");
  }
  const text = await request.text();
  let body: unknown = {};
  if (text !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      return problem(400, "invalid_request", "The body is not JSON");
    }
  }
  const parsed = DemoSessionRequest.safeParse(body);
  if (!parsed.success) {
    return problem(
      400,
      "invalid_request",
      "The body is not a valid request",
      schemaIssues(parsed.error),
    );
  }
  const config = demoConfig();
  if (parsed.data.seedCaseId !== undefined) {
    const listed = await listSeedCases(database(), config.seedOwnerScopeId);
    if (!listed.some((c) => c.caseId === parsed.data.seedCaseId)) {
      return problem(400, "invalid_request", "That seed case is not available");
    }
  }
  const outcome = await startDemoSession(database(), {
    ...config,
    seedCaseId: parsed.data.seedCaseId ?? config.seedCaseId,
  });
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
