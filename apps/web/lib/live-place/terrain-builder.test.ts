import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeRuns } from "../overview/terrain.ts";
import { encodeRgbaPng } from "./satellite-fetcher.ts";
import { buildTerrainForBbox, TERRAIN_FILE_VERSION } from "./terrain-builder.ts";

/** A Terrarium tile PNG at one elevation everywhere. */
function flatTile(elevationM: number): Uint8Array {
  const v = elevationM + 32768;
  const rgba = new Uint8Array(256 * 256 * 4);
  for (let p = 0; p < rgba.length; p += 4) {
    rgba[p] = Math.floor(v / 256);
    rgba[p + 1] = Math.floor(v) % 256;
    rgba[p + 2] = Math.round((v - Math.floor(v)) * 256);
    rgba[p + 3] = 255;
  }
  return encodeRgbaPng(256, 256, rgba);
}

describe("terrain builder", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("stores a flat place as measured: no invented bowl, its land range as read", async () => {
    const png = flatTile(231.5);
    // Terrarium answers; every other source (Overpass, Planetary Computer, Open-Meteo) is unreachable
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      return Promise.resolve(
        url.includes("/terrarium/")
          ? new Response(new Uint8Array(png), { status: 200 })
          : new Response("unavailable", { status: 503 }),
      );
    });
    const terrain = await buildTerrainForBbox([-93.62, 41.41, -93.38, 41.59]);
    expect(terrain.version).toBe(TERRAIN_FILE_VERSION);
    expect(terrain.elevationSource).toBe("terrarium_z12");
    expect(new Set(terrain.elevations)).toEqual(new Set([231.5]));
    expect(terrain.minElevationM).toBe(231.5);
    expect(terrain.maxElevationM).toBe(231.5);
    // dry land above sea level with no WorldCover reading: no water
    expect(terrain.waterMask?.source).toBe("terrarium");
    const mask = decodeRuns(terrain.waterMask?.runs ?? [], 256 * 256);
    expect(mask?.some((v) => v === 1)).toBe(false);
    expect(terrain.landCells).toBe(256 * 256);
  });

  it("keeps the same box's earlier WorldCover when a rebuild cannot reach it, and maps its water", async () => {
    const png = flatTile(310);
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      return Promise.resolve(
        url.includes("/terrarium/")
          ? new Response(new Uint8Array(png), { status: 200 })
          : new Response("unavailable", { status: 503 }),
      );
    });
    const n = 64 * 64;
    const water = Array.from({ length: n }, (_, q) => (q % 64 < 16 ? 255 : 0));
    const grass = water.map((v) => (v ? 0 : 255));
    const terrain = await buildTerrainForBbox([168.53, -45.12, 168.79, -44.94], undefined, {
      landCoverGrid: {
        width: 64,
        height: 64,
        tree: new Array<number>(n).fill(0),
        crop: new Array<number>(n).fill(0),
        grass,
        water,
      },
      satelliteMeta: { worldCoverYear: 2021, waterPct: 25 },
    });
    expect(terrain.landCoverGrid?.width).toBe(64);
    expect(terrain.satelliteMeta?.worldCoverYear).toBe(2021);
    expect(terrain.waterMask?.source).toBe("worldcover_terrarium");
    const mask = decodeRuns(terrain.waterMask?.runs ?? [], 256 * 256);
    expect(mask?.[128 * 256 + 10]).toBe(1);
    expect(mask?.[128 * 256 + 200]).toBe(0);
  });
});
