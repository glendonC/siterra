import { fileURLToPath } from "node:url";
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
    expect(pixel?.caption.ink).toBe(
      "A mix of the pixel's land cover classes gives a greenness of 0.445, against 0.4766 measured.",
    );
  });

  it("compose the layer stack and the cross section on the relief bundle, with the captions the Measurements give", () => {
    const stack = seed?.instruments.find((s) => s.id === "inst_layer_stack_valley");
    expect(stack?.parameters).toMatchObject({
      kind: "layer_stack",
      relief: { bundleId: "bundle_relief_ait_bouguemez", assetKey: "elevation_surface" },
      selectedLayer: "rainfall",
      drainageFeatureIds: [1, 2, 3, 4, 5].map((n) => `ctx_drainage_order_${String(n)}`),
    });
    expect(
      stack?.parameters.kind === "layer_stack" && stack.parameters.layers.map((l) => l.layer),
    ).toEqual(["vegetation_trend", "rainfall", "snow_cover", "land_cover", "elevation_bands"]);
    expect(stack?.caption.ink).toBe(
      "The driest of the September to May seasons analysed here brought 369 mm of rain to the catchment.",
    );
    expect(measurements.get("meas_rainfall_sep_may_catchment_2001")?.value).toBeCloseTo(369.19, 2);

    const section = seed?.instruments.find((s) => s.id === "inst_cross_section_valley");
    expect(section?.parameters).toMatchObject({
      kind: "cross_section",
      transectFeatureId: "ctx_transect_tabant_meridian",
      statements: [
        { evidenceId: "ev_valley_bottom_cultivated_sci03", placement: "valley_floor" },
        { evidenceId: "ev_valley_villages_sci19", placement: "valley_floor" },
        { evidenceId: "ev_upper_rangelands_vegetation_sci19", placement: "upper_slope" },
      ],
    });
    expect(section?.caption.ink).toBe(
      "March to June greenness rose in all three elevation bands, by 0.0134, 0.0072 and 0.0070 NDVI per decade from the lowest to the highest.",
    );
    for (const [id, printed] of [
      ["meas_trend_unadjusted_elevation_low_mar_jun", 0.0134],
      ["meas_trend_unadjusted_elevation_mid_mar_jun", 0.0072],
      ["meas_trend_unadjusted_elevation_high_mar_jun", 0.007],
    ] as const) {
      expect(Math.abs((measurements.get(id)?.value ?? Number.NaN) - printed)).toBeLessThan(0.00006);
    }
  });

  it("report the rules that wait on inputs the seed lacks, with the reason, and write no spec for them", () => {
    expect(blocked.map((b) => b.ruleId)).toEqual(["field_plan_valley"]);
    expect(blocked[0]?.reasons[0]).toBe("The case holds no branch merge with a field plan");
    for (const b of blocked) {
      expect(seed?.instruments.map((s) => s.id)).not.toContain(`inst_${b.ruleId}`);
    }
  });
});
