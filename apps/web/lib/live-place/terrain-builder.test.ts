import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeRuns } from "../overview/terrain.ts";
import { encodeRgbaPng } from "./satellite-fetcher.ts";
import {
  buildTerrainForBbox,
  delineateOutline,
  TERRAIN_FILE_VERSION,
  traceChannels,
  traceRing,
} from "./terrain-builder.ts";

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
    // flat ground: a watershed means nothing, so the outline is the land within the box, the whole box here
    expect(terrain.outline?.kind).toBe("land_within_box");
    const lons = terrain.catchmentRing.map((p) => p[0]);
    const lats = terrain.catchmentRing.map((p) => p[1]);
    expect(Math.min(...lons)).toBeCloseTo(-93.62, 3);
    expect(Math.max(...lons)).toBeCloseTo(-93.38, 3);
    expect(Math.min(...lats)).toBeCloseTo(41.41, 3);
    expect(Math.max(...lats)).toBeCloseTo(41.59, 3);
    expect(terrain.streamSource).toBe("none");
    expect(terrain.streamPaths).toEqual([]);
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

const N = 64;
const dry = () => new Uint8Array(N * N);
const idx = (r: number, c: number) => r * N + c;

describe("watershed outline", () => {
  it("delineates a ringed basin draining out through one notch as a watershed, with its outlet at the notch", () => {
    // a ring ridge 20 cells round the centre, the inside falling to a pit, a channel cut through the ridge to the
    // south edge: the inside fills to the notch and drains out through it
    const elev: number[] = [];
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const d = Math.hypot(r - 32, c - 32);
        const z = 10 + 3 * (20 - Math.abs(d - 20));
        elev.push(c >= 31 && c <= 33 && r >= 44 ? 5 + (63 - r) * 0.1 : z);
      }
    const o = delineateOutline(elev, N, N, dry(), idx(32, 32));
    expect(o.kind).toBe("watershed");
    expect(o.outlet).toBeDefined();
    expect(Math.floor((o.outlet ?? 0) / N)).toBe(63);
    expect(Math.abs(((o.outlet ?? 0) % N) - 32)).toBeLessThanOrEqual(1);
    expect(o.region[idx(32, 32)]).toBe(1);
    expect(o.region[idx(32, 46)]).toBe(1); // inside the ring
    expect(o.region[idx(32, 58)]).toBe(0); // outside it, draining east
    expect(o.region[idx(2, 2)]).toBe(0);
    let cells = 0;
    for (const v of o.region) cells += v;
    // about the ring's inside, pi 20 squared, plus the channel and the slopes into it
    expect(cells).toBeGreaterThan(1000);
    expect(cells).toBeLessThan(1700);
    const channels = traceChannels(o, N, 0.01);
    expect(channels.length).toBeGreaterThanOrEqual(1);
    // the main stem ends at the outlet
    expect(channels[0]?.at(-1)).toEqual([(o.outlet ?? 0) % N, 63]);
  });

  it("calls a basin the box cuts a drainage area within the box", () => {
    const elev: number[] = [];
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) elev.push(100 - r + Math.abs(c - 32) * 2);
    const o = delineateOutline(elev, N, N, dry(), idx(32, 32));
    expect(o.kind).toBe("drainage_within_box");
    expect(o.region[idx(5, 10)]).toBe(1);
  });

  it("on a coast where the point drains straight to the sea, takes the land within the box, clipped at the water", () => {
    const water = dry();
    const elev: number[] = [];
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        if (c >= 34) water[idx(r, c)] = 1;
        elev.push(c >= 34 ? -8 : (34 - c) * 1.5);
      }
    const o = delineateOutline(elev, N, N, water, idx(32, 32));
    expect(o.kind).toBe("land_within_box");
    expect(o.region[idx(32, 5)]).toBe(1);
    expect(o.region[idx(32, 40)]).toBe(0);
  });
});

describe("outline ring", () => {
  it("traces a region's outer boundary near half way between nodes, closed and counter-clockwise", () => {
    const region = dry();
    for (let r = 10; r <= 20; r++) for (let c = 10; c <= 30; c++) region[idx(r, c)] = 1;
    // a hole inside does not change the outer ring
    region[idx(15, 20)] = 0;
    const ring = traceRing(region, N, N);
    expect(ring[0]).toEqual(ring.at(-1));
    const cols = ring.map((p) => p[0]);
    const rows = ring.map((p) => p[1]);
    // within the simplification's 0.75 cells of the half-way line round the region
    const near = (v: number, want: number) => Math.abs(v - want) <= 0.75;
    expect(near(Math.min(...cols), 9.5)).toBe(true);
    expect(near(Math.max(...cols), 30.5)).toBe(true);
    expect(near(Math.min(...rows), 9.5)).toBe(true);
    expect(near(Math.max(...rows), 20.5)).toBe(true);
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const p = ring[i] ?? [0, 0];
      const q = ring[i + 1] ?? [0, 0];
      area += p[0] * -q[1] - q[0] * -p[1];
    }
    expect(area / 2).toBeGreaterThan(0);
    // evenly spaced: no step longer than 2 cells
    for (let i = 0; i < ring.length - 1; i++) {
      const p = ring[i] ?? [0, 0];
      const q = ring[i + 1] ?? [0, 0];
      expect(Math.hypot(q[0] - p[0], q[1] - p[1])).toBeLessThanOrEqual(2 + 1e-9);
    }
  });

  it("closes a region that reaches the grid edge along the edge nodes", () => {
    const region = new Uint8Array(N * N).fill(1);
    const ring = traceRing(region, N, N);
    const cols = ring.map((p) => p[0]);
    const rows = ring.map((p) => p[1]);
    expect(Math.min(...cols)).toBe(0);
    expect(Math.max(...cols)).toBe(N - 1);
    expect(Math.min(...rows)).toBe(0);
    expect(Math.max(...rows)).toBe(N - 1);
  });
});
