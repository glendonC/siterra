// The Observations section from committed measurements: for each bundle that measures the catchment
// month by month, how many months were observed, over which period, under the bundle's own label.
// Counts and periods come from the records; nothing is computed beyond counting them.

import type { CaseSnapshot } from "@siterra/contracts";

/** The metric that stands for each monthly bundle in the summary. */
const PRIMARY_METRICS = ["precipitation_catchment_total", "ndvi_area_median"] as const;

export interface ObservationLine {
  bundleId: string;
  label: string;
  metric: (typeof PRIMARY_METRICS)[number];
  available: number;
  total: number;
  /** "Jan 2019" style, from period IDs (period_YYYY-MM). */
  first: string;
  last: string;
  measurementIds: string[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "period_2019-01" as "Jan 2019"; other IDs as they are. */
export function periodLabel(periodId: string): string {
  const m = /^period_(\d{4})-(\d{2})$/.exec(periodId);
  if (!m) return periodId;
  return `${MONTHS[Number(m[2]) - 1] ?? m[2] ?? ""} ${m[1] ?? ""}`;
}

export function projectObservations(s: CaseSnapshot): ObservationLine[] {
  const out: ObservationLine[] = [];
  for (const b of s.records.dataBundleRecords) {
    if (b.status !== "validated") continue;
    for (const metric of PRIMARY_METRICS) {
      const ms = s.records.measurementRecords
        .filter((m) => m.dataBundleId === b.id && m.metric === metric)
        .sort((a, c) => a.periodId.localeCompare(c.periodId));
      const first = ms[0];
      const last = ms.at(-1);
      if (!first || !last) continue;
      out.push({
        bundleId: b.id,
        label: b.label,
        metric,
        available: ms.filter((m) => m.status === "available").length,
        total: ms.length,
        first: periodLabel(first.periodId),
        last: periodLabel(last.periodId),
        measurementIds: ms.map((m) => m.id),
      });
    }
  }
  return out;
}
