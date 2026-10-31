import { describe, expect, it } from "vitest";

import { MetaAdapter } from "../model/adapter.ts";
import type { ModelTransport, ResponsesBody, TransportStream } from "../model/transport.ts";
import { AT, CASE_ID, queuedTask, testStore } from "../testing/case-fixture.ts";
import { answerStep, syntheticTransport, toolCallStep } from "../testing/replay-steps.ts";
import { caseToolRegistry } from "../tools/registry.ts";
import { readSourceTool } from "../tools/source-tools.ts";
import { PROPOSAL_ROUNDS } from "./loop.ts";
import { runObservationTask } from "./observation/observation-task.ts";
import type { TraceEventDraft } from "./trace.ts";

// Synthetic replays of the pattern recorded in the two live GATE-03 runs of 28 Oct 2026: the
// model asked for tools in every one of its 6 rounds and so never returned a proposal.

const SUMMARIZE_ARGS = {
  bundleId: "bundle_test_ndvi",
  bundleRevision: 2,
  periodIds: ["period_2022-03", "period_2022-04", "period_2022-05"],
  metric: "ndvi_area_median",
};

function item(statement: string, measurementIds: string[]) {
  return {
    statement,
    claimKind: "observation",
    measurementIds,
    sourceId: null,
    locator: null,
    excerpt: null,
    scopeNote: "",
    limitations: [],
  };
}

const GOOD = JSON.stringify({
  items: [item("The catchment NDVI area median was 0.1439 in April 2022.", ["meas_test_2022-04"])],
});
const INVENTED = JSON.stringify({
  items: [item("NDVI rose by 0.0228 from March to April 2022.", ["meas_test_2022-04"])],
});

/** A model that calls a tool whenever tools are offered (or always), and otherwise answers. */
class ReadingModel implements ModelTransport {
  readonly route = "replay" as const;
  readonly replayOrigin = "synthetic" as const;
  readonly bodies: ResponsesBody[] = [];
  readonly #answers: string[];
  readonly #alwaysCallsTools: boolean;

  constructor(answers: string[], alwaysCallsTools = false) {
    this.#answers = [...answers];
    this.#alwaysCallsTools = alwaysCallsTools;
  }

  open(body: ResponsesBody, signal: AbortSignal): Promise<TransportStream> {
    this.bodies.push(body);
    const step =
      this.#alwaysCallsTools || body["tools"] !== undefined
        ? toolCallStep("summarize_observations", SUMMARIZE_ARGS)
        : answerStep(this.#answers.shift() ?? GOOD);
    return syntheticTransport([step]).open(body, signal);
  }
}

async function run(model: ReadingModel) {
  const store = testStore();
  const events: TraceEventDraft[] = [];
  let n = 0;
  const { loop } = await runObservationTask(
    { task: queuedTask(), expectedCaseRevision: 3 },
    {
      adapter: new MetaAdapter({ transport: model, sleep: () => Promise.resolve() }),
      trace: { emit: (e: TraceEventDraft) => events.push(e) },
      store,
      tools: caseToolRegistry(store, CASE_ID),
      newEvidenceId: () => `ev_test_${String((n += 1)).padStart(2, "0")}`,
      now: () => AT,
    },
  );
  const offered = model.bodies.map((b) => b["tools"] !== undefined);
  const ran = events.filter((e) => e.kind === "tool.completed").length;
  return { loop, offered, ran, events };
}

describe("task loop, the last rounds are for the proposal", () => {
  it("a model that keeps reading is asked for its proposal, with no tools offered", async () => {
    const model = new ReadingModel([GOOD]);
    const { loop, offered, ran } = await run(model);
    expect(PROPOSAL_ROUNDS).toBe(2);
    expect(offered).toEqual([true, true, true, true, false]);
    expect(ran).toBe(4);
    expect(loop.status).toBe("accepted");
    expect(JSON.stringify(model.bodies[4]?.["input"])).toContain("No tool calls are left");
  });

  it("emits structured ToolCallTarget on tool.started and tool.completed", async () => {
    const { events } = await run(new ReadingModel([GOOD]));
    const started = events.find((e) => e.kind === "tool.started");
    const completed = events.find((e) => e.kind === "tool.completed");
    expect(started?.tool?.target).toEqual({
      kind: "land",
      stratumId: "catchment",
      bundleId: "bundle_test_ndvi",
      recipeId: null,
      sourceId: null,
      pages: [],
      sections: [],
      queryTerms: [],
    });
    expect(completed?.tool?.target).toEqual({
      kind: "land",
      stratumId: "catchment",
      bundleId: "bundle_test_ndvi",
      recipeId: null,
      sourceId: null,
      pages: [],
      sections: [],
      queryTerms: [],
    });

    const readSource = readSourceTool(testStore(), CASE_ID);
    const parsedSource = readSource.parse({
      sourceId: "src_SCI-127",
      document: null,
      pages: [7],
      sections: [],
    });
    expect(parsedSource.ok && readSource.target?.(parsedSource.value)).toEqual({
      kind: "source",
      stratumId: null,
      bundleId: null,
      recipeId: null,
      sourceId: "src_SCI-127",
      pages: [7],
      sections: [],
      queryTerms: [],
    });
  });

  it("the proposal keeps its one repair turn, also without tools", async () => {
    const { loop, offered } = await run(new ReadingModel([INVENTED, GOOD]));
    expect(offered).toEqual([true, true, true, true, false, false]);
    expect(loop.repaired).toBe(true);
    expect(loop.status).toBe("accepted");
  });

  it("a proposal rejected twice still fails the task", async () => {
    const { loop } = await run(new ReadingModel([INVENTED, INVENTED]));
    expect(loop.status).toBe("rejected");
    expect(loop.failureCode).toBe("validation_rejected");
  });

  it("a tool call in a proposal round is not run, and the task fails at the round limit", async () => {
    const { loop, offered, ran } = await run(new ReadingModel([], true));
    expect(offered).toEqual([true, true, true, true, false, false]);
    expect(ran).toBe(4);
    expect(loop.status).toBe("round_limit");
  });
});
