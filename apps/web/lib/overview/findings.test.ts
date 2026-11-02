import { describe, expect, it } from "vitest";
import { seed, seedListing } from "../instruments/seed-listing";
import {
  answerForCase,
  captionOf,
  FINDINGS,
  findingsFrom,
  outlineLabelOf,
  overviewLabelOf,
  overviewVerdictForCase,
  recordHeadlineForFinding,
  recordRowsForFinding,
} from "./findings";

// The findings' numbers are the Measurements the instrument specs cite, formatted as the instruments format them.
describe("findingsFrom (seed case)", () => {
  const { findings, bandLimit } = findingsFrom(seed, seedListing);
  const byId = Object.fromEntries(findings.map((f) => [f.id, f]));

  it("shows all five findings at D4's clock angles", () => {
    expect(findings.map((f) => [f.id, f.clock, f.tone])).toEqual([
      ["catchment", 306, "green"],
      ["band", 32, "green"],
      ["pixel", 52, "green"],
      ["rain", 112, "blue"],
      ["fdr", 280, "green"],
    ]);
  });

  it("takes each value from the Measurement its spec's caption cites", () => {
    for (const f of findings) {
      const plan = FINDINGS.find((p) => p.id === f.id);
      const spec = seed.records.instrumentSpecRecords?.find(
        (s) => s.parameters.kind === plan?.kind,
      );
      const id = spec?.caption.citationIds[plan?.citation ?? -1];
      const m = seed.records.measurementRecords.find((x) => x.id === id);
      expect(f.measurementId).toBe(id);
      expect(f.value).toBe(m?.value);
    }
  });

  it("formats trends signed to 4 decimals, R squared to 3, the share as a per cent", () => {
    expect(byId.catchment?.display).toBe("+0.0091");
    expect(byId.band?.display).toBe("+0.0134");
    expect(byId.pixel?.display).toBe("+0.0570");
    expect(byId.rain?.display).toBe("0.037");
    expect(byId.fdr?.display).toBe("24.7%");
  });

  it("takes the band limit from the cross section's elevation band limit", () => {
    expect(bandLimit).toEqual({ value: 2316.8, display: "2,317" });
  });

  it("leaves out a finding whose spec the case does not hold", () => {
    const listing = {
      ...seedListing,
      instruments: seedListing.instruments.filter((v) => v.spec.parameters.kind !== "layer_stack"),
    };
    expect(findingsFrom(seed, listing).findings.map((f) => f.id)).toEqual([
      "band",
      "pixel",
      "rain",
    ]);
  });

  it("names the share's direction from its Measurement's metric: upward greening, downward browning", () => {
    expect(byId.fdr?.direction).toBe("up");
    const at = (metric: string) => {
      const records = {
        ...seed.records,
        measurementRecords: seed.records.measurementRecords.map((m) =>
          m.id === byId.fdr?.measurementId ? { ...m, metric } : m,
        ),
      };
      return findingsFrom({ ...seed, records }, seedListing).findings.find((f) => f.id === "fdr")
        ?.direction;
    };
    expect(at("area_share_downward_fdr")).toBe("down");
    expect(at("area_share_fdr")).toBeNull();
    // a trend has no share direction
    expect(byId.catchment?.direction).toBeNull();
  });

  it("shows the opposite share beside the first where the caption cites both (direction-neutral places)", () => {
    expect(byId.fdr?.pair).toBeNull();
    const up = seed.records.measurementRecords.find((m) => m.id === byId.fdr?.measurementId);
    if (!up) throw new Error("no fdr measurement");
    const down = {
      ...up,
      id: "meas_test_downward_share",
      metric: "area_share_downward_fdr",
      value: 0.031,
    };
    const listing = {
      ...seedListing,
      instruments: seedListing.instruments.map((v) =>
        v.spec.parameters.kind === "layer_stack"
          ? {
              ...v,
              spec: {
                ...v.spec,
                caption: {
                  ...v.spec.caption,
                  citationIds: [...v.spec.caption.citationIds, down.id],
                },
              },
            }
          : v,
      ),
    };
    const records = {
      ...seed.records,
      measurementRecords: [...seed.records.measurementRecords, down],
    };
    const fdr = findingsFrom({ ...seed, records }, listing).findings.find((f) => f.id === "fdr");
    expect(fdr?.display).toBe("24.7%");
    expect(fdr?.direction).toBe("up");
    expect(fdr?.pair).toEqual({ measurementId: down.id, display: "3.1%", direction: "down" });
  });

  it("leaves out a finding whose Measurement has no value", () => {
    const records = {
      ...seed.records,
      measurementRecords: seed.records.measurementRecords.map((m) =>
        m.id === byId.rain?.measurementId ? { ...m, value: null, status: "missing" as const } : m,
      ),
    };
    const ids = findingsFrom({ ...seed, records }, seedListing).findings.map((f) => f.id);
    expect(ids).not.toContain("rain");
  });

  it("writes each arc caption in plain words first without analyst terms at rest", () => {
    const limit = bandLimit?.display ?? "";
    expect(findings.map((f) => [f.id, captionOf(f, limit)])).toEqual([
      ["catchment", ["Whole area greenness trend"]],
      ["band", ["Below 2,317 m trend"]],
      ["pixel", ["One 250 m square"]],
      ["rain", ["Explained by rainfall"]],
      ["fdr", ["of the area greening"]],
    ]);
  });

  it("derives each finding's second line from the case record without multiplying NDVI by 100 as a percent", () => {
    const limit = bandLimit?.display ?? "";
    const lines = Object.fromEntries(findings.map((f) => [f.id, captionOf(f, limit, findings)]));
    expect(lines.catchment).toEqual(["Whole area greenness trend", "March to June, 2000 to 2025"]);
    expect(lines.band).toEqual(["Below 2,317 m trend", "1.5 times the whole-area rate"]);
    expect(lines.pixel).toEqual(["One 250 m square", "47% grassland, 40% tree cover"]);
    expect(lines.rain).toEqual([
      "Explained by rainfall",
      "Accounts for 3.7% of March to June variance",
    ]);
    expect(lines.fdr).toEqual(["of the area greening", "Almost none browning (0.09% of cells)"]);
    for (const pair of Object.values(lines)) {
      for (const s of pair) {
        expect(s).not.toContain("%/dec");
        expect(s).not.toContain("land use, snowmelt & grazing");
        expect(s).not.toContain("net greening masks upper-slope pressure");
        expect(s).not.toContain("mixes grass & shrubs");
        expect(s).not.toContain("·");
      }
    }
  });

  it("computes different, honest subtitles for a browning place or a live place missing vegetation", () => {
    // Live place where vegetation is missing but annual rainfall trend is measured:
    const baseM = seed.records.measurementRecords[0];
    if (!baseM) throw new Error("missing seed measurement");
    const missingReason =
      "Requires a 25-year MODIS or Sentinel-2 growing-season NDVI series; live ingestion currently fetches ERA5 climate and WorldCover 2021 only.";
    const liveRecords = {
      ...seed.records,
      measurementRecords: [
        ...seed.records.measurementRecords.map((m) =>
          m.id === byId.catchment?.measurementId
            ? { ...m, value: null, status: "missing" as const, missingReason }
            : m.id === byId.rain?.measurementId
              ? { ...m, value: null, status: "missing" as const, missingReason }
              : { ...m, value: null, status: "missing" as const },
        ),
        {
          ...baseM,
          id: "meas_live_precip_trend",
          caseId: "case_loc_queenstown_7e0699",
          caseRevision: 2,
          recipeId: "recipe_era5",
          metric: "precipitation_trend_mm_per_decade",
          unit: "mm per decade",
          value: 13.9,
          periodId: "period_2000-2024_annual",
          status: "available" as const,
          missingReason: null,
        },
      ],
    };
    const live = findingsFrom(
      { ...seed, case: { ...seed.case, id: "case_loc_queenstown_7e0699" }, records: liveRecords },
      seedListing,
    );
    const liveCatchment = live.findings.find((f) => f.id === "catchment");
    if (!liveCatchment) throw new Error("missing catchment finding");
    expect(liveCatchment.display).toBe("Not measured yet");
    expect(liveCatchment.missingReason).toBe(missingReason);
    expect(captionOf(liveCatchment, "", live.findings)).toEqual([
      "Whole area greenness trend",
      "No satellite greenness series for this area",
    ]);
    const liveRain = live.findings.find((f) => f.id === "rain");
    if (!liveRain) throw new Error("missing rain finding");
    expect(liveRain.display).toBe("+13.9 mm");
    expect(captionOf(liveRain, "", live.findings)).toEqual([
      "Annual rainfall trend per decade",
      "Calendar years 2000 to 2024, Open-Meteo ERA5 reanalysis",
    ]);
  });

  it("maps TerrainFile.outline.kind to honest outline labels without calling a box a watershed", () => {
    expect(
      outlineLabelOf("Aït Bouguemez", {
        kind: "watershed",
        outletLonLat: [-6.4, 31.6],
        areaKm2: 511.8,
        points: 120,
      }),
    ).toBe("Aït Bouguemez watershed");
    expect(
      outlineLabelOf("Queenstown", {
        kind: "drainage_within_box",
        outletLonLat: [168.66, -45.03],
        areaKm2: 142.3,
        points: 96,
      }),
    ).toBe("Drainage area within the 20 km box");
    expect(
      outlineLabelOf("Null Island", {
        kind: "land_within_box",
        outletLonLat: [0, 0],
        areaKm2: 88.0,
        points: 64,
      }),
    ).toBe("Land within the 20 km box");
    expect(
      outlineLabelOf("Point Nemo", {
        kind: "box",
        fallback: "no_land",
        outletLonLat: [-123.39, -48.87],
        areaKm2: 400,
        points: 4,
      }),
    ).toBe("The 20 km box (no land in it)");
    expect(
      outlineLabelOf("Flat Plains", {
        kind: "box",
        fallback: "outline_degenerate",
        outletLonLat: [10, 10],
        areaKm2: 400,
        points: 4,
      }),
    ).toBe("The 20 km box (no outline could be drawn)");
  });

  it("uses the canonical status vocabulary in overviewVerdictForCase and never emits a >100% correlation", () => {
    const baseM = seed.records.measurementRecords[0];
    if (!baseM) throw new Error("missing seed measurement");
    const liveRecords = {
      ...seed.records,
      branchMergeRecords: [],
      measurementRecords: [
        {
          ...baseM,
          id: "meas_live_precip_mean",
          caseId: "case_loc_queenstown_7e0699",
          caseRevision: 2,
          recipeId: "recipe_era5",
          metric: "annual_precipitation_mean_mm",
          unit: "mm",
          value: 1154.2,
          status: "available" as const,
          missingReason: null,
        },
        {
          ...baseM,
          id: "meas_live_ndvi_missing",
          caseId: "case_loc_queenstown_7e0699",
          caseRevision: 2,
          recipeId: "recipe_ndvi",
          metric: "ndvi_trend_unadjusted_per_decade",
          unit: "NDVI per decade",
          value: null,
          status: "missing" as const,
          missingReason: "Requires a 25-year MODIS or Sentinel-2 growing-season NDVI series.",
        },
      ],
    };
    const verdict = overviewVerdictForCase(
      { ...seed, case: { ...seed.case, id: "case_loc_queenstown_7e0699" }, records: liveRecords },
      null,
    );
    if (!verdict) throw new Error("expected verdict");
    const allowedStatuses = new Set([
      "Predictions locked",
      "Consistent with available evidence",
      "Contradicted by available evidence",
      "Cannot be assessed with current data",
      "Needs reassessment",
    ]);
    for (const c of verdict.causes) {
      expect(allowedStatuses.has(c.statusText)).toBe(true);
      expect(c.reason).not.toContain("115.42");
      expect(c.reason).not.toContain("27.54");
      expect(c.reason).not.toContain("1154");
    }
    const rainCause = verdict.causes.find((c) => c.id === "rainfall");
    expect(rainCause?.status).toBe("cannot_be_assessed");
    expect(rainCause?.statusText).toBe("Cannot be assessed with current data");
  });

  it("computes the two-tone answerForCase for greening, direction-neutral, and missing-vegetation cases", () => {
    // Seed case without BranchMerge: only the measurement claim
    const withoutMerge = {
      ...seed,
      records: { ...seed.records, branchMergeRecords: [] },
    };
    expect(answerForCase(withoutMerge)).toEqual({
      claim: "Since 2000 the valley has greened, not browned.",
      limit: null,
    });

    // Seed case with an unassessed grazing branch in BranchMerge
    const withMerge = {
      ...seed,
      records: {
        ...seed.records,
        branchMergeRecords: [
          {
            recordType: "BranchMerge" as const,
            id: "merge_test_1",
            revision: 1,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
            caseId: seed.case.id,
            commandId: "cmd_test_1",
            taskId: "task_test_1",
            rulesVersion: "merge@1",
            predictionsCaseRevision: seed.case.revision,
            branches: [
              {
                branchId: "branch_grazing",
                branchRevision: 1,
                explanationId: "grazing",
                status: "cannot_be_assessed" as const,
                reason: "Grazing cannot be assessed from satellite greenness alone.",
              },
            ],
            conflicts: [],
            provenance: {
              sourceLocators: [],
              dataBundleIds: [],
              methodId: null,
              methodVersion: null,
              inputVersions: [],
              generatedByTaskId: null,
              generatedAt: "2026-01-01T00:00:00Z",
              verificationStatus: "computed_checked" as const,
              limitations: [],
            },
          },
        ],
      },
    };
    expect(answerForCase(withMerge)).toEqual({
      claim: "Since 2000 the valley has greened, not browned.",
      limit: "From space we cannot tell whether grazing played a part.",
    });

    // Direction-neutral case (Calaveras Creek style: 0% upward and downward FDR share)
    const neutralRecords = {
      ...seed.records,
      branchMergeRecords: [],
      measurementRecords: seed.records.measurementRecords.map((m) =>
        m.metric === "area_share_upward_fdr" || m.metric === "area_share_downward_fdr"
          ? { ...m, value: 0 }
          : m,
      ),
    };
    expect(answerForCase({ ...seed, records: neutralRecords })).toEqual({
      claim: "Since 2000 no clear change in greenness across the catchment.",
      limit: null,
    });

    // Live place missing vegetation
    const missingVegRecords = {
      ...seed.records,
      branchMergeRecords: [],
      measurementRecords: seed.records.measurementRecords.map((m) =>
        m.metric === "ndvi_trend_unadjusted_per_decade"
          ? {
              ...m,
              value: null,
              status: "missing" as const,
              missingReason: "Requires a 25-year MODIS or Sentinel-2 growing-season NDVI series.",
            }
          : m,
      ),
    };
    expect(answerForCase({ ...seed, records: missingVegRecords })).toEqual({
      claim: "Not answered yet: vegetation has not been measured here.",
      limit: "None of the 5 explanations can be tested without it.",
    });
  });

  it("builds hairline-divided key-value rows and plain-English headlines for OverviewRecord from the case findings", () => {
    const band = byId.band;
    if (!band) throw new Error("missing band finding");
    const limit = bandLimit?.display ?? "";
    expect(overviewLabelOf(band, limit, findings)).toEqual({
      title: "Valley floor greening most",
      subtitle: "1.5 times the whole valley",
    });
    expect(recordHeadlineForFinding(band, findings, limit)).toBe(
      "Greened 1.5× faster than the whole valley since 2000.",
    );
    const rows = recordRowsForFinding(band, findings, limit);
    expect(rows[0]).toEqual({ label: "Valley floor", value: "+5.0% per decade" });
    expect(rows[1]).toEqual({ label: "Whole valley", value: "+4.4% per decade" });
  });
});
