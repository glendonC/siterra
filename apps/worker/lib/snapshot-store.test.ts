import { describe, expect, it } from "vitest";

import { snapshotStore } from "./snapshot-store.ts";

// A visitor's demo copy has its own case ID; the seed's analysis configuration still applies to it.
const view = (id: string) =>
  ({
    case: {
      id,
      revision: 2,
      title: "T",
      objective: "O",
      mode: "replay",
      activeGeoSelectionId: null,
      unresolvedQuestions: [],
    },
    records: {
      dataBundleRecords: [],
      measurementRecords: [],
      temporalObservationRecords: [],
      sourceRecords: [],
    },
  }) as never;
const corpus = { sources: [], passages: [], missing: [] };

describe("snapshot store: the areas of the case", () => {
  it("lists the ID and revision of each area the snapshot holds", async () => {
    const snapshot = view("case_copy_3") as { records: Record<string, unknown> };
    snapshot.records["geoSelectionRecords"] = [{ id: "geo_a", revision: 2 }];
    const store = snapshotStore(snapshot as never, corpus, null);
    expect(await store.listGeoSelections("case_copy_3")).toEqual([{ id: "geo_a", revision: 2 }]);
    expect(await store.listGeoSelections("case_other")).toEqual([]);
  });
});

describe("snapshot store: the case configuration of a demo copy", () => {
  it("reads the seed's configuration for a copy when it is given the seed's ID", async () => {
    const store = snapshotStore(view("case_copy_1"), corpus, null, "case_aitbouguemez");
    expect((await store.readAnalysisConfig("case_copy_1"))?.caseId).toBe("case_aitbouguemez");
  });

  it("reads the configuration of the seed itself by its own ID", async () => {
    const store = snapshotStore(view("case_aitbouguemez"), corpus, null);
    expect((await store.readAnalysisConfig("case_aitbouguemez"))?.caseId).toBe("case_aitbouguemez");
  });

  it("holds no configuration for a case with no origin and no configuration of its own", async () => {
    const store = snapshotStore(view("case_copy_2"), corpus, null);
    expect(await store.readAnalysisConfig("case_copy_2")).toBeNull();
  });
});

describe("snapshot store: the explanation merges of the case", () => {
  it("holds the merges the snapshot lists, by case and ID, newest revision first", async () => {
    const snapshot = view("case_copy_4") as { records: Record<string, unknown> };
    const merge = (id: string, revision: number, caseId = "case_copy_4") => ({
      recordType: "BranchMerge",
      id,
      revision,
      caseId,
    });
    snapshot.records["branchMergeRecords"] = [
      merge("merge_a", 1),
      merge("merge_a", 2),
      merge("merge_b", 1),
      merge("merge_c", 1, "case_other"),
    ];
    const store = snapshotStore(snapshot as never, corpus, null);
    const read = await store.readBranchMerges("case_copy_4", ["merge_a", "merge_b", "merge_c"]);
    expect(read.map((m) => [m.id, m.revision]).sort()).toEqual([
      ["merge_a", 2],
      ["merge_b", 1],
    ]);
    expect(await store.readBranchMerges("case_copy_4", [])).toEqual([]);
  });
});
