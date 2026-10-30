import { describe, expect, it } from "vitest";

import { MetaAdapter } from "../../model/adapter.ts";
import type { ModelTransport } from "../../model/transport.ts";
import { strictSubsetIssues } from "../../model/strict-schema.ts";
import { AT, CASE_ID, queuedTask, testStore } from "../../testing/case-fixture.ts";
import { answerStep, syntheticTransport } from "../../testing/replay-steps.ts";
import { caseToolRegistry } from "../../tools/registry.ts";
import type { MemoryCaseStore } from "../../tools/store.ts";
import type { CanvasComponentRecord, InstrumentSpecRecord } from "../records.ts";
import { runInstrumentCompositionTask } from "./instrument-task.ts";
import { instrumentOutputSchema, validateInstrumentProposal } from "./proposal.ts";

// Synthetic instruments over the synthetic test measurements; nothing here is a finding.

const at = AT.toISOString();
const provenance = {
  sourceLocators: [],
  dataBundleIds: [],
  methodId: "instrument_composer",
  methodVersion: "1",
  inputVersions: [],
  generatedByTaskId: null,
  generatedAt: at,
  verificationStatus: "computed_checked" as const,
  limitations: ["Composed by host rules from the case configuration; no model wrote it."],
};

function spec(
  id: string,
  kind: "rainfall_scatter" | "pixel_anatomy",
  ink: string,
  grey: string,
  citationIds: string[] = ["meas_test_2022-04"],
): InstrumentSpecRecord {
  const ref = (assetKey: string) => ({ bundleId: "bundle_test_ndvi", assetKey });
  return {
    recordType: "InstrumentSpec",
    id,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId: CASE_ID,
    status: "ready",
    parameters:
      kind === "rainfall_scatter"
        ? {
            kind,
            geoSelectionId: "geo_test_catchment",
            seasons: ref("tables"),
            fit: ref("summary"),
          }
        : {
            kind,
            geoSelectionId: "geo_test_catchment",
            locator: ref("grid"),
            anatomy: ref("anatomy"),
            bandSeries: ref("series"),
            contextEvidenceIds: [],
          },
    caption: { ink, grey, claimKind: "observation", citationIds },
    provenance,
  };
}

const RAIN = spec(
  "inst_test_rain",
  "rainfall_scatter",
  "April 2022 greenness was 0.1439 across the catchment.",
  "A single month of a satellite record.",
);
const PIXEL = spec(
  "inst_test_pixel",
  "pixel_anatomy",
  "One pixel opens into its finer cells.",
  "A model of one pixel on one day.",
);

function storeWith(...specs: InstrumentSpecRecord[]): MemoryCaseStore {
  const store = testStore();
  store.instrumentSpecs.push(...specs);
  return store;
}

const context = () => ({
  specs: new Map([RAIN, PIXEL].map((s) => [s.id, s])),
  measurements: new Map(testStore().measurements.map((m) => [m.id, m])),
  evidence: new Map(),
  years: { first: 2022, last: 2022 },
});

const answer = (patch: Record<string, unknown> = {}) => ({
  order: [PIXEL.id, RAIN.id],
  captions: [
    { specId: RAIN.id, ink: RAIN.caption.ink, grey: RAIN.caption.grey },
    { specId: PIXEL.id, ink: PIXEL.caption.ink, grey: PIXEL.caption.grey },
  ],
  ...patch,
});
const caption = (specId: string, ink: string, grey = "A limit of the record.") => ({
  specId,
  ink,
  grey,
});
const codes = (value: unknown) =>
  validateInstrumentProposal(JSON.stringify(value), context()).issues.map(
    (i) => `${i.code} ${i.path}`,
  );

