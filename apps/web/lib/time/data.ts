// "See It Over Time" (specimen T, UI-2): what the playhead plays, read from a case's own bundles, never from code that
// names a place. Pure parsers over the assets the read API serves (checksums checked by the loader):
// - the growing-season NDVI of every 250 m MODIS pixel per season (bundle_pixel_seasons: the binary cube and its
//   header, which names its seasons, its window and its nodata rule);
// - each pixel's place on the land and its trend (the pixel trend bundle's trend_cells: row, col, four UTM corners and
//   the Theil-Sen slope per decade), which index the same grid as the cube;
// - snow by elevation band per month (snow_cover_by_band: the terrain_strata band set at the bundle's own default
//   threshold), only where the bundle does not record the recipe as not applicable;
// - the driest seasons by the place's primary rainfall window, and each band's season values and trend (restrend and
//   season trend bundles, at their own primary windows).

import { z } from "zod";

const cubeHeader = z.object({
  shape: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
  axes: z.tuple([z.literal("season"), z.literal("row"), z.literal("column")]),
  dtype: z.literal("float32"),
  byte_order: z.literal("little"),
  seasons: z.array(z.number().int()),
  growing_window: z.string(),
  window_label: z.string(),
});

export interface SeasonCube {
  seasons: number[];
  rows: number;
  cols: number;
  /** The growing window as the bundle names it: "mar_jun", "March to June". */
  window: { id: string; label: string };
  values: Float32Array;
}

/** The season cube from its binary asset and header; NaN is no value. */
export function seasonCubeFrom(bin: ArrayBuffer, header: unknown): SeasonCube {
  const h = cubeHeader.parse(header);
  const [n, rows, cols] = h.shape;
  if (h.seasons.length !== n)
    throw new Error("pixel seasons: the header's seasons differ from its shape");
  if (bin.byteLength !== n * rows * cols * 4)
    throw new Error("pixel seasons: the asset's size differs from its shape");
  const values = new Float32Array(bin.slice(0));
  return {
    seasons: h.seasons,
    rows,
    cols,
    window: { id: h.growing_window, label: h.window_label },
    values,
  };
}

/** One season's value at a pixel (NaN: no value that season). */
export function valueAt(c: SeasonCube, season: number, row: number, col: number): number {
  return c.values[(season * c.rows + row) * c.cols + col] ?? Number.NaN;
}

const cellsSchema = z.object({
  fields: z.array(z.string()),
  count: z.number().int(),
  cells: z.array(z.array(z.number())),
});

export interface PixelCell {
  row: number;
  col: number;
  /** Four corners in the case's UTM metres. */
  corners: [number, number][];
  slope: number;
}

/** The trend cells by the asset's own field names. */
export function pixelCellsFrom(json: unknown): PixelCell[] {
  const t = cellsSchema.parse(json);
  const at = (f: string) => {
    const i = t.fields.indexOf(f);
    if (i < 0) throw new Error(`trend_cells has no field ${f}`);
    return i;
  };
  const r = at("row");
  const c = at("col");
  const xy = ["E0", "N0", "E1", "N1", "E2", "N2", "E3", "N3"].map(at);
  const s = at("slope_per_decade");
  const cells = t.cells.map((v) => ({
    row: v[r] ?? -1,
    col: v[c] ?? -1,
    corners: [0, 2, 4, 6].map((k): [number, number] => [
      v[xy[k] ?? 0] ?? 0,
      v[xy[k + 1] ?? 0] ?? 0,
    ]),
    slope: v[s] ?? 0,
  }));
  if (cells.length !== t.count) throw new Error("trend_cells: count differs from its cells");
  return cells;
}

/**
 * The colour scale's domain from the bundle's own per-season spread: the lowest 5th and highest 95th percentile over
 * every season, rounded outward to 0.05, so each place is drawn on a scale its own values fill.
 */
export function domainOf(summary: unknown): [number, number] {
  const s = z
    .object({ per_season: z.array(z.object({ p05: z.number(), p95: z.number() })) })
    .parse(summary);
  const lo = Math.min(...s.per_season.map((x) => x.p05));
  const hi = Math.max(...s.per_season.map((x) => x.p95));
  const step = 0.05;
  return [Math.floor(lo / step + 1e-9) * step, Math.ceil(hi / step - 1e-9) * step].map(
    (v) => Math.round(v * 100) / 100,
  ) as [number, number];
}

const snowSummary = z.object({
  default_threshold: z.string(),
  applicability: z.object({ decision: z.string() }).optional(),
});
const snowTables = z.object({
  band_sets: z.record(z.string(), z.array(z.string())),
  rows: z.record(
    z.string(),
    z.array(z.object({ month: z.string(), status: z.string() }).catchall(z.unknown())),
  ),
});

export interface SnowBands {
  /** The band ids, lowest first (elevation_low, elevation_mid, elevation_high). */
  bands: string[];
  /** Per month "YYYY-MM", each band's share under snow (null where the month has no value). */
  months: Map<string, (number | null)[]>;
}

