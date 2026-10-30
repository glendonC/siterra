import { describe, expect, it } from "vitest";
import { ContextFeature, acceptedCaseSchemaVersions, caseSchemaVersion } from "./case.ts";

const at = "2026-10-29T12:00:00-04:00";

function transect(dataBundle: unknown): Record<string, unknown> {
  return {
    recordType: "ContextFeature",
    id: "ctx_example_transect",
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId: "case_example_atlas",
    name: "Example section",
    role: "transect",
    geometry: {
      type: "LineString",
      coordinates: [
        [-6.42, 31.7, 2650.5],
        [-6.42, 31.6, 2710.25],
      ],
    },
    crs: "EPSG:4326",
    method: "Synthetic contract fixture.",
    datasetId: null,
    sourceIds: [],
    attribution: null,
    license: null,
    limitations: [],
    dataBundle,
  };
}

const ref = { bundleId: "bundle_example_transects", assetKey: "transect_lines" };

function problems(value: unknown) {
  return (ContextFeature.safeParse(value).error?.issues ?? []).map((i) => i.path.join("/"));
}

describe("contracts 1.14: a line names its member of the asset", () => {
  it("accepts 1.14.0 and every earlier version of the same MAJOR", () => {
    expect(acceptedCaseSchemaVersions).toContain(caseSchemaVersion);
    for (const earlier of ["1.2.0", "1.12.0", "1.13.0", "1.14.0"]) {
      expect(acceptedCaseSchemaVersions).toContain(earlier);
    }
  });

  it("accepts a member key, and a reference without one as in 1.12.0", () => {
    expect(problems(transect({ ...ref, member: "tabant_meridian" }))).toEqual([]);
    expect(problems(transect(ref))).toEqual([]);
  });

  it("refuses an empty member, a non-text member and an unknown key", () => {
    expect(problems(transect({ ...ref, member: "" }))).not.toEqual([]);
    expect(problems(transect({ ...ref, member: 3 }))).not.toEqual([]);
    expect(problems(transect({ ...ref, memberName: "x" }))).not.toEqual([]);
  });
});
