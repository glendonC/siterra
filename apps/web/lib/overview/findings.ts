// The overview's five findings (approved specimen D4): each sits at a fixed clock angle on the arc and shows one
// Measurement that an instrument spec's caption cites, formatted as the instruments format it. No number is
// written here: a finding whose spec or Measurement the case does not hold is left out, not filled in.

import type { CaseSnapshot, InstrumentListing, InstrumentSpec } from "@siterra/contracts";
import { metres, percent, fixed, signed } from "../instruments/format";
import { instrumentOf } from "../instruments/listing";

export type FindingId = "catchment" | "band" | "pixel" | "rain" | "fdr";
export type InstrumentKind = InstrumentSpec["parameters"]["kind"];

interface Plan {
  id: FindingId;
  /** Clock degrees on the arc: 0 at the top, clockwise. */
  clock: number;
  tone: "green" | "blue";
  /** The instrument the finding opens, and the caption citation that gives its number. */
  kind: InstrumentKind;
  citation: number;
  form: "trend" | "rSquared" | "share";
}

/** D4's clock and tone for each finding; the citations as the instrument specs order them. */
export const FINDINGS: readonly Plan[] = [
  { id: "catchment", clock: 306, tone: "green", kind: "layer_stack", citation: 0, form: "trend" },
  { id: "band", clock: 32, tone: "green", kind: "cross_section", citation: 0, form: "trend" },
  { id: "pixel", clock: 52, tone: "green", kind: "pixel_anatomy", citation: 0, form: "trend" },
  { id: "rain", clock: 112, tone: "blue", kind: "rainfall_scatter", citation: 0, form: "rSquared" },
  { id: "fdr", clock: 280, tone: "green", kind: "layer_stack", citation: 1, form: "share" },
];

export interface Finding {
  id: FindingId;
  clock: number;
  tone: "green" | "blue";
  kind: InstrumentKind;
  /** The Measurement shown, with its value as recorded and as displayed. */
  measurementId: string;
  value: number;
  display: string;
}

const FORMS: Record<Plan["form"], (v: number) => string> = {
  // a trend per decade, signed, 4 decimals; R squared, 3 decimals; a share as a per cent, 1 decimal
  trend: (v) => signed(v, 4),
  rSquared: (v) => fixed(v, 3),
  share: (v) => percent(v, 1),
};

type Measurement = CaseSnapshot["records"]["measurementRecords"][number];

function measurement(snapshot: CaseSnapshot, id: string | undefined): Measurement | undefined {
  const m = snapshot.records.measurementRecords.find((x) => x.id === id);
  return m && m.status === "available" && m.value !== null ? m : undefined;
}

export interface CaseFindings {
  findings: Finding[];
  /** The lower elevation band limit as the cross section spec cites it: metres, and as displayed ("2,317"). */
  bandLimit: { value: number; display: string } | null;
}

/** The findings the case can show, in D4's order, from the instrument specs' caption citations. */
export function findingsFrom(snapshot: CaseSnapshot, listing: InstrumentListing): CaseFindings {
  const findings: Finding[] = [];
  for (const plan of FINDINGS) {
    const view = instrumentOf(listing, plan.kind);
    const m = measurement(snapshot, view?.spec.caption.citationIds[plan.citation]);
    if (!m || m.value === null) continue;
    findings.push({
      id: plan.id,
      clock: plan.clock,
      tone: plan.tone,
      kind: plan.kind,
      measurementId: m.id,
      value: m.value,
      display: FORMS[plan.form](m.value),
    });
  }
  // the band's limit: the elevation band limit among the cross section's citations
  const section = instrumentOf(listing, "cross_section");
  const limit = section?.spec.caption.citationIds
    .map((id) => measurement(snapshot, id))
    .find((m) => m?.metric === "elevation_band_limit");
  return {
    findings,
    bandLimit:
      limit?.value !== undefined && limit.value !== null
        ? { value: limit.value, display: metres(limit.value) }
        : null,
  };
}
