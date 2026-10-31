import { describe, expect, it } from "vitest";

import { MetaAdapter } from "../../model/adapter.ts";
import type { ReplayStep } from "../../model/replay.ts";
import { AT, queuedTask, testStore, CASE_ID } from "../../testing/case-fixture.ts";
import { answerStep, refusalStep, syntheticTransport } from "../../testing/replay-steps.ts";
import { SMOKE4_STATEMENTS } from "../../testing/smoke4-findings.ts";
import { caseToolRegistry } from "../../tools/registry.ts";
import { MemoryCommitApi } from "../commit.ts";
import type { EvidenceRecord, TaskRecord } from "../records.ts";
import type { TraceEventDraft } from "../trace.ts";
import { runLivelihoodTask, runSourceResearchTask } from "./source-task.ts";

// P9g: a finding never names an internal tool. 'Founder instance smoke 4' stored three field
// requirements that read "with read_source"; the first proposal below is those three.

function requirement(statement: string, limitation: string, scope: string) {
  return {
    statement,
    claimKind: "field_requirement",
    measurementIds: [],
    sourceId: null,
    locator: null,
    excerpt: null,
    scopeNote: scope,
    limitations: [limitation],
  };
}

const SCOPES = [
  "located statements on stewardship and customary regimes in the case corpus",
  "located statements on grazing practices and herding households in the case corpus",
  "located statements on customary institutions and words for shared pastures in the case corpus",
] as const;

/** The smoke 4 proposal: three field requirements, each naming the tool, as its limitation does. */
const SMOKE4 = {
  items: SMOKE4_STATEMENTS.map((statement, i) =>
    requirement(statement, "passage text not yet read with read_source", SCOPES[i] ?? ""),
  ),
};

const CLEAN = [
  "The Ait Bouguemez stewardship source has not been read; its statements on grazing and customary management are still to be located.",
  "The Central High Atlas livestock source has not been read; its statements on herding households and shared pasture terms are still to be located.",
  "The forest agdal patrimony source has not been read; its words for shared pastures are still to be located.",
] as const;

const CLEAN_LIMITATION = "The passage text of this source has not been read.";

const REPAIRED = {
  items: CLEAN.map((statement, i) => requirement(statement, CLEAN_LIMITATION, SCOPES[i] ?? "")),
};

function task(kind: "source_research" | "livelihood_governance" = "source_research"): TaskRecord {
  return queuedTask({
    id: "task_test_tool_names",
    kind,
    question: "What located statements describe grazing practices and shared pastures?",
    inputVersions: [],
    allowedTools: ["search_sources", "read_source", "propose_evidence"],
  });
}

function harness(steps: ReplayStep[]) {
  const store = testStore();
  const events: TraceEventDraft[] = [];
  const bodies: unknown[] = [];
  let n = 0;
  const transport = syntheticTransport(steps);
  return {
    events,
    bodies,
    deps: {
      adapter: new MetaAdapter({
        transport: {
          route: transport.route,
          replayOrigin: transport.replayOrigin,
          open: (body, signal) => {
            bodies.push(body);
            return transport.open(body, signal);
          },
        },
        sleep: () => Promise.resolve(),
      }),
      trace: { emit: (e: TraceEventDraft) => events.push(e) },
      store,
      tools: caseToolRegistry(store, CASE_ID),
      newEvidenceId: () => `ev_test_${String((n += 1)).padStart(2, "0")}`,
      now: () => AT,
    },
  };
}

function evidenceOf(commit: { upserts: readonly { recordType: string }[] }): EvidenceRecord[] {
  return commit.upserts.filter((r): r is EvidenceRecord => r.recordType === "Evidence");
}

function validationOf(events: readonly TraceEventDraft[]) {
  return events.filter((e) => e.kind === "validation.completed").map((e) => e.validation);
}

