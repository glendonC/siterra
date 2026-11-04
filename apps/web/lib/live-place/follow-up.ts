// What a question typed in the Ask adds to the case (POST /api/cases/:id/commands/:commandId/complete), as one commit
// through applyCommit: its own Task and the task's events, with the model call as its transport reported it. The
// question is answered from the case's own findings (lib/ask/findings.ts): the model only picks which of them answer
// it, by id (lib/ask/select.ts), and the task records the records those findings are built from, in the answer's
// order, as the records its answer rests on (Task.inputVersions). It writes no Source, Evidence, ExplanationBranch,
// BranchMerge or Brief and leaves the case's current brief where it is (CMP-23); no word the model writes is recorded
// anywhere, and event messages are host templates, never model text (data-contracts.md, events).

import { createHash } from "node:crypto";
import {
  type EntityVersion,
  type EnvironmentalCase,
  type ModelUsage,
  type Task,
  caseSchemaVersion,
} from "@siterra/contracts";
import type { CommitProposal, EventDraft } from "@siterra/db";
import { askTaskId } from "../ask/task.ts";

export type FollowUpStatus = "succeeded" | "failed" | "cancelled";

/** Six hex digits of the command ID's SHA-256: the suffix of the follow-up task's ID. */
export function commandHash(commandId: string): string {
  return createHash("sha256").update(commandId).digest("hex").slice(0, 6);
}

/** The follow-up's one task: its events and its Task record name it (lib/ask/task.ts). */
export function followUpTaskId(hash: string): string {
  return askTaskId(hash);
}

/** Each entity version once, in first-seen order. */
function uniqueVersions(versions: readonly EntityVersion[]): EntityVersion[] {
  return [...new Map(versions.map((v) => [`${v.entityId}@${String(v.revision)}`, v])).values()];
}

/** What the model call's transport reported: its HTTP status, or the error that ended it before any response. */
export interface TransportReport {
  httpStatus: number | null;
  /** The name of the error the call ended with (AbortError for the call's own timeout). */
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
  /** Whether a reply came back that passed the checks. */
  answered: boolean;
  transport: TransportReport;
}

const reached = (t: TransportReport): boolean =>
  t.httpStatus !== null && t.httpStatus >= 200 && t.httpStatus <= 299;

/**
 * Why a call gave no usable answer, as a failure code the interface reads (lib/overview/ask-line.ts failedLine): its
 * HTTP status (http_503), a timeout or no response at all, or a reply that is not the object asked for.
 */
export function noAnswerCode(transport: TransportReport): string {
  if (transport.error === "AbortError" || transport.error === "TimeoutError")
    return "model_timeout";
  if (transport.httpStatus === null) return "model_unreachable";
  if (!reached(transport)) return `http_${String(transport.httpStatus)}`;
  return "reply_unreadable";
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
  /** The records the chosen findings are built from, at the revisions read, in the answer's order. */
  chosen: readonly EntityVersion[];
}

/**
 * The follow-up's task, with its outcome: it read the case and its evidence, and its answer rests on the records it
 * names in the answer's order (inputVersions). It writes no record (outputEntityIds is empty) and names no record an
 * earlier command wrote as its own, so nothing of theirs is credited to it.
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
    inputVersions: uniqueVersions(input.chosen),
    allowedTools: ["read_case", "read_evidence"],
    outputEntityIds: [],
    idempotencyKey: `ask-task-${input.hash}`,
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
  startedAt: string;
  now: string;
  status: FollowUpStatus;
  failureCode: string | null;
  /** The model call, when the task got as far as making one. */
  call: ModelCall | null;
  /** How many of the case's findings the answer rests on. */
  chosen: number;
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
  return input.chosen > 0
    ? `Source research task chose ${counted(input.chosen, "finding", "findings")} of the case.`
    : "Source research task found no finding of the case that answers the question.";
}

/**
 * The follow-up's events for its commit, from host templates: the task's start and its model call (when it got that
 * far), the commit of its task, and the task's end.
 */
export function followUpEvents(input: FollowUpEventsInput): EventDraft[] {
  const { commandId, taskId, placeName, call } = input;
  const quiet = { commandId, tool: null, validation: null, spanId: null, parentSpanId: null };
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
        message: `Reading the case's findings for ${placeName}.`,
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
      entityIds: [taskId],
      message: `Committed the question's task for ${placeName}.`,
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
