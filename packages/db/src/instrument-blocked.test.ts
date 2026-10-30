import { fileURLToPath } from "node:url";
import { InstrumentListing } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyCommit } from "./commit.ts";
import { readCaseSeed } from "./case-seed.ts";
import type { Pool } from "./client.ts";
import { readInstruments } from "./instruments.ts";
import { loadSeedCase } from "./seed.ts";
import { readSnapshot } from "./snapshot.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { exampleCommit, exampleEvidence } from "./test-records.ts";

// The rules the composer cannot open reach the read API in the composer's own words, so the
// interface shows the record's reason instead of deriving one.
const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const bundlesDir = `${repoDir}data/bundles`;
const owner = "seed";
const caseId = "case_aitbouguemez";

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

describe("the instrument listing names the rules the composer could not open", () => {
  it("gives the field plan rule and its reasons in the composer's words, and parses as its contract", async () => {
    const listing = await readInstruments(pool, { caseId, ownerScopeId: owner, bundlesDir });
    expect(InstrumentListing.safeParse(listing).success).toBe(true);
    expect(listing?.blocked).toEqual([
      {
        ruleId: "field_plan_valley",
        kind: "field_plan",
        reasons: [
          "The case holds no branch merge with a field plan",
          "The case holds nothing for the plan to cite: no hypothesis of the merge rests on a record of the case and no field requirement is accepted",
        ],
      },
    ]);
    expect(listing?.notOpened).toEqual([]);
    expect(listing?.instruments.map((i) => i.spec.id).sort()).toEqual([
      "inst_cross_section_valley",
      "inst_layer_stack_valley",
      "inst_pixel_anatomy_valley",
      "inst_rainfall_scatter_valley",
    ]);
  });

  it("is computed for the current revision only, not for an earlier one", async () => {
    const snapshot = await readSnapshot(pool, caseId, owner);
    if (snapshot === null) throw new Error("seed not loaded");
    const revision = snapshot.case.revision;
    await applyCommit(
      pool,
      exampleCommit(snapshot.case, {
        id: "commit_example_blocked_1",
        expected: revision,
        upserts: [exampleEvidence(caseId, "ev_example_blocked")],
      }),
    );
    const earlier = await readInstruments(pool, {
      caseId,
      ownerScopeId: owner,
      bundlesDir,
      revision,
    });
    const current = await readInstruments(pool, { caseId, ownerScopeId: owner, bundlesDir });
    expect(earlier).not.toBeNull();
    expect(earlier).not.toHaveProperty("blocked");
    expect(earlier).not.toHaveProperty("notOpened");
    expect(current?.caseRevision).toBe(revision + 1);
    expect(current?.blocked?.map((b) => b.ruleId)).toEqual(["field_plan_valley"]);
  });

  it("names an instrument whose bundle is missing from the server's folder as blocked", async () => {
    const listing = await readInstruments(pool, { caseId, ownerScopeId: owner, bundlesDir: null });
    expect(listing?.blocked?.map((b) => b.ruleId).sort()).toEqual([
      "cross_section_valley",
      "field_plan_valley",
      "layer_stack_valley",
      "pixel_anatomy_valley",
      "rainfall_scatter_valley",
    ]);
    expect(
      listing?.blocked?.find((b) => b.ruleId === "rainfall_scatter_valley")?.reasons[0],
    ).toContain("lists no asset");
  });
});
