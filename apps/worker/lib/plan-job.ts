import { NumberedEventSink, P0_LIMITS, commandCompletedDraft, runCommand } from "@siterra/agent";
import type {
  CommandOutcome,
  CommitApi,
  CommitDraft,
  CommitOutcome,
  EventDraftRecord,
  EntityVersion,
  EvidenceRecord,
  ModelTransport,
  PlanSnapshot,
  SnapshotRecord,
  TaskExecutor,
  TaskRecord,
} from "@siterra/agent";

import type { Corpus } from "./corpus.ts";
import type { Analyses } from "./recipes.ts";
import { snapshotStore } from "./snapshot-store.ts";
import type { SnapshotView } from "./snapshot-store.ts";

// The worker's handler for a `plan` job (payload from PLATFORM's outbox: caseId, commandId,
// planTaskId). It reads the command and one snapshot, records the plan task, runs the command
// through the coordinator, streams numbered events, and sets the command's final status. The
// database sits behind WorkerDb so this logic is tested without PostgreSQL; PLATFORM's
// packages/db functions implement it.

export interface PlanJob {
  caseId: string;
  commandId: string;
  planTaskId: string;
}

export interface CommandView {
  id: string;
  caseId: string;
  text: string;
  intent: string;
  status:
    "accepted" | "running" | "succeeded" | "partial" | "failed" | "cancelled" | "rejected_stale";
  context: PlanSnapshot["context"];
}

export interface WorkerSnapshot extends SnapshotView {
  records: Omit<SnapshotView["records"], "sourceRecords"> & {
    geoSelectionRecords: { id: string; revision: number; label?: string }[];
    sourceRecords: { id: string; revision: number; title?: string; accessStatus?: string }[];
    evidenceRecords: EvidenceRecord[];
    taskRecords: TaskRecord[];
  };
}

export interface WorkerDb {
  readCommand(commandId: string): Promise<CommandView | null>;
  readSnapshot(caseId: string): Promise<WorkerSnapshot | null>;
  commit(draft: CommitDraft): Promise<CommitOutcome>;
  appendEvents(caseId: string, drafts: readonly EventDraftRecord[]): Promise<void>;
  setCommandStatus(
    commandId: string,
    status: CommandView["status"],
    taskIds?: string[],
  ): Promise<void>;
  isCancelRequested(commandId: string): Promise<boolean>;
}

export interface PlanJobDeps {
  db: WorkerDb;
  transport: ModelTransport;
  corpus: Corpus;
  /** The recipe registry and stored recipe results; null leaves the recipe tools empty. */
  analyses?: Analyses | null;
  now: () => Date;
  newId: (prefix: "task" | "ev") => string;
  cancelPollMs?: number;
  /** Executors by task kind; the build's EXECUTORS when absent (tests pass their own). */
  executors?: Partial<Record<TaskRecord["kind"], TaskExecutor>>;
}

export type PlanJobResult =
  | {
      status: "skipped";
      reason: "unknown_command" | "unknown_case" | "already_terminal" | "plan_task_exists";
    }
  | { status: "ran"; outcome: CommandOutcome };

const TERMINAL_COMMAND = new Set<CommandView["status"]>([
  "succeeded",
  "partial",
  "failed",
  "cancelled",
  "rejected_stale",
]);

/** What the planner may reference: validated bundles, geometry, sources and accepted evidence. */
export function snapshotRecords(snapshot: WorkerSnapshot): SnapshotRecord[] {
  const r = snapshot.records;
  return [
    ...r.geoSelectionRecords.map((g) => ({
      id: g.id,
      revision: g.revision,
      recordType: "GeoSelection",
      label: g.label ?? g.id,
    })),
    ...r.dataBundleRecords
      .filter((b) => b.status === "validated")
      .map((b) => ({ id: b.id, revision: b.revision, recordType: "DataBundle", label: b.label })),
    ...r.sourceRecords.map((s) => ({
      id: s.id,
      revision: s.revision,
      recordType: "Source",
      label: s.title ?? s.id,
    })),
    ...r.evidenceRecords
      .filter((e) => e.status === "accepted")
      .map((e) => ({
        id: e.id,
        revision: e.revision,
        recordType: "Evidence",
        label: e.statement.slice(0, 160),
      })),
  ];
}

