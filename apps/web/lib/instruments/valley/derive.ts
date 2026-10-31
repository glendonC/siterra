// The valley instruments' figures built from the bundle files the case serves, by the rules the fixtures were made
// with (fixtures.test.ts recomputes the fixtures by the same rules): the March to June season trend per stratum, and
// the mean monthly snow-covered share per band, and each CHIRPS cell's September to May reference total. Pure; the cutaway and the layer stack run them on the assets their
// specs name.

import {
  figuresSchema,
  rainCellsSchema,
  snowSchema,
  type Figures,
  type RainCells,
  type Snow,
} from "./fixtures";
import { lonLatToUtm } from "./utm";

const STRATA = ["catchment", "elevation_low", "elevation_mid", "elevation_high"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The snow tables' default threshold, and the precision the snow figures are kept to. */
const NDSI = "ndsi_0.2";
const SNOW_DECIMALS = 4;

/**
 * Each stratum's OLS slope and 95% interval per decade over the summary's own primary growing window and reliability
 * (U25: March to June for the first place, February to May for Calaveras Creek).
 */
export function seasonTrendFrom(summary: unknown): Figures["season_trend"] {
  const s = summary as {
    primary?: { growing_window: string; reliability: string };
    results: {
      stratum: string;
      growing_window: string;
      reliability: string;
      ols: { slope_per_decade: number; lower_per_decade: number; upper_per_decade: number };
    }[];
  };
  const P = s.primary;
  if (!P) throw new Error("The season trend summary states no primary window");
  const of = (stratum: string) => {
    const row = s.results.find(
      (r) =>
        r.stratum === stratum &&
        r.growing_window === P.growing_window &&
        r.reliability === P.reliability,
    );
    if (!row)
      throw new Error(`The season trend summary has no ${P.growing_window} row for ${stratum}`);
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

/** The months of the September to May window, as the CHIRPS cells' reference means key them. */
const SEP_MAY = ["09", "10", "11", "12", "01", "02", "03", "04", "05"];

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

/**
 * The months a layer stack's rainfall window sums (contracts 1.21.0 rainfallWindow, P7b-7), from its start month to
 * its end month across the year end, as the CHIRPS cells' reference means key them ("09" ... "05").
 */
export function windowMonths(window: {
  start: { month: (typeof MONTH_NAMES)[number] };
  end: { month: (typeof MONTH_NAMES)[number] };
}): string[] {
  const a = MONTH_NAMES.indexOf(window.start.month);
  const b = MONTH_NAMES.indexOf(window.end.month);
  const n = ((b - a + 12) % 12) + 1;
  return Array.from({ length: n }, (_, i) => String(((a + i) % 12) + 1).padStart(2, "0"));
}

/**
 * Each CHIRPS cell's mean rainfall over the window's months, 1991 to 2020 (the sum of its monthly means, to 0.1 mm;
 * September to May unless the spec states its window), with its corners in the zone's UTM metres (0.1 m) and its
 * share of the catchment, from the rainfall cells GeoJSON.
 */
export function rainCellsFrom(
  geojson: unknown,
  zone: number,
  months: readonly string[] = SEP_MAY,
): RainCells {
  const g = geojson as {
    features: {
      geometry: { coordinates: number[][][] };
      properties: {
        cell_id: string;
        fraction_inside: number;
        weight: number;
        reference_mm_1991_2020: Record<string, number>;
      };
    }[];
  };
  const cells = g.features.map((f) => {
    const p = f.properties;
    const ring = f.geometry.coordinates[0] ?? [];
    return {
      id: p.cell_id,
      corners: ring.slice(0, 4).map(([lon, lat]) => {
        const [e, n] = lonLatToUtm(lon ?? Number.NaN, lat ?? Number.NaN, zone);
        return [round(e, 1), round(n, 1)];
      }),
      window_mm: round(
        months.reduce((sum, m) => sum + (p.reference_mm_1991_2020[m] ?? Number.NaN), 0),
        1,
      ),
      fraction_inside: p.fraction_inside,
      weight: p.weight,
    };
  });
  const mm = cells.map((c) => c.window_mm);
  return rainCellsSchema.parse({
    count: cells.length,
    min_mm: Math.min(...mm),
    max_mm: Math.max(...mm),
    cells,
  });
}
