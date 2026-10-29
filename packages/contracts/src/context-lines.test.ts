import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CaseDocument,
  ContextFeature,
  acceptedCaseSchemaVersions,
  caseSchemaVersion,
} from "./case.ts";

const schemasDir = fileURLToPath(new URL("../../../schemas/", import.meta.url));

type Json = { [key: string]: unknown };

const at = "2026-10-29T10:00:00-04:00";
const north: [number, number, number] = [-6.42007, 31.709028, 2650.5];
const mid: [number, number, number] = [-6.42007, 31.65873, 1858];
const south: [number, number, number] = [-6.42007, 31.600972, 2710.25];

function feature(role: string, geometry: unknown, overrides: Json = {}): Json {
  return {
    recordType: "ContextFeature",
    id: "ctx_example_line",
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId: "case_example_atlas",
    name: "Example feature",
    role,
    geometry,
    crs: "EPSG:4326",
    method: "Synthetic contract fixture.",
    datasetId: null,
    sourceIds: [],
    attribution: null,
    license: null,
    limitations: [],
    ...overrides,
  };
}

const line = (positions: number[][]) => ({ type: "LineString", coordinates: positions });
const multi = (lines: number[][][]) => ({ type: "MultiLineString", coordinates: lines });

function problems(value: unknown) {
  const result = ContextFeature.safeParse(value);
  return (result.error?.issues ?? []).map((issue) => ({
    code: issue.code,
    path: issue.path.join("/"),
  }));
}

describe("contracts 1.12: the version", () => {
  it("is 1.12.0 and still accepts every earlier version of the same MAJOR", () => {
    expect(caseSchemaVersion).toBe("1.12.0");
    expect(acceptedCaseSchemaVersions.at(-1)).toBe("1.12.0");
    for (const earlier of ["1.2.0", "1.6.0", "1.10.0", "1.11.0"]) {
      expect(acceptedCaseSchemaVersions).toContain(earlier);
    }
  });
});

describe("contracts 1.12: a ContextFeature may be a line", () => {
  it("keeps a point exactly as it was: two numbers, no elevation", () => {
    const point = { type: "Point", coordinates: [-6.5372222, 31.6377778] };
    expect(problems(feature("outlet", point))).toEqual([]);
    expect(problems(feature("outlet", { type: "Point", coordinates: [-6.5, 31.6, 1465] }))).toEqual(
      [{ code: "too_big", path: "geometry/coordinates" }],
    );
  });

  it("accepts a LineString with elevation on every position", () => {
    expect(problems(feature("transect", line([north, mid, south])))).toEqual([]);
  });

  it("accepts a LineString without elevation", () => {
    const flat = [
      [-6.4, 31.7],
      [-6.3, 31.6],
    ];
    expect(problems(feature("route_proposed", line(flat)))).toEqual([]);
  });

  it("accepts a MultiLineString of lines with elevation", () => {
    expect(
      problems(
        feature(
          "drainage",
          multi([
            [north, mid],
            [mid, south],
          ]),
        ),
      ),
    ).toEqual([]);
  });

  it("refuses elevation on some positions of a feature and not on others", () => {
    const mixed = line([north, [-6.4, 31.65], south]);
    expect(problems(feature("transect", mixed))).toContainEqual({
      code: "custom",
      path: "geometry/coordinates",
    });
    const mixedAcrossLines = multi([
      [north, mid],
      [
        [-6.4, 31.6],
        [-6.3, 31.5],
      ],
    ]);
    expect(problems(feature("drainage", mixedAcrossLines))).toContainEqual({
      code: "custom",
      path: "geometry/coordinates",
    });
  });

  it("refuses a line of one position, an empty MultiLineString and a one-position member", () => {
    expect(problems(feature("transect", line([north])))).toContainEqual({
      code: "too_small",
      path: "geometry/coordinates",
    });
    expect(problems(feature("drainage", multi([])))).toContainEqual({
      code: "too_small",
      path: "geometry/coordinates",
    });
    expect(problems(feature("drainage", multi([[north]])))).toContainEqual({
      code: "too_small",
      path: "geometry/coordinates/0",
    });
  });

  it("refuses an elevation outside the range of land, such as a nodata value", () => {
    const nodata: [number, number, number] = [-6.42, 31.7, -9999];
    expect(problems(feature("transect", line([north, nodata])))).toContainEqual({
      code: "too_small",
      path: "geometry/coordinates/1/2",
    });
    const sky: [number, number, number] = [-6.42, 31.7, 9001];
    expect(problems(feature("transect", line([north, sky])))).toContainEqual({
      code: "too_big",
      path: "geometry/coordinates/1/2",
    });
  });

  it("keeps longitude and latitude in range on every position of a line", () => {
    expect(problems(feature("transect", line([north, [181, 31.7, 2000]])))).toContainEqual({
      code: "too_big",
      path: "geometry/coordinates/1/0",
    });
    expect(problems(feature("transect", line([north, [-6.4, -91, 2000]])))).toContainEqual({
      code: "too_small",
      path: "geometry/coordinates/1/1",
    });
  });

  it("refuses a geometry type the contract does not define", () => {
    expect(
      problems(feature("transect", { type: "Polygon", coordinates: [[north, mid, south, north]] })),
    ).toContainEqual({ code: "invalid_union", path: "geometry/type" });
  });

  it("refuses a field the geometry does not define", () => {
    const withCrs = { ...line([north, mid]), crs: "EPSG:32629" };
    expect(problems(feature("transect", withCrs))).toContainEqual({
      code: "unrecognized_keys",
      path: "geometry",
    });
  });
});

