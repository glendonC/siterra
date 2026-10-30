// The rainfall scatter's data: the catchment's 26 seasons of March to June MODIS NDVI against the September to May
// CHIRPS total before each, the straight-line fit across them and the four driest seasons, read from the restrend
// bundle's two files that the rainfall scatter spec names (restrend_tables, restrend_long_record). Totals here are
// September to May totals and are labelled so wherever they show; the case's November to April totals
// (bundle_season_summary) never show beside them.

import { z } from "zod";

/** The primary analysis the scatter draws: the catchment, March to June greenness, September to May rainfall. */
export const SCATTER = {
  stratum: "catchment",
  growingWindow: "mar_jun",
  rainfallWindow: "sep_may",
  reliability: "reliability_0_1",
} as const;
/** How many of the driest seasons are marked. */
export const DRIEST_MARKED = 4;

const fit = z.object({
  intercept: z.number(),
  slope_per_mm: z.number(),
  slope_per_100_mm: z.number(),
  lower: z.number(),
  upper: z.number(),
  level: z.number(),
  r_squared: z.number(),
  interval_above_zero: z.boolean(),
});

const tablesSchema = z.object({
  period: z.object({ first_season: z.number().int(), last_season: z.number().int() }),
  results: z.array(
    z.object({
      stratum: z.string(),
      growing_window: z.string(),
      rainfall_window: z.string(),
      reliability: z.string(),
      status: z.string(),
      n: z.number().int(),
      seasons: z.array(z.number().int()),
      // absent where a stratum or window had too few seasons to fit
      rainfall_fit: fit.optional(),
    }),
  ),
  seasons: z.array(
    z.object({
      stratum: z.string(),
      growing_window: z.string(),
      reliability: z.string(),
      year: z.number().int(),
      ndvi: z.number().nullable(),
      status: z.string(),
    }),
  ),
  rainfall: z.array(
    z.object({
      stratum: z.string(),
      rainfall_window: z.string(),
      year: z.number().int(),
      rainfall_mm: z.number().nullable(),
    }),
  ),
});

const summarySchema = z.object({
  headline: z.object({
    catchment: z.object({ rainfall_fit_r_squared: z.number(), n: z.number().int() }),
  }),
});

export interface ScatterSeason {
  year: number;
  ndvi: number;
  /** The September to May total before the season, in mm. */
  rain_mm: number;
}

export interface ScatterData {
  period: [number, number];
  seasons: ScatterSeason[];
  fit: z.infer<typeof fit>;
  /** The recipe's status for the rainfall-adjusted trend: precondition_not_met when the slope interval holds zero. */
  status: string;
  /** The driest seasons, driest first. */
  driest: ScatterSeason[];
}

/** The scatter from the restrend bundle's tables and summary; throws when they disagree on the fit. */
export function scatterFrom(tablesRaw: unknown, summaryRaw: unknown): ScatterData {
  const t = tablesSchema.parse(tablesRaw);
  const summary = summarySchema.parse(summaryRaw);
  const row = t.results.find(
    (r) =>
      r.stratum === SCATTER.stratum &&
      r.growing_window === SCATTER.growingWindow &&
      r.rainfall_window === SCATTER.rainfallWindow &&
      r.reliability === SCATTER.reliability,
  );
  if (!row?.rainfall_fit) throw new Error("The restrend tables hold no primary catchment fit");
  if (
    row.rainfall_fit.r_squared !== summary.headline.catchment.rainfall_fit_r_squared ||
    row.n !== summary.headline.catchment.n
  )
    throw new Error("The restrend tables and summary disagree on the rainfall fit");
  const seasons = row.seasons.map((year): ScatterSeason => {
    const g = t.seasons.find(
      (s) =>
        s.stratum === SCATTER.stratum &&
        s.growing_window === SCATTER.growingWindow &&
        s.reliability === SCATTER.reliability &&
        s.year === year,
    );
    const r = t.rainfall.find(
      (s) =>
        s.stratum === SCATTER.stratum &&
        s.rainfall_window === SCATTER.rainfallWindow &&
        s.year === year,
    );
    if (g?.ndvi == null || r?.rainfall_mm == null)
      throw new Error(`Season ${String(year)} has no greenness or rainfall value`);
    return { year, ndvi: g.ndvi, rain_mm: r.rainfall_mm };
  });
  const driest = [...seasons].sort((a, b) => a.rain_mm - b.rain_mm).slice(0, DRIEST_MARKED);
  return {
    period: [t.period.first_season, t.period.last_season],
    seasons,
    fit: row.rainfall_fit,
    status: row.status,
    driest,
  };
}
