import { describe, expect, it } from "vitest";
import { PixelAnatomyParameters, acceptedCaseSchemaVersions, caseSchemaVersion } from "./case.ts";

const anatomy = {
  kind: "pixel_anatomy",
  geoSelectionId: "geo_example_catchment",
  locator: { bundleId: "bundle_example_trend", assetKey: "pixel_trend_grid_feb_may" },
  anatomy: { bundleId: "bundle_example_anatomy", assetKey: "pixel_anatomy" },
  bandSeries: { bundleId: "bundle_example_season", assetKey: "season_trend_tables" },
  contextEvidenceIds: [],
};
const ok = (value: unknown) => PixelAnatomyParameters.safeParse(value).success;

describe("contracts 1.22: the question a pixel anatomy asks", () => {
  it("accepts 1.22.0 and every earlier version of the same MAJOR", () => {
    expect(caseSchemaVersion).toBe("1.22.0");
    for (const earlier of ["1.2.0", "1.20.0", "1.21.0", caseSchemaVersion]) {
      expect(acceptedCaseSchemaVersions).toContain(earlier);
    }
  });

  it("keeps a pixel anatomy without a question valid and accepts one with the words", () => {
    expect(ok(anatomy)).toBe(true);
    expect(ok({ ...anatomy, question: "What is one pixel's trend made of?" })).toBe(true);
    expect(ok({ ...anatomy, question: "x".repeat(120) })).toBe(true);
  });

  it("refuses an empty question, one over 120 characters and one that is not text", () => {
    for (const question of ["", "x".repeat(121), 7, null]) {
      expect(ok({ ...anatomy, question }), String(question)).toBe(false);
    }
  });
});
