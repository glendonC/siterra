import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Measurement } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { readCaseSeed } from "./case-seed.ts";
import { MeasurementRowsFile } from "./measurement-rows.ts";

// The elevation band limits as Measurements: the strata bundle that defines the bands states them
// in its collection (siterra:method.parameters.boundaries_m); a transect's crossing of a band
// boundary keeps its own meaning under its own metric. The numbers are read from the files here.

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const base = {
  repoDir,
  mode: "concept" as const,
  ownerScopeId: "seed",
  importedAt: "2026-10-30T13:00:00Z",
};

const places = [
  { place: "ait_bouguemez", seedDir: undefined, crossings: ["lower", "upper"] },
  { place: "calaveras_creek", seedDir: "data/case/calaveras-creek", crossings: ["lower"] },
];

function boundaries(place: string): number[] {
  const collection = JSON.parse(
    readFileSync(`${repoDir}data/bundles/bundle_terrain_strata_${place}/collection.json`, "utf8"),
  ) as { "siterra:method": { parameters: { boundaries_m: number[] } } };
  return collection["siterra:method"].parameters.boundaries_m;
}

describe.each(places)("the band limits of $place", ({ place, seedDir, crossings }) => {
  const result = readCaseSeed({ ...base, ...(seedDir ? { seedDir } : {}) });
  const all: Measurement[] = (result.seed?.bundles ?? []).flatMap((b) => b.measurements);
  const limits = all.filter((m) => m.metric === "elevation_band_limit");
  const bundle = `bundle_terrain_strata_${place}`;

  it("load without an issue", () => {
    expect(result.issues).toEqual([]);
  });

  it("are exactly one lower and one upper, both from the strata bundle that defines the bands", () => {
    expect(limits.map((m) => [m.id, m.source?.stratum]).sort()).toEqual([
      ["meas_strata_band_limit_lower_2021", "elevation_band_limit_lower"],
      ["meas_strata_band_limit_upper_2021", "elevation_band_limit_upper"],
    ]);
    for (const m of limits) {
      expect(m.dataBundleId).toBe(bundle);
      expect(m.unit).toBe("m");
      expect(m.source?.assetKey).toBe("collection");
      expect(m.aggregation).toMatch(/band definition/i);
      expect(m.aggregation).toMatch(/not a transect crossing/i);
    }
  });

  it("copy the boundaries the bundle states, lower first", () => {
    const [lower, upper] = boundaries(place);
    const by = (id: string) => limits.find((m) => m.id === id)?.value;
    expect(by("meas_strata_band_limit_lower_2021")).toBe(lower);
    expect(by("meas_strata_band_limit_upper_2021")).toBe(upper);
    expect(lower).toBeLessThan(upper ?? Number.NaN);
  });

  it("agree with the transect crossings, which keep their own metric", () => {
    const crossing = all.filter((m) => m.metric === "transect_band_crossing_boundary");
    expect(crossing.map((m) => m.id).sort()).toEqual(
      crossings.map((c) => `meas_transect_band_limit_${c}_2021`).sort(),
    );
    for (const c of crossings) {
      const strata = limits.find((m) => m.id === `meas_strata_band_limit_${c}_2021`);
      const transect = crossing.find((m) => m.id === `meas_transect_band_limit_${c}_2021`);
      expect(transect?.value, c).toBe(strata?.value);
      expect(transect?.dataBundleId).toMatch(/^bundle_transects_/);
    }
  });
});

describe("a row that states no claim kind in its asset", () => {
  const row = {
    rowId: "x",
    bundleId: "bundle_x",
    assetKey: "collection",
    pointer: "/a",
    lowerPointer: null,
    upperPointer: null,
    claimKindPointer: null,
    claimKind: "observation",
    metric: "m",
    unit: "u",
    aggregation: "a",
    stratum: "s",
    period: { start: "2021", end: "2021", window: null },
    periodId: "period_2021",
    uncertainty: { kind: "not_quantified" },
    spatialResolutionM: null,
    usedBy: [],
  };
  const parse = (r: unknown) =>
    MeasurementRowsFile.safeParse({
      measurementRowsVersion: 1,
      caseId: "c",
      description: "d",
      rows: [r],
    }).success;

  it("is allowed only on the bundle's collection, the one document that cannot state it", () => {
    expect(parse(row)).toBe(true);
    expect(parse({ ...row, assetKey: "restrend_long_record" })).toBe(false);
  });

  it("still needs a pointer on every other asset", () => {
    expect(
      parse({ ...row, assetKey: "restrend_long_record", claimKindPointer: "/claim_kind" }),
    ).toBe(true);
  });
});
