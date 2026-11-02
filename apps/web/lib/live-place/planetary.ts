/**
 * Shared Microsoft Planetary Computer client for live-place data: STAC search, raw `.npy` crops from the data API,
 * the MODIS sinusoidal grid, and the table of sources with the license and attribution read from each source.
 */

export const PC_STAC_SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
export const PC_DATA_ITEM = "https://planetarycomputer.microsoft.com/api/data/v1/item";

export type Bbox = [number, number, number, number];
export type Ring = readonly (readonly [number, number])[];

export type LiveSourceId =
  | "modis-13Q1-061"
  | "io-lulc-annual-v02"
  | "sentinel-2-l2a"
  | "3dep-seamless"
  | "cop-dem-glo-30"
  | "aws-terrarium"
  | "meta-wri-chm-v1";

export interface LiveSourceEntry {
  id: LiveSourceId;
  title: string;
  producer: string;
  host: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  citation: string;
  nominalResolution: string;
  coverage: string;
  verifiedFrom: string[];
  verifiedOn: string;
}

/**
 * Licenses and notices as each source states them, read on 2026-11-02. Where the STAC record says only "other" or
 * links to a page that no longer answers, `verifiedFrom` names the page the text was taken from instead.
 * Terrarium is the existing fallback in `dem-grid.ts` and is not re-verified here.
 */
export const LIVE_SOURCES: readonly LiveSourceEntry[] = [
  {
    id: "modis-13Q1-061",
    title: "MODIS/Terra Vegetation Indices 16-Day L3 Global 250 m SIN Grid V061 (MOD13Q1)",
    producer: "NASA Land Processes DAAC at the USGS EROS Center",
    host: "Microsoft Planetary Computer",
    license: "Openly shared without restriction (EOSDIS Data Use and Citation Guidance)",
    licenseUrl: "https://doi.org/10.5067/MODIS/MOD13Q1.061",
    attribution: "MOD13Q1 v6.1, NASA EOSDIS Land Processes DAAC, via Microsoft Planetary Computer",
    citation:
      "Didan, K. (2021). MODIS/Terra Vegetation Indices 16-Day L3 Global 250m SIN Grid V061 [Data set]. NASA EOSDIS Land Processes DAAC. https://doi.org/10.5067/MODIS/MOD13Q1.061",
    nominalResolution: "250 m (231.66 m sinusoidal grid), 16-day composites",
    coverage: "Global, February 2000 onward",
    verifiedFrom: [
      "https://planetarycomputer.microsoft.com/api/stac/v1/collections/modis-13Q1-061",
      "https://www.earthdata.nasa.gov/data/catalog/lpcloud-mod13q1-061",
    ],
    verifiedOn: "2026-11-02",
  },
  {
    id: "io-lulc-annual-v02",
    title: "10 m Annual Land Use Land Cover (9-class) V2",
    producer: "Impact Observatory, Microsoft and Esri",
    host: "Microsoft Planetary Computer",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "Land cover: Impact Observatory, Microsoft and Esri, CC BY 4.0",
    citation:
      "Impact Observatory, Microsoft and Esri. 10m Annual Land Use Land Cover (9-class) V2, 2017 to 2023. Microsoft Planetary Computer collection io-lulc-annual-v02.",
    nominalResolution: "10 m, one map per year",
    coverage: "Global, 2017 to 2023",
    verifiedFrom: [
      "https://planetarycomputer.microsoft.com/api/stac/v1/collections/io-lulc-annual-v02",
    ],
    verifiedOn: "2026-11-02",
  },
  {
    id: "sentinel-2-l2a",
    title: "Copernicus Sentinel-2 Level-2A",
    producer: "European Space Agency (Copernicus)",
    host: "Microsoft Planetary Computer",
    license: "Copernicus Sentinel data terms (free and open)",
    licenseUrl: "https://cds.climate.copernicus.eu/licences/ec-sentinel",
    attribution: "Contains modified Copernicus Sentinel data",
    citation:
      "Copernicus Sentinel-2 Level-2A, ESA. Microsoft Planetary Computer collection sentinel-2-l2a.",
    nominalResolution: "10 m true colour",
    coverage: "Global, June 2015 onward",
    verifiedFrom: [
      "https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a",
      "research/science/source-register.md SCI-18 (the STAC license links did not answer on 2026-11-02)",
    ],
    verifiedOn: "2026-11-02",
  },
  {
    id: "3dep-seamless",
    title: "USGS 3DEP Seamless DEM",
    producer: "U.S. Geological Survey",
    host: "Microsoft Planetary Computer",
    license: "PDDL 1.0 (public domain)",
    licenseUrl: "https://opendatacommons.org/licenses/pddl/1-0/",
    attribution: "Elevation: USGS 3D Elevation Program",
    citation:
      "U.S. Geological Survey, 3D Elevation Program seamless DEM. Microsoft Planetary Computer collection 3dep-seamless.",
    nominalResolution: "1/3 arc-second (about 10 m), bare earth",
    coverage: "United States and territories",
    verifiedFrom: ["https://planetarycomputer.microsoft.com/api/stac/v1/collections/3dep-seamless"],
    verifiedOn: "2026-11-02",
  },
  {
    id: "cop-dem-glo-30",
    title: "Copernicus DEM GLO-30",
    producer: "European Space Agency, DLR and Airbus Defence and Space",
    host: "Microsoft Planetary Computer",
    license: "Copernicus DEM license (free for the general public)",
    licenseUrl: "https://doi.org/10.5069/G9028PQB",
    attribution:
      "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
    citation:
      "European Space Agency (2024). Copernicus Global Digital Elevation Model. https://doi.org/10.5069/G9028PQB",
    nominalResolution: "1 arc-second (about 30 m), surface model including buildings and trees",
    coverage: "Global",
    verifiedFrom: [
      "https://planetarycomputer.microsoft.com/api/stac/v1/collections/cop-dem-glo-30",
      "https://portal.opentopography.org/datasetMetadata?otCollectionID=OT.032021.4326.1",
    ],
    verifiedOn: "2026-11-02",
  },
  {
    id: "meta-wri-chm-v1",
    title: "High Resolution Canopy Height Maps by WRI and Meta",
    producer: "Meta and World Resources Institute",
    host: "AWS Open Data (s3://dataforgood-fb-data/forests/v1/)",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution:
      "Meta and World Resources Institute (WRI) 2024, High Resolution Canopy Height Maps. Source imagery for CHM © 2016 Maxar",
    // The registry's own citation text, its spelling kept.
    citation:
      "Meta and World Resources Institude (WRI) - 2024. High Resolution Canopy Height Maps (CHM). Source imagery for CHM © 2016 Maxar.",
    nominalResolution: "1 m, and a 1/4000 degree (about 28 m) downsampled product",
    coverage: "Global",
    verifiedFrom: [
      "https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/readme.txt",
      "https://raw.githubusercontent.com/awslabs/open-data-registry/main/datasets/dataforgood-fb-forests.yaml",
    ],
    verifiedOn: "2026-11-02",
  },
];

