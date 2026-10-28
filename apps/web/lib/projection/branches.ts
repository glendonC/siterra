// Projection of ExplanationBranch and BranchMerge records (CMP-23, DF-07, DF-08, DF-09).
// Preserves the pre-registration revision ("Predictions Locked · Rev N"), maps each branch and prediction
// to its geometric certainty mark (dashed while locked, solid when met/consistent, cut when not met/contradicted,
// open ring when untestable/cannot be assessed), projects the minimum field plan (BranchMerge.fieldPlan),
// and computes deterministic terrain pin positions inside the catchment.

import type { BranchMerge, CaseSnapshot, ExplanationBranch } from "@siterra/contracts";
import { en, format } from "../copy/en";

export type CertaintyMark = "dashed" | "solid" | "cut" | "ring";

export interface BranchPredictionView {
  key: string;
  wording: string;
  necessary: boolean;
  outcome: "met" | "not_met" | "not_testable" | "pending";
  outcomeLabel: string;
  mark: CertaintyMark;
  observed: string | null;
  measurementIds: string[];
}

export interface BranchView {
  branchId: string;
  revision: number;
  explanationId: string;
  label: string;
  statement: string;
  status: ExplanationBranch["status"];
  statusLabel: string;
  mark: CertaintyMark;
  reason: string;
  predictionsCaseRevision: number;
  predictions: BranchPredictionView[];
  pin: { lon: number; lat: number } | null;
}

export interface FieldCheckView {
  fieldCheckId: string;
  label: string;
  separatesText: string;
  onlySeparates: [string, string][];
}

export interface ProjectedBranches {
  commandId: string;
  lockedBadge: string;
  rulesVersion: string | null;
  scored: boolean;
  branches: BranchView[];
  fieldChecks: FieldCheckView[];
  unseparatedText: string | null;
  recordIds: string[];
}

const STATUS_MARK: Record<ExplanationBranch["status"], CertaintyMark> = {
  predicted: "dashed",
  consistent: "solid",
  contradicted: "cut",
  cannot_be_assessed: "ring",
};

const OUTCOME_MARK: Record<BranchPredictionView["outcome"], CertaintyMark> = {
  pending: "dashed",
  met: "solid",
  not_met: "cut",
  not_testable: "ring",
};

function catchmentCenter(s: CaseSnapshot): { lon: number; lat: number } | null {
  const g = s.records.geoSelectionRecords.find((x) => x.id === s.case.activeGeoSelectionId);
  const ring = g?.geometry?.coordinates[0];
  if (!ring || ring.length === 0) return null;
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return {
    lon: (Math.min(...lons) + Math.max(...lons)) / 2,
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
  };
}

/** Deterministic offsets inside the catchment so up to 5 branch pins stand apart on the terrain. */
const PIN_OFFSETS: readonly [number, number][] = [
  [-0.04, 0.015],
  [0.035, 0.02],
  [0.0, -0.018],
  [-0.07, -0.01],
  [0.065, -0.008],
];

function formatPairList(
  pairs: readonly (readonly [string, string])[],
  labels: ReadonlyMap<string, string>,
): string {
  return pairs.map(([a, b]) => `${labels.get(a) ?? a} vs ${labels.get(b) ?? b}`).join(", ");
}

export function projectBranches(
  s: CaseSnapshot,
  commandId?: string,
): ProjectedBranches | undefined {
  const allBranches = s.records.explanationBranchRecords ?? [];
  if (allBranches.length === 0) return undefined;
  const targetCommandId =
    commandId && allBranches.some((b) => b.commandId === commandId)
      ? commandId
      : allBranches.at(-1)?.commandId;
  if (!targetCommandId) return undefined;

  const branches = allBranches.filter((b) => b.commandId === targetCommandId);
  if (branches.length === 0) return undefined;

  const merge: BranchMerge | undefined = (s.records.branchMergeRecords ?? []).findLast(
    (m) => m.commandId === targetCommandId,
  );
  const mergeByBranch = new Map(merge?.branches.map((b) => [b.branchId, b]) ?? []);
  const labelByExplanation = new Map(branches.map((b) => [b.explanationId, b.label]));
  const center = catchmentCenter(s);

  const branchViews: BranchView[] = branches.map((b, i) => {
    const merged = mergeByBranch.get(b.id);
    const status: ExplanationBranch["status"] = merged?.status ?? b.status;
    const reason = merged?.reason ?? b.statusReason;
    const rev = b.predictionsCaseRevision ?? merge?.predictionsCaseRevision ?? b.revision;
    const scoreByKey = new Map(b.scores.map((sc) => [sc.predictionKey, sc]));
    const predictions: BranchPredictionView[] = b.predictions.map((p) => {
      const sc = scoreByKey.get(p.key);
      const outcome: BranchPredictionView["outcome"] = sc?.outcome ?? "pending";
      return {
        key: p.key,
        wording: p.wording,
        necessary: p.necessary,
        outcome,
        outcomeLabel: en[`branches.outcome.${outcome}`].text,
        mark: OUTCOME_MARK[outcome],
        observed: sc?.observed ?? null,
        measurementIds: sc?.measurementIds ?? [],
      };
    });
    const offset = PIN_OFFSETS[i % PIN_OFFSETS.length] ?? [0, 0];
    const pin = center
      ? {
          lon: Number((center.lon + offset[0]).toFixed(5)),
          lat: Number((center.lat + offset[1]).toFixed(5)),
        }
      : null;

    return {
      branchId: b.id,
      revision: b.revision,
      explanationId: b.explanationId,
      label: b.label,
      statement: b.statement,
      status,
      statusLabel: en[`branches.status.${status}`].text,
      mark: STATUS_MARK[status],
      reason,
      predictionsCaseRevision: rev,
      predictions,
      pin,
    };
  });

  const lockRev =
    merge?.predictionsCaseRevision ?? branchViews[0]?.predictionsCaseRevision ?? s.case.revision;
  const fieldPlan = merge?.fieldPlan;
  const fieldChecks: FieldCheckView[] = (fieldPlan?.measurements ?? []).map((m) => ({
    fieldCheckId: m.fieldCheckId,
    label: m.label,
    separatesText: format("branches.separates", {
      pairs: formatPairList(m.separates, labelByExplanation),
    }),
    onlySeparates: m.onlySeparates,
  }));
  const unseparatedText =
    fieldPlan && fieldPlan.unseparated.length > 0
      ? format("branches.unseparated", {
          pairs: formatPairList(fieldPlan.unseparated, labelByExplanation),
        })
      : null;

  return {
    commandId: targetCommandId,
    lockedBadge: format("branches.locked", { rev: lockRev }),
    rulesVersion: merge?.rulesVersion ?? null,
    scored: merge !== undefined || branchViews.some((b) => b.status !== "predicted"),
    branches: branchViews,
    fieldChecks,
    unseparatedText,
    recordIds: [...branchViews.map((b) => b.branchId), ...(merge ? [merge.id] : [])],
  };
}
