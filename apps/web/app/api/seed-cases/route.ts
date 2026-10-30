import { listSeedCases } from "@siterra/db";
import { database } from "../database.ts";
import { demoConfig } from "../demo-config.ts";
import { json } from "../problem.ts";

export const dynamic = "force-dynamic";

/**
 * GET /api/seed-cases: the seed cases a demo session can start, each with its place, question and
 * outlet read from its own records, and the one a session starts on when none is chosen. Public and
 * never cached: it needs no session, since the visitor picks a case before one exists.
 */
export async function GET(): Promise<Response> {
  const config = demoConfig();
  const cases = await listSeedCases(database(), config.seedOwnerScopeId);
  return json({
    defaultCaseId: cases.some((c) => c.caseId === config.seedCaseId) ? config.seedCaseId : null,
    cases,
  });
}
