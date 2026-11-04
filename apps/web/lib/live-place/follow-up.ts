// What a follow-up question adds to the case (POST /api/cases/:id/commands/:commandId/complete), as one commit through
// applyCommit: its own source research Task, the Sources it retrieved and the Evidence they gave, and the task's
// events, with the model call as its transport reported it. A follow-up runs no merge@2 scoring, so it writes no
// ExplanationBranch, BranchMerge or Brief and leaves the case's current brief where it is (CMP-23). The model's prose is
// never kept as a finding (CMP-05): a statement is accepted only when it is quoted word for word from an excerpt found
// verbatim in its source's notes, any other statement is kept provisional and unverified, a statement holding a
// number its excerpt lacks is not kept at all, and no interpretation is kept. The model's causes and summary are
// recorded nowhere: event messages are host templates, never model text (data-contracts.md, events).

import { createHash } from "node:crypto";
import {
  type EntityVersion,
  type EnvironmentalCase,
  Evidence,
  type ModelUsage,
  type Source,
  type Task,
  caseSchemaVersion,
} from "@siterra/contracts";
import type { CommitProposal, EventDraft } from "@siterra/db";
import { unprovenNumbers } from "@siterra/domain/validators";
import type { LlmVerifiedFinding } from "./llm-schema-and-prompt.ts";
import { isVerbatimQuoteInSource, normalizeForQuoteCheck } from "./llm-verifier.ts";

export type FollowUpStatus = "succeeded" | "failed" | "cancelled";

/** Six hex digits of the command ID's SHA-256: the suffix of every ID the follow-up writes. */
export function commandHash(commandId: string): string {
  return createHash("sha256").update(commandId).digest("hex").slice(0, 6);
}

/** The follow-up's one task: its events, its Task record and the provenance of its Evidence all name it. */
export function followUpTaskId(hash: string): string {
  return `task_cmd_${hash}`;
}

/** Each entity version once, in first-seen order. */
function uniqueVersions(versions: readonly EntityVersion[]): EntityVersion[] {
  return [...new Map(versions.map((v) => [`${v.entityId}@${String(v.revision)}`, v])).values()];
}

/** Whether the statement is quoted word for word from the excerpt (case, quotes and spacing aside). */
function quotedFrom(statement: string, excerpt: string): boolean {
  const said = normalizeForQuoteCheck(statement)
    .replace(/[.,;:!?]+$/, "")
    .trim();
  return said.length >= 12 && normalizeForQuoteCheck(excerpt).includes(said);
}

/**
 * The numbers in a statement that its excerpt does not hold (numeric provenance against that one excerpt). A hyphen
 * between digits splits them, so a date such as 2023-04 is held to the excerpt like any other number.
 */
export function numbersNotInExcerpt(statement: string, excerpt: string): string[] {
  const split = (text: string): string => text.replace(/(\d)-(?=\d)/g, "$1 ");
  return unprovenNumbers(split(statement), [], [split(excerpt)], null);
}

const QUOTED = "Quoted word for word from an excerpt found verbatim in the source's stored notes.";
const PARAPHRASED =
  "The model's paraphrase of an excerpt found verbatim in the source's stored notes; the statement itself is not checked.";

export interface FindingContext {
  caseId: string;
  geoSelectionId: string;
  taskId: string;
  hash: string;
  now: string;
}

/**
 * The Evidence a follow-up keeps from the model's findings, each citing its source at the revision the model read. A
 * finding is dropped when its source is not one the model was given, when its excerpt is not verbatim in that
 * source's notes, or when its statement holds a number the excerpt lacks. A statement quoted word for word from the
 * excerpt is accepted as checked against the source; any other is the model's paraphrase, kept provisional and
 * unverified. The model's interpretation is not kept.
 */
