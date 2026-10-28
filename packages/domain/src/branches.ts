import type {
  BranchConflict,
  BranchMerge,
  Hypothesis,
  Prediction,
  PredictionScore,
  PredictionTest,
} from "@siterra/contracts";

// Explanation branches (docs/reference/agent-orchestration.md, explanation branches): host code
// scores each committed prediction against the record and fixed rules set each branch's status.
// Nothing here reads a prediction's wording, and no status is a probability, a rank or proof.

/**
 * The merge rules a case configuration selects. merge@1 is fixed at its original parameters so
 * stored merges reproduce; merge@2 (proposed) lets a necessary departure_sign prediction
 * contradict only over at least `minPeriodsForNecessarySign` periods.
 */
export interface MergeRules {
  version: "merge@1" | "merge@2";
  minPeriodsForNecessarySign: number;
  /** The status when every necessary prediction is met and an optional testable one is not. */
  whenOptionalNotMet: "cannot_be_assessed" | "consistent";
}

/**
 * Unsourced default minimum number of evaluated periods before a non-matching departure_sign
 * prediction can contradict a branch under merge@2; pending science review.
 */
export const DEFAULT_MIN_SIGN_PERIODS = 3;

export const MERGE_RULES_V1: MergeRules = {
  version: "merge@1",
  minPeriodsForNecessarySign: 1,
  whenOptionalNotMet: "cannot_be_assessed",
};

export const MERGE_RULES_V2: MergeRules = {
  version: "merge@2",
  minPeriodsForNecessarySign: DEFAULT_MIN_SIGN_PERIODS,
  whenOptionalNotMet: "cannot_be_assessed",
};

export const MERGE_RULES_VERSION = MERGE_RULES_V2.version;

/** Merge rules for a case configuration (merge@2 with the case's whenOptionalNotMet setting). */
export function mergeRulesFor(
  config?: { whenOptionalNotMet?: "cannot_be_assessed" | "consistent" | undefined } | null,
): MergeRules {
  return {
    ...MERGE_RULES_V2,
    whenOptionalNotMet: config?.whenOptionalNotMet ?? MERGE_RULES_V2.whenOptionalNotMet,
  };
}

type ReasonCode = NonNullable<PredictionScore["reasonCode"]>;
type BranchStatus = BranchMerge["branches"][number]["status"];
type SeasonCategory = "below_normal" | "near_normal" | "above_normal";

/** Reason codes where the record holds the target but not enough usable values. */
const INADEQUATE: ReadonlySet<ReasonCode> = new Set([
  "value_not_available",
  "no_quality_record",
  "too_few_aligned_months",
  "precondition_not_met",
]);

export interface RecordedMeasurement {
  id: string;
  metric: string;
  status: string;
  value: number | null;
}

/** One side of a configured pair, as its validated bundle holds it. */
export interface SeriesRecord {
  bundleId: string;
  /** The side's configured metrics; a departure_sign prediction is scored under each. */
  metrics: readonly string[];
  /** Per period of the bundle: its measurements, and its quality flags (null when unrecorded). */
  periods: ReadonlyMap<
    string,
    { measurements: readonly RecordedMeasurement[]; qualityFlags: readonly string[] | null }
  >;
}

export type CoMovementRecord =
  | {
      kind: "counted";
      bundleIds: readonly string[];
      minAlignedMonths: number;
      /** compare_series counts under each configured metric of side a. */
      byMetric: readonly { metric: string; alignedMonths: number; sameSignMonths: number }[];
      measurementIds: readonly string[];
    }
  | { kind: "area_mismatch"; bundleIds: readonly string[] };

export interface StratumTrendRecord {
  status: "computed" | "precondition_not_met" | "insufficient_seasons";
  /** [estimate, lower95, upper95] per decade for unadjusted greenness, or null if unavailable. */
  unadjustedPerDecade: readonly [number, number, number] | null;
  /** [estimate, lower95, upper95] per decade for the rainfall-adjusted residual, or null if unavailable. */
  residualPerDecade: readonly [number, number, number] | null;
}

export interface TrendSummaryRecord {
  bundleId: string;
  firstSeason: number;
  lastSeason: number;
  strata: ReadonlyMap<string, StratumTrendRecord>;
}