export function liveSource(id: LiveSourceId): LiveSourceEntry | undefined {
  return LIVE_SOURCES.find((s) => s.id === id);
}

export interface Provenance {
  source: LiveSourceId;
  items: string[];
  window: { start: string; end: string };
  method: { id: string; version: string };
  retrievedAt: string;
  elapsedMs: number;
}

export type MissingReason =
  | "timeout"
  | "no_items"
  | "outside_coverage"
  | "http_error"
  | "decode_failed"
  | "coverage_below_threshold"
  | "aborted";

export type Measured<T> = { status: "measured"; value: T; provenance: Provenance };
export type MissingValue = {
  status: "missing";
  source: LiveSourceId;
  reason: MissingReason;
  detail: string;
  elapsedMs: number;
};
export type LiveResult<T> = Measured<T> | MissingValue;

export interface LiveFetchOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  concurrency?: number;
  now?: () => Date;
}

export class LiveFetchError extends Error {
  readonly reason: MissingReason;

  constructor(reason: MissingReason, message: string) {
    super(message);
    this.name = "LiveFetchError";
    this.reason = reason;
  }
}

/** A typed array decoded from a NumPy `.npy` file; titiler appends the mask as the last band (0 no data, 255 data). */
export interface NpyArray {
  dtype: "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32" | "float32" | "float64";
  shape: number[];
  data:
    | Int8Array
    | Uint8Array
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | Float32Array
    | Float64Array;
}

const NPY_DTYPES: Record<string, NpyArray["dtype"]> = {
  "|i1": "int8",
  "<i1": "int8",
  "|u1": "uint8",
  "<u1": "uint8",
  "<i2": "int16",
  "<u2": "uint16",
  "<i4": "int32",
  "<u4": "uint32",
  "<f4": "float32",
  "<f8": "float64",
};