export function verifiedFindingEvidence(
  findings: readonly LlmVerifiedFinding[],
  sources: readonly Source[],
  ctx: FindingContext,
): Evidence[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  return findings.flatMap((vf, i) => {
    const source = byId.get(vf.sourceId);
    const excerpt = Array.from(vf.exactQuote.trim()).slice(0, 260).join("");
    if (source === undefined || !isVerbatimQuoteInSource(excerpt, source)) return [];
    if (numbersNotInExcerpt(vf.statement, excerpt).length > 0) return [];
    const quoted = quotedFrom(vf.statement, excerpt);
    const parsed = Evidence.safeParse({
      recordType: "Evidence",
      id: `ev_llm_${ctx.hash}_${String(i + 1)}`,
      revision: 1,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      caseId: ctx.caseId,
      statement: vf.statement,
      claimKind: "scientific_context",
      status: quoted ? "accepted" : "provisional",
      geoSelectionId: ctx.geoSelectionId,
      periodIds: [],
      measurementIds: [],
      provenance: {
        sourceLocators: [{ sourceId: source.id, locator: "verified excerpt", excerpt }],
        dataBundleIds: [],
        methodId: null,
        methodVersion: null,
        inputVersions: [{ entityId: source.id, revision: source.revision }],
        generatedByTaskId: ctx.taskId,
        generatedAt: ctx.now,
        verificationStatus: quoted ? "source_checked" : "unverified",
        limitations: [quoted ? QUOTED : PARAPHRASED],
      },
      interpretation: null,
      uncertainty:
        "Published literature or regulatory excerpt; field verification required for site-level decisions.",
      reviewDecisionIds: [],
    });
    return parsed.success ? [parsed.data] : [];
  });
}

/** What the model call's transport reported: its HTTP status, or the error that ended it before any response. */
export interface TransportReport {
  httpStatus: number | null;
  /** The name of the error the call ended with (AbortError for the reasoner's own timeout). */
  error: string | null;
}

/** A fetch that passes each call through unchanged and remembers what the transport reported for it. */
export function observedFetch(base: typeof globalThis.fetch): {
  fetch: typeof globalThis.fetch;
  report: () => TransportReport;
} {
  let report: TransportReport = { httpStatus: null, error: null };
  return {
    fetch: async (input, init) => {
      try {
        const response = await base(input, init);
        report = { httpStatus: response.status, error: null };
        return response;
      } catch (error) {
        report = { httpStatus: null, error: error instanceof Error ? error.name : "Error" };
        throw error;
      }
    },
    report: () => report,
  };
}

/** The model call as the follow-up records it: what the transport reported, never a price it did not report. */
export interface ModelCall {
  model: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  /** Whether an answer came back that passed the reasoner's checks. */
  answered: boolean;
  transport: TransportReport;
}

const reached = (t: TransportReport): boolean =>
  t.httpStatus !== null && t.httpStatus >= 200 && t.httpStatus <= 299;

/**
 * Why a call gave no usable answer, as a failure code the interface reads (lib/card/work.ts failureCause): its HTTP
 * status (http_503), a timeout or no response at all, or a response whose answer did not pass the checks.
 */
export function noAnswerCode(transport: TransportReport): string {
  if (transport.error === "AbortError" || transport.error === "TimeoutError")
    return "model_timeout";
  if (transport.httpStatus === null) return "model_unreachable";
  if (!reached(transport)) return `http_${String(transport.httpStatus)}`;
  return "validation_rejected";
}

/**
 * The call's usage as its transport reported it. Tokens, price and request ID are not reported, so they are null,
 * never zero: the instance spend count prices an answered call it cannot price as an unpriced live call.
 */
function usageOf(call: ModelCall, status: ModelUsage["status"]): ModelUsage {
  return {
    provider: "meta_model_api",
    model: call.model,
    requestId: null,
    status,
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: null,
    estimatedCostMicroUsd: null,
    durationMs: status === "started" ? null : call.durationMs,
    reasoningTokens: null,
    webSearchCalls: null,
  };
}