/** Snow by the land's elevation bands, or null where the bundle records the snow recipe as not applicable. */
export function snowFrom(summary: unknown, tables: unknown): SnowBands | null {
  const s = snowSummary.parse(summary);
  if (s.applicability?.decision === "not_applicable") return null;
  const t = snowTables.parse(tables);
  const bands = t.band_sets["terrain_strata"];
  if (!bands) return null;
  const months = new Map<string, (number | null)[]>();
  bands.forEach((b, i) => {
    for (const row of t.rows[b] ?? []) {
      const v = row[s.default_threshold];
      const list = months.get(row.month) ?? bands.map(() => null);
      list[i] = row.status === "available" && typeof v === "number" ? v : null;
      months.set(row.month, list);
    }
  });
  return { bands, months };
}

const restrend = z.object({
  primary: z.object({ rainfall_window: z.string() }),
  rainfall: z.array(
    z.object({
      stratum: z.string(),
      rainfall_window: z.string(),
      year: z.number().int(),
      rainfall_mm: z.number().nullable(),
      months: z.array(z.string()),
    }),
  ),
});

export interface DrySeason {
  year: number;
  mm: number;
  /** The window's first and last month as the record lists them ("2000-09", "2001-05"). */
  from: string;
  to: string;
}

/** The four driest seasons of the catchment by the place's primary rainfall window, driest first. */
export function driestFrom(tables: unknown, n = 4): DrySeason[] {
  const r = restrend.parse(tables);
  return r.rainfall
    .filter(
      (x) =>
        x.stratum === "catchment" &&
        x.rainfall_window === r.primary.rainfall_window &&
        x.rainfall_mm !== null,
    )
    .map((x) => ({
      year: x.year,
      mm: x.rainfall_mm ?? 0,
      from: x.months[0] ?? "",
      to: x.months.at(-1) ?? "",
    }))
    .sort((a, b) => a.mm - b.mm)
    .slice(0, n);
}

const seasonTrend = z.object({
  primary: z.object({ growing_window: z.string(), reliability: z.string() }),
  strata: z.array(z.object({ id: z.string(), label: z.string() })),
  stratum_baseline_summary: z.array(
    z.object({
      stratum: z.string(),
      growing_window: z.string(),
      seasons: z.array(z.object({ year: z.number().int(), ndvi: z.number().nullable() })),
    }),
  ),
  results: z.array(
    z.object({
      stratum: z.string(),
      growing_window: z.string(),
      reliability: z.string(),
      ols: z.object({ slope_per_decade: z.number() }).nullable().optional(),
    }),
  ),
});

/**
 * A stratum's label as shown: its numbers of four or more digits with thousands separators ("below 2317 m" reads
 * "below 2,317 m", as every height on screen does). Only the digits' grouping changes; the record keeps its text.
 */
export function labelShown(label: string): string {
  return label.replace(/\d{4,}/g, (d) => new Intl.NumberFormat("en").format(Number(d)));
}

export interface StratumSeries {
  id: string;
  label: string;
  /** The season's value by year at the primary window. */
  ndvi: Map<number, number | null>;
  /** The trend over every season at the primary window and reliability (NDVI per decade). */
  slopePerDecade: number | null;
}

/** The catchment and its elevation bands at the place's primary growing window, as the season trend bundle holds them. */
export function strataFrom(json: unknown): StratumSeries[] {
  const st = seasonTrend.parse(json);
  const w = st.primary.growing_window;
  return st.strata
    .filter((s) => s.id === "catchment" || s.id.startsWith("elevation_"))
    .map((s) => {
      const base = st.stratum_baseline_summary.find(
        (b) => b.stratum === s.id && b.growing_window === w,
      );
      const res = st.results.find(
        (r) =>
          r.stratum === s.id && r.growing_window === w && r.reliability === st.primary.reliability,
      );
      return {
        id: s.id,
        label: s.label,
        ndvi: new Map((base?.seasons ?? []).map((x) => [x.year, x.ndvi])),
        slopePerDecade: res?.ols?.slope_per_decade ?? null,
      };
    });
}

const changeTimingSchema = z.object({
  change_timing: z.object({
    method: z.string(),
    tested_pixel_count: z.number().int(),
    upward_changepoint_fdr_count: z.number().int(),
    downward_changepoint_fdr_count: z.number().int(),
    median_change_year_upward: z.number().int().nullable(),
    median_change_year_all_upward: z.number().int().nullable(),
    cells_change_year: z.array(z.number().int()),
    by_change_year: z.array(
      z.object({
        year: z.number().int(),
        upward_trend_fdr_pixels: z.number().int(),
        upward_changepoint_fdr_pixels: z.number().int(),
      }),
    ),
  }),
});

export interface ChangeTimingYear {
  year: number;
  upwardTrendFdrPixels: number;
  upwardChangepointFdrPixels: number;
}

