import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BranchMerge, CaseSnapshot, Evidence, Task } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { seed } from "../instruments/seed-listing";
import {
  chipNumbers,
  commandFindings,
  commandMerge,
  resultsCaption,
  sourceKey,
  readableStatement,
  shortCitation,
  sourceNote,
  verificationOf,
} from "./results";

// The recorded 28 Oct run (a test input, not part of the seed case): its merge and its one Evidence
const run = (
  JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "..",
        "packages",
        "contracts",
        "fixtures",
        "recorded-live-run-2026-10-28-branch-merge.json",
      ),
      "utf8",
    ),
  ) as { records: { branchMergeRecords: BranchMerge[]; evidenceRecords: Evidence[] } }
).records;
const merge = run.branchMergeRecords[0] as BranchMerge;
const recorded = run.evidenceRecords[0] as Evidence;
const COMMAND = merge.commandId;
const task = (id: string, commandId: string) =>
  ({
    id,
    commandId,
    kind: "observation_analysis",
    status: "succeeded",
    question: "q",
    failureCode: null,
    missingInputs: [],
    createdAt: "2026-10-28T20:34:00Z",
  }) as unknown as Task;
// the seed with the recorded run's records, its Evidence's task belonging to the merge's command
const snapshot: CaseSnapshot = {
  ...seed,
  records: {
    ...seed.records,
    taskRecords: [task(recorded.provenance.generatedByTaskId ?? "", COMMAND)],
    evidenceRecords: [...seed.records.evidenceRecords, recorded],
    branchMergeRecords: [merge],
  },
};

describe("the results caption", () => {
  it("states the recorded merge's counts in catalog words", () => {
    expect(resultsCaption(merge, 1)).toEqual({
      ink: "Two explanations are contradicted and three cannot be assessed yet.",
      grey: "The field plan proposes 2 checks that tell the open ones apart.",
    });
  });

  it("lists every status present, in order, with the noun in the first clause only", () => {
    const b = merge.branches;
    const mixed = {
      ...merge,
      branches: [
        { ...b[0], status: "contradicted" },
        { ...b[1], status: "consistent" },
        { ...b[2], status: "cannot_be_assessed" },
      ],
      fieldPlan: { measurements: [merge.fieldPlan?.measurements[0]], unseparated: [] },
    } as unknown as BranchMerge;
    expect(resultsCaption(mixed, 0)).toEqual({
      ink: "One explanation is contradicted, one is consistent with the records and one cannot be assessed yet.",
      grey: "The field plan proposes 1 check that tells the open ones apart.",
    });
  });

  it("never claims more than the plan: unseparated pairs are counted, not hidden", () => {
    const pair = ["grazing", "land_use"];
    const one = {
      ...merge,
      fieldPlan: { ...merge.fieldPlan, unseparated: [pair] },
    } as unknown as BranchMerge;
    expect(resultsCaption(one, 1).grey).toBe(
      "The field plan proposes 2 checks; 1 pair of open explanations is not told apart by any of them.",
    );
    const two = {
      ...merge,
      fieldPlan: { ...merge.fieldPlan, unseparated: [pair, ["grazing", "snow_terrain"]] },
    } as unknown as BranchMerge;
    expect(resultsCaption(two, 1).grey).toBe(
      "The field plan proposes 2 checks; 2 pairs of open explanations are not told apart by any of them.",
    );
    // one check and one pair: every count agrees with its number
    const single = {
      ...merge,
      fieldPlan: {
        ...merge.fieldPlan,
        measurements: [merge.fieldPlan?.measurements[0]],
        unseparated: [pair],
      },
    } as unknown as BranchMerge;
    expect(resultsCaption(single, 1).grey).toBe(
      "The field plan proposes 1 check; 1 pair of open explanations is not told apart by any of them.",
    );
    // the recorded plan leaves none apart, so its sentence stays the plain one
    expect(resultsCaption(merge, 1).grey).toBe(
      "The field plan proposes 2 checks that tell the open ones apart.",
    );
  });

  it("speaks of the plan only when at least two explanations remain open", () => {
    const b = merge.branches;
    const withOpen = (n: number) =>
      ({
        ...merge,
        branches: b.map((x, i) => ({
          ...x,
          status: i < n ? "cannot_be_assessed" : "contradicted",
        })),
      }) as unknown as BranchMerge;
    expect(resultsCaption(withOpen(1), 1).grey).toBeNull();
    expect(resultsCaption(withOpen(2), 1).grey).toBe(
      "The field plan proposes 2 checks that tell the open ones apart.",
    );
    // consistent branches are open too: only contradicted ones are closed
    const consistent = {
      ...merge,
      branches: b.map((x, i) => ({ ...x, status: i < 2 ? "consistent" : "contradicted" })),
    } as unknown as BranchMerge;
    expect(resultsCaption(consistent, 1).grey).not.toBeNull();
  });

  it("says only the findings count when the request merged no branches", () => {
    expect(resultsCaption(undefined, 2)).toEqual({
      ink: "The request added 2 findings to the case record.",
      grey: null,
    });
    expect(resultsCaption(undefined, 1).ink).toBe(
      "The request added 1 finding to the case record.",
    );
  });
});

