import { MemoryCommitApi, ReplayTransport, parseReplayFile } from "@siterra/agent";
import type { CommitDraft, CommitOutcome, EventDraftRecord, ReplayStep } from "@siterra/agent";
import { describe, expect, it } from "vitest";

import type { Corpus } from "./corpus.ts";
import { handlePlanJob, snapshotRecords } from "./plan-job.ts";
import type { CommandView, WorkerDb, WorkerSnapshot } from "./plan-job.ts";

// A fake database over the memory commit double, and synthetic replays. Nothing reaches
// PostgreSQL or a provider.

const AT = new Date("2026-10-27T20:00:00.000Z");
const JOB = { caseId: "case_test", commandId: "cmd_test", planTaskId: "task_test_plan" };

const PLAN = {
  interpretation: "The command asks which explanations fit the valley record.",
  tasks: [
    {
      key: "a",
      kind: "hypothesis_comparison",
      question: "Which explanations fit?",
      dependsOn: [],
      inputRefs: [],
    },
    {
      key: "b",
      kind: "brief_package",
      question: "What goes in the brief?",
      dependsOn: ["a"],
      inputRefs: [],
    },
  ],
  clarifyingQuestion: null,
};

function answer(text: string): ReplayStep {
  return {
    kind: "stream",
    requestId: "req_synthetic_worker",
    events: [
      { type: "response.output_text.delta", delta: text },
      {
        type: "response.completed",
        response: {
          id: "resp_synthetic_worker",
          status: "completed",
          output: [],
          usage: {
            input_tokens: 800,
            output_tokens: 200,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 50 },
          },
        },
      },
    ],
  };
}

const transport = (steps: ReplayStep[]) =>
  new ReplayTransport(
    parseReplayFile({
      format: "siterra-model-replay@1",
      origin: "synthetic",
      model: "muse-spark-1.3",
      description: "Synthetic worker test.",
      steps,
    }),
  );

const EMPTY_CORPUS: Corpus = { sources: [], passages: [], missing: [] };

class FakeDb implements WorkerDb {
  readonly commits = new MemoryCommitApi(3);
  readonly events: EventDraftRecord[] = [];
  readonly statuses: CommandView["status"][] = [];
  cancel = false;
  command: CommandView = {
    id: "cmd_test",
    caseId: "case_test",
    text: "Which explanations fit?",
    intent: "investigate",
    status: "accepted",
    context: {
      caseRevision: 3,
      geoSelectionId: "geo_test",
      geoRevision: 1,
      periodIds: [],
      focusedEntityIds: [],
      dataBundleIds: [],
      locale: "en",
    },
  };

  readCommand(commandId: string): Promise<CommandView | null> {
    return Promise.resolve(
      commandId === this.command.id
        ? { ...this.command, status: this.statuses.at(-1) ?? this.command.status }
        : null,
    );
  }

  readSnapshot(caseId: string): Promise<WorkerSnapshot | null> {
    if (caseId !== "case_test") return Promise.resolve(null);
    return Promise.resolve({
      case: {
        id: caseId,
        revision: this.commits.caseRevision,
        title: "T",
        objective: "O",
        mode: "replay",
        activeGeoSelectionId: "geo_test",
        unresolvedQuestions: [],
      },
      records: {
        dataBundleRecords: [],
        measurementRecords: [],
        temporalObservationRecords: [],
        sourceRecords: [],
        geoSelectionRecords: [{ id: "geo_test", revision: 1, label: "Catchment" }],
        evidenceRecords: [],
        taskRecords: [...this.commits.tasks.values()],
      },
    });
  }

  commit(draft: CommitDraft): Promise<CommitOutcome> {
    this.log.push(`commit ${draft.events.map((e) => e.kind).join(",")}`);
    return this.commits.commit(draft);
  }

  /** Every write in order: event kinds as appended, and "commit" for each commit. */
  readonly log: string[] = [];
  appendDelayMs = 0;

  async appendEvents(_caseId: string, drafts: readonly EventDraftRecord[]): Promise<void> {
    if (this.appendDelayMs > 0)
      await new Promise((resolve) => setTimeout(resolve, this.appendDelayMs));
    this.events.push(...drafts);
    this.log.push(...drafts.map((d) => d.kind));
  }

