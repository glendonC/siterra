import { describe, expect, it } from "vitest";
import bundle from "../../../../data/map/manifest.json";
import { tileRange } from "../globe/grids";
import corners from "../../../../data/map/imagery/truecolour-summer-2025-3857.webp.json";
import { loadMapBundle, MAP_BUNDLE_URL, parseMapBundle } from "./bundle";

const BASE = "http://127.0.0.1:4370/api/map-assets/abc123/manifest.json";
const listed = new Set(Object.values(bundle.layers).flatMap((l) => l.files.map((f) => f.path)));

describe("parseMapBundle (data/map/manifest.json)", () => {
  const m = parseMapBundle(bundle, BASE);

  it("reads every asset from the versioned map-assets URL on the app's own origin", () => {
    expect(MAP_BUNDLE_URL).toBe("/api/map-assets");
    const urls = [
      ...m.valley.terrain.tiles,
      m.globe.worldElevation,
      m.globe.worldLand,
      m.globe.terrainTiles,
      m.globe.biomes,
      m.globe.hillshade,
    ];
    for (const u of urls)
      expect(u.startsWith("http://127.0.0.1:4370/api/map-assets/abc123/")).toBe(true);
    expect(m.valley.terrain.tiles[0]).toBe(
      "http://127.0.0.1:4370/api/map-assets/abc123/terrain/{z}/{x}/{y}.webp",
    );
  });

  it("names only files the bundle lists", () => {
    const rel = (u: string) => u.replace("http://127.0.0.1:4370/api/map-assets/abc123/", "");
    for (const u of [m.globe.worldElevation, m.globe.worldLand, m.globe.biomes, m.globe.hillshade])
      expect(listed.has(rel(u))).toBe(true);
    expect(m.globe.worldSize).toEqual([4500, 2250]);
    expect(m.globe.gzip).toBe(true);
  });

  it("keeps the valley terrain and the globe patches to tiles the bundle has", () => {
    // z12 covers only the asset extent; the z11 ring round it is the whole terrain
    expect(m.valley.terrain.maxzoom).toBe(11);
    const [rw, rs, re, rn] = m.valley.terrain.bounds ?? [0, 0, 0, 0];
    expect(rw).toBeCloseTo(-7.0312, 3);
    expect(re).toBeCloseTo(-5.8008, 3);
    expect(rs).toBeCloseTo(31.0529, 3);
    expect(rn).toBeCloseTo(32.1012, 3);
    expect(m.valley.terrain.tileSize).toBe(512);
    const [w, s, e, n] = m.valley.terrain.bounds ?? [0, 0, 0, 0];
    expect(w).toBeLessThanOrEqual(-6.71);
    expect(e).toBeGreaterThanOrEqual(-5.98);
    expect(s).toBeLessThanOrEqual(31.33);
    expect(n).toBeGreaterThanOrEqual(31.92);
    expect(m.globe.regions?.map((r) => r.z)).toEqual([6, 8]);
    for (const r of m.globe.regions ?? []) {
      const t = tileRange(r.box, r.z);
      for (let x = t.tx0; x <= t.tx1; x++)
        for (let y = t.ty0; y <= t.ty1; y++)
          expect(listed.has(`terrain/${String(r.z)}/${String(x)}/${String(y)}.webp`)).toBe(true);
    }
  });

  it("makes contours only where every terrain tile they read has its 8 neighbours", () => {
    expect(m.contours?.minzoom).toBe(10);
    const box = m.contours?.bounds ?? [0, 0, 0, 0];
    // the catchment (about -6.66 to -6.18 E, 31.55 to 31.78 N) lies inside
    expect(box[0]).toBeLessThan(-6.66);
    expect(box[2]).toBeGreaterThan(-6.18);
    expect(box[1]).toBeLessThan(31.55);
    expect(box[3]).toBeGreaterThan(31.78);
    for (const z of [10, 11]) {
      const r = tileRange(box, z);
      for (let x = r.tx0 - 1; x <= r.tx1 + 1; x++)
        for (let y = r.ty0 - 1; y <= r.ty1 + 1; y++)
          expect(listed.has(`terrain/${String(z)}/${String(x)}/${String(y)}.webp`)).toBe(true);
    }
  });

  it("drapes the summer imagery at its listed corners, and only when its corners file was read", () => {
    expect(m.valley.imagery).toBeUndefined();
    const withCorners = parseMapBundle(bundle, BASE, corners.coordinates);
    expect(withCorners.valley.imagery?.image).toEqual({
      kind: "image",
      url: "http://127.0.0.1:4370/api/map-assets/abc123/imagery/truecolour-summer-2025-3857.webp",
      coordinates: [
        [-6.71, 31.92],
        [-5.98, 31.92],
        [-5.98, 31.33],
        [-6.71, 31.33],
      ],
    });
    expect(withCorners.valley.imagery?.attribution).toBe(
      "Contains modified Copernicus Sentinel data 2025",
    );
  });

  it("finds the imagery's corners file from the listing", async () => {
    const calls: string[] = [];
    const loaded = await loadMapBundle((u) => {
      calls.push(u);
      const body = u === MAP_BUNDLE_URL ? bundle : corners;
      const r = new Response(JSON.stringify(body));
      Object.defineProperty(r, "url", { value: u === MAP_BUNDLE_URL ? BASE : u });
      return Promise.resolve(r);
    });
    expect(calls).toEqual([
      "/api/map-assets",
      "http://127.0.0.1:4370/api/map-assets/abc123/imagery/truecolour-summer-2025-3857.webp.json",
    ]);
    expect(loaded.valley.imagery).toBeDefined();
  });

  it("refuses something that is not a siterra-map bundle", () => {
    expect(() => parseMapBundle({ bundle: "other" }, BASE)).toThrow();
  });
});
