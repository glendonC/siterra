import { describe, expect, it } from "vitest";
import { InstrumentParameters, acceptedCaseSchemaVersions, caseSchemaVersion } from "./case.ts";

const ref = (bundleId: string, assetKey: string) => ({ bundleId, assetKey });
const scatter = {
  kind: "rainfall_scatter",
  geoSelectionId: "geo_example_plain",
  seasons: ref("bundle_example_rain", "tables"),
  fit: ref("bundle_example_rain", "summary"),
};
const pixel = {
  kind: "pixel_anatomy",
  geoSelectionId: "geo_example_plain",
  locator: ref("bundle_example_trend", "grid"),
  anatomy: ref("bundle_example_pixel", "anatomy"),
  bandSeries: ref("bundle_example_trend", "series"),
  contextEvidenceIds: [],
};
const stack = {
  kind: "layer_stack",
  geoSelectionId: "geo_example_plain",
  relief: ref("bundle_example_relief", "surface"),
  layers: [{ layer: "rainfall", data: ref("bundle_example_rain", "cells") }],
  drainageFeatureIds: [],
  placeFeatureIds: [],
  selectedLayer: null,
};
const section = {
  kind: "cross_section",
  geoSelectionId: "geo_example_plain",
  transectFeatureId: "ctx_example_line",
  relief: ref("bundle_example_relief", "surface"),
  profile: ref("bundle_example_transects", "samples"),
  bands: ref("bundle_example_strata", "strata"),
  bandTrends: ref("bundle_example_trend", "summary"),
  snow: ref("bundle_example_snow", "tables"),
  drainageFeatureIds: [],
  placeFeatureIds: [],
  statements: [],
};
const drawn = [
  { role: "catchment_outline", asset: ref("bundle_example_strata", "analysis_geometry") },
  { role: "pixel_cells", asset: ref("bundle_example_pixel", "cells") },
];
const ok = (value: unknown) => InstrumentParameters.safeParse(value).success;

describe("contracts 1.16: the assets an instrument draws", () => {
  it("accepts 1.16.0 and every earlier version of the same MAJOR", () => {
    expect(acceptedCaseSchemaVersions).toContain(caseSchemaVersion);
    for (const earlier of ["1.2.0", "1.14.0", "1.15.0", "1.16.0"]) {
      expect(acceptedCaseSchemaVersions).toContain(earlier);
    }
  });

  it("keeps a spec without them valid and accepts them on every kind that draws", () => {
    for (const p of [scatter, pixel, stack, section]) {
      expect(ok(p), p.kind).toBe(true);
      expect(ok({ ...p, drawnAssets: drawn }), p.kind).toBe(true);
      expect(ok({ ...p, drawnAssets: [] }), p.kind).toBe(true);
    }
  });

  it("refuses a repeated role, a role that is not a plain word, a URL, an unknown key and too many", () => {
    expect(ok({ ...pixel, drawnAssets: [drawn[0], drawn[0]] })).toBe(false);
    expect(
      ok({
        ...pixel,
        drawnAssets: [drawn[0], { role: "catchment_outline", asset: drawn[1]?.asset }],
      }),
    ).toBe(false);
    expect(
      ok({ ...pixel, drawnAssets: [{ role: "Catchment Outline", asset: drawn[0]?.asset }] }),
    ).toBe(false);
    expect(
      ok({
        ...pixel,
        drawnAssets: [{ role: "outline", asset: drawn[0]?.asset, href: "https://x.test" }],
      }),
    ).toBe(false);
    expect(
      ok({
        ...pixel,
        drawnAssets: [{ role: "outline", asset: { ...drawn[0]?.asset, url: "https://x.test" } }],
      }),
    ).toBe(false);
    const many = Array.from({ length: 13 }, (_, i) => ({
      role: `role_${String(i)}`,
      asset: ref("bundle_example_a", "k"),
    }));
    expect(ok({ ...pixel, drawnAssets: many })).toBe(false);
  });
});
