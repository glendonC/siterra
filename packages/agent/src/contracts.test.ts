import { Event, Evidence, ProposePlan, Task } from "@siterra/contracts";
import { describe, expect, it } from "vitest";

import { MetaAdapter } from "./model/adapter.ts";
import type { ReplayStep } from "./model/replay.ts";
import { NumberedEventSink } from "./tasks/event-drafts.ts";
import type { EventDraftRecord } from "./tasks/event-drafts.ts";
import { runObservationTask } from "./tasks/observation/observation-task.ts";
import { runPlanTask } from "./tasks/plan/plan-task.ts";
import { PlanProposal } from "./tasks/plan/proposal.ts";
import type { CommitDraft, TaskRecord } from "./tasks/records.ts";
import { runSourceResearchTask } from "./tasks/source/source-task.ts";
import { AT, CASE_ID, queuedTask, testStore } from "./testing/case-fixture.ts";
import { answerStep, syntheticTransport, toolCallStep } from "./testing/replay-steps.ts";
import { caseToolRegistry } from "./tools/registry.ts";

// Conformance with PLATFORM's contracts (packages/contracts, case schema 1.3.0): every record and
// event draft this package produces must parse with the shared Zod schemas, and the local
// propose_plan mirror must accept exactly what ProposePlan accepts. Synthetic replays only.

const EventDraft = Event.omit({
  recordType: true,
  schemaVersion: true,
  id: true,
  caseId: true,
  sequence: true,
  caseRevision: true,
});

const PLAN = {
  interpretation: "The command asks what the corpus and the bundle show about the valley.",
  tasks: [
    {
      key: "observations",
      kind: "observation_analysis",
      question: "What did NDVI show in April 2022?",
      dependsOn: [],
      inputRefs: [{ entityId: "bundle_test_ndvi", revision: 2 }],
    },
    {
      key: "sources",
      kind: "source_research",
      question: "What do sources say about closures?",
      dependsOn: ["observations"],
      inputRefs: [],
    },
  ],
  clarifyingQuestion: null,
};

const PLAN_TASK: TaskRecord = queuedTask({
  id: "task_test_plan",
  kind: "plan",
  question: "Plan the commission.",
  inputVersions: [],
  allowedTools: ["read_case", "propose_plan"],
});

function deps(steps: ReplayStep[], events: EventDraftRecord[]) {
  const store = testStore();
  let n = 0;
  return {
    adapter: new MetaAdapter({
      transport: syntheticTransport(steps),
      sleep: () => Promise.resolve(),
    }),
    trace: new NumberedEventSink(
      "cmd_test_commission",
      () => 1,
      (d) => events.push(d),
    ),
    store,
    tools: caseToolRegistry(store, CASE_ID),
    newTaskId: () => `task_test_${(n += 1).toString()}`,
    newEvidenceId: () => `ev_test_${(n += 1).toString()}`,
    now: () => AT,
  };
}

function records(commits: CommitDraft[]) {
  return commits.flatMap((c) => c.upserts);
}

describe("contracts 1.3.0 conformance", () => {
  it("Task and Evidence records from the plan, observation and source tasks parse", async () => {
    const events: EventDraftRecord[] = [];
    const plan = await runPlanTask(
      {
        planTask: PLAN_TASK,
        expectedCaseRevision: 3,
        snapshot: {
          command: { text: "Investigate.", intent: "commission" },
          context: {
            caseRevision: 3,
            geoSelectionId: null,
            geoRevision: null,
            periodIds: [],
            focusedEntityIds: [],
            dataBundleIds: [],
            locale: "en",
          },
          case: { title: "T", objective: "O", mode: "replay", unresolvedQuestions: [] },
          records: [
            { id: "bundle_test_ndvi", revision: 2, recordType: "DataBundle", label: "NDVI" },
          ],
        },
      },
      { ...deps([answerStep(JSON.stringify(PLAN))], events), tools: [] },
    );
    const observation = await runObservationTask(
      { task: queuedTask(), expectedCaseRevision: 4 },
      deps(
        [
          toolCallStep("summarize_observations", {
            bundleId: "bundle_test_ndvi",
            bundleRevision: 2,
            periodIds: ["period_2022-04"],
            metric: null,
          }),
          answerStep(
            JSON.stringify({
              items: [
                {
                  statement: "The area median was 0.1439 in April 2022.",
                  claimKind: "observation",
                  measurementIds: ["meas_test_2022-04"],
                  sourceId: null,
                  locator: null,
                  excerpt: null,
                  scopeNote: "",
                  limitations: [],
                },
              ],
            }),
          ),
        ],
        events,
      ),
    );
    const source = await runSourceResearchTask(
      {
        task: queuedTask({
          id: "task_test_sources",
          kind: "source_research",
          inputVersions: [],
          allowedTools: ["search_sources", "read_source", "propose_evidence"],
        }),
        expectedCaseRevision: 5,
      },
      deps(
        [
          toolCallStep("read_source", {
            sourceId: "src_test_report",
            document: null,
            pages: [2],
            sections: [],
          }),
          answerStep(
            JSON.stringify({
              items: [
                {
                  statement: "The report states a seasonal closure of 3 months.",
                  claimKind: "scientific_context",
                  measurementIds: [],
                  sourceId: "src_test_report",
                  locator: "report.pdf, page 2",
                  excerpt: "réglé par une fermeture saisonnière de 3 mois.",
                  scopeNote: "",
                  limitations: [],
                },
              ],
            }),
          ),
        ],
        events,
      ),
    );
    const all = records([plan.commit, observation.commit, source.commit]);
    expect(all.filter((r) => r.recordType === "Evidence")).toHaveLength(2);
    for (const record of all) {
      const parsed =
        record.recordType === "Task" ? Task.safeParse(record) : Evidence.safeParse(record);
      expect(
        parsed.success,
        `${record.id}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`,
      ).toBe(true);
    }
    const drafts = [
      ...events,
      ...[plan, observation, source].flatMap((r) =>
        r.commit.events.map((e) => ({
          ...e,
          commandId: "cmd_test_commission",
          dedupeKey: `test-${e.kind}-${e.taskId}`,
          spanId: null,
          parentSpanId: null,
        })),
      ),
    ];
    expect(drafts.length).toBeGreaterThan(5);
    for (const draft of drafts) {
      const parsed = EventDraft.safeParse(draft);
      expect(
        parsed.success,
        `${draft.kind}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`,
      ).toBe(true);
    }
  });

  it("the local propose_plan mirror accepts what ProposePlan accepts", () => {
    expect(ProposePlan.safeParse(PLAN).success).toBe(true);
    expect(PlanProposal.safeParse(PLAN).success).toBe(true);
    const extra = { ...PLAN, confidence: "high" };
    expect(ProposePlan.safeParse(extra).success).toBe(PlanProposal.safeParse(extra).success);
    const badKind = { ...PLAN, tasks: [{ ...PLAN.tasks[0], kind: "plan" }] };
    expect(ProposePlan.safeParse(badKind).success).toBe(PlanProposal.safeParse(badKind).success);
  });
});