function planTaskRecord(
  job: PlanJob,
  command: CommandView,
  snapshot: WorkerSnapshot,
  now: Date,
): TaskRecord {
  const at = now.toISOString();
  const known = new Map(snapshotRecords(snapshot).map((r) => [r.id, r.revision]));
  const inputs: EntityVersion[] = [
    command.context.geoSelectionId,
    ...command.context.dataBundleIds,
  ].flatMap((id) => {
    const revision = id === null ? undefined : known.get(id);
    return id !== null && revision !== undefined ? [{ entityId: id, revision }] : [];
  });
  return {
    recordType: "Task",
    id: job.planTaskId,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId: job.caseId,
    commandId: job.commandId,
    kind: "plan",
    question: command.text,
    status: "queued",
    dependsOnTaskIds: [],
    inputVersions: inputs,
    allowedTools: ["read_case", "propose_plan"],
    outputEntityIds: [],
    idempotencyKey: `plan-${job.commandId}`,
    attempt: 0,
    maxModelRounds: 6,
    deadlineAt: new Date(now.getTime() + P0_LIMITS.wallClockMs).toISOString(),
    budgetMicroUsd: P0_LIMITS.spendCapMicroUsd,
    spentMicroUsd: 0,
    checkpointId: null,
    failureCode: null,
    missingInputs: [],
    startedAt: null,
    finishedAt: null,
  };
}

export async function handlePlanJob(job: PlanJob, deps: PlanJobDeps): Promise<PlanJobResult> {
  const command = await deps.db.readCommand(job.commandId);
  if (!command || command.caseId !== job.caseId)
    return { status: "skipped", reason: "unknown_command" };
  if (TERMINAL_COMMAND.has(command.status))
    return { status: "skipped", reason: "already_terminal" };
  const snapshot = await deps.db.readSnapshot(job.caseId);
  if (!snapshot) return { status: "skipped", reason: "unknown_case" };
  // A redelivered job must not plan twice (RL-04): an existing plan task means this ran before.
  if (snapshot.records.taskRecords.some((t) => t.id === job.planTaskId))
    return { status: "skipped", reason: "plan_task_exists" };

  // Events go out in order; each append waits for the one before it.
  let appending: Promise<void> = Promise.resolve();
  // One run per plan job (a redelivered job is skipped above), so every task is on attempt 1 here.
  const sink = new NumberedEventSink(
    job.commandId,
    () => 1,
    (draft) => {
      appending = appending.then(() => deps.db.appendEvents(job.caseId, [draft]));
    },
  );

  const planTask = planTaskRecord(job, command, snapshot, deps.now());
  const queued = await deps.db.commit({
    caseId: job.caseId,
    commandId: job.commandId,
    taskId: planTask.id,
    expectedCaseRevision: snapshot.case.revision,
    idempotencyKey: `queue-${planTask.id}`,
    inputVersions: planTask.inputVersions,
    upserts: [planTask],
    events: [
      {
        kind: "task.queued",
        taskId: planTask.id,
        occurredAt: planTask.createdAt,
        entityIds: [planTask.id],
        message: "Task queued: plan.",
        resultStatus: null,
        usage: null,
        tool: null,
        validation: null,
      },
    ],
  });
  if (queued.status === "stale") return { status: "skipped", reason: "plan_task_exists" };
  await deps.db.setCommandStatus(job.commandId, "running");

  const controller = new AbortController();
  const poll = setInterval(() => {
    void deps.db.isCancelRequested(job.commandId).then((yes) => {
      if (yes) controller.abort();
    });
  }, deps.cancelPollMs ?? 1_000);

  // A commit waits for the events queued before it, so sequences follow the order things happened.
  const commits: CommitApi = {
    commit: async (draft) => {
      await appending;
      return deps.db.commit(draft);
    },
  };
  let outcome: CommandOutcome;
  try {
    outcome = await runCommand(
      {
        planTask,
        expectedCaseRevision: queued.newCaseRevision,
        snapshot: {
          command: { text: command.text, intent: command.intent },
          context: command.context,
          case: {
            title: snapshot.case.title,
            objective: snapshot.case.objective,
            mode: snapshot.case.mode,
            unresolvedQuestions: snapshot.case.unresolvedQuestions,
          },
          records: snapshotRecords(snapshot),
        },
      },
      {
        transport: deps.transport,
        store: snapshotStore(snapshot, deps.corpus, deps.analyses ?? null),
        commits,
        trace: sink,
        newTaskId: () => deps.newId("task"),
        newEvidenceId: () => deps.newId("ev"),
        now: deps.now,
        signal: controller.signal,
        ...(deps.executors ? { executors: deps.executors } : {}),
      },
    );
  } finally {
    clearInterval(poll);
  }
  await appending;
  const taskIds = [planTask.id, ...outcome.tasks.map((t) => t.id)];
  await deps.db.setCommandStatus(job.commandId, outcome.status, taskIds);
  await deps.db.appendEvents(job.caseId, [
    commandCompletedDraft(job.commandId, outcome.status, taskIds, deps.now().toISOString()),
  ]);
  return { status: "ran", outcome };
}
