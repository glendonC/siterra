import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CanvasComponent,
  CaseDocument,
  Commit,
  InstrumentParameters,
  InstrumentSpec,
  LayoutAction,
  acceptedCaseSchemaVersions,
  caseSchemaVersion,
} from "./case.ts";
import { instrumentKinds, type InstrumentKind } from "./instruments.ts";

const schemasDir = fileURLToPath(new URL("../../../schemas/", import.meta.url));

type Json = { [key: string]: unknown };

const at = "2026-10-29T09:00:00-04:00";
const ref = (bundle: string, assetKey: string) => ({
  bundleId: `bundle_example_${bundle}`,
  assetKey,
});

const parameters: Record<InstrumentKind, Json> = {
  layer_stack: {
    kind: "layer_stack",
    geoSelectionId: "geo_example_context",
    relief: ref("relief", "relief"),
    layers: [
      { layer: "vegetation_trend", data: ref("trend", "pixel_trend_grid_mar_jun") },
      { layer: "rainfall", data: ref("rain", "rainfall_cells") },
    ],
    drainageFeatureIds: ["ctx_example_drainage"],
    placeFeatureIds: ["ctx_example_outlet"],
    selectedLayer: "vegetation_trend",
  },
  cross_section: {
    kind: "cross_section",
    geoSelectionId: "geo_example_context",
    transectFeatureId: "ctx_example_transect",
    relief: ref("relief", "relief"),
    profile: ref("transects", "transect_profile"),
    bands: ref("strata", "strata"),
    bandTrends: ref("season_trend", "season_trend_long_record"),
    snow: ref("snow", "snow_cover_tables"),
    drainageFeatureIds: [],
    placeFeatureIds: [],
    statements: [{ evidenceId: "ev_example_valley_floor", placement: "valley_floor" }],
  },
  pixel_anatomy: {
    kind: "pixel_anatomy",
    geoSelectionId: "geo_example_context",
    locator: ref("trend", "pixel_trend_grid_mar_jun"),
    anatomy: ref("pixel_anatomy", "pixel_anatomy"),
    bandSeries: ref("season_trend", "season_trend_tables"),
    contextEvidenceIds: [],
  },
  rainfall_scatter: {
    kind: "rainfall_scatter",
    geoSelectionId: "geo_example_context",
    seasons: ref("restrend", "restrend_tables"),
    fit: ref("restrend", "restrend_long_record"),
  },
  field_plan: {
    kind: "field_plan",
    geoSelectionId: "geo_example_context",
    branchMergeId: "merge_example_branches",
    actionId: null,
    routeFeatureIds: [],
  },
};

const caption = {
  ink: "Fictional example: the layers stand over one catchment.",
  grey: "Synthetic fixture; no measured result is asserted.",
  claimKind: "observation",
  citationIds: ["ev_example_layers"],
};

function spec(kind: InstrumentKind, overrides: Json = {}): Json {
  return {
    recordType: "InstrumentSpec",
    id: `inst_example_${kind}`,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId: "case_example_atlas",
    status: "ready",
    parameters: parameters[kind],
    caption,
    provenance: {
      sourceLocators: [],
      dataBundleIds: [],
      methodId: "instrument_composer",
      methodVersion: "1",
      inputVersions: [],
      generatedByTaskId: null,
      generatedAt: at,
      verificationStatus: "computed_checked",
      limitations: [],
    },
    ...overrides,
  };
}

function problems(value: unknown) {
  const result = InstrumentSpec.safeParse(value);
  return (result.error?.issues ?? []).map((issue) => ({ code: issue.code, path: issue.path }));
}

