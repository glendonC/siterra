import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bandMask, coverMask, fillRelief, rasterHeader, terrainMeta } from "./terrain";

// The land is read from the bundles' display assets: their headers give the CRS, the zone and the grids.

const B = new URL("../../../../data/bundles/", import.meta.url);
const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, B), "utf8"));

describe("rasterHeader", () => {
  it("reads the relief header's zone and grid", () => {
    const h = rasterHeader(read("bundle_relief_ait_bouguemez/elevation-surface.bin.json"));
    expect(h.zone).toBe(29);
    expect(h.grid).toEqual({ E0: 733170, N0: 3516830, res: 30, width: 1258, height: 990 });
    expect(h.nodata).toBe(-9999);
  });

  it("reads another place's zone from its CRS, and refuses a CRS it cannot draw", () => {
    const h = {
      crs: "EPSG:32610",
      transform: [30, 0, 500000, 0, -30, 4200000],
      shape: [10, 20],
    };
    expect(rasterHeader(h).zone).toBe(10);
    expect(() => rasterHeader({ ...h, crs: "EPSG:32710" })).toThrow(/UTM north/);
    expect(() => rasterHeader({ ...h, crs: "EPSG:4326" })).toThrow(/UTM north/);
    expect(() => rasterHeader({ ...h, transform: [30, 0, 0, 0, 30, 0] })).toThrow(/north-up/);
  });

  it("puts the model frame's origin at the analysis grid's centre", () => {
    const relief = rasterHeader(
      read("bundle_relief_ait_bouguemez/elevation-surface.bin.json"),
    ).grid;
    const cover = rasterHeader(read("bundle_land_cover_ait_bouguemez/land-cover.png.json")).grid;
    // the valley fixtures' frame (terrain-meta.json) stood at 752030, 3501980: the same centre
    expect(terrainMeta(relief, cover).frame).toEqual({ origin_E: 752030, origin_N: 3501980 });
  });
});

describe("fillRelief", () => {
  it("fills nodata from held neighbours ring by ring and states the held range", () => {
    const N = -9999;
    const v = new Float32Array([N, N, N, N, N, 10, 20, N, N, 30, 40, N, N, N, N, N]);
    const { heights, range } = fillRelief(v, 4, 4, N);
    expect(range).toEqual({ min: 10, max: 40, median: 30 });
    expect([...heights].every((h) => h >= 10 && h <= 40)).toBe(true);
    expect(heights[5]).toBe(10);
    expect(heights[1]).toBe(10);
    // the corner fills on the second ring, from the first ring's cells
    expect(heights[0]).toBe(10);
    expect(heights[15]).toBe(40);
  });

  it("gives the bundle's relief no nodata value and keeps its held heights", () => {
    const bytes = readFileSync(new URL("bundle_relief_ait_bouguemez/elevation-surface.bin", B));
    const v = new Float32Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const { heights, range } = fillRelief(v, 1258, 990, -9999);
    expect(heights.some((h) => h === -9999)).toBe(false);
    expect(range.min).toBeCloseTo(1463.82, 1);
    expect(range.max).toBeCloseTo(4001.64, 1);
    for (let k = 0; k < v.length; k += 997) if (v[k] !== -9999) expect(heights[k]).toBe(v[k]);
  });
});

describe("the land cover and band masks", () => {
  const palette = new Map<number, readonly [number, number, number]>([
    [10, [0, 100, 0]],
    [30, [255, 255, 76]],
    [40, [240, 150, 255]],
    [50, [250, 0, 0]],
  ]);
  const px = (...cs: [number, number, number, number][]) => new Uint8ClampedArray(cs.flat());

  it("marks tree cover in red, cropland or built-up in green, and every held class in blue", () => {
    const out = coverMask(
      px(
        [0, 100, 0, 255],
        [240, 150, 255, 255],
        [250, 0, 0, 255],
        [255, 255, 76, 255],
        [0, 0, 0, 0],
      ),
      palette,
    );
    expect([...out]).toEqual([
      ...[255, 0, 255, 255],
      ...[0, 255, 255, 255],
      ...[0, 255, 255, 255],
      ...[0, 0, 255, 255],
      ...[0, 0, 0, 255],
    ]);
  });

  it("puts each elevation band in its own channel", () => {
    const bands = new Map<number, readonly [number, number, number]>([
      [1, [31, 119, 180]],
      [2, [255, 127, 14]],
      [3, [44, 160, 44]],
    ]);
    const out = bandMask(
      px([31, 119, 180, 255], [255, 127, 14, 255], [44, 160, 44, 255], [9, 9, 9, 255]),
      bands,
    );
    expect([...out]).toEqual([
      ...[255, 0, 0, 255],
      ...[0, 255, 0, 255],
      ...[0, 0, 255, 255],
      ...[0, 0, 0, 255],
    ]);
  });
});
