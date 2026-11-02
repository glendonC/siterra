import type { Provenance } from "@siterra/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ClimateYearRow, computeStatsFromAnnual } from "./climate-series.ts";
import { fetchOpenAlexSources, synthesizePlaceQuestionAndEvidence } from "./literature.ts";
import { synthesizeLiveCaseSnapshot } from "./snapshot-synthesizer.ts";

// The findings package for a live place, where only rainfall and relief are measured: nothing in it may judge,
// score or state a vegetation change.
const NOW = "2026-11-02T12:00:00.000Z";
const CASE_ID = "case_loc_new_york_317deb";
const GEO_ID = "geo_loc_new_york_317deb";
const BUNDLE_ID = "bundle_loc_new_york_317deb";

const provenance: Provenance = {
  sourceLocators: [],
  dataBundleIds: [],
  methodId: "open_meteo_era5_watershed_series",
  methodVersion: "2.0.0",
  inputVersions: [{ entityId: GEO_ID, revision: 1 }],
  generatedByTaskId: null,
  generatedAt: NOW,
  verificationStatus: "computed_checked",
  limitations: ["Test record."],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response("unavailable", { status: 503 }))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function livePackage() {
  const years: ClimateYearRow[] = [];
  for (let yr = 2000; yr <= 2024; yr++)
    years.push({ year: yr, precipMm: 1100 + (yr % 4) * 40 + (yr - 2000) * 2.5, et0Mm: 900 });
  const climate = computeStatsFromAnnual(years);
  const sources = await fetchOpenAlexSources(
    CASE_ID,
    "new_york",
    "317deb",
    "New York",
    "United States",
    NOW,
  );
  const periodIds = years.map((y) => `period_${String(y.year)}-06`);
  const ids = {
    catchmentTrendId: "meas_catchment_trend_new_york_317deb",
    precipTrendId: "meas_precip_trend_new_york_317deb",
    rainR2Id: "meas_rain_r2_new_york_317deb",
    fdrUpId: "meas_fdr_up_new_york_317deb",
    fdrDownId: "meas_fdr_down_new_york_317deb",
    bandTrendId: "meas_band_low_new_york_317deb",
    bandLimitId: "meas_band_limit_new_york_317deb",
  };
  const terrain = { minElevationM: 0, maxElevationM: 52 };
  const placed = synthesizePlaceQuestionAndEvidence({
    caseId: CASE_ID,
    slug: "new_york",
    hash6: "317deb",
    placeName: "New York",
    regionName: "United States",
    now: NOW,
    geoId: GEO_ID,
    periodIds,
    measurementIds: ids,
    recordProvenance: provenance,
    terrain,
    climate,
    sources,
  });
  const pkg = synthesizeLiveCaseSnapshot({
    caseId: CASE_ID,
    slug: "new_york",
    hash6: "317deb",
    placeName: "New York",
    regionName: "United States",
    question: placed.question,
    now: NOW,
    geoId: GEO_ID,
    bundleId: BUNDLE_ID,
    periodIds,
    bandLimitM: 20,
    terrain,
    climate,
    sources,
    evidence: placed.evidence,
    measurementIds: ids,
    llmResult: null,
  });
  return { placed, pkg };
}

describe("live findings package", () => {
  it("judges no explanation against a vegetation series that was never measured", async () => {
    const { pkg } = await livePackage();
    for (const b of pkg.explanationBranches) {
      expect([b.label, b.status]).toEqual([b.label, "cannot_be_assessed"]);
      for (const s of b.scores) {
        expect([b.label, s.outcome]).toEqual([b.label, "not_testable"]);
        expect(s.dataAdequate).toBe(false);
      }
    }
    for (const m of pkg.branchMerge.branches) expect(m.status).toBe("cannot_be_assessed");
    for (const h of pkg.hypotheses) expect([h.id, h.status]).toEqual([h.id, "inconclusive"]);
  });

  it("states no vegetation change, trend or pattern as found", async () => {
    const { pkg, placed } = await livePackage();
    const text = JSON.stringify([pkg, placed.evidence]);
    expect(text).not.toMatch(/[-+]?\d+\.\d+\s*(NDVI|per decade\))/);
    expect(text).not.toMatch(
      /greening|browning|observed shift|residual pattern|trend cells|shaped vegetation trends|complete annual observation|apparent 25-year pattern/i,
    );
    for (const line of pkg.brief.known)
      if (line.claimKind === "observation") expect(line.text).not.toMatch(/vegetation|greenness/i);
  });

  it("keeps the rainfall trend with its source and window, and asks for a vegetation series next", async () => {
    const { pkg } = await livePackage();
    const known = pkg.brief.known.map((l) => l.text).join(" ");
    expect(known).toMatch(/mm per decade \(2000 to 2024, 25 calendar years/);
    expect(pkg.brief.known.find((l) => /mm per decade/.test(l.text))?.claimKind).toBe(
      "model_estimate",
    );
    expect(pkg.brief.nextMeasurements.map((l) => l.text).join(" ")).toMatch(
      /satellite vegetation series/i,
    );
    expect(pkg.brief.limitations.join(" ")).toMatch(/Open-Meteo/);
  });
});