describe("contracts 1.12: a role fits its geometry", () => {
  const point = { type: "Point", coordinates: [-6.5, 31.6] };
  const lineString = line([north, mid]);
  const multiLine = multi([[north, mid]]);

  const fits: [string, Record<string, unknown>, boolean][] = [
    ["outlet", point, true],
    ["settlement", point, true],
    ["settlement_locator", point, true],
    ["viewpoint", point, true],
    ["summit", point, true],
    ["outlet", lineString, false],
    ["summit", multiLine, false],
    ["transect", lineString, true],
    ["transect", multiLine, false],
    ["transect", point, false],
    ["drainage", lineString, true],
    ["drainage", multiLine, true],
    ["drainage", point, false],
    ["route_proposed", lineString, true],
    ["route_proposed", multiLine, true],
    ["route_proposed", point, false],
  ];

  it.each(fits)("%s with %j -> %s", (role, geometry, ok) => {
    const found = problems(feature(role, geometry));
    expect(found.length === 0).toBe(ok);
    if (!ok) expect(found).toContainEqual({ code: "custom", path: "geometry/type" });
  });

  it("refuses a role the contract does not define", () => {
    expect(problems(feature("river", lineString))).toContainEqual({
      code: "invalid_value",
      path: "role",
    });
  });
});

describe("contracts 1.12: the schema states the same role rule as the Zod mirror", () => {
  const schema = JSON.parse(readFileSync(`${schemasDir}case.schema.json`, "utf8")) as Json;
  const defs = schema["$defs"] as Record<string, Json>;
  const contextFeature = defs["ContextFeature"] as Json;
  const roles = ((contextFeature["properties"] as Json)["role"] as { enum: string[] }).enum;
  const clauses = (
    contextFeature["allOf"] as {
      if: { properties: { role: { enum?: string[]; const?: string } } };
      then: {
        properties?: { geometry?: { properties: { type: { enum?: string[]; const?: string } } } };
      };
    }[]
  ).filter((clause) => clause.then.properties?.geometry !== undefined);
  const listed = (node: { enum?: string[]; const?: string }): string[] =>
    node.enum ?? (node.const === undefined ? [] : [node.const]);

  it("covers every role exactly once", () => {
    for (const role of roles) {
      const matching = clauses.filter((c) => listed(c.if.properties.role).includes(role));
      expect(matching, role).toHaveLength(1);
    }
  });

  it.each(
    roles.flatMap((role) => ["Point", "LineString", "MultiLineString"].map((t) => [role, t])),
  )("%s with a %s agrees", (role, geometryType) => {
    const clause = clauses.find((c) => listed(c.if.properties.role).includes(role));
    const allowedBySchema = listed(
      clause?.then.properties?.geometry?.properties.type ?? {},
    ).includes(geometryType);
    const geometry =
      geometryType === "Point"
        ? { type: "Point", coordinates: [-6.5, 31.6] }
        : geometryType === "LineString"
          ? line([north, mid])
          : multi([[north, mid]]);
    const acceptedByZod = problems(feature(role, geometry)).length === 0;
    expect(acceptedByZod).toBe(allowedBySchema);
  });
});

