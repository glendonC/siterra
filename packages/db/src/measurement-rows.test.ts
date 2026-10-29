import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ImportedBundle, sha256Multihash } from "./bundle-import.ts";
import {
  type MeasurementRowsFile,
  MeasurementRow,
  readMeasurementRows,
  readPointer,
} from "./measurement-rows.ts";

const at = "2026-10-29T10:00:00.000Z";
const bundleId = "bundle_example_trend";
const asset = {
  claim_kind: { trends: "model_estimate", baseline: "observation" },
  results: [
    { stratum: "catchment", ols: { slope: 0.00906, lo: 0.00457, hi: 0.01356 } },
    { stratum: "elevation_low", ols: { slope: 0.0134, lo: 0.00778, hi: 0.01902 } },
  ],
  "a/b": { "m~n": [7, 8] },
  text: "not a number",
};

let dir: string;
let bundle: ImportedBundle;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "siterra-rows-"));
  mkdirSync(join(dir, bundleId));
  // 1e999 is valid JSON text that parses to Infinity
  const bytes = Buffer.from(JSON.stringify(asset).replace(/}$/, ',"big":1e999}'));
  writeFileSync(join(dir, bundleId, "trend.json"), bytes);
  const collection = Buffer.from(
    JSON.stringify({
      assets: {
        trend: {
          href: "./trend.json",
          "file:checksum": sha256Multihash(bytes),
          type: "application/json",
        },
      },
      links: [],
    }),
  );
  writeFileSync(join(dir, bundleId, "collection.json"), collection);
  bundle = {
    dataBundle: {
      id: bundleId,
      revision: 1,
      contentHash: sha256Multihash(collection),
      provenance: {
        sourceLocators: [],
        dataBundleIds: [],
        methodId: "example_trend",
        methodVersion: "1.0.0",
        inputVersions: [{ entityId: "geo_example_catchment", revision: 1 }],
        generatedByTaskId: null,
        generatedAt: at,
        verificationStatus: "computed_checked",
        limitations: [],
      },
    },
    temporalObservations: [],
    measurements: [],
  } as unknown as ImportedBundle;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const row = (overrides: Record<string, unknown> = {}) =>
  MeasurementRow.parse({
    rowId: "trend_catchment_mar_jun",
    bundleId,
    assetKey: "trend",
    pointer: "/results/0/ols/slope",
    lowerPointer: "/results/0/ols/lo",
    upperPointer: "/results/0/ols/hi",
    claimKindPointer: "/claim_kind/trends",
    claimKind: "model_estimate",
    metric: "ndvi_trend_per_decade",
    unit: "NDVI per decade",
    aggregation: "Ordinary least squares slope of the catchment series",
    stratum: "catchment",
    period: { start: "2000", end: "2025", window: "mar_jun" },
    periodId: "period_2000-2025_mar_jun",
    uncertainty: { kind: "interval", level: 0.95, method: "95% interval of the slope" },
    spatialResolutionM: 250,
    usedBy: ["test"],
    ...overrides,
  });

function load(rows: ReturnType<typeof row>[]) {
  const file: MeasurementRowsFile = {
    measurementRowsVersion: 1,
    caseId: "case_example_atlas",
    description: "test rows",
    rows,
  };
  return readMeasurementRows({
    rows: file,
    caseId: "case_example_atlas",
    bundlesDir: dir,
    bundles: [bundle],
    geoSelection: { id: "geo_example_catchment", revision: 1 },
    importedAt: at,
  });
}

describe("readPointer: RFC 6901", () => {
  it("follows keys and array positions, and unescapes ~1 and ~0", () => {
    expect(readPointer(asset, "/results/1/stratum")).toBe("elevation_low");
    expect(readPointer(asset, "/a~1b/m~0n/1")).toBe(8);
  });

  it("returns undefined for a missing key, an out-of-range position and a leading zero", () => {
    expect(readPointer(asset, "/results/2")).toBeUndefined();
    expect(readPointer(asset, "/results/01")).toBeUndefined();
    expect(readPointer(asset, "/nope")).toBeUndefined();
    expect(readPointer(asset, "/text/0")).toBeUndefined();
  });
});