describe("contracts 1.11: the instrument kinds", () => {
  it("accepts 1.11.0 and every version of the same MAJOR before it, in order", () => {
    expect(acceptedCaseSchemaVersions.slice(0, 10)).toEqual([
      "1.2.0",
      "1.3.0",
      "1.4.0",
      "1.5.0",
      "1.6.0",
      "1.7.0",
      "1.8.0",
      "1.9.0",
      "1.10.0",
      "1.11.0",
    ]);
    expect(acceptedCaseSchemaVersions).toContain(caseSchemaVersion);
  });

  it("names five kinds, and the parameter union has exactly those", () => {
    expect([...instrumentKinds]).toEqual([
      "layer_stack",
      "cross_section",
      "pixel_anatomy",
      "rainfall_scatter",
      "field_plan",
    ]);
    expect(InstrumentParameters.options.map((o) => o.shape.kind.value)).toEqual([
      ...instrumentKinds,
    ]);
  });

  it.each(instrumentKinds)("%s is a component kind and a layout kind", (kind) => {
    expect(CanvasComponent.shape.componentKind.safeParse(kind).success).toBe(true);
    expect(LayoutAction.shape.componentKind.safeParse(kind).success).toBe(true);
  });

  it("keeps every component kind that existed before", () => {
    for (const kind of [
      "geography",
      "evidence",
      "trace",
      "decision_brief",
      "explanation_branches",
    ]) {
      expect(CanvasComponent.shape.componentKind.safeParse(kind).success).toBe(true);
    }
  });
});

