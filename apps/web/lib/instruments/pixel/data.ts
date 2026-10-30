// The pixel anatomy's data (approved specimen C): one MODIS 250 m pixel at three scales plus the measured class
// spectra, the pixel's own season record and the proposed field check, copied from the S3 bundle
// (bundle_pixel_anatomy_ait_bouguemez) and the season trend tables by lib/instruments/pixel/fixture.ts, which the
// fixture test recomputes. The page builds the same data from the case's assets (case.ts); public/instruments/pixel/
// pixel.json stays as the test input that build is checked against. The colours are the theme's.

import { z } from "zod";

const xy = z.tuple([z.number(), z.number()]);
const reflectance = z.record(z.string(), z.number());
const season = z.object({ year: z.number().int(), ndvi: z.number() });

export const pixelSchema = z.object({
  /** The bundle files and tables the fixture is built from, with their checksums. */
  sources: z
    .array(z.object({ path: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/) }))
    .min(1),
  /** Why this pixel: the bundle's selection note and how it was chosen, word for word. */
  selection: z.object({ note: z.string().min(1), chosenBy: z.string().min(1) }),
  pixel: z.object({
    modis_tile: z.string(),
    tile_row: z.number().int(),
    tile_col: z.number().int(),
    analysis_cells: z.number().int(),
    /** The pixel's four corners in EPSG:32629. */
    footprint_utm29n: z.array(xy).length(4),
    trend_mar_jun: z.object({ slope_per_decade: z.number() }),
  }),
  /** The 10 m window around the pixel, row 0 north. */
  grid: z.object({
    rows: z.number().int(),
    cols: z.number().int(),
    origin_x: z.number(),
    origin_y: z.number(),
    truecolour_rgb: z.array(z.array(z.tuple([z.number(), z.number(), z.number()]))),
    ndvi_median: z.array(z.array(z.number().nullable())),
    worldcover: z.array(z.array(z.number().int())),
  }),
  ndvi_month: z.string().regex(/^\d{4}-\d{2}$/),
  ndvi_inside: z.object({ count_min: z.number().int(), count_max: z.number().int() }),
  /** WorldCover classes inside the pixel, in the composition bar's order. */
  classes: z.array(
    z.object({
      code: z.number().int(),
      cells: z.number().int(),
      cells_kept: z.number().int(),
      share: z.number(),
      median: reflectance,
      ndvi_of_median: z.number(),
    }),
  ),
  measured_shares: z.record(z.string(), z.number()),
  spectra: z.object({
    datetime: z.string(),
    cells_kept: z.number().int(),
    measured_ndvi: z.number(),
    pixel_mean: reflectance,
    bands: z.array(z.string()),
    wavelengths: z.record(
      z.string(),
      z.object({ center_wavelength_um: z.number(), full_width_half_max_um: z.number() }),
    ),
  }),
  /** The mixing control's example: `points` of share moved from class `from` to class `to`. */
  model: z.object({
    shift: z.object({ from: z.number().int(), to: z.number().int(), points: z.number() }),
  }),
  series: z.object({
    pixel: z.array(season),
    band: z.array(season),
    pixel_theil_sen: z.object({
      slope_per_decade: z.number(),
      lower_per_decade: z.number(),
      upper_per_decade: z.number(),
    }),
    pixel_line_intercept: z.number(),
  }),
  transect: z.object({
    length_m: z.number(),
    quadrats: z.number().int(),
    spacing_m: z.number(),
    start_utm29n: xy,
    end_utm29n: xy,
  }),
});

export type PixelData = z.infer<typeof pixelSchema>;
