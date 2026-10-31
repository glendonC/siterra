import { describe, expect, it } from "vitest";
import { LayerStackParameters, acceptedCaseSchemaVersions, caseSchemaVersion } from "./case.ts";

const stack = {
  kind: "layer_stack",
  geoSelectionId: "geo_example_catchment",
  relief: { bundleId: "bundle_example_relief", assetKey: "elevation_surface" },
  layers: [
    { layer: "rainfall", data: { bundleId: "bundle_example_chirps", assetKey: "rainfall_cells" } },
  ],
  drainageFeatureIds: [],
  placeFeatureIds: [],
  selectedLayer: "rainfall",
};
const window = {
  id: "oct_apr",
  start: { month: "october", year: "previous_year" },
  end: { month: "april", year: "same_year" },
};
const ok = (value: unknown) => LayerStackParameters.safeParse(value).success;

describe("contracts 1.21: the rainfall window of a layer stack", () => {
  it("accepts 1.21.0 and every earlier version of the same MAJOR", () => {
    for (const earlier of ["1.2.0", "1.19.0", "1.20.0", caseSchemaVersion]) {
      expect(acceptedCaseSchemaVersions).toContain(earlier);
    }
  });

  it("keeps a layer stack without a window valid and accepts one with the window the rain sheet sums", () => {
    expect(ok(stack)).toBe(true);
    expect(ok({ ...stack, rainfallWindow: window })).toBe(true);
    expect(
      ok({
        ...stack,
        rainfallWindow: { ...window, start: { month: "september", year: "previous_year" } },
      }),
    ).toBe(true);
  });

  it("refuses a month that is not a month word, a year other than the two fixed words, a missing part, a number or a stray key", () => {
    for (const bad of [
      { ...window, start: { month: "octobre", year: "previous_year" } },
      { ...window, start: { month: 10, year: "previous_year" } },
      { ...window, start: { month: "janvier", year: "previous_year" } },
      { ...window, end: { month: "avril", year: "same_year" } },
      { ...window, start: { month: "October", year: "previous_year" } },
      { ...window, end: { month: "april", year: "next_year" } },
      { ...window, start: { month: "october", year: "next_year" } },
      { ...window, end: { month: "april", year: -1 } },
      { ...window, id: "Oct Apr" },
      { ...window, label: "October to April" },
      { id: window.id, start: window.start },
      { ...window, extra: 1 },
      null,
    ]) {
      expect(ok({ ...stack, rainfallWindow: bad })).toBe(false);
    }
  });
});
