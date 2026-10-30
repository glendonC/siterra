import { describe, expect, it } from "vitest";

import type { ReplayStep } from "../model/replay.ts";
import { hypothesisIdFor } from "../tasks/branches/branch-task.ts";
import {
  BRANCH_SEASON,
  RAINFALL_REPLY,
  UNUSED_TEST_FIELDS,
  addBranchRecord,
} from "../testing/branch-fixture.ts";
import { AT, bundle, testStore } from "../testing/case-fixture.ts";
import { answerStep, syntheticTransport, toolCallStep } from "../testing/replay-steps.ts";
import { RoutingTransport } from "../testing/routing-transport.ts";
import { MemoryCommitApi } from "../tasks/commit.ts";
import type { PlanSnapshot } from "../tasks/plan/prompt.ts";
import type { TaskRecord } from "../tasks/records.ts";
import { PLAN_INSTRUCTIONS } from "../tasks/plan/prompt.ts";
import type { TraceEventDraft } from "../tasks/trace.ts";
import { P0_LIMITS } from "./limits.ts";
import { EXECUTORS, runCommand, type TaskExecutor } from "./run-command.ts";

// A whole command on synthetic replays and the memory commit double. These tests show the
// coordinator's control flow; they show nothing about a live model (AF-01 needs one).

const PLAN_TASK: TaskRecord = {
  recordType: "Task",
  id: "task_test_plan",
  revision: 1,
  createdAt: AT.toISOString(),
  updatedAt: AT.toISOString(),
  caseId: "case_test_valley",
  commandId: "cmd_test_commission",
  kind: "plan",
  question: "Plan the commission.",
  status: "queued",
  dependsOnTaskIds: [],
  inputVersions: [],
  allowedTools: ["read_case", "propose_plan"],
  outputEntityIds: [],
  idempotencyKey: "test-plan-0001",
  attempt: 0,
  maxModelRounds: 6,
  deadlineAt: "2026-10-27T20:03:00.000Z",
  budgetMicroUsd: 500_000,
  spentMicroUsd: 0,
  checkpointId: null,
  failureCode: null,
  missingInputs: [],
  startedAt: null,
  finishedAt: null,
};

const SNAPSHOT: PlanSnapshot = {
  command: { text: "Investigate the valley.", intent: "commission" },
  context: {
    caseRevision: 3,
    geoSelectionId: "geo_test_catchment",
    geoRevision: 1,
    periodIds: [],
    focusedEntityIds: [],
    dataBundleIds: ["bundle_test_ndvi"],
    locale: "en",
  },
  case: {
    title: "Test case",
    objective: "Test objective.",
    mode: "replay",
    unresolvedQuestions: [],
  },
  records: [
    { id: "bundle_test_ndvi", revision: 2, recordType: "DataBundle", label: "NDVI bundle" },
  ],
};

const PLAN = {
  interpretation: "The command asks what the corpus and the bundle show about the valley.",
  tasks: [
    {
      key: "sources",
      kind: "source_research",
      question: "What do sources say about closures?",
      dependsOn: [],
      inputRefs: [],
    },
    {
      key: "observations",
      kind: "observation_analysis",
      question: "What did NDVI show in spring 2022?",
      dependsOn: [],
      inputRefs: [{ entityId: "bundle_test_ndvi", revision: 2 }],
    },
    {
      key: "livelihoods",
      kind: "livelihood_governance",
      question: "Who sets pasture rules?",
      dependsOn: [],
      inputRefs: [],
    },
    {
      key: "compare",
      kind: "explanation_branches",
      question: "Which explanations does the record leave standing?",
      dependsOn: ["sources", "observations", "livelihoods"],
      inputRefs: [],
    },
  ],
  clarifyingQuestion: null,
};

const EXCERPT = "réglé par une fermeture saisonnière de 3 mois.";
const context = (statement: string) => ({
  statement,
  claimKind: "scientific_context",
  measurementIds: [],
  sourceId: "src_test_report",
  locator: "report.pdf, page 2",
  excerpt: EXCERPT,
  scopeNote: "",
  limitations: [],
});
const fieldNeed = {
  statement: "Who decides the closure dates in the valley must be checked locally.",
  claimKind: "field_requirement",
  measurementIds: [],
  sourceId: null,
  locator: null,
  excerpt: null,
  scopeNote: "Informs which roles review a closure option.",
  limitations: [],
};
const observation = {
  statement: "The catchment NDVI area median was 0.1439 in April 2022.",
  claimKind: "observation",
  measurementIds: ["meas_test_2022-04"],
  sourceId: null,
  locator: null,
  excerpt: null,
  scopeNote: "",
  limitations: [],
};

