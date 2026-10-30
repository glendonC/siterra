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

/** The months of the September to May window, as the CHIRPS cells' reference means key them. */
const SEP_MAY = ["09", "10", "11", "12", "01", "02", "03", "04", "05"];

/**
 * Each CHIRPS cell's September to May mean rainfall, 1991 to 2020 (the sum of its nine monthly means, to 0.1 mm),
 * with its corners in EPSG:32629 metres (0.1 m) and its share of the catchment, from the rainfall cells GeoJSON.
 */
export function rainCellsFrom(geojson: unknown): RainCells {
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
        const [e, n] = lonLatToUtm(lon ?? Number.NaN, lat ?? Number.NaN, 29);
        return [round(e, 1), round(n, 1)];
      }),
      sep_may_mm: round(
        SEP_MAY.reduce((sum, m) => sum + (p.reference_mm_1991_2020[m] ?? Number.NaN), 0),
        1,
      ),
      fraction_inside: p.fraction_inside,
      weight: p.weight,
    };
  });
  const mm = cells.map((c) => c.sep_may_mm);
  return rainCellsSchema.parse({
    count: cells.length,
    min_mm: Math.min(...mm),
    max_mm: Math.max(...mm),
    cells,
  });
}
