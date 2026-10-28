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
import { runPlanTask } from "./plan-task.ts";
import type { PlanSnapshot } from "./prompt.ts";
import { planOutputSchema, validatePlanProposal } from "./proposal.ts";

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