describe("propose_instruments validation", () => {
  it("accepts an order and unchanged sentences, with no rewrite", () => {
    const result = validateInstrumentProposal(JSON.stringify(answer()), context());
    expect(result.ok && result.value).toEqual({ order: [PIXEL.id, RAIN.id], rewrites: new Map() });
  });

  it("accepts a reworded sentence whose numbers are in a cited record, at its precision", () => {
    const result = validateInstrumentProposal(
      JSON.stringify(
        answer({
          captions: [
            caption(RAIN.id, "Greenness over the catchment was 0.1439 in April 2022."),
            caption(PIXEL.id, PIXEL.caption.ink, PIXEL.caption.grey),
          ],
        }),
      ),
      context(),
    );
    expect(result.ok && [...result.value.rewrites.keys()]).toEqual([RAIN.id]);
  });

  it("refuses an instrument the composer did not return, a repeat and a missing one (INST-07, registry)", () => {
    expect(codes(answer({ order: [RAIN.id, "inst_test_made_up"] }))).toEqual([
      "unknown_reference $.order[1]",
      "catalog_mismatch $.order",
    ]);
    expect(codes(answer({ order: [RAIN.id, RAIN.id, PIXEL.id] }))).toEqual(["schema $.order[1]"]);
    expect(codes(answer({ order: [RAIN.id] }))).toEqual(["catalog_mismatch $.order"]);
    expect(codes(answer({ captions: [caption("inst_test_made_up", "Anything.")] }))).toContain(
      "unknown_reference $.captions[0].specId",
    );
    expect(codes(answer({ captions: [] }))).toEqual([
      "catalog_mismatch $.captions",
      "catalog_mismatch $.captions",
    ]);
  });

  it("refuses two captions for one instrument", () => {
    expect(
      codes(
        answer({
          captions: [...answer().captions, caption(RAIN.id, RAIN.caption.ink, RAIN.caption.grey)],
        }),
      ),
    ).toEqual(["schema $.captions[2].specId"]);
  });

  it("refuses a number that no cited record or current sentence holds, a year included", () => {
    for (const ink of [
      "April 2022 greenness was 0.5 across the catchment.",
      "Greenness fell by 12% across the catchment.",
      "Greenness was 0.1439 in March 2019.",
    ]) {
      expect(
        codes(answer({ captions: [caption(RAIN.id, ink), caption(PIXEL.id, PIXEL.caption.ink)] })),
        ink,
      ).toContain("numeric_provenance $.captions[0].ink");
    }
  });

  it("refuses digits written in another script: no record can account for them", () => {
    for (const ink of [
      // fullwidth 0.5 and Arabic-Indic 0.5 (escapes keep the source ASCII)
      "April 2022 greenness was \uFF10.\uFF15 across the catchment.",
      "April 2022 greenness was \u0660\u066B\u0665 across the catchment.",
    ]) {
      expect(
        codes(answer({ captions: [caption(RAIN.id, ink), caption(PIXEL.id, PIXEL.caption.ink)] })),
        ink,
      ).toContain("numeric_provenance $.captions[0].ink");
    }
  });

  it("refuses a prohibited claim, a banned word, two sentences and a sentence over its limit", () => {
    const bad = (ink: string, grey?: string) =>
      codes(
        answer({
          captions: [caption(RAIN.id, ink, grey), caption(PIXEL.id, PIXEL.caption.ink)],
        }),
      );
    expect(bad("Greenness was lowered due to grazing.")).toContain(
      "prohibited_claim $.captions[0].ink",
    );
    expect(bad("This proves the change.")).toContain("prohibited_claim $.captions[0].ink");
    expect(bad("A significant change.")).toContain("prohibited_claim $.captions[0].ink");
    expect(bad("One thing. And another thing.")).toContain("limit $.captions[0].ink");
    expect(bad("Fine.", "word ".repeat(60))).toContain("limit $.captions[0].grey");
    expect(bad("word ".repeat(45))).toContain("limit $.captions[0].ink");
    expect(bad("  ")).toContain("schema $.captions[0].ink");
  });

  it("offers the model no way to name a kind, a parameter or a record", () => {
    expect(codes({ ...answer(), kind: "layer_stack" })).toEqual(["schema $"]);
    expect(codes(answer({ captions: [{ ...caption(RAIN.id, "Fine."), parameters: {} }] }))).toEqual(
      ["schema $.captions[0]"],
    );
  });

  it("has an output schema inside the strict subset", () => {
    expect(strictSubsetIssues(instrumentOutputSchema())).toEqual([]);
  });
});

const sentOutputLimits: unknown[] = [];

async function run(store: MemoryCaseStore, ...answers: unknown[]) {
  const replay = syntheticTransport(answers.map((a) => answerStep(JSON.stringify(a))));
  const transport: ModelTransport = {
    route: replay.route,
    replayOrigin: replay.replayOrigin,
    open: (body, signal) => {
      sentOutputLimits.push(body.max_output_tokens);
      return replay.open(body, signal);
    },
  };
  return runInstrumentCompositionTask(
    {
      task: queuedTask({
        id: "task_test_instruments",
        kind: "instrument_composition",
        allowedTools: ["propose_instruments"],
      }),
      expectedCaseRevision: 5,
    },
    {
      adapter: new MetaAdapter({ transport, sleep: () => Promise.resolve() }),
      trace: { emit: () => undefined },
      store,
      tools: caseToolRegistry(store, CASE_ID),
      newEvidenceId: () => "ev_test_1",
      now: () => AT,
    },
  );
}