describe("the findings list", () => {
  it("takes the accepted Evidence of the command's tasks, and its merge", () => {
    expect(commandFindings(snapshot, COMMAND).map((e) => e.id)).toEqual([recorded.id]);
    expect(commandFindings(snapshot, "cmd_other")).toEqual([]);
    // only accepted Evidence counts, as the work card counts it
    const withRejected = {
      ...snapshot,
      records: {
        ...snapshot.records,
        evidenceRecords: [
          ...snapshot.records.evidenceRecords,
          { ...recorded, id: "ev_rejected", status: "rejected" },
        ],
      },
    } as unknown as CaseSnapshot;
    expect(commandFindings(withRejected, COMMAND).map((e) => e.id)).toEqual([recorded.id]);
    expect(commandMerge(snapshot, COMMAND)?.id).toBe(merge.id);
    expect(commandMerge(snapshot, "cmd_other")).toBeUndefined();
  });

  it("numbers chips by source record, else by bundle, in the order first cited", () => {
    const withSource = seed.records.evidenceRecords.find(
      (e) => e.provenance.sourceLocators.length > 0,
    ) as Evidence;
    const sameSource = { ...withSource, id: "ev_same_source" };
    expect(sourceKey(recorded)).toBe("bundle_s2_ndvi_monthly_ait_bouguemez");
    expect(chipNumbers([recorded, withSource, sameSource, recorded])).toEqual([1, 2, 2, 1]);
  });

  it("states each finding's verification as its record holds it, never an unverified one as checked", () => {
    const base = seed.records.evidenceRecords.find(
      (e) => e.provenance.sourceLocators.length > 0,
    ) as Evidence;
    const as = (
      verificationStatus: Evidence["provenance"]["verificationStatus"],
      sourceLocators = base.provenance.sourceLocators,
    ) =>
      ({
        ...base,
        provenance: { ...base.provenance, verificationStatus, sourceLocators },
      }) as Evidence;
    const checked = as("source_checked");
    const unchecked = as("unverified");
    const bare = as("unverified", []);
    expect([checked, recorded, unchecked, bare].map(verificationOf)).toEqual([
      "results.checked",
      "results.computed.state",
      "results.unchecked",
      "results.unchecked",
    ]);
    // a chip for a checked source, a computed bundle, an attached source; none for a bare unverified line
    expect(chipNumbers([checked, recorded, unchecked, bare])).toEqual([1, 2, 1, null]);
  });

  it("opens the cited locator and excerpt, or the bundle and measurements for computed evidence", () => {
    const withSource = seed.records.evidenceRecords.find(
      (e) => e.provenance.sourceLocators[0]?.excerpt,
    ) as Evidence;
    const loc = withSource.provenance.sourceLocators[0];
    expect(sourceNote(snapshot, withSource)).toContain(loc?.locator ?? "?");
    expect(sourceNote(snapshot, withSource)).toContain(loc?.excerpt ?? "?");
    // the computed note counts its measurements and names no record id
    expect(sourceNote(snapshot, recorded)).toMatch(/\. Computed from one of its measurements\.$/);
    expect(sourceNote(snapshot, recorded)).not.toMatch(/\bmeas_|\bsrc_|\bev_/);
  });
});

describe("a statement as shown", () => {
  const src = seed.records.sourceRecords.find((x) => x.id === "src_SCI-19");
  it("reads a Source id in recorded text as the Source's short citation, the record unchanged", () => {
    if (!src) throw new Error("src_SCI-19");
    const text = "Reading src_SCI-19 is required to add located statements.";
    const shown = readableStatement(seed, text);
    expect(shown).toBe(`Reading ${shortCitation(src)} is required to add located statements.`);
    expect(shown).not.toMatch(/src_/);
    expect(shortCitation(src)).toMatch(/^\S.* \d{4}$/);
    expect(text).toContain("src_SCI-19");
  });
  it("names an id the case holds no Source for as an unnamed source, never the id", () => {
    expect(readableStatement(seed, "Reading src_SCI-99 first.")).toBe(
      "Reading a source the case does not hold first.",
    );
  });
});