/** Reads a little-endian, C-order NumPy `.npy` file (format 1.x, 2.x or 3.x). Returns null for anything else. */
export function parseNpy(bytes: Uint8Array): NpyArray | null {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x93 ||
    String.fromCharCode(...bytes.subarray(1, 6)) !== "NUMPY"
  ) {
    return null;
  }
  const major = bytes[6] ?? 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLen = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  const headerStart = major === 1 ? 10 : 12;
  const header = new TextDecoder("latin1").decode(
    bytes.subarray(headerStart, headerStart + headerLen),
  );
  const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1];
  const fortran = /'fortran_order':\s*(True|False)/.exec(header)?.[1];
  const shapeText = /'shape':\s*\(([^)]*)\)/.exec(header)?.[1];
  const dtype = descr ? NPY_DTYPES[descr] : undefined;
  if (!dtype || fortran !== "False" || shapeText === undefined) return null;
  const shape = shapeText
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number.parseInt(s, 10));
  if (shape.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const count = shape.reduce((a, b) => a * b, 1);
  const dataStart = headerStart + headerLen;
  // Copy so the typed array is aligned whatever the offset of the payload.
  const payload = bytes.slice(dataStart);
  const ctor = {
    int8: Int8Array,
    uint8: Uint8Array,
    int16: Int16Array,
    uint16: Uint16Array,
    int32: Int32Array,
    uint32: Uint32Array,
    float32: Float32Array,
    float64: Float64Array,
  }[dtype];
  if (payload.byteLength < count * ctor.BYTES_PER_ELEMENT) return null;
  return { dtype, shape, data: new ctor(payload.buffer, 0, count) };
}

/** MODIS sinusoidal sphere radius and the 250 m product's pixel size (36 tiles of 4800 pixels around the equator). */
export const MODIS_SPHERE_RADIUS_M = 6371007.181;
export const MODIS_250M_PIXEL_M = (2 * Math.PI * MODIS_SPHERE_RADIUS_M) / (36 * 4800);
export const MODIS_SINUSOIDAL_PROJ =
  "+proj=sinu +lon_0=0 +x_0=0 +y_0=0 +R=6371007.181 +units=m +no_defs";

export function lonLatToSinusoidal(lon: number, lat: number): [number, number] {
  const latRad = (lat * Math.PI) / 180;
  return [
    MODIS_SPHERE_RADIUS_M * ((lon * Math.PI) / 180) * Math.cos(latRad),
    MODIS_SPHERE_RADIUS_M * latRad,
  ];
}

export function sinusoidalToLonLat(x: number, y: number): [number, number] {
  const latRad = y / MODIS_SPHERE_RADIUS_M;
  const lon = (x / (MODIS_SPHERE_RADIUS_M * Math.cos(latRad))) * (180 / Math.PI);
  return [lon, (latRad * 180) / Math.PI];
}

export interface SinusoidalWindow {
  /** Left, bottom, right, top edges in sinusoidal metres, on pixel edges of the native grid. */
  bounds: [number, number, number, number];
  width: number;
  height: number;
}

/** The smallest window of native 250 m MODIS pixels that holds every corner of a lon/lat box. */
export function modisWindowForBbox(bbox: Bbox): SinusoidalWindow {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const corners = [
    lonLatToSinusoidal(minLon, minLat),
    lonLatToSinusoidal(minLon, maxLat),
    lonLatToSinusoidal(maxLon, minLat),
    lonLatToSinusoidal(maxLon, maxLat),
  ];
  const p = MODIS_250M_PIXEL_M;
  // Row edges fall every 1/480 degree of latitude, so a box edge can land on one; the tolerance keeps rounding
  // error from adding a row or column of pixels outside the box.
  const eps = 1e-9;
  const left = Math.floor(Math.min(...corners.map((c) => c[0])) / p + eps);
  const right = Math.ceil(Math.max(...corners.map((c) => c[0])) / p - eps);
  const bottom = Math.floor(Math.min(...corners.map((c) => c[1])) / p + eps);
  const top = Math.ceil(Math.max(...corners.map((c) => c[1])) / p - eps);
  return {
    bounds: [left * p, bottom * p, right * p, top * p],
    width: right - left,
    height: top - bottom,
  };
}

export interface StacItem {
  id: string;
  collection?: string;
  bbox?: number[];
  properties: Record<string, unknown>;
  assets?: Record<string, { href?: string }>;
}

/** Runs `task` over `inputs` with at most `limit` in flight, keeping input order in the result. */
export async function mapLimited<I, O>(
  inputs: readonly I[],
  limit: number,
  task: (input: I, index: number) => Promise<O>,
): Promise<O[]> {
  const out = new Array<O>(inputs.length);
  let next = 0;
  const worker = async () => {
    while (next < inputs.length) {
      const i = next++;
      out[i] = await task(inputs[i] as I, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, inputs.length)) }, worker));
  return out;
}

function errorReason(err: unknown, signal: AbortSignal | undefined): MissingReason {
  if (err instanceof LiveFetchError) return err.reason;
  if (signal?.aborted) return signal.reason === "timeout" ? "timeout" : "aborted";
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"))
    return "timeout";
  return "http_error";
}