describe("instrument_composition task", () => {
  it("asks for up to 6,000 output tokens: the first live composition was cut off at 3,000 (29 Oct 2026)", async () => {
    sentOutputLimits.length = 0;
    await run(storeWith(RAIN, PIXEL), answer());
    expect(sentOutputLimits).toEqual([6_000]);
  });

  it("writes a component per instrument in the model's order, bound to the spec revision it shows", async () => {
    const { loop, commit } = await run(storeWith(RAIN, PIXEL), answer());
    expect(loop?.status).toBe("accepted");
    const [task, ...records] = commit.upserts;
    expect(task).toMatchObject({ id: "task_test_instruments", status: "succeeded", revision: 2 });
    const components = records.filter(
      (r): r is CanvasComponentRecord => r.recordType === "CanvasComponent",
    );
    expect(components.map((c) => [c.componentKind, c.order, c.section, c.visibility])).toEqual([
      ["pixel_anatomy", 0, "observations", "expanded"],
      ["rainfall_scatter", 1, "observations", "collapsed"],
    ]);
    expect(components.map((c) => c.entityVersions)).toEqual([
      [{ entityId: PIXEL.id, revision: 1 }],
      [{ entityId: RAIN.id, revision: 1 }],
    ]);
    expect(components.every((c) => c.sourceCaseRevision === 5 && c.revision === 1)).toBe(true);
    // Sentences the model kept are not written again
    expect(records.some((r) => r.recordType === "InstrumentSpec")).toBe(false);
  });

  it("writes the next spec revision for a reworded caption, bound by its component, with the task as author", async () => {
    const reworded = "Greenness over the catchment was 0.1439 in April 2022.";
    const { commit } = await run(
      storeWith(RAIN, PIXEL),
      answer({
        captions: [
          caption(RAIN.id, reworded, RAIN.caption.grey),
          caption(PIXEL.id, PIXEL.caption.ink, PIXEL.caption.grey),
        ],
      }),
    );
    const revised = commit.upserts.filter(
      (r): r is InstrumentSpecRecord => r.recordType === "InstrumentSpec",
    );
    expect(revised).toHaveLength(1);
    expect(revised[0]).toMatchObject({ id: RAIN.id, revision: 2, status: "ready" });
    expect(revised[0]?.caption.ink).toBe(reworded);
    expect(revised[0]?.caption.citationIds).toEqual(RAIN.caption.citationIds);
    expect(revised[0]?.parameters).toEqual(RAIN.parameters);
    expect(revised[0]?.provenance.generatedByTaskId).toBe("task_test_instruments");
    expect(revised[0]?.provenance.limitations.join(" ")).toContain("synthetic replay");
    const component = commit.upserts.find(
      (r): r is CanvasComponentRecord =>
        r.recordType === "CanvasComponent" && r.entityIds[0] === RAIN.id,
    );
    expect(component?.entityVersions).toEqual([{ entityId: RAIN.id, revision: 2 }]);
  });

  it("writes the next revision of a component that already shows an instrument", async () => {
    const store = storeWith(RAIN, PIXEL);
    store.instrumentComponents.push({
      recordType: "CanvasComponent",
      id: "comp_test_rain",
      revision: 3,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      caseId: CASE_ID,
      componentKind: "rainfall_scatter",
      entityIds: [RAIN.id],
      section: "observations",
      order: 0,
      visibility: "expanded",
      title: "Rain And Greenness",
      presentationStatus: "ready",
      sourceCaseRevision: 2,
      comparisonMode: null,
      periodIds: [],
      entityVersions: [{ entityId: RAIN.id, revision: 1 }],
    });
    const { commit } = await run(store, answer());
    const component = commit.upserts.find((r) => r.id === "comp_test_rain");
    expect(component).toMatchObject({
      revision: 4,
      createdAt: "2026-10-01T00:00:00.000Z",
      order: 1,
    });
  });

  it("keeps the composer's captions and order when the proposal is rejected twice", async () => {
    const bad = answer({
      captions: [
        caption(RAIN.id, "Greenness fell by 12% across the catchment."),
        caption(PIXEL.id, PIXEL.caption.ink),
      ],
    });
    const { loop, commit } = await run(storeWith(RAIN, PIXEL), bad, bad);
    expect(loop?.status).not.toBe("accepted");
    expect(commit.upserts).toHaveLength(1);
    expect(commit.upserts[0]).toMatchObject({ status: "failed", revision: 2 });
    expect(commit.events[0]?.message).toContain("The composer's captions and order stay");
  });

  it("makes no model call when the case has no ready instrument", async () => {
    const { loop, commit } = await run(testStore());
    expect(loop).toBeUndefined();
    expect(commit.upserts).toHaveLength(1);
    expect(commit.upserts[0]).toMatchObject({ status: "succeeded" });
  });

  it("does not offer a stale instrument to the model", async () => {
    const stale = { ...PIXEL, status: "stale" as const };
    const { commit } = await run(
      storeWith(RAIN, stale),
      answer({
        order: [RAIN.id],
        captions: [caption(RAIN.id, RAIN.caption.ink, RAIN.caption.grey)],
      }),
    );
    const components = commit.upserts.filter((r) => r.recordType === "CanvasComponent");
    expect(components.map((c) => c.id)).toEqual(["comp_test_rain"]);
  });
});
