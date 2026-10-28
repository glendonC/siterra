// The daylight map style for the valley: lit relief with the Sentinel-2 summer composite as its material,
// the catchment in light and the land outside it veiled toward paper, the catchment line on the ridge
// crest, and a thin warm beam at the outlet. Built as plain style JSON so it can be tested without a map.

import type { Feature, Polygon, Position } from "./geo";
import type { StyleSpecification } from "maplibre-gl";
import { daylight } from "../theme/daylight";
import { ARRIVAL_EXAGGERATION, ARRIVAL_LIGHT } from "./arrival";
import { smoothFeature } from "./smooth";

/** Corners of a draped picture: top left, top right, bottom right, bottom left, as [lon, lat]. */
export type LonLat = [number, number];
export type Corners = [LonLat, LonLat, LonLat, LonLat];

export type RasterAsset =
  | {
      kind: "tiles";
      tiles: string[];
      tileSize: number;
      maxzoom: number;
      bounds?: [number, number, number, number];
    }
  | { kind: "image"; url: string; coordinates: Corners };

export interface ValleyAssets {
  /** Terrarium-encoded elevation tiles; bounds keep requests inside the self-hosted extent. */
  terrain: {
    tiles: string[];
    tileSize: number;
    maxzoom: number;
    attribution: string;
    bounds?: [number, number, number, number];
  };
  /** Sentinel-2 composite at 30 m over the wider land. */
  imageryOuter: RasterAsset;
  /** Sentinel-2 composite at 10 m over the catchment and about 5 km round it. */
  imageryInner: RasterAsset;
  /** Paper haze away from the study area, drawn by the client as a radial picture. */
  haze?: { url: string; coordinates: Corners };
  imageryAttribution: string;
}

export interface ValleyStyleInput {
  assets: ValleyAssets;
  catchment: Feature;
  /** The outlet from the case's record, where the beam stands; no beam without one. */
  outlet?: { lon: number; lat: number } | undefined;
  /** Saturation shift for the imagery round the catchment (the light pool keeps more colour). */
  imagerySaturation?: number;
  /** Saturation shift for the wider land, which takes the paper haze. */
  outerSaturation?: number;
}

/** Outer ring of the veil: far larger than any view of the valley. */
const VEIL_RING: Position[] = [
  [-12, 26],
  [0, 26],
  [0, 37],
  [-12, 37],
  [-12, 26],
];

/** The land outside the catchment: a box with every catchment ring cut out of it. */
export function outsideVeil(catchment: Feature): Feature<Polygon> {
  const g = catchment.geometry;
  const outers =
    g.type === "Polygon" ? g.coordinates.slice(0, 1) : g.coordinates.flatMap((p) => p.slice(0, 1));
  return {
    type: "Feature",
    properties: { role: "outside" },
    geometry: {
      type: "Polygon",
      coordinates: [VEIL_RING, ...outers.map((ring) => [...ring].reverse())],
    },
  };
}

/** A square footprint of the given side in metres around a point, for a thin extruded beam. */
export function beamFootprint(lon: number, lat: number, sideM: number): Feature<Polygon> {
  const half = sideM / 2;
  const dLat = half / 111320;
  const dLon = half / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    type: "Feature",
    properties: { role: "outlet-beam" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lon - dLon, lat - dLat],
          [lon + dLon, lat - dLat],
          [lon + dLon, lat + dLat],
          [lon - dLon, lat + dLat],
          [lon - dLon, lat - dLat],
        ],
      ],
    },
  };
}

function rasterSource(asset: RasterAsset, attribution: string) {
  return asset.kind === "tiles"
    ? {
        type: "raster" as const,
        tiles: asset.tiles,
        tileSize: asset.tileSize,
        maxzoom: asset.maxzoom,
        ...(asset.bounds ? { bounds: asset.bounds } : {}),
        attribution,
      }
    : { type: "image" as const, url: asset.url, coordinates: asset.coordinates };
}