/** Turns a thrown error into a missing value with a stated reason, never a fallback number. */
export function missingFrom(
  source: LiveSourceId,
  err: unknown,
  startedAt: number,
  signal?: AbortSignal,
): MissingValue {
  const reason = errorReason(err, signal);
  const detail = err instanceof Error ? err.message : String(err);
  return { status: "missing", source, reason, detail, elapsedMs: Date.now() - startedAt };
}

/** Parallel data API requests per place (lead, 2 Nov): enough for a start, polite to a free service. */
export const PC_CONCURRENCY = 16;

const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const RETRY_DELAYS_MS = [500, 1000, 2000];

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Fetches with up to three retries on HTTP 429, 502 to 504 and dropped connections, waiting 0.5, 1 and 2 s or the
 * server's Retry-After (at most 4 s). Any other status is returned as is; an abort, or a failure that outlasts the
 * retries, throws.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: LiveFetchOptions = {},
): Promise<Response> {
  const doFetch = opts.fetchImpl ?? fetch;
  const withSignal = opts.signal ? { ...init, signal: opts.signal } : init;
  for (let attempt = 0; ; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt];
    let res: Response;
    try {
      res = await doFetch(url, withSignal);
    } catch (err) {
      // A dropped connection is retried like a 503; an abort is not.
      if (opts.signal?.aborted || delay === undefined) throw err;
      await sleep(delay, opts.signal);
      continue;
    }
    if (!RETRY_STATUSES.has(res.status) || delay === undefined) return res;
    const retryAfter = Number.parseFloat(res.headers.get("retry-after") ?? "");
    const wait = Number.isFinite(retryAfter)
      ? Math.min(4000, Math.max(0, retryAfter * 1000))
      : delay;
    await res.body?.cancel().catch(() => undefined);
    await sleep(wait, opts.signal);
  }
}

/** One page of STAC search results (up to `limit`, which the API caps at 1000). Sorting is client side: the API ignores `sortby`. */
export async function stacSearch(
  body: Record<string, unknown>,
  opts: LiveFetchOptions = {},
): Promise<StacItem[]> {
  const res = await fetchWithRetry(
    PC_STAC_SEARCH,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Siterra/1.0",
      },
      body: JSON.stringify(body),
    },
    opts,
  );
  if (!res.ok) throw new LiveFetchError("http_error", `STAC search returned HTTP ${res.status}.`);
  const json = (await res.json()) as { features?: StacItem[] };
  return Array.isArray(json.features) ? json.features : [];
}

export interface NpyCropRequest {
  collection: string;
  item: string;
  assets: string[];
  /** Left, bottom, right, top; in `crs` units. */
  bounds: [number, number, number, number];
  /** PROJ string or EPSG code of `bounds` and of the output grid; omitted means lon/lat in and out. */
  crs?: string;
  width?: number;
  height?: number;
  resampling?: "nearest" | "bilinear";
}

export function npyCropUrl(req: NpyCropRequest): string {
  const [l, b, r, t] = req.bounds;
  const size = req.width && req.height ? `/${req.width}x${req.height}` : "";
  const params = new URLSearchParams({ collection: req.collection, item: req.item });
  for (const a of req.assets) params.append("assets", a);
  if (req.crs) {
    params.set("coord_crs", req.crs);
    params.set("dst_crs", req.crs);
  }
  if (req.resampling) {
    params.set("resampling", req.resampling);
    params.set("reproject", req.resampling);
  }
  return `${PC_DATA_ITEM}/bbox/${l},${b},${r},${t}${size}.npy?${params.toString()}`;
}

/** Fetches one raw crop from the data API and decodes it. */
export async function fetchNpyCrop(
  req: NpyCropRequest,
  opts: LiveFetchOptions = {},
): Promise<NpyArray> {
  const res = await fetchWithRetry(npyCropUrl(req), {}, opts);
  if (!res.ok) {
    throw new LiveFetchError(
      "http_error",
      `Data API crop of ${req.item} returned HTTP ${res.status}.`,
    );
  }
  const arr = parseNpy(new Uint8Array(await res.arrayBuffer()));
  if (!arr)
    throw new LiveFetchError(
      "decode_failed",
      `Data API crop of ${req.item} was not a readable .npy array.`,
    );
  return arr;
}

/** An abort signal that fires on the caller's signal or after `timeoutMs`, with reason "timeout" for the latter. */
export function withTimeout(
  timeoutMs: number,
  outer?: AbortSignal,
): { signal: AbortSignal; clear: () => void } {
  const ac = new AbortController();
  const timer = setTimeout(() => {
    ac.abort("timeout");
  }, timeoutMs);
  const onOuter = () => {
    ac.abort(outer?.reason ?? "aborted");
  };
  if (outer) {
    if (outer.aborted) onOuter();
    else outer.addEventListener("abort", onOuter, { once: true });
  }
  return {
    signal: ac.signal,
    clear: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuter);
    },
  };
}
