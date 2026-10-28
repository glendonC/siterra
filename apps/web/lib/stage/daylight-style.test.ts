import { describe, expect, it } from "vitest";
import { daylight } from "../theme/daylight";
import { ARRIVAL_EXAGGERATION, ARRIVAL_LIGHT } from "./arrival";
import {
  beamFootprint,
  outsideVeil,
  VEIL_OPACITY,
  valleyStyle,
  type ValleyAssets,
} from "./daylight-style";
import type { Feature, Polygon } from "./geo";

const square: Feature<Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-6.5, 31.6],
        [-6.2, 31.6],
        [-6.2, 31.75],
        [-6.5, 31.75],
        [-6.5, 31.6],
      ],
    ],
  },
};

const assets: ValleyAssets = {
  terrain: {
    tiles: ["/t/{z}/{x}/{y}.png"],
    tileSize: 512,
    maxzoom: 12,
    attribution: "terrain notice",
  },
  imagery: {
    image: { kind: "tiles", tiles: ["/i/{z}/{x}/{y}.webp"], tileSize: 256, maxzoom: 15 },
    attribution: "imagery notice",
  },
};

function colours(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string" && /^(#|rgb)/.test(value)) out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => colours(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => colours(v, out));
  return out;
}

describe("valleyStyle", () => {
  const style = valleyStyle({ assets, catchment: square });

  it("asks for terrain only inside its bounds when the manifest gives them", () => {
    const bounded = valleyStyle({
      assets: { ...assets, terrain: { ...assets.terrain, bounds: [-6.71, 31.33, -5.98, 31.92] } },
      catchment: square,
    });
    for (const id of ["terrain", "terrain-shade"])
      expect((bounded.sources[id] as { bounds?: number[] }).bounds).toEqual([
        -6.71, 31.33, -5.98, 31.92,
      ]);
  });

  it("draws relief at the arrival exaggeration from the terrain source", () => {
    expect(style.terrain).toEqual({ source: "terrain", exaggeration: ARRIVAL_EXAGGERATION });
  });

  it("lights the relief from the arrival light direction, anchored to the map", () => {
    const relief = style.layers.find((l) => l.id === "relief");
    expect(relief?.type).toBe("hillshade");
    expect(
      (relief as { paint: Record<string, unknown> }).paint["hillshade-illumination-direction"],
    ).toBe(ARRIVAL_LIGHT.azimuthDeg);
  });

  it("orders the land: imagery, relief, veil, then the line and the beam on top", () => {
    const order = style.layers.map((l) => l.id);
    expect(order.indexOf("imagery")).toBeGreaterThan(order.indexOf("paper"));
    expect(order.indexOf("relief")).toBeGreaterThan(order.indexOf("imagery"));
    expect(order.indexOf("outside-veil")).toBeGreaterThan(order.indexOf("relief"));
    expect(order.indexOf("catchment-line")).toBeGreaterThan(order.indexOf("catchment-casing"));
    expect(order.at(-1)).toBe("outlet-beam");
  });

  it("draws the relief alone, with no imagery source, when the bundle has no imagery", () => {
    const bare = valleyStyle({ assets: { terrain: assets.terrain }, catchment: square });
    expect(Object.keys(bare.sources).filter((k) => k.startsWith("imagery"))).toEqual([]);
    expect(bare.layers.some((l) => l.id.startsWith("imagery"))).toBe(false);
    expect(bare.layers.some((l) => l.id === "relief")).toBe(true);
  });

  it("draws 100 m and 500 m contours over the relief and under the veil, when given", () => {
    const withContours = valleyStyle({
      assets,
      catchment: square,
      contours: {
        tiles: ["contours://{z}/{x}/{y}"],
        minzoom: 10,
        maxzoom: 13,
        bounds: [-6.68, 31.35, -5.98, 31.95],
      },
    });
    const order = withContours.layers.map((l) => l.id);
    expect(withContours.sources.contours).toMatchObject({ type: "vector", maxzoom: 13 });
    for (const id of ["contour-minor", "contour-index"]) {
      expect(order.indexOf(id)).toBeGreaterThan(order.indexOf("relief"));
      expect(order.indexOf(id)).toBeLessThan(order.indexOf("outside-veil"));
    }
    const minor = withContours.layers.find((l) => l.id === "contour-minor") as {
      paint: Record<string, unknown>;
      filter: unknown;
    };
    const index = withContours.layers.find((l) => l.id === "contour-index") as {
      paint: Record<string, unknown>;
      filter: unknown;
    };
    expect(minor.paint["line-color"]).toBe(daylight.contour);
    expect(index.paint["line-color"]).toBe(daylight.contourIndex);
    expect(minor.filter).toEqual(["==", ["get", "level"], 0]);
    expect(index.filter).toEqual(["==", ["get", "level"], 1]);
    expect(style.layers.some((l) => l.id.startsWith("contour-"))).toBe(false);
  });

  it("uses only daylight token colours", () => {
    const allowed = new Set<string>(Object.values(daylight));
    expect(colours(style).filter((c) => !allowed.has(c))).toEqual([]);
  });

  it("uses the accent once, for the outlet beam", () => {
    expect(colours(style).filter((c) => c === daylight.accent)).toHaveLength(1);
  });
});

describe("the veil outside the catchment", () => {
  it("is 0.82 everywhere unless the settle asks for it by zoom, so the hero dive keeps its look", () => {
    const plain = valleyStyle({ assets, catchment: square }).layers.find(
      (l) => l.id === "outside-veil",
    ) as { paint: Record<string, unknown> };
    expect(plain.paint["fill-color"]).toBe(daylight.outsideVeil);
    expect(plain.paint["fill-opacity"]).toBe(VEIL_OPACITY.valley);
    expect(VEIL_OPACITY.valley).toBe(0.82);
  });

  it("with the settle, is strong at the regional view and eases to 0.82 by the valley view", () => {
    const veil = valleyStyle({ assets, catchment: square, veilByZoom: true }).layers.find(
      (l) => l.id === "outside-veil",
    ) as { paint: Record<string, unknown> };
    expect(veil.paint["fill-opacity"]).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      9.4,
      VEIL_OPACITY.regional,
      10.5,
      VEIL_OPACITY.valley,
    ]);
    expect(VEIL_OPACITY.regional).toBeGreaterThan(0.9);
  });
});

describe("outsideVeil", () => {
  it("cuts the catchment out of the veil, wound the other way", () => {
    const veil = outsideVeil(square);
    expect(veil.geometry.coordinates).toHaveLength(2);
    expect(veil.geometry.coordinates[1]).toEqual(
      [...(square.geometry.coordinates[0] ?? [])].reverse(),
    );
  });
});

describe("beamFootprint", () => {
  it("is a closed square about the given side in metres", () => {
    const ring = beamFootprint(-6.5372222, 31.6377778, 70).geometry.coordinates[0] ?? [];
    const [sw, se, , , last] = ring;
    if (!sw || !se) throw new Error("footprint has no corners");
    expect(last).toEqual(sw);
    const widthM = (se[0] - sw[0]) * 111320 * Math.cos((31.6377778 * Math.PI) / 180);
    expect(widthM).toBeCloseTo(70, 6);
  });
});
