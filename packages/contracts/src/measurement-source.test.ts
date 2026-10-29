import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Measurement, acceptedCaseSchemaVersions, caseSchemaVersion } from "./case.ts";

const schemasDir = fileURLToPath(new URL("../../../schemas/", import.meta.url));

type Json = { [key: string]: unknown };

const at = "2026-10-29T10:00:00-04:00";

const source = {
  assetKey: "season_trend_long_record",
  jsonPointer: "/results/0/ols/slope_per_decade",
  stratum: "catchment",
  claimKind: "model_estimate",
  period: { start: "2000", end: "2025", window: "mar_jun" },
  lowerJsonPointer: "/results/0/ols/slope_ci_lower",
  upperJsonPointer: "/results/0/ols/slope_ci_upper",
};

function measurement(overrides: Json = {}): Json {
  return {
    recordType: "Measurement",
    id: "meas_trend_catchment_mar_jun",
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId: "case_example_atlas",
    metric: "ndvi_trend_per_decade",
    value: 0.00906,
    unit: "NDVI per decade",
    status: "available",
    missingReason: null,
    geoSelectionId: "geo_example_catchment",
    geoRevision: 1,
    periodId: "period_2000-2025_mar_jun",
    dataBundleId: "bundle_example_trend",
    aggregation: "Ordinary least squares slope of the catchment mean series",
    validPixelCount: null,
    totalPixelCount: null,
    validFraction: null,
    spatialResolutionM: 250,
    uncertainty: {
      kind: "interval",
      lower: 0.00457,
      upper: 0.01356,
      level: 0.95,
      method: "95% interval of the slope",
    },
    provenance: {
      sourceLocators: [],
      dataBundleIds: [],
      methodId: "season_trend_long_record",
      methodVersion: "1.0.0",
      inputVersions: [],
      generatedByTaskId: null,
      generatedAt: at,
      verificationStatus: "computed_checked",
      limitations: [],
    },
    source,
    ...overrides,
  };
}

function problems(value: unknown) {
  const result = Measurement.safeParse(value);
  return (result.error?.issues ?? []).map((issue) => ({ code: issue.code, path: issue.path }));
}

describe("contracts 1.13: the version", () => {
  it("is 1.13.0 and still accepts every earlier version of the same MAJOR", () => {
    expect(caseSchemaVersion).toBe("1.13.0");
    expect(acceptedCaseSchemaVersions.at(-1)).toBe("1.13.0");
    for (const earlier of ["1.2.0", "1.10.0", "1.11.0", "1.12.0"]) {
      expect(acceptedCaseSchemaVersions).toContain(earlier);
    }
  });
});

describe("contracts 1.13: a Measurement may say where its number was read", () => {
  it("accepts a source with an interval, and a Measurement without one as before", () => {
    expect(problems(measurement())).toEqual([]);
    const { source: _omitted, ...plain } = measurement();
    expect(problems(plain)).toEqual([]);
  });

  it("accepts a single month and a source with no interval pointers", () => {
    const month = {
      ...source,
      period: { start: "2019-01", end: "2019-01", window: null },
      lowerJsonPointer: null,
      upperJsonPointer: null,
    };
    expect(problems(measurement({ source: month, periodId: "period_2019-01" }))).toEqual([]);
  });

  it("refuses a pointer that is not a JSON pointer", () => {
    for (const jsonPointer of ["results/0", "", "#/results/0", "$.results[0]"]) {
      expect(problems(measurement({ source: { ...source, jsonPointer } }))).not.toEqual([]);
    }
    expect(
      problems(measurement({ source: { ...source, lowerJsonPointer: "ci_lower" } })),
    ).not.toEqual([]);
  });

  it("refuses interval pointers that are not both present or both null", () => {
    expect(problems(measurement({ source: { ...source, upperJsonPointer: null } }))).not.toEqual(
      [],
    );
    expect(problems(measurement({ source: { ...source, lowerJsonPointer: null } }))).not.toEqual(
      [],
    );
  });

  it("refuses a claim kind outside the Evidence list, an empty stratum and a bad period", () => {
    expect(problems(measurement({ source: { ...source, claimKind: "forecast" } }))).not.toEqual([]);
    expect(problems(measurement({ source: { ...source, stratum: "" } }))).not.toEqual([]);
    for (const period of [
      { start: "2000-1", end: "2025", window: "mar_jun" },
      { start: "2000", end: "2025" },
      { start: "2000", end: "2025", window: "" },
      { start: "2000", end: "2025", window: "mar_jun", extra: 1 },
    ]) {
      expect(problems(measurement({ source: { ...source, period } }))).not.toEqual([]);
    }
  });

  it("refuses a source with an unknown key, an empty asset key or a missing field", () => {
    expect(
      problems(measurement({ source: { ...source, url: "https://example.org" } })),
    ).not.toEqual([]);
    expect(problems(measurement({ source: { ...source, assetKey: "" } }))).not.toEqual([]);
    const { stratum: _stratum, ...incomplete } = source;
    expect(problems(measurement({ source: incomplete }))).not.toEqual([]);
  });

  it("is in the JSON schema as an optional closed object", () => {
    const schema = JSON.parse(readFileSync(`${schemasDir}case.schema.json`, "utf8")) as Json;
    const defs = schema["$defs"] as Json;
    const measurementDef = defs["Measurement"] as Json;
    const properties = measurementDef["properties"] as Json;
    expect(Object.keys(properties)).toContain("source");
    expect(measurementDef["required"] as string[]).not.toContain("source");
    const sourceDef = defs["MeasurementSource"] as Json;
    expect(sourceDef["additionalProperties"]).toBe(false);
    expect(Object.keys(sourceDef["properties"] as Json).sort()).toEqual(
      [
        "assetKey",
        "claimKind",
        "jsonPointer",
        "lowerJsonPointer",
        "period",
        "stratum",
        "upperJsonPointer",
      ].sort(),
    );
  });
});