describe("a finding names no internal tool (P9g)", () => {
  it("refuses the smoke 4 proposal, names the tool in the repair turn, and accepts the repaired findings", async () => {
    const { deps, events, bodies } = harness([
      answerStep(JSON.stringify(SMOKE4)),
      answerStep(JSON.stringify(REPAIRED)),
    ]);
    const { loop, commit } = await runSourceResearchTask(
      { task: task(), expectedCaseRevision: 3 },
      deps,
    );
    expect(loop.repaired).toBe(true);
    expect(loop.status).toBe("accepted");
    expect(bodies).toHaveLength(2);
    const [first] = validationOf(events);
    expect(first?.outcome).toBe("rejected");
    expect(first?.issues).toHaveLength(6);
    expect(first?.issues.every((i) => i.code === "prohibited_claim")).toBe(true);
    expect(first?.issues.map((i) => i.path)).toContain("$.items[0].statement");
    expect(first?.issues.map((i) => i.path)).toContain("$.items[2].limitations[0]");
    expect(first?.issues[0]?.message).toContain("read_source");
    expect(first?.issues[0]?.message).toContain("internal tool");
    expect(JSON.stringify(bodies[1])).toContain("internal tool");

    const evidence = evidenceOf(commit);
    expect(evidence.map((e) => e.statement)).toEqual([...CLEAN]);
    expect(JSON.stringify(evidenceOf(commit))).not.toMatch(/read_source/);
    expect(await new MemoryCommitApi(3).commit(commit)).toMatchObject({ status: "committed" });
  });

  it("applies to the livelihood task too", async () => {
    const { deps } = harness([
      answerStep(JSON.stringify(SMOKE4)),
      answerStep(JSON.stringify(REPAIRED)),
    ]);
    const { loop } = await runLivelihoodTask(
      { task: task("livelihood_governance"), expectedCaseRevision: 3 },
      deps,
    );
    expect(loop.repaired).toBe(true);
    expect(loop.status).toBe("accepted");
  });

  it("fails the task, with the rejection recorded, when the name persists in every finding", async () => {
    const { deps, events } = harness([
      answerStep(JSON.stringify(SMOKE4)),
      answerStep(JSON.stringify(SMOKE4)),
    ]);
    const { loop, commit } = await runSourceResearchTask(
      { task: task(), expectedCaseRevision: 3 },
      deps,
    );
    expect(loop.status).toBe("rejected");
    expect(loop.failureCode).toBe("validation_rejected");
    expect(evidenceOf(commit)).toEqual([]);
    const taskAfter = commit.upserts.find((r) => r.recordType === "Task") as TaskRecord;
    expect(taskAfter.status).toBe("failed");
    const recorded = validationOf(events);
    expect(recorded).toHaveLength(2);
    expect(recorded[1]?.outcome).toBe("rejected");
    expect(recorded[1]?.issues.some((i) => i.message.includes("read_source"))).toBe(true);
  });

  it("repairs a proposal in which only some findings name a tool, and accepts all of them", async () => {
    const mixed = { items: [REPAIRED.items[0], SMOKE4.items[1]] };
    const { deps, events, bodies } = harness([
      answerStep(JSON.stringify(mixed)),
      answerStep(JSON.stringify({ items: [REPAIRED.items[0], REPAIRED.items[1]] })),
    ]);
    const { loop, commit } = await runSourceResearchTask(
      { task: task(), expectedCaseRevision: 3 },
      deps,
    );
    expect(bodies).toHaveLength(2);
    expect(loop.repaired).toBe(true);
    expect(loop.status).toBe("accepted");
    expect(validationOf(events).map((v) => v?.outcome)).toEqual(["partial", "accepted"]);
    expect(evidenceOf(commit).map((e) => e.statement)).toEqual([CLEAN[0], CLEAN[1]]);
    const taskAfter = commit.upserts.find((r) => r.recordType === "Task") as TaskRecord;
    expect(taskAfter.status).toBe("succeeded");
  });

  it("rejects the finding that still names the tool after the repair, keeps the others, and records it", async () => {
    const mixed = { items: [REPAIRED.items[0], SMOKE4.items[1]] };
    const { deps, events } = harness([
      answerStep(JSON.stringify(mixed)),
      answerStep(JSON.stringify(mixed)),
    ]);
    const { loop, commit } = await runSourceResearchTask(
      { task: task(), expectedCaseRevision: 3 },
      deps,
    );
    expect(loop.repaired).toBe(true);
    expect(evidenceOf(commit).map((e) => e.statement)).toEqual([CLEAN[0]]);
    const taskAfter = commit.upserts.find((r) => r.recordType === "Task") as TaskRecord;
    expect(taskAfter.status).toBe("partial");
    expect(taskAfter.outputEntityIds).toEqual(["ev_test_01"]);
    const recorded = validationOf(events);
    expect(recorded.map((v) => v?.outcome)).toEqual(["partial", "partial"]);
    expect(recorded[1]?.issues.map((i) => i.path)).toEqual([
      "$.items[1].statement",
      "$.items[1].limitations[0]",
    ]);
    expect(commit.events.at(-1)?.message).toBe(
      "Source research task accepted 1 item; 2 issues rejected the rest.",
    );
    expect(JSON.stringify(evidenceOf(commit))).not.toMatch(/read_source/);
  });

  it("takes the repaired findings when the repair returns as many as the first accepted", async () => {
    const first = { items: [REPAIRED.items[0], SMOKE4.items[1]] };
    const reworded = requirement(
      "The Ait Bouguemez stewardship source is still unread; what it says on grazing is still to be located.",
      CLEAN_LIMITATION,
      SCOPES[0],
    );
    const { deps } = harness([
      answerStep(JSON.stringify(first)),
      answerStep(JSON.stringify({ items: [reworded, SMOKE4.items[1]] })),
    ]);
    const { commit } = await runSourceResearchTask({ task: task(), expectedCaseRevision: 3 }, deps);
    expect(evidenceOf(commit).map((e) => e.statement)).toEqual([reworded.statement]);
  });

  it("keeps the findings of the first proposal when the repair returns fewer", async () => {
    const mixed = { items: [REPAIRED.items[0], REPAIRED.items[2], SMOKE4.items[1]] };
    const { deps } = harness([
      answerStep(JSON.stringify(mixed)),
      answerStep(JSON.stringify({ items: [REPAIRED.items[1]] })),
    ]);
    const { loop, commit } = await runSourceResearchTask(
      { task: task(), expectedCaseRevision: 3 },
      deps,
    );
    expect(loop.status).toBe("accepted");
    expect(evidenceOf(commit).map((e) => e.statement)).toEqual([CLEAN[0], CLEAN[2]]);
  });

  it("keeps the findings of the first proposal when the repair turn is rejected", async () => {
    const mixed = { items: [REPAIRED.items[0], SMOKE4.items[1]] };
    const { deps } = harness([
      answerStep(JSON.stringify(mixed)),
      answerStep(JSON.stringify(SMOKE4)),
    ]);
    const { loop, commit } = await runSourceResearchTask(
      { task: task(), expectedCaseRevision: 3 },
      deps,
    );
    expect(loop.status).toBe("accepted");
    expect(evidenceOf(commit).map((e) => e.statement)).toEqual([CLEAN[0]]);
  });

  it("keeps the findings of the first proposal when the repair turn cannot run", async () => {
    const mixed = { items: [REPAIRED.items[0], SMOKE4.items[1]] };
    const { deps } = harness([answerStep(JSON.stringify(mixed)), refusalStep()]);
    const { loop, commit } = await runSourceResearchTask(
      { task: task(), expectedCaseRevision: 3 },
      deps,
    );
    expect(loop.status).toBe("accepted");
    expect(evidenceOf(commit).map((e) => e.statement)).toEqual([CLEAN[0]]);
  });

  it("refuses a tool name in the scope note as it does in the statement and the limitations", async () => {
    const scoped = requirement(CLEAN[0], CLEAN_LIMITATION, "Use search_sources to find it.");
    const { deps, events } = harness([
      answerStep(JSON.stringify({ items: [scoped] })),
      answerStep(JSON.stringify({ items: [REPAIRED.items[0]] })),
    ]);
    const { loop } = await runSourceResearchTask({ task: task(), expectedCaseRevision: 3 }, deps);
    expect(loop.repaired).toBe(true);
    const [first] = validationOf(events);
    expect(first?.issues.map((i) => i.path)).toEqual(["$.items[0].scopeNote"]);
    expect(first?.issues[0]?.message).toContain("search_sources");
  });

  it("takes no repair turn for a partial proposal that names no tool", async () => {
    const numbers = requirement(
      "Check whether 4821 herders use the shared pasture.",
      CLEAN_LIMITATION,
      SCOPES[0],
    );
    const { deps, bodies } = harness([
      answerStep(JSON.stringify({ items: [REPAIRED.items[0], numbers] })),
    ]);
    const { loop, commit } = await runSourceResearchTask(
      { task: task(), expectedCaseRevision: 3 },
      deps,
    );
    expect(bodies).toHaveLength(1);
    expect(loop.repaired).toBe(false);
    expect(evidenceOf(commit).map((e) => e.statement)).toEqual([CLEAN[0]]);
  });

  it("accepts a finding that says to read the source in plain words", async () => {
    const plain = requirement(
      "Read the source text before relying on its statements; search the sources for the word.",
      CLEAN_LIMITATION,
      SCOPES[0],
    );
    const { deps, bodies } = harness([answerStep(JSON.stringify({ items: [plain] }))]);
    const { loop } = await runSourceResearchTask({ task: task(), expectedCaseRevision: 3 }, deps);
    expect(bodies).toHaveLength(1);
    expect(loop.status).toBe("accepted");
  });
});
