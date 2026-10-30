// A case's land, from the display assets its layer stack and cross section specs draw (contracts 1.16.0 drawnAssets),
// read through the instrument listing with their checksums checked: the relief grid (float32, row 0 north) with its
// header, the land cover raster and the elevation band raster (indexed PNGs, palette index = value) with theirs. The
// headers carry the projected CRS, so the UTM zone, the grids and the model frame's origin come from the case, not
// from code. Nothing here knows which place it draws.

import type { BundleAssetRef, InstrumentView } from "@siterra/contracts";
import { z } from "zod";
import { drawnAsset, readAsset, readJsonAsset } from "../instruments/listing";
import type { Grid } from "../instruments/valley/frame";
import type { TerrainMeta } from "../instruments/valley/fixtures";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const rgb = z.tuple([z.number().int(), z.number().int(), z.number().int()]);

/** A raster asset's header as the science lane writes it next to the raster (.bin.json, .png.json). */
export const rasterHeaderSchema = z.object({
  crs: z.string(),
  transform: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
  shape: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  nodata: z.number().nullable().optional(),
  palette_rgb: z.record(z.string(), rgb).optional(),
  values: z.record(z.string(), z.string()).optional(),
});

export interface RasterHeader {
  /** The UTM zone of the header's CRS (EPSG:326zz, UTM north). */
  zone: number;
  crs: string;
  grid: Grid;
  nodata: number | null;
  /** Palette index (the raster's value) to its colour, for an indexed PNG. */
  palette: Map<number, readonly [number, number, number]>;
}

/** The UTM zone of a UTM north CRS ("EPSG:32629" is 29), or an error naming a CRS the scenes cannot draw. */
export function utmZoneOf(crs: string): number {
  const m = /^EPSG:326(\d{2})$/.exec(crs);
  const zone = m?.[1] === undefined ? Number.NaN : Number(m[1]);
  if (!(zone >= 1 && zone <= 60))
    throw new Error(`${crs}: only a UTM north CRS (EPSG:32601 to 32660) is drawn`);
  return zone;
}

/** A header read: a north-up grid with square cells in a UTM north CRS, or an error naming what is not. */
export function rasterHeader(json: unknown): RasterHeader {
  const h = rasterHeaderSchema.parse(json);
  const zone = utmZoneOf(h.crs);
  const [res, rx, E0, ry, nres, N0] = h.transform;
  if (rx !== 0 || ry !== 0 || res <= 0 || nres !== -res)
    throw new Error(`${h.crs}: the grid is not north-up with square cells`);
  const [height, width] = h.shape;
  return {
    zone,
    crs: h.crs,
    grid: { E0, N0, res, width, height },
    nodata: h.nodata ?? null,
    palette: new Map(Object.entries(h.palette_rgb ?? {}).map(([k, v]) => [Number(k), v] as const)),
  };
}

/** The heights inside the catchment (the cells that hold a value). */
export interface ReliefRange {
  min: number;
  max: number;
  median: number;
}

/**
 * The relief with its nodata cells (outside the catchment) filled from their nearest held neighbours, ring by ring,
 * so that interpolation at the catchment's edge never reaches the nodata value; cells beyond `rings` take the
 * lowest held height. Returns the filled grid and the range of the held heights.
 */
