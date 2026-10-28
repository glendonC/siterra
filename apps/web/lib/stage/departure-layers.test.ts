import { describe, expect, it } from "vitest";
import {
  addDepartureLayers,
  DEPARTURE_LAYERS,
  hatchTile,
  removeDepartureLayers,
  setDepartureOpacity,
  type DepartureMap,
} from "./departure-layers";
import { daylight, ndviDeparture } from "../theme/daylight";

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
    addDepartureLayers(f.m, layer, hatchTile("#878481", "#f2efea", 2), "edge");
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

  it("redraws the textures the terrain drapes after each opacity change, so the fade's end is what shows", () => {
    // maplibre-gl 6.14.0 keeps a draped tile's texture until its source tiles, zoom or layer set change;
    // a paint change alone leaves the fade's early frame on the relief
    const f = fakeMap();
    const calls: string[] = [];
    const m: DepartureMap = {
      ...f.m,
      setPaintProperty: (id, prop, v) => {
        calls.push(`${id} ${prop} ${String(v)}`);
        f.m.setPaintProperty(id, prop, v);
      },
      terrain: { tileManager: { releaseAllRTT: () => calls.push("release") } },
    };
    addDepartureLayers(m, layer, hatchTile("#878481", "#f2efea", 2), "edge");
    // the stage drives the fade frame by frame: maplibre's own 300 ms paint transition would carry each
    // value on past the release
    const instant = { duration: 0, delay: 0 };
    expect(f.paint["departure-raster"]?.["raster-opacity-transition"]).toEqual(instant);
    expect(f.paint["excluded-hatch"]?.["fill-opacity-transition"]).toEqual(instant);
    expect(f.paint["excluded-edge"]?.["line-opacity-transition"]).toEqual(instant);
    calls.length = 0;
    setDepartureOpacity(m, 0.4);
    setDepartureOpacity(m, 1);
    expect(calls).toEqual([
      "departure-raster raster-opacity 0.4",
      "excluded-hatch fill-opacity 0.4",
      "excluded-edge line-opacity 0.4",
      "release",
      "departure-raster raster-opacity 1",
      "excluded-hatch fill-opacity 1",
      "excluded-edge line-opacity 1",
      "release",
    ]);
    // the flat reading has no terrain: nothing to release
    expect(() => {
      setDepartureOpacity({ ...f.m, terrain: null }, 1);
    }).not.toThrow();
  });

  it("draws no hatch when the bundle lists no cropland layer", () => {
    const f = fakeMap();
    addDepartureLayers(
      f.m,
      { ...layer, excludedUri: undefined },
      hatchTile("#878481", "#f2efea", 2),
      "edge",
    );
    expect(f.layers.map((l) => l.id)).toEqual(["departure-raster"]);
  });

  it("removes everything it added, and can be added again", () => {
    const f = fakeMap();
    addDepartureLayers(f.m, layer, hatchTile("#878481", "#f2efea", 2), "edge");
    removeDepartureLayers(f.m);
    expect(f.layers).toEqual([]);
    expect(f.sources.size).toBe(0);
    expect(f.images.size).toBe(0);
    addDepartureLayers(f.m, layer, hatchTile("#878481", "#f2efea", 2), "edge");
    expect(f.layers).toHaveLength(DEPARTURE_LAYERS.length);
  });
});

/** WCAG 2 contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe("hatchTile", () => {
  it("cases each stroke in paper on both sides, so it reads over any ground and any departure colour", () => {
    // the token grey alone is about 1.2:1 on the strongest departure green: it reads only on its casing
    expect(contrast(daylight.excludedHatch, ndviDeparture.above3)).toBeLessThan(1.5);
    expect(contrast(daylight.excludedHatch, daylight.outlineCasing)).toBeGreaterThanOrEqual(3);
    const t = hatchTile(daylight.excludedHatch, daylight.outlineCasing, 2);
    const px = (x: number, y: number) => [
      ...t.data.slice((y * t.width + x) * 4, (y * t.width + x) * 4 + 4),
    ];
    expect(px(0, 0)).toEqual([0x87, 0x84, 0x81, 255]);
    expect(px(2, 0)).toEqual([0xf2, 0xef, 0xea, 255]);
    expect(px(15, 0)).toEqual([0xf2, 0xef, 0xea, 255]);
    expect(px(5, 0)[3]).toBe(0);
    // stroke and casing together cover under a third of the land, so the departure stays readable
    let inked = 0;
    for (let i = 3; i < t.data.length; i += 4) if (t.data[i]) inked++;
    expect(inked / (t.width * t.height)).toBeLessThan(1 / 3);
  });

  it("is a 135 degree hatch of 1 px lines 6 px apart, at the pixel ratio", () => {
    const t = hatchTile("#878481", "#f2efea", 2);
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
