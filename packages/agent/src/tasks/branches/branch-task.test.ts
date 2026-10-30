import {
  BranchMerge,
  ExplanationBranch,
  Hypothesis,
  InstrumentSpec,
  Task,
} from "@siterra/contracts";
import { coverIssues, openPairs } from "@siterra/domain";
import { describe, expect, it } from "vitest";

import { MetaAdapter } from "../../model/adapter.ts";
import type { ModelTransport, ResponsesBody, TransportStream } from "../../model/transport.ts";
import type { ReplayTransport } from "../../model/replay.ts";
import {
  BRANCH_PERIODS as PERIODS,
  BRANCH_SEASON as SEASON,
  BRANCH_VALUES,
  GRAZING_REPLY,
  RAINFALL_REPLY,
  UNUSED_TEST_FIELDS as none,
  addBranchRecord,
} from "../../testing/branch-fixture.ts";
import {
  AT,
  CASE_ID,
  TEST_ANALYSIS_CONFIG,
  bundle,
  queuedTask,
  testStore,
} from "../../testing/case-fixture.ts";
import { answerStep, syntheticTransport } from "../../testing/replay-steps.ts";
import { caseToolRegistry } from "../../tools/registry.ts";
import type { CaseStore, MemoryCaseStore } from "../../tools/store.ts";
import type { CommitOutcome } from "../commit.ts";
import type {
  BranchMergeRecord,
  CommitDraft,
  EvidenceRecord,
  ExplanationBranchRecord,
  HypothesisRecord,
  InstrumentSpecRecord,
} from "../records.ts";
import type { TraceEventDraft } from "../trace.ts";
import { BRANCH_PROMPT_VERSION, branchIdFor, runExplanationBranchesTask } from "./branch-task.ts";
import { buildCatalog, coveredSeasons } from "./catalog.ts";
import { validatePredictions } from "./proposal.ts";

// Synthetic record and replayed replies from testing/branch-fixture.ts; nothing here is a
// finding about any place.

const branchStore = (): MemoryCaseStore => addBranchRecord(testStore());

/** A reply that tests only the vegetation side, so it is met for either explanation. */
const VEGETATION_ONLY = {
  predictions: [
    {
      necessary: true,
      test: {
        ...none,
        kind: "departure_sign",
        pairId: "vegetation_rainfall",
        side: "a",
        periodIds: ["period_2022-03"],
        expected: "negative",
      },
      wording: "Vegetation departures in period_2022-03 are negative.",
    },
    GRAZING_REPLY.predictions[1],
  ],
};

/** Routes each branch's request to its own replay by the explanation ID in its first message. */
class ByExplanation implements ModelTransport {
  readonly route = "replay" as const;
  readonly replayOrigin = "synthetic" as const;
  readonly bodies: ResponsesBody[] = [];
  readonly #routes: Map<string, ReplayTransport>;

  constructor(routes: Record<string, unknown[]>) {
    this.#routes = new Map(
      Object.entries(routes).map(([id, replies]) => [
        id,
        syntheticTransport(replies.map((r) => answerStep(JSON.stringify(r)))),
      ]),
    );
  }

  open(body: ResponsesBody, signal: AbortSignal): Promise<TransportStream> {
    this.bodies.push(body);
    const text = JSON.stringify(body["input"]);
    for (const [id, target] of this.#routes) {
      if (text.includes(`Explanation: {\\"id\\":\\"${id}\\"`)) return target.open(body, signal);
    }
    throw new Error("no route for this explanation");
  }
}

const RESULT_READS = new Set([
  "readMeasurements",
  "readPeriodQuality",
  "readMeasurementsById",
  "readRecipeResult",
  "readEventRows",
  "readEvidence",
]);

