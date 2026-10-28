import { MetaAdapter } from "../model/adapter.ts";
import type { AdapterOptions } from "../model/adapter.ts";
import type { ModelTransport } from "../model/transport.ts";
import type { CommitApi, CommitOutcome } from "../tasks/commit.ts";
import type { EvidenceTaskDeps, EvidenceTaskInput } from "../tasks/evidence/evidence-task.ts";
import { runObservationTask } from "../tasks/observation/observation-task.ts";
import { runPlanTask } from "../tasks/plan/plan-task.ts";
import type { PlanSnapshot } from "../tasks/plan/prompt.ts";
import { runBriefPackageTask } from "../tasks/brief/brief-task.ts";
import { runHypothesisTask } from "../tasks/hypothesis/hypothesis-task.ts";
import { runInterventionTask } from "../tasks/intervention/intervention-task.ts";
import type {
  CommitDraft,
  EvidenceRecord,
  HypothesisRecord,
  InterventionRecord,
  TaskRecord,
} from "../tasks/records.ts";
import { runLivelihoodTask, runSourceResearchTask } from "../tasks/source/source-task.ts";
import type { TraceEventDraft, TraceSink } from "../tasks/trace.ts";
import { caseToolRegistry, SEARCHES_PER_COMMAND } from "../tools/registry.ts";
import type { CaseStore } from "../tools/store.ts";
import { CommandSpend, P0_LIMITS, Semaphore } from "./limits.ts";
import type { CommandLimits } from "./limits.ts";

// The coordinator for one command: run the plan task, commit it, then run the planned tasks as
// their dependencies finish, at most two model calls at a time, inside the command's spend cap and
// wall clock. Commits are serial per case. Nothing here decides a result: executors propose, host
// validators accept or reject, and the commit API writes.

/** Runs one task and returns its commit draft; the coordinator commits it. */
export type TaskExecutor = (
  input: EvidenceTaskInput,
  deps: EvidenceTaskDeps,
) => Promise<{ commit: CommitDraft }>;

/** Task kinds with an executor in this build; the others end as failed with `executor_not_available`. */
export const EXECUTORS: Partial<Record<TaskRecord["kind"], TaskExecutor>> = {
  observation_analysis: runObservationTask,
  source_research: runSourceResearchTask,
  livelihood_governance: runLivelihoodTask,
  hypothesis_comparison: runHypothesisTask,
  intervention_feasibility: runInterventionTask,
  brief_package: runBriefPackageTask,
};

export type CommandStatus = "succeeded" | "partial" | "failed" | "cancelled";

export interface CommandOutcome {
  status: CommandStatus;
  caseRevision: number;
  planTaskId: string;
  tasks: {
    id: string;
    kind: TaskRecord["kind"];
    status: TaskRecord["status"];
    failureCode: string | null;
  }[];
  /** Why work stopped early, when it did: budget, deadline, cancellation or a spend guard stop. */
  stopReason:
    "budget_exhausted" | "command_deadline" | "cancelled" | typeof SPEND_GUARD_STOP | null;
  spentUsd: number;
}

/**
 * The abort reason of a spend guard stop: the operator's spend guard, outside the command's own
 * budget, stopped the worker. The command ends cancelled and every task it stops records this code.
 */
export const SPEND_GUARD_STOP = "spend_guard";

export interface RunCommandInput {
  planTask: TaskRecord;
  expectedCaseRevision: number;
  snapshot: PlanSnapshot;
}

export interface RunCommandDeps {
  transport: ModelTransport;
  store: CaseStore;
  commits: CommitApi;
  trace: TraceSink;
  newTaskId: () => string;
  newEvidenceId: () => string;
  /** IDs for other records (hyp_ and the like); optional. */
  newRecordId?: (prefix: string) => string;
  now: () => Date;
  limits?: CommandLimits;
  executors?: Partial<Record<TaskRecord["kind"], TaskExecutor>>;
  adapterOptions?: Omit<AdapterOptions, "transport" | "spend" | "gate">;
  signal?: AbortSignal;
}

const TERMINAL: ReadonlySet<TaskRecord["status"]> = new Set([
  "succeeded",
  "partial",
  "failed",
  "cancelled",
]);

function taskEvent(
  task: TaskRecord,
  kind: TraceEventDraft["kind"],
  at: string,
  message: string,
): TraceEventDraft {
  const resultStatus =
    kind === "task.succeeded"
      ? "succeeded"
      : kind === "task.partial"
        ? "partial"
        : kind === "task.failed"
          ? "failed"
          : kind === "task.cancelled"
            ? "cancelled"
            : null;
  return {
    kind,
    taskId: task.id,
    occurredAt: at,
    entityIds: [task.id],
    message,
    resultStatus,
    usage: null,
    tool: null,
    validation: null,
  };
}

