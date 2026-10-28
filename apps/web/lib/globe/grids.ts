// Loads the globe's data: the GLO-90 world grid, two regional grids resampled from terrarium tiles, the
// rangeland biomes layer and the world hillshade. Ported from the design lane's hero study A4 (globe4.js);
// every URL comes from the asset manifest, so the app holds none.

import type { GlobeData, Grid } from "./renderer";

export interface GlobeAssets {
  /** int16 elevation in metres, little-endian, w x h, north row first. */
  worldElevation: string;
  /** uint8 land share, same grid. */
  worldLand: string;
  worldSize: [number, number];
  /** Terrarium tile template with {z}, {x}, {y}, 512 px tiles. */
  terrainTiles: string;
  /** Rangeland biome share, 8-bit PNG, equirectangular. */
  biomes: string;
  /** World hillshade PNG, equirectangular. */
  hillshade: string;
  /** The world grids are gzip streams (SCIENCE's data/map). */
  gzip?: boolean;
  /** Regional patches, each where its zoom's tiles exist; the defaults cover Morocco and the High Atlas. */
  regions?: Region[];
}

export interface Region {
  id: string;
  z: number;
  box: Grid["box"];
}

/** The regional patches, stopping short of Ceuta and Melilla so they hold Copernicus GLO-30 only. */
export const REGIONS: Region[] = [
  { id: "morocco", z: 6, box: [-13, 28, -1, 35] },
  { id: "atlas", z: 8, box: [-8.5, 30.5, -4.5, 33] },
];

