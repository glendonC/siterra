import { inflateSync } from "node:zlib";

function seededNoise(seed: number): () => number {
  let s = Math.floor(seed) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function decodeTerrariumPng(bytes: Uint8Array): Float32Array | null {
  if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let colorType = 2;
  const idatParts: Uint8Array[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const len = view.getUint32(offset, false);
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    const dataStart = offset + 8;
    if (dataStart + len > bytes.length) break;
    if (type === "IHDR" && len >= 10) {
      width = view.getUint32(dataStart, false);
      height = view.getUint32(dataStart + 4, false);
      colorType = bytes[dataStart + 9] ?? 2;
    } else if (type === "IDAT") {
      idatParts.push(bytes.subarray(dataStart, dataStart + len));
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + len + 4;
  }
  if (width !== 256 || height !== 256 || idatParts.length === 0) return null;
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (bpp === 0) return null;
  const totalIdat = idatParts.reduce((s, p) => s + p.length, 0);
  const compressed = new Uint8Array(totalIdat);
  let pos = 0;
  for (const p of idatParts) {
    compressed.set(p, pos);
    pos += p.length;
  }
  const raw = inflateSync(compressed);
  const stride = width * bpp;
  if (raw.length < height * (1 + stride)) return null;
  const recon = new Uint8Array(height * stride);
  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let r = 0; r < height; r++) {
    const filter = raw[r * (1 + stride)] ?? 0;
    const srcOff = r * (1 + stride) + 1;
    const dstOff = r * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[srcOff + i] ?? 0;
      const a = i >= bpp ? (recon[dstOff + i - bpp] ?? 0) : 0;
      const b = r > 0 ? (recon[dstOff - stride + i] ?? 0) : 0;
      const c = r > 0 && i >= bpp ? (recon[dstOff - stride + i - bpp] ?? 0) : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 255;
      else if (filter === 2) val = (x + b) & 255;
      else if (filter === 3) val = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) val = (x + paeth(a, b, c)) & 255;
      recon[dstOff + i] = val;
    }
  }
  const out = new Float32Array(256 * 256);
  for (let i = 0; i < 256 * 256; i++) {
    const R = recon[i * bpp] ?? 0;
    const G = recon[i * bpp + 1] ?? 0;
    const B = recon[i * bpp + 2] ?? 0;
    out[i] = R * 256 + G + B / 256 - 32768;
  }
  return out;
}

/** One Terrarium tile's decoded elevations (256 x 256, row 0 north), or undefined where it was not fetched. */
export type TerrariumTileAt = (tx: number, ty: number) => Float32Array | undefined;

const TILE_PX = 256;

/** Fractional Web Mercator tile coordinates of a longitude and a latitude at a zoom with n = 2^zoom tiles a side. */
export function lonToTileX(lon: number, n: number): number {
  return ((lon + 180) / 360) * n;
}
export function latToTileY(lat: number, n: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
}

/**
 * Bilinear elevation at fractional tile coordinates (fx, fy) of a Terrarium mosaic with n tiles a side. Pixel
 * centres sit half a pixel in from each tile edge, so a point near an edge blends with the neighbouring tile's
 * pixels rather than repeating its own. Null when a needed tile is missing.
 */
