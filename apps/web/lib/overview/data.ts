// The overview's data. From the case, through the instrument specs' assets (checksums checked): the catchment
// outline (the layer stack spec's drawn catchment_outline), the rivers from the case's drainage context features,
// the proposed field check's place, the pixel (the pixel anatomy spec's footprint), and the proposed walking routes
// from the case's route_proposed context features. Still from the valley
// fixtures, as the layer stack reads them: the 30 m relief, its terrain metadata and the 10 m land cover raster.

import type { CaseSnapshot, InstrumentView } from "@siterra/contracts";
import { drawnAsset, readJsonAsset } from "../instruments/listing";
import { loadCasePixel } from "../instruments/pixel/case";
import type { PixelData } from "../instruments/pixel/data";
import { riversFrom } from "../instruments/valley/context";
import {
  VALLEY_FIXTURES,
  json,
  loadRelief,
  terrainMetaSchema,
  type Rivers,
  type TerrainMeta,
} from "../instruments/valley/fixtures";
import { outlineRing } from "../instruments/valley/outline";
import { routesFrom, type RouteLine } from "./routes";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface OverviewData {
  meta: TerrainMeta;
  /** The 30 m relief, row 0 north, metres. */
  relief: Float32Array<ArrayBuffer>;
  /** The 10 m land cover raster: R tree cover, G cropland or built-up, B inside the catchment. */
  landcover: ImageBitmap;
  /** The catchment outline in EPSG:32629 metres. */
  ring: [number, number][];
  rivers: Rivers;
  /** The case's proposed walking routes (none when the case holds none). */
  routes: RouteLine[];
  /** The pixel the field check is proposed at: its four corners and its centre (EPSG:32629), when the case has it. */
  pixel: {
    footprint: [number, number][];
    centre: [number, number];
    /** Its own March to June seasons and Theil-Sen line, for the opened record. */
    series: PixelData["series"];
  } | null;
}

/** The centre of a footprint: the mean of its corners. */
export function centreOf(corners: readonly (readonly [number, number])[]): [number, number] {
  const n = corners.length || 1;
  return [corners.reduce((s, c) => s + c[0], 0) / n, corners.reduce((s, c) => s + c[1], 0) / n];
}

async function bitmap(url: string, fetchImpl: Fetch, signal?: AbortSignal): Promise<ImageBitmap> {
  const r = await fetchImpl(url, signal ? { signal } : {});
  if (!r.ok) throw new Error(`${url}: ${String(r.status)}`);
  return createImageBitmap(await r.blob(), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
    imageOrientation: "none",
  });
}

export async function loadOverviewData(
  layers: InstrumentView,
  pixel: InstrumentView | null,
  snapshot: CaseSnapshot,
  base = VALLEY_FIXTURES,
  fetchImpl: Fetch = (input, init) => fetch(input, init),
  signal?: AbortSignal,
): Promise<OverviewData> {
  const p = layers.spec.parameters;
  if (p.kind !== "layer_stack") throw new Error(`Not a layer stack spec: ${p.kind}`);
  const meta = await json(`${base}terrain-meta.json`, terrainMetaSchema, signal);
  const [relief, landcover, outline, casePixel] = await Promise.all([
    loadRelief(base, meta, signal),
    bitmap(`${base}landcover-10m.png`, fetchImpl, signal),
    readJsonAsset(layers, drawnAsset(layers, "catchment_outline"), fetchImpl, signal),
    pixel ? loadCasePixel(pixel, fetchImpl, signal) : Promise.resolve(null),
  ]);
  const footprint = casePixel?.pixel.pixel.footprint_utm29n.map(([e, n]): [number, number] => [
    e,
    n,
  ]);
  return {
    meta,
    relief,
    landcover,
    ring: outlineRing(outline),
    rivers: riversFrom(snapshot, p.drainageFeatureIds),
    routes: routesFrom(snapshot),
    pixel:
      footprint && casePixel
        ? { footprint, centre: centreOf(footprint), series: casePixel.pixel.series }
        : null,
  };
}
