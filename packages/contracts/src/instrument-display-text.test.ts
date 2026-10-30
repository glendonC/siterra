import { describe, expect, it } from "vitest";
import { InstrumentParameters, acceptedCaseSchemaVersions, caseSchemaVersion } from "./case.ts";

const ref = (bundleId: string, assetKey: string) => ({ bundleId, assetKey });
const section = (statements: unknown[]) => ({
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
  statements,
});
const pixel = (extra: Record<string, unknown> = {}) => ({
  kind: "pixel_anatomy",
  geoSelectionId: "geo_example_plain",
  locator: ref("bundle_example_trend", "grid"),
  anatomy: ref("bundle_example_pixel", "anatomy"),
  bandSeries: ref("bundle_example_trend", "series"),
  contextEvidenceIds: ["ev_example_a"],
  ...extra,
});
const display = (text: string, evidenceIds: string[] = ["ev_example_a"]) => ({ text, evidenceIds });
const ok = (value: unknown) => InstrumentParameters.safeParse(value).success;

describe("contracts 1.17: the display text of a placed statement", () => {
  it("accepts 1.17.0 and every earlier version of the same MAJOR", () => {
    expect(acceptedCaseSchemaVersions).toContain(caseSchemaVersion);
    expect(caseSchemaVersion).toBe("1.17.0");
    for (const earlier of ["1.2.0", "1.15.0", "1.16.0"]) {
      expect(acceptedCaseSchemaVersions).toContain(earlier);
    }
  });

  it("keeps a statement without display text valid and accepts display text on a cross section statement", () => {
    const plain = { evidenceId: "ev_example_a", placement: "valley_floor" };
    expect(ok(section([plain]))).toBe(true);
    expect(ok(section([{ ...plain, display: display("A valley floor, about 1,800 m.") }]))).toBe(
      true,
    );
    expect(
      ok(
        section([{ ...plain, display: display("Two sources.", ["ev_example_a", "ev_example_b"]) }]),
      ),
    ).toBe(true);
  });

  it("accepts display texts for a pixel's context statements", () => {
    expect(ok(pixel())).toBe(true);
    expect(ok(pixel({ contextDisplay: [display("Herders report a change.")] }))).toBe(true);
  });

  it("refuses an empty text, one over 200 characters, no evidence, repeated evidence, too many and an unknown key", () => {
    const plain = { evidenceId: "ev_example_a", placement: "valley_floor" };
    const withDisplay = (d: unknown) => ok(section([{ ...plain, display: d }]));
    expect(withDisplay(display(""))).toBe(false);
    expect(withDisplay(display("x".repeat(201)))).toBe(false);
    expect(withDisplay(display("x".repeat(200)))).toBe(true);
    expect(withDisplay(display("Fine.", []))).toBe(false);
    expect(withDisplay(display("Fine.", ["ev_example_a", "ev_example_a"]))).toBe(false);
    expect(withDisplay(display("Fine.", ["ev_a_1", "ev_a_2", "ev_a_3", "ev_a_4", "ev_a_5"]))).toBe(
      false,
    );
    expect(withDisplay({ ...display("Fine."), html: "<b>x</b>" })).toBe(false);
    expect(ok(pixel({ contextDisplay: Array.from({ length: 5 }, () => display("Fine.")) }))).toBe(
      false,
    );
  });
});