export function sampleTerrariumBilinear(
  tileAt: TerrariumTileAt,
  n: number,
  fx: number,
  fy: number,
): number | null {
  const maxPx = n * TILE_PX - 1;
  const gx = fx * TILE_PX - 0.5;
  const gy = fy * TILE_PX - 0.5;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const tx = gx - ix;
  const ty = gy - iy;
  const px = (i: number, j: number): number | null => {
    const ci = Math.max(0, Math.min(maxPx, i));
    const cj = Math.max(0, Math.min(maxPx, j));
    const tile = tileAt(Math.floor(ci / TILE_PX), Math.floor(cj / TILE_PX));
    if (!tile) return null;
    return tile[(cj % TILE_PX) * TILE_PX + (ci % TILE_PX)] ?? null;
  };
  const a = px(ix, iy);
  const b = px(ix + 1, iy);
  const c = px(ix, iy + 1);
  const d = px(ix + 1, iy + 1);
  if (a === null || b === null || c === null || d === null) return null;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** The Terrarium tiles a bbox needs at a zoom, including the neighbours its edge samples blend with. */
export function terrariumTileRange(
  bbox: readonly [number, number, number, number],
  zoom: number,
): { x0: number; x1: number; y0: number; y1: number } {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const n = 2 ** zoom;
  const maxPx = n * TILE_PX - 1;
  const pxIndex = (f: number, plus: number) =>
    Math.max(0, Math.min(maxPx, Math.floor(f * TILE_PX - 0.5) + plus));
  return {
    x0: Math.floor(pxIndex(lonToTileX(minLon, n), 0) / TILE_PX),
    x1: Math.floor(pxIndex(lonToTileX(maxLon, n), 1) / TILE_PX),
    y0: Math.floor(pxIndex(latToTileY(maxLat, n), 0) / TILE_PX),
    y1: Math.floor(pxIndex(latToTileY(minLat, n), 1) / TILE_PX),
  };
}

/** Terrarium zooms tried in order: about 38 m pixels at the equator at 12, 76 m at 11. */
export const TERRARIUM_ZOOMS: readonly number[] = [12, 11];
/** Most tiles a side and in all for one bbox, so a 20 km box fits at zoom 12 to about 75 degrees of latitude. */
const MAX_TILES_A_SIDE = 12;
const MAX_TILES = 100;
const TILE_FETCHES_AT_ONCE = 12;
const TERRARIUM_TIMEOUT_MS: Record<number, number> = { 12: 15_000, 11: 10_000 };

/**
 * Terrarium has defects: single pixels and whole scanlines hundreds to more than a thousand metres off (New York's
 * zoom 12 tiles hold rows at -1664 m among values near 0). Real ground at zoom 12 stays within 200 m of the median
 * of its 5 x 5 window (checked on the Matterhorn, the Grand Canyon, Queenstown, the Anti-Atlas and Ait Bouguemez:
 * no pixel over 200 m, one over 150 m), so a pixel further than this from that median is a defect.
 */
export const SPIKE_THRESHOLD_M = 200;
/**
 * Smaller defects stand alone: a pixel more than this below all eight of its neighbours, or above all eight. Real
 * ground has none at zoom 12 (none over 20 m on the Matterhorn, the Grand Canyon, Yucatan's cenotes, Amsterdam,
 * Queenstown, Iowa, the Anti-Atlas or Ait Bouguemez; New York has 24 pits and 8 peaks).
 */
export const LONE_THRESHOLD_M = 20;

/**
 * Replaces Terrarium defects in a W x H mosaic, judged on the values as read in each of two passes: first each
 * pixel more than SPIKE_THRESHOLD_M from the median of the other pixels in its 5 x 5 window (clipped at the mosaic
 * edge) takes that median (a defect band up to two rows or columns wide is caught; a wider one is not); then each
 * pixel more than LONE_THRESHOLD_M below or above all eight neighbours takes their median. Returns how many it
 * replaced.
 */
export function despikeMosaic(
  m: Float32Array,
  W: number,
  H: number,
  thresholdM = SPIKE_THRESHOLD_M,
  loneM = LONE_THRESHOLD_M,
): number {
  const fixes: Array<[number, number]> = [];
  const nb: number[] = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      nb.length = 0;
      for (let dj = -2; dj <= 2; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= H) continue;
        for (let di = -2; di <= 2; di++) {
          const ii = i + di;
          if ((di === 0 && dj === 0) || ii < 0 || ii >= W) continue;
          nb.push(m[jj * W + ii] ?? 0);
        }
      }
      if (nb.length === 0) continue;
      nb.sort((a, b) => a - b);
      const h = nb.length >> 1;
      const med = nb.length % 2 === 1 ? (nb[h] ?? 0) : ((nb[h - 1] ?? 0) + (nb[h] ?? 0)) / 2;
      if (Math.abs((m[j * W + i] ?? 0) - med) > thresholdM) fixes.push([j * W + i, med]);
    }
  }
  for (const [k, v] of fixes) m[k] = v;

  const lone: Array<[number, number]> = [];
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      nb.length = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di !== 0 || dj !== 0) nb.push(m[(j + dj) * W + i + di] ?? 0);
        }
      }
      nb.sort((a, b) => a - b);
      const v = m[j * W + i] ?? 0;
      if (v < (nb[0] ?? v) - loneM || v > (nb[7] ?? v) + loneM) {
        lone.push([j * W + i, ((nb[3] ?? 0) + (nb[4] ?? 0)) / 2]);
      }
    }
  }
  for (const [k, v] of lone) m[k] = v;
  return fixes.length + lone.length;
}

export interface TerrariumGrid {
  /** targetSize x targetSize elevations (m, 0.1 m), row 0 north, grid nodes on the bbox edges. */
  elevations: number[];
  zoom: number;
  tiles: number;
  /** Tile pixels replaced as defects by despikeMosaic before sampling. */
  despikedPixels: number;
}

