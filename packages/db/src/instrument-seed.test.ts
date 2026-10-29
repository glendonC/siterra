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
      ["inst_pixel_anatomy_valley", "inst_rainfall_scatter_valley"].sort(),
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

  it("report the rules that wait on inputs the seed lacks, with the reason, and write no spec for them", () => {
    const byRule = new Map(blocked.map((b) => [b.ruleId, b]));
    expect(byRule.get("layer_stack_valley")?.reasons).toEqual([
      "The bundle bundle_relief_ait_bouguemez is not in the case",
    ]);
    expect(byRule.get("field_plan_valley")?.reasons[0]).toBe(
      "The case holds no branch merge with a field plan",
    );
    for (const b of blocked) {
      expect(seed?.instruments.map((s) => s.id)).not.toContain(`inst_${b.ruleId}`);
    }
  });
});
