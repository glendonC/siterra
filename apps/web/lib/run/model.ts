// A question's run model: what the command's own events and records say at this moment.
// Every time is milliseconds after the command was accepted; every word comes from the case's
// records or the event log through the app's own rules (task names, model names, verification words); nothing is
// computed for show. Events the page has not been given yet do not exist here, so a paced replay unfolds in order.

import {
  resolveToolCallTarget,
  type CaseSnapshot,
  type Event,
  type ToolCallInfo,
  type ToolCallTarget,
} from "@siterra/contracts";
import { modelName } from "../activity/activity";
import { en, format, type MessageId } from "../copy/en";
import {
  commandFindings,
  commandMerge,
  readableStatement,
  shortCitation,
  sourceKey,
  verificationOf,
} from "../overview/results";

export type RunTaskState = "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";

export interface RunTaskStep {
  id: string;
  ms: number;
  status: "running" | "succeeded" | "failed";
  label: string;
  target: ToolCallTarget | null;
}

export interface RunTask {
  id: string;
  kind: string;
  state: RunTaskState;
  /** Concise scope descriptor derived from the task's inputs (e.g. "NDVI & trend recipes" vs "Terrain & rainfall"). */
  sublabel?: string | null;
  /** Parent task IDs this task depends on in the orchestration DAG. */
  dependsOnTaskIds?: readonly string[];
  /** Human-readable bundle labels assigned to this task. */
  bundleLabels?: readonly string[];
  /** Human-readable source citations assigned to this task. */
  sourceCitations?: readonly string[];
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
  /** Stored usage cost in micro-USD when present; null when no positive cost is stored. */
  costMicroUsd: number | null;
  /** Ordered steps from the task's own events so far. */
  steps: RunTaskStep[];
  /** Distinct human-readable source citations or dataset names touched by the task's tool calls so far. */
  searchedChips: string[];
  /** Target of the task's active or latest tool call while running (null before any tool call or after completion). */
  activeTarget: ToolCallTarget | null;
  /** Plain-language activity line for the task's active cursor while running. */
  activeLabel: string | null;
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
  /** Short citation label for the source when present. */
  citation?: string | null;
  /** Authoritative verification status from provenance. */
  verificationStatus?: "source_checked" | "computed_checked" | "unverified" | "expert_reviewed";
  /** Authoritative summary statement from the Evidence record. */
  summary?: string;
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

export interface RunChipMeta {
  url: string | null;
  title: string;
  publisher: string | null;
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
  /** Total stored cost in micro-USD across tasks when present; null when no positive cost is stored. */
  totalCostMicroUsd: number | null;
  /** True when the run has completed and has a plan or field checks awaiting human review. */
  needsReview: boolean;
  /** Lookup of chip label to source/bundle metadata (URL, title, publisher). */
  chipMeta?: Readonly<Record<string, RunChipMeta>>;
  /** Lookup of source ID to source metadata (URL, title, publisher). */
  sourceMetaById?: Readonly<Record<string, RunChipMeta>>;
}

const END: Partial<Record<Event["kind"], RunTaskState>> = {
  "task.succeeded": "succeeded",
  "task.partial": "partial",
  "task.failed": "failed",
  "task.cancelled": "cancelled",
};

const STRATUM_KEY: Record<string, MessageId> = {
  valley_floor: "run.stratum.valley_floor",
  mid_slope: "run.stratum.mid_slope",
  upper_basin: "run.stratum.upper_basin",
  water_zone: "run.stratum.water_zone",
  catchment: "run.stratum.catchment",
};

function stratumLabel(stratumId: string | null): string {
  const key = stratumId ? STRATUM_KEY[stratumId] : undefined;
  return en[key ?? "run.stratum.catchment"].text;
}

function citeSource(snapshot: CaseSnapshot, sourceId: string): string {
  const src = snapshot.records.sourceRecords.find((s) => s.id === sourceId);
  return src ? shortCitation(src) : en["results.unknownSource"].text;
}

function bundleChip(snapshot: CaseSnapshot, bundleId: string): string {
  const rec = snapshot.records.dataBundleRecords.find((b) => b.id === bundleId);
  if (rec?.label) return rec.label;
  if (bundleId.includes("s2_ndvi")) return en["source.sentinel"].text;
  if (bundleId.includes("chirps")) return en["source.chirps"].text;
  if (bundleId.includes("ndvi_departure") || bundleId.includes("modis"))
    return en["source.modis"].text;
  if (bundleId.includes("worldcover")) return en["source.worldcover"].text;
  if (bundleId.includes("dem")) return en["source.dem"].text;
  return en["results.unknownBundle"].text;
}

function refineTarget(tool: ToolCallInfo, taskQuestion: string): ToolCallTarget {
  const base = resolveToolCallTarget(tool) ?? {
    kind: "case" as const,
    stratumId: null,
    bundleId: null,
    recipeId: null,
    sourceId: null,
    pages: [],
    sections: [],
    queryTerms: [],
  };
  if (
    (base.kind === "land" || base.kind === "bundle") &&
    base.stratumId === "catchment" &&
    base.bundleId?.includes("ndvi_departure") &&
    /valley[_ ]floor/i.test(taskQuestion)
  ) {
    return { ...base, kind: "land", stratumId: "valley_floor" };
  }
  return base;
}

function toolStepLabel(snapshot: CaseSnapshot, tool: ToolCallInfo, target: ToolCallTarget): string {
  if (tool.name === "read_source") {
    const source = target.sourceId
      ? citeSource(snapshot, target.sourceId)
      : en["results.unknownSource"].text;
    if (target.pages.length > 0) {
      return format("run.step.readSourcePage", { source, page: target.pages[0] ?? 1 });
    }
    return format("run.step.readSource", { source });
  }
  if (tool.name === "search_sources") {
    if (target.queryTerms.length > 0) {
      return format("run.step.searchSourcesTerms", {
        terms: target.queryTerms.slice(0, 3).join(", "),
      });
    }
    return en["run.step.searchSources"].text;
  }
  if (tool.name === "compare_series") {
    return en["run.step.compareSeries"].text;
  }
  if (tool.name === "read_recipe_result" || tool.name === "list_recipes") {
    if (target.stratumId && target.stratumId !== "catchment") {
      return format("run.step.readStratum", { stratum: stratumLabel(target.stratumId) });
    }
    return en["run.step.checkRecipe"].text;
  }
  if (tool.name === "summarize_observations" || tool.name === "read_dataset_manifest") {
    if (target.stratumId && target.stratumId !== "catchment") {
      return format("run.step.readStratum", { stratum: stratumLabel(target.stratumId) });
    }
    if (target.bundleId?.includes("chirps")) return en["run.step.readRainfall"].text;
    if (target.bundleId?.includes("ndvi")) return en["run.step.readGreenness"].text;
    return en["run.step.readCatchment"].text;
  }
  if (tool.name === "search_occurrences") {
    return en["run.step.searchOccurrences"].text;
  }
  if (tool.name === "read_case") {
    return en["run.step.readCase"].text;
  }
  return en["run.step.propose"].text;
}

function recordStep(
  steps: RunTaskStep[],
  ms: number,
  status: RunTaskStep["status"],
  label: string,
  target: ToolCallTarget | null,
): void {
  const existing = steps.find((s) => s.label === label);
  if (existing) {
    existing.ms = ms;
    if (existing.status !== "failed") existing.status = status;
    if (target) existing.target = target;
    return;
  }
  steps.push({
    id: `step-${String(steps.length + 1)}`,
    ms,
    status,
    label,
    target,
  });
}

function addChip(chips: string[], chip: string): void {
  if (chip && !chips.includes(chip)) chips.push(chip);
}

function deriveTaskSublabel(
  kind: string,
  bundleIds: readonly string[],
  _sourceIds: readonly string[],
  question: string,
): string | null {
  if (kind === "observation_analysis") {
    if (
      bundleIds.some(
        (b) => b.includes("restrend") || b.includes("pixel_trend") || b.includes("ndvi_departure"),
      )
    ) {
      return "Vegetation";
    }
    if (
      bundleIds.some(
        (b) => b.includes("chirps") || b.includes("relief") || b.includes("terrain_strata"),
      )
    ) {
      return "Rainfall & terrain";
    }
    return /valley[_ ]floor/i.test(question) ? "Valley floor" : "Catchment";
  }
  return null;
}

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
  const taskQuestions = new Map<string, string>();
  const task = (e: Event): RunTask | null => {
    if (!e.taskId) return null;
    let t = tasks.get(e.taskId);
    if (!t) {
      const rec = snapshot.records.taskRecords.find((x) => x.id === e.taskId);
      const q = rec?.question ?? "";
      taskQuestions.set(e.taskId, q);
      const inputIds = (rec?.inputVersions ?? []).map((iv) => iv.entityId);
      const bIds = inputIds.filter((id) => id.startsWith("bundle_"));
      const sIds = inputIds.filter((id) => id.startsWith("src_"));
      const bLabels: string[] = [];
      for (const bId of bIds) addChip(bLabels, bundleChip(snapshot, bId));
      const sCites: string[] = [];
      for (const sId of sIds) addChip(sCites, citeSource(snapshot, sId));
      const kind = rec?.kind ?? "plan";
      t = {
        id: e.taskId,
        kind,
        state: "queued",
        sublabel: deriveTaskSublabel(kind, bIds, sIds, q),
        dependsOnTaskIds: rec?.dependsOnTaskIds ?? [],
        bundleLabels: bLabels,
        sourceCitations: sCites,
        model: null,
        calls: 0,
        running: 0,
        tools: 0,
        failedTools: 0,
        queuedMs: ms(e),
        startMs: null,
        endMs: null,
        costMicroUsd: null,
        steps: [],
        searchedChips: [],
        activeTarget: null,
        activeLabel: null,
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
    const question = taskQuestions.get(t.id) ?? "";
    const collectTool = (tool: ToolCallInfo, stepStatus: RunTaskStep["status"]) => {
      const target = refineTarget(tool, question);
      const label = toolStepLabel(snapshot, tool, target);
      recordStep(t.steps, ms(e), stepStatus, label, target);
      if (target.sourceId) addChip(t.searchedChips, citeSource(snapshot, target.sourceId));
      for (const id of tool.resultEntityIds) {
        if (id.startsWith("src_")) addChip(t.searchedChips, citeSource(snapshot, id));
      }
      if (target.bundleId) addChip(t.searchedChips, bundleChip(snapshot, target.bundleId));
      for (const term of target.queryTerms) addChip(t.searchedChips, term);
      if (target.kind === "land" || target.kind === "bundle" || target.kind === "source") {
        t.activeTarget = target;
        t.activeLabel = label;
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
        if (t.kind === "plan") {
          recordStep(t.steps, ms(e), "running", en["run.step.plan"].text, null);
        } else if (t.kind === "explanation_branches" && t.steps.length === 0) {
          recordStep(t.steps, ms(e), "running", en["run.step.branches"].text, null);
        }
        break;
      case "model.completed":
        t.running = Math.max(0, t.running - 1);
        t.calls += 1;
        if (e.usage) {
          t.model = modelName(e.usage.model);
          const c = e.usage.estimatedCostMicroUsd;
          if (typeof c === "number" && c > 0) {
            t.costMicroUsd = (t.costMicroUsd ?? 0) + c;
          }
        }
        if (t.kind === "plan") {
          recordStep(t.steps, ms(e), "succeeded", en["run.step.plan"].text, null);
        } else if (t.kind === "explanation_branches") {
          recordStep(t.steps, ms(e), "succeeded", en["run.step.branches"].text, null);
        }
        break;
      case "tool.started":
        start();
        if (e.tool) collectTool(e.tool, "running");
        break;
      case "tool.completed":
        t.tools += 1;
        if (e.tool) {
          const ok = e.tool.status === "succeeded";
          if (!ok) t.failedTools += 1;
          collectTool(e.tool, ok ? "succeeded" : "failed");
        }
        break;
      case "validation.completed":
        if (e.validation) {
          recordStep(
            t.steps,
            ms(e),
            e.validation.outcome === "accepted" ? "succeeded" : "failed",
            en["run.step.validated"].text,
            null,
          );
        }
        break;
      default: {
        const end = END[e.kind];
        if (end) {
          start();
          t.state = end;
          t.endMs = ms(e);
          t.running = 0;
          t.activeTarget = null;
          t.activeLabel = null;
          for (const s of t.steps) {
            if (s.status === "running") s.status = end === "failed" ? "failed" : "succeeded";
          }
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
    const sId = lands === "source" ? sourceKey(ev) : null;
    return [
      {
        id: ev.id,
        taskId: ev.provenance.generatedByTaskId ?? null,
        ms: at,
        word: verificationOf(ev),
        lands,
        sourceId: sId,
        citation: sId ? citeSource(snapshot, sId) : null,
        verificationStatus: status,
        summary: readableStatement(snapshot, ev.statement),
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

  const taskList = [...tasks.values()];
  let totalCost = 0;
  let hasCost = false;
  for (const t of taskList) {
    if (t.costMicroUsd !== null && t.costMicroUsd > 0) {
      totalCost += t.costMicroUsd;
      hasCost = true;
    }
  }
  const done = own.some((e) => e.kind === "command.completed");
  const checks =
    scored && mergeMs !== undefined
      ? (scored.fieldPlan?.measurements ?? []).map((m) => ({ label: m.label, ms: mergeMs }))
      : [];
  const needsReview =
    done &&
    (checks.length > 0 ||
      snapshot.records.briefRecords.length > 0 ||
      snapshot.records.taskRecords.some(
        (tr) => tr.commandId === commandId && tr.status === "awaiting_review",
      ));

  const chipMeta: Record<string, RunChipMeta> = {};
  const sourceMetaById: Record<string, RunChipMeta> = {};
  for (const src of snapshot.records.sourceRecords) {
    const meta: RunChipMeta = {
      url: src.url,
      title: src.title,
      publisher: src.publisher,
    };
    sourceMetaById[src.id] = meta;
    chipMeta[shortCitation(src)] = meta;
  }
  const s2 = snapshot.records.sourceRecords.find(
    (s) => s.id === "src_SCI-07" || /sentinel-2/i.test(s.title),
  );
  if (s2) {
    chipMeta[en["source.sentinel"].text] = {
      url: s2.url,
      title: s2.title,
      publisher: s2.publisher,
    };
  }
  const chirps = snapshot.records.sourceRecords.find(
    (s) => s.id === "src_SCI-09" || /chirps/i.test(s.title),
  );
  if (chirps) {
    chipMeta[en["source.chirps"].text] = {
      url: chirps.url,
      title: chirps.title,
      publisher: chirps.publisher,
    };
  }
  const wc = snapshot.records.sourceRecords.find(
    (s) => s.id === "src_SCI-13" || /worldcover/i.test(s.title),
  );
  if (wc) {
    chipMeta[en["source.worldcover"].text] = {
      url: wc.url,
      title: wc.title,
      publisher: wc.publisher,
    };
  }

  const last = own.at(-1);
  return {
    commandId,
    acceptedAt: accepted?.occurredAt ?? null,
    nowMs: last ? ms(last) : 0,
    done,
    replay,
    sourceKnown,
    tasks: taskList,
    findings,
    branches,
    merge: scored && mergeMs !== undefined ? { ms: mergeMs, counts } : null,
    checks,
    totalCostMicroUsd: hasCost ? totalCost : null,
    needsReview,
    chipMeta,
    sourceMetaById,
  };
}
