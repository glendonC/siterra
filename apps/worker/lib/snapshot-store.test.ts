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
