import { createHash } from "node:crypto";

import type { MetaAdapter } from "../../model/adapter.ts";
import type { ReasoningEffort } from "../../model/types.ts";
import type { ToolHandler, ToolName } from "../../tools/tool.ts";
import { runTaskLoop } from "../loop.ts";
import type { LoopResult } from "../loop.ts";
import type { CommitDraft, EntityVersion, TaskRecord } from "../records.ts";
import { OUT_OF_SCOPE, OUT_OF_SCOPE_MESSAGE, scopeIssues } from "../scope.ts";
import { messages } from "../trace.ts";
import type { TraceEventDraft, TraceSink } from "../trace.ts";
import { PLAN_INSTRUCTIONS, PLAN_PROMPT_VERSION, planUserText } from "./prompt.ts";
import type { PlanSnapshot } from "./prompt.ts";
import { planOutputSchema, validatePlanProposal } from "./proposal.ts";
import type { PlanProposal, PlannableKind } from "./proposal.ts";

/**
 * Tools each planned task may use, assigned by host code from the task table in
 * docs/reference/agent-orchestration.md, within the Task.allowedTools enum of the case contracts.
 */
export const TOOLS_BY_KIND: Readonly<Record<PlannableKind, readonly ToolName[]>> = {
  source_research: ["search_sources", "read_source", "propose_evidence"],
  observation_analysis: [
    "read_dataset_manifest",
    "summarize_observations",
    "list_recipes",
    "read_recipe_result",
    "propose_evidence",
  ],
  livelihood_governance: ["search_sources", "read_source", "propose_evidence"],
  hypothesis_comparison: [
    "read_evidence",
    "compare_series",
    "read_event_record",
    "compare_events",
    "propose_hypotheses",
  ],
  intervention_feasibility: ["read_evidence", "read_source", "propose_interventions"],
  brief_package: ["read_case", "propose_package", "request_review", "propose_layout"],
};

export interface PlanModelSettings {
  model: string;
  maxOutputTokens: number;
  reasoningEffort: ReasoningEffort;
}

export const DEFAULT_PLAN_MODEL: PlanModelSettings = {
  model: "muse-spark-1.3",
  maxOutputTokens: 4_000,
  reasoningEffort: "low",
};

export interface PlanTaskInput {
  /** The plan task as stored, created when the command was accepted. */
  planTask: TaskRecord;
  expectedCaseRevision: number;
  snapshot: PlanSnapshot;
}

export interface PlanTaskDeps {
  adapter: MetaAdapter;
  trace: TraceSink;
  /** Read tools offered to the planner (read_case in P0). */
  tools: readonly ToolHandler<never>[];
  newTaskId: () => string;
  now: () => Date;
  settings?: PlanModelSettings;
  signal?: AbortSignal;
}

export interface PlanTaskResult {
  loop: LoopResult<PlanProposal>;
  commit: CommitDraft;
}

function digest(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
}

function spentMicroUsd(loop: LoopResult<PlanProposal>): number {
  let total = 0;
  for (const call of loop.calls) {
    if (call.costEstimateUsd !== null) total += Math.round(call.costEstimateUsd * 1_000_000);
  }
  return total;
}

function event(
  kind: TraceEventDraft["kind"],
  taskId: string,
  at: string,
  entityIds: string[],
  message: string,
  resultStatus: TraceEventDraft["resultStatus"],
): TraceEventDraft {
  return {
    kind,
    taskId,
    occurredAt: at,
    entityIds,
    message,
    resultStatus,
    usage: null,
    tool: null,
    validation: null,
  };
}