export async function runCommand(
  input: RunCommandInput,
  deps: RunCommandDeps,
): Promise<CommandOutcome> {
  const limits = deps.limits ?? P0_LIMITS;
  const executors = deps.executors ?? EXECUTORS;
  const spend = new CommandSpend(limits.spendCapMicroUsd);
  const gate = new Semaphore(limits.maxConcurrentModelCalls);
  const adapter = new MetaAdapter({
    ...deps.adapterOptions,
    transport: deps.transport,
    spend,
    gate,
  });
  const tools = caseToolRegistry(deps.store, input.planTask.caseId, {
    remaining: SEARCHES_PER_COMMAND,
  });

  const controller = new AbortController();
  // A holder, not a `let`: closures change it, and a narrowed `let` would read as always null.
  const halt: { reason: CommandOutcome["stopReason"] } = { reason: null };
  const stop = (reason: NonNullable<CommandOutcome["stopReason"]>): void => {
    halt.reason ??= reason;
    // Tasks in flight record a spend guard stop as their failure code; other stops read as cancelled.
    controller.abort(reason === SPEND_GUARD_STOP ? SPEND_GUARD_STOP : undefined);
  };
  const onCancel = (): void => {
    stop(deps.signal?.reason === SPEND_GUARD_STOP ? SPEND_GUARD_STOP : "cancelled");
  };
  deps.signal?.addEventListener("abort", onCancel);
  if (deps.signal?.aborted) onCancel();
  const deadline = setTimeout(() => {
    stop("command_deadline");
  }, limits.wallClockMs);

  let caseRevision = input.expectedCaseRevision;
  // Commits are serial per case: each waits for the one before it.
  let commitChain: Promise<unknown> = Promise.resolve();
  const commit = (draft: CommitDraft): Promise<CommitOutcome> => {
    const run = commitChain.then(async () => {
      const outcome = await deps.commits.commit({ ...draft, expectedCaseRevision: caseRevision });
      if (outcome.status !== "stale") caseRevision = outcome.newCaseRevision;
      return outcome;
    });
    commitChain = run.catch(() => undefined);
    return run;
  };

  const tasks = new Map<string, TaskRecord>();
  let planAccepted = false;
  const finish = (): CommandOutcome => {
    clearTimeout(deadline);
    deps.signal?.removeEventListener("abort", onCancel);
    const planned = [...tasks.values()];
    const succeeded = planned.filter((t) => t.status === "succeeded").length;
    const usable = planned.filter((t) => t.status === "succeeded" || t.status === "partial").length;
    let status: CommandStatus;
    if (halt.reason === "cancelled" || halt.reason === SPEND_GUARD_STOP) status = "cancelled";
    else if (!planAccepted) status = "failed";
    else if (planned.length === 0)
      status = "succeeded"; // the plan asked a clarifying question
    else if (usable === 0) status = "failed";
    else if (succeeded === planned.length && halt.reason === null) status = "succeeded";
    else status = "partial";
    return {
      status,
      caseRevision,
      planTaskId: input.planTask.id,
      tasks: planned.map((t) => ({
        id: t.id,
        kind: t.kind,
        status: t.status,
        failureCode: t.failureCode,
      })),
      stopReason: halt.reason,
      spentUsd: spend.spentUsd,
    };
  };

  // Plan.
  const plan = await runPlanTask(
    { planTask: input.planTask, expectedCaseRevision: caseRevision, snapshot: input.snapshot },
    {
      adapter,
      trace: deps.trace,
      tools: tools.forTask(input.planTask.allowedTools),
      newTaskId: deps.newTaskId,
      now: deps.now,
      signal: controller.signal,
    },
  );
  const planCommit = await commit(plan.commit);
  if (planCommit.status === "stale" || plan.loop.status !== "accepted") {
    if (plan.loop.status === "cancelled") halt.reason ??= "cancelled";
    if (spend.exhausted) halt.reason ??= "budget_exhausted";
    return finish();
  }
  planAccepted = true;
  for (const record of plan.commit.upserts.slice(1)) {
    if (record.recordType === "Task") tasks.set(record.id, record);
  }

  // Close a task without running it, with its reason, in its own commit.
  const close = async (
    task: TaskRecord,
    status: "failed" | "cancelled",
    failureCode: string,
    missing: string[] = [],
  ): Promise<void> => {
    const at = deps.now().toISOString();
    const after: TaskRecord = {
      ...task,
      revision: task.revision + 1,
      updatedAt: at,
      status,
      failureCode,
      missingInputs: [...new Set([...task.missingInputs, ...missing])],
      finishedAt: at,
    };
    const kind = status === "failed" ? "task.failed" : "task.cancelled";
    const words = failureCode.replaceAll("_", " ");
    const outcome = await commit({
      caseId: task.caseId,
      commandId: task.commandId,
      taskId: task.id,
      expectedCaseRevision: caseRevision,
      idempotencyKey: `close-${task.id}-${task.revision}`,
      inputVersions: [],
      upserts: [after],
      events: [
        taskEvent(
          after,
          kind,
          at,
          `Task ${status === "failed" ? "failed" : "cancelled"}: ${words}.`,
        ),
      ],
    });
    tasks.set(task.id, outcome.status === "stale" ? { ...task, status, failureCode } : after);
  };

  const committedEvidence: EvidenceRecord[] = [];
  const committedHypotheses: HypothesisRecord[] = [];
  const committedInterventions: InterventionRecord[] = [];
  const runOne = async (task: TaskRecord): Promise<void> => {
    const executor = executors[task.kind];
    if (!executor) {
      await close(task, "failed", "executor_not_available", [
        `No ${task.kind.replaceAll("_", " ")} executor in this build.`,
      ]);
      return;
    }
    const at = deps.now().toISOString();
    const running: TaskRecord = {
      ...task,
      status: "running",
      startedAt: at,
      attempt: task.attempt + 1,
    };
    tasks.set(task.id, running);
    deps.trace.emit(
      taskEvent(running, "task.started", at, `Task started: ${task.kind.replaceAll("_", " ")}.`),
    );
    // Evidence the task's dependencies committed in this command; the job-start store lacks it.
    const fromDependencies = new Set(
      task.dependsOnTaskIds.flatMap((id) => tasks.get(id)?.outputEntityIds ?? []),
    );
    let result: { commit: CommitDraft };
    try {
      result = await executor(
        { task: running, expectedCaseRevision: caseRevision },
        {
          adapter,
          trace: deps.trace,
          store: deps.store,
          tools,
          newEvidenceId: deps.newEvidenceId,
          ...(deps.newRecordId ? { newRecordId: deps.newRecordId } : {}),
          committedEvidence: committedEvidence.filter((e) => fromDependencies.has(e.id)),
          committedHypotheses: committedHypotheses.filter((h) => fromDependencies.has(h.id)),
          committedInterventions: committedInterventions.filter((r) => fromDependencies.has(r.id)),
          now: deps.now,
          signal: controller.signal,
        },
      );
    } catch {
      await close(running, "failed", "executor_error");
      return;
    }
    if (spend.exhausted) halt.reason ??= "budget_exhausted";
    const outcome = await commit(result.commit);
    const after = result.commit.upserts[0];
    if (outcome.status === "stale" || after?.recordType !== "Task") {
      tasks.set(task.id, { ...running, status: "failed", failureCode: "stale_inputs" });
      return;
    }
    tasks.set(task.id, after);
    for (const record of result.commit.upserts) {
      if (record.recordType === "Evidence" && record.status === "accepted")
        committedEvidence.push(record);
      if (record.recordType === "Hypothesis") committedHypotheses.push(record);
      if (record.recordType === "Intervention") committedInterventions.push(record);
    }
  };

  // Run tasks as their dependencies finish; a failed dependency fails its dependents, except the
  // brief package.
  const started = new Set<string>();
  const inFlight = new Map<string, Promise<void>>();
  for (;;) {
    const pending = [...tasks.values()].filter(
      (t) => !TERMINAL.has(t.status) && !started.has(t.id),
    );
    if (pending.length === 0 && inFlight.size === 0) break;
    for (const task of pending) {
      const depStates = task.dependsOnTaskIds.map((id) => tasks.get(id));
      if (halt.reason !== null) {
        started.add(task.id);
        inFlight.set(task.id, close(task, "cancelled", halt.reason));
        continue;
      }
      const failedDeps = depStates.filter(
        (d) => d && TERMINAL.has(d.status) && d.status !== "succeeded" && d.status !== "partial",
      );
      // The field-scoping package still completes when a task it reads fails (RL-02): it runs once
      // every dependency has ended, with the failed ones named, and cannot be ready for review.
      if (task.kind === "brief_package" && failedDeps.length > 0) {
        if (depStates.every((d) => d && TERMINAL.has(d.status))) {
          started.add(task.id);
          const named = failedDeps.flatMap((d) =>
            d
              ? [
                  `Dependency ${d.id} (${d.kind.replaceAll("_", " ")}) ended ${d.status}: ${(d.failureCode ?? d.status).replaceAll("_", " ")}.`,
                ]
              : [],
          );
          inFlight.set(
            task.id,
            runOne({ ...task, missingInputs: [...new Set([...task.missingInputs, ...named])] }),
          );
        }
        continue;
      }
      if (failedDeps.length > 0) {
        started.add(task.id);
        inFlight.set(
          task.id,
          close(
            task,
            "failed",
            "dependency_failed",
            failedDeps.map(
              (d) => `Dependency ${d?.id ?? "unknown"} ended ${d?.status ?? "unknown"}.`,
            ),
          ),
        );
        continue;
      }
      if (depStates.every((d) => d && (d.status === "succeeded" || d.status === "partial"))) {
        started.add(task.id);
        inFlight.set(task.id, runOne(task));
      }
    }
    if (inFlight.size === 0) break;
    const [id] = await Promise.race([...inFlight].map(([key, p]) => p.then(() => [key] as const)));
    inFlight.delete(id);
  }
  // Anything still open waits on a dependency that never resolved; it ends failed, never queued.
  for (const task of [...tasks.values()].filter((t) => !TERMINAL.has(t.status))) {
    await close(task, "failed", "dependency_unresolved");
  }
  return finish();
}