/** What the record holds for scoring, read by host code only after the predictions commit. */
export interface ScoringRecord {
  /** Keyed "pairId:side". */
  series: ReadonlyMap<string, SeriesRecord>;
  /** Keyed "pairId:windowMonths". */
  coMovement: ReadonlyMap<string, CoMovementRecord>;
  seasons: { bundleId: string; categories: ReadonlyMap<string, SeasonCategory> } | null;
  trends?: TrendSummaryRecord | null;
  fieldCheckIds: ReadonlySet<string>;
}

/** The test a prediction names, without its expected outcome. */
export function testKey(test: PredictionTest): string {
  const periods = [...test.periodIds].sort().join(",");
  switch (test.kind) {
    case "departure_sign":
    case "availability":
      return `${test.kind}:${test.pairId ?? ""}:${test.side ?? ""}:${periods}`;
    case "quality_flag":
      return `${test.kind}:${test.pairId ?? ""}:${test.side ?? ""}:${test.flag ?? ""}:${periods}`;
    case "co_movement":
      return `${test.kind}:${test.pairId ?? ""}:${String(test.windowMonths ?? "")}`;
    case "season_category":
      return `${test.kind}:${test.seasonId ?? ""}`;
    case "trend_direction":
      return `${test.kind}:${test.stratumId ?? ""}:${test.trendSeries ?? ""}`;
    case "field_check":
      return `${test.kind}:${test.fieldCheckId ?? ""}`;
  }
}

const words = (code: string): string => code.replaceAll("_", " ");
const signedFour = (n: number): string => `${n >= 0 ? "+" : ""}${n.toFixed(4)}`;

function untestable(
  key: string,
  reasonCode: ReasonCode,
  observed: string,
  dataBundleIds: readonly string[] = [],
): PredictionScore {
  return {
    predictionKey: key,
    outcome: "not_testable",
    dataAdequate: false,
    reasonCode,
    observed,
    measurementIds: [],
    dataBundleIds: [...dataBundleIds],
  };
}

function scored(
  key: string,
  met: boolean,
  observed: string,
  measurementIds: readonly string[],
  dataBundleIds: readonly string[],
): PredictionScore {
  return {
    predictionKey: key,
    outcome: met ? "met" : "not_met",
    dataAdequate: true,
    reasonCode: null,
    observed,
    measurementIds: [...new Set(measurementIds)],
    dataBundleIds: [...new Set(dataBundleIds)],
  };
}

/** The side's records for the named periods, or the reason they cannot be read. */
function sideRecords(
  test: PredictionTest,
  record: ScoringRecord,
  key: string,
):
  | {
      series: SeriesRecord;
      periods: [string, NonNullable<ReturnType<SeriesRecord["periods"]["get"]>>][];
    }
  | PredictionScore {
  const series = record.series.get(`${test.pairId ?? ""}:${test.side ?? ""}`);
  if (!series) {
    return untestable(key, "no_series_bundle", "No validated bundle holds this series.");
  }
  if (test.periodIds.length === 0) {
    return untestable(key, "unknown_target", "The prediction names no period.", [series.bundleId]);
  }
  const missing = test.periodIds.filter((p) => !series.periods.has(p));
  if (missing.length > 0) {
    return untestable(key, "period_not_in_record", `The bundle holds no ${missing.join(", ")}.`, [
      series.bundleId,
    ]);
  }
  return {
    series,
    periods: test.periodIds.map((p) => [
      p,
      series.periods.get(p) ?? { measurements: [], qualityFlags: null },
    ]),
  };
}

const usable = (m: RecordedMeasurement | undefined): m is RecordedMeasurement & { value: number } =>
  m !== undefined && m.status === "available" && m.value !== null;