/** Runs the plan task: one model loop, host validation, and a commit draft. Nothing is written here. */
export async function runPlanTask(
  input: PlanTaskInput,
  deps: PlanTaskDeps,
): Promise<PlanTaskResult> {
  const settings = deps.settings ?? DEFAULT_PLAN_MODEL;
  const knownEntities = new Map(input.snapshot.records.map((r) => [r.id, r.revision]));
  const outside = scopeIssues([["$.command.text", input.snapshot.command.text]]);
  if (outside.length > 0) {
    // Refused before any model call: nothing is sent, spent or planned.
    const validation = { outcome: "rejected" as const, issues: outside };
    deps.trace.emit({
      kind: "validation.completed",
      taskId: input.planTask.id,
      occurredAt: deps.now().toISOString(),
      entityIds: [],
      message: messages.validation(validation),
      resultStatus: null,
      usage: null,
      tool: null,
      validation,
    });
    const loop: LoopResult<PlanProposal> = {
      status: "rejected",
      value: null,
      validation,
      failureCode: OUT_OF_SCOPE,
      calls: [],
      repaired: false,
      blockedInputs: [],
    };
    return { loop, commit: planCommit(input, loop, knownEntities, deps) };
  }
  const loop = await runTaskLoop({
    adapter: deps.adapter,
    request: {
      model: settings.model,
      promptVersion: PLAN_PROMPT_VERSION,
      instructions: PLAN_INSTRUCTIONS,
      output: { name: "propose_plan", schema: planOutputSchema() },
      maxOutputTokens: settings.maxOutputTokens,
      reasoningEffort: settings.reasoningEffort,
    },
    input: [{ kind: "user_text", text: planUserText(input.snapshot) }],
    tools: deps.tools,
    validate: (text) => validatePlanProposal(text, { knownEntities }),
    taskId: input.planTask.id,
    trace: deps.trace,
    now: deps.now,
    ...(deps.signal ? { signal: deps.signal } : {}),
  });
  return { loop, commit: planCommit(input, loop, knownEntities, deps) };
}

function planCommit(
  input: PlanTaskInput,
  loop: LoopResult<PlanProposal>,
  knownEntities: ReadonlyMap<string, number>,
  deps: PlanTaskDeps,
): CommitDraft {
  const at = deps.now().toISOString();
  const plan = input.planTask;
  const spent = plan.spentMicroUsd + spentMicroUsd(loop);
  const proposal = loop.status === "accepted" ? loop.value : null;

  const planned: TaskRecord[] = [];
  if (proposal) {
    const idByKey = new Map(proposal.tasks.map((t) => [t.key, deps.newTaskId()]));
    for (const task of proposal.tasks) {
      const id = idByKey.get(task.key) ?? deps.newTaskId();
      const inputVersions: EntityVersion[] = [
        ...new Map(task.inputRefs.map((ref) => [ref.entityId, ref.revision])),
      ].map(([entityId, revision]) => ({ entityId, revision }));
      planned.push({
        recordType: "Task",
        id,
        revision: 1,
        createdAt: at,
        updatedAt: at,
        caseId: plan.caseId,
        commandId: plan.commandId,
        kind: task.kind,
        question: task.question.trim(),
        status: "queued",
        dependsOnTaskIds: [...new Set(task.dependsOn)].flatMap((k) => idByKey.get(k) ?? []),
        inputVersions,
        allowedTools: [...TOOLS_BY_KIND[task.kind]],
        outputEntityIds: [],
        idempotencyKey: `task-${digest(plan.caseId, plan.commandId, task.kind, task.key, task.question)}`,
        attempt: 0,
        maxModelRounds: plan.maxModelRounds,
        deadlineAt: plan.deadlineAt,
        budgetMicroUsd: Math.max(0, plan.budgetMicroUsd - spent),
        spentMicroUsd: 0,
        checkpointId: null,
        failureCode: null,
        missingInputs: [],
        startedAt: null,
        finishedAt: null,
      });
    }
  }

  const succeeded = proposal !== null;
  const planAfter: TaskRecord = {
    ...plan,
    revision: plan.revision + 1,
    updatedAt: at,
    status: succeeded ? "succeeded" : "failed",
    outputEntityIds: planned.map((t) => t.id),
    spentMicroUsd: spent,
    failureCode: succeeded ? null : (loop.failureCode ?? "failed"),
    finishedAt: at,
  };

  const events: TraceEventDraft[] = planned.map((t) =>
    event("task.queued", t.id, at, [t.id], messages.planQueued(t.kind), null),
  );
  events.push(
    succeeded
      ? event(
          "task.succeeded",
          plan.id,
          at,
          planAfter.outputEntityIds,
          `Plan accepted with ${planned.length} ${planned.length === 1 ? "task" : "tasks"}.`,
          "succeeded",
        )
      : event(
          "task.failed",
          plan.id,
          at,
          [],
          planAfter.failureCode === OUT_OF_SCOPE
            ? OUT_OF_SCOPE_MESSAGE
            : `Plan failed: ${planAfter.failureCode ?? "failed"}.`,
          "failed",
        ),
  );

  return {
    caseId: plan.caseId,
    commandId: plan.commandId,
    taskId: plan.id,
    expectedCaseRevision: input.expectedCaseRevision,
    idempotencyKey: `commit-${digest(plan.caseId, plan.commandId, plan.id, String(plan.revision))}`,
    inputVersions: [...knownEntities].map(([entityId, revision]) => ({ entityId, revision })),
    upserts: [planAfter, ...planned],
    events,
  };
}
