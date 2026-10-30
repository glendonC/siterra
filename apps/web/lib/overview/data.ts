// The overview's data. From the case, through the instrument specs' assets (checksums checked): the catchment
// outline (the layer stack spec's drawn catchment_outline), the rivers from the case's drainage context features,
// the proposed field check's place, the pixel (the pixel anatomy spec's footprint), and the proposed walking routes
// from the case's route_proposed context features, and the land itself from the layer stack spec's drawn display
// assets (lib/land/terrain): the relief grid, the land cover raster and their headers, which give the UTM zone.

import type { CaseSnapshot, InstrumentView } from "@siterra/contracts";
import { drawnAsset, readJsonAsset } from "../instruments/listing";
import { loadCasePixel } from "../instruments/pixel/case";
import type { PixelData } from "../instruments/pixel/data";
import { riversFrom } from "../instruments/valley/context";
import type { Rivers, TerrainMeta } from "../instruments/valley/fixtures";
import { readCaseTerrain, type ReliefRange } from "../land/terrain";
import { outlineRing } from "../instruments/valley/outline";
import { rainCellsFrom, slopeCellsFrom, type RainCell, type SlopeCells } from "./footprint";
import { routesFrom, type RouteLine } from "./routes";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface OverviewData {
  /** The UTM zone (north) of every coordinate below, from the relief's header. */
  zone: number;
  meta: TerrainMeta;
  /** The relief, row 0 north, metres (nodata outside the catchment filled; see fillRelief). */
  relief: Float32Array<ArrayBuffer>;
  /** The catchment's own heights: lowest, highest and median. */
  range: ReliefRange;
  /** The 10 m land cover raster: R tree cover, G cropland or built-up, B inside the catchment. */
  landcover: ImageBitmap;
  /** The catchment outline in the zone's metres. */
  ring: [number, number][];
  rivers: Rivers;
  /** The case's proposed walking routes (none when the case holds none). */
  routes: RouteLine[];
  /** The findings' footprints from the layer stack spec's assets; null where an asset could not be read. */
  footprints: { slope: SlopeCells | null; rain: RainCell[] | null };
  /** The pixel the field check is proposed at: its four corners and its centre (the zone's metres), when the case has it. */
  pixel: {
    footprint: [number, number][];
    centre: [number, number];
    /** Its own March to June seasons and Theil-Sen line, for the opened record. */
    series: PixelData["series"];
    /** The bundle's note on how it was chosen ("an illustration chosen by judgment, not a sample"). */
    note: string;
  } | null;
}

/** The centre of a footprint: the mean of its corners. */
export function centreOf(corners: readonly (readonly [number, number])[]): [number, number] {
  const n = corners.length || 1;
  return [corners.reduce((s, c) => s + c[0], 0) / n, corners.reduce((s, c) => s + c[1], 0) / n];
}

/** The rain cells in the zone's metres, or null (with the reason logged) when the asset does not parse. */
function rainOrNull(json: unknown, zone: number): RainCell[] | null {
  try {
    return rainCellsFrom(json, zone);
  } catch (e) {
    console.error("Overview footprint not read", e);
    return null;
  }
}

export async function loadOverviewData(
  layers: InstrumentView,
  pixel: InstrumentView | null,
  snapshot: CaseSnapshot,
  fetchImpl: Fetch = (input, init) => fetch(input, init),
  signal?: AbortSignal,
): Promise<OverviewData> {
  const p = layers.spec.parameters;
  if (p.kind !== "layer_stack") throw new Error(`Not a layer stack spec: ${p.kind}`);
  const rainRef = p.layers.find((l) => l.layer === "rainfall")?.data;
  const optional = <T>(read: () => Promise<T>): Promise<T | null> =>
    read().catch((e: unknown) => {
      if (signal?.aborted) throw e;
      console.error("Overview footprint not read", e);
      return null;
    });
  const [slope, rain] = await Promise.all([
    optional(async () =>
      slopeCellsFrom(
        await readJsonAsset(layers, drawnAsset(layers, "trend_cells"), fetchImpl, signal),
      ),
    ),
    optional(async () => {
      if (!rainRef) throw new Error("the layer stack spec names no rainfall layer");
      return readJsonAsset(layers, rainRef, fetchImpl, signal);
    }),
  ]);
  const [terrain, outline, casePixel] = await Promise.all([
    readCaseTerrain([layers], fetchImpl, signal),
    readJsonAsset(layers, drawnAsset(layers, "catchment_outline"), fetchImpl, signal),
    pixel ? loadCasePixel(pixel, fetchImpl, signal) : Promise.resolve(null),
  ]);
  const footprint = casePixel?.pixel.pixel.footprint_utm29n.map(([e, n]): [number, number] => [
    e,
    n,
  ]);
  const zone = terrain.zone;
  return {
    zone,
    meta: terrain.meta,
    relief: terrain.relief,
    range: terrain.range,
    landcover: terrain.landcover,
    ring: outlineRing(outline, zone),
    rivers: riversFrom(snapshot, p.drainageFeatureIds, zone),
    routes: routesFrom(snapshot, zone),
    footprints: { slope, rain: rain === null ? null : rainOrNull(rain, zone) },
    pixel:
      footprint && casePixel
        ? {
            footprint,
            centre: centreOf(footprint),
            series: casePixel.pixel.series,
            note: casePixel.pixel.selection.note,
          }
        : null,
  };
}