export interface ChangeTiming {
  method: string;
  testedPixels: number;
  upwardFdrPixels: number;
  downwardFdrPixels: number;
  medianYearUpward: number | null;
  medianYearAllUpward: number | null;
  cellsChangeYear: number[];
  byYear: ChangeTimingYear[];
}

/** Pettitt (1979) single change-point timing from the pixel seasons summary (7C). */
export function changeTimingFrom(summary: unknown): ChangeTiming {
  const { change_timing: ct } = changeTimingSchema.parse(summary);
  return {
    method: ct.method,
    testedPixels: ct.tested_pixel_count,
    upwardFdrPixels: ct.upward_changepoint_fdr_count,
    downwardFdrPixels: ct.downward_changepoint_fdr_count,
    medianYearUpward: ct.upward_changepoint_fdr_count > 0 ? ct.median_change_year_upward : null,
    medianYearAllUpward: ct.median_change_year_all_upward,
    cellsChangeYear: ct.cells_change_year,
    byYear: ct.by_change_year.map((row) => ({
      year: row.year,
      upwardTrendFdrPixels: row.upward_trend_fdr_pixels,
      upwardChangepointFdrPixels: row.upward_changepoint_fdr_pixels,
    })),
  };
}

const regionalScanSchema = z.object({
  regional_scan: z.object({
    window_total_pixels: z.number().int(),
    window_vs_catchment: z.object({
      in_window: z.object({
        tested_pixels: z.number().int(),
      }),
      in_catchment: z.object({
        tested_pixels: z.number().int(),
        upward_trend_fdr_pixel_share: z.number(),
        upward_trend_fdr_pixels: z.number().int(),
        median_slope_per_decade: z.number(),
      }),
      outside_catchment: z.object({
        tested_pixels: z.number().int(),
        upward_trend_fdr_pixel_share: z.number(),
        upward_trend_fdr_pixels: z.number().int(),
        median_slope_per_decade: z.number(),
      }),
    }),
    zones: z.array(
      z.object({
        group: z.string(),
        label: z.string(),
        rank: z.number().int(),
        upward_trend_fdr_share: z.number(),
        upward_changepoint_fdr_share: z.number(),
        upward_changepoint_fdr_pixels: z.number().int(),
        median_change_year: z.number().int().nullable(),
        median_change_year_fdr_pixels: z.number().int().nullable().optional(),
        median_slope_per_decade: z.number(),
      }),
    ),
  }),
});

export interface RegionalScanZone {
  group: string;
  label: string;
  rank: number;
  upwardTrendFdrShare: number;
  upwardChangepointFdrShare: number;
  upwardChangepointFdrPixels: number;
  medianChangeYear: number | null;
  medianSlopePerDecade: number;
}

export interface RegionalScan {
  windowTotalPixels: number;
  windowTestedPixels: number;
  inCatchment: {
    testedPixels: number;
    upwardTrendFdrShare: number;
    upwardTrendFdrPixels: number;
    medianSlopePerDecade: number;
  };
  outsideCatchment: {
    testedPixels: number;
    upwardTrendFdrShare: number;
    upwardTrendFdrPixels: number;
    medianSlopePerDecade: number;
  };
  zones: RegionalScanZone[];
}

/** Regional window scan and ranked terrain zones from the pixel seasons summary (7B). */
export function regionalScanFrom(summary: unknown): RegionalScan {
  const { regional_scan: rs } = regionalScanSchema.parse(summary);
  const wvc = rs.window_vs_catchment;
  return {
    windowTotalPixels: rs.window_total_pixels,
    windowTestedPixels: wvc.in_window.tested_pixels,
    inCatchment: {
      testedPixels: wvc.in_catchment.tested_pixels,
      upwardTrendFdrShare: wvc.in_catchment.upward_trend_fdr_pixel_share,
      upwardTrendFdrPixels: wvc.in_catchment.upward_trend_fdr_pixels,
      medianSlopePerDecade: wvc.in_catchment.median_slope_per_decade,
    },
    outsideCatchment: {
      testedPixels: wvc.outside_catchment.tested_pixels,
      upwardTrendFdrShare: wvc.outside_catchment.upward_trend_fdr_pixel_share,
      upwardTrendFdrPixels: wvc.outside_catchment.upward_trend_fdr_pixels,
      medianSlopePerDecade: wvc.outside_catchment.median_slope_per_decade,
    },
    zones: rs.zones.map((z) => ({
      group: z.group,
      label: z.label,
      rank: z.rank,
      upwardTrendFdrShare: z.upward_trend_fdr_share,
      upwardChangepointFdrShare: z.upward_changepoint_fdr_share,
      upwardChangepointFdrPixels: z.upward_changepoint_fdr_pixels,
      medianChangeYear:
        z.upward_changepoint_fdr_pixels > 0
          ? (z.median_change_year_fdr_pixels ?? z.median_change_year)
          : null,
      medianSlopePerDecade: z.median_slope_per_decade,
    })),
  };
}
