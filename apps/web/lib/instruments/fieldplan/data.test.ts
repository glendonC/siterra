import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BranchMerge, ExplanationBranch } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { fieldPlanFrom } from "./data";

// The field plan from the recorded 28 Oct live run (packages/contracts/fixtures, a test input only; the seed case
// holds no branch merge).

const recorded = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      ...Array<string>(5).fill(".."),
      "packages",
      "contracts",
      "fixtures",
      "recorded-live-run-2026-10-28-branch-merge.json",
    ),
    "utf8",
  ),
) as { records: { branchMergeRecords: unknown[]; explanationBranchRecords: unknown[] } };
const records = {
  branchMergeRecords: recorded.records.branchMergeRecords.map((r) => BranchMerge.parse(r)),
  explanationBranchRecords: recorded.records.explanationBranchRecords.map((r) =>
    ExplanationBranch.parse(r),
  ),
};
const MERGE = "merge_35d821154a3396cb0178d137b087040b";

describe("fieldPlanFrom", () => {
  const d = fieldPlanFrom(MERGE, records);

  it("lists the merge's five explanations with the status it gave each branch", () => {
    expect(d.explanations.map((e) => [e.id, e.status])).toEqual([
      ["rainfall", "contradicted"],
      ["grazing", "cannot_be_assessed"],
      ["land_use", "cannot_be_assessed"],
      ["snow_terrain", "cannot_be_assessed"],
      ["data_artefact", "contradicted"],
    ]);
    expect(d.explanations.find((e) => e.id === "data_artefact")?.label).toBe("Data artefact");
  });

  it("proposes the two field checks and the pairs each tells apart", () => {
    expect(d.checks.map((c) => [c.id, c.separates, c.onlySeparates])).toEqual([
      [
        "herd_records",
        [
          ["grazing", "land_use"],
          ["grazing", "snow_terrain"],
        ],
        [["grazing", "snow_terrain"]],
      ],
      [
        "orchard_history",
        [
          ["grazing", "land_use"],
          ["land_use", "snow_terrain"],
        ],
        [["land_use", "snow_terrain"]],
      ],
    ]);
    expect(d.unseparated).toEqual([]);
  });

  it("refuses a merge the case does not hold", () => {
    expect(() => fieldPlanFrom("merge_none", records)).toThrow();
  });
});
