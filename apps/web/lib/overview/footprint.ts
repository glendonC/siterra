// A finding's footprint on the overview's land (the lead's decision 6, 30 Oct 2026), read from the case's own assets
// through the instrument listing (checksums checked): every MODIS cell's March to June Theil-Sen slope from the trend
// bundle's trend_cells asset, painted on its fixed display scale (the slope only: the bundle's SCI-52 rule forbids
// drawing significance or false discovery rate classes), and the CHIRPS cells over the land from the rainfall layer's
// asset, shaded by the share of each cell inside the catchment. Pure: parsing and the colours of each mark; the scene
// paints them into a texture over the relief grid.

import { z } from "zod";
import { cssColour, pixelColours as C } from "../theme/obsidian";
import { lonLatToUtm } from "../instruments/valley/utm";
import type { TrendCells } from "../instruments/valley/fixtures";
import { ramp } from "../instruments/valley/palette";

export const trendCellsSchema = z.object({
  fields: z.array(z.string()),
  count: z.number().int(),
  period: z.tuple([z.number().int(), z.number().int()]).optional(),
  /** The season the slopes are computed over, as the asset words it ("March to June"). */
  window: z.string().optional(),
  crs: z.string().optional(),
  median_slope_per_decade: z.number().optional(),
  display_scale: z.object({
    domain_per_decade: z.tuple([z.number(), z.number()]),
    neutral_per_decade: z.number(),
  }),
  cells: z.array(z.array(z.number())),
});

export interface SlopeCell {
  /** Four corners in the case's UTM metres. */
  corners: [number, number][];
  slope: number;
}

export interface SlopeCells {
  cells: SlopeCell[];
  /** The fixed display scale: ± domain, and the neutral half width (NDVI per decade). */
  domain: number;
  neutral: number;
  /** The season window the asset states, or null when it states none. */
  window: string | null;
}

/** The trend_cells asset as quadrilaterals with their slopes, by the field names the asset lists. */
export function slopeCellsFrom(json: unknown): SlopeCells {
  const t = trendCellsSchema.parse(json);
  const at = (name: string) => {
    const i = t.fields.indexOf(name);
    if (i < 0) throw new Error(`trend_cells has no field ${name}`);
    return i;
  };
  const idx = ["E0", "N0", "E1", "N1", "E2", "N2", "E3", "N3"].map(at);
  const s = at("slope_per_decade");
  const cells = t.cells.map((c) => ({
    corners: [0, 2, 4, 6].map((k): [number, number] => [
      c[idx[k] ?? 0] ?? 0,
      c[idx[k + 1] ?? 0] ?? 0,
    ]),
    slope: c[s] ?? 0,
  }));
  if (cells.length !== t.count) throw new Error("trend_cells: count differs from its cells");
  const [lo, hi] = t.display_scale.domain_per_decade;
  return {
    cells,
    domain: Math.max(Math.abs(lo), Math.abs(hi)),
    neutral: t.display_scale.neutral_per_decade,
    window: t.window ?? null,
  };
}

/** A slope's colour on the fixed scale: the neutral middle, the browning arm below, the greening arm above. */
export function slopeColour(slope: number, domain: number, neutral: number): string {
  const a = Math.abs(slope);
  if (a < neutral) return C.slopeNeutral;
  return cssColour(
    ramp([C.slopeNeutral, ...(slope < 0 ? C.slopeBelow : C.slopeAbove)], Math.min(1, a / domain)),
  );
}

const rainSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      geometry: z.object({
        type: z.literal("Polygon"),
        coordinates: z.array(z.array(z.array(z.number()))),
      }),
      properties: z.object({ cell_id: z.string(), fraction_inside: z.number() }),
    }),
  ),
});

export interface RainCell {
  id: string;
  /** Its ring in the case's UTM metres. */
  ring: [number, number][];
  /** Share of the cell inside the catchment (0 to 1). */
  inside: number;
}

/** The rainfall layer's CHIRPS cells as rings in the model's projection, with the share of each inside. */
export function rainCellsFrom(json: unknown, zone: number): RainCell[] {
  return rainSchema.parse(json).features.map((f) => ({
    id: f.properties.cell_id,
    ring: (f.geometry.coordinates[0] ?? []).map(([lon, lat]) =>
      lonLatToUtm(lon ?? Number.NaN, lat ?? Number.NaN, zone),
    ),
    inside: f.properties.fraction_inside,
  }));
}

/**
 * The trend cells as the layer stack and the pixel's locator draw them (the shape of the valley fixture's
 * trend-cells.json): the record's period, its fixed display scale, the median, and per cell its four corners then its
 * slope, read from the asset's own field names.
 */
export function trendCellsFrom(json: unknown): TrendCells {
  const t = trendCellsSchema.parse(json);
  const s = slopeCellsFrom(json);
  if (!t.period) throw new Error("trend_cells states no period");
  if (t.median_slope_per_decade === undefined) throw new Error("trend_cells states no median");
  return {
    period: t.period,
    ...(t.window ? { window: t.window } : {}),
    display_scale: t.display_scale,
    count: t.count,
    median: t.median_slope_per_decade,
    cells: s.cells.map(
      (c): TrendCells["cells"][number] =>
        [...c.corners.flat(), c.slope] as TrendCells["cells"][number],
    ),
  };
}
