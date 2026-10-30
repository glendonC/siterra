// The valley fixtures in public/instruments/valley, copied from the approved specimens. The pages still read the
// relief, the trend cells, the layout and the statements from here until the bundles' display assets and the
// record's display statements land; the rest are the test inputs the case builders (derive.ts, context.ts,
// outline.ts) are checked against. Each names its source by its path in this repository, with the sha256 where the
// source is a bundle file; fixtures.test.ts recomputes them from data/bundles.

import { z } from "zod";

/** Where the browser reads the fixtures: the app's own origin. */
export const VALLEY_FIXTURES = "/instruments/valley/";

// Record values the fixtures carry only in their sources' names; fixtures.test.ts checks each against its bundle.
/** The equal-area elevation band limits (m): the strata bundle's siterra:method.parameters.boundaries_m. */
export const BAND_LIMITS_M = [2316.8, 2815.2] as const;
/** The CHIRPS reference period of the rain cells: their reference_mm_1991_2020 monthly means. */
export const RAIN_REFERENCE_YEARS = [1991, 2020] as const;
/** The seasons of the March to June trends in figures.json: the season trend bundle's period. */
export const SEASON_TREND_YEARS = [2000, 2025] as const;
/** The months the snow means cover: the snow tables run from 2001-01 to 2025-12. */
export const SNOW_YEARS = [2001, 2025] as const;
/** The land cover map: ESA WorldCover 2021 on the 10 m analysis grid. */
export const WORLDCOVER = { year: 2021, res: 10 } as const;

const xy = z.tuple([z.number(), z.number()]);
const xyz = z.tuple([z.number(), z.number(), z.number()]);
const grid = z.object({
  E0: z.number(),
  N0: z.number(),
  res: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const terrainMetaSchema = z.object({
  frame: z.object({ origin_E: z.number(), origin_N: z.number() }),
  relief: grid.extend({ file: z.string() }),
  analysis: grid,
});

/** The frozen catchment boundary as one ring in EPSG:32629. */
export const catchmentSchema = z.object({
  label: z.string(),
  area_km2_geodesic: z.number(),
  ring: z.array(xy).min(4),
});

/** D8 drainage reaches by Strahler order; each vertex carries the relief height (m). */
export const riversSchema = z.object({
  reaches: z.array(z.object({ order: z.number().int().min(1).max(5), pts: z.array(xyz).min(2) })),
});

/** One cell per MODIS pixel: four corners (E, N) then the March to June slope, NDVI per decade. */
const trendCell = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

export const trendCellsSchema = z.object({
  /** First and last season of the record. */
  period: z.tuple([z.number().int(), z.number().int()]),
  display_scale: z.object({
    domain_per_decade: z.tuple([z.number(), z.number()]),
    neutral_per_decade: z.number().nonnegative(),
  }),
  count: z.number().int(),
  median: z.number(),
  cells: z.array(trendCell),
});

export const rainCellsSchema = z.object({
  count: z.number().int(),
  min_mm: z.number(),
  max_mm: z.number(),
  cells: z.array(
    z.object({
      id: z.string(),
      corners: z.array(xy).length(4),
      sep_may_mm: z.number(),
      fraction_inside: z.number(),
      weight: z.number(),
    }),
  ),
});

const band = z.object({
  label: z.string(),
  monthly_mean: z.array(z.number().min(0).max(1)).length(12),
  years_used: z.array(z.number().int()).length(12),
});

/** Mean monthly snow-covered share by elevation band, 2001 to 2025. */
export const snowSchema = z.object({
  months: z.array(z.string()).length(12),
  bands: z.record(z.string(), band),
});

const trendFigure = z.object({ per_decade: z.number(), lower: z.number(), upper: z.number() });

export const figuresSchema = z.object({
  season_trend: z.object({
    catchment: trendFigure,
    elevation_low: trendFigure,
    elevation_mid: trendFigure,
    elevation_high: trendFigure,
  }),
  pixel_trend: z.object({
    modis_pixels_touched: z.number().int(),
    increasing_fdr_share: z.number(),
    decreasing_fdr_share: z.number(),
    upward_fdr_clusters: z.number().int(),
    downward_fdr_clusters: z.number().int(),
    fdr_q: z.number(),
  }),
  restrend: z.object({
    rainfall_fit_r_squared: z.number(),
    driest_sep_may: z.array(z.object({ season: z.number().int(), mm: z.number() })),
  }),
});

/**
 * Specimen A's measured stack (solved before rendering so that no sheet hides another): camera bearing and
 * elevation, scale in CSS px per km at 1440 x 900, the sheets' heights and the plate's corners in model x, z.
 */
export const layoutSchema = z.object({
  az: z.number(),
  el: z.number(),
  scale_px_per_km: z.number().positive(),
  target: xyz,
  sheet_y_km: z.array(z.number()).length(5),
  plate_xz: z.array(xy).length(4),
  label_x: z.number(),
});

export type TerrainMeta = z.infer<typeof terrainMetaSchema>;
export type Catchment = z.infer<typeof catchmentSchema>;
export type Rivers = z.infer<typeof riversSchema>;
export type TrendCells = z.infer<typeof trendCellsSchema>;
export type RainCells = z.infer<typeof rainCellsSchema>;
export type Snow = z.infer<typeof snowSchema>;
export type Figures = z.infer<typeof figuresSchema>;
export type LayerStackLayout = z.infer<typeof layoutSchema>;

export interface LayerStackData {
  meta: TerrainMeta;
  /** The 30 m relief, row 0 north, metres. */
  relief: Float32Array<ArrayBuffer>;
  catchment: Pick<Catchment, "ring">;
  rivers: Rivers;
  trend: TrendCells;
  rain: RainCells;
  snow: Snow;
  layout: LayerStackLayout;
}

export async function json<T>(url: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, signal ? { signal } : {});
  if (!r.ok) throw new Error(`${url}: ${String(r.status)}`);
  return schema.parse(await r.json());
}

/** The 30 m relief named by the terrain metadata, checked against its grid size. */
export async function loadRelief(
  base: string,
  meta: TerrainMeta,
  signal?: AbortSignal,
): Promise<Float32Array<ArrayBuffer>> {
  const r = await fetch(`${base}${meta.relief.file}`, signal ? { signal } : {});
  if (!r.ok) throw new Error(`${meta.relief.file}: ${String(r.status)}`);
  const buf = await r.arrayBuffer();
  if (buf.byteLength !== meta.relief.width * meta.relief.height * 4)
    throw new Error(`${meta.relief.file}: ${String(buf.byteLength)} bytes`);
  return new Float32Array(buf);
}
