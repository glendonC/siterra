// The Region Pack the case loads: its name, active data layers, observation window, checks and status,
// all from the case record. Bundle status "validated" means the automated data checks passed, not field
// validation, so the pack says "passed automated data checks" and never "validated". Nothing is verified
// in the field until accepted verified-outcome evidence exists.

import type { CaseSnapshot } from "@siterra/contracts";
import { en, format, type MessageId } from "../copy/en";
import { periodLabel } from "../projection/observations";

export interface RegionPack {
  name: string;
  /** Labels of the bundles that are not superseded. */
  layers: string[];
  /** "Jan 2019 to Dec 2025, 84 months", or undefined when no bundle names a period. */
  window?: string;
  /** Compact year span for the command context chip, e.g. "2019 to 2025". */
  periodSpan?: string;
  checks: string;
  /** Data state and field state, " · " between. */
  status: string;
}

export function regionPack(s: CaseSnapshot): RegionPack {
  const active = s.records.dataBundleRecords.filter((b) => b.status !== "superseded");
  const periods = [...new Set(active.flatMap((b) => b.periodIds))].sort();
  const first = periods[0];
  const last = periods.at(-1);
  const passed = active.filter((b) => b.status === "validated").length;
  const data: MessageId = active.some((b) => b.status === "failed")
    ? "pack.checksFailed"
    : passed < active.length || active.length === 0
      ? "pack.checksPending"
      : "pack.realData";
  const verified = s.records.evidenceRecords.some(
    (e) => e.claimKind === "verified_outcome" && e.status === "accepted",
  );
  return {
    name: s.case.title,
    layers: active.map((b) => b.label),
    ...(first && last
      ? {
          window: format("pack.windowValue", {
            first: periodLabel(first),
            last: periodLabel(last),
            n: periods.length,
          }),
          periodSpan: `${/\d{4}/.exec(first)?.[0] ?? periodLabel(first)} to ${/\d{4}/.exec(last)?.[0] ?? periodLabel(last)}`,
        }
      : {}),
    checks: format("pack.checksValue", { passed, total: active.length }),
    status: format("pack.status", {
      data: en[data].text,
      field: en[verified ? "pack.verifiedOutcome" : "pack.fieldUnverified"].text,
    }),
  };
}
