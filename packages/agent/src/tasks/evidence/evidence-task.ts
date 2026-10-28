import { createHash } from "node:crypto";

import type { MetaAdapter } from "../../model/adapter.ts";
import type { CaseStore } from "../../tools/store.ts";
import type { ToolRegistry } from "../../tools/registry.ts";
import { runTaskLoop } from "../loop.ts";
import type { LoopResult } from "../loop.ts";
import type {
  ClaimKind,
  CommitDraft,
  EntityVersion,
  EvidenceRecord,
  TaskRecord,
} from "../records.ts";
import type { TraceEventDraft, TraceSink } from "../trace.ts";
import { evidenceOutputSchema, validateEvidenceProposal } from "./proposal.ts";
import type { AcceptedItem } from "./proposal.ts";

// The shared runner for tasks whose result is propose_evidence: observation_analysis,
// source_research and livelihood_governance. A spec names the prompt, the claim kinds and the
// task's first message; tools come from Task.allowedTools; validation and records are the same.

export interface EvidenceTaskSpec {
  kind: TaskRecord["kind"];
  promptVersion: string;
  instructions: string;
  claimKinds: ReadonlySet<ClaimKind>;
  firstMessage: (task: TaskRecord, store: CaseStore) => string | Promise<string>;
}

export interface EvidenceTaskInput {
  task: TaskRecord;
  expectedCaseRevision: number;
}

export interface EvidenceTaskDeps {
  adapter: MetaAdapter;
  trace: TraceSink;
  store: CaseStore;
  tools: ToolRegistry;
  newEvidenceId: () => string;
  /** IDs for other records a task writes (hyp_, int_ and the like); falls back to newEvidenceId's suffix. */
  newRecordId?: (prefix: string) => string;
  /** Accepted evidence committed earlier in this command, which the job-start store does not hold. */
  committedEvidence?: readonly EvidenceRecord[];
  now: () => Date;
  model?: string;
  signal?: AbortSignal;
}

export interface EvidenceTaskResult {
  loop: LoopResult<AcceptedItem[]>;
  commit: CommitDraft;
}

export const TRANSLATION_LABEL = "Machine-drafted translation";

function uncertaintyText(accepted: AcceptedItem): string {
  const { measurements, source } = accepted;
  if (source) return "Published context; uncertainty is as stated in the source.";
  if (measurements.length === 0) return "No measurement cited; not quantified.";
  if (measurements.every((m) => m.uncertainty.kind === "spatial_iqr")) {
    return "Spatial IQR across pixels is shown with each value; it is variability, not a confidence interval.";
  }
  return "Not quantified.";
}

/** The translation label of agent-orchestration.md#source-reading, as a limitation line. */
function languageLimitation(language: string | null): string[] {
  if (language === null) {
    return [
      `Source language not recorded; if the source is not in English, this statement is a ${TRANSLATION_LABEL.toLowerCase()}.`,
    ];
  }
  return /^en(?:-|$)/i.test(language)
    ? []
    : [`${TRANSLATION_LABEL} from ${language}; the original excerpt is shown.`];
}

function evidenceRecord(
  accepted: AcceptedItem,
  task: TaskRecord,
  id: string,
  at: string,
): EvidenceRecord {
  const { item, measurements, bundles, source } = accepted;
  const inputVersions: EntityVersion[] = [
    ...measurements.map((m) => ({ entityId: m.id, revision: m.revision })),
    ...bundles.map((b) => ({ entityId: b.id, revision: b.revision })),
    ...(source ? [{ entityId: source.id, revision: source.revision }] : []),
  ];
  const method = bundles.length === 1 ? bundles[0] : undefined;
  const languageNote = source === null ? [] : languageLimitation(source.language);
  const limitations = [
    ...new Set([
      ...languageNote,
      ...bundles.flatMap((b) => b.provenance.limitations),
      ...item.limitations.map((l) => l.trim()).filter((l) => l !== ""),
      ...(item.scopeNote.trim() === "" ? [] : [item.scopeNote.trim()]),
    ]),
  ];
  let verification: EvidenceRecord["provenance"]["verificationStatus"] = "unverified";
  if (source) verification = "source_checked";
  else if (measurements.length > 0) verification = "computed_checked";
  return {
    recordType: "Evidence",
    id,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId: task.caseId,
    statement: item.statement,
    claimKind: item.claimKind,
    status: "accepted",
    geoSelectionId: measurements[0]?.geoSelectionId ?? null,
    periodIds: [...new Set(measurements.map((m) => m.periodId))].sort(),
    measurementIds: measurements.map((m) => m.id),
    provenance: {
      sourceLocators:
        source && item.locator !== null
          ? [{ sourceId: source.id, locator: item.locator, excerpt: item.excerpt }]
          : [],
      dataBundleIds: bundles.map((b) => b.id),
      methodId: method?.methodId ?? null,
      methodVersion: method?.methodVersion ?? null,
      inputVersions,
      generatedByTaskId: task.id,
      generatedAt: at,
      verificationStatus: verification,
      limitations,
    },
    interpretation: null,
    uncertainty: uncertaintyText(accepted),
    reviewDecisionIds: [],
  };
}

