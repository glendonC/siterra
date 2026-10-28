import { MemoryCommitApi, ReplayTransport, parseReplayFile } from "@siterra/agent";
import type {
  CommitDraft,
  CommitOutcome,
  EventDraftRecord,
  EvidenceRecord,
  ReplayStep,
  TaskExecutor,
} from "@siterra/agent";
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
      kind: "brief_package",
      question: "Which responses could be prepared?",
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

  /** The commit that throws, as if the worker died before it landed. */
  crashOn: ((draft: CommitDraft) => boolean) | null = null;

  commit(draft: CommitDraft): Promise<CommitOutcome> {
    if (this.crashOn?.(draft)) {
      this.crashOn = null;
      return Promise.reject(new Error("worker crashed"));
    }
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
    // No executors, so this test covers the executor_not_available path.
    executors: {},
  };
}

describe("plan job", () => {
  it("records the plan task, runs the command, streams numbered events and ends the command", async () => {
    const db = new FakeDb();
    const result = await handlePlanJob(JOB, deps(db, [answer(JSON.stringify(PLAN))]));
    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;
    expect(result.outcome.status).toBe("failed");
    // A brief package runs after its failed dependency (RL-02), so the second also finds no executor.
    expect(result.outcome.tasks.map((t) => t.failureCode)).toEqual([
      "executor_not_available",
      "executor_not_available",
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

  it("does not plan or run a task twice when the job is delivered again (RL-04 path)", async () => {
    const db = new FakeDb();
    await handlePlanJob(JOB, deps(db, [answer(JSON.stringify(PLAN))]));
    const tasks = new Map(db.commits.tasks);
    db.statuses.length = 0;
    db.command = { ...db.command, status: "running" };
    // No replay steps: a model call here would fail the run.
    const again = await handlePlanJob(JOB, { ...deps(db, []), delivery: 1 });
    expect(again.status === "ran" && again.outcome.status).toBe("failed");
    expect(db.commits.tasks).toEqual(tasks);
    expect(db.statuses).toEqual(["failed"]);
  });

  describe("AF-03 a job delivered again after a worker crash resumes the command", () => {
    const ran: string[] = [];
    const ok: TaskExecutor = ({ task, expectedCaseRevision }) => {
      ran.push(task.id);
      return Promise.resolve({
        commit: {
          caseId: task.caseId,
          commandId: task.commandId,
          taskId: task.id,
          expectedCaseRevision,
          idempotencyKey: `test-${task.id}-${String(task.revision)}`,
          inputVersions: [],
          upserts: [
            {
              ...task,
              revision: task.revision + 1,
              status: "succeeded",
              spentMicroUsd: task.spentMicroUsd + 1_000,
              finishedAt: AT.toISOString(),
            },
          ],
          events: [],
        },
      });
    };
    const withOk = (db: FakeDb, steps: ReplayStep[], delivery = 0) => ({
      ...deps(db, steps),
      executors: { brief_package: ok },
      delivery,
    });

    it("keeps the finished tasks, runs the unfinished one on a new attempt and ends the command", async () => {
      ran.length = 0;
      const db = new FakeDb();
      db.crashOn = (d) => d.taskId === "task_test_2";
      await expect(handlePlanJob(JOB, withOk(db, [answer(JSON.stringify(PLAN))]))).rejects.toThrow(
        "worker crashed",
      );
      expect(db.statuses).toEqual(["running"]);
      expect(db.commits.tasks.get("task_test_1")?.status).toBe("succeeded");
      expect(db.commits.tasks.get("task_test_2")?.status).toBe("queued");
      const before = db.events.length;

      db.command = { ...db.command, status: "running" };
      const again = await handlePlanJob(JOB, withOk(db, [], 1));
      expect(again.status === "ran" && again.outcome.status).toBe("succeeded");
      expect(ran).toEqual(["task_test_1", "task_test_2", "task_test_2"]);
      expect([...db.commits.tasks.keys()].sort()).toEqual([
        "task_test_1",
        "task_test_2",
        "task_test_plan",
      ]);
      expect(db.commits.tasks.get("task_test_2")).toMatchObject({
        status: "succeeded",
        attempt: 2,
      });
      expect(db.statuses.at(-1)).toBe("succeeded");
      // The resumed run's events are keyed on attempt 2, so none repeats a crashed run's key and
      // none is dropped as a duplicate.
      const resumed = db.events.slice(before).filter((e) => e.taskId === "task_test_2");
      expect(resumed.map((e) => e.kind)).toContain("task.started");
      expect(new Set(db.events.map((e) => e.dedupeKey)).size).toBe(db.events.length);
      // The spend the finished tasks recorded counts against the command's cap.
      expect(again.status === "ran" && again.outcome.spentUsd).toBeGreaterThanOrEqual(0.002);
    });

    it("plans again when the worker died before the plan landed", async () => {
      ran.length = 0;
      const db = new FakeDb();
      // The plan's commit, not the one that queued the plan task: it also upserts the planned tasks.
      db.crashOn = (d) => d.taskId === "task_test_plan" && d.upserts.length > 1;
      await expect(handlePlanJob(JOB, withOk(db, [answer(JSON.stringify(PLAN))]))).rejects.toThrow(
        "worker crashed",
      );
      expect(db.commits.tasks.get("task_test_plan")?.status).toBe("queued");

      db.command = { ...db.command, status: "running" };
      const again = await handlePlanJob(JOB, withOk(db, [answer(JSON.stringify(PLAN))], 1));
      expect(again.status === "ran" && again.outcome.status).toBe("succeeded");
      expect(db.commits.tasks.get("task_test_plan")?.status).toBe("succeeded");
      expect(db.statuses.at(-1)).toBe("succeeded");
    });
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
    const evidence = (id: string, status: EvidenceRecord["status"]): EvidenceRecord => ({
      recordType: "Evidence",
      id,
      revision: 1,
      createdAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
      caseId: "case_test",
      statement: "A synthetic statement.",
      claimKind: "field_requirement",
      status,
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
        verificationStatus: "unverified",
        limitations: [],
      },
      interpretation: null,
      uncertainty: "Not quantified.",
      reviewDecisionIds: [],
    });
    snapshot.records.evidenceRecords.push(
      evidence("ev_test_ok", "accepted"),
      evidence("ev_test_no", "rejected"),
    );
    expect(snapshotRecords(snapshot).map((r) => r.id)).toEqual(["geo_test", "ev_test_ok"]);
  });
});