export function valleyStyle({
  assets,
  catchment,
  outlet,
  imagerySaturation = 0.1,
  outerSaturation = -0.45,
}: ValleyStyleInput): StyleSpecification {
  return {
    version: 8,
    sources: {
      terrain: {
        type: "raster-dem",
        encoding: "terrarium",
        tiles: assets.terrain.tiles,
        tileSize: assets.terrain.tileSize,
        maxzoom: assets.terrain.maxzoom,
        attribution: assets.terrain.attribution,
        ...(assets.terrain.bounds ? { bounds: assets.terrain.bounds } : {}),
      },
      // the same elevation tiles again for the hillshade: MapLibre draws better shading from its own source
      "terrain-shade": {
        type: "raster-dem",
        encoding: "terrarium",
        tiles: assets.terrain.tiles,
        tileSize: assets.terrain.tileSize,
        maxzoom: assets.terrain.maxzoom,
        ...(assets.terrain.bounds ? { bounds: assets.terrain.bounds } : {}),
      },
      "imagery-outer": rasterSource(assets.imageryOuter, assets.imageryAttribution),
      "imagery-inner": rasterSource(assets.imageryInner, assets.imageryAttribution),
      // the drawn outline is smoothed for display (the record's 30 m geometry steps at every cell)
      catchment: { type: "geojson", data: smoothFeature(catchment) },
      outside: { type: "geojson", data: outsideVeil(smoothFeature(catchment)) },
      outlet: {
        type: "geojson",
        data: outlet
          ? beamFootprint(outlet.lon, outlet.lat, 60)
          : { type: "FeatureCollection", features: [] },
      },
      ...(assets.haze
        ? {
            haze: {
              type: "image" as const,
              url: assets.haze.url,
              coordinates: assets.haze.coordinates,
            },
          }
        : {}),
    },
    terrain: { source: "terrain", exaggeration: ARRIVAL_EXAGGERATION },
    // a soft light for the one extruded object, the outlet beam, so it reads as the accent and not in shadow
    light: { anchor: "map", color: daylight.keyLight, intensity: 0.15 },
    sky: {
      "sky-color": daylight.sky,
      "horizon-color": daylight.horizon,
      "fog-color": daylight.fog,
      "sky-horizon-blend": 1,
      "horizon-fog-blend": 1,
      "fog-ground-blend": 0.35,
      "atmosphere-blend": 0,
    },
    layers: [
      { id: "paper", type: "background", paint: { "background-color": daylight.paper } },
      {
        id: "imagery-outer",
        type: "raster",
        source: "imagery-outer",
        paint: {
          "raster-saturation": outerSaturation,
          "raster-fade-duration": 0,
        },
      },
      {
        id: "imagery-inner",
        type: "raster",
        source: "imagery-inner",
        paint: { "raster-saturation": imagerySaturation, "raster-fade-duration": 0 },
      },
      {
        id: "relief",
        type: "hillshade",
        source: "terrain-shade",
        paint: {
          "hillshade-illumination-direction": ARRIVAL_LIGHT.azimuthDeg,
          "hillshade-illumination-altitude": ARRIVAL_LIGHT.altitudeDeg,
          "hillshade-illumination-anchor": "map",
          "hillshade-exaggeration": 1,
          "hillshade-method": "basic",
          "hillshade-shadow-color": daylight.hillshadeShadow,
          "hillshade-highlight-color": daylight.hillshadeHighlight,
          "hillshade-accent-color": daylight.hillshadeAccent,
        },
      },
      {
        id: "light-pool",
        type: "fill",
        source: "catchment",
        // off until arrival: the light warms inside the line as the valley is reached
        paint: { "fill-color": daylight.pool, "fill-opacity": 0 },
      },
      {
        id: "outside-veil",
        type: "fill",
        source: "outside",
        paint: { "fill-color": daylight.outsideVeil },
      },
      ...(assets.haze
        ? [
            {
              id: "haze",
              type: "raster" as const,
              source: "haze",
              paint: { "raster-fade-duration": 0 },
            },
          ]
        : []),
      {
        id: "catchment-casing",
        type: "line",
        source: "catchment",
        layout: { "line-join": "round" },
        // widths measured on the approved frame: an ink stroke about 4 device px over a thin paper casing
        paint: { "line-color": daylight.outlineCasing, "line-width": 4.4 },
      },
      {
        id: "catchment-line",
        type: "line",
        source: "catchment",
        layout: { "line-join": "round" },
        paint: { "line-color": daylight.outline, "line-width": 2.2 },
      },
      {
        id: "outlet-beam",
        type: "fill-extrusion",
        source: "outlet",
        paint: {
          "fill-extrusion-color": daylight.accent,
          // above the ground under the outlet, in metres before exaggeration
          "fill-extrusion-height": 4200,
          "fill-extrusion-base": 0,
          // off until the outlet lands at arrival
          "fill-extrusion-opacity": 0,
        },
      },
    ],
  };
}
