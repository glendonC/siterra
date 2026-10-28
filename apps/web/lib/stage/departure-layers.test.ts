import { describe, expect, it } from "vitest";
import {
  addDepartureLayers,
  DEPARTURE_LAYERS,
  hatchTile,
  removeDepartureLayers,
  setDepartureOpacity,
  type DepartureMap,
} from "./departure-layers";

function fakeMap() {
  const sources = new Map<string, unknown>();
  const layers: { id: string; spec: Record<string, unknown> }[] = [];
  const images = new Map<string, unknown>();
  const paint: Record<string, Record<string, unknown>> = {};
  const m: DepartureMap = {
    addSource: (id, spec) => {
      sources.set(id, spec);
    },
    getSource: (id) => sources.get(id),
    removeSource: (id) => {
      sources.delete(id);
    },
    addLayer: (spec) => {
      layers.push({ id: spec.id, spec: spec as unknown as Record<string, unknown> });
      paint[spec.id] = { ...((spec as { paint?: Record<string, unknown> }).paint ?? {}) };
    },
    getLayer: (id) => layers.find((l) => l.id === id),
    removeLayer: (id) => {
      layers.splice(
        layers.findIndex((l) => l.id === id),
        1,
      );
    },
    hasImage: (id) => images.has(id),
    addImage: (id, img) => {
      images.set(id, img);
    },
    removeImage: (id) => {
      images.delete(id);
    },
    setPaintProperty: (id, prop, v) => {
      (paint[id] ??= {})[prop] = v;
    },
  };
  return { m, sources, layers, images, paint };
}

const layer = {
  imageUri: "/api/case-assets/b/h/period_2025-11/overview.webp",
  corners: [
    [-6.54, 31.76],
    [-6.14, 31.76],
    [-6.14, 31.49],
    [-6.54, 31.49],
  ] as [[number, number], [number, number], [number, number], [number, number]],
  excludedUri: "/api/case-assets/b/h/excluded-land.geojson",
};

describe("departure layers", () => {
  it("adds the raster at its corners, cells never smoothed, then the hatch above it, all unseen", () => {
    const f = fakeMap();
    addDepartureLayers(f.m, layer, hatchTile("#878481", 2), "edge");
    expect(f.sources.get("departure")).toEqual({
      type: "image",
      url: layer.imageUri,
      coordinates: layer.corners,
    });
    expect(f.sources.get("excluded-land")).toEqual({ type: "geojson", data: layer.excludedUri });
    expect(f.layers.map((l) => l.id)).toEqual([
      "departure-raster",
      "excluded-hatch",
      "excluded-edge",
    ]);
    expect(f.paint["departure-raster"]).toMatchObject({
      "raster-opacity": 0,
      "raster-resampling": "nearest",
    });
    expect(f.paint["excluded-hatch"]).toMatchObject({
      "fill-pattern": "excluded-hatch",
      "fill-opacity": 0,
    });
    setDepartureOpacity(f.m, 1);
    expect(f.paint["departure-raster"]?.["raster-opacity"]).toBe(1);
    expect(f.paint["excluded-hatch"]?.["fill-opacity"]).toBe(1);
  });

  it("draws no hatch when the bundle lists no cropland layer", () => {
    const f = fakeMap();
    addDepartureLayers(f.m, { ...layer, excludedUri: undefined }, hatchTile("#878481", 2), "edge");
    expect(f.layers.map((l) => l.id)).toEqual(["departure-raster"]);
  });

  it("removes everything it added, and can be added again", () => {
    const f = fakeMap();
    addDepartureLayers(f.m, layer, hatchTile("#878481", 2), "edge");
    removeDepartureLayers(f.m);
    expect(f.layers).toEqual([]);
    expect(f.sources.size).toBe(0);
    expect(f.images.size).toBe(0);
    addDepartureLayers(f.m, layer, hatchTile("#878481", 2), "edge");
    expect(f.layers).toHaveLength(DEPARTURE_LAYERS.length);
  });
});

describe("hatchTile", () => {
  it("is a 135 degree hatch of 1 px lines 6 px apart, at the pixel ratio", () => {
    const t = hatchTile("#878481", 2);
    // 6 px between lines across a diagonal tile: a side of 6 * sqrt(2) px
    expect(t.width).toBe(17);
    expect(t.height).toBe(17);
    expect(t.pixelRatio).toBe(2);
    const alpha = (x: number, y: number) => t.data[(y * t.width + x) * 4 + 3] ?? 0;
    // the line runs from top left to bottom right: on the diagonal, painted; off it, clear
    expect(alpha(8, 8)).toBe(255);
    expect(alpha(0, 0)).toBe(255);
    expect(alpha(8, 0)).toBe(0);
    expect(alpha(0, 8)).toBe(0);
    expect([...t.data.slice(0, 3)]).toEqual([0x87, 0x84, 0x81]);
  });
});