function routes(
  plan: ReplayStep[] = [answerStep(JSON.stringify(PLAN))],
  extra: ConstructorParameters<typeof RoutingTransport>[0] = [],
): RoutingTransport {
  const read = (): ReplayStep =>
    toolCallStep("read_source", {
      sourceId: "src_test_report",
      document: null,
      pages: [2],
      sections: [],
    });
  return new RoutingTransport([
    ["You plan one command", syntheticTransport(plan)],
    [
      "You answer one question about observations",
      syntheticTransport([
        toolCallStep("summarize_observations", {
          bundleId: "bundle_test_ndvi",
          bundleRevision: 2,
          periodIds: ["period_2022-04"],
          metric: null,
        }),
        answerStep(JSON.stringify({ items: [observation] })),
      ]),
    ],
    [
      "You answer one question from the case corpus",
      syntheticTransport([
        read(),
        answerStep(
          JSON.stringify({ items: [context("The report states a seasonal closure of 3 months.")] }),
        ),
      ]),
    ],
    [
      "You answer one question about livelihoods",
      syntheticTransport([
        read(),
        answerStep(
          JSON.stringify({
            items: [
              context("The report states that collective grazing follows a seasonal closure."),
              fieldNeed,
            ],
          }),
        ),
      ]),
    ],
    // One reply serves both configured explanations, whichever branch asks first.
    [
      "You write predictions",
      syntheticTransport([
        answerStep(JSON.stringify(RAINFALL_REPLY)),
        answerStep(JSON.stringify(RAINFALL_REPLY)),
      ]),
    ],
    ...extra,
  ]);
}

function deps(
  transport: RoutingTransport,
  overrides: Partial<Parameters<typeof runCommand>[1]> = {},
) {
  const events: TraceEventDraft[] = [];
  let task = 0;
  let ev = 0;
  const commits = new MemoryCommitApi(3);
  return {
    events,
    commits,
    deps: {
      transport,
      store: addBranchRecord(testStore()),
      commits,
      trace: { emit: (e: TraceEventDraft) => events.push(e) },
      newTaskId: () => `task_test_${String((task += 1)).padStart(2, "0")}`,
      newEvidenceId: () => `ev_test_${String((ev += 1)).padStart(2, "0")}`,
      now: () => AT,
      adapterOptions: { sleep: () => Promise.resolve() },
      ...overrides,
    },
  };
}