export function fillRelief(
  values: Float32Array,
  width: number,
  height: number,
  nodata: number | null,
  rings = 12,
): { heights: Float32Array<ArrayBuffer>; range: ReliefRange } {
  const n = width * height;
  const out = new Float32Array(n);
  const held = new Uint8Array(n);
  const kept: number[] = [];
  for (let k = 0; k < n; k++) {
    const v = values[k] ?? Number.NaN;
    if (Number.isFinite(v) && v !== nodata) {
      out[k] = v;
      held[k] = 1;
      kept.push(v);
    }
  }
  if (kept.length === 0) throw new Error("the relief holds no height");
  kept.sort((a, b) => a - b);
  const range = {
    min: kept[0] ?? 0,
    max: kept[kept.length - 1] ?? 0,
    median: kept[Math.floor(kept.length / 2)] ?? 0,
  };
  let front = held.slice();
  for (let r = 0; r < rings; r++) {
    const next = front.slice();
    let grew = false;
    for (let j = 0; j < height; j++)
      for (let i = 0; i < width; i++) {
        const k = j * width + i;
        if (front[k]) continue;
        let s = 0;
        let c = 0;
        if (i > 0 && front[k - 1]) {
          s += out[k - 1] ?? 0;
          c++;
        }
        if (i < width - 1 && front[k + 1]) {
          s += out[k + 1] ?? 0;
          c++;
        }
        if (j > 0 && front[k - width]) {
          s += out[k - width] ?? 0;
          c++;
        }
        if (j < height - 1 && front[k + width]) {
          s += out[k + width] ?? 0;
          c++;
        }
        if (c > 0) {
          out[k] = s / c;
          next[k] = 1;
          grew = true;
        }
      }
    front = next;
    if (!grew) break;
  }
  for (let k = 0; k < n; k++) if (!front[k]) out[k] = range.min;
  return { heights: out, range };
}

/** The value a decoded palette colour stands for, or 0 (nodata) for a transparent or unknown colour. */
function valueLookup(
  palette: RasterHeader["palette"],
): (r: number, g: number, b: number, a: number) => number {
  const byColour = new Map<number, number>();
  for (const [v, [r, g, b]] of palette) byColour.set((r << 16) | (g << 8) | b, v);
  return (r, g, b, a) => (a === 0 ? 0 : (byColour.get((r << 16) | (g << 8) | b) ?? 0));
}

/**
 * The land cover as the scenes draw it, from the decoded indexed PNG (RGBA): R tree cover (WorldCover 10), G cropland
 * or built-up (40, 50), B inside the catchment (any class held), each 0 or 255.
 */
export function coverMask(
  rgba: Uint8ClampedArray,
  palette: RasterHeader["palette"],
): Uint8ClampedArray {
  const value = valueLookup(palette);
  const out = new Uint8ClampedArray(rgba.length);
  for (let k = 0; k < rgba.length; k += 4) {
    const v = value(rgba[k] ?? 0, rgba[k + 1] ?? 0, rgba[k + 2] ?? 0, rgba[k + 3] ?? 0);
    out[k] = v === 10 ? 255 : 0;
    out[k + 1] = v === 40 || v === 50 ? 255 : 0;
    out[k + 2] = v !== 0 ? 255 : 0;
    out[k + 3] = 255;
  }
  return out;
}

/** The elevation bands as the scenes draw them: R band 1 (low), G band 2, B band 3 (high), each 0 or 255. */
export function bandMask(
  rgba: Uint8ClampedArray,
  palette: RasterHeader["palette"],
): Uint8ClampedArray {
  const value = valueLookup(palette);
  const out = new Uint8ClampedArray(rgba.length);
  for (let k = 0; k < rgba.length; k += 4) {
    const v = value(rgba[k] ?? 0, rgba[k + 1] ?? 0, rgba[k + 2] ?? 0, rgba[k + 3] ?? 0);
    out[k] = v === 1 ? 255 : 0;
    out[k + 1] = v === 2 ? 255 : 0;
    out[k + 2] = v === 3 ? 255 : 0;
    out[k + 3] = 255;
  }
  return out;
}

/** The model frame's terrain description: its origin at the centre of the 10 m analysis grid. */
export function terrainMeta(relief: Grid, analysis: Grid): TerrainMeta {
  return {
    frame: {
      origin_E: analysis.E0 + (analysis.width * analysis.res) / 2,
      origin_N: analysis.N0 - (analysis.height * analysis.res) / 2,
    },
    relief: { ...relief, file: "" },
    analysis,
  };
}

export interface CaseTerrain {
  zone: number;
  meta: TerrainMeta;
  /** The relief, row 0 north, metres, nodata filled (see fillRelief). */
  relief: Float32Array<ArrayBuffer>;
  /** The held heights' range (the catchment's own). */
  range: ReliefRange;
  /** The land cover mask on the analysis grid (see coverMask). */
  landcover: ImageBitmap;
  /** The elevation bands on the analysis grid (see bandMask), when asked for. */
  bands: ImageBitmap | null;
}