describe("contracts 1.12: where a line was read from", () => {
  const withBundle = (extra: unknown) =>
    feature("drainage", multi([[north, mid]]), { dataBundle: extra });

  it("may name the bundle asset it was read from", () => {
    expect(
      problems(withBundle({ bundleId: "bundle_example_drainage", assetKey: "drainage_network" })),
    ).toEqual([]);
  });

  it("needs no bundle: the points already in a case have none", () => {
    expect(problems(feature("drainage", multi([[north, mid]])))).toEqual([]);
  });

  it("names only the bundle and the asset key", () => {
    expect(
      problems(
        withBundle({
          bundleId: "bundle_example_drainage",
          assetKey: "drainage_network",
          href: "/x",
        }),
      ),
    ).toContainEqual({ code: "unrecognized_keys", path: "dataBundle" });
  });
});

describe("contracts 1.12: a case written before lines stays valid", () => {
  it("the example commit with lines parses and is 1.12.0", () => {
    const commit = JSON.parse(
      readFileSync(`${schemasDir}examples/commit-context-lines.json`, "utf8"),
    ) as Json;
    expect(commit["schemaVersion"]).toBe("1.12.0");
    expect(CaseDocument.safeParse(commit).error?.issues ?? []).toEqual([]);
    const features = (commit["upserts"] as Json[]).filter(
      (u) => u["recordType"] === "ContextFeature",
    );
    expect(features.map((f) => [f["role"], (f["geometry"] as Json)["type"]])).toEqual([
      ["drainage", "MultiLineString"],
      ["transect", "LineString"],
      ["route_proposed", "LineString"],
    ]);
  });

  it("the 1.11.0 instruments example and the 1.10.0 branches example still parse", () => {
    for (const name of ["commit-instruments.json", "commit-explanation-branches.json"]) {
      const doc = JSON.parse(readFileSync(`${schemasDir}examples/${name}`, "utf8")) as Json;
      expect(CaseDocument.safeParse(doc).error?.issues ?? []).toEqual([]);
    }
  });
});

describe("contracts 1.12: a drainage feature may carry its Strahler order", () => {
  const drainage = (streamOrder: unknown) =>
    feature("drainage", multi([[north, mid]]), { streamOrder });

  it.each([1, 3, 12])("accepts order %s on a drainage feature", (order) => {
    expect(problems(drainage(order))).toEqual([]);
  });

  it.each([
    [0, "too_small"],
    [13, "too_big"],
    [2.5, "invalid_type"],
  ])("refuses order %s", (order, code) => {
    expect(problems(drainage(order))).toContainEqual({ code, path: "streamOrder" });
  });

  it("needs no order: a drainage line from a gazetteer has none", () => {
    expect(problems(feature("drainage", multi([[north, mid]])))).toEqual([]);
  });

  it.each([
    ["transect", line([north, mid])],
    ["route_proposed", line([north, mid])],
    ["outlet", { type: "Point", coordinates: [-6.5, 31.6] }],
  ])("refuses an order on a %s feature", (role, geometry) => {
    expect(problems(feature(role, geometry, { streamOrder: 2 }))).toContainEqual({
      code: "custom",
      path: "streamOrder",
    });
  });

  it("the schema says so too: a clause forbids streamOrder outside drainage", () => {
    const schema = JSON.parse(readFileSync(`${schemasDir}case.schema.json`, "utf8")) as Json;
    const clauses = ((schema["$defs"] as Record<string, Json>)["ContextFeature"] as Json)[
      "allOf"
    ] as Json[];
    expect(clauses).toContainEqual({
      if: { properties: { role: { not: { const: "drainage" } } }, required: ["role"] },
      then: { not: { required: ["streamOrder"] } },
    });
  });
});
