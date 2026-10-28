import type { CaseAnalysisConfig, Prediction } from "@siterra/contracts";
import type { CoMovementRecord, ScoringRecord, SeriesRecord } from "@siterra/domain";

import { compareSeriesTool } from "../../tools/analysis-tools.ts";
import { readSeasonSummary } from "../../tools/event-tools.ts";
import type { CaseStore } from "../../tools/store.ts";
import { ToolFailure } from "../../tools/tool.ts";
import type { CommitOutcome } from "../commit.ts";
import { messages } from "../trace.ts";
import type { ToolCallDraft, TraceSink } from "../trace.ts";
import type { BranchCatalog } from "./catalog.ts";

// Reads what the committed predictions name, and only after they are committed (DF-07): every
// measurement, quality record and recipe result read here needs a receipt, and only a committed
// or duplicate predictions commit gives one.

declare const committed: unique symbol;

/** Proof that the predictions commit was applied, with the case revision it produced. */
export interface PredictionsReceipt {
  readonly caseRevision: number;
  readonly [committed]: true;
}

export function receiptOf(outcome: CommitOutcome): PredictionsReceipt | null {
  return outcome.status === "stale"
    ? null
    : ({ caseRevision: outcome.newCaseRevision } as PredictionsReceipt);
}

interface CompareOutput {
  counts: Record<string, { alignedMonths: number; sameSignMonths: number }>;
}

/** Where host-run tool loads are traced, as the task loop traces the model's tool calls. */
export interface LoadTrace {
  sink: TraceSink;
  taskId: string;
  now: () => Date;
}

async function traced<T extends { resultEntityIds: string[] }>(
  trace: LoadTrace,
  name: ToolCallDraft["name"],
  argumentSummary: string,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = trace.now();
  const base = { name, startedAt: startedAt.toISOString(), argumentSummary, attempt: 1 };
  const emit = (kind: "tool.started" | "tool.completed", tool: ToolCallDraft, message: string) =>
    trace.sink.emit({
      kind,
      taskId: trace.taskId,
      occurredAt: trace.now().toISOString(),
      entityIds: tool.resultEntityIds,
      message,
      resultStatus: null,
      usage: null,
      tool,
      validation: null,
    });
  emit(
    "tool.started",
    {
      ...base,
      status: "started",
      endedAt: null,
      durationMs: null,
      resultEntityIds: [],
      errorCode: null,
    },
    messages.toolStarted(name),
  );
  const finish = (status: ToolCallDraft["status"], ids: string[], errorCode: string | null) => {
    const ended = trace.now();
    emit(
      "tool.completed",
      {
        ...base,
        status,
        endedAt: ended.toISOString(),
        durationMs: ended.getTime() - startedAt.getTime(),
        resultEntityIds: ids,
        errorCode,
      },
      messages.toolCompleted(name, status, ids.length),
    );
  };
  try {
    const result = await run();
    finish("succeeded", result.resultEntityIds, null);
    return result;
  } catch (error) {
    finish("failed", [], error instanceof ToolFailure ? error.code : "tool_error");
    throw error;
  }
}

