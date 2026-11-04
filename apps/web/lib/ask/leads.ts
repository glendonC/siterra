// What each view says first, as a finding a typed question can be answered with (lib/ask/findings.ts): Elevation
// Bands' headline and the line under it (where greenness changed most, and whether every band changed by more than
// its margin), Inside One Pixel's statement and its note, Rain and Greenness's headline, and Year by Year's year by
// which half the pixels that stepped up to greener had stepped. Each is built by the functions and catalog words its
// view uses, from the same record data, read through the instrument listing and the case's bundle read API with their
// checksums checked. A view whose data cannot be read is left out, never guessed.

import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import { en, format, type MessageId } from "../copy/en";
import { metres } from "../instruments/format";
import { instrumentOf, readJsonAsset } from "../instruments/listing";
import { loadCasePixel } from "../instruments/pixel/case";
import type { PixelData } from "../instruments/pixel/data";
import { pixelStatement } from "../instruments/pixel/statement";
import { scatterFrom, type ScatterData } from "../instruments/scatter/data";
import { RAIN_LEAD, rainLink } from "../instruments/scatter/lead";
import { bandLead, type BandId, type BandTrend } from "../instruments/valley/band-lead";
import { seasonTrendFrom } from "../instruments/valley/derive";
import { bandLimitsOf } from "../land/record";
import { windowWords } from "../land/season";
import type { ChangeTiming } from "../time/data";
import { loadScanTimingSummary, timeSourcesOf } from "../time/load";
import { stepsWords } from "../time/words";
import { LEAD_VIEWS, type LeadView, type ViewLeads } from "./findings";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Where a band is, inside Elevation Bands' headline (components/instruments/InstrumentCutaway.tsx). */
const WHERE: Record<BandId, MessageId> = {
  elevation_high: "instrument.cutaway.where.high",
  elevation_mid: "instrument.cutaway.where.mid",
  elevation_low: "instrument.cutaway.where.low",
};

/** Elevation Bands' headline and the line under it, from the three bands' own trends and the record's two limits. */
export function cutawayLines(
  trends: Readonly<Record<BandId, BandTrend>>,
  limits: readonly [number, number],
): string[] {
  const l = bandLead(trends);
  const lower = metres(limits[0]);
  const upper = metres(limits[1]);
  const where = format(WHERE[l.band], {
    limit: l.band === "elevation_high" ? upper : lower,
    lower,
    upper,
  });
  return [
    format(
      l.direction === "rose" ? "instrument.cutaway.lead.rose" : "instrument.cutaway.lead.fell",
      { where },
    ),
    en[
      l.clear === "up"
        ? "instrument.cutaway.clear.up"
        : l.clear === "down"
          ? "instrument.cutaway.clear.down"
          : "instrument.cutaway.clear.mixed"
    ].text,
  ];
}

/** Inside One Pixel's statement, and its note on what covers the pixel where trees or fields do. */
export function pixelLines(pixel: PixelData): string[] {
  const s = pixelStatement(pixel, null);
  return s.note ? [s.lead, s.note] : [s.lead];
}

/** Rain and Greenness's headline, its windows in words as the view writes them. */
export function rainfallLines(data: ScatterData): string[] {
  const unstated = en["season.unstated"].text;
  return [
    format(RAIN_LEAD[rainLink(data.fit)], {
      growing: windowWords(data.windows.growing) ?? unstated,
      rainfall: windowWords(data.windows.rainfall) ?? unstated,
    }),
  ];
}

/** Year by Year's line on when the steps to greener came; none where no pixel stepped up. */
export function timeLines(timing: ChangeTiming): string[] {
  const steps = stepsWords(timing);
  return steps ? [steps] : [];
}

/** What the views' leads are read from besides the listing: the case, its two band limits and its seasons bundle. */
export interface LeadSources {
  caseId: string;
  limits: readonly [number, number] | null;
  seasons: string | null;
}

export function leadSourcesOf(snapshot: CaseSnapshot): LeadSources {
  return {
    caseId: snapshot.case.id,
    limits: bandLimitsOf(snapshot),
    seasons: timeSourcesOf(snapshot)?.seasons ?? null,
  };
}

/** One view's lead lines, read from its own data; empty when the case does not offer the view. */
async function linesOf(
  view: LeadView,
  sources: LeadSources,
  listing: InstrumentListing,
  fetchImpl: Fetch,
  signal?: AbortSignal,
): Promise<string[]> {
  if (view === "cutaway") {
    const v = instrumentOf(listing, "cross_section");
    if (!v || !sources.limits) return [];
    const trends = await readJsonAsset(v, v.spec.parameters.bandTrends, fetchImpl, signal);
    return cutawayLines(seasonTrendFrom(trends), sources.limits);
  }
  if (view === "pixel") {
    const v = instrumentOf(listing, "pixel_anatomy");
    return v ? pixelLines((await loadCasePixel(v, fetchImpl, signal)).pixel) : [];
  }
  if (view === "rainfall") {
    const v = instrumentOf(listing, "rainfall_scatter");
    if (!v) return [];
    const { seasons, fit } = v.spec.parameters;
    const [tables, summary] = await Promise.all([
      readJsonAsset(v, seasons, fetchImpl, signal),
      readJsonAsset(v, fit, fetchImpl, signal),
    ]);
    return rainfallLines(scatterFrom(tables, summary));
  }
  if (!sources.seasons) return [];
  const { changeTiming } = await loadScanTimingSummary(
    sources.caseId,
    sources.seasons,
    fetchImpl,
    signal,
  );
  return timeLines(changeTiming);
}

/** The leads of the given views (every view by default); a view that does not load is left out. */
export async function loadViewLeads(
  sources: LeadSources,
  listing: InstrumentListing,
  fetchImpl: Fetch,
  views: readonly LeadView[] = LEAD_VIEWS,
  signal?: AbortSignal,
): Promise<ViewLeads> {
  const read = await Promise.all(
    views.map(async (view): Promise<[LeadView, string[]]> => {
      try {
        return [view, await linesOf(view, sources, listing, fetchImpl, signal)];
      } catch {
        return [view, []];
      }
    }),
  );
  return Object.fromEntries(read.filter(([, lines]) => lines.length > 0));
}
