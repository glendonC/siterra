import { afterEach, describe, expect, it, vi } from "vitest";
import * as elevationSources from "./elevation-sources.ts";
import { fetchRealHydrology } from "./hydrology-fetcher.ts";
import * as imagery from "./imagery.ts";
import { decodeRuns } from "./water-mask.ts";
import { buildSatelliteSourcesAndEvidence, encodeRgbaPng } from "./satellite-fetcher.ts";
import {
  buildTerrainForBbox,
  delineateOutline,
  outlineRing,
  type Outline,
  ElevationUnavailableError,
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
          : new Response("unavailable", { status: 404 }),
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

  it("fails, saying so, when no elevation source can be read: no ground stands in for it", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response("unavailable", { status: 404 })));
    await expect(buildTerrainForBbox([-93.62, 41.41, -93.38, 41.59])).rejects.toBeInstanceOf(
      ElevationUnavailableError,
    );
  });

  it("builds from Open-Meteo's grid when Terrarium cannot be read, flat ground included, and labels it", async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (!url.includes("api.open-meteo.com/v1/elevation"))
        return Promise.resolve(new Response("unavailable", { status: 404 }));
      const n = (new URL(url).searchParams.get("latitude") ?? "").split(",").length;
      return Promise.resolve(Response.json({ elevation: new Array<number>(n).fill(244) }));
    });
    const terrain = await buildTerrainForBbox([-93.62, 41.41, -93.38, 41.59]);
    expect(terrain.elevationSource).toBe("open_meteo_16");
    expect(new Set(terrain.elevations)).toEqual(new Set([244]));
  });

  it("keeps the same box's earlier WorldCover when a rebuild cannot reach it, and maps its water", async () => {
    const png = flatTile(310);
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      return Promise.resolve(
        url.includes("/terrarium/")
          ? new Response(new Uint8Array(png), { status: 200 })
          : new Response("unavailable", { status: 404 }),
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

  it("returns and stores each OpenStreetMap waterway's kind alongside its stream path", async () => {
    const png = flatTile(310);
    const way = (id: number, waterway: string, count: number, lat: number) => ({
      type: "way",
      id,
      tags: { waterway, name: `Way ${String(id)}` },
      geometry: Array.from({ length: count }, (_, i) => ({
        lon: -93.6 + i * 0.02,
        lat,
      })),
    });
    const overpassJson = {
      elements: [way(1, "canal", 4, 41.45), way(2, "stream", 6, 41.5), way(3, "river", 5, 41.55)],
    };
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes("overpass-api.de")) {
        return Promise.resolve(Response.json(overpassJson));
      }
      return Promise.resolve(
        url.includes("/terrarium/")
          ? new Response(new Uint8Array(png), { status: 200 })
          : new Response("unavailable", { status: 404 }),
      );
    });
    const bbox: [number, number, number, number] = [-93.62, 41.41, -93.38, 41.59];
    const hydro = await fetchRealHydrology(bbox);
    expect(hydro).toHaveProperty("streamKinds", ["river", "stream", "canal"]);
    const terrain = await buildTerrainForBbox(bbox);
    expect(terrain.streamSource).toBe("openstreetmap");
    expect(terrain.streamPaths).toHaveLength(3);
    expect(terrain.streamKinds).toEqual(["river", "stream", "canal"]);
  });

  it("prefers a measured 3DEP or Copernicus DEM GLO-30 grid over Terrarium, fills sea gaps, and stores snow-free Sentinel-2 trueColour", async () => {
    const bbox: [number, number, number, number] = [-74.124532, 40.622899, -73.887508, 40.802561];
    const elevationsM = new Float32Array(256 * 256);
    for (let r = 0; r < 256; r++) {
      for (let c = 0; c < 256; c++) {
        // West half is land (42.5 m), east strip (c >= 220) is a 3DEP sea gap (NaN)
        elevationsM[r * 256 + c] = c >= 220 ? Number.NaN : 42.5;
      }
    }
    vi.spyOn(elevationSources, "fetchElevation").mockResolvedValue({
      status: "measured",
      value: {
        source: "3dep-seamless",
        surface: "bare_earth",
        nominalResolutionM: 10,
        verticalDatum: "NAVD88",
        bbox,
        width: 256,
        height: 256,
        elevationsM,
        noReadingShare: 36 / 256,
        noReadingAtSeaShare: 1,
        minM: 42.5,
        maxM: 42.5,
        itemIds: ["USGS_13_n41w075_20220718"],
        attribution: "USGS 3D Elevation Program (3DEP) 1/3 arc-second (~10 m) bare-earth DEM",
        tried: [{ source: "3dep-seamless", outcome: "used" }],
      },
      provenance: {
        source: "3dep-seamless",
        items: ["USGS_13_n41w075_20220718"],
        window: { start: "2022-07-18", end: "2022-07-18" },
        method: { id: "live_elevation", version: "1.0.0" },
        retrievedAt: "2026-11-02T00:00:00Z",
        elapsedMs: 12,
      },
    });
    const tcRgba = new Uint8Array(16 * 16 * 4);
    for (let p = 0; p < tcRgba.length; p += 4) {
      tcRgba[p] = 48;
      tcRgba[p + 1] = 96;
      tcRgba[p + 2] = 52;
      tcRgba[p + 3] = 255;
    }
    const tcPng = encodeRgbaPng(16, 16, tcRgba);
    vi.spyOn(imagery, "fetchTrueColour").mockResolvedValue({
      status: "measured",
      value: {
        itemIds: ["S2B_MSIL2A_20240715T153819_R011_T18TWL"],
        datetime: "2024-07-15T15:38:19Z",
        date: "2024-07-15",
        platform: "Sentinel-2B",
        sceneCloudPct: 2.1,
        boxCloudPct: 0.4,
        boxSnowPct: 0,
        seasonMonths: [5, 6, 7, 8, 9],
        selectionRule: "growing_season_snow_free",
        bbox,
        width: 16,
        height: 16,
        rgba: tcRgba,
        png: tcPng,
        attribution: "Copernicus Sentinel-2 L2A via Microsoft Planetary Computer",
        selection: "Growing-season snow-free pass",
      },
      provenance: {
        source: "sentinel-2-l2a",
        items: ["S2B_MSIL2A_20240715T153819_R011_T18TWL"],
        window: { start: "2024-07-15", end: "2024-07-15" },
        method: { id: "live_true_colour", version: "1.0.0" },
        retrievedAt: "2026-11-02T00:00:00Z",
        elapsedMs: 18,
      },
    });
    // Network calls for Overpass / WorldCover / Terrarium fail; 3DEP elevation and Sentinel-2 imagery are used
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response("unavailable", { status: 503 })));

    const terrain = await buildTerrainForBbox(bbox);
    expect(terrain.elevationModel?.source).toBe("3dep-seamless");
    expect(terrain.elevationModel?.surface).toBe("bare_earth");
    expect(terrain.elevationModel?.nominalResolutionM).toBe(10);
    expect(terrain.elevationModel?.itemIds).toEqual(["USGS_13_n41w075_20220718"]);
    expect(terrain.elevations.every((v) => Number.isFinite(v))).toBe(true);
    expect(terrain.minElevationM).toBe(42.5);
    expect(terrain.maxElevationM).toBe(42.5);
    expect(terrain.trueColour?.itemIds).toEqual(["S2B_MSIL2A_20240715T153819_R011_T18TWL"]);
    expect(terrain.trueColour?.selectionRule).toBe("growing_season_snow_free");
    expect(terrain.trueColour?.pngBase64.length).toBeGreaterThan(20);
    expect(terrain.satelliteMeta?.sentinel2ItemId).toBe("S2B_MSIL2A_20240715T153819_R011_T18TWL");
    expect(terrain.satelliteMeta?.sentinel2CloudCover).toBe(0.4);
    expect(terrain.satelliteMeta?.sentinel2SelectionRule).toBe("growing_season_snow_free");
    expect(terrain.satelliteMeta?.elevationSourceId).toBe("3dep-seamless");

    const satRecords = buildSatelliteSourcesAndEvidence({
      caseId: "case_loc_new_york_317deb",
      slug: "new_york",
      hash6: "317deb",
      placeName: "New York",
      geoId: "geo_loc_new_york_317deb",
      now: "2026-11-02T00:00:00.000Z",
      satellite: terrain.satelliteMeta,
    });
    const demSrc = satRecords.sources.find((s) => s.id === "src_dem_new_york_317deb");
    expect(demSrc?.title).toContain("USGS 3D Elevation Program (3DEP)");
    const demEv = satRecords.evidence.find((e) => e.id === "ev_dem_new_york_317deb");
    expect(demEv?.statement).toContain("bare-earth ground model");
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