describe("runCommand on synthetic replays", () => {
  it("SA-10 (proposed) an identity-group command ends failed out of scope and creates nothing", async () => {
    const transport = routes();
    const { deps: d, commits, events } = deps(transport);
    const outcome = await runCommand(
      {
        planTask: PLAN_TASK,
        expectedCaseRevision: 3,
        snapshot: {
          ...SNAPSHOT,
          command: { text: "Do Berber herders explain the decline?", intent: "commission" },
        },
      },
      d,
    );
    expect(outcome.status).toBe("failed");
    expect(outcome.tasks).toEqual([]);
    expect(outcome.spentUsd).toBe(0);
    expect(events.filter((e) => e.kind === "model.started")).toEqual([]);
    expect(commits.evidence.size + commits.hypotheses.size + commits.interventions.size).toBe(0);
    expect(commits.caseRevision).toBe(3 + 1);
    expect([...commits.tasks.values()]).toMatchObject([
      { id: "task_test_plan", status: "failed", failureCode: "out_of_scope" },
    ]);
    expect(commits.packages.size).toBe(0);
    expect(commits.events.map((e) => e.kind)).toEqual(["task.failed"]);
  });

  it("plans four tasks, runs them at most two model calls at a time, and ends every task", async () => {
    const transport = routes();
    const { deps: d, commits, events } = deps(transport);
    const outcome = await runCommand(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      d,
    );

    expect(outcome.status).toBe("succeeded");
    expect(outcome.stopReason).toBeNull();
    const byKind = new Map(outcome.tasks.map((t) => [t.kind, t]));
    expect(byKind.get("source_research")?.status).toBe("succeeded");
    expect(byKind.get("observation_analysis")?.status).toBe("succeeded");
    expect(byKind.get("livelihood_governance")?.status).toBe("succeeded");
    expect(byKind.get("explanation_branches")).toMatchObject({
      status: "succeeded",
      failureCode: null,
    });
    expect(
      outcome.tasks.every((t) =>
        ["succeeded", "partial", "failed", "cancelled"].includes(t.status),
      ),
    ).toBe(true);

    expect(transport.peakOpen).toBeLessThanOrEqual(P0_LIMITS.maxConcurrentModelCalls);
    // The plan, four task commits and the branch predictions committed before their scores.
    expect(commits.caseRevision).toBe(3 + 1 + 4 + 1);
    expect(outcome.caseRevision).toBe(commits.caseRevision);
    expect(commits.evidence.size).toBe(4);
    expect(commits.hypotheses.size).toBe(2);
    expect(commits.branchRevisions.map((b) => `${b.explanationId} ${String(b.revision)}`)).toEqual([
      "rainfall 1",
      "grazing 1",
      "rainfall 2",
      "grazing 2",
    ]);
    // The records themselves say they came from a synthetic replay (lead, after b30).
    for (const r of [...commits.evidence.values(), ...commits.hypotheses.values()]) {
      expect(r.provenance.limitations, r.id).toContain(
        "Written from a synthetic replay, not a model output or a live model call.",
      );
    }
    expect(events.filter((e) => e.kind === "task.started")).toHaveLength(4);
    expect(
      events
        .filter((e) => e.kind === "model.completed")
        .every((e) => e.usage?.provider === "replay" && e.usage.replayOrigin === "synthetic"),
    ).toBe(true);
  });

  it("hands the hypotheses and evidence a task's dependencies committed to intervention feasibility", async () => {
    const plan = {
      interpretation: "The command asks which responses could be prepared for the valley.",
      tasks: [
        {
          key: "livelihoods",
          kind: "livelihood_governance",
          question: "Who sets pasture rules?",
          dependsOn: [],
          inputRefs: [],
        },
        {
          key: "compare",
          kind: "explanation_branches",
          question: "Which explanations does the record leave standing?",
          dependsOn: ["livelihoods"],
          inputRefs: [],
        },
        {
          key: "responses",
          kind: "intervention_feasibility",
          question: "Which responses could be prepared?",
          dependsOn: ["livelihoods", "compare"],
          inputRefs: [],
        },
      ],
      clarifyingQuestion: null,
    };
    // Sequential tasks, so the IDs are fixed: ev_test_01 and 02 (livelihoods), then int_test_03;
    // the branch hypotheses take IDs fixed by their task (task_test_02) and explanation.
    const rainfall = hypothesisIdFor("task_test_02", "rainfall");
    const transport = routes(
      [answerStep(JSON.stringify(plan))],
      [
        [
          "You prepare candidate responses",
          syntheticTransport([
            answerStep(
              JSON.stringify({
                items: [
                  {
                    title: "Negotiated seasonal rest within existing institutions",
                    description:
                      "If the field check names who decides closures, a seasonal rest could be discussed with them.",
                    assumptions: ["The existing institutions set closure dates."],
                    ecologicalConsiderations: [],
                    livelihoodConsiderations: [],
                    fieldValidationNeeded: ["Who decides the closure dates."],
                    requiredReviewRoles: ["community_livelihood"],
                    evidenceIds: ["ev_test_02"],
                    hypothesisIds: [rainfall],
                  },
                  {
                    title: "Participatory monitoring before any access change",
                    description:
                      "Once the roles are known, the institutions could monitor the upper band before any access change.",
                    assumptions: ["The institutions take part in monitoring."],
                    ecologicalConsiderations: [],
                    livelihoodConsiderations: [],
                    fieldValidationNeeded: ["Which institutions could take part in monitoring."],
                    requiredReviewRoles: ["program_coordination"],
                    evidenceIds: ["ev_test_02"],
                    hypothesisIds: [],
                  },
                ],
              }),
            ),
          ]),
        ],
      ],
    );
    const { deps: d, commits } = deps(transport);
    const outcome = await runCommand(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      d,
    );
    expect(outcome.tasks.map((t) => `${t.kind} ${t.status}`)).toEqual([
      "livelihood_governance succeeded",
      "explanation_branches succeeded",
      "intervention_feasibility succeeded",
    ]);
    expect([...commits.interventions.values()]).toMatchObject([
      { id: "int_test_03", hypothesisIds: [rainfall], evidenceIds: ["ev_test_02"] },
      { id: "int_test_04", hypothesisIds: [], evidenceIds: ["ev_test_02"] },
      { id: "int_test_05", title: "Defer until the field check", evidenceIds: ["ev_test_02"] },
    ]);
    expect(
      [...commits.relationships.values()]
        .filter((r) => r.toEntityId === "int_test_03" || r.fromEntityId === "int_test_03")
        .map((r) => `${r.fromEntityId} ${r.kind} ${r.toEntityId}`),
    ).toEqual([
      `${rainfall} proposes_response int_test_03`,
      "int_test_03 requires_verification ev_test_02",
    ]);
    // Model-written records say they came from a synthetic replay; the host-written deferral says
    // it is host text instead.
    const synthetic = "Written from a synthetic replay, not a model output or a live model call.";
    for (const r of [
      ...commits.evidence.values(),
      ...commits.hypotheses.values(),
      ...[...commits.interventions.values()].filter((r) => r.id !== "int_test_05"),
    ]) {
      expect(r.provenance.limitations, r.id).toContain(synthetic);
    }
    expect(commits.interventions.get("int_test_05")?.provenance.limitations[0]).toMatch(
      /^Fixed text written by Siterra's host code, not by a model/,
    );
  });

  it("hands the explanation merge its branches committed to the brief package, and to no task that does not follow them", async () => {
    const plan = {
      interpretation: "The command asks for a package on the valley.",
      tasks: [
        {
          key: "compare",
          kind: "explanation_branches",
          question: "Which explanations does the record leave standing?",
          dependsOn: [],
          inputRefs: [],
        },
        {
          key: "package",
          kind: "brief_package",
          question: "What should be checked in the field?",
          dependsOn: [],
          inputRefs: [],
        },
      ],
      clarifyingQuestion: null,
    };
    const seen: { merges: string[]; checks: string[] }[] = [];
    const spy: TaskExecutor = (input, taskDeps) => {
      const merges = (taskDeps.committedBranchMerges ?? []).map((m) => m.id);
      seen.push({
        merges,
        checks: (taskDeps.committedBranchMerges ?? []).flatMap((m) =>
          (m.fieldPlan?.measurements ?? []).map((c) => c.fieldCheckId),
        ),
      });
      return EXECUTORS.brief_package
        ? EXECUTORS.brief_package(input, taskDeps)
        : Promise.reject(new Error("no brief executor"));
    };
    const transport = routes([answerStep(JSON.stringify(plan))], []);
    const { deps: d } = deps(transport, { executors: { ...EXECUTORS, brief_package: spy } });
    const outcome = await runCommand(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      d,
    );
    expect(outcome.tasks.map((t) => t.kind)).toEqual(["explanation_branches", "brief_package"]);
    // The plan validator made the package wait for the branches, so it was handed their merge.
    expect(seen).toHaveLength(1);
    expect(seen[0]?.merges).toHaveLength(1);
    expect(seen[0]?.checks).toEqual(["grazing_exclosure"]);
  });

  it("a whole question: the livelihood facts, the explanation branches, the candidate responses and the package, tied to the strata and the merge's field check (synthetic replay)", async () => {
    const plan = {
      interpretation: "The command asks what could be checked in the field in the valley.",
      tasks: [
        {
          key: "livelihoods",
          kind: "livelihood_governance",
          question: "Who sets pasture rules?",
          dependsOn: [],
          inputRefs: [],
        },
        {
          key: "compare",
          kind: "explanation_branches",
          question: "Which explanations does the record leave standing?",
          dependsOn: ["livelihoods"],
          inputRefs: [],
        },
        {
          key: "responses",
          kind: "intervention_feasibility",
          question: "Which responses could be prepared?",
          dependsOn: ["livelihoods"],
          inputRefs: [],
        },
        {
          key: "package",
          kind: "brief_package",
          question: "What should be checked in the field?",
          dependsOn: [],
          inputRefs: [],
        },
      ],
      clarifyingQuestion: null,
    };
    const response = {
      title: "Negotiated seasonal rest within existing institutions",
      description:
        "If the field check names who decides closures, a seasonal rest could be discussed with them.",
      assumptions: ["The existing institutions set closure dates."],
      ecologicalConsiderations: [],
      livelihoodConsiderations: [],
      fieldValidationNeeded: ["Who decides the closure dates."],
      requiredReviewRoles: ["community_livelihood"],
      evidenceIds: ["ev_test_02"],
      hypothesisIds: [hypothesisIdFor("task_test_02", "rainfall")],
    };
    const line = (text: string, claimKind: string, evidenceIds: string[]) => ({
      text,
      claimKind,
      evidenceIds,
    });
    const brief = {
      action: {
        kind: "field_validation_plan",
        title: "Field check of who decides closure dates",
        description:
          "Find out who decides the closure dates in the upper band, to inform which candidate response the reviewers consider.",
        fieldPlan: {
          objective: "Find out who decides the closure dates in the upper band.",
          decisionInformed: "Which candidate response the reviewers consider.",
          strata: [
            {
              key: "elevation_high",
              label: "Upper third",
              definition: "The highest third of the catchment.",
            },
          ],
          measurements: [
            {
              what: "Who decides the closure dates",
              method: "Interviews with institution roles",
              season: "Spring",
              stratumKeys: ["elevation_high"],
              fieldRole: "Local field team",
              resolvesGapIds: ["ev_test_02"],
              discriminatesHypothesisIds: [],
              fieldCheckId: "grazing_exclosure",
            },
          ],
          deferredGaps: [],
          permissions: ["Permission from the commune, to be established."],
          consultationSteps: ["Consultation with the local pasture institution."],
        },
        resources: [{ kind: "local_information", label: "Who decides closure dates" }],
        evidenceIds: ["ev_test_02"],
        interventionIds: ["int_test_03"],
      },
      brief: {
        known: [
          line("The report states a seasonal closure of 3 months.", "scientific_context", [
            "ev_test_01",
          ]),
        ],
        uncertain: [
          line("Whether the closure dates explain the April values.", "hypothesis", ["ev_test_01"]),
        ],
        nextMeasurements: [
          line(
            "Who decides the closure dates; interviews with institution roles; spring; upper third; local team.",
            "field_requirement",
            ["ev_test_02"],
          ),
        ],
        stakeholderRoles: [
          line("The local pasture institution and the program team.", "field_requirement", [
            "ev_test_02",
          ]),
        ],
        preparedActions: [],
        authorizationRequired: [
          line("Any visit waits for the local institution's own decision.", "field_requirement", [
            "ev_test_02",
          ]),
        ],
        nextSteps: [],
      },
      reviewRoles: ["scientific", "community_livelihood"],
    };
    const transport = routes(
      [answerStep(JSON.stringify(plan))],
      [
        [
          "You prepare candidate responses",
          syntheticTransport([
            answerStep(
              JSON.stringify({
                items: [
                  response,
                  {
                    ...response,
                    title: "Participatory monitoring before any access change",
                    description:
                      "Once the roles are known, the institutions could monitor the upper band before any access change.",
                    hypothesisIds: [],
                    requiredReviewRoles: ["program_coordination"],
                  },
                ],
              }),
            ),
          ]),
        ],
        [
          "You prepare a draft field-validation plan",
          syntheticTransport([answerStep(JSON.stringify(brief))]),
        ],
      ],
    );
    const store = addBranchRecord(testStore());
    store.bundles.push(
      bundle({ id: "bundle_test_strata", methodId: "terrain_strata", methodVersion: "1.1.0" }),
    );
    const config = store.analysisConfigs.get("case_test_valley");
    if (!config) throw new Error("no configuration");
    store.analysisConfigs.set("case_test_valley", {
      ...config,
      trendSummary: {
        recipe: { recipeId: "restrend_long_record", version: "1.0.0" },
        strata: ["catchment", "elevation_high", "elevation_low"],
      },
    });
    const { deps: d, commits } = deps(transport, { store });
    const outcome = await runCommand(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      d,
    );
    expect(outcome.tasks.map((t) => `${t.kind} ${t.status}`)).toEqual([
      "livelihood_governance succeeded",
      "explanation_branches succeeded",
      "intervention_feasibility succeeded",
      "brief_package succeeded",
    ]);
    const packages = [...commits.packages.values()];
    const action = packages.find((r) => r.recordType === "OperationalAction");
    if (action?.recordType !== "OperationalAction") throw new Error("no action");
    // Tied to the land: the strata bundle, a stratum of its list and the merge's field check.
    expect(action.fieldPlan?.strata).toMatchObject([
      { key: "elevation_high", dataBundleId: "bundle_test_strata" },
    ]);
    expect(action.fieldPlan?.measurements[0]?.fieldCheckId).toBe("grazing_exclosure");
    // Nothing is sent, scheduled or authorized: the action is a draft awaiting review.
    expect(action).toMatchObject({
      externalExecutionEnabled: false,
      authorizationMode: "demo_only",
      status: "awaiting_review",
    });
    expect(packages.find((r) => r.recordType === "Brief")).toMatchObject({
      status: "ready_for_review",
    });
    // The records say they came from a synthetic replay.
    const synthetic = "Written from a synthetic replay, not a model output or a live model call.";
    for (const r of [...commits.interventions.values()].filter((r) => r.id === "int_test_03")) {
      expect(r.provenance.limitations).toContain(synthetic);
    }
  });

  it("RL-02 the brief package still runs after a quantitative task fails, with the failed task named", async () => {
    const plan = {
      interpretation: "The command asks for a field-scoping package for the valley.",
      tasks: [
        {
          key: "sources",
          kind: "source_research",
          question: "What do sources say about closures?",
          dependsOn: [],
          inputRefs: [],
        },
        {
          key: "observations",
          kind: "observation_analysis",
          question: "What did NDVI show in spring 2022?",
          dependsOn: [],
          inputRefs: [{ entityId: "bundle_test_ndvi", revision: 2 }],
        },
        {
          key: "brief",
          kind: "brief_package",
          question: "Prepare the field-validation plan and the decision brief.",
          dependsOn: [],
          inputRefs: [],
        },
      ],
      clarifyingQuestion: null,
    };
    const seen: TaskRecord[] = [];
    const brief: TaskExecutor = ({ task, expectedCaseRevision }) => {
      seen.push(task);
      return Promise.resolve({
        commit: {
          caseId: task.caseId,
          commandId: task.commandId,
          taskId: task.id,
          expectedCaseRevision,
          idempotencyKey: `test-${task.id}`,
          inputVersions: [],
          upserts: [
            {
              ...task,
              revision: task.revision + 1,
              status: "succeeded",
              finishedAt: AT.toISOString(),
            },
          ],
          events: [],
        },
      });
    };
    const { deps: d } = deps(routes([answerStep(JSON.stringify(plan))]), {
      executors: {
        ...EXECUTORS,
        observation_analysis: () => Promise.reject(new Error("bundle_test_ndvi is missing")),
        brief_package: brief,
      },
    });
    const outcome = await runCommand(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      d,
    );
    const byKind = new Map(outcome.tasks.map((t) => [t.kind, t]));
    expect(byKind.get("observation_analysis")).toMatchObject({
      status: "failed",
      failureCode: "executor_error",
    });
    expect(byKind.get("source_research")?.status).toBe("succeeded");
    expect(byKind.get("brief_package")).toMatchObject({ status: "succeeded", failureCode: null });
    const observationId = byKind.get("observation_analysis")?.id;
    expect(seen).toHaveLength(1);
    expect(seen[0]?.missingInputs).toEqual([
      `Dependency ${String(observationId)} (observation analysis) ended failed: executor error.`,
    ]);
    expect(outcome.status).toBe("partial");
  });

  it("the host-made instrument composition runs after every planned task, even a failed one, and names it", async () => {
    const plan = {
      interpretation: "The command asks what the valley's records show.",
      tasks: [
        {
          key: "observations",
          kind: "observation_analysis",
          question: "What did NDVI show in spring 2022?",
          dependsOn: [],
          inputRefs: [{ entityId: "bundle_test_ndvi", revision: 2 }],
        },
      ],
      clarifyingQuestion: null,
    };
    const seen: TaskRecord[] = [];
    const composition: TaskExecutor = ({ task, expectedCaseRevision }) => {
      seen.push(task);
      return Promise.resolve({
        commit: {
          caseId: task.caseId,
          commandId: task.commandId,
          taskId: task.id,
          expectedCaseRevision,
          idempotencyKey: `test-${task.id}`,
          inputVersions: [],
          upserts: [
            {
              ...task,
              revision: task.revision + 1,
              status: "succeeded",
              finishedAt: AT.toISOString(),
            },
          ],
          events: [],
        },
      });
    };
    const run = async (append: boolean) => {
      seen.length = 0;
      const { deps: d } = deps(routes([answerStep(JSON.stringify(plan))]), {
        executors: {
          ...EXECUTORS,
          observation_analysis: () => Promise.reject(new Error("bundle_test_ndvi is missing")),
          instrument_composition: composition,
        },
        appendInstrumentComposition: append,
      });
      return runCommand({ planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT }, d);
    };
    const off = await run(false);
    expect(off.tasks.map((t) => t.kind)).toEqual(["observation_analysis"]);
    expect(seen).toEqual([]);
    const on = await run(true);
    const byKind = new Map(on.tasks.map((t) => [t.kind, t]));
    expect(byKind.get("instrument_composition")).toMatchObject({ status: "succeeded" });
    expect(seen[0]?.allowedTools).toEqual(["propose_instruments"]);
    expect(seen[0]?.dependsOnTaskIds).toEqual([byKind.get("observation_analysis")?.id]);
    expect(seen[0]?.missingInputs[0]).toContain("ended failed");
  });

  describe("a refused or failed data load is a named blocked input, never a silent success", () => {
    const captureBrief = (seen: TaskRecord[]): TaskExecutor => {
      return ({ task, expectedCaseRevision }) => {
        seen.push(task);
        return Promise.resolve({
          commit: {
            caseId: task.caseId,
            commandId: task.commandId,
            taskId: task.id,
            expectedCaseRevision,
            idempotencyKey: `test-${task.id}`,
            inputVersions: [],
            upserts: [
              {
                ...task,
                revision: task.revision + 1,
                status: "succeeded",
                finishedAt: AT.toISOString(),
              },
            ],
            events: [],
          },
        });
      };
    };
    const summarize = (bundleId: string, bundleRevision: number) =>
      toolCallStep("summarize_observations", {
        bundleId,
        bundleRevision,
        periodIds: ["period_2022-04"],
        metric: null,
      });
    const onePlan = (kind: string, question: string, withBrief = false) =>
      answerStep(
        JSON.stringify({
          interpretation: "The command asks one question of the case record.",
          tasks: [
            { key: "one", kind, question, dependsOn: [], inputRefs: [] },
            ...(withBrief
              ? [
                  {
                    key: "brief",
                    kind: "brief_package",
                    question: "Prepare the field-validation plan and the decision brief.",
                    dependsOn: [],
                    inputRefs: [],
                  },
                ]
              : []),
          ],
          clarifyingQuestion: null,
        }),
      );

    it("RL-02 an observation task whose dataset is missing ends failed with the dataset named, and the brief sees it", async () => {
      const seen: TaskRecord[] = [];
      const transport = new RoutingTransport([
        [
          "You plan one command",
          syntheticTransport([
            onePlan("observation_analysis", "What did NDVI show in April 2022?", true),
          ]),
        ],
        [
          "You answer one question about observations",
          syntheticTransport([
            summarize("bundle_test_removed", 1),
            answerStep(JSON.stringify({ items: [] })),
            answerStep(JSON.stringify({ items: [] })),
          ]),
        ],
      ]);
      const {
        deps: d,
        commits,
        events,
      } = deps(transport, {
        executors: { ...EXECUTORS, brief_package: captureBrief(seen) },
      });
      await runCommand({ planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT }, d);
      const blocked = "bundle_test_removed: summarize_observations refused it (unknown bundle).";
      const observation = [...commits.tasks.values()].find(
        (t) => t.kind === "observation_analysis",
      );
      expect(observation).toMatchObject({ status: "failed", missingInputs: [blocked] });
      const ended = [...events, ...commits.events].find(
        (e) => e.taskId === observation?.id && e.kind === "task.failed",
      );
      expect(ended?.message).toContain(blocked);
      expect(seen[0]?.missingInputs).toContain(
        `Dependency ${String(observation?.id)} (observation analysis) is missing: ${blocked}`,
      );
    });

    it("a configured series the case lacks makes the branch task partial with the dataset named", async () => {
      const reply = {
        predictions: [
          {
            necessary: true,
            test: {
              ...UNUSED_TEST_FIELDS,
              kind: "season_category",
              seasonId: BRANCH_SEASON,
              expected: "below_normal",
            },
            wording: `The wet season ${BRANCH_SEASON} is below normal.`,
          },
          {
            necessary: false,
            test: {
              ...UNUSED_TEST_FIELDS,
              kind: "departure_sign",
              pairId: "vegetation_rainfall",
              side: "a",
              periodIds: ["period_2022-03"],
              expected: "negative",
            },
            wording: "Vegetation departures in period_2022-03 are negative.",
          },
        ],
      };
      const transport = new RoutingTransport([
        [
          "You plan one command",
          syntheticTransport([onePlan("explanation_branches", "Could drought explain it?")]),
        ],
        [
          "You write predictions",
          syntheticTransport([
            answerStep(JSON.stringify(reply)),
            answerStep(JSON.stringify(reply)),
          ]),
        ],
      ]);
      const { deps: d, commits } = deps(transport, {
        store: addBranchRecord(testStore(), ["rainfall"]),
      });
      const outcome = await runCommand(
        { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
        d,
      );
      const task = [...commits.tasks.values()].find((t) => t.kind === "explanation_branches");
      expect(task).toMatchObject({
        status: "partial",
        missingInputs: [
          "rainfall departure (vegetation_rainfall side b): no validated test_rain_monthly bundle in this case.",
        ],
      });
      expect(
        commits.events.filter(
          (e) => e.taskId === task?.id && /^task\.(succeeded|partial|failed)$/.test(e.kind),
        ),
      ).toMatchObject([{ kind: "task.partial", resultStatus: "partial" }]);
      expect(outcome.status).toBe("partial");
    });

    it("a load that later succeeds for the same dataset names nothing", async () => {
      const transport = new RoutingTransport([
        [
          "You plan one command",
          syntheticTransport([
            onePlan("observation_analysis", "What did NDVI show in April 2022?"),
          ]),
        ],
        [
          "You answer one question about observations",
          syntheticTransport([
            summarize("bundle_test_ndvi", 1),
            summarize("bundle_test_ndvi", 2),
            answerStep(JSON.stringify({ items: [observation] })),
          ]),
        ],
      ]);
      const { deps: d, commits } = deps(transport);
      await runCommand({ planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT }, d);
      expect(
        [...commits.tasks.values()].find((t) => t.kind === "observation_analysis"),
      ).toMatchObject({
        status: "succeeded",
        missingInputs: [],
      });
    });
  });

  it("TR-03 path: trace events carry no prompt text, source text, key or bearer token", async () => {
    const { deps: d, events, commits } = deps(routes());
    await runCommand({ planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT }, d);
    const shipped = JSON.stringify([...events, ...commits.events]);
    expect(shipped).not.toContain(PLAN_INSTRUCTIONS.slice(0, 60));
    expect(shipped).not.toContain("You answer one question");
    expect(shipped).not.toContain("fermeture");
    expect(shipped).not.toMatch(/LLM_\d+_|Bearer\s|encrypted_content|synthetic-encrypted/);
  });

  it("RL-06 a spend cap stops new calls and the command ends partial with the reason", async () => {
    const { deps: d } = deps(routes(), { limits: { ...P0_LIMITS, spendCapMicroUsd: 30_000 } });
    const outcome = await runCommand(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      d,
    );
    expect(outcome.stopReason).toBe("budget_exhausted");
    expect(outcome.tasks.some((t) => t.failureCode === "budget_exhausted")).toBe(true);
    expect(outcome.spentUsd).toBeLessThanOrEqual(0.03);
    expect(["partial", "failed"]).toContain(outcome.status);
  });

  it("a cancelled command makes no model call and ends cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = routes();
    const { deps: d } = deps(transport, { signal: controller.signal });
    const outcome = await runCommand(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      d,
    );
    expect(outcome.status).toBe("cancelled");
    expect(transport.peakOpen).toBe(0);
  });

  it("the command wall clock stops a stalled plan", async () => {
    const stall: ReplayStep = {
      kind: "stall",
      requestId: null,
      events: [{ type: "response.created", response: { id: "resp_synthetic_stall" } }],
    };
    const { deps: d } = deps(routes([stall]), { limits: { ...P0_LIMITS, wallClockMs: 30 } });
    const outcome = await runCommand(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      d,
    );
    expect(outcome.stopReason).toBe("command_deadline");
    expect(outcome.status).toBe("failed");
  });
});
