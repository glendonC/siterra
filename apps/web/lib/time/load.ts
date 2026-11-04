// "Year by Year" (UI-2): which of a case's bundles the view reads, found by their records' methods (never by a
// place's name), and the reading of their assets through the read API, each refused unless its sha256 is the checksum
// the API serves. Snow is optional: a case without a snow bundle, or whose bundle records the recipe as not
// applicable, plays without it.

import type { CaseSnapshot } from "@siterra/contracts";
import {
  changeTimingFrom,
  domainOf,
  pixelCellsFrom,
  rainFrom,
  regionalScanFrom,
  seasonCubeFrom,
  sharesFrom,
  snowFrom,
  strataFrom,
  type AreaShares,
  type ChangeTiming,
  type DrySeason,
  type PixelCell,
  type RegionalScan,
  type SeasonCube,
  type SnowBands,
  type StratumSeries,
} from "./data";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface TimeSources {
  seasons: string;
  trend: string;
  restrend: string;
  seasonTrend: string;
  snow: string | null;
}

/** The case's own bundles the view reads, by method; null when the case cannot play its seasons. */
export function timeSourcesOf(snapshot: CaseSnapshot): TimeSources | null {
  const by = (method: string) =>
    snapshot.records.dataBundleRecords
      .filter((b) => b.methodId === method && b.status === "validated")
      .sort((a, b) => a.id.localeCompare(b.id))[0]?.id ?? null;
  const seasons = by("pixel_seasons");
  const trend = by("pixel_trend_long_record");
  const restrend = by("restrend_long_record");
  const seasonTrend = by("season_trend_long_record");
  if (!seasons || !trend || !restrend || !seasonTrend) return null;
  return { seasons, trend, restrend, seasonTrend, snow: by("snow_cover_by_band") };
}

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

/** One asset's bytes through the read API, refused unless their sha256 is the checksum it serves as its ETag. */
export async function readAsset(
  caseId: string,
  bundleId: string,
  assetKey: string,
  fetchImpl: Fetch,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const url = `/api/cases/${encodeURIComponent(caseId)}/bundles/${encodeURIComponent(bundleId)}/assets/${encodeURIComponent(assetKey)}`;
  const res = await fetchImpl(url, { credentials: "same-origin", ...(signal ? { signal } : {}) });
  if (!res.ok) throw new Error(`${bundleId} ${assetKey}: HTTP ${String(res.status)}`);
  const tag = (res.headers.get("etag") ?? "").replace(/^W\//, "").replace(/"/g, "");
  const bytes = await res.arrayBuffer();
  const digest = `1220${hex(await crypto.subtle.digest("SHA-256", bytes))}`;
  if (digest !== tag) throw new Error(`${bundleId} ${assetKey}: checksum differs`);
  return bytes;
}

export interface TimeData {
  cube: SeasonCube;
  cells: PixelCell[];
  /** The colour scale's domain for this place (domainOf). */
  domain: [number, number];
  /** The trend asset's own fixed display scale (± domain, neutral half width), NDVI per decade. */
  trendScale: { domain: number; neutral: number };
  snow: SnowBands | null;
  /** Every season's rain over the catchment in the place's primary rainfall window. */
  rain: DrySeason[];
  /** The four driest of them, driest first: the track marks them. */
  driest: DrySeason[];
  strata: StratumSeries[];
  /** The pixel trend's own shares of the catchment and of each band (by group id) that greened and browned. */
  shares: { catchment: AreaShares; groups: Map<string, AreaShares> };
  changeTiming: ChangeTiming;
}

/** How many of the driest seasons the track marks. */
export const DRIEST_MARKED = 4;

export interface ScanTimingSummary {
  changeTiming: ChangeTiming;
  regionalScan: RegionalScan;
}

const json = (b: ArrayBuffer) => JSON.parse(new TextDecoder().decode(b)) as unknown;

/** Change-point timing (7C) and regional scan summary (7B) from the case's pixel_seasons bundle. */
export async function loadScanTimingSummary(
  caseId: string,
  seasonsBundleId: string,
  fetchImpl: Fetch,
  signal?: AbortSignal,
): Promise<ScanTimingSummary> {
  const summaryJson = json(
    await readAsset(caseId, seasonsBundleId, "pixel_seasons", fetchImpl, signal),
  );
  return {
    changeTiming: changeTimingFrom(summaryJson),
    regionalScan: regionalScanFrom(summaryJson),
  };
}

/** Everything the view plays, read from the case's own bundles. */
export async function loadTimeData(
  caseId: string,
  src: TimeSources,
  fetchImpl: Fetch,
  signal?: AbortSignal,
): Promise<TimeData> {
  const read = (bundle: string, key: string) => readAsset(caseId, bundle, key, fetchImpl, signal);
  const [bin, header, summary, cells, trendSummary, restrend, seasonTrend] = await Promise.all([
    read(src.seasons, "pixel_seasons_bin"),
    read(src.seasons, "pixel_seasons_bin_header"),
    read(src.seasons, "pixel_seasons"),
    read(src.trend, "trend_cells"),
    read(src.trend, "pixel_trend_long_record"),
    read(src.restrend, "restrend_tables"),
    read(src.seasonTrend, "season_trend_long_record"),
  ]);
  const snow = src.snow
    ? await Promise.all([read(src.snow, "snow_cover_by_band"), read(src.snow, "snow_cover_tables")])
    : null;
  const cellsJson = json(cells) as {
    display_scale?: { domain_per_decade: [number, number]; neutral_per_decade: number };
  };
  const scale = cellsJson.display_scale;
  if (!scale) throw new Error("trend_cells states no display scale");
  const summaryJson = json(summary);
  const rain = rainFrom(json(restrend));
  const { catchment, groups } = sharesFrom(json(trendSummary));
  return {
    cube: seasonCubeFrom(bin, json(header)),
    cells: pixelCellsFrom(cellsJson),
    domain: domainOf(summaryJson),
    trendScale: {
      domain: Math.max(...scale.domain_per_decade.map(Math.abs)),
      neutral: scale.neutral_per_decade,
    },
    snow: snow ? snowFrom(json(snow[0]), json(snow[1])) : null,
    rain,
    driest: [...rain].sort((a, b) => a.mm - b.mm).slice(0, DRIEST_MARKED),
    strata: strataFrom(json(seasonTrend)),
    shares: { catchment, groups },
    changeTiming: changeTimingFrom(summaryJson),
  };
}