const KIND_WORDS: Partial<Record<TaskRecord["kind"], string>> = {
  observation_analysis: "Observation task",
  source_research: "Source research task",
  livelihood_governance: "Livelihood and governance task",
};

export async function runEvidenceTask(
  spec: EvidenceTaskSpec,
  input: EvidenceTaskInput,
  deps: EvidenceTaskDeps,
): Promise<EvidenceTaskResult> {
  const { task } = input;
  if (task.kind !== spec.kind) throw new Error(`task ${task.id} is ${task.kind}, not ${spec.kind}`);
  const loop = await runTaskLoop({
    adapter: deps.adapter,
    request: {
      model: deps.model ?? "muse-spark-1.3",
      promptVersion: spec.promptVersion,
      instructions: spec.instructions,
      output: { name: "propose_evidence", schema: evidenceOutputSchema() },
      maxOutputTokens: 4_000,
      reasoningEffort: "low",
    },
    input: [{ kind: "user_text", text: await spec.firstMessage(task, deps.store) }],
    tools: deps.tools.forTask(task.allowedTools),
    validate: (text) =>
      validateEvidenceProposal(text, {
        caseId: task.caseId,
        store: deps.store,
        allowedClaimKinds: spec.claimKinds,
      }),
    taskId: task.id,
    trace: deps.trace,
    now: deps.now,
    maxRounds: task.maxModelRounds,
    ...(deps.signal ? { signal: deps.signal } : {}),
  });

  const at = deps.now().toISOString();
  const evidence = (loop.status === "accepted" ? (loop.value ?? []) : []).map((a) =>
    evidenceRecord(a, task, deps.newEvidenceId(), at),
  );
  const partial = evidence.length > 0 && loop.validation?.outcome === "partial";
  const status: TaskRecord["status"] =
    evidence.length === 0 ? "failed" : partial ? "partial" : "succeeded";
  let spent = task.spentMicroUsd;
  for (const call of loop.calls) {
    if (call.costEstimateUsd !== null) spent += Math.round(call.costEstimateUsd * 1_000_000);
  }
  const taskAfter: TaskRecord = {
    ...task,
    revision: task.revision + 1,
    updatedAt: at,
    status,
    outputEntityIds: evidence.map((e) => e.id),
    spentMicroUsd: spent,
    failureCode: status === "failed" ? (loop.failureCode ?? "no_valid_items") : null,
    finishedAt: at,
  };
  const kind: TraceEventDraft["kind"] =
    status === "succeeded"
      ? "task.succeeded"
      : status === "partial"
        ? "task.partial"
        : "task.failed";
  const resultStatus =
    status === "succeeded" ? "succeeded" : status === "partial" ? "partial" : "failed";
  const name = KIND_WORDS[task.kind] ?? "Task";
  const rejected = loop.validation?.issues.length ?? 0;
  const message =
    status === "failed"
      ? `${name} failed: ${taskAfter.failureCode ?? "failed"}.`
      : `${name} accepted ${evidence.length} ${evidence.length === 1 ? "item" : "items"}` +
        (partial ? `; ${rejected} ${rejected === 1 ? "issue" : "issues"} rejected the rest.` : ".");

  return {
    loop,
    commit: {
      caseId: task.caseId,
      commandId: task.commandId,
      taskId: task.id,
      expectedCaseRevision: input.expectedCaseRevision,
      idempotencyKey: `commit-${createHash("sha256")
        .update([task.caseId, task.commandId, task.id, String(task.revision)].join("\u0000"))
        .digest("hex")
        .slice(0, 32)}`,
      inputVersions: task.inputVersions,
      upserts: [taskAfter, ...evidence],
      events: [
        {
          kind,
          taskId: task.id,
          occurredAt: at,
          entityIds: taskAfter.outputEntityIds,
          message,
          resultStatus,
          usage: null,
          tool: null,
          validation: null,
        },
      ],
    },
  };
}
