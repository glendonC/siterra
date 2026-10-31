// A question's run as specimen R shows it (U29): what the command's own events and records say at this moment,
// in R's terms. Every time is milliseconds after the command was accepted; every word comes from the case's
// records or the event log through the app's own rules (task names, model names, verification words); nothing is
// computed for show. Events the page has not been given yet do not exist here, so a paced replay unfolds in order.

import type { CaseSnapshot, Event } from "@siterra/contracts";
import { modelName } from "../activity/activity";
import type { MessageId } from "../copy/en";
import { commandFindings, commandMerge, sourceKey, verificationOf } from "../overview/results";

export type RunTaskState = "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";

export interface RunTask {
  id: string;
  kind: string;
  state: RunTaskState;
  /** The model the task called (its display name), once it has called one. */
  model: string | null;
  /** Model calls finished, and running now. */
  calls: number;
  running: number;
  /** Tool calls finished, and how many of them failed. */
  tools: number;
  failedTools: number;
  queuedMs: number;
  startMs: number | null;
  endMs: number | null;
}

export type Landing = "land" | "source" | "unchecked";

export interface RunFinding {
  id: string;
  taskId: string | null;
  /** When the event that accepted it arrived. */
  ms: number;
  word: MessageId;
  lands: Landing;
  /** The Source it gathers by, for a finding checked against one. */
  sourceId: string | null;
}

export interface RunBranch {
  id: string;
  label: string;
  predictions: number;
  /** When its predictions were written (the event that named the branch). */
  sealedMs: number;
  /** Its score and reason once the merge is committed. */
  status: "contradicted" | "consistent" | "cannot_be_assessed" | null;
  reason: string | null;
}

export interface RunModel {
  commandId: string;
  /** Wall time of the command's acceptance. */
  acceptedAt: string | null;
  /** The last event's time; the run's length once it completed. */
  nowMs: number;
  done: boolean;
  /** Replayed runs say so: "recorded" outputs of a real run, or a "synthetic" replay; null for a live run. */
  replay: "recorded" | "synthetic" | null;
  /** Whether any event has said where the run comes from yet (its usage names the provider): until then `replay`
   * being null does not mean live. */
  sourceKnown: boolean;
  tasks: RunTask[];
  findings: RunFinding[];
  branches: RunBranch[];
  merge: {
    ms: number;
    counts: Record<"contradicted" | "consistent" | "cannot_be_assessed", number>;
  } | null;
  /** The field plan's proposed checks, once the merge carries one. */
  checks: { label: string; ms: number }[];
}

const END: Partial<Record<Event["kind"], RunTaskState>> = {
  "task.succeeded": "succeeded",
  "task.partial": "partial",
  "task.failed": "failed",
  "task.cancelled": "cancelled",
};

/** The run of `commandId` from the events given so far and the case's records. */
export function runModel(
  snapshot: CaseSnapshot,
  events: readonly Event[],
  commandId: string,
): RunModel {
  const own = events.filter((e) => e.commandId === commandId);
  const accepted = own.find((e) => e.kind === "command.accepted");
  const t0 = Date.parse(accepted?.occurredAt ?? own[0]?.occurredAt ?? "");
  const ms = (e: Event) => Math.max(0, Date.parse(e.occurredAt) - t0);
  // when each record first appeared in an event
  const seen = new Map<string, number>();
  for (const e of own) for (const id of e.entityIds) if (!seen.has(id)) seen.set(id, ms(e));

  const tasks = new Map<string, RunTask>();
  const task = (e: Event): RunTask | null => {
    if (!e.taskId) return null;
    let t = tasks.get(e.taskId);
    if (!t) {
      const rec = snapshot.records.taskRecords.find((x) => x.id === e.taskId);
      t = {
        id: e.taskId,
        kind: rec?.kind ?? "plan",
        state: "queued",
        model: null,
        calls: 0,
        running: 0,
        tools: 0,
        failedTools: 0,
        queuedMs: ms(e),
        startMs: null,
        endMs: null,
      };
      tasks.set(e.taskId, t);
    }
    return t;
  };
  let replay: RunModel["replay"] = null;
  let sourceKnown = false;
  for (const e of own) {
    const t = task(e);
    if (e.usage) sourceKnown = true;
    if (e.usage?.provider === "replay") replay = e.usage.replayOrigin ?? "synthetic";
    if (!t) continue;
    const start = () => {
      if (t.startMs === null) {
        t.startMs = ms(e);
        t.state = "running";
      }
    };
    switch (e.kind) {
      case "task.started":
        start();
        break;
      case "model.started":
        // a task that never says it started (the plan) starts with its first call
        start();
        t.running += 1;
        if (e.usage) t.model = modelName(e.usage.model);
        break;
      case "model.completed":
        t.running = Math.max(0, t.running - 1);
        t.calls += 1;
        if (e.usage) t.model = modelName(e.usage.model);
        break;
      case "tool.completed":
        t.tools += 1;
        if (e.tool && e.tool.status !== "succeeded") t.failedTools += 1;
        break;
      default: {
        const end = END[e.kind];
        if (end) {
          start();
          t.state = end;
          t.endMs = ms(e);
          t.running = 0;
        }
      }
    }
  }

  const active = snapshot.case.activeGeoSelectionId;
  const findings: RunFinding[] = commandFindings(snapshot, commandId).flatMap((ev) => {
    const at = seen.get(ev.id);
    if (at === undefined) return [];
    const status = ev.provenance.verificationStatus;
    const lands: Landing =
      status === "computed_checked" && ev.geoSelectionId === active
        ? "land"
        : status === "source_checked"
          ? "source"
          : "unchecked";
    return [
      {
        id: ev.id,
        taskId: ev.provenance.generatedByTaskId ?? null,
        ms: at,
        word: verificationOf(ev),
        lands,
        sourceId: lands === "source" ? sourceKey(ev) : null,
      },
    ];
  });

  const merge = commandMerge(snapshot, commandId);
  const mergeMs = merge ? seen.get(merge.id) : undefined;
  const scored = mergeMs !== undefined ? merge : undefined;
  const branches: RunBranch[] = (snapshot.records.explanationBranchRecords ?? [])
    .filter((b) => b.commandId === commandId)
    .flatMap((b) => {
      const at = seen.get(b.id);
      if (at === undefined) return [];
      const s = scored?.branches.find((x) => x.branchId === b.id);
      return [
        {
          id: b.id,
          label: b.label,
          predictions: b.predictions.length,
          sealedMs: at,
          status: s?.status ?? null,
          reason: s?.reason ?? null,
        },
      ];
    });
  const counts = { contradicted: 0, consistent: 0, cannot_be_assessed: 0 };
  for (const b of scored?.branches ?? []) counts[b.status] += 1;

  const last = own.at(-1);
  return {
    commandId,
    acceptedAt: accepted?.occurredAt ?? null,
    nowMs: last ? ms(last) : 0,
    done: own.some((e) => e.kind === "command.completed"),
    replay,
    sourceKnown,
    tasks: [...tasks.values()],
    findings,
    branches,
    merge: scored && mergeMs !== undefined ? { ms: mergeMs, counts } : null,
    checks:
      scored && mergeMs !== undefined
        ? (scored.fieldPlan?.measurements ?? []).map((m) => ({ label: m.label, ms: mergeMs }))
        : [],
  };
}
