// The layer stack's data. From the case, through the layer stack spec's assets (checksums checked): the catchment
// outline, the CHIRPS cells of the rainfall sheet and the snow shares of the snow sheet; the rivers from the case's
// drainage context features. Still from the valley fixtures until the bundles' display assets land: the relief, the
// trend cells (both GeoTIFFs in their bundles) and the specimen's measured layout. The land cover and strata images
// load with the scene.

import type { CaseSnapshot, InstrumentView } from "@siterra/contracts";
import { drawnAsset, readJsonAsset } from "../listing";
import { riversFrom } from "./context";
import { rainCellsFrom, snowFrom } from "./derive";
import {
  VALLEY_FIXTURES,
  json,
  layoutSchema,
  loadRelief,
  terrainMetaSchema,
  trendCellsSchema,
  type LayerStackData,
} from "./fixtures";
import { outlineRing } from "./outline";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export async function loadLayerStackData(
  view: InstrumentView,
  snapshot: CaseSnapshot,
  base = VALLEY_FIXTURES,
  fetchImpl: Fetch = (input, init) => fetch(input, init),
  signal?: AbortSignal,
): Promise<LayerStackData> {
  const p = view.spec.parameters;
  if (p.kind !== "layer_stack") throw new Error(`Not a layer stack spec: ${p.kind}`);
  const layer = (id: (typeof p.layers)[number]["layer"]) => {
    const found = p.layers.find((l) => l.layer === id);
    if (!found) throw new Error(`The layer stack spec has no ${id} layer`);
    return found.data;
  };
  const read = (ref: Parameters<typeof readJsonAsset>[1]) =>
    readJsonAsset(view, ref, fetchImpl, signal);
  const meta = await json(`${base}terrain-meta.json`, terrainMetaSchema, signal);
  const [relief, trend, layout, outline, rain, snow] = await Promise.all([
    loadRelief(base, meta, signal),
    json(`${base}trend-cells.json`, trendCellsSchema, signal),
    json(`${base}layout-a.json`, layoutSchema, signal),
    read(drawnAsset(view, "catchment_outline")),
    read(layer("rainfall")),
    read(layer("snow_cover")),
  ]);
  return {
    meta,
    relief,
    catchment: { ring: outlineRing(outline) },
    rivers: riversFrom(snapshot, p.drainageFeatureIds),
    trend,
    rain: rainCellsFrom(rain),
    snow: snowFrom(snow),
    layout,
  };
}