async function decoded(bytes: ArrayBuffer, header: RasterHeader): Promise<ImageData> {
  const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
    imageOrientation: "none",
  });
  if (bmp.width !== header.grid.width || bmp.height !== header.grid.height)
    throw new Error(
      `the raster is ${String(bmp.width)} x ${String(bmp.height)}, not its header's grid`,
    );
  const cv = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2D context");
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, cv.width, cv.height, { colorSpace: "srgb" });
}

const bitmapOf = (data: Uint8ClampedArray<ArrayBuffer>, g: Grid) =>
  createImageBitmap(new ImageData(data, g.width, g.height), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
    imageOrientation: "none",
  });

/** An asset a spec draws in a role, when the spec names it; else from the first other view that does. */
function drawn(
  views: readonly InstrumentView[],
  role: string,
): { view: InstrumentView; ref: BundleAssetRef } {
  for (const view of views) {
    try {
      return { view, ref: drawnAsset(view, role) };
    } catch {
      // the next view may name it
    }
  }
  return { view: views[0] as InstrumentView, ref: drawnAsset(views[0] as InstrumentView, role) };
}

/** How a loader reads the land (readCaseTerrain in the browser; tests give a stand-in, as Node has no image decoder). */
export type ReadTerrain = (
  views: readonly InstrumentView[],
  fetchImpl: Fetch,
  signal?: AbortSignal,
  options?: { bands?: boolean },
) => Promise<CaseTerrain>;

/**
 * Reads a case's terrain from the drawn assets of the given instrument views (the first that names each role):
 * relief_grid and relief_grid_header, land_cover_raster and land_cover_header, and with `bands`,
 * elevation_band_raster and elevation_band_header. The relief and the rasters must share one CRS.
 */
export async function readCaseTerrain(
  views: readonly InstrumentView[],
  fetchImpl: Fetch,
  signal?: AbortSignal,
  options: { bands?: boolean } = {},
): Promise<CaseTerrain> {
  if (views.length === 0) throw new Error("no instrument view to read the terrain from");
  const read = (role: string) => {
    const { view, ref } = drawn(views, role);
    return readAsset(view, ref, fetchImpl, signal);
  };
  const header = async (role: string) => {
    const { view, ref } = drawn(views, role);
    return rasterHeader(await readJsonAsset(view, ref, fetchImpl, signal));
  };
  const [rh, reliefBytes, ch, coverBytes, bh, bandBytes] = await Promise.all([
    header("relief_grid_header"),
    read("relief_grid"),
    header("land_cover_header"),
    read("land_cover_raster"),
    options.bands ? header("elevation_band_header") : Promise.resolve(null),
    options.bands ? read("elevation_band_raster") : Promise.resolve(null),
  ]);
  for (const h of [ch, bh])
    if (h && h.crs !== rh.crs)
      throw new Error(`the rasters are in ${h.crs}, the relief in ${rh.crs}`);
  if (bh && (bh.grid.E0 !== ch.grid.E0 || bh.grid.N0 !== ch.grid.N0 || bh.grid.res !== ch.grid.res))
    throw new Error("the elevation bands and the land cover are on different grids");
  const g = rh.grid;
  if (reliefBytes.byteLength !== g.width * g.height * 4)
    throw new Error(
      `the relief grid is ${String(reliefBytes.byteLength)} bytes, not its header's grid`,
    );
  const { heights, range } = fillRelief(
    new Float32Array(reliefBytes),
    g.width,
    g.height,
    rh.nodata,
  );
  const cover = coverMask((await decoded(coverBytes, ch)).data, ch.palette);
  const bands = bh && bandBytes ? bandMask((await decoded(bandBytes, bh)).data, bh.palette) : null;
  const [landcover, bandBitmap] = await Promise.all([
    bitmapOf(cover as Uint8ClampedArray<ArrayBuffer>, ch.grid),
    bands && bh
      ? bitmapOf(bands as Uint8ClampedArray<ArrayBuffer>, bh.grid)
      : Promise.resolve(null),
  ]);
  return {
    zone: rh.zone,
    meta: terrainMeta(g, ch.grid),
    relief: heights,
    range,
    landcover,
    bands: bandBitmap,
  };
}
