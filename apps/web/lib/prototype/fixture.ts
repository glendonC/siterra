// The prototype's fixture: what the /prototype screen reads, all of it taken from the repository's bundles
// and case files at build time (load.server.ts). Nothing here is measured or written by a model.

import type { Corners } from "../stage/daylight-style";
import type { Feature } from "../stage/geo";

export interface Month {
  /** "2022-06" */
  id: string;
  /** The bundles' period id, "period_2022-06". */
  periodId: string;
  /** "Jun 2022" */
  label: string;
  /** Catchment rainfall total, CHIRPS v3.0 (mm). */
  rainMm: number;
  /** Rainfall minus the 1991 to 2020 mean for the same calendar month (mm). */
  rainVsUsualMm: number;
  /** NDVI departure, area median, leave-one-year-out reference; null when the month has none. */
  greenness: number | null;
  /** Share of the catchment that passed the mask (coverage summary). */
  seenShare: number;
  /** True when the departure bundle has a display picture for the month. */
  hasPicture: boolean;
  /** The bundle's missing reason when there is no departure. */
  missingReason: string | null;
  snowSuspected: boolean;
}

export interface Season {
  id: string;
  /** "2022/23" */
  label: string;
  totalMm: number;
  departureMm: number;
  category: string;
}

export interface SourceRecord {
  id: string;
  title: string;
  publisher: string | null;
  date: string | null;
  url: string | null;
  accessStatus: string;
}

export interface Excerpt {
  id: string;
  sourceId: string;
  page: number | null;
  excerpt: string;
  attribution: string | null;
  labeler: string;
}

export interface RainCell {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: number[][][] };
  properties: { cell_id: string; fraction_inside: number };
}

export interface Fixture {
  caseQuestion: string;
  /** From the case record: its title, the place it names and the wider location. */
  caseTitle: string;
  placeName: string;
  location: string;
  /** The study area's own label, first clause (for example "Valley catchment"). */
  areaLabel: string;
  areaKm2: number;
  catchment: Feature;
  places: { id: string; name: string; role: string; lon: number; lat: number }[];
  outlet: { lon: number; lat: number };
  months: Month[];
  seasons: Season[];
  /** Mean wet-season (Nov to Apr) total, 1991/92 to 2020/21. */
  usualSeasonMm: number;
  referenceSeasons: number;
  /** Where every departure picture lies (the overview's Web Mercator box). */
  pictureCorners: Corners;
  rainCells: { type: "FeatureCollection"; features: RainCell[] };
  /** Rainfall per CHIRPS cell (mm) for each period, from each period's cell-values.json. */
  cellRain: Record<string, Record<string, number>>;
  sources: SourceRecord[];
  excerpts: Excerpt[];
  /** The coverage threshold the bundles apply (policy 70%). */
  coverageThreshold: number;
}

export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function monthLabel(id: string): string {
  const [y, m] = id.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? ""} ${y ?? ""}`;
}

/** The address of a month's departure picture, served from the bundle by the prototype route. */
export function pictureUrl(periodId: string): string {
  return `/prototype/assets/departure/${periodId}`;
}

export const CROPLAND_URL = "/prototype/assets/cropland";
