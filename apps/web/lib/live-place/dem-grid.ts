import { inflateSync } from "node:zlib";

function seededNoise(seed: number): () => number {
  let s = (Math.floor(seed) >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function decodeTerrariumPng(bytes: Uint8Array): Float32Array | null {
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

/**
 * Fetches real 30 m / 60 m global DEM tiles from AWS Open Data (Terrarium PNG tiles at zoom 11)
 * covering bbox and resamples them to targetSize x targetSize.
 */
export async function fetchTerrariumGrid(
  bbox: [number, number, number, number],
  targetSize = 64,
): Promise<number[] | null> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const z = 11;
  const n = 2 ** z;
  const lonToTileX = (lon: number) => ((lon + 180) / 360) * n;
  const latToTileY = (lat: number) => {
    const rad = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  };
  const x0 = Math.max(0, Math.min(n - 1, Math.floor(lonToTileX(minLon))));
  const x1 = Math.max(0, Math.min(n - 1, Math.floor(lonToTileX(maxLon))));
  const y0 = Math.max(0, Math.min(n - 1, Math.floor(latToTileY(maxLat))));
  const y1 = Math.max(0, Math.min(n - 1, Math.floor(latToTileY(minLat))));
  if (x1 - x0 > 3 || y1 - y0 > 3) return null;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 4500);
  try {
    const tiles = new Map<string, Float32Array>();
    const coords: Array<[number, number]> = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        coords.push([tx, ty]);
      }
    }
    await Promise.all(
      coords.map(async ([tx, ty]) => {
        const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${String(z)}/${String(tx)}/${String(ty)}.png`;
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        const decoded = decodeTerrariumPng(buf);
        if (!decoded) throw new Error("PNG decode failed");
        tiles.set(`${String(tx)},${String(ty)}`, decoded);
      }),
    );

    const sampleAtLonLat = (lon: number, lat: number): number => {
      const fx = lonToTileX(lon);
      const fy = latToTileY(lat);
      const tx = Math.max(x0, Math.min(x1, Math.floor(fx)));
      const ty = Math.max(y0, Math.min(y1, Math.floor(fy)));
      const tile = tiles.get(`${String(tx)},${String(ty)}`);
      if (!tile) return 0;
      const px = Math.max(0, Math.min(255, Math.floor((fx - tx) * 256)));
      const py = Math.max(0, Math.min(255, Math.floor((fy - ty) * 256)));
      return tile[py * 256 + px] ?? 0;
    };

    const out = new Array<number>(targetSize * targetSize);
    let min = Infinity;
    let max = -Infinity;
    for (let r = 0; r < targetSize; r++) {
      const ty = r / (targetSize - 1);
      const lat = maxLat - ty * (maxLat - minLat);
      for (let c = 0; c < targetSize; c++) {
        const tx = c / (targetSize - 1);
        const lon = minLon + tx * (maxLon - minLon);
        const h = Number(sampleAtLonLat(lon, lat).toFixed(1));
        out[r * targetSize + c] = h;
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    if (!Number.isFinite(min) || max - min < 1) return null;
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
  const timer = setTimeout(() => ac.abort(), 4500);
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
    Math.abs(Math.round(lon * 10000) * 73856093) ^
    Math.abs(Math.round(lat * 10000) * 19349663);
  const rand = seededNoise(seed);
  const axisAngle = rand() * Math.PI;
  const cosA = Math.cos(axisAngle);
  const sinA = Math.sin(axisAngle);
  const baseElev =
    650 + Math.round(Math.abs(Math.sin((lat * Math.PI) / 180)) * 950 + rand() * 550);
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
      const ridge1 = 1 - Math.abs(Math.sin(u * 4.6 + v * 2.2 + p1) * Math.cos(v * 4.2 - u * 1.8 + p2));
      const ridge2 = 1 - Math.abs(Math.sin(u * 9.2 - v * 6.4 + p2) * Math.cos(v * 8.5 + u * 5.1 + p3));
      const sideCanyons = Math.pow(ridge1, 1.6) * 0.34 + Math.pow(ridge2, 1.8) * 0.16;
      const h =
        baseElev +
        reliefAmp * Math.max(0, valleyCross + valleyLong + sideCanyons * (0.35 + 0.65 * Math.min(1, dv * 1.4)));
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
          cubic(
            at(r1 + dr, c1 - 1),
            at(r1 + dr, c1),
            at(r1 + dr, c1 + 1),
            at(r1 + dr, c1 + 2),
            tx,
          ),
        );
      }
      const val = cubic(
        rowVals[0] ?? 0,
        rowVals[1] ?? 0,
        rowVals[2] ?? 0,
        rowVals[3] ?? 0,
        ty,
      );
      out[r * targetSize + c] = Number(val.toFixed(1));
    }
  }
  return out;
}
