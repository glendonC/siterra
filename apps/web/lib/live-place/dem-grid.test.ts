import { afterEach, describe, expect, it, vi } from "vitest";
import {
  despikeMosaic,
  fetchTerrariumGrid,
  latToTileY,
  lonToTileX,
  sampleTerrariumBilinear,
  type TerrariumTileAt,
} from "./dem-grid.ts";
import { encodeRgbaPng } from "./satellite-fetcher.ts";

/** A Terrarium tile PNG whose elevation at global pixel column gx is ramp(gx). */
function rampTile(tx: number, ramp: (gx: number) => number): Uint8Array {
  const rgba = new Uint8Array(256 * 256 * 4);
  for (let j = 0; j < 256; j++) {
    for (let i = 0; i < 256; i++) {
      const v = ramp(tx * 256 + i) + 32768;
      const p = (j * 256 + i) * 4;
      rgba[p] = Math.floor(v / 256);
      rgba[p + 1] = Math.floor(v) % 256;
      rgba[p + 2] = Math.round((v - Math.floor(v)) * 256);
      rgba[p + 3] = 255;
    }
  }
  return encodeRgbaPng(256, 256, rgba);
}

/** Serves ramp tiles for any Terrarium URL and records the URLs asked for. */
function mockTerrarium(ramp: (gx: number) => number): string[] {
  const urls: string[] = [];
  const cache = new Map<number, Uint8Array>();
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : input.toString();
    urls.push(url);
    const m = /terrarium\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url);
    if (!m) return Promise.resolve(new Response("not found", { status: 404 }));
    const tx = Number(m[2]);
    let png = cache.get(tx);
    if (!png) {
      png = rampTile(tx, ramp);
      cache.set(tx, png);
    }
    return Promise.resolve(new Response(new Uint8Array(png), { status: 200 }));
  });
  return urls;
}

describe("Terrarium DEM sampling", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("blends across a tile edge instead of taking one tile's nearest pixel", () => {
    const west = new Float32Array(256 * 256).fill(100);
    const east = new Float32Array(256 * 256).fill(200);
    const tileAt: TerrariumTileAt = (tx, ty) =>
      ty === 0 ? (tx === 0 ? west : tx === 1 ? east : undefined) : undefined;
    // the shared edge of tiles 0 and 1 sits half a pixel from both edge pixels' centres
    expect(sampleTerrariumBilinear(tileAt, 2, 1, 0.5)).toBeCloseTo(150, 6);
    // a quarter pixel west of the edge: three quarters west tile
    expect(sampleTerrariumBilinear(tileAt, 2, 1 - 0.25 / 256, 0.5)).toBeCloseTo(125, 6);
    // well inside a tile it is that tile's value
    expect(sampleTerrariumBilinear(tileAt, 2, 0.5, 0.5)).toBeCloseTo(100, 6);
    // a missing neighbour tile is a missing value, not a zero
    expect(sampleTerrariumBilinear(tileAt, 2, 1, 1)).toBeNull();
  });

  it("reads zoom 12 tiles and returns 256 x 256 bilinear elevations that follow the ground between pixels", async () => {
    const bbox: [number, number, number, number] = [-7.0, 31.5, -6.79, 31.68];
    const n = 2 ** 12;
    const westPx = (Math.floor(lonToTileX(bbox[0], n)) - 1) * 256;
    const ramp = (gx: number) => 1000 + (gx - westPx) * 0.5;
    const urls = mockTerrarium(ramp);
    const grid = await fetchTerrariumGrid(bbox);
    if (!grid) throw new Error("no grid");
    expect(grid.zoom).toBe(12);
    expect(grid.elevations).toHaveLength(256 * 256);
    expect(urls.every((u) => u.includes("/terrarium/12/"))).toBe(true);
    for (const c of [0, 1, 77, 128, 200, 255]) {
      const lon = bbox[0] + (c / 255) * (bbox[2] - bbox[0]);
      const want = ramp(lonToTileX(lon, n) * 256 - 0.5);
      // the ramp is linear across every pixel and tile edge in the box, so bilinear reads it to the 0.1 m rounding
      expect(Math.abs((grid.elevations[128 * 256 + c] ?? 0) - want)).toBeLessThanOrEqual(0.06);
    }
  });

  it("falls back to zoom 11 when a high-latitude box needs too many zoom 12 tiles", async () => {
    const urls = mockTerrarium(() => 250);
    // a 20 km box at 80 degrees north: about 13 tiles a side at zoom 12, 7 at zoom 11
    const lat = 80;
    const dLat = 10 / 111.32;
    const dLon = 10 / (111.32 * Math.cos((lat * Math.PI) / 180));
    const grid = await fetchTerrariumGrid([20 - dLon, lat - dLat, 20 + dLon, lat + dLat]);
    if (!grid) throw new Error("no grid");
    expect(grid.zoom).toBe(11);
    expect(urls.length).toBeGreaterThan(16);
    expect(urls.every((u) => u.includes("/terrarium/11/"))).toBe(true);
    // a flat place is real data: it is returned as measured, not refused
    expect(new Set(grid.elevations)).toEqual(new Set([250]));
  });

  it("returns null when a tile cannot be read", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response("nope", { status: 503 })));
    expect(await fetchTerrariumGrid([-7.0, 31.5, -6.79, 31.68])).toBeNull();
  });

  it("replaces Terrarium defect pixels and scanlines but keeps a real cliff", () => {
    const W = 64;
    const H = 64;
    const m = new Float32Array(W * H);
    // gentle ground with a real 190 m cliff down to the east at column 40
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) m[j * W + i] = (i < 40 ? 400 : 210) + j * 0.5;
    const truth = m.slice();
    // a defect scanline two rows deep across the west half, as in New York's zoom 12 tiles, and a single pit
    for (let i = 0; i < 30; i++) {
      m[20 * W + i] = -1664;
      m[21 * W + i] = -1663.5;
    }
    m[50 * W + 10] = -823.6;
    expect(despikeMosaic(m, W, H)).toBe(61);
    for (let k = 0; k < W * H; k++)
      expect(Math.abs((m[k] ?? 0) - (truth[k] ?? 0))).toBeLessThanOrEqual(1.5);
  });

  it("projects tile rows the Web Mercator way", () => {
    expect(latToTileY(0, 4096)).toBeCloseTo(2048, 6);
    expect(lonToTileX(0, 4096)).toBeCloseTo(2048, 6);
  });
});
