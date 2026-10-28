// The departure raster and the cropland hatch as MapLibre layers over the land (components, geo stage:
// one data raster, then the excluded-area hatch). Display cells are drawn as they are, never smoothed;
// the layers start unseen so the stage can fade them in once the picture has loaded (MOT-04).

import type { AddLayerObject, SourceSpecification } from "maplibre-gl";
import type { Corners } from "./daylight-style";

export interface DepartureMapLayer {
  imageUri: string;
  corners: Corners;
  excludedUri: string | undefined;
}

export interface HatchTile {
  width: number;
  height: number;
  data: Uint8Array;
  pixelRatio: number;
}

/** The part of maplibregl.Map these layers use. */
export interface DepartureMap {
  addSource(id: string, spec: SourceSpecification): unknown;
  getSource(id: string): unknown;
  removeSource(id: string): unknown;
  addLayer(spec: AddLayerObject): unknown;
  getLayer(id: string): unknown;
  removeLayer(id: string): unknown;
  hasImage(id: string): boolean;
  addImage(
    id: string,
    image: { width: number; height: number; data: Uint8Array },
    options?: { pixelRatio?: number },
  ): unknown;
  removeImage(id: string): unknown;
  setPaintProperty(layer: string, prop: string, value: unknown): unknown;
  /** Null without terrain (the flat reading). */
  readonly terrain?: { tileManager: { releaseAllRTT(): void } } | null;
}

const RASTER_SOURCE = "departure";
const EXCLUDED_SOURCE = "excluded-land";
const HATCH = "excluded-hatch";
export const DEPARTURE_LAYERS = ["departure-raster", "excluded-hatch", "excluded-edge"] as const;

/** The stage fades these layers frame by frame (MOT-04), so no paint transition may carry a value on. */
const INSTANT = { duration: 0, delay: 0 };

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);

/**
 * data.excluded-hatch: a 135 degree hatch (top left to bottom right on screen), 1 px lines 6 px apart. A
 * diagonal tile repeats seamlessly with a side of 6 * sqrt(2) px, rounded at the pixel ratio. The token
 * grey has about the luminance of the imagery and the departure colours under it, so each line sits on a
 * half-pixel `casing` either side, as the catchment line and the names do.
 */
export function hatchTile(stroke: string, casing: string, pixelRatio: number): HatchTile {
  const side = Math.round(6 * Math.SQRT2 * pixelRatio);
  // a line 1 px across is about sqrt(2) px wide along a row
  const half = (Math.SQRT2 * pixelRatio) / 2;
  const cased = half + (Math.SQRT2 * pixelRatio) / 2 / 2;
  const [line, edge] = [channels(stroke), channels(casing)];
  const data = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const d = (((x - y) % side) + side) % side;
      const across = Math.min(d, side - d);
      if (across > cased) continue;
      data.set([...(across > half ? edge : line), 255], (y * side + x) * 4);
    }
  return { width: side, height: side, data, pixelRatio };
}

/** `edge` is data.excluded-hatch-edge, the outline of the hatched land. */
export function addDepartureLayers(
  m: DepartureMap,
  l: DepartureMapLayer,
  hatch: HatchTile,
  edge: string,
): void {
  removeDepartureLayers(m);
  m.addSource(RASTER_SOURCE, { type: "image", url: l.imageUri, coordinates: l.corners });
  m.addLayer({
    id: "departure-raster",
    type: "raster",
    source: RASTER_SOURCE,
    paint: {
      "raster-opacity": 0,
      "raster-opacity-transition": INSTANT,
      "raster-resampling": "nearest",
      "raster-fade-duration": 0,
    },
  });
  if (!l.excludedUri) return;
  m.addImage(
    HATCH,
    { width: hatch.width, height: hatch.height, data: hatch.data },
    { pixelRatio: hatch.pixelRatio },
  );
  m.addSource(EXCLUDED_SOURCE, { type: "geojson", data: l.excludedUri });
  m.addLayer({
    id: "excluded-hatch",
    type: "fill",
    source: EXCLUDED_SOURCE,
    paint: { "fill-pattern": HATCH, "fill-opacity": 0, "fill-opacity-transition": INSTANT },
  });
  m.addLayer({
    id: "excluded-edge",
    type: "line",
    source: EXCLUDED_SOURCE,
    paint: {
      "line-color": edge,
      "line-width": 0.5,
      "line-opacity": 0,
      "line-opacity-transition": INSTANT,
    },
  });
}

/**
 * Opacity of every departure layer: 0 unseen, 1 drawn. Over terrain these layers are drawn into textures
 * draped on the relief, which maplibre-gl 6.14.0 redraws only when their source tiles, the zoom or the layer
 * set change, never on a paint change; without the release (and with a paint transition carrying the value
 * on after it) the relief keeps whichever frame was drawn last.
 */
export function setDepartureOpacity(m: DepartureMap, k: number): void {
  if (m.getLayer("departure-raster")) m.setPaintProperty("departure-raster", "raster-opacity", k);
  if (m.getLayer("excluded-hatch")) m.setPaintProperty("excluded-hatch", "fill-opacity", k);
  if (m.getLayer("excluded-edge")) m.setPaintProperty("excluded-edge", "line-opacity", k);
  m.terrain?.tileManager.releaseAllRTT();
}

export function removeDepartureLayers(m: DepartureMap): void {
  for (const id of [...DEPARTURE_LAYERS].reverse()) if (m.getLayer(id)) m.removeLayer(id);
  for (const id of [EXCLUDED_SOURCE, RASTER_SOURCE]) if (m.getSource(id)) m.removeSource(id);
  if (m.hasImage(HATCH)) m.removeImage(HATCH);
}
