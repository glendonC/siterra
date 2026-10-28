import { describe, expect, it } from "vitest";

import { MetaAdapter } from "../../model/adapter.ts";
import type { ReplayStep } from "../../model/replay.ts";
import { strictSubsetIssues } from "../../model/strict-schema.ts";
import {
  answerStep,
  refusalStep,
  syntheticTransport,
  toolCallStep,
} from "../../testing/replay-steps.ts";
import type { ToolHandler } from "../../tools/tool.ts";
import type { TaskRecord } from "../records.ts";
import type { TraceEventDraft } from "../trace.ts";
import { OUT_OF_SCOPE_MESSAGE } from "../scope.ts";
import { runPlanTask } from "./plan-task.ts";
import { PLAN_INSTRUCTIONS, PLAN_PROMPT_VERSION } from "./prompt.ts";
import type { PlanSnapshot } from "./prompt.ts";
import { OBSERVATION_SPEC } from "../observation/observation-task.ts";
import { LIVELIHOOD_SPEC, SOURCE_RESEARCH_SPEC } from "../source/source-task.ts";
import { FIELD_REQUIREMENT_KINDS, planOutputSchema, validatePlanProposal } from "./proposal.ts";

// All model output here is synthetic replay. These tests show the plan path works on replays;
// they do not show AF-01, which needs a live model.

const AT = new Date("2026-10-27T20:00:00.000Z");

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
  status: "running",
  dependsOnTaskIds: [],
  inputVersions: [],
  allowedTools: ["read_case", "propose_plan"],
  outputEntityIds: [],
  idempotencyKey: "test-plan-0001",
  attempt: 1,
  maxModelRounds: 6,
  deadlineAt: "2026-10-27T20:03:00.000Z",
  budgetMicroUsd: 500_000,
  spentMicroUsd: 0,
  checkpointId: null,
  failureCode: null,
  missingInputs: [],
  startedAt: AT.toISOString(),
  finishedAt: null,
};

const SNAPSHOT: PlanSnapshot = {
  command: { text: "Investigate pasture pressure in the valley.", intent: "commission" },
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
    { id: "geo_test_catchment", revision: 1, recordType: "GeoSelection", label: "Catchment" },
    { id: "bundle_test_ndvi", revision: 2, recordType: "DataBundle", label: "NDVI bundle" },
  ],
};

const KNOWN = new Map(SNAPSHOT.records.map((r) => [r.id, r.revision]));

function task(
  key: string,
  kind: string,
  dependsOn: string[] = [],
  inputRefs: { entityId: string; revision: number }[] = [],
) {
  return { key, kind, question: `What does ${key} find?`, dependsOn, inputRefs };
}

const GOOD_PLAN = {
  interpretation:
    "The command asks what evidence bears on pasture pressure in the valley catchment.",
  tasks: [
    task("sources", "source_research"),
    task(
      "observations",
      "observation_analysis",
      [],
      [
        { entityId: "bundle_test_ndvi", revision: 2 },
        { entityId: "geo_test_catchment", revision: 1 },
      ],
    ),
    task("livelihoods", "livelihood_governance"),
    task("compare", "hypothesis_comparison", ["sources", "observations", "livelihoods"]),
    task("package", "brief_package", ["compare"]),
  ],
  clarifyingQuestion: null,
};

function harness(steps: ReplayStep[], tools: ToolHandler<never>[] = []) {
  const transport = syntheticTransport(steps);
  const events: TraceEventDraft[] = [];
  let n = 0;
  const deps = {
    adapter: new MetaAdapter({
      transport,
      sleep: () => Promise.resolve(),
      random: () => 0,
      deadlines: { firstEventMs: 50, idleMs: 50 },
    }),
    trace: { emit: (e: TraceEventDraft) => events.push(e) },
    tools,
    newTaskId: () => `task_test_${String((n += 1)).padStart(2, "0")}`,
    now: () => AT,
  };
  return { transport, events, deps };
}