/** Scores one committed prediction; the wording is never read. */
export function scorePrediction(prediction: Prediction, record: ScoringRecord): PredictionScore {
  const { key, test } = prediction;
  switch (test.kind) {
    case "departure_sign": {
      const side = sideRecords(test, record, key);
      if ("outcome" in side) return side;
      const values: (RecordedMeasurement & { value: number })[] = [];
      for (const [periodId, period] of side.periods) {
        for (const metric of side.series.metrics) {
          const m = period.measurements.find((x) => x.metric === metric);
          if (!usable(m)) {
            return untestable(
              key,
              "value_not_available",
              `No usable ${metric} value for ${periodId}.`,
              [side.series.bundleId],
            );
          }
          values.push(m);
        }
      }
      const matching = values.filter((m) =>
        test.expected === "negative" ? m.value < 0 : m.value > 0,
      ).length;
      return scored(
        key,
        matching === values.length,
        `${String(matching)} of ${String(values.length)} stored values are ${test.expected ?? ""} (${side.series.metrics.join(", ")}) over ${test.periodIds.join(", ")}.`,
        values.map((m) => m.id),
        [side.series.bundleId],
      );
    }
    case "quality_flag": {
      const side = sideRecords(test, record, key);
      if ("outcome" in side) return side;
      const unrecorded = side.periods.filter(([, p]) => p.qualityFlags === null).map(([id]) => id);
      if (unrecorded.length > 0) {
        return untestable(
          key,
          "no_quality_record",
          `No quality flags are recorded for ${unrecorded.join(", ")}.`,
          [side.series.bundleId],
        );
      }
      const flagged = side.periods
        .filter(([, p]) => p.qualityFlags?.includes(test.flag ?? "") === true)
        .map(([id]) => id);
      const present = flagged.length > 0;
      return scored(
        key,
        test.expected === "present" ? present : !present,
        present
          ? `${test.flag ?? ""} is recorded for ${flagged.join(", ")}.`
          : `${test.flag ?? ""} is recorded for none of ${test.periodIds.join(", ")}.`,
        [],
        [side.series.bundleId],
      );
    }
    case "availability": {
      const side = sideRecords(test, record, key);
      if ("outcome" in side) return side;
      const unavailable = side.periods
        .filter(([, p]) =>
          side.series.metrics.some(
            (metric) => !usable(p.measurements.find((m) => m.metric === metric)),
          ),
        )
        .map(([id]) => id);
      return scored(
        key,
        test.expected === "all_available" ? unavailable.length === 0 : unavailable.length > 0,
        unavailable.length === 0
          ? `Every metric has a usable value for ${test.periodIds.join(", ")}.`
          : `${unavailable.join(", ")} ${unavailable.length === 1 ? "lacks" : "lack"} a usable value.`,
        side.periods.flatMap(([, p]) => p.measurements.map((m) => m.id)),
        [side.series.bundleId],
      );
    }
    case "co_movement": {
      const counted = record.coMovement.get(
        `${test.pairId ?? ""}:${String(test.windowMonths ?? "")}`,
      );
      if (!counted) {
        return untestable(
          key,
          "no_series_bundle",
          "No validated bundles hold both series of the pair.",
        );
      }
      if (counted.kind === "area_mismatch") {
        return untestable(
          key,
          "area_mismatch",
          "The two series are not on the same geometry revision.",
          counted.bundleIds,
        );
      }
      const short = counted.byMetric.filter((c) => c.alignedMonths < counted.minAlignedMonths);
      if (counted.byMetric.length === 0 || short.length > 0) {
        return untestable(
          key,
          "too_few_aligned_months",
          `Fewer than ${String(counted.minAlignedMonths)} aligned months (${short.map((c) => `${c.metric}: ${String(c.alignedMonths)}`).join(", ")}).`,
          counted.bundleIds,
        );
      }
      const majority = counted.byMetric.map((c) => c.sameSignMonths * 2 > c.alignedMonths);
      const met =
        test.expected === "same_sign_majority"
          ? majority.every(Boolean)
          : majority.every((m) => !m);
      return scored(
        key,
        met,
        `Months with the same sign, ${String(test.windowMonths ?? "")}-month window: ${counted.byMetric.map((c) => `${c.metric} ${String(c.sameSignMonths)} of ${String(c.alignedMonths)}`).join(", ")}. Co-occurrence only.`,
        counted.measurementIds,
        counted.bundleIds,
      );
    }
    case "season_category": {
      if (!record.seasons) {
        return untestable(key, "no_season_summary", "The case holds no season summary result.");
      }
      const category = record.seasons.categories.get(test.seasonId ?? "");
      if (!category) {
        return untestable(
          key,
          "season_not_in_summary",
          `The season summary holds no ${test.seasonId ?? "season"}.`,
          [record.seasons.bundleId],
        );
      }
      return scored(
        key,
        category === test.expected,
        `The season summary places ${test.seasonId ?? ""} ${words(category)}.`,
        [],
        [record.seasons.bundleId],
      );
    }
    case "trend_direction": {
      const trends = record.trends ?? null;
      if (!trends) {
        return untestable(
          key,
          "no_trend_record",
          "The case holds no long-record trend summary result.",
        );
      }
      const stratumId = test.stratumId ?? "";
      const stratum = trends.strata.get(stratumId);
      if (!stratum) {
        return untestable(
          key,
          "stratum_not_in_record",
          `The trend summary holds no stratum ${stratumId || "target"}.`,
          [trends.bundleId],
        );
      }
      const span = `${String(trends.firstSeason)} to ${String(trends.lastSeason)}`;
      if (stratum.status === "insufficient_seasons") {
        return untestable(
          key,
          "value_not_available",
          `Stratum ${stratumId} has too few seasons over ${span} to fit a trend.`,
          [trends.bundleId],
        );
      }
      if (test.trendSeries === "residual") {
        if (stratum.status === "precondition_not_met") {
          return untestable(
            key,
            "precondition_not_met",
            `Rainfall-adjusted residual trend in ${stratumId} (${span}) is not testable: precondition not met because the rainfall slope 95% interval includes zero.`,
            [trends.bundleId],
          );
        }
        const tuple = stratum.residualPerDecade;
        if (!tuple) {
          return untestable(
            key,
            "value_not_available",
            `No residual trend interval is recorded for ${stratumId}.`,
            [trends.bundleId],
          );
        }
        const [slope, lower, upper] = tuple;
        const observedDir = lower > 0 ? "increasing" : upper < 0 ? "decreasing" : "flat";
        return scored(
          key,
          observedDir === test.expected,
          `Rainfall-adjusted residual trend in ${stratumId} (${span}) is ${observedDir}: ${signedFour(slope)} per decade (95% interval ${signedFour(lower)} to ${signedFour(upper)}).`,
          [],
          [trends.bundleId],
        );
      }
      const tuple = stratum.unadjustedPerDecade;
      if (!tuple) {
        return untestable(
          key,
          "value_not_available",
          `No unadjusted greenness trend interval is recorded for ${stratumId}.`,
          [trends.bundleId],
        );
      }
      const [slope, lower, upper] = tuple;
      const observedDir = lower > 0 ? "increasing" : upper < 0 ? "decreasing" : "flat";
      return scored(
        key,
        observedDir === test.expected,
        `Unadjusted greenness trend in ${stratumId} (${span}) is ${observedDir}: ${signedFour(slope)} per decade (95% interval ${signedFour(lower)} to ${signedFour(upper)}).`,
        [],
        [trends.bundleId],
      );
    }
    case "field_check":
      return record.fieldCheckIds.has(test.fieldCheckId ?? "")
        ? untestable(key, "field_measurement_needed", "Only a field measurement can test this.")
        : untestable(key, "unknown_target", "The case configuration names no such field check.");
  }
}

