import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BranchMerge, Evidence, ExplanationBranch, Hypothesis } from "./case.ts";

// The recorded live run of 28 Oct 2026, kept as a fixture for interface development: its records
// must keep parsing under the current contracts, and it must say what it is.
const file = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../fixtures/recorded-live-run-2026-10-28-branch-merge.json", import.meta.url),
    ),
    "utf8",
  ),
) as { label: string; records: Record<string, unknown[]> };
const records = file.records;

describe("recorded live run of 28 Oct 2026 (fixture for the field plan instrument)", () => {
  it("says it was recorded, not re-run, and is not part of the case", () => {
    expect(file.label).toContain("not re-run");
    expect(file.label).toContain("not part of the seed case");
  });

  it("parses under the current contracts", () => {
    for (const r of records["branchMergeRecords"] ?? [])
      expect(BranchMerge.safeParse(r).success).toBe(true);
    for (const r of records["explanationBranchRecords"] ?? [])
      expect(ExplanationBranch.safeParse(r).success).toBe(true);
    for (const r of records["hypothesisRecords"] ?? [])
      expect(Hypothesis.safeParse(r).success).toBe(true);
    for (const r of records["evidenceRecords"] ?? [])
      expect(Evidence.safeParse(r).success).toBe(true);
  });

  it("holds a merge with a field plan whose branches are all in the file at the revisions it names", () => {
    const [merge] = (records["branchMergeRecords"] ?? []).map((r) => BranchMerge.parse(r));
    const branches = (records["explanationBranchRecords"] ?? []).map((r) =>
      ExplanationBranch.parse(r),
    );
    expect(merge?.fieldPlan?.measurements.length).toBeGreaterThan(0);
    expect(merge?.branches.length).toBe(5);
    for (const b of merge?.branches ?? []) {
      expect(branches.some((x) => x.id === b.branchId && x.revision === b.branchRevision)).toBe(
        true,
      );
    }
  });
});
