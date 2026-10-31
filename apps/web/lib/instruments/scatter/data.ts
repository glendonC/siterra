// The rainfall scatter's data: the catchment's seasons of greenness against the rainfall total before each, the
// straight-line fit across them and the four driest seasons, read from the restrend bundle's two files that the
// rainfall scatter spec names (restrend_tables, restrend_long_record). The windows are the bundle's own primary ones
// (U25, item f: March to June against September to May for the first place, February to May against October to April
// for Calaveras Creek), and are labelled so wherever they show; other totals never show beside them.

import { z } from "zod";

/** The stratum the scatter draws; its windows and reliability are the bundle's primary analysis. */
export const SCATTER = { stratum: "catchment" } as const;

const primarySchema = z.object({
  growing_window: z.string(),
  rainfall_window: z.string(),
  reliability: z.string(),
});
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
  primary: primarySchema,
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
  /** The rainfall window's total before the season, in mm. */
  rain_mm: number;
}

export interface ScatterData {
  period: [number, number];
  /** The bundle's primary windows, by id ("feb_may", "oct_apr"). */
  windows: { growing: string; rainfall: string };
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
  const P = t.primary;
  const row = t.results.find(
    (r) =>
      r.stratum === SCATTER.stratum &&
      r.growing_window === P.growing_window &&
      r.rainfall_window === P.rainfall_window &&
      r.reliability === P.reliability,
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
        s.growing_window === P.growing_window &&
        s.reliability === P.reliability &&
        s.year === year,
    );
    const r = t.rainfall.find(
      (s) =>
        s.stratum === SCATTER.stratum && s.rainfall_window === P.rainfall_window && s.year === year,
    );
    if (g?.ndvi == null || r?.rainfall_mm == null)
      throw new Error(`Season ${String(year)} has no greenness or rainfall value`);
    return { year, ndvi: g.ndvi, rain_mm: r.rainfall_mm };
  });
  const driest = [...seasons].sort((a, b) => a.rain_mm - b.rain_mm).slice(0, DRIEST_MARKED);
  return {
    period: [t.period.first_season, t.period.last_season],
    windows: { growing: P.growing_window, rainfall: P.rainfall_window },
    seasons,
    fit: row.rainfall_fit,
    status: row.status,
    driest,
  };
}

export interface AxisRange {
  lo: number;
  hi: number;
  step: number;
}

/**
 * An axis from a place's own values (U25, item f): the smallest of the round steps that keeps at most eight intervals,
 * the ends rounded outward to it. The first place's seasons give the approved 300 to 1,000 mm and 0.18 to 0.23.
 */
export function axisRange(values: readonly number[], steps: readonly number[]): AxisRange {
  const lo0 = Math.min(...values);
  const hi0 = Math.max(...values);
  const fit = (step: number) => {
    // rounded to the step's own precision, so 0.18 stays 0.18 and not 0.18000000000000002
    const p = (v: number) => Number(v.toFixed(10));
    const lo = p(Math.floor(p(lo0 / step)) * step);
    const hi = p(Math.ceil(p(hi0 / step)) * step);
    return { lo, hi: hi > lo ? hi : p(lo + step), step };
  };
  for (const step of steps) {
    const r = fit(step);
    if (Math.round((r.hi - r.lo) / step) <= 8) return r;
  }
  return fit(steps[steps.length - 1] ?? 1);
}

/** The rain axis's and the greenness axis's round steps. */
export const RAIN_STEPS = [50, 100, 200, 500] as const;
export const NDVI_STEPS = [0.01, 0.02, 0.05, 0.1] as const;