/** One branch with its committed predictions and their scores. */
export interface BranchScoring {
  branchId: string;
  explanationId: string;
  predictions: readonly Prediction[];
  scores: readonly PredictionScore[];
}

export interface MergeResult {
  branches: { branchId: string; explanationId: string; status: BranchStatus; reason: string }[];
  conflicts: BranchConflict[];
}

const periodsWord = (n: number): string => `${String(n)} ${n === 1 ? "period" : "periods"}`;

function isShortNecessarySign(p: Prediction, rules: MergeRules): boolean {
  return (
    p.necessary &&
    p.test.kind === "departure_sign" &&
    p.test.periodIds.length < rules.minPeriodsForNecessarySign
  );
}

function statusOf(
  branch: BranchScoring,
  rules: MergeRules,
): { status: BranchStatus; reason: string } {
  if (branch.predictions.length === 0) {
    return { status: "cannot_be_assessed", reason: "No predictions were recorded." };
  }
  const scoreOf = new Map(branch.scores.map((s) => [s.predictionKey, s]));
  const unmetNecessary = branch.predictions.filter(
    (p) => p.necessary && scoreOf.get(p.key)?.outcome === "not_met",
  );
  const failedNecessary = unmetNecessary.filter((p) => !isShortNecessarySign(p, rules));
  if (failedNecessary.length > 0) {
    const keys = failedNecessary.map((p) => p.key).join(", ");
    return {
      status: "contradicted",
      reason: `Necessary prediction ${keys} is not met on adequate data.`,
    };
  }
  const shortNecessary = unmetNecessary.filter((p) => isShortNecessarySign(p, rules));
  if (shortNecessary.length > 0) {
    const keys = shortNecessary.map((p) => p.key).join(", ");
    const count = Math.max(...shortNecessary.map((p) => p.test.periodIds.length));
    return {
      status: "cannot_be_assessed",
      reason: `Necessary prediction ${keys} is not met over ${periodsWord(count)}; ${rules.version} needs ${periodsWord(rules.minPeriodsForNecessarySign)} to contradict.`,
    };
  }
  const testable = branch.scores.filter((s) => s.outcome !== "not_testable");
  if (testable.length === 0) {
    return { status: "cannot_be_assessed", reason: "No prediction is testable with the record." };
  }
  const unmet = testable.filter((s) => s.outcome === "not_met").map((s) => s.predictionKey);
  if (unmet.length > 0) {
    const necessary = branch.predictions.filter((p) => p.necessary);
    const metNecessary = necessary.filter((p) => scoreOf.get(p.key)?.outcome === "met");
    if (
      rules.whenOptionalNotMet === "consistent" &&
      necessary.length > 0 &&
      metNecessary.length === necessary.length
    ) {
      const optVerb = unmet.length === 1 ? "is" : "are";
      const necVerb = necessary.length === 1 ? "is" : "are";
      return {
        status: "consistent",
        reason: `Optional prediction ${unmet.join(", ")} ${optVerb} not met; ${String(metNecessary.length)} of ${String(necessary.length)} necessary predictions ${necVerb} met.`,
      };
    }
    return {
      status: "cannot_be_assessed",
      reason: `Prediction ${unmet.join(", ")} is not met but not necessary, so the rules set no other status.`,
    };
  }
  return {
    status: "consistent",
    reason: `Every testable prediction is met (${String(testable.length)} of ${String(branch.predictions.length)} testable).`,
  };
}