describe("plan task on synthetic replays", () => {
  it("a commission yields a validated plan committed as queued tasks (AF-01 path, replay only)", async () => {
    const { deps, events } = harness([answerStep(JSON.stringify(GOOD_PLAN))]);
    const { loop, commit } = await runPlanTask(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      deps,
    );
    expect(loop.status).toBe("accepted");
    expect(commit.expectedCaseRevision).toBe(3);
    const [planAfter, ...planned] = commit.upserts as TaskRecord[];
    expect(planAfter).toMatchObject({ id: "task_test_plan", revision: 2, status: "succeeded" });
    expect(planned).toHaveLength(5);
    expect(planned.every((t) => t.status === "queued")).toBe(true);
    expect(planAfter?.outputEntityIds).toEqual(planned.map((t) => t.id));

    const byKind = new Map(planned.map((t) => [t.kind, t]));
    expect(byKind.get("hypothesis_comparison")?.dependsOnTaskIds).toEqual([
      byKind.get("source_research")?.id,
      byKind.get("observation_analysis")?.id,
      byKind.get("livelihood_governance")?.id,
    ]);
    expect(byKind.get("observation_analysis")?.inputVersions).toEqual([
      { entityId: "bundle_test_ndvi", revision: 2 },
      { entityId: "geo_test_catchment", revision: 1 },
    ]);
    expect(byKind.get("observation_analysis")?.allowedTools).toEqual([
      "read_dataset_manifest",
      "summarize_observations",
      "list_recipes",
      "read_recipe_result",
      "propose_evidence",
    ]);
    expect(commit.events.map((e) => e.kind)).toEqual([
      ...Array<string>(5).fill("task.queued"),
      "task.succeeded",
    ]);

    const completed = events.find((e) => e.kind === "model.completed");
    expect(completed?.usage).toMatchObject({
      provider: "replay",
      replayOrigin: "synthetic",
      model: "muse-spark-1.3",
    });
    expect(completed?.usage?.requestId).toMatch(/^req_synthetic_/);
    expect(completed?.message).toContain("replay, synthetic");
    expect(events.find((e) => e.kind === "validation.completed")?.validation).toEqual({
      outcome: "accepted",
      issues: [],
    });
    expect(planAfter?.spentMicroUsd).toBe(Math.round(((900 * 1.25 + 300 * 4.25) / 1e6) * 1e6));
  });

  it("a rejected plan gets one repair turn that names the issues", async () => {
    const bad = { ...GOOD_PLAN, tasks: [task("only", "diagnose_overgrazing")] };
    const { deps, transport } = harness([
      answerStep(JSON.stringify(bad)),
      answerStep(JSON.stringify(GOOD_PLAN)),
    ]);
    const { loop } = await runPlanTask(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      deps,
    );
    expect(loop.status).toBe("accepted");
    expect(loop.repaired).toBe(true);
    const repairInput = JSON.stringify(transport.opened[1]?.["input"]);
    expect(repairInput).toContain("failed validation");
    expect(repairInput).toContain("$.tasks[0].kind");
  });

  it("a second rejection fails the plan and queues nothing", async () => {
    const bad = { ...GOOD_PLAN, tasks: [task("a", "source_research", ["missing"])] };
    const { deps } = harness([answerStep(JSON.stringify(bad)), answerStep(JSON.stringify(bad))]);
    const { loop, commit } = await runPlanTask(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      deps,
    );
    expect(loop.status).toBe("rejected");
    expect(loop.validation?.issues[0]).toMatchObject({ code: "unknown_reference" });
    expect(commit.upserts).toHaveLength(1);
    expect(commit.upserts[0]).toMatchObject({
      status: "failed",
      failureCode: "validation_rejected",
    });
    expect(commit.events.map((e) => e.kind)).toEqual(["task.failed"]);
  });

  it("a refusal fails the plan without a repair turn", async () => {
    const { deps, transport } = harness([refusalStep(), answerStep(JSON.stringify(GOOD_PLAN))]);
    const { loop, commit } = await runPlanTask(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      deps,
    );
    expect(loop.status).toBe("refused");
    expect(transport.remaining).toBe(1);
    expect(commit.upserts[0]).toMatchObject({ status: "failed", failureCode: "model_refused" });
  });

  it("RL-01 three provider 5xx responses fail the plan and leave the case unchanged", async () => {
    const error: ReplayStep = { kind: "http_error", status: 503, code: null, retryAfter: null };
    const { deps } = harness([error, error, error]);
    const { loop, commit } = await runPlanTask(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      deps,
    );
    expect(loop.status).toBe("model_failed");
    expect(loop.calls[0]?.attempts).toHaveLength(3);
    expect(commit.upserts).toHaveLength(1);
    expect(commit.upserts[0]).toMatchObject({ status: "failed", failureCode: "http_503" });
  });

  it("the planner may read the case through a tool before proposing", async () => {
    const reads: unknown[] = [];
    const readCase: ToolHandler<{ caseId: string }> = {
      name: "read_case",
      description: "Read the case summary.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["caseId"],
        properties: { caseId: { type: "string" } },
      },
      parse: (args) =>
        typeof args === "object" &&
        args !== null &&
        typeof (args as { caseId?: unknown }).caseId === "string"
          ? { ok: true, value: args as { caseId: string } }
          : { ok: false, message: "caseId is required" },
      summarize: (args) => `case ${args.caseId}`,
      run: (args) => {
        reads.push(args);
        return Promise.resolve({ output: { title: "Test case" }, resultEntityIds: [args.caseId] });
      },
    };
    const { deps, events, transport } = harness(
      [
        toolCallStep("read_case", { caseId: "case_test_valley" }),
        answerStep(JSON.stringify(GOOD_PLAN)),
      ],
      [readCase as ToolHandler<never>],
    );
    const { loop } = await runPlanTask(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      deps,
    );
    expect(loop.status).toBe("accepted");
    expect(reads).toEqual([{ caseId: "case_test_valley" }]);
    const toolDone = events.find((e) => e.kind === "tool.completed");
    expect(toolDone?.tool).toMatchObject({
      name: "read_case",
      status: "succeeded",
      argumentSummary: "case case_test_valley",
      resultEntityIds: ["case_test_valley"],
    });
    expect(JSON.stringify(transport.opened[1]?.["input"])).toContain("function_call_output");
  });
});