/** The record the predictions name; the receipt comes first so nothing is read before the commit. */
export async function readScoringRecord(
  _receipt: PredictionsReceipt,
  store: CaseStore,
  caseId: string,
  config: CaseAnalysisConfig,
  catalog: BranchCatalog,
  predictions: readonly Prediction[],
  signal: AbortSignal,
  trace: LoadTrace,
): Promise<ScoringRecord> {
  const series = new Map<string, SeriesRecord>();
  const wantedPeriods = new Map<string, Set<string>>();
  const coWanted = new Set<string>();
  let seasonsWanted = false;
  for (const { test } of predictions) {
    if (test.pairId !== null && test.side !== null) {
      const key = `${test.pairId}:${test.side}`;
      const set = wantedPeriods.get(key) ?? new Set<string>();
      for (const p of test.periodIds) set.add(p);
      wantedPeriods.set(key, set);
    }
    if (test.kind === "co_movement" && test.pairId !== null) coWanted.add(test.pairId);
    if (test.kind === "season_category") seasonsWanted = true;
  }

  for (const [key, periods] of wantedPeriods) {
    const [pairId, sideKey] = key.split(":") as [string, "a" | "b"];
    const side = catalog.pairs.find((p) => p.pairId === pairId)?.[sideKey];
    if (!side?.bundle) continue;
    const inBundle = [...periods].filter((p) => side.periodIds.includes(p)).sort();
    const rows = (
      await store.readMeasurements(caseId, side.bundle.id, side.bundle.revision, inBundle)
    ).filter((m) => side.metrics.includes(m.metric));
    const quality = new Map(
      (await store.readPeriodQuality(caseId, side.bundle.id, inBundle)).map((q) => [
        q.periodId,
        q.qualityFlags,
      ]),
    );
    series.set(key, {
      bundleId: side.bundle.id,
      metrics: side.metrics,
      periods: new Map(
        inBundle.map((periodId) => [
          periodId,
          {
            measurements: rows
              .filter((m) => m.periodId === periodId)
              .map((m) => ({ id: m.id, metric: m.metric, status: m.status, value: m.value })),
            qualityFlags: quality.get(periodId) ?? null,
          },
        ]),
      ),
    });
  }

  const coMovement = new Map<string, CoMovementRecord>();
  const compare = compareSeriesTool(store, caseId);
  for (const pairId of coWanted) {
    const pair = catalog.pairs.find((p) => p.pairId === pairId);
    const configured = config.seriesPairs.find((p) => p.id === pairId);
    if (!pair?.a.bundle || !pair.b.bundle || !configured) continue;
    const bundleIds = [pair.a.bundle.id, pair.b.bundle.id];
    const byWindow = new Map<
      number,
      { metric: string; alignedMonths: number; sameSignMonths: number }[]
    >();
    const measurementIds = new Set<string>();
    let mismatch = false;
    for (const metric of configured.a.metrics) {
      const args = {
        a: { bundleId: pair.a.bundle.id, bundleRevision: pair.a.bundle.revision, metric },
        b: {
          bundleId: pair.b.bundle.id,
          bundleRevision: pair.b.bundle.revision,
          metric: configured.b.metrics[0] ?? "",
        },
      };
      try {
        const result = await traced(trace, compare.name, compare.summarize(args), () =>
          compare.run(args, signal),
        );
        const output = result.output as CompareOutput;
        for (const id of result.resultEntityIds) measurementIds.add(id);
        for (const w of configured.windowsMonths) {
          const c = output.counts[String(w)];
          if (!c) continue;
          byWindow.set(w, [...(byWindow.get(w) ?? []), { metric, ...c }]);
        }
      } catch (error) {
        if (error instanceof ToolFailure && error.code === "area_mismatch") mismatch = true;
        else if (!(error instanceof ToolFailure)) throw error;
      }
    }
    for (const w of configured.windowsMonths) {
      const key = `${pairId}:${String(w)}`;
      if (mismatch) coMovement.set(key, { kind: "area_mismatch", bundleIds });
      else if (byWindow.has(w))
        coMovement.set(key, {
          kind: "counted",
          bundleIds,
          minAlignedMonths: configured.minAlignedMonths,
          byMetric: byWindow.get(w) ?? [],
          measurementIds: [...measurementIds],
        });
    }
  }

  let seasons: ScoringRecord["seasons"] = null;
  if (seasonsWanted) {
    const found = await readSeasonSummary(store, caseId, config.rainfallSeason.recipe);
    if (found) {
      seasons = {
        bundleId: found.bundleId,
        categories: new Map(found.summary.seasons.map((s) => [s.season_id, s.season_category])),
      };
    }
  }
  return {
    series,
    coMovement,
    seasons,
    fieldCheckIds: new Set(config.fieldChecks.map((c) => c.id)),
  };
}
