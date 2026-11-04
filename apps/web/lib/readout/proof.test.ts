import type { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { seed } from "../instruments/seed-listing";
import { proofSheet, sheetOfMetric } from "./proof";

// The land proves an answer only with the sheet its claim reads; a status answer has no map behind it.
describe("proofSheet", () => {
  const shares = seed.records.measurementRecords
    .filter((m) => m.metric === "area_share_upward_fdr" || m.metric === "area_share_downward_fdr")
    .map((m) => m.id)
    .slice(0, 2);

  it("lifts the trend sheet for a claim that reads the long record's shares", () => {
    expect(proofSheet(seed, { claimKind: "measurement", claimIds: shares })).toBe("trend");
  });

  it("lifts nothing for an answer made of merge statuses", () => {
    expect(proofSheet(seed, { claimKind: "status", claimIds: ["rainfall"] })).toBeNull();
  });

  it("lifts nothing when the claim's measurements are not in the record", () => {
    const bare = { ...seed, records: { ...seed.records, measurementRecords: [] } } as CaseSnapshot;
    expect(proofSheet(bare, { claimKind: "measurement", claimIds: shares })).toBeNull();
  });

  it("names the sheet for each measured metric, and none for others", () => {
    expect(sheetOfMetric("ndvi_trend_unadjusted_per_decade")).toBe("trend");
    expect(sheetOfMetric("precipitation_departure_from_1991_2020_mean")).toBe("rain");
    expect(sheetOfMetric("elevation_band_limit")).toBeNull();
  });
});