describe("plan scope (SA-10, proposed)", () => {
  const withCommand = (text: string): PlanSnapshot => ({
    ...SNAPSHOT,
    command: { text, intent: "commission" },
  });
  const run = (snapshot: PlanSnapshot, steps: ReplayStep[]) => {
    const h = harness(steps);
    return runPlanTask({ planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot }, h.deps).then(
      (result) => ({ ...result, ...h }),
    );
  };
  const expectRefused = (
    { loop, commit }: Awaited<ReturnType<typeof run>>,
    modelCalls: number,
  ): void => {
    expect(loop.status).toBe("rejected");
    expect(loop.failureCode).toBe("out_of_scope");
    expect(loop.calls).toHaveLength(modelCalls);
    expect(commit.upserts).toHaveLength(1);
    expect(commit.upserts[0]).toMatchObject({
      id: "task_test_plan",
      status: "failed",
      failureCode: "out_of_scope",
      outputEntityIds: [],
    });
    expect(commit.events).toHaveLength(1);
    expect(commit.events[0]).toMatchObject({ kind: "task.failed", message: OUT_OF_SCOPE_MESSAGE });
  };

  it("the planner prompt carries the scope rule under a new version", () => {
    expect(PLAN_PROMPT_VERSION).toBe("plan@2");
    expect(PLAN_INSTRUCTIONS).toContain("land, water and vegetation");
    expect(PLAN_INSTRUCTIONS).toContain('"Out of scope."');
  });

  it("refuses an identity-group command before any model call and creates nothing", async () => {
    const result = await run(
      withCommand("Are the migrants who moved into the valley causing the pasture degradation?"),
      [answerStep(JSON.stringify(GOOD_PLAN))],
    );
    expectRefused(result, 0);
    expect(result.transport.remaining).toBe(1);
    const check = result.events.find((e) => e.kind === "validation.completed");
    expect(check?.validation).toMatchObject({
      outcome: "rejected",
      issues: [{ code: "prohibited_claim", path: "$.command.text" }],
    });
    expect(JSON.stringify(result.events)).not.toContain("migrants");
  });

  it("refuses a named-person command before any model call and creates nothing", async () => {
    const result = await run(withCommand("Is Mr Ouhmad overgrazing the agdal above Tabant?"), [
      answerStep(JSON.stringify(GOOD_PLAN)),
    ]);
    expectRefused(result, 0);
    expect(result.transport.remaining).toBe(1);
    expect(JSON.stringify(result.events)).not.toContain("Ouhmad");
  });

  it("ends the plan out of scope when the planner says so, with the host's message", async () => {
    // Wording the phrase list does not know; the prompt rule is the layer that catches it.
    const result = await run(
      withCommand("Are the newcomers from the south ruining the pastures?"),
      [
        answerStep(
          JSON.stringify({ interpretation: "Out of scope.", tasks: [], clarifyingQuestion: null }),
        ),
      ],
    );
    expectRefused(result, 1);
  });

  it("refuses a planned question that names a group, without a repair turn", async () => {
    const bad = {
      ...GOOD_PLAN,
      tasks: [
        ...GOOD_PLAN.tasks.slice(0, 3),
        {
          ...task("compare", "hypothesis_comparison", ["sources", "observations", "livelihoods"]),
          question: "Do migrant herders explain the decline in greenness?",
        },
        task("package", "brief_package", ["compare"]),
      ],
    };
    const result = await run(SNAPSHOT, [
      answerStep(JSON.stringify(bad)),
      answerStep(JSON.stringify(GOOD_PLAN)),
    ]);
    expectRefused(result, 1);
    expect(result.transport.remaining).toBe(1);
    expect(result.loop.repaired).toBe(false);
  });

  it("IU-01 the livelihood question and grazing questions still plan normally", async () => {
    for (const text of [
      "What about the households that rely on these pastures?",
      "Is grazing pressure behind the vegetation decline in the catchment?",
      "Do tribal agdal rules govern when herders may graze the high pastures?",
    ]) {
      const { loop, commit } = await run(withCommand(text), [
        answerStep(JSON.stringify(GOOD_PLAN)),
      ]);
      expect(loop.status, text).toBe("accepted");
      expect(commit.upserts, text).toHaveLength(6);
    }
  });
});

