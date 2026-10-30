// The valley instruments' figures built from the bundle files the case serves, by the rules the fixtures were made
// with (fixtures.test.ts recomputes the fixtures by the same rules): the March to June season trend per stratum, and
// the mean monthly snow-covered share per band. Pure; the cutaway and the layer stack run them on the assets their
// specs name.

import { figuresSchema, snowSchema, type Figures, type Snow } from "./fixtures";

const STRATA = ["catchment", "elevation_low", "elevation_mid", "elevation_high"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The snow tables' default threshold, and the precision the snow figures are kept to. */
const NDSI = "ndsi_0.2";
const SNOW_DECIMALS = 4;

/** Each stratum's March to June OLS slope and 95% interval per decade (season trend summary, reliability 0 and 1). */
export function seasonTrendFrom(summary: unknown): Figures["season_trend"] {
  const s = summary as {
    results: {
      stratum: string;
      growing_window: string;
      reliability: string;
      ols: { slope_per_decade: number; lower_per_decade: number; upper_per_decade: number };
    }[];
  };
  const of = (stratum: string) => {
    const row = s.results.find(
      (r) =>
        r.stratum === stratum &&
        r.growing_window === "mar_jun" &&
        r.reliability === "reliability_0_1",
    );
    if (!row) throw new Error(`The season trend summary has no March to June row for ${stratum}`);
    return {
      per_decade: row.ols.slope_per_decade,
      lower: row.ols.lower_per_decade,
      upper: row.ols.upper_per_decade,
    };
  };
  return figuresSchema.shape.season_trend.parse(
    Object.fromEntries(STRATA.map((stratum) => [stratum, of(stratum)])),
  );
}

const round = (v: number, decimals: number) => Math.round(v * 10 ** decimals) / 10 ** decimals;

/**
 * Each band's mean monthly snow-covered share over the months whose status is available (NDSI 0.2), with the
 * number of years each mean uses.
 */
export function snowFrom(tables: unknown): Snow {
  const t = tables as {
    bands: Record<string, { label: string }>;
    rows: Record<string, { month: string; status: string; [NDSI]: number | null }[]>;
  };
  const bands = Object.fromEntries(
    Object.entries(t.rows).map(([band, rows]) => {
      const byMonth = MONTHS.map((_, m) =>
        rows.filter(
          (r) =>
            Number(r.month.slice(5, 7)) === m + 1 && r.status === "available" && r[NDSI] !== null,
        ),
      );
      return [
        band,
        {
          label: t.bands[band]?.label ?? band,
          monthly_mean: byMonth.map((used) =>
            round(used.reduce((sum, r) => sum + (r[NDSI] ?? 0), 0) / used.length, SNOW_DECIMALS),
          ),
          years_used: byMonth.map((used) => used.length),
        },
      ];
    }),
  );
  return snowSchema.parse({ months: MONTHS, bands });
}
