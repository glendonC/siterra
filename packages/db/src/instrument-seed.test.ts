import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { BranchMerge, Evidence, Hypothesis } from "@siterra/contracts";
import { composeInstruments } from "@siterra/domain";
import { analysisConfigFor } from "@siterra/domain/cases";
import { describe, expect, it } from "vitest";
import { instrumentReferencedIds, uncitedInstrumentInputs } from "@siterra/domain";
import { readCaseSeed } from "./case-seed.ts";

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const { seed, issues, blocked } = readCaseSeed({
  repoDir,
  mode: "concept",
  ownerScopeId: "seed",
  importedAt: "2026-10-27T20:00:00Z",
});
const measurements = new Map(
  (seed?.bundles ?? []).flatMap((b) => b.measurements).map((m) => [m.id, m]),
);

describe("the instruments the case seed composes", () => {
  it("compose from the configuration without an issue", () => {
    expect(issues).toEqual([]);
  });

  it("hold the instruments whose inputs the case has, each ready and citing everything it names", () => {
    expect(seed?.instruments.map((s) => s.id).sort()).toEqual(
      [
        "inst_cross_section_valley",
        "inst_layer_stack_valley",
        "inst_pixel_anatomy_valley",
        "inst_rainfall_scatter_valley",
      ].sort(),
    );
    for (const spec of seed?.instruments ?? []) {
      expect(spec.status).toBe("ready");
      expect(uncitedInstrumentInputs(spec)).toEqual([]);
      for (const id of instrumentReferencedIds(spec)) {
        const known = [
          seed?.geoSelections,
          seed?.contextFeatures,
          seed?.evidence,
          seed?.bundles.map((b) => b.dataBundle),
          [...measurements.values()],
        ]
          .flat()
          .some((r) => r?.id === id);
        expect(known, `${spec.id} names ${id}`).toBe(true);
      }
    }
  });

  it("write only numbers the cited Measurements hold, rounded once", () => {
    const rain = seed?.instruments.find((s) => s.id === "inst_rainfall_scatter_valley");
    const r2 = measurements.get("meas_rainfall_fit_r_squared_catchment_mar_jun");
    expect(r2?.value).toBeCloseTo(0.03699, 5);
    expect(rain?.caption.ink).toBe(
      "September to May rainfall explains little of the change in March to June greenness (R squared 0.037).",
    );
    const pixel = seed?.instruments.find((s) => s.id === "inst_pixel_anatomy_valley");
    expect(pixel?.caption).toMatchObject({
      ink: "This 250 m pixel at the valley floor edge got greener by +0.0570 NDVI per decade from 2000 to 2025.",
      grey: "Tree cover and cropland fill 46% of it, and in a mix of its own spectra, a larger share of them raises NDVI by itself.",
    });
  });

  it("compose the layer stack and the cross section on the relief bundle, with the captions the Measurements give", () => {
    const stack = seed?.instruments.find((s) => s.id === "inst_layer_stack_valley");
    expect(stack?.parameters).toMatchObject({
      kind: "layer_stack",
      relief: { bundleId: "bundle_relief_ait_bouguemez", assetKey: "elevation_surface" },
      selectedLayer: "vegetation_trend",
      drainageFeatureIds: [1, 2, 3, 4, 5].map((n) => `ctx_drainage_order_${String(n)}`),
    });
    expect(
      stack?.parameters.kind === "layer_stack" && stack.parameters.layers.map((l) => l.layer),
    ).toEqual(["vegetation_trend", "rainfall", "snow_cover", "land_cover", "elevation_bands"]);
    // The captions of the approved specimens, with numbers from Measurements rounded once
    expect(stack?.caption).toMatchObject({
      ink: "+0.0091 NDVI per decade, March to June, 2000 to 2025",
      grey: "Rises on 24.7% of the area after a false discovery rate check.",
    });

    const section = seed?.instruments.find((s) => s.id === "inst_cross_section_valley");
    expect(section?.parameters).toMatchObject({
      kind: "cross_section",
      transectFeatureId: "ctx_transect_tabant_meridian",
      statements: [
        { evidenceId: "ev_valley_bottom_cultivated_sci03", placement: "valley_floor" },
        { evidenceId: "ev_upper_rangelands_vegetation_sci19", placement: "upper_slope" },
      ],
    });
    expect(section?.caption).toMatchObject({
      ink: "+0.0134 NDVI per decade below 2,317 m, March to June, 2000 to 2025",
      grey: "Band averages over the whole catchment; every 95% interval lies above zero.",
    });
    for (const [id, printed] of [
      ["meas_trend_unadjusted_elevation_low_mar_jun", 0.0134],
      ["meas_trend_unadjusted_elevation_mid_mar_jun", 0.0072],
      ["meas_trend_unadjusted_elevation_high_mar_jun", 0.007],
    ] as const) {
      expect(Math.abs((measurements.get(id)?.value ?? Number.NaN) - printed)).toBeLessThan(0.00006);
    }
  });

  it("carry the approved wording of the statements they place, each resting on the Evidence it cites", () => {
    const section = seed?.instruments.find((s) => s.id === "inst_cross_section_valley")?.parameters;
    const pixel = seed?.instruments.find((s) => s.id === "inst_pixel_anatomy_valley")?.parameters;
    expect(section?.kind === "cross_section" && section.statements.map((s) => s.display)).toEqual([
      {
        text: "Irrigated valley floor, about 1,800 to 2,200 m, with more than thirty villages.",
        evidenceIds: [
          "ev_valley_bottom_cultivated_sci03",
          "ev_valley_bottom_irrigated_sci19",
          "ev_valley_altitude_range_sci19",
          "ev_valley_villages_sci19",
        ],
      },
      {
        text: "Upper rangelands: mainly spiny xerophytic vegetation and reduced areas of short grasslands.",
        evidenceIds: ["ev_upper_rangelands_vegetation_sci19"],
      },
    ]);
    expect(pixel?.kind === "pixel_anatomy" && pixel.contextDisplay?.map((d) => d.text)).toEqual([
      "Herders report losing palatable species (Astragalus armatus, Thymus satureioides) and the spread of unpalatable plants (Thymelaea virgata, Euphorbia nicaeensis).",
      "Upper rangelands: mainly spiny xerophytic vegetation and reduced areas of short grasslands.",
    ]);
    // Never the reporting-voice Evidence text, and never the population figure
    const shown = JSON.stringify([section, pixel]);
    expect(shown).not.toContain("15,000");
    expect(shown).not.toContain("SCI-03 says that herders");
  });

  it("name every asset an instrument draws, so no client builds an address from a hash", () => {
    const roles = (id: string) => {
      const p = seed?.instruments.find((s) => s.id === id)?.parameters;
      return p === undefined || p.kind === "field_plan"
        ? []
        : (p.drawnAssets ?? []).map((d) => [
            d.role,
            d.asset.bundleId.replace(/^bundle_|_ait_bouguemez$/g, ""),
            d.asset.assetKey,
          ]);
    };
    expect(roles("inst_pixel_anatomy_valley")).toEqual([
      ["pixel_cells", "pixel_anatomy", "pixel_cells"],
      ["pixel_spectra", "pixel_anatomy", "pixel_spectra"],
      ["pixel_series", "pixel_anatomy", "pixel_series"],
      ["catchment_outline", "terrain_strata", "analysis_geometry"],
      ["trend_cells", "pixel_trend_long_record", "trend_cells"],
    ]);
    expect(roles("inst_cross_section_valley").slice(0, 3)).toEqual([
      ["transect_summary", "transects", "terrain_transects"],
      ["catchment_outline", "terrain_strata", "analysis_geometry"],
      ["drainage_segments", "drainage_network", "drainage_lines"],
    ]);
    expect(roles("inst_layer_stack_valley").map((r) => r[0])).toEqual([
      "trend_summary",
      "pixel_trend_summary",
      "rainfall_fit",
      "catchment_outline",
      "drainage_segments",
      "relief_grid",
      "relief_grid_header",
      "land_cover_raster",
      "land_cover_header",
      "elevation_band_raster",
      "elevation_band_header",
      "trend_cells",
    ]);
    expect(roles("inst_cross_section_valley").map((r) => r[0])).toEqual([
      "transect_summary",
      "catchment_outline",
      "drainage_segments",
      "relief_grid",
      "relief_grid_header",
      "land_cover_raster",
      "land_cover_header",
    ]);
    expect(
      roles("inst_cross_section_valley")
        .slice(5)
        .map((r) => [r[1], r[2]]),
    ).toEqual([
      ["land_cover", "land_cover_png"],
      ["land_cover", "land_cover_png_header"],
    ]);
    // The web-ready display assets of SCIENCE-GEO's S7, by their bundle and key
    expect(
      roles("inst_layer_stack_valley")
        .slice(5)
        .map((r) => [r[1], r[2]]),
    ).toEqual([
      ["relief", "elevation_surface_bin"],
      ["relief", "elevation_surface_bin_header"],
      ["land_cover", "land_cover_png"],
      ["land_cover", "land_cover_png_header"],
      ["terrain_strata", "elevation_band_png"],
      ["terrain_strata", "elevation_band_png_header"],
      ["pixel_trend_long_record", "trend_cells"],
    ]);
    expect(roles("inst_rainfall_scatter_valley")).toEqual([]);
  });

  it("guard the words 'greener' and 'every interval lies above zero' with held claims on the records", () => {
    const rules = analysisConfigFor("case_aitbouguemez")?.instruments ?? [];
    const holds = (id: string) => {
      const rule = rules.find((r) => r.id === id);
      return rule?.from === "parameters" ? (rule.caption.holds ?? []) : [];
    };
    expect(holds("pixel_anatomy_valley")).toEqual([
      { measurementId: "meas_pixel_anatomy_trend_mar_jun_pixel", part: "lower", above: 0 },
    ]);
    expect(holds("cross_section_valley")).toEqual(
      [
        "meas_trend_unadjusted_elevation_low_mar_jun",
        "meas_trend_unadjusted_elevation_mid_mar_jun",
        "meas_trend_unadjusted_elevation_high_mar_jun",
      ].map((measurementId) => ({ measurementId, part: "lower", above: 0 })),
    );
    // The claim about mixing cites the two modelled values it rests on
    const pixel = seed?.instruments.find((s) => s.id === "inst_pixel_anatomy_valley");
    expect(pixel?.caption.citationIds).toEqual(
      expect.arrayContaining([
        "meas_pixel_anatomy_ndvi_mix_model_2025_06",
        "meas_pixel_anatomy_ndvi_mix_tree_cover_plus20_2025_06",
      ]),
    );
    const mix = measurements.get("meas_pixel_anatomy_ndvi_mix_model_2025_06")?.value ?? 0;
    const shifted =
      measurements.get("meas_pixel_anatomy_ndvi_mix_tree_cover_plus20_2025_06")?.value ?? 0;
    expect(shifted).toBeGreaterThan(mix);
  });

  it("composes the field plan from the recorded live run's merge and the records its hypotheses rest on", () => {
    const recorded = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL(
            "../../contracts/fixtures/recorded-live-run-2026-10-28-branch-merge.json",
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    ) as { records: Record<string, unknown[]> };
    const config = analysisConfigFor("case_aitbouguemez");
    if (config === null || seed === null) throw new Error("the case has no configuration");
    const result = composeInstruments({
      caseId: "case_aitbouguemez",
      config,
      openExplanationIds: config.explanations.map((e) => e.id),
      geoSelectionId: seed.geoSelections[0]?.id ?? "",
      geoSelections: seed.geoSelections,
      dataBundles: seed.bundles.map((b) => b.dataBundle),
      contextFeatures: seed.contextFeatures,
      measurements: [...measurements.values()],
      evidence: [
        ...seed.evidence,
        ...(recorded.records["evidenceRecords"] ?? []).map((r) => Evidence.parse(r)),
      ],
      branchMerges: (recorded.records["branchMergeRecords"] ?? []).map((r) => BranchMerge.parse(r)),
      hypotheses: (recorded.records["hypothesisRecords"] ?? []).map((r) => Hypothesis.parse(r)),
      hasAsset: () => true,
      now: "2026-10-29T20:00:00Z",
    });
    const plan = result.specs.find((s) => s.id === "inst_field_plan_valley");
    expect(plan?.parameters).toMatchObject({
      kind: "field_plan",
      branchMergeId: "merge_35d821154a3396cb0178d137b087040b",
      actionId: null,
    });
    expect(plan?.caption.citationIds.length).toBeGreaterThan(0);
    expect(plan?.caption.citationIds.length).toBeLessThanOrEqual(8);
    expect(plan?.caption.claimKind).toBe("field_requirement");
  });

  it("report the rules that wait on inputs the seed lacks, with the reason, and write no spec for them", () => {
    expect(blocked.map((b) => b.ruleId)).toEqual(["field_plan_valley"]);
    expect(blocked[0]?.reasons[0]).toBe("The case holds no branch merge with a field plan");
    for (const b of blocked) {
      expect(seed?.instruments.map((s) => s.id)).not.toContain(`inst_${b.ruleId}`);
    }
  });
});
