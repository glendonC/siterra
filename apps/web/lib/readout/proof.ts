// What the land shows behind the readout's answer: the measured sheet the claim itself reads, lifted with its own
// caption. Only a claim that reads a mapped measurement has one; an answer from merge statuses has none, since the
// tests behind a status compare series over the whole area, not places, and a map would claim otherwise.

import type { CaseSnapshot } from "@siterra/contracts";
import type { LiftId } from "../overview/scene/overview-sheets";

type Measurement = CaseSnapshot["records"]["measurementRecords"][number];

/** The lifted sheet that draws a measurement's metric, or null for a metric no sheet draws. */
export function sheetOfMetric(metric: string): LiftId | null {
  if (/^area_share_(upward|downward)_fdr$/.test(metric) || /^ndvi_trend/.test(metric))
    return "trend";
  if (/^precipitation_/.test(metric)) return "rain";
  return null;
}

/** The sheet that proves the answer: the one every measurement its claim reads is drawn on; else none. */
export function proofSheet(
  snapshot: CaseSnapshot,
  answer: { claimKind: "measurement" | "status" | null; claimIds: readonly string[] },
): LiftId | null {
  if (answer.claimKind !== "measurement" || answer.claimIds.length === 0) return null;
  const read = answer.claimIds
    .map((id) => snapshot.records.measurementRecords.find((m: Measurement) => m.id === id))
    .map((m) => (m ? sheetOfMetric(m.metric) : null));
  const first = read[0] ?? null;
  return first !== null && read.every((s) => s === first) ? first : null;
}
