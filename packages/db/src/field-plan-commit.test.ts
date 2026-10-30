import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BranchMerge, Evidence, ExplanationBranch, Hypothesis } from "@siterra/contracts";
import { composeInstruments } from "@siterra/domain";
import { analysisConfigFor } from "@siterra/domain/cases";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyCommit } from "./commit.ts";
import { readCaseSeed } from "./case-seed.ts";
import type { Pool } from "./client.ts";
import { readInstruments } from "./instruments.ts";
import { loadSeedCase } from "./seed.ts";
import { readSnapshot } from "./snapshot.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { exampleCommit } from "./test-records.ts";

// The branch task writes the field plan spec in the commit that writes the merge. This commits the
// records of the recorded live run of 28 Oct 2026 (siterra_live_branches) with the spec the
// composer returns for them, and reads the listing back.
const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const bundlesDir = `${repoDir}data/bundles`;
const owner = "seed";
const caseId = "case_aitbouguemez";
const recorded = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../contracts/fixtures/recorded-live-run-2026-10-28-branch-merge.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { records: Record<string, unknown[]> };
const parsed = {
  branches: (recorded.records["explanationBranchRecords"] ?? []).map((r) =>
    ExplanationBranch.parse(r),
  ),
  merges: (recorded.records["branchMergeRecords"] ?? []).map((r) => BranchMerge.parse(r)),
  hypotheses: (recorded.records["hypothesisRecords"] ?? []).map((r) => Hypothesis.parse(r)),
  evidence: (recorded.records["evidenceRecords"] ?? []).map((r) => Evidence.parse(r)),
};

let db: TestDatabase;
let pool: Pool;
let seeded: NonNullable<ReturnType<typeof readCaseSeed>["seed"]>;

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
  seeded = seed;
  await loadSeedCase(pool, seed, owner);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe("a merge committed with its field plan spec opens the field plan from the case", () => {
  it("lists inst_field_plan_valley once the commit applies, and no longer reports the rule as blocked", async () => {
    const before = await readInstruments(pool, { caseId, ownerScopeId: owner, bundlesDir });
    expect(before?.blocked?.map((b) => b.ruleId)).toEqual(["field_plan_valley"]);
    expect(before?.instruments.map((i) => i.spec.id)).not.toContain("inst_field_plan_valley");

    const config = analysisConfigFor(caseId);
    if (config === null) throw new Error("no configuration");
    const result = composeInstruments({
      caseId,
      config: {
        ...config,
        instruments: config.instruments?.filter((r) => r.from === "branch_merge"),
      },
      openExplanationIds: config.explanations.map((e) => e.id),
      geoSelectionId: seeded.geoSelections[0]?.id ?? "",
      geoSelections: seeded.geoSelections,
      dataBundles: [],
      contextFeatures: [],
      measurements: seeded.bundles.flatMap((b) => b.measurements),
      evidence: [...seeded.evidence, ...parsed.evidence],
      branchMerges: parsed.merges,
      hypotheses: parsed.hypotheses,
      hasAsset: () => true,
      now: "2026-10-30T05:00:00Z",
    });
    const spec = result.specs.find((s) => s.id === "inst_field_plan_valley");
    if (spec === undefined) throw new Error(`not composed: ${JSON.stringify(result.blocked)}`);

    const snapshot = await readSnapshot(pool, caseId, owner);
    if (snapshot === null) throw new Error("seed not loaded");
    // The recorded branches are at revision 2, so their revision 1 (the predictions) goes in first.
    const first = await applyCommit(
      pool,
      exampleCommit(snapshot.case, {
        id: "commit_example_predictions",
        expected: snapshot.case.revision,
        upserts: [...parsed.evidence, ...parsed.branches.map((b) => ({ ...b, revision: 1 }))],
      }),
    );
    expect(first.status).toBe("committed");
    const afterFirst = await readSnapshot(pool, caseId, owner);
    if (afterFirst === null) throw new Error("seed not loaded");
    const outcome = await applyCommit(
      pool,
      exampleCommit(afterFirst.case, {
        id: "commit_example_field_plan",
        expected: afterFirst.case.revision,
        upserts: [...parsed.branches, ...parsed.merges, ...parsed.hypotheses, spec],
      }),
    );
    expect(outcome.status).toBe("committed");

    const after = await readInstruments(pool, { caseId, ownerScopeId: owner, bundlesDir });
    expect(after?.instruments.map((i) => i.spec.id).sort()).toEqual([
      "inst_cross_section_valley",
      "inst_field_plan_valley",
      "inst_layer_stack_valley",
      "inst_pixel_anatomy_valley",
      "inst_rainfall_scatter_valley",
    ]);
    expect(after?.blocked ?? []).toEqual([]);
    const listed = after?.instruments.find((i) => i.spec.id === "inst_field_plan_valley");
    expect(listed?.spec.parameters).toMatchObject({
      kind: "field_plan",
      branchMergeId: "merge_35d821154a3396cb0178d137b087040b",
    });
  });
});