async function fetchTerrariumAtZoom(
  bbox: readonly [number, number, number, number],
  targetSize: number,
  zoom: number,
): Promise<TerrariumGrid | null> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const n = 2 ** zoom;
  const { x0, x1, y0, y1 } = terrariumTileRange(bbox, zoom);
  const across = x1 - x0 + 1;
  const down = y1 - y0 + 1;
  if (across > MAX_TILES_A_SIDE || down > MAX_TILES_A_SIDE || across * down > MAX_TILES)
    return null;

  const ac = new AbortController();
  const timer = setTimeout(() => {
    ac.abort();
  }, TERRARIUM_TIMEOUT_MS[zoom] ?? 10_000);
  try {
    const tiles = new Map<string, Float32Array>();
    const coords: Array<[number, number]> = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) coords.push([tx, ty]);
    }
    let next = 0;
    const worker = async () => {
      while (next < coords.length) {
        const coord = coords[next++];
        if (!coord) break;
        const [tx, ty] = coord;
        const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${String(zoom)}/${String(tx)}/${String(ty)}.png`;
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
        const decoded = decodeTerrariumPng(new Uint8Array(await res.arrayBuffer()));
        if (!decoded) throw new Error("PNG decode failed");
        tiles.set(`${String(tx)},${String(ty)}`, decoded);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(TILE_FETCHES_AT_ONCE, coords.length) }, () => worker()),
    );

    // the defects are removed on the tile pixels themselves, across tile edges, before any sample reads them
    const W = across * TILE_PX;
    const H = down * TILE_PX;
    const mosaic = new Float32Array(W * H);
    for (const [tx, ty] of coords) {
      const t = tiles.get(`${String(tx)},${String(ty)}`);
      if (!t) continue;
      for (let j = 0; j < TILE_PX; j++) {
        mosaic.set(
          t.subarray(j * TILE_PX, (j + 1) * TILE_PX),
          ((ty - y0) * TILE_PX + j) * W + (tx - x0) * TILE_PX,
        );
      }
    }
    const despikedPixels = despikeMosaic(mosaic, W, H);
    for (const [tx, ty] of coords) {
      const t = tiles.get(`${String(tx)},${String(ty)}`);
      if (!t) continue;
      for (let j = 0; j < TILE_PX; j++) {
        const o = ((ty - y0) * TILE_PX + j) * W + (tx - x0) * TILE_PX;
        t.set(mosaic.subarray(o, o + TILE_PX), j * TILE_PX);
      }
    }
    const tileAt: TerrariumTileAt = (tx, ty) => tiles.get(`${String(tx)},${String(ty)}`);

    const out = new Array<number>(targetSize * targetSize);
    for (let r = 0; r < targetSize; r++) {
      const lat = maxLat - (r / (targetSize - 1)) * (maxLat - minLat);
      const fy = latToTileY(lat, n);
      for (let c = 0; c < targetSize; c++) {
        const lon = minLon + (c / (targetSize - 1)) * (maxLon - minLon);
        const h = sampleTerrariumBilinear(tileAt, n, lonToTileX(lon, n), fy);
        if (h === null || !Number.isFinite(h)) return null;
        out[r * targetSize + c] = Number(h.toFixed(1));
      }
    }
    return { elevations: out, zoom, tiles: coords.length, despikedPixels };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Real elevations for bbox from the AWS Open Data Terrarium tiles (SRTM, GMTED, ETOPO1 and others blended by
 * Mapzen; bathymetry below 0 m), sampled bilinearly to targetSize x targetSize at zoom 12, or zoom 11 when 12 is
 * too many tiles or fails. Null when neither zoom can be read.
 */
export async function fetchTerrariumGrid(
  bbox: [number, number, number, number],
  targetSize = 256,
): Promise<TerrariumGrid | null> {
  for (const zoom of TERRARIUM_ZOOMS) {
    const grid = await fetchTerrariumAtZoom(bbox, targetSize, zoom);
    if (grid) return grid;
  }
  return null;
}

export async function fetchOpenMeteoGrid(
  bbox: [number, number, number, number],
  gridSize = 16,
): Promise<number[] | null> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lats: number[] = [];
  const lons: number[] = [];
  for (let r = 0; r < gridSize; r++) {
    const ty = r / (gridSize - 1);
    const lat = maxLat - ty * (maxLat - minLat);
    for (let c = 0; c < gridSize; c++) {
      const tx = c / (gridSize - 1);
      const lon = minLon + tx * (maxLon - minLon);
      lats.push(Number(lat.toFixed(5)));
      lons.push(Number(lon.toFixed(5)));
    }
  }

  const chunkSize = 90;
  const chunks: Array<{ lats: number[]; lons: number[] }> = [];
  for (let i = 0; i < lats.length; i += chunkSize) {
    chunks.push({
      lats: lats.slice(i, i + chunkSize),
      lons: lons.slice(i, i + chunkSize),
    });
  }

  const ac = new AbortController();
  const timer = setTimeout(() => {
    ac.abort();
  }, 4500);
  try {
    const responses = await Promise.all(
      chunks.map(async (chunk) => {
        const url = `https://api.open-meteo.com/v1/elevation?latitude=${chunk.lats.join(
          ",",
        )}&longitude=${chunk.lons.join(",")}`;
        const res = await fetch(url, {
          signal: ac.signal,
          headers: { Accept: "application/json", "User-Agent": "Siterra/1.0" },
        });
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
        const body = (await res.json()) as { elevation?: number[] };
        if (!Array.isArray(body.elevation) || body.elevation.length !== chunk.lats.length) {
          throw new Error("Invalid elevation array");
        }
        return body.elevation;
      }),
    );
    const flat = responses.flat().map((v) => (Number.isFinite(v) ? v : 0));
    const min = Math.min(...flat);
    const max = Math.max(...flat);
    if (max - min < 1) return null;
    return flat;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function synthesizeCoarseGrid(lon: number, lat: number, gridSize = 24): number[] {
  const seed =
    Math.abs(Math.round(lon * 10000) * 73856093) ^ Math.abs(Math.round(lat * 10000) * 19349663);
  const rand = seededNoise(seed);
  const axisAngle = rand() * Math.PI;
  const cosA = Math.cos(axisAngle);
  const sinA = Math.sin(axisAngle);
  const baseElev = 650 + Math.round(Math.abs(Math.sin((lat * Math.PI) / 180)) * 950 + rand() * 550);
  const reliefAmp = 780 + rand() * 680;
  const p1 = rand() * Math.PI * 2;
  const p2 = rand() * Math.PI * 2;
  const p3 = rand() * Math.PI * 2;

  const out: number[] = [];
  for (let r = 0; r < gridSize; r++) {
    const ny = (r / (gridSize - 1)) * 2 - 1;
    for (let c = 0; c < gridSize; c++) {
      const nx = (c / (gridSize - 1)) * 2 - 1;
      const u = nx * cosA + ny * sinA;
      const v = -nx * sinA + ny * cosA;
      const meander = 0.14 * Math.sin(u * 2.4 + p1) + 0.06 * Math.cos(u * 4.8 + p2);
      const dv = Math.abs(v - meander);
      const valleyCross = Math.pow(dv, 1.25) * 0.78;
      const valleyLong = (u + 1) * 0.22;
      const ridge1 =
        1 - Math.abs(Math.sin(u * 4.6 + v * 2.2 + p1) * Math.cos(v * 4.2 - u * 1.8 + p2));
      const ridge2 =
        1 - Math.abs(Math.sin(u * 9.2 - v * 6.4 + p2) * Math.cos(v * 8.5 + u * 5.1 + p3));
      const sideCanyons = Math.pow(ridge1, 1.6) * 0.34 + Math.pow(ridge2, 1.8) * 0.16;
      const h =
        baseElev +
        reliefAmp *
          Math.max(
            0,
            valleyCross + valleyLong + sideCanyons * (0.35 + 0.65 * Math.min(1, dv * 1.4)),
          );
      out.push(Number(h.toFixed(1)));
    }
  }
  return out;
}

export function interpolateGrid(
  coarse: readonly number[],
  coarseSize: number,
  targetSize: number,
): number[] {
  const out = new Array<number>(targetSize * targetSize);
  const at = (r: number, c: number): number => {
    const rr = Math.max(0, Math.min(coarseSize - 1, r));
    const cc = Math.max(0, Math.min(coarseSize - 1, c));
    return coarse[rr * coarseSize + cc] ?? 0;
  };
  const cubic = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
    );
  };

  for (let r = 0; r < targetSize; r++) {
    const gy = (r / (targetSize - 1)) * (coarseSize - 1);
    const r1 = Math.floor(gy);
    const ty = gy - r1;
    for (let c = 0; c < targetSize; c++) {
      const gx = (c / (targetSize - 1)) * (coarseSize - 1);
      const c1 = Math.floor(gx);
      const tx = gx - c1;
      const rowVals: number[] = [];
      for (let dr = -1; dr <= 2; dr++) {
        rowVals.push(
          cubic(at(r1 + dr, c1 - 1), at(r1 + dr, c1), at(r1 + dr, c1 + 1), at(r1 + dr, c1 + 2), tx),
        );
      }
      const val = cubic(rowVals[0] ?? 0, rowVals[1] ?? 0, rowVals[2] ?? 0, rowVals[3] ?? 0, ty);
      out[r * targetSize + c] = Number(val.toFixed(1));
    }
  }
  return out;
}