  setCommandStatus(_commandId: string, status: CommandView["status"]): Promise<void> {
    this.statuses.push(status);
    return Promise.resolve();
  }

  isCancelRequested(): Promise<boolean> {
    return Promise.resolve(this.cancel);
  }
}

function deps(db: FakeDb, steps: ReplayStep[]) {
  let n = 0;
  return {
    db,
    transport: transport(steps),
    corpus: EMPTY_CORPUS,
    now: () => AT,
    newId: (p: "task" | "ev") => `${p}_test_${(n += 1).toString()}`,
    cancelPollMs: 5,
  };
}

describe("plan job", () => {
  it("records the plan task, runs the command, streams numbered events and ends the command", async () => {
    const db = new FakeDb();
    const result = await handlePlanJob(JOB, deps(db, [answer(JSON.stringify(PLAN))]));
    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;
    expect(result.outcome.status).toBe("failed");
    expect(result.outcome.tasks.map((t) => t.failureCode)).toEqual([
      "executor_not_available",
      "dependency_failed",
    ]);
    expect(db.statuses).toEqual(["running", "failed"]);
    expect(db.commits.tasks.get("task_test_plan")).toMatchObject({
      status: "succeeded",
      revision: 2,
    });
    expect(db.events.map((e) => e.kind)).toEqual([
      "model.started",
      "model.completed",
      "validation.completed",
      "command.completed",
    ]);
    expect(db.events.at(-1)).toMatchObject({
      taskId: null,
      dedupeKey: "command.completed:cmd_test",
      resultStatus: "failed",
    });
    expect(new Set(db.events.map((e) => e.dedupeKey)).size).toBe(db.events.length);
  });

  it("a commit waits for slower event appends queued before it", async () => {
    const db = new FakeDb();
    db.appendDelayMs = 15;
    await handlePlanJob(JOB, deps(db, [answer(JSON.stringify(PLAN))]));
    const planCommit = db.log.findIndex(
      (l) => l.startsWith("commit") && l.includes("task.succeeded"),
    );
    expect(db.log.slice(0, planCommit)).toEqual(
      expect.arrayContaining(["model.started", "model.completed", "validation.completed"]),
    );
  });

  it("does not plan twice when the job is delivered again (RL-04 path)", async () => {
    const db = new FakeDb();
    await handlePlanJob(JOB, deps(db, [answer(JSON.stringify(PLAN))]));
    db.statuses.length = 0;
    db.command = { ...db.command, status: "running" };
    const again = await handlePlanJob(JOB, deps(db, []));
    expect(again).toEqual({ status: "skipped", reason: "plan_task_exists" });
  });

  it("skips a terminal command", async () => {
    const db = new FakeDb();
    db.command = { ...db.command, status: "succeeded" };
    expect(await handlePlanJob(JOB, deps(db, []))).toEqual({
      status: "skipped",
      reason: "already_terminal",
    });
  });

  it("a cancel request stops a running command", async () => {
    const db = new FakeDb();
    db.cancel = true;
    const stall: ReplayStep = {
      kind: "stall",
      requestId: null,
      events: [{ type: "response.created", response: { id: "resp_synthetic_stall" } }],
    };
    const result = await handlePlanJob(JOB, deps(db, [stall]));
    expect(result.status === "ran" && result.outcome.status).toBe("cancelled");
    expect(db.statuses.at(-1)).toBe("cancelled");
  });

  it("offers the planner only validated bundles, geometry, sources and accepted evidence", async () => {
    const db = new FakeDb();
    const snapshot = await db.readSnapshot("case_test");
    if (!snapshot) throw new Error("no snapshot");
    snapshot.records.evidenceRecords.push(
      { id: "ev_test_ok", revision: 1, statement: "Accepted.", status: "accepted" },
      { id: "ev_test_no", revision: 1, statement: "Rejected.", status: "rejected" },
    );
    expect(snapshotRecords(snapshot).map((r) => r.id)).toEqual(["geo_test", "ev_test_ok"]);
  });
});
