// The opened finding's record data, read from the case when the finding opens (checksums checked):
// - pixel: its own 26 seasons and Theil-Sen line (the pixel anatomy spec's assets, built by loadCasePixel), and the
//   spec's first context display text;
// - band and catchment: the stratum's least squares slope and interval from the season trend summary the cross
//   section spec (bandTrends) or the layer stack spec (trend_summary) names, and its 26 means from the season trend
//   tables the pixel anatomy spec names (bandSeries), as the summary holds no season values; the band shows the cross
//   section's valley floor statement in its display text;
// - rain: the rainfall scatter spec's seasons and fit (scatterFrom).
// The fdr share has no chart.

import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import { drawnAsset, instrumentOf, readJsonAsset } from "../instruments/listing";
import type { PixelData } from "../instruments/pixel/data";
import { scatterFrom, type ScatterData } from "../instruments/scatter/data";
import { seasonTrendFrom } from "../instruments/valley/derive";
import type { FindingId } from "./findings";
import { olsIntercept, referencesOf, stratumSeasons, type SeasonChart } from "./record";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface RecordContext {
  text: string;
  references: string[];
}

export interface RecordData {
  chart: SeasonChart | null;
  scatter: ScatterData | null;
  context: RecordContext | null;
}

const EMPTY: RecordData = { chart: null, scatter: null, context: null };

function contextOf(
  snapshot: CaseSnapshot,
  display: { text: string; evidenceIds: string[] } | undefined,
): RecordContext | null {
  return display
    ? { text: display.text, references: referencesOf(snapshot, display.evidenceIds) }
    : null;
}

export async function loadRecord(
  id: FindingId,
  listing: InstrumentListing,
  snapshot: CaseSnapshot,
  pixelSeries: PixelData["series"] | null,
  fetchImpl: Fetch = (input, init) => fetch(input, init),
  signal?: AbortSignal,
): Promise<RecordData> {
  const pixel = instrumentOf(listing, "pixel_anatomy");
  if (id === "pixel") {
    const p = pixel?.spec.parameters;
    const s = pixelSeries;
    return {
      chart: s
        ? {
            seasons: s.pixel,
            slopePerDecade: s.pixel_theil_sen.slope_per_decade,
            intercept: s.pixel_line_intercept,
            lower: s.pixel_theil_sen.lower_per_decade,
            upper: s.pixel_theil_sen.upper_per_decade,
            fit: "theil_sen",
          }
        : null,
      scatter: null,
      context: p?.kind === "pixel_anatomy" ? contextOf(snapshot, p.contextDisplay?.[0]) : null,
    };
  }
  if (id === "rain") {
    const view = instrumentOf(listing, "rainfall_scatter");
    if (!view) return EMPTY;
    const { seasons, fit } = view.spec.parameters;
    const [tables, summary] = await Promise.all([
      readJsonAsset(view, seasons, fetchImpl, signal),
      readJsonAsset(view, fit, fetchImpl, signal),
    ]);
    return { ...EMPTY, scatter: scatterFrom(tables, summary) };
  }
  if (id !== "band" && id !== "catchment") return EMPTY;
  const stratum = id === "band" ? "elevation_low" : "catchment";
  const section = instrumentOf(listing, "cross_section");
  const layers = instrumentOf(listing, "layer_stack");
  const view = id === "band" ? section : layers;
  if (!view) return EMPTY;
  const p = view.spec.parameters;
  const summaryRef = p.kind === "cross_section" ? p.bandTrends : drawnAsset(view, "trend_summary");
  const tablesRef =
    pixel?.spec.parameters.kind === "pixel_anatomy" ? pixel.spec.parameters.bandSeries : null;
  const [summary, tables] = await Promise.all([
    readJsonAsset(view, summaryRef, fetchImpl, signal),
    pixel && tablesRef ? readJsonAsset(pixel, tablesRef, fetchImpl, signal) : Promise.resolve(null),
  ]);
  const trend = seasonTrendFrom(summary)[stratum];
  const seasons = tables ? stratumSeasons(tables, stratum) : [];
  const display =
    p.kind === "cross_section"
      ? p.statements.find((x) => x.placement === "valley_floor")?.display
      : undefined;
  return {
    chart: seasons.length
      ? {
          seasons,
          slopePerDecade: trend.per_decade,
          intercept: olsIntercept(seasons, trend.per_decade / 10),
          lower: trend.lower,
          upper: trend.upper,
          fit: "ols",
        }
      : null,
    scatter: null,
    context: contextOf(snapshot, display),
  };
}