describe("readMeasurementRows: the value is read from the asset, never typed in", () => {
  it("copies the value and the interval and records where they were read", () => {
    const { measurements, issues } = load([row()]);
    expect(issues).toEqual([]);
    const [m] = measurements.get(bundleId) ?? [];
    expect(m?.id).toBe("meas_trend_catchment_mar_jun");
    expect(m?.value).toBe(0.00906);
    expect(m?.uncertainty).toEqual({
      kind: "interval",
      lower: 0.00457,
      upper: 0.01356,
      level: 0.95,
      method: "95% interval of the slope",
    });
    expect(m?.source?.jsonPointer).toBe("/results/0/ols/slope");
    expect(m?.provenance.inputVersions).toContainEqual({ entityId: bundleId, revision: 1 });
  });

  it("follows another pointer to another number", () => {
    const { measurements } = load([
      row({
        rowId: "trend_low_mar_jun",
        pointer: "/results/1/ols/slope",
        lowerPointer: "/results/1/ols/lo",
        upperPointer: "/results/1/ols/hi",
        stratum: "elevation_low",
      }),
    ]);
    expect(measurements.get(bundleId)?.[0]?.value).toBe(0.0134);
  });

  it("refuses a pointer that does not name a finite number, and still loads the other rows", () => {
    const { measurements, issues } = load([
      row({
        rowId: "bad_text",
        pointer: "/text",
        lowerPointer: null,
        upperPointer: null,
        uncertainty: { kind: "not_quantified" },
      }),
      row({ rowId: "bad_missing", pointer: "/results/9/ols/slope" }),
      row(),
    ]);
    expect(issues.map((i) => i.path)).toEqual([
      "measurement-rows/bad_text",
      "measurement-rows/bad_missing",
    ]);
    expect(measurements.get(bundleId)?.map((m) => m.id)).toEqual(["meas_trend_catchment_mar_jun"]);
  });

  it("refuses a number that is not finite", () => {
    const { measurements, issues } = load([
      row({
        rowId: "too_big",
        pointer: "/big",
        lowerPointer: null,
        upperPointer: null,
        uncertainty: { kind: "not_quantified" },
      }),
    ]);
    expect(issues[0]?.message).toContain("does not name a finite number");
    expect(measurements.size).toBe(0);
  });

  it("refuses a claim kind that differs from the asset's", () => {
    const { measurements, issues } = load([row({ claimKind: "observation" })]);
    expect(issues[0]?.message).toContain("Claim kind");
    expect(measurements.size).toBe(0);
  });

  it("refuses a pointer to a claim kind that is absent", () => {
    const { issues } = load([row({ claimKindPointer: "/claim_kind/none" })]);
    expect(issues[0]?.message).toContain("Claim kind");
  });

  it("refuses an unknown bundle, an unknown asset key and a repeated row ID", () => {
    expect(load([row({ bundleId: "bundle_other" })]).issues[0]?.message).toBe(
      "Bundle is not in the case",
    );
    expect(load([row({ assetKey: "nope" })]).issues[0]?.message).toContain("asset_key_unknown");
    expect(load([row(), row()]).issues.map((i) => i.message)).toEqual(["Row ID is used twice"]);
  });

  it("refuses a bundle whose collection no longer matches the content hash the case holds", () => {
    const stale = {
      ...bundle,
      dataBundle: { ...bundle.dataBundle, contentHash: `1220${"0".repeat(64)}` },
    };
    const result = readMeasurementRows({
      rows: { measurementRowsVersion: 1, caseId: "c", description: "d", rows: [row()] },
      caseId: "case_example_atlas",
      bundlesDir: dir,
      bundles: [stale],
      geoSelection: { id: "geo_example_catchment", revision: 1 },
      importedAt: at,
    });
    expect(result.issues[0]?.message).toContain("file_unavailable");
    expect(result.measurements.size).toBe(0);
  });

  it("refuses a bundle that has no content hash to verify the asset against", () => {
    const unhashed = { ...bundle, dataBundle: { ...bundle.dataBundle, contentHash: null } };
    const result = readMeasurementRows({
      rows: { measurementRowsVersion: 1, caseId: "c", description: "d", rows: [row()] },
      caseId: "case_example_atlas",
      bundlesDir: dir,
      bundles: [unhashed],
      geoSelection: { id: "geo_example_catchment", revision: 1 },
      importedAt: at,
    });
    expect(result.issues[0]?.message).toContain("no content hash");
    expect(result.measurements.size).toBe(0);
  });

  it("refuses an interval row without interval pointers and the reverse", () => {
    expect(load([row({ lowerPointer: null, upperPointer: null })]).issues).toHaveLength(1);
    expect(load([row({ uncertainty: { kind: "not_quantified" } })]).issues).toHaveLength(1);
    expect(load([row({ upperPointer: null })]).issues[0]?.message).toContain(
      "both present or both null",
    );
  });
});