describe("plan validator", () => {
  const check = (plan: unknown) =>
    validatePlanProposal(JSON.stringify(plan), { knownEntities: KNOWN });
  const codes = (plan: unknown) => {
    const r = check(plan);
    return r.ok ? [] : r.issues.map((i) => `${i.code} ${i.path}`);
  };

  it("accepts the good plan", () => {
    expect(check(GOOD_PLAN).ok).toBe(true);
  });

  it("ends an out-of-scope interpretation or clarifying question without a repair", () => {
    for (const [plan, path] of [
      [
        { ...GOOD_PLAN, interpretation: "The command asks whether refugees caused the decline." },
        "$.interpretation",
      ],
      [
        { ...GOOD_PLAN, tasks: [], clarifyingQuestion: "Which neighbour named Ahmed do you mean?" },
        "$.clarifyingQuestion",
      ],
    ] as const) {
      const r = check(plan);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.failureCode).toBe("out_of_scope");
      expect(codes(plan)).toEqual([`prohibited_claim ${path}`]);
    }
  });

  it("runs a brief package after every task that can add a field requirement", () => {
    const plan = {
      interpretation: "The command asks for a field plan.",
      tasks: [
        task("obs", "observation_analysis"),
        task("src", "source_research"),
        task("liv", "livelihood_governance"),
        task("hyp", "hypothesis_comparison", ["obs"]),
        task("brief", "brief_package", ["hyp"]),
      ],
      clarifyingQuestion: null,
    };
    const r = check(plan);
    expect(r.ok && r.value.tasks.find((t) => t.key === "brief")?.dependsOn).toEqual([
      "hyp",
      "obs",
      "src",
      "liv",
    ]);
    // A gap-adding task that waits for the brief would make a cycle, so the plan is refused.
    const looped = {
      ...plan,
      tasks: [
        ...plan.tasks.slice(0, 2),
        task("liv", "livelihood_governance", ["brief"]),
        ...plan.tasks.slice(3),
      ],
    };
    expect(codes(looped)).toEqual(["limit $.tasks"]);
  });

  it("names exactly the kinds whose specs can commit a field requirement", () => {
    const specs = [OBSERVATION_SPEC, SOURCE_RESEARCH_SPEC, LIVELIHOOD_SPEC];
    expect(
      specs
        .filter((s) => s.claimKinds.has("field_requirement"))
        .map((s) => s.kind)
        .sort(),
    ).toEqual([...FIELD_REQUIREMENT_KINDS].sort());
  });

  it("rejects text that is not JSON", () => {
    const r = validatePlanProposal("not json", { knownEntities: KNOWN });
    expect(r.ok).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(codes({ ...GOOD_PLAN, confidence: "high" })).toEqual(["schema $"]);
  });

  it("rejects more than eight tasks", () => {
    const tasks = Array.from({ length: 9 }, (_, i) => task(`t${i}`, "source_research"));
    expect(codes({ ...GOOD_PLAN, tasks })).toEqual(["limit $.tasks"]);
  });

  it("rejects a dependency cycle", () => {
    const tasks = [task("a", "source_research", ["b"]), task("b", "source_research", ["a"])];
    expect(codes({ ...GOOD_PLAN, tasks })).toEqual(["limit $.tasks"]);
  });

  it("rejects a self dependency, an unknown key, an unknown and a stale input reference", () => {
    const tasks = [
      task(
        "a",
        "source_research",
        ["a", "zzz"],
        [
          { entityId: "bundle_not_in_snapshot", revision: 1 },
          { entityId: "bundle_test_ndvi", revision: 1 },
        ],
      ),
    ];
    expect(codes({ ...GOOD_PLAN, tasks })).toEqual([
      "unknown_reference $.tasks[0].inputRefs[0]",
      "stale_reference $.tasks[0].inputRefs[1].revision",
      "unknown_reference $.tasks[0].dependsOn[0]",
      "unknown_reference $.tasks[0].dependsOn[1]",
    ]);
  });

  it("rejects duplicate keys and a two-sentence interpretation", () => {
    const tasks = [task("a", "source_research"), task("a", "observation_analysis")];
    expect(codes({ ...GOOD_PLAN, interpretation: "One. Two.", tasks })).toEqual([
      "limit $.interpretation",
      "schema $.tasks[1].key",
    ]);
  });

  it("rejects an empty plan without a clarifying question", () => {
    expect(codes({ ...GOOD_PLAN, tasks: [] })).toEqual(["limit $.tasks"]);
    expect(check({ ...GOOD_PLAN, tasks: [], clarifyingQuestion: "Which valley?" }).ok).toBe(true);
  });

  it("the model-facing schema fits Meta's strict subset", () => {
    expect(strictSubsetIssues(planOutputSchema())).toEqual([]);
  });
});