const CONFLICT_ORDER: readonly BranchConflict["kind"][] = [
  "separates_nothing",
  "not_testable",
  "inadequate_data",
];

/** The fixed merge: statuses from the scores alone, and the conflicts to flag. */
export function mergeBranches(
  branches: readonly BranchScoring[],
  rules: MergeRules = MERGE_RULES_V1,
): MergeResult {
  const conflicts: BranchConflict[] = [];
  const predicted = branches.filter((b) => b.predictions.length > 0);
  if (predicted.length >= 2 && predicted.length === branches.length) {
    const groups = new Map<string, { test: PredictionTest; refs: BranchConflict["predictions"] }>();
    for (const branch of branches) {
      const seen = new Set<string>();
      for (const p of branch.predictions) {
        const group = `${testKey(p.test)}=${p.test.expected ?? ""}`;
        if (seen.has(group)) continue;
        seen.add(group);
        const entry = groups.get(group) ?? { test: p.test, refs: [] };
        entry.refs.push({ branchId: branch.branchId, predictionKey: p.key });
        groups.set(group, entry);
      }
    }
    for (const { test, refs } of groups.values()) {
      if (refs.length === branches.length) {
        conflicts.push({
          kind: "separates_nothing",
          testKey: testKey(test),
          predictions: refs,
          detail:
            "Every branch predicts this outcome, so its result cannot tell the explanations apart.",
        });
      }
    }
  }
  for (const branch of branches) {
    for (const score of branch.scores) {
      const p = branch.predictions.find((x) => x.key === score.predictionKey);
      if (!p) continue;
      if (score.outcome === "not_met" && isShortNecessarySign(p, rules)) {
        conflicts.push({
          kind: "inadequate_data",
          testKey: testKey(p.test),
          predictions: [{ branchId: branch.branchId, predictionKey: p.key }],
          detail: `Not met over ${periodsWord(p.test.periodIds.length)}, fewer than the ${periodsWord(rules.minPeriodsForNecessarySign)} ${rules.version} needs to contradict.`,
        });
        continue;
      }
      if (score.outcome !== "not_testable") continue;
      conflicts.push({
        kind:
          score.reasonCode !== null && INADEQUATE.has(score.reasonCode)
            ? "inadequate_data"
            : "not_testable",
        testKey: testKey(p.test),
        predictions: [{ branchId: branch.branchId, predictionKey: p.key }],
        detail: score.observed,
      });
    }
  }
  conflicts.sort((a, b) => CONFLICT_ORDER.indexOf(a.kind) - CONFLICT_ORDER.indexOf(b.kind));
  return {
    branches: branches.map((b) => ({
      branchId: b.branchId,
      explanationId: b.explanationId,
      ...statusOf(b, rules),
    })),
    conflicts,
  };
}

/** The Hypothesis status host code writes for a merged branch. */
export function hypothesisStatusOf(
  status: BranchStatus,
): Exclude<Hypothesis["status"], "stale" | "untested"> {
  switch (status) {
    case "consistent":
      return "consistent";
    case "contradicted":
      return "inconsistent";
    case "cannot_be_assessed":
      return "inconclusive";
  }
}
