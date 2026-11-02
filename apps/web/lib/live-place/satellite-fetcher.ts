import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { Evidence, Source } from "@siterra/contracts";

export interface LandCoverGrid {
  width: number;
  height: number;
  tree: number[];
  crop: number[];
  grass?: number[];
  water?: number[];
  bare?: number[];
}

export interface SatelliteLandCoverResult {
  worldCoverItemId?: string;
  worldCoverYear?: number;
  worldCoverTileUrl?: string;
  sentinel2ItemId?: string;
  sentinel2Datetime?: string;
  sentinel2CloudCover?: number;
  sentinel2Platform?: string;
  metaCanopyQuadKey?: string;
  metaCanopyTileUrl?: string;
  metaCanopyAcqDate?: string;
  metaCanopyModel?: string;
  treeCoverPct?: number;
  croplandPct?: number;
  grasslandPct?: number;
  waterPct?: number;
  barePct?: number;
  landCoverGrid?: LandCoverGrid;
}

/**
 * Computes the Web Mercator Bing/Slippy quadkey (default zoom 9) used by Meta AI & WRI's
 * 1-meter Global Canopy Height Map (`s3://dataforgood-fb-data/forests/v1/alsgedi_global_v6_float/`).
 */
export function latLonToMetaCanopyQuadKey(lat: number, lon: number, zoom = 9): string {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const clampedLon = Math.max(-180, Math.min(179.999999, lon));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const n = 2 ** zoom;
  const x = Math.max(0, Math.min(n - 1, Math.floor(((clampedLon + 180) / 360) * n)));
  const y = Math.max(
    0,
    Math.min(n - 1, Math.floor((0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n)),
  );
  let quadKey = "";
  for (let i = zoom; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    quadKey += String(digit);
  }
  return quadKey;
}

interface StacAsset {
  href?: string;
  title?: string;
  type?: string;
}

interface StacFeature {
  id?: string;
  collection?: string;
  properties?: {
    datetime?: string | null;
    start_datetime?: string | null;
    end_datetime?: string | null;
    "eo:cloud_cover"?: number;
    platform?: string;
    "esa_worldcover:product_version"?: string;
    "esa_worldcover:product_tile"?: string;
  };
  assets?: Record<string, StacAsset>;
}

interface StacSearchResponse {
  features?: StacFeature[];
}

/**
 * Decodes an 8-bit RGB (colorType 2), Indexed (colorType 3), Grayscale+Alpha (colorType 4),
 * or RGBA (colorType 6) PNG buffer into an RGBA Uint8Array of length width * height * 4.
 */
export function decodePngRgba(
  bytes: Uint8Array,
): { width: number; height: number; data: Uint8Array } | null {
  if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let palette: Uint8Array | null = null;
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
      bitDepth = bytes[dataStart + 8] ?? 8;
      colorType = bytes[dataStart + 9] ?? 6;
    } else if (type === "PLTE") {
      palette = bytes.subarray(dataStart, dataStart + len);
    } else if (type === "IDAT") {
      idatParts.push(bytes.subarray(dataStart, dataStart + len));
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + len + 4;
  }

  if (width <= 0 || height <= 0 || bitDepth !== 8 || idatParts.length === 0) {
    return null;
  }

  const bpp =
    colorType === 6
      ? 4
      : colorType === 2
        ? 3
        : colorType === 4
          ? 2
          : colorType === 3 || colorType === 0
            ? 1
            : 0;
  if (bpp === 0) return null;

  try {
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

    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const dst = i * 4;
      if (colorType === 6) {
        rgba[dst] = recon[i * 4] ?? 0;
        rgba[dst + 1] = recon[i * 4 + 1] ?? 0;
        rgba[dst + 2] = recon[i * 4 + 2] ?? 0;
        rgba[dst + 3] = recon[i * 4 + 3] ?? 255;
      } else if (colorType === 2) {
        rgba[dst] = recon[i * 3] ?? 0;
        rgba[dst + 1] = recon[i * 3 + 1] ?? 0;
        rgba[dst + 2] = recon[i * 3 + 2] ?? 0;
        rgba[dst + 3] = 255;
      } else if (colorType === 3 && palette) {
        const idx = (recon[i] ?? 0) * 3;
        rgba[dst] = palette[idx] ?? 0;
        rgba[dst + 1] = palette[idx + 1] ?? 0;
        rgba[dst + 2] = palette[idx + 2] ?? 0;
        rgba[dst + 3] = 255;
      } else if (colorType === 4) {
        const g = recon[i * 2] ?? 0;
        rgba[dst] = g;
        rgba[dst + 1] = g;
        rgba[dst + 2] = g;
        rgba[dst + 3] = recon[i * 2 + 1] ?? 255;
      } else {
        const g = recon[i] ?? 0;
        rgba[dst] = g;
        rgba[dst + 1] = g;
        rgba[dst + 2] = g;
        rgba[dst + 3] = 255;
      }
    }
    return { width, height, data: rgba };
  } catch {
    return null;
  }
}