describe("contracts 1.11: an InstrumentSpec", () => {
  it.each(instrumentKinds)("a %s spec parses", (kind) => {
    expect(problems(spec(kind))).toEqual([]);
  });

  it("the example commit has one spec per kind, each bound by a component of its kind", () => {
    const commit = JSON.parse(
      readFileSync(`${schemasDir}examples/commit-instruments.json`, "utf8"),
    ) as Json;
    expect(Commit.safeParse(commit).error?.issues ?? []).toEqual([]);
    expect(CaseDocument.safeParse(commit).success).toBe(true);
    expect(commit["schemaVersion"]).toBe("1.11.0");
    const upserts = commit["upserts"] as Json[];
    const specs = upserts.filter((u) => u["recordType"] === "InstrumentSpec");
    expect(specs.map((s) => (s["parameters"] as Json)["kind"])).toEqual([...instrumentKinds]);
    const components = upserts.filter((u) => u["recordType"] === "CanvasComponent");
    expect(components.map((c) => c["componentKind"])).toEqual([...instrumentKinds]);
    for (const component of components) {
      const bound = component["entityVersions"] as { entityId: string; revision: number }[];
      expect(bound).toHaveLength(1);
      const target = specs.find((s) => s["id"] === bound[0]?.entityId);
      expect((target?.["parameters"] as Json)["kind"]).toBe(component["componentKind"]);
    }
  });

  it("a status other than ready or stale is refused", () => {
    expect(problems(spec("layer_stack", { status: "current" }))).toContainEqual({
      code: "invalid_value",
      path: ["status"],
    });
  });

  it("a parameters kind outside the registry is refused", () => {
    const bad = { ...parameters.layer_stack, kind: "heatmap" };
    expect(problems(spec("layer_stack", { parameters: bad }))).toContainEqual({
      code: "invalid_union",
      path: ["parameters", "kind"],
    });
  });

  it.each(instrumentKinds)("%s parameters need the area they are about", (kind) => {
    const { geoSelectionId: _gone, ...rest } = parameters[kind];
    expect(problems(spec(kind, { parameters: rest }))).toContainEqual({
      code: "invalid_type",
      path: ["parameters", "geoSelectionId"],
    });
  });

  it.each(instrumentKinds)(
    "%s parameters refuse any field the contract does not define (a camera, a scale, a colour, a URL)",
    (kind) => {
      for (const extra of ["camera", "verticalExaggeration", "colour", "href", "monthNumber"]) {
        const bad = { ...parameters[kind], [extra]: 2.5 };
        expect(problems(spec(kind, { parameters: bad }))).toContainEqual({
          code: "unrecognized_keys",
          path: ["parameters"],
        });
      }
    },
  );

  it("a reference to a bundle asset names only the bundle and the asset key", () => {
    const bad = {
      ...parameters.rainfall_scatter,
      seasons: { ...ref("restrend", "restrend_tables"), href: "/x" },
    };
    expect(problems(spec("rainfall_scatter", { parameters: bad }))).toContainEqual({
      code: "unrecognized_keys",
      path: ["parameters", "seasons"],
    });
  });

  it.each(["", "Relief", "relief map", "../etc/passwd", "x".repeat(81)])(
    "the asset key %j is refused",
    (assetKey) => {
      const bad = {
        ...parameters.rainfall_scatter,
        fit: { bundleId: "bundle_example_restrend", assetKey },
      };
      expect(
        problems(spec("rainfall_scatter", { parameters: bad })).map((p) => p.path.join("/")),
      ).toContain("parameters/fit/assetKey");
    },
  );

  describe("layer_stack", () => {
    const layer = { layer: "rainfall", data: ref("rain", "rainfall_cells") };
    const withLayers = (layers: unknown[]) =>
      spec("layer_stack", { parameters: { ...parameters.layer_stack, layers } });

    it("holds one to five layers", () => {
      expect(problems(withLayers([]))).toContainEqual({
        code: "too_small",
        path: ["parameters", "layers"],
      });
      const six = Array.from({ length: 6 }, () => layer);
      expect(problems(withLayers(six))).toContainEqual({
        code: "too_big",
        path: ["parameters", "layers"],
      });
    });

    it("names its layers from the fixed vocabulary", () => {
      expect(problems(withLayers([{ ...layer, layer: "ndvi_heatmap" }]))).toContainEqual({
        code: "invalid_value",
        path: ["parameters", "layers", 0, "layer"],
      });
    });

    it("may select no layer", () => {
      const none = { ...parameters.layer_stack, selectedLayer: null };
      expect(problems(spec("layer_stack", { parameters: none }))).toEqual([]);
    });
  });

  describe("cross_section", () => {
    it("holds at most four statements, each placed on the valley floor or the upper slope", () => {
      const statement = { evidenceId: "ev_example_valley_floor", placement: "valley_floor" };
      const five = Array.from({ length: 5 }, () => statement);
      const tooMany = { ...parameters.cross_section, statements: five };
      expect(problems(spec("cross_section", { parameters: tooMany }))).toContainEqual({
        code: "too_big",
        path: ["parameters", "statements"],
      });
      const misplaced = {
        ...parameters.cross_section,
        statements: [{ ...statement, placement: "summit" }],
      };
      expect(problems(spec("cross_section", { parameters: misplaced }))).toContainEqual({
        code: "invalid_value",
        path: ["parameters", "statements", 0, "placement"],
      });
    });
  });

  describe("field_plan", () => {
    it("may name an action or none", () => {
      const named = { ...parameters.field_plan, actionId: "act_example_field_plan" };
      expect(problems(spec("field_plan", { parameters: named }))).toEqual([]);
    });
  });

  describe("the caption", () => {
    const withCaption = (changes: Json) =>
      spec("layer_stack", { caption: { ...caption, ...changes } });

    it("holds one ink sentence and one grey sentence within their limits", () => {
      expect(problems(withCaption({ ink: "" }))).toContainEqual({
        code: "too_small",
        path: ["caption", "ink"],
      });
      expect(problems(withCaption({ ink: "x".repeat(201) }))).toContainEqual({
        code: "too_big",
        path: ["caption", "ink"],
      });
      expect(problems(withCaption({ grey: "" }))).toContainEqual({
        code: "too_small",
        path: ["caption", "grey"],
      });
      expect(problems(withCaption({ grey: "x".repeat(241) }))).toContainEqual({
        code: "too_big",
        path: ["caption", "grey"],
      });
      expect(problems(withCaption({ ink: "x".repeat(200), grey: "x".repeat(240) }))).toEqual([]);
    });

    it("counts code points, not UTF-16 units", () => {
      expect(problems(withCaption({ ink: "\u{1F30D}".repeat(200) }))).toEqual([]);
    });

    it("cites one to eight distinct records", () => {
      expect(problems(withCaption({ citationIds: [] }))).toContainEqual({
        code: "too_small",
        path: ["caption", "citationIds"],
      });
      const nine = Array.from({ length: 9 }, (_, i) => `ev_example_cite_${String(i)}`);
      expect(problems(withCaption({ citationIds: nine }))).toContainEqual({
        code: "too_big",
        path: ["caption", "citationIds"],
      });
      expect(
        problems(withCaption({ citationIds: ["ev_example_a1", "ev_example_a1"] })),
      ).toContainEqual({
        code: "custom",
        path: ["caption", "citationIds"],
      });
    });

    it("types its claim from the claim kinds of the case", () => {
      expect(problems(withCaption({ claimKind: "proof" }))).toContainEqual({
        code: "invalid_value",
        path: ["caption", "claimKind"],
      });
    });

    it("refuses a field the contract does not define", () => {
      expect(problems(withCaption({ figure: 0.0091 }))).toContainEqual({
        code: "unrecognized_keys",
        path: ["caption"],
      });
    });
  });
});

