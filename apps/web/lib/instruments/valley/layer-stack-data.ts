// The layer stack's data. From the case, through the layer stack spec's assets (checksums checked): the catchment
// outline, the CHIRPS cells of the rainfall sheet and the snow shares of the snow sheet; the rivers from the case's
// drainage context features; the land (relief, land cover, elevation bands) and the trend cells from the spec's drawn
// display assets. The layout is derived from the land in the scene (lib/land/layer-layout).

import type { CaseSnapshot, InstrumentView } from "@siterra/contracts";
import { bandLimitsOf } from "../../land/record";
import { readCaseTerrain, type ReadTerrain } from "../../land/terrain";
import { trendCellsFrom } from "../../overview/footprint";
import { drawnAsset, readJsonAsset } from "../listing";
import { riversFrom } from "./context";
import { rainCellsFrom, snowFrom } from "./derive";
import type { LayerStackData } from "./fixtures";
import { outlineRing } from "./outline";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export async function loadLayerStackData(
  view: InstrumentView,
  snapshot: CaseSnapshot,
  fetchImpl: Fetch = (input, init) => fetch(input, init),
  signal?: AbortSignal,
  readTerrain: ReadTerrain = readCaseTerrain,
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
  const [land, trend, outline, rain, snow] = await Promise.all([
    readTerrain([view], fetchImpl, signal, { bands: true }),
    readJsonAsset(view, drawnAsset(view, "trend_cells"), fetchImpl, signal).then(trendCellsFrom),
    read(drawnAsset(view, "catchment_outline")),
    read(layer("rainfall")),
    read(layer("snow_cover")),
  ]);
  const limits = bandLimitsOf(snapshot);
  if (!limits) throw new Error("The record holds no two elevation band limits");
  return {
    zone: land.zone,
    limits,
    meta: land.meta,
    relief: land.relief,
    range: land.range,
    landcover: land.landcover,
    bands: land.bands,
    catchment: { ring: outlineRing(outline, land.zone) },
    rivers: riversFrom(snapshot, p.drainageFeatureIds, land.zone),
    trend,
    rain: rainCellsFrom(rain, land.zone),
    snow: snowFrom(snow),
  };
}
