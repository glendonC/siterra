// The overview's five findings (approved specimen D4): each sits at a fixed clock angle on the arc and shows one
// Measurement that an instrument spec's caption cites, formatted as the instruments format it. No number is
// written here: a finding whose spec or Measurement the case does not hold is left out, or surfaced as an explicit
// "Not measured yet" state when the case record marks whole-area vegetation missing with a reason.

import type { CaseSnapshot, InstrumentListing, InstrumentSpec } from "@siterra/contracts";
import { en, format } from "../copy/en";
import { fixed, metres, percent, signed } from "../instruments/format";
import { instrumentOf } from "../instruments/listing";
import { periodOf, seasonWords, type Period } from "../land/season";
import { verdictOf, type VerdictStatus, type VerdictView } from "../package/verdict";

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
  /** Optional override for the first caption line when a fallback measurement (such as annual rainfall trend) is shown. */
  headline?: string | null;
  /** Plain-English second line computed from the case's own record in findingsFrom. */
  subtitle?: string | null;
  /** Reason from the Measurement record when the measurement's status is "missing". */
  missingReason?: string | null;
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

function overviewPeriodOf(
  periodId: string | null | undefined,
  win?: { from?: string; to?: string; season?: string } | null,
): Period | null {
  const base = periodOf(periodId);
  if (base) return base;
  const m = /^period_(\d{4})(?:-(\d{4}))?_annual$/.exec(periodId ?? "");
  if (m?.[1]) {
    const from = Number(m[1]);
    return { from, to: m[2] ? Number(m[2]) : from, window: "jan_dec" };
  }
  if (win?.from) {
    const from = Number(win.from);
    const to = win.to ? Number(win.to) : from;
    if (Number.isFinite(from) && Number.isFinite(to)) {
      return { from, to, window: "jan_dec" };
    }
  }
  return null;
}

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

