// Scene 6 Verdict (UI-2): translates a command's BranchMerge and ExplanationBranch records into the 5 tested causes,
// each with its plain status ("Supported by the record", "Contradicted by the record", "Cannot be told from space"),
// its one-line reason, and the prediction written before looking, with no internal record IDs or statistical jargon.

import type {
  BranchMerge,
  CaseSnapshot,
  ExplanationBranch,
  Prediction,
  PredictionScore,
} from "@siterra/contracts";
import { pformat, pkg } from "../copy/package";
import { commandMerge } from "../overview/results";
import { deriveBranchContext, verdictForCase } from "./verdict-context";

export { verdictForCase };

export type VerdictStatus = BranchMerge["branches"][number]["status"];

export interface VerdictLocalContext {
  title: string;
  detail: string;
  citation: string;
}

export interface VerdictCause {
  id: string;
  branchId: string;
  label: string;
  status: VerdictStatus;
  statusText: string;
  prediction: string;
  reason: string;
  localContext?: VerdictLocalContext | undefined;
  nextCheck?: string | undefined;
}

export interface VerdictView {
  mergeId: string;
  caption: { ink: string; grey: string | null };
  causes: VerdictCause[];
}

const MONTHS: Record<string, string> = {
  "01": "January",
  "02": "February",
  "03": "March",
  "04": "April",
  "05": "May",
  "06": "June",
  "07": "July",
  "08": "August",
  "09": "September",
  "10": "October",
  "11": "November",
  "12": "December",
};

const LABELS: Record<string, string> = {
  rainfall: "Rainfall",
  grazing: "Grazing",
  land_use: "Land use",
  snow_terrain: "Snow or terrain",
  data_artefact: "Data artefact",
};

function formatPeriod(id: string): string {
  const m = /^period_(\d{4})-(\d{2})$/.exec(id.trim());
  if (!m) return id;
  const year = m[1] ?? "";
  const month = MONTHS[m[2] ?? ""] ?? m[2] ?? "";
  return `${month} ${year}`;
}

function formatPeriodSpan(firstId: string, lastId: string): string {
  const a = /^period_(\d{4})-(\d{2})$/.exec(firstId.trim());
  const b = /^period_(\d{4})-(\d{2})$/.exec(lastId.trim());
  if (!a || !b) return `${formatPeriod(firstId)} to ${formatPeriod(lastId)}`;
  const y1 = a[1] ?? "";
  const m1 = MONTHS[a[2] ?? ""] ?? a[2] ?? "";
  const y2 = b[1] ?? "";
  const m2 = MONTHS[b[2] ?? ""] ?? b[2] ?? "";
  return y1 === y2 ? `${m1} to ${m2} ${y1}` : `${m1} ${y1} to ${m2} ${y2}`;
}

function formatSeason(id: string): string {
  const m = /^season_(\d{4})-\d{2}_(\d{4})-\d{2}$/.exec(id.trim());
  if (!m) return id;
  return `${m[1] ?? ""} to ${m[2] ?? ""} wet season`;
}

