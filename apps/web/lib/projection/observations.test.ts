import { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import seed from "../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json";
import { periodLabel, projectObservations } from "./observations";

const snapshot = CaseSnapshot.parse(seed);

describe("projectObservations", () => {
  const lines = projectObservations(snapshot);

  it("summarizes the monthly rainfall and vegetation bundles from their measurements", () => {
    expect(lines.map((l) => [l.label, l.available, l.total, l.first, l.last])).toEqual([
      ["Catchment rainfall, CHIRPS v3.0 monthly", 84, 84, "Jan 2019", "Dec 2025"],
      ["Catchment NDVI, Sentinel-2 monthly", 68, 84, "Jan 2019", "Dec 2025"],
    ]);
  });

  it("binds every line to the measurements it counts", () => {
    for (const l of lines) expect(l.measurementIds).toHaveLength(l.total);
  });

  it("leaves out bundles that are not validated", () => {
    const failed = {
      ...snapshot,
      records: {
        ...snapshot.records,
        dataBundleRecords: snapshot.records.dataBundleRecords.map((b) => ({
          ...b,
          status: "failed" as const,
        })),
      },
    };
    expect(projectObservations(failed)).toEqual([]);
  });
});

describe("periodLabel", () => {
  it("writes months as the design system asks", () => {
    expect(periodLabel("period_2022-04")).toBe("Apr 2022");
    expect(periodLabel("season_2022-23")).toBe("season_2022-23");
  });
});