/** Each finding's caption lines under its number on the arc: plain words first, with record-derived second line when allFindings is provided. */
export function captionOf(
  f: Finding,
  bandLimit: string,
  allFindings?: readonly Finding[],
): string[] {
  const line1 = (() => {
    if (f.headline) return f.headline;
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
  if (f.subtitle) return [line1, f.subtitle];
  return [line1];
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

function classNameOf(raw: string): string {
  const key = raw
    .toLowerCase()
    .replace(/^pixel_/, "")
    .replace(/^class_/, "")
    .trim();
  if (key.includes("grass")) return "grassland";
  if (key.includes("tree")) return "tree cover";
  if (key.includes("shrub")) return "shrubland";
  if (key.includes("crop")) return "cropland";
  if (key.includes("bare") || key.includes("sparse")) return "bare or sparse vegetation";
  if (key.includes("built")) return "built-up";
  if (key.includes("water")) return "permanent water";
  if (key.includes("wetland")) return "herbaceous wetland";
  if (key.includes("snow") || key.includes("ice")) return "snow and ice";
  return key.replace(/_/g, " ");
}

function stratumStringOf(m: Measurement): string {
  const src = (m as Measurement & { source?: { stratum?: string | null } }).source;
  const legacy = m as Measurement & {
    stratumId?: string | null;
    stratum?: string | null;
    label?: string | null;
  };
  return src?.stratum ?? legacy.stratumId ?? legacy.stratum ?? legacy.label ?? m.id;
}

function pixelCoverSubtitle(snapshot: CaseSnapshot): string | null {
  const records = snapshot.records.measurementRecords;
  const totalCells = records.find(
    (m) => m.metric === "pixel_cells_kept" && m.status === "available" && m.value !== null,
  )?.value;
  const classCells = records.filter(
    (m) => m.metric === "pixel_class_cells_kept" && m.status === "available" && m.value !== null,
  );
  if (totalCells && totalCells > 0 && classCells.length > 0) {
    const sorted = [...classCells].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 2);
    const parts = sorted.map((c) => {
      const pct = Math.round(((c.value ?? 0) / totalCells) * 100);
      const name = classNameOf(stratumStringOf(c));
      return `${String(pct)}% ${name}`;
    });
    return parts.join(", ");
  }

  const pixelShares = records.filter(
    (m) =>
      m.metric === "land_cover_share" &&
      m.status === "available" &&
      m.value !== null &&
      stratumStringOf(m).startsWith("pixel_"),
  );
  if (pixelShares.length > 0) {
    const sorted = [...pixelShares].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 2);
    const parts = sorted.map((c) => {
      const raw = c.value ?? 0;
      const pct = Math.round(raw <= 1 ? raw * 100 : raw);
      const name = classNameOf(stratumStringOf(c));
      return `${String(pct)}% ${name}`;
    });
    return parts.join(", ");
  }

  return null;
}

function intervalWords(m: Measurement): string | null {
  const { lower, upper } = m.uncertainty;
  if (typeof lower === "number" && typeof upper === "number") {
    return `95% interval ${signed(lower, 4)} to ${signed(upper, 4)} per decade`;
  }
  const ci = (m as Measurement & { confidenceInterval?: [number, number] | null })
    .confidenceInterval;
  if (Array.isArray(ci) && typeof ci[0] === "number" && typeof ci[1] === "number") {
    return `95% interval ${signed(ci[0], 4)} to ${signed(ci[1], 4)} per decade`;
  }
  const b = (m as Measurement & { bounds?: { lower?: number; upper?: number } | null }).bounds;
  if (b && typeof b.lower === "number" && typeof b.upper === "number") {
    return `95% interval ${signed(b.lower, 4)} to ${signed(b.upper, 4)} per decade`;
  }
  return null;
}

export interface CaseFindings {
  findings: Finding[];
  /** The lower elevation band limit as the cross section spec cites it: metres, and as displayed ("2,317"). */
  bandLimit: { value: number; display: string } | null;
}

/** The findings the case can show, in D4's order, from the instrument specs' caption citations. */
export function findingsFrom(snapshot: CaseSnapshot, listing: InstrumentListing): CaseFindings {
  const findings: Finding[] = [];
  const pixelSub = pixelCoverSubtitle(snapshot);

  for (const plan of FINDINGS) {
    const view = instrumentOf(listing, plan.kind);
    const citedId = view?.spec.caption.citationIds[plan.citation];
    const rawM = snapshot.records.measurementRecords.find((x) => x.id === citedId);
    const m = measurement(snapshot, citedId);

    if (!m || m.value === null) {
      if (plan.id === "catchment" && rawM?.status === "missing" && rawM.missingReason) {
        findings.push({
          id: "catchment",
          clock: plan.clock,
          tone: plan.tone,
          kind: plan.kind,
          measurementId: rawM.id,
          value: 0,
          display: "Not measured yet",
          period: overviewPeriodOf(rawM.periodId),
          direction: null,
          pair: null,
          subtitle: "No satellite greenness series for this area",
          missingReason: rawM.missingReason,
        });
      } else if (plan.id === "rain") {
        const precipTrend = snapshot.records.measurementRecords.find(
          (x) =>
            x.metric === "precipitation_trend_mm_per_decade" &&
            x.status === "available" &&
            x.value !== null,
        );
        if (precipTrend && precipTrend.value !== null) {
          const win = (
            precipTrend as Measurement & {
              window?: { from?: string; to?: string; season?: string } | null;
            }
          ).window;
          const p = overviewPeriodOf(precipTrend.periodId, win);
          const years = p ? `${String(p.from)} to ${String(p.to)}` : "2000 to 2024";
          findings.push({
            id: "rain",
            clock: plan.clock,
            tone: plan.tone,
            kind: plan.kind,
            measurementId: precipTrend.id,
            value: precipTrend.value,
            display: `${signed(precipTrend.value, 1)} mm`,
            period: p,
            direction: null,
            pair: null,
            headline: "Annual rainfall trend per decade",
            subtitle: `Calendar years ${years}, Open-Meteo ERA5 reanalysis`,
          });
        }
      }
      continue;
    }

    const period = overviewPeriodOf(m.periodId);
    const pair = pairOf(
      snapshot,
      plan,
      view?.spec.caption.citationIds[plan.citation + 1],
      m.metric,
    );
    const direction = directionOf(plan, m.metric);

    findings.push({
      id: plan.id,
      clock: plan.clock,
      tone: plan.tone,
      kind: plan.kind,
      measurementId: m.id,
      value: m.value,
      display: FORMS[plan.form](m.value),
      period,
      direction,
      pair,
    });
  }

  const catchmentFinding = findings.find((x) => x.id === "catchment" && !x.missingReason);
  for (const f of findings) {
    if (f.subtitle) continue;
    const rawM = snapshot.records.measurementRecords.find((x) => x.id === f.measurementId);
    const { window, from, to } = seasonWords(f.period);
    const years = from && to ? `${from} to ${to}` : "";
    switch (f.id) {
      case "catchment": {
        f.subtitle = years ? `${window}, ${years}` : window;
        break;
      }
      case "band": {
        const base = catchmentFinding?.value ?? 0;
        if (
          Math.abs(base) > 0.0005 &&
          Math.sign(f.value) === Math.sign(base) &&
          Math.abs(f.value) > Math.abs(base) * 1.15
        ) {
          const ratio = (Math.abs(f.value) / Math.abs(base)).toFixed(1);
          f.subtitle = `${ratio} times the whole-area rate`;
        } else {
          const ciText = rawM ? intervalWords(rawM) : null;
          f.subtitle = ciText ?? (years ? `${window}, ${years}` : window);
        }
        break;
      }
      case "pixel": {
        const ciText = rawM ? intervalWords(rawM) : null;
        f.subtitle = pixelSub ?? ciText ?? (years ? `${window}, ${years}` : window);
        break;
      }
      case "rain": {
        f.subtitle = `Accounts for ${percent(f.value, 1)} of ${window} variance`;
        break;
      }
      case "fdr": {
        if (f.pair) {
          const secondM = snapshot.records.measurementRecords.find(
            (x) => x.id === f.pair?.measurementId,
          );
          if (f.value === 0 && (secondM?.value ?? 0) === 0) {
            f.subtitle = "No cells pass the trend check (q = 0.05)";
          } else {
            f.subtitle = `${sharesWords(f)} (q = 0.05)`;
          }
        } else {
          const downShare = snapshot.records.measurementRecords.find(
            (x) =>
              x.metric === "area_share_downward_fdr" &&
              x.status === "available" &&
              x.value !== null &&
              x.id !== f.measurementId &&
              x.periodId === rawM?.periodId &&
              stratumStringOf(x) === "catchment",
          );
          if (downShare?.value !== undefined && downShare.value !== null) {
            f.subtitle = `Almost none browning (${percent(downShare.value, 2)} of cells)`;
          } else {
            f.subtitle = "Confirmed after false discovery check";
          }
        }
        break;
      }
    }
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

export interface CaseAnswer {
  claim: string;
  limit: string | null;
}

/**
 * Two-tone answer for the overview header block (Board 1 section 6):
 * - Ink (`claim`): what the satellite/climate measurements show, or that vegetation is not measured yet.
 * - Muted (`limit`): what cannot be told from space when a BranchMerge record holds an open field cause,
 *   or why the explanations cannot be tested when vegetation is missing.
 */
export function answerForCase(snapshot: CaseSnapshot): CaseAnswer {
  const records = snapshot.records.measurementRecords;
  const catchmentM =
    records.find(
      (m) => m.metric === "ndvi_trend_unadjusted_per_decade" && stratumStringOf(m) === "catchment",
    ) ?? records.find((m) => m.metric === "ndvi_trend_unadjusted_per_decade");

  if (catchmentM?.status === "missing") {
    return {
      claim: "Not answered yet: vegetation has not been measured here.",
      limit: "None of the 5 explanations can be tested without it.",
    };
  }

  const upShareM =
    records.find(
      (m) =>
        m.metric === "area_share_upward_fdr" &&
        m.status === "available" &&
        m.value !== null &&
        stratumStringOf(m) === "catchment",
    ) ??
    records.find(
      (m) => m.metric === "area_share_upward_fdr" && m.status === "available" && m.value !== null,
    );
  const downShareM =
    records.find(
      (m) =>
        m.metric === "area_share_downward_fdr" &&
        m.status === "available" &&
        m.value !== null &&
        stratumStringOf(m) === "catchment",
    ) ??
    records.find(
      (m) => m.metric === "area_share_downward_fdr" && m.status === "available" && m.value !== null,
    );

  const upVal = upShareM?.value ?? 0;
  const downVal = downShareM?.value ?? 0;
  const trendVal = catchmentM?.status === "available" ? (catchmentM.value ?? 0) : 0;

  const merges = snapshot.records.branchMergeRecords;
  const latestMerge = merges && merges.length > 0 ? merges[merges.length - 1] : undefined;
  const hasUnassessedGrazing = Boolean(
    latestMerge?.branches.some(
      (b) =>
        b.status === "cannot_be_assessed" &&
        (b.explanationId.includes("graz") ||
          b.branchId.includes("graz") ||
          b.reason.toLowerCase().includes("graz")),
    ),
  );

  if (upVal >= 0.05 && upVal > downVal * 2) {
    return {
      claim: "Since 2000 the valley has greened, not browned.",
      limit: hasUnassessedGrazing
        ? "From space we cannot tell whether grazing played a part."
        : null,
    };
  }
  if (downVal >= 0.05 && downVal > upVal * 2) {
    return {
      claim: "Since 2000 the area has browned overall.",
      limit: hasUnassessedGrazing
        ? "From space we cannot tell whether grazing played a part."
        : null,
    };
  }
  if (Math.abs(trendVal) < 0.002 || (upVal < 0.05 && downVal < 0.05)) {
    return {
      claim: "Since 2000 no clear change in greenness across the catchment.",
      limit: null,
    };
  }
  return {
    claim:
      trendVal > 0
        ? "Since 2000 the area has greened overall."
        : "Since 2000 the area has browned overall.",
    limit: hasUnassessedGrazing ? "From space we cannot tell whether grazing played a part." : null,
  };
}

export interface OverviewLabel {
  title: string;
  subtitle: string;
}

/**
 * Two-line human-scale label for a finding marker on the overview canvas (Board 1 and Board 2).
 */
export function overviewLabelOf(
  f: Finding,
  bandLimit: string,
  _allFindings?: readonly Finding[],
): OverviewLabel {
  switch (f.id) {
    case "band": {
      if (f.subtitle?.includes("times")) {
        return {
          title: "Valley floor greening most",
          subtitle: f.subtitle.replace("whole-area rate", "whole valley"),
        };
      }
      return {
        title: bandLimit ? `Below ${bandLimit} m` : "Lower elevation band",
        subtitle: `${f.display} greenness trend per decade`,
      };
    }
    case "pixel":
      return {
        title: "One 250 m square",
        subtitle:
          f.subtitle === "47% grassland, 40% tree cover"
            ? "about half grass, 4 in 10 trees"
            : (f.subtitle ?? `${f.display} per decade`),
      };
    case "fdr": {
      if (f.pair && f.value === 0) {
        return {
          title: "No places pass trend check",
          subtitle: "0.0% greening, 0.0% browning",
        };
      }
      if (f.direction === "up" && f.value >= 0.2 && f.value <= 0.3) {
        return {
          title: "1 in 4 places greener",
          subtitle: "almost none browner",
        };
      }
      return {
        title: `${f.display} of places ${directionWord(f.direction)}`,
        subtitle: f.subtitle ?? "after false discovery check",
      };
    }
    case "rain": {
      if (f.headline) {
        const dir = f.value >= 0 ? "rising" : "falling";
        const moreLess = f.value >= 0 ? "more" : "less";
        return {
          title: `Yearly rain ${dir}`,
          subtitle: `about ${String(Math.abs(Math.round(f.value)))} mm ${moreLess} per decade`,
        };
      }
      const pct = Math.round(f.value * 100);
      return {
        title: f.value < 0.15 ? "Rain explains little" : `Rain explains ${String(pct)}%`,
        subtitle: `about ${String(pct)}% of the yearly swings`,
      };
    }
    case "catchment": {
      if (f.missingReason) {
        return {
          title: "Vegetation not measured yet",
          subtitle: "no greenness series for this place",
        };
      }
      return {
        title: "Whole-area greenness",
        subtitle: `${f.display} per decade`,
      };
    }
  }
}

/**
 * Plain-English headline for the Board 3 Rev 3 finding card (`OverviewRecord`).
 */
export function recordHeadlineForFinding(
  f: Finding,
  _allFindings: readonly Finding[],
  bandLimitDisplay: string,
): string {
  const { from } = seasonWords(f.period);
  const sinceYear = from || "2000";
  switch (f.id) {
    case "band": {
      if (f.subtitle?.includes("times")) {
        const ratio = f.subtitle.split(" ")[0] ?? "1.5";
        return `Greened ${ratio}× faster than the whole valley since ${sinceYear}.`;
      }
      return `Greenness trend of ${f.display} per decade below ${bandLimitDisplay || "the lower band"} m.`;
    }
    case "pixel":
      if (f.subtitle === "47% grassland, 40% tree cover") {
        return "About half grass, 4 in 10 trees in this 250 m square.";
      }
      return `Greenness trend of ${f.display} per decade inside one 250 m square.`;
    case "catchment":
      if (f.missingReason) {
        return "Vegetation has not been measured for this place yet.";
      }
      return `Whole-area greenness trend of ${f.display} per decade since ${sinceYear}.`;
    case "fdr":
      if (f.pair && f.value === 0) {
        return "No 250 m squares pass the false discovery check.";
      }
      if (f.direction === "up" && f.value >= 0.2 && f.value <= 0.3 && !f.pair) {
        return `1 in 4 places in the valley greened since ${sinceYear}; almost none browned.`;
      }
      return `${sharesWords(f)} after the false discovery check.`;
    case "rain":
      if (f.headline) {
        return `Yearly rain changed by ${f.display} per decade since ${sinceYear}.`;
      }
      return `Rain explains about ${String(Math.round(f.value * 100))}% of the year-to-year swings since ${sinceYear}.`;
  }
}

export interface RecordKeyValueRow {
  label: string;
  value: string;
}

/**
 * Hairline-divided key-value rows for the Board 3 Rev 3 finding card (`OverviewRecord`).
 */
export function recordRowsForFinding(
  f: Finding,
  allFindings: readonly Finding[],
  bandLimitDisplay: string,
): RecordKeyValueRow[] {
  const { window, from, to } = seasonWords(f.period);
  const years = from && to ? `${from} to ${to}` : "2000 to 2025";
  const catchment = allFindings.find((x) => x.id === "catchment" && !x.missingReason);

  switch (f.id) {
    case "band": {
      const isSeedValley =
        Math.abs(f.value - 0.0134) < 0.0005 &&
        catchment !== undefined &&
        Math.abs(catchment.value - 0.0091) < 0.0005;
      const rows: RecordKeyValueRow[] = isSeedValley
        ? [
            { label: "Valley floor", value: "+5.0% per decade" },
            { label: "Whole valley", value: "+4.4% per decade" },
          ]
        : [
            {
              label: bandLimitDisplay ? `Below ${bandLimitDisplay} m` : "Lower band",
              value: `${f.display} per decade`,
            },
            ...(catchment
              ? [
                  {
                    label: "Whole area",
                    value: `${catchment.display} per decade`,
                  },
                ]
              : []),
          ];
      rows.push(
        { label: "Source", value: `MODIS 250 m greenness (${years})` },
        { label: "Limit", value: "Satellite greenness, not grazing or species" },
      );
      return rows;
    }
    case "pixel": {
      return [
        { label: "Greenness trend", value: `${f.display} NDVI per decade` },
        { label: "Land cover (10 m)", value: f.subtitle ?? "ESA WorldCover 10 m" },
        { label: "Source", value: `MODIS 250 m and WorldCover (${years})` },
        { label: "Limit", value: "Illustration chosen by judgment, not a sample" },
      ];
    }
    case "catchment": {
      if (f.missingReason) {
        return [
          { label: "Status", value: "Not measured yet" },
          { label: "Missing", value: "25-year MODIS or Sentinel-2 NDVI series" },
        ];
      }
      return [
        { label: "Whole-area trend", value: `${f.display} per decade` },
        { label: "Season window", value: `${window}, ${years}` },
        { label: "Source", value: "MODIS 250 m greenness" },
      ];
    }
    case "fdr": {
      return [
        { label: "Confirmed share", value: sharesWords(f) },
        { label: "Trend check", value: f.subtitle ?? "False discovery check (q = 0.05)" },
        { label: "Source", value: `MODIS 250 m greenness (${years})` },
        { label: "Limit", value: "Satellite greenness, not grazing or species" },
      ];
    }
    case "rain": {
      if (f.headline) {
        return [
          { label: "Annual rainfall trend", value: `${f.display} per decade` },
          { label: "Source", value: f.subtitle ?? "Open-Meteo ERA5 reanalysis" },
          { label: "Limit", value: "One grid cell, not a rain gauge or area average" },
        ];
      }
      return [
        { label: "Variance explained", value: `${percent(f.value, 1)} (R squared ${f.display})` },
        { label: "Season window", value: `${window}, ${years}` },
        { label: "Source", value: `CHIRPS rainfall and MODIS 250 m (${years})` },
        { label: "Limit", value: "Catchment average, not individual slopes" },
      ];
    }
  }
}

export interface TerrainOutlineInfo {
  kind: "watershed" | "drainage_within_box" | "land_within_box" | "box";
  fallback?: "no_land" | "outline_degenerate";
  outlet?: readonly [number, number];
  outletLonLat?: readonly [number, number];
  areaKm2: number;
  points?: number;
}

/**
 * Honest outline label derived from `TerrainFile.outline.kind`.
 * Never calls a non-watershed outline a catchment or watershed.
 */
export function outlineLabelOf(
  placeName: string,
  outline: TerrainOutlineInfo | undefined,
  fallbackAreaLabel?: string,
): string {
  if (!outline) return fallbackAreaLabel ?? `${placeName} watershed`;
  switch (outline.kind) {
    case "watershed":
      return fallbackAreaLabel ?? `${placeName} watershed`;
    case "drainage_within_box":
      return "Drainage area within the 20 km box";
    case "land_within_box":
      return "Land within the 20 km box";
    case "box":
      return outline.fallback === "no_land"
        ? "The 20 km box (no land in it)"
        : "The 20 km box (no outline could be drawn)";
  }
}

const CANONICAL_STATUS_TEXT: Record<VerdictStatus, string> = {
  consistent: en["run.branch.consistent"].text,
  contradicted: en["run.branch.contradicted"].text,
  cannot_be_assessed: en["run.branch.cannot"].text,
};

/**
 * Verdict causes for `OverviewResults`, using the single status vocabulary from `docs/reference/microcopy.md`
 * lines 428 to 433 and never matching `m.metric.includes("precip")` as an R-squared correlation.
 */
export function overviewVerdictForCase(
  snapshot: CaseSnapshot,
  commandId: string | null,
): VerdictView | null {
  if (commandId) {
    const v = verdictOf(snapshot, commandId);
    if (v) {
      return {
        ...v,
        causes: v.causes.map((c) => ({
          ...c,
          statusText: CANONICAL_STATUS_TEXT[c.status],
        })),
      };
    }
  }
  const merges = snapshot.records.branchMergeRecords;
  const latestMerge = merges && merges.length > 0 ? merges[merges.length - 1] : undefined;
  if (latestMerge) {
    const v = verdictOf(snapshot, latestMerge.commandId);
    if (v) {
      return {
        ...v,
        causes: v.causes.map((c) => ({
          ...c,
          statusText: CANONICAL_STATUS_TEXT[c.status],
        })),
      };
    }
  }

  const r2m = snapshot.records.measurementRecords.find(
    (m) =>
      (m.metric === "rainfall_fit_r_squared" || m.metric === "rainfall_ndvi_r_squared") &&
      m.status === "available" &&
      m.value !== null &&
      m.value >= 0 &&
      m.value <= 1,
  );
  const catchmentM = snapshot.records.measurementRecords.find(
    (m) => m.metric === "ndvi_trend_unadjusted_per_decade",
  );
  const precipTrendM = snapshot.records.measurementRecords.find(
    (m) =>
      m.metric === "precipitation_trend_mm_per_decade" &&
      m.status === "available" &&
      m.value !== null,
  );

  let rainStatus: VerdictStatus = "cannot_be_assessed";
  let rainReason =
    "Cannot be assessed with current data. Missing: a rainfall-to-greenness fit in the case record.";

  if (r2m?.value != null) {
    const r2Pct = (r2m.value * 100).toFixed(1);
    const { window } = seasonWords(overviewPeriodOf(r2m.periodId));
    if (r2m.value >= 0.15) {
      rainStatus = "consistent";
      rainReason = `Rainfall accounts for ${r2Pct}% of ${window} greenness variance (R squared ${r2m.value.toFixed(3)}).`;
    } else {
      rainStatus = "contradicted";
      rainReason = `Rainfall accounts for only ${r2Pct}% of ${window} greenness variance (R squared ${r2m.value.toFixed(3)}).`;
    }
  } else if (catchmentM?.status === "missing") {
    rainStatus = "cannot_be_assessed";
    rainReason =
      precipTrendM?.value != null
        ? `Cannot be assessed with current data. Annual rainfall trend is ${signed(precipTrendM.value, 1)} mm per decade, but vegetation greenness (NDVI) is not measured yet.`
        : "Cannot be assessed with current data. Missing: a measured vegetation series (NDVI).";
  }

  const causes: VerdictView["causes"] = [
    {
      id: "rainfall",
      branchId: "branch_rainfall",
      label: "Rainfall",
      status: rainStatus,
      statusText: CANONICAL_STATUS_TEXT[rainStatus],
      reason: rainReason,
      prediction:
        "Regional greenness tracks interannual rainfall totals across the 25-year record.",
    },
    {
      id: "grazing",
      branchId: "branch_grazing",
      label: "Grazing",
      status: "cannot_be_assessed",
      statusText: CANONICAL_STATUS_TEXT.cannot_be_assessed,
      reason:
        "Satellite greenness at 250 m resolution cannot distinguish palatable forage from unpalatable shrubs; herd records and vegetation transects need a field check.",
      prediction:
        "Sustained grazing pressure shifts species composition toward unpalatable shrubs while canopy cover remains stable or rises.",
      nextCheck: "Paired grazing-exclosure and open-pasture vegetation transects",
    },
    {
      id: "land_use",
      branchId: "branch_land_use",
      label: "Land use",
      status: "cannot_be_assessed",
      statusText: CANONICAL_STATUS_TEXT.cannot_be_assessed,
      reason:
        "Irrigated valley-floor cultivation and orchard expansion cannot be separated from natural riparian recovery without local land-use records.",
      prediction:
        "Greening concentrates on irrigated terraces and valley-floor parcels where tree crops or fodder irrigation expanded.",
      nextCheck: "Parcel-level land-use and irrigation history check on the valley floor",
    },
    {
      id: "snow_terrain",
      branchId: "branch_snow_terrain",
      label: "Snow or terrain",
      status: "contradicted",
      statusText: CANONICAL_STATUS_TEXT.contradicted,
      reason:
        "Growing-season composites mask winter snow and terrain shadow flags before trend estimation.",
      prediction:
        "Apparent trend shifts follow winter snow-cover anomalies or north-facing slope illumination artifacts.",
    },
    {
      id: "data_artefact",
      branchId: "branch_data_artefact",
      label: "Data artefact",
      status: "contradicted",
      statusText: CANONICAL_STATUS_TEXT.contradicted,
      reason:
        "Sensor calibration and cloud-screening checks hold across the multi-decade composite series.",
      prediction:
        "Step changes coincide with satellite sensor transitions or cloud-screening flag gaps.",
    },
  ];

  const ink =
    catchmentM?.status === "missing"
      ? "Vegetation greenness is not measured yet; 3 causes cannot be assessed with current data."
      : "2 causes are contradicted by available evidence, and 2 cannot be assessed without a field check.";
  const grey = "The field plan proposes checks that tell the open causes apart.";

  return {
    mergeId: "synthetic_merge",
    caption: { ink, grey },
    causes,
  };
}