describe("an outline that cannot be drawn", () => {
  const closedAndValid = (ring: readonly [number, number][]) => {
    expect(ring.length).toBeGreaterThanOrEqual(4);
    expect(ring[0]).toEqual(ring.at(-1));
  };

  it("draws the box, saying so, for the founder's case whose box holds no land (1 N, 46.9 W, open sea)", async () => {
    const sea = flatTile(0);
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      return Promise.resolve(
        url.includes("/terrarium/")
          ? new Response(new Uint8Array(sea), { status: 200 })
          : new Response("unavailable", { status: 404 }),
      );
    });
    const bbox: [number, number, number, number] = [-46.980385, 0.925969, -46.800695, 1.105631];
    const terrain = await buildTerrainForBbox(bbox);
    expect(terrain.outline?.kind).toBe("box");
    expect(terrain.outline?.fallback).toBe("no_land");
    closedAndValid(terrain.catchmentRing);
    const lons = terrain.catchmentRing.map((p) => p[0]);
    expect(Math.min(...lons)).toBeCloseTo(bbox[0], 5);
    expect(Math.max(...lons)).toBeCloseTo(bbox[2], 5);
  });

  it("draws the box when the only land is one cell, and the land within the box when a basin is too small", () => {
    const water = new Uint8Array(N * N).fill(1);
    water[idx(32, 32)] = 0;
    const islet: Outline = {
      kind: "land_within_box",
      region: new Uint8Array(N * N),
      from: idx(32, 32),
      target: new Int32Array(N * N).fill(-1),
      acc: new Float64Array(N * N).fill(1),
    };
    islet.region[idx(32, 32)] = 1;
    const a = outlineRing(islet, water, N, N);
    expect([a.kind, a.fallback]).toEqual(["box", "outline_degenerate"]);
    closedAndValid(a.ring);

    const tiny: Outline = { ...islet, kind: "watershed", outlet: idx(32, 32) };
    const b = outlineRing(tiny, dry(), N, N);
    expect([b.kind, b.fallback]).toEqual(["land_within_box", "outline_degenerate"]);
    expect(b.cells).toBe(N * N);
    closedAndValid(b.ring);
  });
});