/**
 * Encodes an RGBA Uint8Array into a valid PNG buffer (used by unit tests).
 */
export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }
  const crc32 = (buf: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = (crcTable[(c ^ (buf[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const makeChunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length, false);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
    return out;
  };

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = new Uint8Array(height * (1 + stride));
  for (let r = 0; r < height; r++) {
    raw[r * (1 + stride)] = 0;
    raw.set(rgba.subarray(r * stride, (r + 1) * stride), r * (1 + stride) + 1);
  }
  const compressed = deflateSync(raw);

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const cIhdr = makeChunk("IHDR", ihdr);
  const cIdat = makeChunk("IDAT", new Uint8Array(compressed));
  const cIend = makeChunk("IEND", new Uint8Array(0));

  const total = new Uint8Array(signature.length + cIhdr.length + cIdat.length + cIend.length);
  let pos = 0;
  for (const part of [signature, cIhdr, cIdat, cIend]) {
    total.set(part, pos);
    pos += part.length;
  }
  return total;
}

type WorldCoverBucket = "tree" | "crop" | "grass" | "water" | "bare";

const WORLDCOVER_PALETTE: ReadonlyArray<{
  bucket: WorldCoverBucket;
  r: number;
  g: number;
  b: number;
  treeVal: number;
  cropVal: number;
  grassVal: number;
  waterVal: number;
  bareVal: number;
}> = [
  // 10: Tree cover [0, 100, 0]
  {
    bucket: "tree",
    r: 0,
    g: 100,
    b: 0,
    treeVal: 255,
    cropVal: 0,
    grassVal: 0,
    waterVal: 0,
    bareVal: 0,
  },
  // 95: Mangroves [0, 207, 117]
  {
    bucket: "tree",
    r: 0,
    g: 207,
    b: 117,
    treeVal: 240,
    cropVal: 0,
    grassVal: 0,
    waterVal: 60,
    bareVal: 0,
  },
  // 20: Shrubland [255, 187, 34] -> woody shrub / dryland rangeland
  {
    bucket: "grass",
    r: 255,
    g: 187,
    b: 34,
    treeVal: 85,
    cropVal: 0,
    grassVal: 210,
    waterVal: 0,
    bareVal: 0,
  },
  // 30: Grassland [255, 255, 76]
  {
    bucket: "grass",
    r: 255,
    g: 255,
    b: 76,
    treeVal: 0,
    cropVal: 0,
    grassVal: 255,
    waterVal: 0,
    bareVal: 0,
  },
  // 100: Moss and lichen [250, 230, 160]
  {
    bucket: "grass",
    r: 250,
    g: 230,
    b: 160,
    treeVal: 0,
    cropVal: 0,
    grassVal: 195,
    waterVal: 0,
    bareVal: 60,
  },
  // 40: Cropland [240, 150, 255]
  {
    bucket: "crop",
    r: 240,
    g: 150,
    b: 255,
    treeVal: 0,
    cropVal: 255,
    grassVal: 0,
    waterVal: 0,
    bareVal: 0,
  },
  // 50: Built-up [250, 0, 0]
  {
    bucket: "bare",
    r: 250,
    g: 0,
    b: 0,
    treeVal: 0,
    cropVal: 0,
    grassVal: 0,
    waterVal: 0,
    bareVal: 220,
  },
  // 60: Bare / sparse vegetation [180, 180, 180]
  {
    bucket: "bare",
    r: 180,
    g: 180,
    b: 180,
    treeVal: 0,
    cropVal: 0,
    grassVal: 0,
    waterVal: 0,
    bareVal: 255,
  },
  // 70: Snow and ice [240, 240, 240]
  {
    bucket: "bare",
    r: 240,
    g: 240,
    b: 240,
    treeVal: 0,
    cropVal: 0,
    grassVal: 0,
    waterVal: 0,
    bareVal: 255,
  },
  // 80: Permanent water bodies [0, 100, 200]
  {
    bucket: "water",
    r: 0,
    g: 100,
    b: 200,
    treeVal: 0,
    cropVal: 0,
    grassVal: 0,
    waterVal: 255,
    bareVal: 0,
  },
  // 90: Herbaceous wetland [0, 150, 160]
  {
    bucket: "water",
    r: 0,
    g: 150,
    b: 160,
    treeVal: 0,
    cropVal: 50,
    grassVal: 120,
    waterVal: 230,
    bareVal: 0,
  },
];

export function classifyWorldCoverRgb(r: number, g: number, b: number) {
  const [first, ...rest] = WORLDCOVER_PALETTE;
  if (!first) throw new Error("WorldCover palette is empty");
  let best = first;
  let bestDist = Infinity;
  for (const entry of [first, ...rest]) {
    const dr = r - entry.r;
    const dg = g - entry.g;
    const db = b - entry.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best;
}

function classifyWorldCoverPng(decoded: { width: number; height: number; data: Uint8Array }): {
  grid: LandCoverGrid;
  treeCoverPct: number;
  croplandPct: number;
  grasslandPct: number;
  waterPct: number;
  barePct: number;
} {
  const { width, height, data } = decoded;
  const n = width * height;
  const tree = new Array<number>(n);
  const crop = new Array<number>(n);
  const grass = new Array<number>(n);
  const water = new Array<number>(n);
  const bare = new Array<number>(n);

  let treeCount = 0;
  let cropCount = 0;
  let grassCount = 0;
  let waterCount = 0;
  let bareCount = 0;
  let validCount = 0;

  for (let i = 0; i < n; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    const a = data[i * 4 + 3] ?? 255;

    if (a < 16 || (r === 0 && g === 0 && b === 0)) {
      tree[i] = 0;
      crop[i] = 0;
      grass[i] = 0;
      water[i] = 0;
      bare[i] = 0;
      continue;
    }

    const match = classifyWorldCoverRgb(r, g, b);
    tree[i] = match.treeVal;
    crop[i] = match.cropVal;
    grass[i] = match.grassVal;
    water[i] = match.waterVal;
    bare[i] = match.bareVal;
    validCount++;

    if (match.bucket === "tree") treeCount++;
    else if (match.bucket === "crop") cropCount++;
    else if (match.bucket === "grass") grassCount++;
    else if (match.bucket === "water") waterCount++;
    else bareCount++;
  }

  const denom = Math.max(1, validCount);
  return {
    grid: { width, height, tree, crop, grass, water, bare },
    treeCoverPct: Number(((treeCount / denom) * 100).toFixed(1)),
    croplandPct: Number(((cropCount / denom) * 100).toFixed(1)),
    grasslandPct: Number(((grassCount / denom) * 100).toFixed(1)),
    waterPct: Number(((waterCount / denom) * 100).toFixed(1)),
    barePct: Number(((bareCount / denom) * 100).toFixed(1)),
  };
}

async function searchStacFeatures(
  bbox: [number, number, number, number],
  signal: AbortSignal,
): Promise<StacFeature[]> {
  const url = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "Siterra/1.0",
  };
  const search = async (body: object): Promise<StacFeature[]> => {
    try {
      const res = await fetch(url, { method: "POST", headers, signal, body: JSON.stringify(body) });
      if (!res.ok) return [];
      const data = (await res.json().catch(() => ({}))) as StacSearchResponse;
      return Array.isArray(data.features) ? data.features : [];
    } catch {
      return [];
    }
  };

  // Planetary Computer serves esa-worldcover and sentinel-2-l2a from separate backends: ask each on its own, so a
  // box spanning several WorldCover tiles gets every one (two years of up to four tiles), then the combined search
  const [wc, s2] = await Promise.all([
    search({ collections: ["esa-worldcover"], bbox, limit: 8 }),
    search({ collections: ["sentinel-2-l2a"], bbox, limit: 4 }),
  ]);
  const found =
    wc.length + s2.length > 0
      ? [...wc, ...s2]
      : await search({ collections: ["esa-worldcover", "sentinel-2-l2a"], bbox, limit: 6 });
  const seen = new Set<string>();
  return found.filter((f) => {
    const id = typeof f.id === "string" ? f.id : "";
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** WorldCover crop size (px a side): about 78 m pixels over a 20 km box, the terrain grid's own spacing. */
export const WORLDCOVER_GRID = 256;

/** The year a WorldCover item maps, from its dates or its id. */
function worldCoverYearOf(f: StacFeature): number | undefined {
  const dateStr =
    f.properties?.end_datetime ?? f.properties?.start_datetime ?? f.properties?.datetime ?? f.id;
  const m = typeof dateStr === "string" ? /\b(20\d{2})\b/.exec(dateStr) : null;
  return m?.[1] ? Number.parseInt(m[1], 10) : undefined;
}

/**
 * Queries Microsoft Planetary Computer STAC API for `esa-worldcover` and `sentinel-2-l2a`
 * items intersecting `bbox`, crops every WorldCover item of the newest year over it (WORLDCOVER_GRID px a
 * side), merges them (the first crop with a reading at a pixel wins) and decodes the classes, and
 * resolves the Meta AI DINOv2 + WRI 1-meter Global Canopy Height Map quadkey tile.
 */
export async function fetchSatelliteLandCover(
  bbox: [number, number, number, number],
): Promise<SatelliteLandCoverResult> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const quadKey = latLonToMetaCanopyQuadKey(centerLat, centerLon, 9);
  const metaChmUrl = `https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm/${quadKey}.tif`;

  const ac = new AbortController();
  const timer = setTimeout(() => {
    ac.abort();
  }, 4500);
  let wcItems: StacFeature[];

  const result: SatelliteLandCoverResult = {
    metaCanopyQuadKey: quadKey,
    metaCanopyTileUrl: metaChmUrl,
    metaCanopyModel: "Meta AI DINOv2 ViT + WRI 1m Global Canopy Height (alsgedi_global_v6_float)",
  };
  try {
    const features = await searchStacFeatures(bbox, ac.signal);
    const wcFeatures = features.filter(
      (f) =>
        f.collection === "esa-worldcover" ||
        (typeof f.id === "string" && f.id.startsWith("ESA_WorldCover")),
    );
    const newestYear = Math.max(...wcFeatures.map((f) => worldCoverYearOf(f) ?? 0));
    wcItems = wcFeatures.filter((f) => (worldCoverYearOf(f) ?? 0) === newestYear);
    const wcFeature = wcItems[0];

    const s2Features = features.filter(
      (f) =>
        f.collection === "sentinel-2-l2a" ||
        (typeof f.id === "string" && /^S2[A-C]_MSIL2A/i.test(f.id)),
    );
    const s2Feature =
      s2Features.sort(
        (a, b) =>
          (a.properties?.["eo:cloud_cover"] ?? 100) - (b.properties?.["eo:cloud_cover"] ?? 100),
      )[0] ?? s2Features[0];

    if (wcFeature?.id) {
      result.worldCoverItemId = wcFeature.id;
      const year = worldCoverYearOf(wcFeature);
      if (year !== undefined) result.worldCoverYear = year;
      const tileHref =
        wcFeature.assets?.["tilejson"]?.href ??
        wcFeature.assets?.["rendered_preview"]?.href ??
        wcFeature.assets?.["map"]?.href;
      if (tileHref) {
        result.worldCoverTileUrl = tileHref;
      }
    }

    if (s2Feature?.id) {
      result.sentinel2ItemId = s2Feature.id;
      if (typeof s2Feature.properties?.datetime === "string") {
        result.sentinel2Datetime = s2Feature.properties.datetime;
      }
      if (typeof s2Feature.properties?.["eo:cloud_cover"] === "number") {
        result.sentinel2CloudCover = Number(s2Feature.properties["eo:cloud_cover"].toFixed(2));
      }
      if (typeof s2Feature.properties?.platform === "string") {
        result.sentinel2Platform = s2Feature.properties.platform;
      }
    }
  } catch {
    clearTimeout(timer);
    return result;
  } finally {
    clearTimeout(timer);
  }

  if (!result.worldCoverItemId) {
    return result;
  }

  const cropAc = new AbortController();
  const cropTimer = setTimeout(() => {
    cropAc.abort();
  }, 8000);
  try {
    const bboxStr = `${String(minLon)},${String(minLat)},${String(maxLon)},${String(maxLat)}`;
    const size = String(WORLDCOVER_GRID);
    const cropOf = async (itemId: string) => {
      const itemEnc = encodeURIComponent(itemId);
      const primaryCropUrl = `https://planetarycomputer.microsoft.com/api/data/v1/item/crop/esa-worldcover/${itemEnc}.png?assets=map&bbox=${bboxStr}&width=${size}&height=${size}&colormap_name=esa-worldcover`;
      const titilerCropUrl = `https://planetarycomputer.microsoft.com/api/data/v1/item/crop/${bboxStr}/${size}x${size}.png?collection=esa-worldcover&item=${itemEnc}&assets=map&colormap_name=esa-worldcover`;
      for (const url of [titilerCropUrl, primaryCropUrl]) {
        try {
          const res = await fetch(url, { signal: cropAc.signal });
          if (res.ok) return decodePngRgba(new Uint8Array(await res.arrayBuffer()));
        } catch {
          if (cropAc.signal.aborted) return null;
        }
      }
      return null;
    };
    const ids = wcItems.map((f) => f.id).filter((id): id is string => typeof id === "string");
    const crops = (await Promise.all(ids.slice(0, 4).map(cropOf))).filter(
      (d): d is NonNullable<typeof d> => d !== null && d.width > 0 && d.height > 0,
    );
    const first = crops[0];
    if (first) {
      // where the box spans several WorldCover tiles each crop reads only its own: the first with a reading wins
      const merged = new Uint8Array(first.data);
      const hasReading = (d: Uint8Array, p: number) =>
        (d[p + 3] ?? 255) >= 16 && ((d[p] ?? 0) > 0 || (d[p + 1] ?? 0) > 0 || (d[p + 2] ?? 0) > 0);
      for (const other of crops.slice(1)) {
        if (other.width !== first.width || other.height !== first.height) continue;
        for (let p = 0; p < merged.length; p += 4) {
          if (!hasReading(merged, p) && hasReading(other.data, p)) {
            merged.set(other.data.subarray(p, p + 4), p);
          }
        }
      }
      const classified = classifyWorldCoverPng({
        width: first.width,
        height: first.height,
        data: merged,
      });
      result.landCoverGrid = classified.grid;
      result.treeCoverPct = classified.treeCoverPct;
      result.croplandPct = classified.croplandPct;
      result.grasslandPct = classified.grasslandPct;
      result.waterPct = classified.waterPct;
      result.barePct = classified.barePct;
    }
  } catch {
    // Gracefully return STAC metadata if crop endpoint times out or fails
  } finally {
    clearTimeout(cropTimer);
  }

  return result;
}

export interface SatelliteRecordBuildParams {
  caseId: string;
  slug: string;
  hash6: string;
  placeName: string;
  regionName?: string;
  geoId?: string | null;
  now?: string;
  satellite?: SatelliteLandCoverResult;
  landCover?: SatelliteLandCoverResult;
  result?: SatelliteLandCoverResult;
}

export function buildSatelliteSourcesAndEvidence(
  paramsOrSatellite: SatelliteRecordBuildParams & Partial<SatelliteLandCoverResult>,
  maybeContext?: Omit<SatelliteRecordBuildParams, "satellite" | "landCover" | "result">,
): {
  sources: Source[];
  evidence: Evidence[];
  satelliteSources: Source[];
  satelliteEvidence: Evidence[];
} {
  const ctx = maybeContext ?? paramsOrSatellite;
  const sat: SatelliteLandCoverResult =
    paramsOrSatellite.satellite ??
    paramsOrSatellite.landCover ??
    paramsOrSatellite.result ??
    paramsOrSatellite;

  const caseId = ctx.caseId;
  const slug = ctx.slug;
  const hash6 = ctx.hash6;
  const placeName = ctx.placeName;
  const geoId = ctx.geoId ?? null;
  const now = ctx.now ?? new Date().toISOString();

  const sources: Source[] = [];
  const evidence: Evidence[] = [];

  if (sat.worldCoverItemId) {
    const srcId = `src_sat_wc_${slug}_${hash6}`;
    const yearStr = String(sat.worldCoverYear ?? 2021);
    const tileUrl =
      sat.worldCoverTileUrl ??
      `https://planetarycomputer.microsoft.com/api/stac/v1/collections/esa-worldcover/items/${encodeURIComponent(sat.worldCoverItemId)}`;
    const compositionParts: string[] = [];
    if (typeof sat.treeCoverPct === "number")
      compositionParts.push(`tree cover ${sat.treeCoverPct.toFixed(1)}%`);
    if (typeof sat.grasslandPct === "number")
      compositionParts.push(`grassland/shrubland ${sat.grasslandPct.toFixed(1)}%`);
    if (typeof sat.croplandPct === "number")
      compositionParts.push(`cropland ${sat.croplandPct.toFixed(1)}%`);
    if (typeof sat.barePct === "number")
      compositionParts.push(`bare/sparse ${sat.barePct.toFixed(1)}%`);
    if (typeof sat.waterPct === "number")
      compositionParts.push(`water/wetland ${sat.waterPct.toFixed(1)}%`);
    const compSummary =
      compositionParts.length > 0
        ? `Observed 10 m land-cover composition across ${placeName}: ${compositionParts.join(", ")}.`
        : `ESA WorldCover 10 m product tile ${sat.worldCoverItemId} covering ${placeName}.`;

    const contentHash = `sha256:${createHash("sha256").update(`${sat.worldCoverItemId}\n${compSummary}`).digest("hex")}`;
    const src = Source.safeParse({
      recordType: "Source",
      id: srcId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title: `ESA WorldCover 10 m (${yearStr}) — STAC Item ${sat.worldCoverItemId}`,
      url: tileUrl,
      publisher: "European Space Agency (ESA) / Microsoft Planetary Computer STAC",
      authors: ["ESA WorldCover Consortium"],
      publicationDate: /^\d{4}$/.test(yearStr) ? yearStr : "2021",
      language: "en",
      accessedAt: now,
      sourceKind: "official_dataset",
      accessStatus: "retrieved",
      license: "CC BY 4.0",
      redistributionStatus: "permitted",
      contentHash,
      notes: [
        compSummary,
        `STAC item ${sat.worldCoverItemId} retrieved via Microsoft Planetary Computer.`,
      ],
    });
    if (src.success) {
      sources.push(src.data);
      const ev = Evidence.safeParse({
        recordType: "Evidence",
        id: `ev_sat_wc_${slug}_${hash6}`,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        caseId,
        statement: `ESA WorldCover 10 m satellite classification (${sat.worldCoverItemId}) for ${placeName}: ${compSummary}`,
        claimKind: "observation",
        status: "accepted",
        geoSelectionId: geoId,
        periodIds: [],
        measurementIds: [],
        provenance: {
          sourceLocators: [
            {
              sourceId: src.data.id,
              locator: `STAC item ${sat.worldCoverItemId}`,
              excerpt: compSummary,
            },
          ],
          dataBundleIds: [],
          methodId: "planetary_computer_worldcover_crop",
          methodVersion: "2.0.0",
          inputVersions: [{ entityId: src.data.id, revision: 1 }],
          generatedByTaskId: null,
          generatedAt: now,
          verificationStatus: "source_checked",
          limitations: [
            "10 m global land-cover classification from Sentinel-1 and Sentinel-2; local mixed pixels require field verification.",
          ],
        },
        interpretation: `Provides satellite-derived baseline distribution of woody cover, cropland, and rangeland across ${placeName}.`,
        uncertainty:
          "Global 10 m classification (~76.7% overall accuracy); local ground validation required.",
        reviewDecisionIds: [],
      });
      if (ev.success) {
        evidence.push(ev.data);
      }
    }
  }

  if (sat.sentinel2ItemId) {
    const srcId = `src_sat_s2_${slug}_${hash6}`;
    const dtIso = sat.sentinel2Datetime ?? now;
    const pubDate = /^\d{4}-\d{2}-\d{2}/.test(dtIso) ? dtIso.slice(0, 10) : now.slice(0, 10);
    const cloudText =
      typeof sat.sentinel2CloudCover === "number"
        ? `${sat.sentinel2CloudCover.toFixed(1)}% cloud cover`
        : "L2A surface reflectance";
    const platformText = sat.sentinel2Platform ?? "Sentinel-2";
    const s2Excerpt = `${platformText} L2A multispectral scene ${sat.sentinel2ItemId} (${pubDate}, ${cloudText}) intersecting ${placeName}.`;
    const s2Url = `https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a/items/${encodeURIComponent(sat.sentinel2ItemId)}`;
    const contentHash = `sha256:${createHash("sha256").update(s2Excerpt).digest("hex")}`;

    const src = Source.safeParse({
      recordType: "Source",
      id: srcId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title: `Copernicus ${platformText} L2A Scene ${sat.sentinel2ItemId} (${pubDate})`,
      url: s2Url,
      publisher: "Copernicus Sentinel-2 / Microsoft Planetary Computer STAC",
      authors: ["European Space Agency (ESA)"],
      publicationDate: pubDate,
      language: "en",
      accessedAt: now,
      sourceKind: "official_dataset",
      accessStatus: "retrieved",
      license: "Copernicus Sentinel Data Terms (free and open)",
      redistributionStatus: "permitted",
      contentHash,
      notes: [s2Excerpt],
    });
    if (src.success) {
      sources.push(src.data);
      const ev = Evidence.safeParse({
        recordType: "Evidence",
        id: `ev_sat_s2_${slug}_${hash6}`,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        caseId,
        statement: `Recent Copernicus ${platformText} optical pass over ${placeName}: ${s2Excerpt}`,
        claimKind: "observation",
        status: "accepted",
        geoSelectionId: geoId,
        periodIds: [],
        measurementIds: [],
        provenance: {
          sourceLocators: [
            {
              sourceId: src.data.id,
              locator: `STAC item ${sat.sentinel2ItemId}`,
              excerpt: s2Excerpt,
            },
          ],
          dataBundleIds: [],
          methodId: "planetary_computer_stac_search",
          methodVersion: "1.0.0",
          inputVersions: [{ entityId: src.data.id, revision: 1 }],
          generatedByTaskId: null,
          generatedAt: now,
          verificationStatus: "source_checked",
          limitations: [
            "Scene-level STAC metadata and cloud-cover screening; atmospheric effects in steep terrain require topographic correction.",
          ],
        },
        interpretation: `Confirms recent 10 m multispectral Sentinel-2 coverage over ${placeName}.`,
        uncertainty: `Scene cloud cover ${cloudText}; sub-pixel canopy fraction unquantified without field plots.`,
        reviewDecisionIds: [],
      });
      if (ev.success) {
        evidence.push(ev.data);
      }
    }
  }

  // No canopy Source or Evidence: the Meta and WRI canopy height tile is named (metaCanopyQuadKey) but never read, so
  // nothing about it is retrieved or checked. It returns when a fetcher reads canopy values from the tile.

  return {
    sources,
    evidence,
    satelliteSources: sources,
    satelliteEvidence: evidence,
  };
}
