/**
 * Tree canopy height of a live place from the Meta and World Resources Institute global canopy height map
 * (`meta-wri-chm-v1`, CC BY 4.0, source imagery © 2016 Maxar), read from the 1/4000 degree (about 28 m) downsampled
 * average product (`alsgedi_global_v6_float_epsg4326_v3_10deg/meta_chm_lat=<top>_lon=<left>_avg.tif`) on AWS Open
 * Data. Each 10-degree file is a 40,000 x 40,000 uint16 strip TIFF (centimetres, 65535 no data, LZW compressed, one
 * row per strip, no tiles), so this module reads the strip offset and byte-count tables by HTTP Range and decodes the
 * place's strips directly. Runs after the start and caches per place.
 */
import { liveCacheKey, cachedLive } from "./live-cache.ts";
import {
  type Bbox,
  type LiveFetchOptions,
  type LiveResult,
  LiveFetchError,
  fetchWithRetry,
  mapLimited,
  missingFrom,
  withTimeout,
} from "./planetary.ts";

export const CANOPY_METHOD = { id: "live_canopy_height", version: "1.0.0" } as const;

export const CANOPY_S3_BASE =
  "https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float_epsg4326_v3_10deg";

export const CANOPY_ATTRIBUTION =
  "Meta and World Resources Institute (WRI) 2024, High Resolution Canopy Height Maps. Source imagery for CHM © 2016 Maxar";

export const CANOPY_LIMITATIONS = [
  "Heights come from a vision transformer model applied to Maxar satellite imagery (nominal 2016 to 2020) and averaged into 1/4000 degree (about 28 m) grid cells.",
  "The downsampling procedure smooths small-scale peaks and gaps in the 1 m canopy height map.",
  "Cells with cloud cover in the source imagery or outside land coverage have no reading (65535 in the source TIFF, NaN here).",
];

const CELLS_PER_DEG = 4000;
const TILE_DEG = 10;
const NODATA_CM = 65535;
/** First 320,512 bytes hold the TIFF header, IFD, StripByteCounts (160 KB) and StripOffsets (160 KB) of a 40,000-row tile. */
const INITIAL_HEADER_BYTES = 320_512;
const RANGE_CONCURRENCY = 8;

export interface CanopyHeight {
  product: "meta_chm_v1_avg_1_4000_deg";
  bbox: Bbox;
  width: number;
  height: number;
  /** Row 0 north, mean canopy height in metres per 1/4000 degree cell; NaN where no reading (65535). */
  meanHeightM: Float32Array;
  /** Share of cells in the grid with no reading (65535). */
  noReadingShare: number;
  /** Mean height in metres over all cells with a reading, or null if none. */
  areaMeanHeightM: number | null;
  /** Maximum cell mean height in metres over all cells with a reading, or null if none. */
  maxHeightM: number | null;
  /** Share of cells with a reading whose mean height exceeds 1 m. */
  canopyOver1mShare: number;
  /** Share of cells with a reading whose mean height is at least 5 m. */
  canopyOver5mShare: number;
  /** S3 object filenames read. */
  tileKeys: string[];
  attribution: string;
  limitations: string[];
}

/** Formats the 10-degree S3 filename; equatorial tiles in the bucket are named `lat=-0.0` while prime-meridian tiles use `lon=0.0`. */
export function canopyTileKey(topLat: number, leftLon: number): string {
  const latStr = topLat === 0 ? "-0.0" : topLat.toFixed(1);
  const lonStr = leftLon === 0 ? "0.0" : leftLon.toFixed(1);
  return `meta_chm_lat=${latStr}_lon=${lonStr}_avg.tif`;
}

// --- Hand-written TIFF strip table and LZW reader (under 150 lines) ---

const LZW_PREFIX = new Int16Array(4096);
const LZW_SUFFIX = new Uint8Array(4096);
const LZW_FIRST = new Uint8Array(4096);
const LZW_LENGTH = new Uint16Array(4096);
for (let i = 0; i < 256; i++) {
  LZW_SUFFIX[i] = i;
  LZW_FIRST[i] = i;
  LZW_LENGTH[i] = 1;
}

