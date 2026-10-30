// The opened finding's record (approved specimen D4, js/node.js nodeHud): the big number, a season chart of the 26
// March to June means with the fitted line, the 95% interval, and the published context in the record's own short
// display text with its sources. Every value comes from the case: the Measurements, the instrument specs' assets and
// the Evidence and Source records. Pure; record-data.ts reads the assets.

import type { CaseSnapshot } from "@siterra/contracts";
import { format } from "../copy/en";
import { citedAuthors } from "./cite";

export interface Season {
  year: number;
  ndvi: number;
}

/** A season chart: the means, and the fitted line's slope (per decade), intercept and 95% interval. */
export interface SeasonChart {
  seasons: Season[];
  slopePerDecade: number;
  /** NDVI at year 0 of the line ndvi = intercept + slope per year x year. */
  intercept: number;
  lower: number;
  upper: number;
  /** The fit the line draws: the pixel's Theil-Sen line, or a stratum's least squares line. */
  fit: "theil_sen" | "ols";
}

/** The March to June means of one stratum from the season trend tables (reliability 0 and 1, available seasons). */
export function stratumSeasons(tables: unknown, stratum: string): Season[] {
  const t = tables as {
    seasons?: {
      stratum: string;
      growing_window: string;
      reliability: string;
      year: number;
      ndvi: number | null;
      status: string;
    }[];
  };
  return (t.seasons ?? [])
    .filter(
      (s) =>
        s.stratum === stratum &&
        s.growing_window === "mar_jun" &&
        s.reliability === "reliability_0_1" &&
        s.status === "available" &&
        s.ndvi !== null,
    )
    .map((s) => ({ year: s.year, ndvi: s.ndvi ?? 0 }))
    .sort((a, b) => a.year - b.year);
}

/** The least squares line's intercept through the means for a given slope: mean(ndvi) - slope x mean(year). */
export function olsIntercept(seasons: readonly Season[], slopePerYear: number): number {
  const n = seasons.length || 1;
  const my = seasons.reduce((s, x) => s + x.ndvi, 0) / n;
  const mx = seasons.reduce((s, x) => s + x.year, 0) / n;
  return my - slopePerYear * mx;
}

/**
 * The chart's NDVI range and gridlines: the largest step of 0.1, 0.05, 0.02 or 0.01 that puts at least two gridlines
 * inside the range, the range the values rounded out to half a step (D4: 0.25 to 0.55, lines at 0.3, 0.4, 0.5).
 */
export function chartScale(values: readonly number[]): { lo: number; hi: number; ticks: number[] } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  let out = { lo: min, hi: max, ticks: [] as number[] };
  for (const step of [0.1, 0.05, 0.02, 0.01]) {
    const half = step / 2;
    const lo = r(Math.floor(r(min / half)) * half);
    const hi = r(Math.ceil(r(max / half)) * half);
    const ticks: number[] = [];
    for (let k = Math.ceil(r(lo / step)); r(k * step) <= hi; k++) {
      const t = r(k * step);
      if (t > lo && t < hi) ticks.push(t);
    }
    out = { lo, hi, ticks };
    if (ticks.length >= 2) return out;
  }
  return out;
}

/** The years a season chart labels: the first, each decade after it, and the last. */
export function yearTicks(first: number, last: number): number[] {
  const out = [first];
  for (let y = Math.ceil((first + 1) / 10) * 10; y < last; y += 10) out.push(y);
  if (last !== first) out.push(last);
  return out;
}

type Source = CaseSnapshot["records"]["sourceRecords"][number];

/**
 * A short reference: the first author's surname (with "et al." for three or more), the year, the venue as the
 * publisher field gives it (without the publisher's name in parentheses), and the pages.
 */
export function reference(src: Source, pages: readonly string[]): string {
  const who = citedAuthors(src.authors) || src.title;
  const venue = (src.publisher ?? "").replace(/\s*\([^()]*\)\s*$/, "");
  const year = (src.publicationDate ?? "").slice(0, 4);
  if (pages.length === 0) return format("overview.cite.noPage", { authors: who, year, venue });
  if (pages.length === 1)
    return format("overview.cite", { authors: who, year, venue, page: pages[0] ?? "" });
  return format("overview.cite.pages", { authors: who, year, venue, pages: pages.join(", ") });
}

/** The sources of a display text's Evidence, one line per source with its pages, in the order they are cited. */
export function referencesOf(snapshot: CaseSnapshot, evidenceIds: readonly string[]): string[] {
  const bySource = new Map<string, { src: Source; pages: string[] }>();
  for (const id of evidenceIds) {
    const e = snapshot.records.evidenceRecords.find((x) => x.id === id);
    for (const loc of e?.provenance.sourceLocators ?? []) {
      const src = snapshot.records.sourceRecords.find((s) => s.id === loc.sourceId);
      if (!src) continue;
      const entry = bySource.get(src.id) ?? { src, pages: [] };
      bySource.set(src.id, entry);
      const page = /\bpages?\s+(\d+)/i.exec(loc.locator)?.[1];
      if (page !== undefined && !entry.pages.includes(page)) entry.pages.push(page);
    }
  }
  return [...bySource.values()].map(({ src, pages }) => reference(src, pages));
}

/** The catchment's area as the record stores it (km², the drainage outlet's upstream area), or null. */
export function catchmentAreaKm2(snapshot: CaseSnapshot): string | null {
  const m = snapshot.records.measurementRecords.find(
    (x) =>
      x.metric === "drainage_outlet_upstream_area" &&
      x.geoSelectionId === snapshot.case.activeGeoSelectionId &&
      x.status === "available" &&
      x.value !== null &&
      x.unit === "km2",
  );
  return m?.value != null
    ? new Intl.NumberFormat("en", { maximumFractionDigits: 6 }).format(m.value)
    : null;
}
