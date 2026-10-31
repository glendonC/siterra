import { readFileSync } from "node:fs";
import { type CanvasComponent, Commit, type InstrumentSpec } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import {
  instrumentAssetRefs,
  instrumentComponentIssues,
  instrumentReferencedIds,
  instrumentSpecIssues,
  uncitedInstrumentInputs,
} from "./instruments.ts";
import { displayTextIssues, questionIssues } from "./instruments-compose.ts";

const example = Commit.parse(
  JSON.parse(
    readFileSync(
      new URL("../../../schemas/examples/commit-instruments.json", import.meta.url),
      "utf8",
    ),
  ),
);
const specs = example.upserts.filter((u): u is InstrumentSpec => u.recordType === "InstrumentSpec");
const components = example.upserts.filter(
  (u): u is CanvasComponent => u.recordType === "CanvasComponent",
);

function spec(kind: InstrumentSpec["parameters"]["kind"]): InstrumentSpec {
  const found = specs.find((s) => s.parameters.kind === kind);
  if (found === undefined) throw new Error(`the example holds no ${kind} spec`);
  return found;
}

describe("INST-01: a spec cites every record it names in provenance.inputVersions", () => {
  it("lists each record a layer_stack names once: area, relief, layers, features and citations", () => {
    expect(instrumentReferencedIds(spec("layer_stack")).sort()).toEqual(
      [
        "bundle_example_land_cover",
        "bundle_example_rain",
        "bundle_example_relief",
        "bundle_example_snow",
        "bundle_example_strata",
        "bundle_example_trend",
        "ctx_example_drainage",
        "ctx_example_outlet",
        "ev_example_layers",
        "geo_example_context",
      ].sort(),
    );
  });

  it("lists the statements, the merge, the action and the routes of the other kinds", () => {
    const cross = instrumentReferencedIds(spec("cross_section"));
    expect(cross).toEqual(
      expect.arrayContaining([
        "ctx_example_transect",
        "ctx_example_settlement",
        "ev_example_valley_floor",
        "ev_example_upper_slope",
        "ev_example_section",
        "bundle_example_transects",
      ]),
    );
    expect(instrumentReferencedIds(spec("pixel_anatomy"))).toEqual(
      expect.arrayContaining(["ev_example_species_context", "bundle_example_pixel_anatomy"]),
    );
    expect(instrumentReferencedIds(spec("field_plan")).sort()).toEqual(
      [
        "act_example_field_plan",
        "ctx_example_route",
        "ev_example_gap",
        "geo_example_context",
        "merge_example_branches",
      ].sort(),
    );
  });

  it("lists a record once, however many fields name it", () => {
    const ids = instrumentReferencedIds(spec("cross_section"));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("skips a field that names nothing (no action, no selected layer)", () => {
    const planWithoutAction: InstrumentSpec = {
      ...spec("field_plan"),
      parameters: {
        kind: "field_plan",
        geoSelectionId: "geo_example_context",
        branchMergeId: "merge_example_branches",
        actionId: null,
        routeFeatureIds: [],
      },
    };
    expect(instrumentReferencedIds(planWithoutAction)).not.toContain("act_example_field_plan");
    expect(instrumentReferencedIds(planWithoutAction)).not.toContain(null);
  });

  it.each(specs.map((s) => [s.parameters.kind, s] as const))(
    "the example %s spec cites all of them",
    (_kind, s) => {
      expect(uncitedInstrumentInputs(s)).toEqual([]);
    },
  );

  it("names the record a spec forgot to cite, whichever field names it", () => {
    const layerStack = spec("layer_stack");
    const without = (id: string): InstrumentSpec => ({
      ...layerStack,
      provenance: {
        ...layerStack.provenance,
        inputVersions: layerStack.provenance.inputVersions.filter((v) => v.entityId !== id),
      },
    });
    for (const id of [
      "bundle_example_rain",
      "geo_example_context",
      "ctx_example_drainage",
      "ev_example_layers",
    ]) {
      expect(uncitedInstrumentInputs(without(id))).toEqual([id]);
    }
  });

  it("a cited record at any revision satisfies the rule, since staleness compares revisions", () => {
    const layerStack = spec("layer_stack");
    const pinned: InstrumentSpec = {
      ...layerStack,
      provenance: {
        ...layerStack.provenance,
        inputVersions: layerStack.provenance.inputVersions.map((v) => ({ ...v, revision: 3 })),
      },
    };
    expect(uncitedInstrumentInputs(pinned)).toEqual([]);
  });
});

describe("INST-03: the layers of a layer_stack are distinct and the selected one is among them", () => {
  const layerStack = spec("layer_stack");
  const parameters = (changes: Record<string, unknown>): InstrumentSpec => ({
    ...layerStack,
    parameters: { ...layerStack.parameters, ...changes },
  });
  const first = {
    layer: "vegetation_trend",
    data: { bundleId: "bundle_example_trend", assetKey: "a" },
  };
  const second = { layer: "rainfall", data: { bundleId: "bundle_example_rain", assetKey: "b" } };

  it("holds for the example", () => {
    expect(instrumentSpecIssues(layerStack)).toEqual([]);
  });

  it("refuses the same layer twice", () => {
    expect(
      instrumentSpecIssues(
        parameters({ layers: [first, { ...second, layer: "vegetation_trend" }] }),
      ),
    ).toEqual(["inst_example_layer_stack: the layer vegetation_trend is listed twice"]);
  });

  it("refuses a selected layer that is not in the stack", () => {
    expect(
      instrumentSpecIssues(parameters({ layers: [second], selectedLayer: "vegetation_trend" })),
    ).toEqual([
      "inst_example_layer_stack: the selected layer vegetation_trend is not in the stack",
    ]);
  });

  it("accepts no selected layer", () => {
    expect(
      instrumentSpecIssues(parameters({ layers: [first, second], selectedLayer: null })),
    ).toEqual([]);
  });

  it("finds nothing to say about the other kinds", () => {
    for (const kind of [
      "cross_section",
      "pixel_anatomy",
      "rainfall_scatter",
      "field_plan",
    ] as const) {
      expect(instrumentSpecIssues(spec(kind))).toEqual([]);
    }
  });
});

describe("INST-02: a component binds exactly one spec of its own kind, at the spec's revision", () => {
  const forKind = (kind: string): CanvasComponent => {
    const found = components.find((c) => c.componentKind === kind);
    if (found === undefined) throw new Error(`the example holds no ${kind} component`);
    return found;
  };

  it.each(components.map((c) => [c.componentKind, c] as const))(
    "the example %s component holds",
    (_kind, component) => {
      const bound = specs.find((s) => s.id === component.entityVersions[0]?.entityId);
      expect(instrumentComponentIssues(component, bound)).toEqual([]);
    },
  );

  it("refuses a component whose kind differs from the spec's", () => {
    const component = {
      ...forKind("layer_stack"),
      componentKind: "cross_section",
    } as CanvasComponent;
    expect(instrumentComponentIssues(component, spec("layer_stack"))).toEqual([
      "comp_example_layer_stack: a cross_section component binds a layer_stack spec",
    ]);
  });

  it("refuses a component that binds two records", () => {
    const component: CanvasComponent = {
      ...forKind("layer_stack"),
      entityIds: ["inst_example_layer_stack", "inst_example_cross_section"],
      entityVersions: [
        { entityId: "inst_example_layer_stack", revision: 1 },
        { entityId: "inst_example_cross_section", revision: 1 },
      ],
    };
    expect(instrumentComponentIssues(component, spec("layer_stack"))).toEqual([
      "comp_example_layer_stack: an instrument component binds exactly one spec",
    ]);
  });

  it("refuses a component pinned to another revision than the spec it is shown with", () => {
    const component: CanvasComponent = {
      ...forKind("layer_stack"),
      entityVersions: [{ entityId: "inst_example_layer_stack", revision: 2 }],
    };
    expect(instrumentComponentIssues(component, spec("layer_stack"))).toEqual([
      "comp_example_layer_stack: binds inst_example_layer_stack revision 2 but the spec is revision 1",
    ]);
  });

  it("refuses a component whose spec is missing", () => {
    expect(instrumentComponentIssues(forKind("layer_stack"), undefined)).toEqual([
      "comp_example_layer_stack: binds no instrument spec that exists in this case",
    ]);
  });

  it("ignores a component of a kind that is not an instrument", () => {
    const component = { ...forKind("layer_stack"), componentKind: "evidence" } as CanvasComponent;
    expect(instrumentComponentIssues(component, undefined)).toEqual([]);
  });
});

describe("INST-04 (read part): the bundle assets a spec names", () => {
  const keys = (kind: InstrumentSpec["parameters"]["kind"]) =>
    instrumentAssetRefs(spec(kind)).map((ref) => `${ref.bundleId}/${ref.assetKey}`);

  it("lists the relief and each layer's data of a layer_stack, in field order", () => {
    expect(keys("layer_stack")).toEqual([
      "bundle_example_relief/relief",
      "bundle_example_trend/pixel_trend_grid_mar_jun",
      "bundle_example_rain/rainfall_cells",
      "bundle_example_snow/snow_cover_tables",
      "bundle_example_land_cover/land_cover",
      "bundle_example_strata/strata",
    ]);
  });

  it("lists the five assets of a cross_section, the three of a pixel_anatomy and the two of a rainfall_scatter", () => {
    expect(keys("cross_section")).toEqual([
      "bundle_example_relief/relief",
      "bundle_example_transects/transect_profile",
      "bundle_example_strata/strata",
      "bundle_example_season_trend/season_trend_long_record",
      "bundle_example_snow/snow_cover_tables",
    ]);
    expect(keys("pixel_anatomy")).toEqual([
      "bundle_example_trend/pixel_trend_grid_mar_jun",
      "bundle_example_pixel_anatomy/pixel_anatomy",
      "bundle_example_season_trend/season_trend_tables",
    ]);
    expect(keys("rainfall_scatter")).toEqual([
      "bundle_example_restrend/restrend_tables",
      "bundle_example_restrend/restrend_long_record",
    ]);
  });

  it("lists none for a field_plan, which reads records and no bundle asset", () => {
    expect(keys("field_plan")).toEqual([]);
  });

  it("lists an asset once however many fields name it", () => {
    const layerStack = spec("layer_stack");
    if (layerStack.parameters.kind !== "layer_stack") throw new Error("example");
    const twice: InstrumentSpec = {
      ...layerStack,
      parameters: {
        ...layerStack.parameters,
        layers: [...layerStack.parameters.layers, ...layerStack.parameters.layers],
      },
    };
    expect(instrumentAssetRefs(twice)).toHaveLength(instrumentAssetRefs(layerStack).length);
  });
});

describe("assets an instrument draws (contracts 1.16)", () => {
  const withDrawn = (kind: InstrumentSpec["parameters"]["kind"]): InstrumentSpec => {
    const base = spec(kind);
    if (base.parameters.kind === "field_plan") throw new Error("a field plan draws no asset");
    return {
      ...base,
      parameters: {
        ...base.parameters,
        drawnAssets: [
          {
            role: "catchment_outline",
            asset: { bundleId: "bundle_example_outline", assetKey: "analysis_geometry" },
          },
          { role: "pixel_cells", asset: { bundleId: "bundle_example_rain", assetKey: "cells" } },
        ],
      },
    };
  };

  it("lists them with the other assets, each once, and the read API resolves them", () => {
    for (const kind of [
      "layer_stack",
      "cross_section",
      "pixel_anatomy",
      "rainfall_scatter",
    ] as const) {
      const refs = instrumentAssetRefs(withDrawn(kind));
      expect(refs).toContainEqual({
        bundleId: "bundle_example_outline",
        assetKey: "analysis_geometry",
      });
      expect(new Set(refs.map((r) => `${r.bundleId}/${r.assetKey}`)).size).toBe(refs.length);
    }
  });

  it("makes INST-01 require the bundle of a drawn asset in the inputs", () => {
    const s = withDrawn("rainfall_scatter");
    expect(instrumentReferencedIds(s)).toContain("bundle_example_outline");
    expect(uncitedInstrumentInputs(s)).toContain("bundle_example_outline");
    expect(uncitedInstrumentInputs(spec("rainfall_scatter"))).toEqual([]);
  });
});

describe("the question a pixel anatomy asks (contracts 1.22)", () => {
  const withQuestion = (question: string | undefined) =>
    ({
      ...spec("pixel_anatomy").parameters,
      ...(question === undefined ? {} : { question }),
    }) as InstrumentSpec["parameters"];

  it("accepts a question in plain words, or none", () => {
    expect(questionIssues(withQuestion("What is one pixel's trend made of?"))).toEqual([]);
    expect(
      questionIssues(withQuestion("Why can a pixel get greener while its pasture does not?")),
    ).toEqual([]);
    expect(questionIssues(withQuestion(undefined))).toEqual([]);
  });

  it("refuses a statement, a number, a banned word and a prohibited phrase", () => {
    expect(questionIssues(withQuestion("One pixel's trend is made of cells."))[0]).toContain(
      "question mark",
    );
    expect(questionIssues(withQuestion("Is 1 pixel enough?"))[0]).toContain("digit");
    expect(questionIssues(withQuestion("Is this change significant?"))[0]).toContain(
      "banned word: significant",
    );
    expect(questionIssues(withQuestion("Does overgrazing explain it?"))[0]).toContain(
      "banned word: overgrazing",
    );
    expect(
      questionIssues(withQuestion("What proves the trend?")).some((i) => i.includes("banned word")),
    ).toBe(true);
  });

  it("asks nothing of any other kind of instrument", () => {
    expect(questionIssues(spec("cross_section").parameters)).toEqual([]);
  });
});

describe("INST-08: the display text of a placed statement (contracts 1.17)", () => {
  const evidence = (id: string, excerpts: string[]) =>
    ({
      id,
      claimKind: "scientific_context",
      provenance: {
        sourceLocators: excerpts.map((excerpt) => ({
          sourceId: "src_example",
          locator: "x.pdf, page 1",
          excerpt,
        })),
      },
    }) as never;
  const store = new Map([
    ["ev_example_a", evidence("ev_example_a", ["between 1800 and 2200 m altitude in the valley"])],
    ["ev_example_b", evidence("ev_example_b", ["It shelters more than thirty villages"])],
  ]) as never as ReadonlyMap<
    string,
    Parameters<typeof displayTextIssues>[1] extends ReadonlyMap<string, infer E> ? E : never
  >;
  const section = (display: unknown) =>
    ({
      ...spec("cross_section").parameters,
      statements: [{ evidenceId: "ev_example_a", placement: "valley_floor", display }],
    }) as InstrumentSpec["parameters"];

  it("lists the Evidence a display text rests on among the records the spec names (INST-01)", () => {
    const named = instrumentReferencedIds({
      parameters: section({ text: "A valley.", evidenceIds: ["ev_example_a", "ev_example_b"] }),
      caption: spec("cross_section").caption,
    });
    expect(named).toContain("ev_example_b");
  });

  it("accepts wording whose numbers are in a cited excerpt, at the excerpt's own digits", () => {
    const p = section({
      text: "Valley floor, about 1,800 to 2,200 m, with more than thirty villages.",
      evidenceIds: ["ev_example_a", "ev_example_b"],
    });
    expect(displayTextIssues(p, store)).toEqual([]);
  });

  it("refuses a number no cited excerpt holds, a banned word, a prohibited claim and Evidence that is not cited", () => {
    const issues = (text: string, evidenceIds = ["ev_example_a"]) =>
      displayTextIssues(section({ text, evidenceIds }), store);
    expect(issues("Valley floor, about 1,900 m.")).toHaveLength(1);
    expect(issues("A significant valley floor.")[0]).toContain("banned word");
    expect(issues("Greenness fell due to grazing.")[0]).toContain("prohibited");
    expect(issues("Villages: more than thirty.")).toEqual([]);
    expect(issues("Valley, about 1,800 m.", ["ev_example_gone"])[0]).toContain("ev_example_gone");
  });

  it("checks the pixel's context wording the same way", () => {
    const pixel = {
      ...spec("pixel_anatomy").parameters,
      contextDisplay: [{ text: "Herders report 40 species.", evidenceIds: ["ev_example_b"] }],
    } as InstrumentSpec["parameters"];
    expect(displayTextIssues(pixel, store)[0]).toContain("40");
  });
});