/** Decodes a TIFF LZW strip (MSB-first bit packing, early code-size change) into `out`, stopping once `out` is full. */
export function decodeTiffLzw(src: Uint8Array, out: Uint8Array): number {
  const maxOut = out.length;
  const srcLen = src.length;
  let tableLen = 258;
  let codeSize = 9;
  let bitBuf = 0;
  let bitCnt = 0;
  let srcPos = 0;
  let outPos = 0;
  let oldCode = -1;

  while (outPos < maxOut) {
    while (bitCnt < codeSize && srcPos < srcLen) {
      bitBuf = (bitBuf << 8) | (src[srcPos++] ?? 0);
      bitCnt += 8;
    }
    if (bitCnt < codeSize) break;
    bitCnt -= codeSize;
    const code = (bitBuf >>> bitCnt) & ((1 << codeSize) - 1);
    if (code === 257) break;
    if (code === 256) {
      tableLen = 258;
      codeSize = 9;
      oldCode = -1;
      continue;
    }
    let entryCode = code;
    if (code < tableLen) {
      if (oldCode >= 0 && tableLen < 4096) {
        LZW_PREFIX[tableLen] = oldCode;
        LZW_SUFFIX[tableLen] = LZW_FIRST[code] ?? 0;
        LZW_FIRST[tableLen] = LZW_FIRST[oldCode] ?? 0;
        LZW_LENGTH[tableLen] = (LZW_LENGTH[oldCode] ?? 1) + 1;
        tableLen++;
      }
    } else if (code === tableLen && oldCode >= 0 && tableLen < 4096) {
      const fb = LZW_FIRST[oldCode] ?? 0;
      LZW_PREFIX[tableLen] = oldCode;
      LZW_SUFFIX[tableLen] = fb;
      LZW_FIRST[tableLen] = fb;
      LZW_LENGTH[tableLen] = (LZW_LENGTH[oldCode] ?? 1) + 1;
      entryCode = tableLen++;
    } else {
      throw new LiveFetchError(
        "decode_failed",
        `Invalid TIFF LZW code ${code} (table=${tableLen}).`,
      );
    }
    const len = LZW_LENGTH[entryCode] ?? 1;
    let p = outPos + len - 1;
    let cur = entryCode;
    while (cur >= 256) {
      if (p < maxOut) out[p] = LZW_SUFFIX[cur] ?? 0;
      p--;
      cur = LZW_PREFIX[cur] ?? 0;
    }
    if (p < maxOut) out[p] = cur;
    outPos += len;
    oldCode = code;
    if (tableLen === (1 << codeSize) - 1 && codeSize < 12) codeSize++;
  }
  return outPos;
}

interface TiffStripHeader {
  le: boolean;
  width: number;
  height: number;
  predictor: number;
  stripOffsetsPos: number;
  stripByteCountsPos: number;
}

function parseTiffStripHeader(head: Uint8Array): TiffStripHeader {
  if (head.byteLength < 16) {
    throw new LiveFetchError("decode_failed", "Canopy TIFF header is truncated.");
  }
  const le = head[0] === 0x49 && head[1] === 0x49;
  const be = head[0] === 0x4d && head[1] === 0x4d;
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if ((!le && !be) || dv.getUint16(2, le) !== 42) {
    throw new LiveFetchError("decode_failed", "Canopy file is not a classic TIFF (magic 42).");
  }
  const ifdOff = dv.getUint32(4, le);
  const nEntries = dv.getUint16(ifdOff, le);
  let width = 0;
  let height = 0;
  let bps = 0;
  let compression = 0;
  let rowsPerStrip = 1;
  let predictor = 1;
  let stripOffsetsPos = 0;
  let stripByteCountsPos = 0;
  for (let i = 0; i < nEntries; i++) {
    const p = ifdOff + 2 + i * 12;
    const tag = dv.getUint16(p, le);
    const typ = dv.getUint16(p + 2, le);
    const cnt = dv.getUint32(p + 4, le);
    const val = typ === 3 && cnt === 1 ? dv.getUint16(p + 8, le) : dv.getUint32(p + 8, le);
    if (tag === 256) width = val;
    else if (tag === 257) height = val;
    else if (tag === 258) bps = val;
    else if (tag === 259) compression = val;
    else if (tag === 273) stripOffsetsPos = dv.getUint32(p + 8, le);
    else if (tag === 278) rowsPerStrip = val;
    else if (tag === 279) stripByteCountsPos = dv.getUint32(p + 8, le);
    else if (tag === 317) predictor = val;
  }
  if (!width || !height || bps !== 16 || compression !== 5 || rowsPerStrip !== 1) {
    throw new LiveFetchError(
      "decode_failed",
      `Unsupported canopy TIFF layout (${width}x${height}, bps=${bps}, compression=${compression}, rowsPerStrip=${rowsPerStrip}).`,
    );
  }
  return { le, width, height, predictor, stripOffsetsPos, stripByteCountsPos };
}