/** Replaces internal period/season/flag/metric tokens with plain English words. */
export function plainVerdictText(raw: string): string {
  let s = raw.trim();
  // Comma-separated lists of period_YYYY-MM (2 or more) -> span from first to last
  s = s.replace(/\bperiod_\d{4}-\d{2}(?:,\s*period_\d{4}-\d{2})+/g, (list) => {
    const parts = list.split(/,\s*/);
    const first = parts[0];
    const last = parts.at(-1);
    return first && last ? formatPeriodSpan(first, last) : list;
  });
  // "from period_X through period_Y" or "period_X through period_Y"
  s = s.replace(
    /\b(?:from\s+)?(period_\d{4}-\d{2})\s+(?:through|to)\s+(period_\d{4}-\d{2})\b/gi,
    (_, p1: string, p2: string) => formatPeriodSpan(p1, p2),
  );
  // Single period_YYYY-MM
  s = s.replace(/\bperiod_\d{4}-\d{2}\b/g, (p) => formatPeriod(p));
  // Season IDs, avoiding "Season the 2021 to 2022 wet season"
  s = s.replace(
    /\b(?:[Tt]he\s+season\s+|[Ss]eason\s+)?(season_\d{4}-\d{2}_\d{4}-\d{2})\b/g,
    (whole, id: string) => {
      const formatted = formatSeason(id);
      return /^[Tt]he\b|^[Ss]eason\b/.test(whole) ? `The ${formatted}` : `the ${formatted}`;
    },
  );
  // Flags and internal metric/stratum names
  s = s
    .replace(/\bthe\s+snow_suspected\s+flag\b/gi, "suspected snow")
    .replace(/\bsnow_suspected\s+flag\b/gi, "suspected snow")
    .replace(/\bsnow_suspected\b/g, "suspected snow")
    .replace(/\bthe\s+terrain_shadow_suspected\s+flag\b/gi, "terrain shadow")
    .replace(/\bterrain_shadow_suspected\s+flag\b/gi, "terrain shadow")
    .replace(/\bterrain_shadow_suspected\b/g, "terrain shadow")
    .replace(/\bthe\s+low_scene_count\s+flag\b/gi, "too few clear scenes")
    .replace(/\blow_scene_count\b/g, "too few clear scenes")
    .replace(/\bqa_join_incomplete\b/g, "incomplete quality records")
    .replace(/\bpartial_month\b/g, "partial month coverage")
    .replace(/\breduced_qa_fallback\b/g, "reduced quality coverage")
    .replace(/\bThe\s+vegetation\s+side\s+of\s+vegetation_rainfall\b/g, "The vegetation record")
    .replace(/\bThe\s+vegetation\s+side\b/g, "The vegetation record")
    .replace(/\bvegetation_rainfall\b/g, "vegetation and rainfall")
    .replace(/\belevation_low\b/g, "the lower valley")
    .replace(/\belevation_high\b/g, "the upper valley")
    .replace(/\blow\s+elevation\s+stratum\b/gi, "lower valley")
    .replace(/\bhigh\s+elevation\s+stratum\b/gi, "upper valley")
    .replace(/\bunadjusted\s+greenness\s+trend\b/gi, "Greenness")
    .replace(/\bunadjusted\s+trend\b/gi, "greenness")
    .replace(/\bndvi_departure_area_median_leave_one_year_out\b/g, "greenness departure")
    .replace(/\bndvi_departure_area_median\b/g, "greenness departure")
    .replace(/\bprecipitation_departure_from_1991_2020_mean\b/g, "rainfall departure")
    .replace(/\bwithin\s+window\s+months\s+(\d+)\b/gi, "over a $1-month window")
    .replace(/\s*\(95%\s+interval[^)]*\)/gi, "")
    .replace(/\bmerge@\d+\b/gi, "the scoring rules")
    .replace(/\b(?:branch|hyp|ev|meas|bundle|cmd|task)_[A-Za-z0-9_-]+\b/g, "")
    .replace(/[\u2013\u2014]/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (s.length > 0) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (!/[.?!]$/.test(s)) s += ".";
  }
  return s;
}

export function statusTextOf(status: VerdictStatus): string {
  switch (status) {
    case "consistent":
      return pkg["verdict.status.consistent"].text;
    case "contradicted":
      return pkg["verdict.status.contradicted"].text;
    case "cannot_be_assessed":
      return pkg["verdict.status.cannot_be_assessed"].text;
  }
}

function findBranch(
  snapshot: CaseSnapshot,
  commandId: string,
  mb: BranchMerge["branches"][number],
): ExplanationBranch | undefined {
  const all = snapshot.records.explanationBranchRecords ?? [];
  const exact = all.find((b) => b.id === mb.branchId && b.revision === mb.branchRevision);
  if (exact) return exact;
  let byId: ExplanationBranch | undefined;
  for (const b of all) {
    if (b.id === mb.branchId && (!byId || b.revision > byId.revision)) byId = b;
  }
  if (byId) return byId;
  let byExp: ExplanationBranch | undefined;
  for (const b of all) {
    if (
      b.commandId === commandId &&
      b.explanationId === mb.explanationId &&
      (!byExp || b.revision > byExp.revision)
    ) {
      byExp = b;
    }
  }
  return byExp;
}

