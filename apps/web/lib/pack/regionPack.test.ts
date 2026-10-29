import { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import seed from "../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json";
import { regionPack } from "./regionPack";

const snapshot = CaseSnapshot.parse(seed);
const withBundles = (patch: (b: CaseSnapshot["records"]["dataBundleRecords"][number]) => object) =>
  ({
    ...snapshot,
    records: {
      ...snapshot.records,
      dataBundleRecords: snapshot.records.dataBundleRecords.map((b, i) =>
        i === 0 ? { ...b, ...patch(b) } : b,
      ),
    },
  }) as CaseSnapshot;

describe("regionPack", () => {
  const p = regionPack(snapshot);

  it("names the pack from the case record", () => {
    expect(p.name).toBe(snapshot.case.title);
  });

  it("lists each active data layer under its bundle label", () => {
    expect(p.layers).toHaveLength(snapshot.records.dataBundleRecords.length);
    expect(p.layers).toContain("Catchment rainfall, CHIRPS v3.0 monthly");
    expect(p.layers).toContain("Catchment NDVI, Sentinel-2 monthly");
  });

  it("states the observation window from the bundles' periods", () => {
    expect(p.window).toBe("Jan 2019 to Dec 2025, 84 months");
    expect(p.periodSpan).toBe("2019 to 2025");
  });

  it("counts the bundles that passed the automated data checks", () => {
    expect(p.checks).toBe("16 of 16 bundles passed automated data checks.");
  });

  it("states real data and no field verification, the truth of this pack", () => {
    expect(p.status).toBe("Real Data · Field Unverified");
    expect(p.status).not.toMatch(/\bvalidated\b|\bverified\b/i);
  });

  it("says checks are pending or failed when a bundle has not passed them", () => {
    expect(regionPack(withBundles(() => ({ status: "processing" }))).status).toBe(
      "Checks Pending · Field Unverified",
    );
    expect(regionPack(withBundles(() => ({ status: "failed" }))).status).toBe(
      "Checks Failed · Field Unverified",
    );
  });

  it("leaves superseded bundles out of the active layers", () => {
    const q = regionPack(withBundles(() => ({ status: "superseded" })));
    expect(q.layers).toHaveLength(snapshot.records.dataBundleRecords.length - 1);
    expect(q.status).toBe("Real Data · Field Unverified");
  });

  it("records a verified outcome only from accepted verified-outcome evidence", () => {
    const evidence = (status: string) =>
      ({
        ...snapshot,
        records: {
          ...snapshot.records,
          evidenceRecords: [{ id: "ev_v", claimKind: "verified_outcome", status }],
        },
      }) as unknown as CaseSnapshot;
    expect(regionPack(evidence("proposed")).status).toBe("Real Data · Field Unverified");
    expect(regionPack(evidence("accepted")).status).toBe("Real Data · Verified Outcome Recorded");
  });
});