const rad = (d: number) => (d * Math.PI) / 180;
export const tileX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
export const tileY = (lat: number, z: number) => {
  const r = rad(lat);
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

/** Terrarium encoding: metres = R * 256 + G + B / 256 - 32768. */
export function terrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

async function pixels(
  url: string,
): Promise<{ w: number; h: number; rgba: Uint8ClampedArray } | undefined> {
  const res = await fetch(url);
  if (!res.ok) return undefined;
  const bmp = await createImageBitmap(await res.blob(), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
  if (!g) throw new Error("2D canvas unavailable");
  g.drawImage(bmp, 0, 0);
  return { w: bmp.width, h: bmp.height, rgba: g.getImageData(0, 0, bmp.width, bmp.height).data };
}

async function decodeTile(url: string): Promise<{ size: number; h: Float32Array } | undefined> {
  const p = await pixels(url).catch(() => undefined);
  if (!p) return undefined;
  const h = new Float32Array(p.w * p.h);
  for (let i = 0; i < h.length; i++)
    h[i] = terrarium(p.rgba[i * 4] ?? 0, p.rgba[i * 4 + 1] ?? 0, p.rgba[i * 4 + 2] ?? 0);
  return { size: p.w, h };
}

/** The tiles at zoom z that cover a box; a box drawn on tile edges (as data/map's are) does not reach into
 *  the next tile by a rounding error. */
export function tileRange(
  box: Grid["box"],
  z: number,
): { tx0: number; tx1: number; ty0: number; ty1: number } {
  const [W, S, E, N] = box;
  const lim = 85.05;
  const EPS = 1e-3; // a thousandth of a tile: above 4-decimal box rounding, far below any real coverage
  return {
    tx0: Math.floor(tileX(W, z) + EPS),
    tx1: Math.min(2 ** z - 1, Math.floor(tileX(E, z) - EPS)),
    ty0: Math.max(0, Math.floor(tileY(Math.min(N, lim), z) + EPS)),
    ty1: Math.min(2 ** z - 1, Math.floor(tileY(Math.max(S, -lim), z) - EPS)),
  };
}

/** Resamples the zoom-z tiles over box onto a w x h lon/lat grid, north row first (bilinear). */
async function regionGrid(
  template: string,
  z: number,
  box: Grid["box"],
  w: number,
  h: number,
): Promise<Grid> {
  const [W, S, E, N] = box;
  const lim = 85.05;
  const T = 512;
  const { tx0, tx1, ty0, ty1 } = tileRange(box, z);
  const rowW = (tx1 - tx0 + 1) * T;
  const rows = (ty1 - ty0 + 1) * T;
  const mosaic = new Float32Array(rowW * rows);
  const jobs: Promise<void>[] = [];
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const url = template
        .replace("{z}", String(z))
        .replace("{x}", String(tx))
        .replace("{y}", String(ty));
      jobs.push(
        decodeTile(url).then((t) => {
          if (!t || t.size !== T) return;
          const ox = (tx - tx0) * T;
          const oy = (ty - ty0) * T;
          for (let y = 0; y < T; y++)
            mosaic.set(t.h.subarray(y * T, (y + 1) * T), (oy + y) * rowW + ox);
        }),
      );
    }
  await Promise.all(jobs);
  const data = new Float32Array(w * h * 2);
  const xs = new Float32Array(w);
  for (let i = 0; i < w; i++)
    xs[i] = Math.max(
      0,
      Math.min(rowW - 1.001, (tileX(W + ((i + 0.5) / w) * (E - W), z) - tx0) * T - 0.5),
    );
  for (let j = 0; j < h; j++) {
    const lat = Math.max(-lim, Math.min(lim, N - ((j + 0.5) / h) * (N - S)));
    const fy = Math.max(0, Math.min(rows - 1.001, (tileY(lat, z) - ty0) * T - 0.5));
    const y0 = Math.floor(fy);
    const ay = fy - y0;
    const r0 = y0 * rowW;
    const r1 = Math.min(rows - 1, y0 + 1) * rowW;
    for (let i = 0; i < w; i++) {
      const xi = xs[i] ?? 0;
      const x0 = Math.floor(xi);
      const ax = xi - x0;
      const x1 = Math.min(rowW - 1, x0 + 1);
      const m = (k: number) => mosaic[k] ?? 0;
      const v =
        (m(r0 + x0) * (1 - ax) + m(r0 + x1) * ax) * (1 - ay) +
        (m(r1 + x0) * (1 - ax) + m(r1 + x1) * ax) * ay;
      const k = (j * w + i) * 2;
      data[k] = v;
      data[k + 1] = v > 0.5 ? 1 : 0;
    }
  }
  return { w, h, box, data };
}

/** A file's bytes, gunzipped in the browser when the manifest says the grids are gzip streams. */
async function bytes(url: string, gzip: boolean): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${String(res.status)}`);
  if (!gzip) return res.arrayBuffer();
  return new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

async function worldGrid(a: GlobeAssets): Promise<Grid> {
  const [e, l] = await Promise.all(
    [a.worldElevation, a.worldLand].map((u) => bytes(u, a.gzip === true)),
  );
  if (!e || !l) throw new Error("world grid missing");
  const elev = new Int16Array(e);
  const land = new Uint8Array(l);
  const [w, h] = a.worldSize;
  if (elev.length !== w * h || land.length !== w * h)
    throw new Error("world grid size does not match the manifest");
  const data = new Float32Array(w * h * 2);
  for (let i = 0; i < w * h; i++) {
    data[i * 2] = elev[i] ?? 0;
    data[i * 2 + 1] = (land[i] ?? 0) / 255;
  }
  return { w, h, box: [-180, -90, 180, 90], data };
}

async function layer(url: string): Promise<GlobeData["layer"]> {
  const p = await pixels(url);
  if (!p) throw new Error("biomes layer missing");
  const data = new Uint8Array(p.w * p.h);
  for (let i = 0; i < data.length; i++) data[i] = p.rgba[i * 4] ?? 0;
  return { w: p.w, h: p.h, data };
}

export async function loadGlobe(a: GlobeAssets): Promise<GlobeData> {
  const regions = (a.regions ?? REGIONS).map((r) => {
    const ppd = (2 ** r.z * 512) / 360;
    const [W, S, E, N] = r.box;
    return regionGrid(
      a.terrainTiles,
      r.z,
      r.box,
      Math.round((E - W) * ppd),
      Math.round((N - S) * ppd),
    );
  });
  const shade = fetch(a.hillshade)
    .then((r) => r.blob())
    .then((b) => createImageBitmap(b, { colorSpaceConversion: "none", premultiplyAlpha: "none" }));
  const [world, r0, r1, biomes, hs] = await Promise.all([
    worldGrid(a),
    regions[0],
    regions[1],
    layer(a.biomes),
    shade,
  ]);
  if (!r0 || !r1) throw new Error("regional grids missing");
  return { world, regions: [r0, r1], layer: biomes, shade: hs };
}