/** Logs every store read in order, beside the commits, so the order can be checked. */
function logged(store: CaseStore, log: string[]): CaseStore {
  return new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        log.push(`read:${String(prop)}`);
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

interface Run {
  commit: CommitDraft;
  blockedInputs: readonly string[];
  interim: CommitDraft[];
  log: string[];
  events: TraceEventDraft[];
  transport: ByExplanation;
}

async function run(
  options: {
    store?: MemoryCaseStore;
    replies?: Record<string, unknown[]>;
    outcome?: CommitOutcome;
    noCommitNow?: boolean;
    committedEvidence?: EvidenceRecord[];
  } = {},
): Promise<Run> {
  const store = options.store ?? branchStore();
  const log: string[] = [];
  const interim: CommitDraft[] = [];
  const events: TraceEventDraft[] = [];
  const transport = new ByExplanation(
    options.replies ?? { rainfall: [RAINFALL_REPLY], grazing: [GRAZING_REPLY] },
  );
  const view = logged(store, log);
  const { commit, loop } = await runExplanationBranchesTask(
    {
      task: queuedTask({
        id: "task_test_branches",
        kind: "explanation_branches",
        question: "Which explanations does the record leave standing?",
        allowedTools: ["propose_predictions"],
      }),
      expectedCaseRevision: 3,
    },
    {
      adapter: new MetaAdapter({ transport, sleep: () => Promise.resolve() }),
      trace: {
        emit: (e) => {
          log.push(`trace:${e.kind}`);
          events.push(e);
        },
      },
      store: view,
      tools: caseToolRegistry(view, CASE_ID),
      newEvidenceId: () => "ev_test_unused",
      now: () => AT,
      ...(options.committedEvidence ? { committedEvidence: options.committedEvidence } : {}),
      ...(options.noCommitNow
        ? {}
        : {
            commitNow: (draft: CommitDraft) => {
              log.push("commit:predictions");
              interim.push(draft);
              return Promise.resolve(
                options.outcome ?? { status: "committed", newCaseRevision: 4, entityIds: [] },
              );
            },
          }),
    },
  );
  return { commit, blockedInputs: loop.blockedInputs, interim, log, events, transport };
}

const branchesOf = (draft: CommitDraft) =>
  draft.upserts.filter((r): r is ExplanationBranchRecord => r.recordType === "ExplanationBranch");

describe("DF-07: predictions are committed before any result is read", () => {
  it("reads no measurement, quality record or recipe result until the predictions commit", async () => {
    const { log, interim } = await run();
    const committedAt = log.indexOf("commit:predictions");
    expect(committedAt).toBeGreaterThan(-1);
    const firstResult = log.findIndex((entry) => RESULT_READS.has(entry.slice("read:".length)));
    expect(firstResult).toBeGreaterThan(committedAt);
    const predicted = branchesOf(interim[0] as CommitDraft);
    expect(predicted.map((b) => [b.explanationId, b.revision, b.status, b.scores])).toEqual([
      ["rainfall", 1, "predicted", []],
      ["grazing", 1, "predicted", []],
    ]);
    for (const b of predicted) expect(ExplanationBranch.parse(b)).toEqual(b);
  });

  it("a predictions commit that does not apply reads no result and scores nothing", async () => {
    const { log, commit } = await run({ outcome: { status: "stale", currentCaseRevision: 9 } });
    expect(log.some((entry) => RESULT_READS.has(entry.slice("read:".length)))).toBe(false);
    expect(commit.upserts[0]).toMatchObject({
      recordType: "Task",
      status: "failed",
      failureCode: "predictions_not_committed",
    });
    expect(branchesOf(commit)).toEqual([]);
  });

  it("the model is offered no tool and sees no stored value", async () => {
    const { transport } = await run();
    expect(transport.bodies).toHaveLength(2);
    const values = [
      ...BRANCH_VALUES.vegetation,
      ...BRANCH_VALUES.vegetationLeaveOneYearOut,
      ...BRANCH_VALUES.rainfall,
      BRANCH_VALUES.seasonDepartureMm,
    ];
    for (const body of transport.bodies) {
      expect(body["tools"] ?? []).toEqual([]);
      const text = JSON.stringify(body);
      for (const v of values) expect(text).not.toContain(String(v));
      expect(text).not.toContain("meas_");
      expect(JSON.stringify(body["input"])).not.toContain("below_normal");
    }
  });

  it("refuses to run without a way to commit the predictions first", async () => {
    const { commit, transport } = await run({ noCommitNow: true });
    expect(commit.upserts[0]).toMatchObject({ failureCode: "interim_commit_unavailable" });
    expect(transport.bodies).toHaveLength(0);
  });
});

describe("scoring, merge and the records it writes", () => {
  it("scores by code and sets each status by the fixed rules", async () => {
    const { commit, blockedInputs } = await run();
    const [task, ...rest] = commit.upserts;
    expect(Task.parse(task)).toMatchObject({ status: "succeeded", failureCode: null });
    expect(blockedInputs).toEqual([]);
    const scored = branchesOf(commit);
    expect(scored.map((b) => [b.explanationId, b.revision, b.status])).toEqual([
      ["rainfall", 2, "consistent"],
      ["grazing", 2, "contradicted"],
    ]);
    expect(scored[0]?.scores.map((s) => s.outcome)).toEqual(["met", "met"]);
    expect(scored[1]?.scores.map((s) => [s.outcome, s.reasonCode])).toEqual([
      ["not_met", null],
      ["not_testable", "field_measurement_needed"],
    ]);
    expect(scored.every((b) => b.predictionsCaseRevision === 4)).toBe(true);
    for (const b of scored) expect(ExplanationBranch.parse(b)).toEqual(b);

    const merge = rest.find((r): r is BranchMergeRecord => r.recordType === "BranchMerge");
    expect(merge && BranchMerge.parse(merge)).toBeTruthy();
    expect(merge?.rulesVersion).toBe("merge@2");
    expect(merge?.conflicts.map((c) => c.kind)).toEqual(["not_testable"]);

    const hypotheses = rest.filter((r): r is HypothesisRecord => r.recordType === "Hypothesis");
    expect(hypotheses.map((h) => h.status)).toEqual(["consistent", "inconsistent"]);
    for (const h of hypotheses) expect(Hypothesis.parse(h)).toEqual(h);
    expect(hypotheses[1]?.missingEvidence).toEqual(["p2: Only a field measurement can test this."]);
    expect(scored.map((b) => b.hypothesisId)).toEqual(hypotheses.map((h) => h.id));
  });

  it("each branch's ID is fixed by the task and the explanation", async () => {
    const { commit } = await run();
    expect(branchesOf(commit).map((b) => b.id)).toEqual([
      branchIdFor("task_test_branches", "rainfall"),
      branchIdFor("task_test_branches", "grazing"),
    ]);
  });

  it("a case with no analysis configuration fails before any model call", async () => {
    const store = branchStore();
    store.analysisConfigs.clear();
    const { commit, transport } = await run({ store });
    expect(commit.upserts[0]).toMatchObject({ status: "failed", failureCode: "no_case_config" });
    expect(transport.bodies).toHaveLength(0);
  });

  it("names each configured input the case lacks as a blocked input and offers no target in it", async () => {
    const store = addBranchRecord(testStore(), ["rainfall", "season"]);
    const { blockedInputs, transport, commit } = await run({
      store,
      replies: { rainfall: [VEGETATION_ONLY], grazing: [VEGETATION_ONLY] },
    });
    expect(blockedInputs).toEqual([
      "rainfall departure (vegetation_rainfall side b): no validated test_rain_monthly bundle in this case.",
      "November to April wet season: no validated season_summary 1.0.0 result in this case.",
    ]);
    expect(JSON.stringify(transport.bodies[0]?.["input"])).toContain('\\"seasonIds\\":[]');
    expect(branchesOf(commit).map((b) => b.status)).toEqual(["consistent", "consistent"]);
  });

  it("the merge names the minimum field plan for the explanations left open (DF-09)", async () => {
    const mergeOf = (draft: CommitDraft) =>
      draft.upserts.find((r): r is BranchMergeRecord => r.recordType === "BranchMerge");
    const hypothesesOf = (draft: CommitDraft) =>
      draft.upserts.filter((r): r is HypothesisRecord => r.recordType === "Hypothesis");

    const open = await run({
      replies: { rainfall: [VEGETATION_ONLY], grazing: [VEGETATION_ONLY] },
    });
    const merge = mergeOf(open.commit);
    expect(merge?.branches.map((b) => b.status)).toEqual(["consistent", "consistent"]);
    expect(merge?.fieldPlan).toEqual({
      measurements: [
        {
          fieldCheckId: "grazing_exclosure",
          label: "Grazing Exclosure",
          separates: [["grazing", "rainfall"]],
          onlySeparates: [["grazing", "rainfall"]],
        },
      ],
      unseparated: [],
    });
    expect(merge && BranchMerge.parse(merge)).toEqual(merge);
    const cover = {
      measurements: (merge?.fieldPlan?.measurements ?? []).map((m) => ({
        ...m,
        id: m.fieldCheckId,
      })),
      unseparated: merge?.fieldPlan?.unseparated ?? [],
    };
    expect(
      coverIssues(cover, TEST_ANALYSIS_CONFIG.fieldChecks, openPairs(merge?.branches ?? [])),
    ).toEqual([]);
    expect(hypothesesOf(open.commit).map((h) => h.missingEvidence.at(-1))).toEqual([
      "Grazing Exclosure (grazing_exclosure) separates Rainfall from Grazing.",
      "Grazing Exclosure (grazing_exclosure) separates Grazing from Rainfall.",
    ]);

    const oneStanding = await run();
    expect(mergeOf(oneStanding.commit)?.fieldPlan).toEqual({
      measurements: [
        {
          fieldCheckId: "grazing_exclosure",
          label: "Grazing Exclosure",
          separates: [["grazing", "rainfall"]],
          onlySeparates: [["grazing", "rainfall"]],
        },
      ],
      unseparated: [],
    });
    expect(hypothesesOf(oneStanding.commit)[0]?.missingEvidence).toEqual([
      "Grazing Exclosure (grazing_exclosure) separates Rainfall from Grazing.",
    ]);
    expect(hypothesesOf(oneStanding.commit)[1]?.missingEvidence).toEqual([
      "p2: Only a field measurement can test this.",
    ]);

    const bothContradicted = await run({
      replies: { rainfall: [GRAZING_REPLY], grazing: [GRAZING_REPLY] },
    });
    expect(mergeOf(bothContradicted.commit)?.fieldPlan).toEqual({
      measurements: [],
      unseparated: [],
    });
  });

  it("names an open pair no configured field check separates", async () => {
    const store = branchStore();
    store.analysisConfigs.set(CASE_ID, { ...TEST_ANALYSIS_CONFIG, fieldChecks: [] });
    const recordOnly = {
      predictions: [
        VEGETATION_ONLY.predictions[0],
        {
          necessary: false,
          test: {
            ...none,
            kind: "availability",
            pairId: "vegetation_rainfall",
            side: "a",
            periodIds: ["period_2022-03"],
            expected: "all_available",
          },
          wording: "Vegetation values in period_2022-03 are all available.",
        },
      ],
    };
    const { commit } = await run({
      store,
      replies: { rainfall: [recordOnly], grazing: [recordOnly] },
    });
    const merge = commit.upserts.find(
      (r): r is BranchMergeRecord => r.recordType === "BranchMerge",
    );
    expect(merge?.fieldPlan).toEqual({ measurements: [], unseparated: [["grazing", "rainfall"]] });
    const hypotheses = commit.upserts.filter(
      (r): r is HypothesisRecord => r.recordType === "Hypothesis",
    );
    expect(hypotheses.map((h) => h.missingEvidence.at(-1))).toEqual([
      "No configured field check separates Rainfall from Grazing.",
      "No configured field check separates Grazing from Rainfall.",
    ]);
  });

  it("a resumed task scores the predictions it committed, with no new model call", async () => {
    const first = await run();
    const store = branchStore();
    store.branches.push(...branchesOf(first.interim[0] as CommitDraft));
    const again = await run({
      store,
      replies: { rainfall: [], grazing: [] },
      outcome: { status: "duplicate", newCaseRevision: 4, entityIds: [] },
    });
    expect(again.transport.bodies).toHaveLength(0);
    expect(again.interim[0]?.idempotencyKey).toBe(first.interim[0]?.idempotencyKey);
    expect(branchesOf(again.commit).map((b) => b.status)).toEqual(["consistent", "contradicted"]);
  });
});

describe("the field plan instrument is written in the commit that writes the merge", () => {
  const rule = {
    from: "branch_merge" as const,
    id: "field_plan_test",
    whenExplanationIds: ["rainfall", "grazing"],
    caption: {
      ink: "A field plan is proposed for the explanations the record leaves open.",
      grey: "Proposed only: no visit is scheduled and no access or permission is implied.",
    },
  };
  const withRule = (): MemoryCaseStore => {
    const store = branchStore();
    store.analysisConfigs.set(CASE_ID, { ...TEST_ANALYSIS_CONFIG, instruments: [rule] });
    store.geoSelections.push({ caseId: CASE_ID, id: "geo_test_catchment", revision: 1 });
    return store;
  };
  const specsOf = (draft: CommitDraft) =>
    draft.upserts.filter((r): r is InstrumentSpecRecord => r.recordType === "InstrumentSpec");
  const mergeOf = (draft: CommitDraft) =>
    draft.upserts.find((r): r is BranchMergeRecord => r.recordType === "BranchMerge");
  const open = { rainfall: [VEGETATION_ONLY], grazing: [VEGETATION_ONLY] };

  it("adds a field_plan spec that names the merge, cites what the plan rests on and parses as its contract", async () => {
    const { commit } = await run({ store: withRule(), replies: open });
    const [spec, ...others] = specsOf(commit);
    expect(others).toEqual([]);
    expect(spec && InstrumentSpec.parse(spec)).toEqual(spec);
    expect(spec).toMatchObject({
      id: "inst_field_plan_test",
      revision: 1,
      status: "ready",
      parameters: {
        kind: "field_plan",
        geoSelectionId: "geo_test_catchment",
        branchMergeId: mergeOf(commit)?.id,
        actionId: null,
      },
      caption: { claimKind: "field_requirement" },
      provenance: { methodId: "instrument_composer", generatedByTaskId: null },
    });
    expect(spec?.caption.citationIds.length).toBeGreaterThan(0);
    const task = commit.upserts.find((r) => r.recordType === "Task");
    expect(task && "outputEntityIds" in task ? task.outputEntityIds : []).toContain(
      "inst_field_plan_test",
    );
  });

  const evidence = (id: string, claimKind: EvidenceRecord["claimKind"]): EvidenceRecord => ({
    recordType: "Evidence",
    id,
    revision: 1,
    createdAt: AT.toISOString(),
    updatedAt: AT.toISOString(),
    caseId: CASE_ID,
    statement: "A synthetic statement.",
    claimKind,
    status: "accepted",
    geoSelectionId: null,
    periodIds: [],
    measurementIds: [],
    provenance: {
      sourceLocators: [],
      dataBundleIds: [],
      methodId: null,
      methodVersion: null,
      inputVersions: [],
      generatedByTaskId: null,
      generatedAt: AT.toISOString(),
      verificationStatus: "computed_checked",
      limitations: [],
    },
    interpretation: null,
    uncertainty: "Not quantified.",
    reviewDecisionIds: [],
  });

  it("cites Evidence an earlier task of the command committed, which the store's view predates", async () => {
    const committed = evidence("ev_test_committed", "observation");
    const { commit } = await run({
      store: withRule(),
      replies: open,
      committedEvidence: [committed],
    });
    const hypothesis = commit.upserts.find(
      (r): r is HypothesisRecord => r.recordType === "Hypothesis",
    );
    expect(hypothesis?.supportingEvidenceIds).toContain("ev_test_committed");
    expect(specsOf(commit)[0]?.caption.citationIds).toContain("ev_test_committed");
  });

  it("cites the accepted field requirements of the case, from the store and from the command", async () => {
    const store = withRule();
    store.evidence.push(evidence("ev_test_gap_stored", "field_requirement"));
    const { commit } = await run({
      store,
      replies: open,
      committedEvidence: [
        evidence("ev_test_gap_committed", "field_requirement"),
        { ...evidence("ev_test_gap_other_case", "field_requirement"), caseId: "case_other" },
      ],
    });
    expect(specsOf(commit)[0]?.caption.citationIds).toEqual(
      expect.arrayContaining(["ev_test_gap_stored", "ev_test_gap_committed"]),
    );
    expect(specsOf(commit)[0]?.caption.citationIds).not.toContain("ev_test_gap_other_case");
  });

  it("writes the next revision of the spec a case already holds", async () => {
    const first = await run({ store: withRule(), replies: open });
    const store = withRule();
    const before = specsOf(first.commit)[0];
    if (!before) throw new Error("no first spec");
    store.instrumentSpecs.push({ ...before, createdAt: "2026-10-01T00:00:00.000Z" });
    const { commit } = await run({ store, replies: open });
    expect(specsOf(commit)[0]).toMatchObject({
      id: "inst_field_plan_test",
      revision: 2,
      createdAt: "2026-10-01T00:00:00.000Z",
    });
  });

  it("writes no spec for a case whose configuration holds no field plan rule", async () => {
    const { commit } = await run({ replies: open });
    expect(specsOf(commit)).toEqual([]);
  });

  it("writes no spec when the case holds no area for the plan to name", async () => {
    const store = withRule();
    store.geoSelections.length = 0;
    const { commit } = await run({ store, replies: open });
    expect(mergeOf(commit)).toBeDefined();
    expect(specsOf(commit)).toEqual([]);
  });
});

describe("TR-07: per-branch model and validator outcomes, no personas", () => {
  it("tags each branch's model and validation events with its branch ID", async () => {
    const { events } = await run();
    for (const id of ["rainfall", "grazing"]) {
      const branchId = branchIdFor("task_test_branches", id);
      const mine = events.filter((e) => e.entityIds.includes(branchId)).map((e) => e.kind);
      expect(mine).toEqual(["model.started", "model.completed", "validation.completed"]);
    }
  });

  it("the trace shows each host load, run after the predictions were recorded", async () => {
    const { events, log, interim } = await run();
    expect(interim[0]?.events.map((e) => e.kind)).toEqual(["task.progress"]);
    const recorded = log.indexOf("commit:predictions");
    expect(log.findIndex((entry) => entry.startsWith("trace:tool."))).toBeGreaterThan(recorded);
    const loads = events.filter((e) => e.kind === "tool.started" || e.kind === "tool.completed");
    expect(loads.map((e) => `${e.kind} ${e.tool?.name ?? ""} ${e.tool?.status ?? ""}`)).toEqual([
      "tool.started compare_series started",
      "tool.completed compare_series succeeded",
      "tool.started compare_series started",
      "tool.completed compare_series succeeded",
    ]);
    expect(loads[1]?.tool?.resultEntityIds).toContain("meas_rd_0");
  });

  it("every branch gets the same instructions; only the explanation differs", async () => {
    const { transport } = await run();
    const instructions = new Set(transport.bodies.map((b) => b["instructions"]));
    expect(instructions.size).toBe(1);
  });

  it("records a branch whose predictions fail the check twice, and the task is partial", async () => {
    const bad = {
      predictions: [
        {
          necessary: true,
          test: { ...none, kind: "season_category", seasonId: SEASON, expected: "below_normal" },
          wording: "Low greenness was caused by low rainfall.",
        },
      ],
    };
    const { commit, events } = await run({
      replies: { rainfall: [bad, bad], grazing: [GRAZING_REPLY] },
    });
    expect(commit.upserts[0]).toMatchObject({ status: "partial" });
    const [rainfall, grazing] = branchesOf(commit);
    expect(rainfall?.model).toEqual({
      model: "muse-spark-1.3",
      promptVersion: BRANCH_PROMPT_VERSION,
      loopStatus: "rejected",
      validationOutcome: "rejected",
      failureCode: "validation_rejected",
      repaired: true,
    });
    expect(rainfall?.status).toBe("cannot_be_assessed");
    expect(rainfall?.predictions).toEqual([]);
    expect(grazing?.model.loopStatus).toBe("accepted");
    const rainfallId = branchIdFor("task_test_branches", "rainfall");
    expect(
      events.filter((e) => e.entityIds.includes(rainfallId) && e.kind === "validation.completed"),
    ).toHaveLength(2);
  });
});

describe("the prediction check", () => {
  async function context() {
    const store = branchStore();
    const catalog = await buildCatalog(store, CASE_ID, TEST_ANALYSIS_CONFIG);
    return { catalog, years: { first: 2021, last: 2022 } };
  }
  const reply = (...predictions: unknown[]) => JSON.stringify({ predictions });
  const sign = (extra: Record<string, unknown> = {}) => ({
    necessary: true,
    test: {
      ...none,
      kind: "departure_sign",
      pairId: "vegetation_rainfall",
      side: "a",
      periodIds: ["period_2022-03"],
      expected: "negative",
      ...extra,
    },
    wording: "Vegetation departures in period_2022-03 are negative.",
  });
  const field = {
    necessary: false,
    test: { ...none, kind: "field_check", fieldCheckId: "grazing_exclosure" },
    wording: "Grazed plots are lower than ungrazed plots.",
  };

  it("accepts a valid set and assigns the keys", async () => {
    const checked = validatePredictions(reply(sign(), field), await context());
    expect(checked.ok && checked.value.map((p) => p.key)).toEqual(["p1", "p2"]);
  });

  it("refuses fields a kind does not use, unknown targets and repeated tests", async () => {
    const ctx = await context();
    const issues = (text: string) => {
      const c = validatePredictions(text, ctx);
      return c.ok ? [] : c.issues.map((i) => `${i.code} ${i.path}`);
    };
    expect(issues(reply(sign({ seasonId: SEASON }), field))).toContain(
      "schema $.predictions[0].test.seasonId",
    );
    expect(issues(reply(sign({ periodIds: ["period_2019-01"] }), field))).toContain(
      "unknown_reference $.predictions[0].test.periodIds[0]",
    );
    expect(issues(reply(sign({ pairId: "soil" }), field))).toContain(
      "unknown_reference $.predictions[0].test.pairId",
    );
    expect(issues(reply(sign(), sign()))).toContain("limit $.predictions[1].test");
    expect(issues(reply(sign({ expected: "present" }), field))).toContain(
      "schema $.predictions[0].test.expected",
    );
    expect(issues(reply(sign()))).toContain("limit $.predictions");
  });

  it("needs a necessary prediction and one that tests the record", async () => {
    const ctx = await context();
    const messages = (text: string) => {
      const c = validatePredictions(text, ctx);
      return c.ok ? [] : c.issues.map((i) => i.message);
    };
    expect(messages(reply({ ...sign(), necessary: false }, field))).toContain(
      "Mark at least one prediction necessary.",
    );
    expect(messages(reply({ ...field, necessary: true }, field))).toContain(
      "At least one prediction must test the record, not the field.",
    );
  });

  it("keeps the wording rules: no cause, probability, ranking or unproven number", async () => {
    const ctx = await context();
    for (const wording of [
      "Greenness fell due to rainfall.",
      "Rainfall is the likely explanation.",
      "This is the stronger explanation.",
      "Departures fall by 12 percent.",
    ]) {
      const c = validatePredictions(reply({ ...sign(), wording }, field), ctx);
      expect(c.ok, wording).toBe(false);
    }
  });

  it("ends the branch out of scope, with no repair, when wording blames people for who they are", async () => {
    const ctx = await context();
    const c = validatePredictions(
      reply({ ...sign(), wording: "Migrants are to blame for the low values." }, field),
      ctx,
    );
    expect(!c.ok && c.failureCode).toBe("out_of_scope");
  });
});

describe("the catalog the model reads", () => {
  it("lists complete seasons of the configured window, from bundle periods alone", () => {
    expect(coveredSeasons(PERIODS, TEST_ANALYSIS_CONFIG.rainfallSeason)).toEqual([SEASON]);
    expect(coveredSeasons(PERIODS.slice(1), TEST_ANALYSIS_CONFIG.rainfallSeason)).toEqual([]);
    expect(
      coveredSeasons(["period_2022-06", "period_2022-07"], { startMonth: 6, endMonth: 7 }),
    ).toEqual(["season_2022-06_2022-07"]);
  });

  it("finds each side's bundle by its configured method", async () => {
    const catalog = await buildCatalog(branchStore(), CASE_ID, TEST_ANALYSIS_CONFIG);
    expect(catalog.pairs[0]?.a.bundle).toEqual({ id: "bundle_test_vegdep", revision: 1 });
    expect(catalog.pairs[0]?.b.bundle).toEqual({ id: "bundle_test_rainmon", revision: 1 });
    expect(catalog.seasonIds).toEqual([SEASON]);
    expect(catalog.trendStrata).toEqual([]);
    expect(catalog.gaps).toEqual([]);
  });

  it("scores trend_direction over restrend_long_record and contradicts Expected Decline", async () => {
    const store = branchStore();
    store.analysisConfigs.set(CASE_ID, {
      ...TEST_ANALYSIS_CONFIG,
      trendSummary: {
        recipe: { recipeId: "restrend_long_record", version: "1.0.0" },
        strata: ["catchment", "elevation_high"],
      },
    });
    store.bundles.push(
      bundle({
        id: "bundle_test_restrend",
        revision: 1,
        methodId: "restrend_long_record",
        methodVersion: "1.0.0",
        periodIds: [],
      }),
    );
    store.recipeResults.push({
      caseId: CASE_ID,
      bundleId: "bundle_test_restrend",
      recipeId: "restrend_long_record",
      version: "1.0.0",
      result: {
        recipeId: "restrend_long_record",
        version: "1.0.0",
        period: { first_season: 2000, last_season: 2025 },
        headline: {
          catchment: {
            status: "precondition_not_met",
            unadjusted_trend_per_decade: [
              0.009061982905982908, 0.004565103168469516, 0.0135588626434963,
            ],
            residual_trend_per_decade: 0.00942316629059829,
            lower_per_decade: 0.005210130730760914,
            upper_per_decade: 0.013636201850435667,
          },
        },
      },
    });
    const expectedDeclineReply = {
      predictions: [
        {
          necessary: true,
          test: {
            ...none,
            kind: "trend_direction",
            stratumId: "catchment",
            trendSeries: "unadjusted",
            expected: "decreasing",
          },
          wording: "Between 2000 and 2025, spring greenness in the catchment decreased.",
        },
        {
          necessary: false,
          test: {
            ...none,
            kind: "trend_direction",
            stratumId: "catchment",
            trendSeries: "residual",
            expected: "decreasing",
          },
          wording: "Between 2000 and 2025, rainfall-adjusted greenness in the catchment decreased.",
        },
      ],
    };
    const { commit, log } = await run({
      store,
      replies: { rainfall: [RAINFALL_REPLY], grazing: [expectedDeclineReply] },
    });
    const committedAt = log.indexOf("commit:predictions");
    expect(log.indexOf("read:readRecipeResult")).toBeGreaterThan(committedAt);
    const [, grazing] = branchesOf(commit);
    expect(grazing?.status).toBe("contradicted");
    expect(grazing?.scores.map((s) => [s.outcome, s.reasonCode])).toEqual([
      ["not_met", null],
      ["not_testable", "precondition_not_met"],
    ]);
  });
});