describe("contracts 1.11: a case written before instruments stays valid", () => {
  it("a snapshot without instrumentSpecRecords parses, and one with them parses too", () => {
    const base = JSON.parse(
      readFileSync(`${schemasDir}examples/case-snapshot.json`, "utf8"),
    ) as Json;
    expect(CaseDocument.safeParse(base).success).toBe(true);
    const withSpecs = {
      ...base,
      schemaVersion: "1.11.0",
      records: { ...(base["records"] as Json), instrumentSpecRecords: [spec("rainfall_scatter")] },
    };
    expect(CaseDocument.safeParse(withSpecs).error?.issues ?? []).toEqual([]);
  });

  it("the 1.10.0 example commit still parses", () => {
    const commit = JSON.parse(
      readFileSync(`${schemasDir}examples/commit-explanation-branches.json`, "utf8"),
    ) as Json;
    expect(commit["schemaVersion"]).toBe("1.10.0");
    expect(CaseDocument.safeParse(commit).error?.issues ?? []).toEqual([]);
  });
});

// The rule that parameters hold references and nothing else is a property of the schema, so it is
// read from case.schema.json: no number, no format string, no free text and no open object can sit
// anywhere under a parameters definition, whatever the examples happen to contain.
describe("contracts 1.11: parameters cannot carry a value, a coordinate, a URL or prose", () => {
  const schema = JSON.parse(readFileSync(`${schemasDir}case.schema.json`, "utf8")) as Json;
  const defs = schema["$defs"] as Record<string, Json>;
  const parameterDefs = [
    "LayerStackParameters",
    "CrossSectionParameters",
    "PixelAnatomyParameters",
    "RainfallScatterParameters",
    "FieldPlanParameters",
  ];

  function violations(name: string): string[] {
    const found: string[] = [];
    const seen = new Set<string>();
    const visit = (node: unknown, path: string): void => {
      if (typeof node !== "object" || node === null) return;
      if (Array.isArray(node)) {
        node.forEach((item, i) => {
          visit(item, `${path}/${String(i)}`);
        });
        return;
      }
      const n = node as Json;
      if (typeof n["$ref"] === "string") {
        const target = n["$ref"].split("/").pop() ?? "";
        if (!seen.has(target)) {
          seen.add(target);
          visit(defs[target], `${path} -> ${target}`);
        }
        return;
      }
      const type = n["type"];
      const types = Array.isArray(type) ? type : [type];
      if (types.includes("number") || types.includes("integer")) found.push(`${path}: a number`);
      if ("format" in n) found.push(`${path}: a format string`);
      if (types.includes("object") && n["additionalProperties"] !== false) {
        found.push(`${path}: an open object`);
      }
      // The one named exception (contracts 1.17.0): the host-written display wording of a placed
      // statement, at most 200 characters, checked against the cited excerpts (INST-08).
      const hostWrittenText = path.endsWith("-> DisplayText/text") && n["maxLength"] === 200;
      if (
        types.includes("string") &&
        !("pattern" in n) &&
        !("enum" in n) &&
        !("const" in n) &&
        !hostWrittenText
      ) {
        found.push(`${path}: free text`);
      }
      for (const [key, value] of Object.entries(n)) {
        if (["properties", "items", "anyOf", "oneOf", "prefixItems"].includes(key)) {
          if (key === "properties") {
            for (const [prop, sub] of Object.entries(value as Json)) visit(sub, `${path}/${prop}`);
          } else {
            visit(value, `${path}/${key}`);
          }
        }
      }
    };
    visit({ $ref: `#/$defs/${name}` }, name);
    return found;
  }

  it("the schema defines the five parameter objects", () => {
    for (const name of parameterDefs) expect(defs[name]).toBeDefined();
  });

  it.each(parameterDefs)("%s holds identifiers, keys and fixed words only", (name) => {
    expect(violations(name)).toEqual([]);
  });
});
