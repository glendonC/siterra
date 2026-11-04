import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BranchMerge, CaseSnapshot, Evidence, Task } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { seed } from "../instruments/seed-listing";
import {
  commandFindings,
  commandMerge,
  sourceKey,
  readableStatement,
  shortCitation,
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

  it("keys chips by source record, else by bundle", () => {
    const withSource = seed.records.evidenceRecords.find(
      (e) => e.provenance.sourceLocators.length > 0,
    ) as Evidence;
    const sameSource = { ...withSource, id: "ev_same_source" };
    expect(sourceKey(recorded)).toBe("bundle_s2_ndvi_monthly_ait_bouguemez");
    expect(sourceKey(sameSource)).toBe(sourceKey(withSource));
    expect(sourceKey(withSource)).not.toBe(sourceKey(recorded));
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
    // an attached source keys a chip whether or not it was checked; a bare unverified line has none
    expect(sourceKey(unchecked)).toBe(sourceKey(checked));
    expect(sourceKey(bare)).toBeNull();
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
  it("reads an id at the end of a sentence without taking the full stop into the id", () => {
    if (!src) throw new Error("src_SCI-19");
    expect(readableStatement(seed, "The excerpt comes from src_SCI-19.")).toBe(
      `The excerpt comes from ${shortCitation(src)}.`,
    );
  });

  it("names two authors by both surnames, and three or more by the first with et al.", () => {
    if (!src) throw new Error("src_SCI-19");
    const two = {
      ...src,
      authors: ["Auclair, Laurent", "Alifriqui, Mohamed"],
      publicationDate: "2011",
    };
    expect(shortCitation(two)).toBe("Auclair and Alifriqui 2011");
    const three = { ...two, authors: [...two.authors, "Simenel, Romain"] };
    expect(shortCitation(three)).toBe("Auclair et al. 2011");
    expect(shortCitation({ ...three, publicationDate: null })).toBe("Auclair et al.");
  });

  it("reads an author list that records 'et al.' as an entry as the first author with et al.", () => {
    // the seed's src_SCI-04 records its authors as ["Aakairi, M.", "et al."]
    const aak = seed.records.sourceRecords.find((x) => x.id === "src_SCI-04");
    if (!aak) throw new Error("src_SCI-04");
    expect(shortCitation(aak)).toBe("Aakairi et al. 2026");
    const two = { ...aak, authors: ["Aakairi, M.", "Bourbouze, Alain"] };
    expect(shortCitation(two)).toBe("Aakairi and Bourbouze 2026");
    expect(shortCitation({ ...aak, authors: ["Aakairi, M.", "et al"] })).toBe(
      "Aakairi et al. 2026",
    );
    expect(shortCitation({ ...aak, authors: ["Aakairi, M."] })).toBe("Aakairi 2026");
  });

  it("names an id the case holds no Source for as an unnamed source, never the id", () => {
    expect(readableStatement(seed, "Reading src_SCI-99 first.")).toBe(
      "Reading a source the case does not hold first.",
    );
  });
});