export interface FollowUpTaskInput {
  caseId: string;
  commandId: string;
  /** The command's own words. */
  question: string;
  taskId: string;
  hash: string;
  startedAt: string;
  now: string;
  status: FollowUpStatus;
  failureCode: string | null;
  /** The Evidence this follow-up wrote. */
  evidenceIds: readonly string[];
  /** The case records that Evidence rests on, at the revisions the follow-up read. */
  inputVersions: readonly EntityVersion[];
}

/**
 * The source research the follow-up ran, with its outcome. It names no record an earlier command wrote (no brief,
 * action, branch or merge), so nothing of theirs is credited to it.
 */
export function followUpTask(input: FollowUpTaskInput): Task {
  return {
    recordType: "Task",
    id: input.taskId,
    revision: 1,
    createdAt: input.startedAt,
    updatedAt: input.now,
    caseId: input.caseId,
    commandId: input.commandId,
    kind: "source_research",
    question: input.question,
    status: input.status,
    dependsOnTaskIds: [],
    inputVersions: uniqueVersions(input.inputVersions),
    allowedTools: ["search_sources", "read_source", "propose_evidence"],
    outputEntityIds: [...new Set(input.evidenceIds)],
    idempotencyKey: `source-task-${input.hash}`,
    attempt: 0,
    maxModelRounds: 1,
    deadlineAt: input.now,
    budgetMicroUsd: 0,
    spentMicroUsd: 0,
    checkpointId: null,
    failureCode: input.failureCode,
    missingInputs: [],
    startedAt: input.startedAt,
    finishedAt: input.now,
  };
}

export interface FollowUpEventsInput {
  commandId: string;
  taskId: string;
  placeName: string;
  liveSearch: boolean;
  startedAt: string;
  now: string;
  status: FollowUpStatus;
  failureCode: string | null;
  /** The model call, when the task got as far as making one. */
  call: ModelCall | null;
  /** The Sources and Evidence this follow-up wrote, the Evidence by whether it was accepted. */
  sourceIds: readonly string[];
  acceptedIds: readonly string[];
  provisionalIds: readonly string[];
}

const counted = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;

const END = {
  succeeded: "task.succeeded",
  failed: "task.failed",
  cancelled: "task.cancelled",
} as const;

function endMessage(input: FollowUpEventsInput): string {
  if (input.status === "failed")
    return `Source research task failed: ${input.failureCode ?? "failed"}.`;
  if (input.status === "cancelled") return "Source research task cancelled.";
  const provisional = input.provisionalIds.length;
  return (
    `Source research task accepted ${counted(input.acceptedIds.length, "item", "items")}` +
    (provisional > 0
      ? ` and kept ${counted(provisional, "paraphrase", "paraphrases")} as provisional.`
      : ".")
  );
}

/**
 * The follow-up's events for its commit, from host templates: the task's start and its model call (when it got that
 * far), the records it committed (its own Sources, Evidence and Task, nothing else) and the task's end.
 */
