// The overview's five findings (approved specimen D4): each sits at a fixed clock angle on the arc and shows one
// Measurement that an instrument spec's caption cites, formatted as the instruments format it. No number is
// written here: a finding whose spec or Measurement the case does not hold is left out, not filled in.

import type { CaseSnapshot, InstrumentListing, InstrumentSpec } from "@siterra/contracts";
import { en, format } from "../copy/en";
import { metres, percent, fixed, signed } from "../instruments/format";
import { instrumentOf } from "../instruments/listing";
import { periodOf, type Period } from "../land/season";

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
  /** The measurement's period as its record names it: its years and season window (U25: every place its own). */
  period: Period | null;
  /** A share's direction as its Measurement's metric names it (upward greening, downward browning); null otherwise. */
  direction: "up" | "down" | null;
  /**
   * The opposite share, where the caption cites it next (a direction-neutral place's record holds both): its own
   * Measurement, displayed as the first is; null otherwise.
   */
  pair: { measurementId: string; display: string; direction: "up" | "down" | null } | null;
}

/** The direction a share's metric names ("area_share_upward_fdr"); none for any other metric. */
const directionOf = (plan: Plan, metric: string): Finding["direction"] =>
  plan.form !== "share"
    ? null
    : /(^|_)upward(_|$)/.test(metric)
      ? "up"
      : /(^|_)downward(_|$)/.test(metric)
        ? "down"
        : null;

const FORMS: Record<Plan["form"], (v: number) => string> = {
  // a trend per decade, signed, 4 decimals; R squared, 3 decimals; a share as a per cent, 1 decimal
  trend: (v) => signed(v, 4),
  rSquared: (v) => fixed(v, 3),
  share: (v) => percent(v, 1),
};

type Measurement = CaseSnapshot["records"]["measurementRecords"][number];

/** A share's direction in words: greening, browning, or with a trend. */
export function directionWord(direction: Finding["direction"] | undefined): string {
  return en[
    direction === "up"
      ? "overview.fdr.up"
      : direction === "down"
        ? "overview.fdr.down"
        : "overview.fdr.none"
  ].text;
}

/** A share finding as words: "24.7% greening", or both shares where the record holds both (U25b). */
export function sharesWords(f: Pick<Finding, "display" | "direction" | "pair">): string {
  const one = format("overview.fdr.share", {
    value: f.display,
    direction: directionWord(f.direction),
  });
  return f.pair
    ? format("overview.fdr.both", {
        first: one,
        second: format("overview.fdr.share", {
          value: f.pair.display,
          direction: directionWord(f.pair.direction),
        }),
      })
    : one;
}

/** Each finding's caption lines under its number on the arc: plain words first, with dynamic scoping baseline context when allFindings is provided. */
export function captionOf(
  f: Finding,
  bandLimit: string,
  allFindings?: readonly Finding[],
): string[] {
  const line1 = (() => {
    switch (f.id) {
      case "catchment":
        return en["overview.finding.catchment.1"].text;
      case "band":
        return format("overview.finding.band.1", { limit: bandLimit });
      case "pixel":
        return en["overview.finding.pixel.1"].text;
      case "rain":
        return en["overview.finding.rain.1"].text;
      case "fdr":
        return f.pair
          ? en["overview.finding.fdr.pair.1"].text
          : format("overview.finding.fdr.1", { direction: directionWord(f.direction) });
    }
  })();

  if (!allFindings) return [line1];

  const catchment = allFindings.find((x) => x.id === "catchment");
  switch (f.id) {
    case "catchment": {
      const pctDec = `${signed(f.value * 100, 2)}%/dec`;
      const dir =
        f.value > 0.0005
          ? `${pctDec} · net greening masks upper-slope pressure`
          : f.value < -0.0005
            ? `${pctDec} · net browning across full watershed`
            : `${pctDec} · near-stable watershed cover`;
      return [line1, dir];
    }
    case "band": {
      const pctDec = `${signed(f.value * 100, 2)}%/dec`;
      const base = catchment?.value ?? 0;
      const fasterPct =
        Math.abs(base) > 0.0005
          ? Math.round(((Math.abs(f.value) - Math.abs(base)) / Math.abs(base)) * 100)
          : null;
      const detail =
        fasterPct !== null && fasterPct > 5
          ? `${pctDec} · ${String(fasterPct)}% faster on irrigated valley floor`
          : `${pctDec} · lower valley-floor & terrace zone`;
      return [line1, detail];
    }
    case "pixel": {
      const pctDec = `${signed(f.value * 100, 2)}%/dec`;
      return [line1, `${pctDec} · mixes grass & shrubs (needs ground check)`];
    }
    case "rain": {
      const pctRain = percent(f.value, 1);
      const pctOther = percent(Math.max(0, 1 - f.value), 1);
      return [line1, `${pctRain} rain · ${pctOther} land use, snowmelt & grazing`];
    }
    case "fdr":
      return [line1, "Statistically confirmed cells (Benjamini-Hochberg FDR)"];
  }
}

/** The share the caption cites after a share, when it names the other direction (U25b). */
function pairOf(
  snapshot: CaseSnapshot,
  plan: Plan,
  id: string | undefined,
  firstMetric: string,
): Finding["pair"] {
  if (plan.form !== "share") return null;
  const m = measurement(snapshot, id);
  if (!m || m.value === null) return null;
  const direction = directionOf(plan, m.metric);
  const first = directionOf(plan, firstMetric);
  if (direction === null || first === null || direction === first) return null;
  return { measurementId: m.id, display: FORMS.share(m.value), direction };
}

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
      period: periodOf(m.periodId),
      direction: directionOf(plan, m.metric),
      pair: pairOf(snapshot, plan, view?.spec.caption.citationIds[plan.citation + 1], m.metric),
    });
  }
  // the band's limit: the one the cross section's caption cites, a band limit or the transect's crossing of it
  // (P7b-9 names the transect's crossing apart from the strata's limits)
  const section = instrumentOf(listing, "cross_section");
  const limit = section?.spec.caption.citationIds
    .map((id) => measurement(snapshot, id))
    .find(
      (m) =>
        m?.metric === "elevation_band_limit" || m?.metric === "transect_band_crossing_boundary",
    );
  return {
    findings,
    bandLimit:
      limit?.value !== undefined && limit.value !== null
        ? { value: limit.value, display: metres(limit.value) }
        : null,
  };
}