async function fetchByteRange(
  url: string,
  start: number,
  endInclusive: number,
  opts: LiveFetchOptions,
): Promise<Uint8Array> {
  const res = await fetchWithRetry(
    url,
    { headers: { Range: `bytes=${start}-${endInclusive}`, "User-Agent": "Siterra/1.0" } },
    opts,
  );
  if (res.status === 404 || res.status === 403) {
    throw new LiveFetchError(
      "outside_coverage",
      `Canopy tile ${url.split("/").pop()} is not in S3 (HTTP ${res.status}).`,
    );
  }
  if (!res.ok && res.status !== 206) {
    throw new LiveFetchError("http_error", `Canopy range read returned HTTP ${res.status}.`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

// --- End of TIFF strip table and LZW reader ---

async function readU32Slice(
  url: string,
  head: Uint8Array,
  le: boolean,
  tablePos: number,
  r0: number,
  count: number,
  opts: LiveFetchOptions,
): Promise<Uint32Array> {
  const byteStart = tablePos + r0 * 4;
  const byteLen = count * 4;
  const src =
    byteStart + byteLen <= head.byteLength
      ? head.subarray(byteStart, byteStart + byteLen)
      : await fetchByteRange(url, byteStart, byteStart + byteLen - 1, opts);
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const out = new Uint32Array(count);
  for (let i = 0; i < count; i++) out[i] = dv.getUint32(i * 4, le);
  return out;
}

/** Fetches and decodes `bbox` from the 1/4000 degree Meta and WRI canopy height product. */
export async function fetchCanopyHeight(
  bbox: Bbox,
  opts: LiveFetchOptions = {},
): Promise<LiveResult<CanopyHeight>> {
  const startedAt = Date.now();
  const now = opts.now?.() ?? new Date();
  const t = withTimeout(opts.timeoutMs ?? 25_000, opts.signal);
  const inner: LiveFetchOptions = { ...opts, signal: t.signal };

  try {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const eps = 1e-9;
    const topLat = Math.ceil((maxLat - eps) / TILE_DEG) * TILE_DEG;
    const leftLon = Math.floor((minLon + eps) / TILE_DEG) * TILE_DEG;
    const tileKey = canopyTileKey(topLat, leftLon);
    const url = `${CANOPY_S3_BASE}/${tileKey}`;

    const head = await fetchByteRange(url, 0, INITIAL_HEADER_BYTES - 1, inner);
    const hdr = parseTiffStripHeader(head);

    const r0 = Math.max(0, Math.floor((topLat - maxLat) * CELLS_PER_DEG + eps));
    const r1 = Math.min(hdr.height - 1, Math.ceil((topLat - minLat) * CELLS_PER_DEG - eps) - 1);
    const c0 = Math.max(0, Math.floor((minLon - leftLon) * CELLS_PER_DEG + eps));
    const c1 = Math.min(hdr.width - 1, Math.ceil((maxLon - leftLon) * CELLS_PER_DEG - eps) - 1);
    if (r1 < r0 || c1 < c0) {
      throw new LiveFetchError("outside_coverage", "Canopy bbox maps to an empty pixel window.");
    }
    const nrows = r1 - r0 + 1;
    const ncols = c1 - c0 + 1;

    const [offsets, counts] = await Promise.all([
      readU32Slice(url, head, hdr.le, hdr.stripOffsetsPos, r0, nrows, inner),
      readU32Slice(url, head, hdr.le, hdr.stripByteCountsPos, r0, nrows, inner),
    ]);

    const totalSpan = (offsets[nrows - 1] ?? 0) + (counts[nrows - 1] ?? 0) - (offsets[0] ?? 0);
    const concurrency = opts.concurrency ?? RANGE_CONCURRENCY;
    const targetChunkBytes = Math.max(512_000, Math.ceil(totalSpan / concurrency));

    const chunks: { startIdx: number; endIdx: number; startByte: number; endByte: number }[] = [];
    let idx = 0;
    while (idx < nrows) {
      let endIdx = idx;
      const startByte = offsets[idx] ?? 0;
      while (
        endIdx + 1 < nrows &&
        (offsets[endIdx] ?? 0) + (counts[endIdx] ?? 0) === (offsets[endIdx + 1] ?? 0) &&
        (offsets[endIdx + 1] ?? 0) + (counts[endIdx + 1] ?? 0) - startByte <= targetChunkBytes
      ) {
        endIdx++;
      }
      const endByte = (offsets[endIdx] ?? 0) + (counts[endIdx] ?? 0) - 1;
      chunks.push({ startIdx: idx, endIdx, startByte, endByte });
      idx = endIdx + 1;
    }

    const chunkBuffers = await mapLimited(chunks, concurrency, (c) =>
      fetchByteRange(url, c.startByte, c.endByte, inner),
    );

    const rowBuf = new Uint8Array((c1 + 1) * 2);
    const rowView = new DataView(rowBuf.buffer);
    const meanHeightM = new Float32Array(nrows * ncols);
    let valid = 0;
    let missing = 0;
    let sumM = 0;
    let maxM = -Infinity;
    let over1m = 0;
    let over5m = 0;

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const buf = chunkBuffers[ci];
      if (!chunk || !buf) continue;
      for (let r = chunk.startIdx; r <= chunk.endIdx; r++) {
        const relStart = (offsets[r] ?? 0) - chunk.startByte;
        const len = counts[r] ?? 0;
        const strip = buf.subarray(relStart, relStart + len);
        decodeTiffLzw(strip, rowBuf);
        if (hdr.predictor === 2) {
          let acc = rowView.getUint16(0, hdr.le);
          for (let col = 1; col <= c1; col++) {
            acc = (acc + rowView.getUint16(col * 2, hdr.le)) & 0xffff;
            rowView.setUint16(col * 2, acc, hdr.le);
          }
        }
        const rowBase = r * ncols;
        for (let c = 0; c < ncols; c++) {
          const cm = rowView.getUint16((c0 + c) * 2, hdr.le);
          if (cm === NODATA_CM) {
            meanHeightM[rowBase + c] = Number.NaN;
            missing++;
          } else {
            const m = cm * 0.01;
            meanHeightM[rowBase + c] = m;
            valid++;
            sumM += m;
            if (m > maxM) maxM = m;
            if (m > 1) over1m++;
            if (m >= 5) over5m++;
          }
        }
      }
    }

    const totalCells = nrows * ncols;
    return {
      status: "measured",
      value: {
        product: "meta_chm_v1_avg_1_4000_deg",
        bbox,
        width: ncols,
        height: nrows,
        meanHeightM,
        noReadingShare: Number((missing / Math.max(1, totalCells)).toFixed(4)),
        areaMeanHeightM: valid > 0 ? Number((sumM / valid).toFixed(2)) : null,
        maxHeightM: valid > 0 ? Number(maxM.toFixed(2)) : null,
        canopyOver1mShare: valid > 0 ? Number((over1m / valid).toFixed(4)) : 0,
        canopyOver5mShare: valid > 0 ? Number((over5m / valid).toFixed(4)) : 0,
        tileKeys: [tileKey],
        attribution: CANOPY_ATTRIBUTION,
        limitations: [...CANOPY_LIMITATIONS],
      },
      provenance: {
        source: "meta-wri-chm-v1",
        items: [tileKey],
        window: { start: "2016-01-01", end: "2020-12-31" },
        method: { ...CANOPY_METHOD },
        retrievedAt: now.toISOString(),
        elapsedMs: Date.now() - startedAt,
      },
    };
  } catch (err) {
    return missingFrom("meta-wri-chm-v1", err, startedAt, t.signal);
  } finally {
    t.clear();
  }
}

/** Reads canopy height from `.local/cache/live-data/canopy/`, or fetches and writes it on a miss. */
export async function cachedCanopyHeight(
  bbox: Bbox,
  opts: LiveFetchOptions & { cacheDir?: string } = {},
): Promise<LiveResult<CanopyHeight>> {
  const key = liveCacheKey(bbox, undefined, CANOPY_METHOD.version);
  return cachedLive("canopy", key, () => fetchCanopyHeight(bbox, opts), opts.cacheDir);
}
