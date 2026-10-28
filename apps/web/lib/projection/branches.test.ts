import { CaseSnapshot, Commit, type BranchMerge, type ExplanationBranch } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import seed from "../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json";
import branchCommit from "../../../../schemas/examples/commit-explanation-branches.json";
import { projectBranches } from "./branches";

const base = CaseSnapshot.parse(seed);
const parsedCommit = Commit.parse(branchCommit);

describe("projectBranches (CMP-23)", () => {
  it("projects locked predictions with their commit revision before scoring", () => {
    const firstBranch = parsedCommit.upserts.find(
      (u): u is ExplanationBranch => u.recordType === "ExplanationBranch",
    );
    if (!firstBranch) throw new Error("missing branch example");
    const lockedBranch = {
      ...firstBranch,
      revision: 1,
      status: "predicted" as const,
      statusReason: "Predictions committed before reading any result.",
      scores: [],
      scoredAt: null,
    };
    const snapshot = {
      ...base,
      records: {
        ...base.records,
        explanationBranchRecords: [lockedBranch],
        branchMergeRecords: [],
      },
    } as unknown as CaseSnapshot;

    const p = projectBranches(snapshot, lockedBranch.commandId);
    expect(p).toBeDefined();
    expect(p?.scored).toBe(false);
    expect(p?.lockedBadge).toBe("Predictions Locked · Rev 6");
    expect(p?.branches[0]).toMatchObject({
      label: "Rainfall",
      status: "predicted",
      statusLabel: "Predictions Locked",
      mark: "dashed",
    });
    expect(p?.branches[0]?.predictions.map((pr) => [pr.key, pr.mark, pr.outcomeLabel])).toEqual([
      ["p1", "dashed", "Committed"],
      ["p2", "dashed", "Committed"],
    ]);
  });

  it("projects scored branches, geometric certainty marks, and the minimum field plan from BranchMerge", () => {
    const rainfallBranch = parsedCommit.upserts.find(
      (u): u is ExplanationBranch => u.recordType === "ExplanationBranch",
    );
    const merge = parsedCommit.upserts.find(
      (u): u is BranchMerge => u.recordType === "BranchMerge",
    );
    if (!rainfallBranch || !merge) throw new Error("missing branch or merge example");

    const grazingBranch = {
      ...rainfallBranch,
      id: "branch_example_grazing",
      explanationId: "grazing",
      label: "Grazing",
      status: "cannot_be_assessed" as const,
      statusReason: "No prediction is testable with the record.",
      scores: [],
    };

    const snapshot = {
      ...base,
      records: {
        ...base.records,
        explanationBranchRecords: [rainfallBranch, grazingBranch],
        branchMergeRecords: [merge],
      },
    } as unknown as CaseSnapshot;

    const p = projectBranches(snapshot, rainfallBranch.commandId);
    expect(p).toBeDefined();
    expect(p?.scored).toBe(true);
    expect(p?.lockedBadge).toBe("Predictions Locked · Rev 6");
    expect(p?.rulesVersion).toBe("merge@1");
    expect(p?.branches.map((b) => [b.label, b.statusLabel, b.mark])).toEqual([
      ["Rainfall", "Consistent", "solid"],
      ["Grazing", "Cannot Be Assessed", "ring"],
    ]);
    expect(p?.branches[0]?.predictions.map((pr) => [pr.key, pr.mark, pr.outcomeLabel])).toEqual([
      ["p1", "solid", "Met"],
      ["p2", "ring", "Not Testable"],
    ]);
    expect(p?.fieldChecks).toEqual([
      {
        fieldCheckId: "soil_moisture_survey",
        label: "Soil Moisture Survey",
        separatesText: "Separates: Grazing vs Rainfall.",
        onlySeparates: [["grazing", "rainfall"]],
      },
    ]);
    expect(p?.branches[0]?.pin).not.toBeNull();
  });
});