export function followUpEvents(input: FollowUpEventsInput): EventDraft[] {
  const { commandId, taskId, placeName, call } = input;
  const quiet = { commandId, tool: null, validation: null, spanId: null, parentSpanId: null };
  const sources = [...new Set(input.sourceIds)];
  const evidence = [...new Set([...input.acceptedIds, ...input.provisionalIds])];
  const events: EventDraft[] = [];
  if (call !== null) {
    const callStatus = call.answered || reached(call.transport) ? "succeeded" : "failed";
    const code = callStatus === "failed" ? noAnswerCode(call.transport) : null;
    events.push(
      {
        ...quiet,
        occurredAt: input.startedAt,
        kind: "task.started",
        taskId,
        entityIds: [taskId],
        message: input.liveSearch
          ? `Retrieving live literature, regulatory notices and governance context for ${placeName}.`
          : `Reading the case's stored sources for ${placeName}.`,
        dedupeKey: `task.started:${taskId}`,
        resultStatus: null,
        usage: null,
      },
      {
        ...quiet,
        occurredAt: call.startedAt,
        kind: "model.started",
        taskId,
        entityIds: [taskId],
        message: `Model call to ${call.model} (Model API) started.`,
        dedupeKey: `model.started:${taskId}`,
        resultStatus: null,
        usage: usageOf(call, "started"),
      },
      {
        ...quiet,
        occurredAt: call.endedAt,
        kind: "model.completed",
        taskId,
        entityIds: [taskId],
        message: `Model call to ${call.model} (Model API) ${code === null ? "finished." : `failed with ${code}.`}`,
        dedupeKey: `model.completed:${taskId}`,
        resultStatus: null,
        usage: usageOf(call, callStatus),
      },
    );
  }
  events.push(
    {
      ...quiet,
      occurredAt: input.now,
      kind: "case.committed",
      taskId,
      entityIds: [...sources, ...evidence, taskId],
      message: `Committed ${counted(sources.length, "source", "sources")} and ${counted(evidence.length, "evidence record", "evidence records")} for ${placeName}.`,
      dedupeKey: `case.committed:${commandId}`,
      resultStatus: null,
      usage: null,
    },
    {
      ...quiet,
      occurredAt: input.now,
      kind: END[input.status],
      taskId,
      entityIds: [taskId],
      message: endMessage(input),
      dedupeKey: `${END[input.status]}:${taskId}`,
      resultStatus: input.status,
      usage: null,
    },
  );
  return events;
}

// The worker's words for a command's end (packages/agent/src/tasks/event-drafts.ts), so both routes read alike.
const COMMAND_WORDS: Record<FollowUpStatus, string> = {
  succeeded: "Command completed.",
  failed: "Command failed; the tasks list why.",
  cancelled: "Command cancelled.",
};

/** The command.completed event, appended once the command's status is stored, as the worker does. */
export function commandCompletedEvent(
  commandId: string,
  status: FollowUpStatus,
  taskIds: readonly string[],
  now: string,
): EventDraft {
  return {
    occurredAt: now,
    kind: "command.completed",
    commandId,
    taskId: null,
    entityIds: [commandId, ...taskIds],
    message: COMMAND_WORDS[status],
    dedupeKey: `command.completed:${commandId}`,
    resultStatus: status,
    tool: null,
    usage: null,
    validation: null,
    spanId: null,
    parentSpanId: null,
  };
}

export interface FollowUpCommitInput {
  /** The commit's own ID. */
  id: string;
  /** The case as the follow-up read it. */
  caseRecord: EnvironmentalCase;
  commandId: string;
  taskId: string;
  now: string;
  inputVersions: readonly EntityVersion[];
  upserts: CommitProposal["upserts"];
  events: EventDraft[];
}

/**
 * The follow-up's commit, expected at the case revision it read. applyCommit rebases it onto a newer revision when
 * its inputs are unchanged and refuses it as stale when one changed, so it never writes an older revision; it keeps
 * the case's own fields as the newer revision has them.
 */
export function followUpCommit(input: FollowUpCommitInput): CommitProposal {
  const expected = input.caseRecord.revision;
  return {
    recordType: "Commit",
    schemaVersion: caseSchemaVersion,
    id: input.id,
    caseId: input.caseRecord.id,
    commandId: input.commandId,
    taskId: input.taskId,
    expectedCaseRevision: expected,
    newCaseRevision: expected + 1,
    idempotencyKey: `follow-up-${input.taskId}`,
    inputVersions: uniqueVersions(input.inputVersions),
    caseAfter: { ...input.caseRecord, revision: expected + 1, updatedAt: input.now },
    upserts: input.upserts,
    layoutActions: [],
    events: input.events,
    resultKey: null,
  };
}
