import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCaseSeed } from "./case-seed.ts";
import { analysisCaseIdOf } from "./case-origin.ts";
import type { Pool } from "./client.ts";
import { startDemoSession } from "./demo-sessions.ts";
import { readInstruments } from "./instruments.ts";
import { loadSeedCase } from "./seed.ts";
import { sessionInfo } from "./sessions.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";

// A visitor works on a demo copy of the seed case under another case ID. The case configuration
// belongs to the seed, so everything that reads one for a stored case resolves it through the
// copy's origin, or the copy reads as a case with no configuration.
const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const bundlesDir = `${repoDir}data/bundles`;
const owner = "seed";
const seedId = "case_aitbouguemez";

let db: TestDatabase;
let pool: Pool;

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  const { seed, issues } = readCaseSeed({
    repoDir,
    mode: "concept",
    ownerScopeId: owner,
    importedAt: "2026-10-27T20:00:00Z",
  });
  if (seed === null || issues.length > 0) throw new Error("The seed did not load cleanly");
  await loadSeedCase(pool, seed, owner);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

async function demoCopy(): Promise<{ caseId: string; ownerScopeId: string }> {
  const outcome = await startDemoSession(pool, {
    seedCaseId: seedId,
    seedOwnerScopeId: owner,
    ttlSeconds: 3600,
    maxActiveSessions: 100,
    maxPerMinute: 1000,
  });
  if (outcome.status !== "created") throw new Error(`demo copy: ${outcome.status}`);
  const session = await sessionInfo(pool, outcome.token);
  return { caseId: outcome.caseId, ownerScopeId: session?.ownerScopeId ?? "" };
}

describe("a demo copy resolves the seed's case configuration", () => {
  it("names the seed as the configuration case of its copy, and each other case as itself", async () => {
    const copy = await demoCopy();
    expect(copy.caseId).not.toBe(seedId);
    expect(await analysisCaseIdOf(pool, copy.caseId)).toBe(seedId);
    expect(await analysisCaseIdOf(pool, seedId)).toBe(seedId);
    expect(await analysisCaseIdOf(pool, "case_unknown")).toBe("case_unknown");
  });

  it("lists the same instruments and the same blocked rules on the copy as on the seed", async () => {
    const copy = await demoCopy();
    const seedListing = await readInstruments(pool, {
      caseId: seedId,
      ownerScopeId: owner,
      bundlesDir,
    });
    const copyListing = await readInstruments(pool, {
      caseId: copy.caseId,
      ownerScopeId: copy.ownerScopeId,
      bundlesDir,
    });
    expect(copyListing?.caseId).toBe(copy.caseId);
    expect(copyListing?.blocked).toEqual(seedListing?.blocked);
    expect(copyListing?.blocked?.map((b) => b.ruleId)).toEqual(["field_plan_valley"]);
    expect(copyListing?.notOpened).toEqual([]);
    expect(copyListing?.instruments.map((i) => i.spec.id).sort()).toEqual(
      seedListing?.instruments.map((i) => i.spec.id).sort(),
    );
  });
});