function pickPrediction(
  branch: ExplanationBranch | undefined,
  mb: BranchMerge["branches"][number],
): { prediction: Prediction | undefined; score: PredictionScore | undefined } {
  if (!branch || branch.predictions.length === 0) {
    return { prediction: undefined, score: undefined };
  }
  const scoreOf = (key: string) => branch.scores.find((s) => s.predictionKey === key);
  const namedKey = /\b(p[1-4])\b/i.exec(mb.reason)?.[1]?.toLowerCase();

  if (mb.status === "contradicted") {
    if (namedKey) {
      const p = branch.predictions.find((x) => x.key === namedKey);
      const s = p ? scoreOf(p.key) : undefined;
      if (p && s?.outcome === "not_met") return { prediction: p, score: s };
    }
    const necNotMet = branch.predictions.find(
      (p) => p.necessary && scoreOf(p.key)?.outcome === "not_met",
    );
    if (necNotMet) return { prediction: necNotMet, score: scoreOf(necNotMet.key) };
    const anyNotMet = branch.predictions.find((p) => scoreOf(p.key)?.outcome === "not_met");
    if (anyNotMet) return { prediction: anyNotMet, score: scoreOf(anyNotMet.key) };
  }

  if (mb.status === "consistent") {
    const necMet = branch.predictions.find((p) => p.necessary && scoreOf(p.key)?.outcome === "met");
    if (necMet) return { prediction: necMet, score: scoreOf(necMet.key) };
    const anyMet = branch.predictions.find((p) => scoreOf(p.key)?.outcome === "met");
    if (anyMet) return { prediction: anyMet, score: scoreOf(anyMet.key) };
  }

  if (mb.status === "cannot_be_assessed") {
    const fieldPred = branch.predictions.find((p) => p.test.kind === "field_check");
    if (fieldPred) return { prediction: fieldPred, score: scoreOf(fieldPred.key) };
    if (namedKey) {
      const p = branch.predictions.find((x) => x.key === namedKey);
      if (p) return { prediction: p, score: scoreOf(p.key) };
    }
    const notTestable = branch.predictions.find((p) => scoreOf(p.key)?.outcome === "not_testable");
    if (notTestable) return { prediction: notTestable, score: scoreOf(notTestable.key) };
  }

  const first = branch.predictions[0];
  return { prediction: first, score: first ? scoreOf(first.key) : undefined };
}

