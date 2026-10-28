import { describe, expect, it } from "vitest";

import type { ReplayStep } from "../model/replay.ts";
import { AT, testStore } from "../testing/case-fixture.ts";
import { answerStep, syntheticTransport, toolCallStep } from "../testing/replay-steps.ts";
import { RoutingTransport } from "../testing/routing-transport.ts";
import { MemoryCommitApi } from "../tasks/commit.ts";
import type { PlanSnapshot } from "../tasks/plan/prompt.ts";
import type { TaskRecord } from "../tasks/records.ts";
import { PLAN_INSTRUCTIONS } from "../tasks/plan/prompt.ts";
import type { TraceEventDraft } from "../tasks/trace.ts";
import { P0_LIMITS } from "./limits.ts";
import { runCommand } from "./run-command.ts";

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
      kind: "hypothesis_comparison",
      question: "Which explanations fit?",
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

function routes(plan: ReplayStep[] = [answerStep(JSON.stringify(PLAN))]): RoutingTransport {
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
      store: testStore(),
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
  it("plans four tasks, runs the three with executors at most two model calls at a time, and ends every task", async () => {
    const transport = routes();
    const { deps: d, commits, events } = deps(transport);
    const outcome = await runCommand(
      { planTask: PLAN_TASK, expectedCaseRevision: 3, snapshot: SNAPSHOT },
      d,
    );

    expect(outcome.status).toBe("partial");
    expect(outcome.stopReason).toBeNull();
    const byKind = new Map(outcome.tasks.map((t) => [t.kind, t]));
    expect(byKind.get("source_research")?.status).toBe("succeeded");
    expect(byKind.get("observation_analysis")?.status).toBe("succeeded");
    expect(byKind.get("livelihood_governance")?.status).toBe("succeeded");
    expect(byKind.get("hypothesis_comparison")).toMatchObject({
      status: "failed",
      failureCode: "executor_not_available",
    });
    expect(
      outcome.tasks.every((t) =>
        ["succeeded", "partial", "failed", "cancelled"].includes(t.status),
      ),
    ).toBe(true);

    expect(transport.peakOpen).toBeLessThanOrEqual(P0_LIMITS.maxConcurrentModelCalls);
    expect(commits.caseRevision).toBe(3 + 1 + 4);
    expect(outcome.caseRevision).toBe(commits.caseRevision);
    expect(commits.evidence.size).toBe(4);
    expect(events.filter((e) => e.kind === "task.started")).toHaveLength(3);
    expect(
      events
        .filter((e) => e.kind === "model.completed")
        .every((e) => e.usage?.provider === "replay"),
    ).toBe(true);
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