function formatReason(
  branch: ExplanationBranch | undefined,
  mb: BranchMerge["branches"][number],
  pred: Prediction | undefined,
  score: PredictionScore | undefined,
): string {
  const shortSpan = /not met over (\d+) period;\s*merge@\d+ needs (\d+) periods/i.exec(mb.reason);
  if (mb.status === "cannot_be_assessed") {
    if (pred?.test.kind === "field_check") {
      const checkLabel =
        pred.test.fieldCheckId === "herd_records"
          ? "herd records"
          : pred.test.fieldCheckId === "orchard_history"
            ? "orchard history"
            : pred.test.fieldCheckId
              ? pred.test.fieldCheckId.replace(/_/g, " ")
              : "field records";
      const verb = /s$/i.test(checkLabel) ? "need" : "needs";
      if (shortSpan) {
        return `One month cannot rule this out from space; ${checkLabel} ${verb} a field check.`;
      }
      if (branch?.statement && branch.statement.trim().length > 12) {
        return plainVerdictText(branch.statement);
      }
      return `Only a field check of ${checkLabel} on the ground can test this.`;
    }
    if (shortSpan) {
      const n = shortSpan[1] ?? "1";
      const req = shortSpan[2] ?? "3";
      const unit = n === "1" ? "1 month is" : `${n} months are`;
      return `The single stored period did not match, and ${unit} too short to rule out (${req} needed).`;
    }
  }

  const obs = score?.observed.trim() ?? "";
  if (obs) {
    const coMove =
      /^Months with the same sign,\s*\d+-month window:\s*ndvi_departure_area_median\s+(\d+)\s+of\s+(\d+)/i.exec(
        obs,
      );
    if (coMove) {
      return `Greenness and rainfall moved in the same direction in ${coMove[1] ?? ""} of ${coMove[2] ?? ""} months.`;
    }
    const zeroNeg = /^0 of \d+ stored values are negative .* over (.*)\.$/i.exec(obs);
    if (zeroNeg) {
      return plainVerdictText(`Greenness was not below normal in ${zeroNeg[1] ?? ""}.`);
    }
    const allNeg = /^(\d+) of \1 stored values are (negative|positive) .* over (.*)\.$/i.exec(obs);
    if (allNeg) {
      return plainVerdictText(`Recorded values were ${allNeg[2] ?? ""} in ${allNeg[3] ?? ""}.`);
    }
    const trend =
      /^Unadjusted greenness trend in (\S+) \((\d{4} to \d{4})\) is (increasing|decreasing):\s*([+-]?\d+(?:\.\d+)? per decade)/i.exec(
        obs,
      );
    if (trend) {
      const where =
        trend[1] === "elevation_low"
          ? "the lower valley"
          : trend[1] === "elevation_high"
            ? "the upper valley"
            : (trend[1] ?? "the valley");
      const verb = trend[3] === "increasing" ? "increased" : "decreased";
      return plainVerdictText(
        `Greenness in ${where} ${verb} from ${trend[2] ?? ""} (${trend[4] ?? ""}).`,
      );
    }
    const seasonSummary = /^The season summary places (.*) (above|below) normal\.$/i.exec(obs);
    if (seasonSummary) {
      const dir = (seasonSummary[2] ?? "above").toLowerCase();
      return plainVerdictText(
        `Rainfall in ${seasonSummary[1] ?? "that season"} was ${dir} normal while vegetation greenness did not follow a single-season drought drop, so rainfall alone does not explain the trend.`,
      );
    }
    const flagNone = /^(\w+) is recorded for none of (.*)\.$/i.exec(obs);
    if (flagNone) {
      return plainVerdictText(`No ${flagNone[1] ?? "flag"} was recorded in ${flagNone[2] ?? ""}.`);
    }
    const flagSome = /^(\w+) is recorded for (.*)\.$/i.exec(obs);
    if (flagSome) {
      return plainVerdictText(`${flagSome[1] ?? "Flag"} was recorded in ${flagSome[2] ?? ""}.`);
    }
    return plainVerdictText(obs);
  }

  if (branch?.statement) return plainVerdictText(branch.statement);
  return plainVerdictText(mb.reason);
}

export function verdictOf(snapshot: CaseSnapshot, commandId: string): VerdictView | null {
  const merge = commandMerge(snapshot, commandId);
  if (!merge || merge.branches.length === 0) return null;

  const causes: VerdictCause[] = merge.branches.map((mb) => {
    const branch = findBranch(snapshot, commandId, mb);
    const { prediction, score } = pickPrediction(branch, mb);
    const label = branch?.label ?? LABELS[mb.explanationId] ?? mb.explanationId.replace(/_/g, " ");
    const predText = prediction
      ? plainVerdictText(prediction.wording)
      : branch
        ? plainVerdictText(branch.statement)
        : label;
    const reason = formatReason(branch, mb, prediction, score);
    const extra = deriveBranchContext(snapshot, branch, mb);
    return {
      id: mb.explanationId,
      branchId: mb.branchId,
      label,
      status: mb.status,
      statusText: statusTextOf(mb.status),
      prediction: predText,
      reason,
      ...extra,
    };
  });

  return {
    mergeId: merge.id,
    caption: {
      ink: pformat("verdict.caption", { count: causes.length }),
      grey: null,
    },
    causes,
  };
}
