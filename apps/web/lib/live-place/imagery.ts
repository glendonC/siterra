/**
 * A true-colour Sentinel-2 L2A image of a live place for the 3D land: prefers a snow-free acquisition in the place's
 * growing season (the MODIS vegetation window and SCL class 11 snow inside the box), and falls back to the clearest
 * acquisition of the year only when none in the growing window qualifies. The image is a picture of one day, not a
 * measurement; it carries the rule that chose it, its date, its cloud and snow shares, and the Copernicus notice.
 */
import { cachedLive, liveCacheKey, readLiveCache, writeLiveCache } from "./live-cache.ts";
import {
  type Bbox,
  type LiveFetchOptions,
  type LiveResult,
  type StacItem,
  LiveFetchError,
  PC_CONCURRENCY,
  PC_DATA_ITEM,
  fetchNpyCrop,
  fetchWithRetry,
  mapLimited,
  missingFrom,
  stacSearch,
  withTimeout,
} from "./planetary.ts";
import { decodePngRgba, encodeRgbaPng } from "./satellite-fetcher.ts";
import {
  type SeasonWindow,
  type VegetationSeries,
  VEGETATION_METHOD,
  fetchGrowingWindow,
  windowLabel,
} from "./vegetation-series.ts";

export const IMAGERY_METHOD = { id: "live_true_colour", version: "1.0.0" } as const;

const COLLECTION = "sentinel-2-l2a";
const SCL_GRID = 64;
const MAX_CANDIDATES = 12;
const MAX_NO_DATA_SHARE = 0.01;
const MAX_SNOW_SHARE = 0.01;
const MAX_GROWING_CLOUD_SHARE = 0.25;
/** SCL classes counted as not seeing the ground: cloud shadow, cloud medium and high probability, thin cirrus. */
const SCL_CLOUD = new Set([3, 8, 9, 10]);
/** SCL class 11: snow or ice. */
const SCL_SNOW = 11;

export type TrueColourSelectionRule = "growing_season_snow_free" | "year_clearest_fallback";

export interface TrueColourImage {
  itemIds: string[];
  /** Acquisition time of the first item, ISO 8601. */
  datetime: string;
  /** Acquisition date, YYYY-MM-DD. */
  date: string;
  platform: string;
  /** Largest granule-wide cloud cover among the items, percent, as the STAC records state it. */
  sceneCloudPct: number;
  /** Cloud and cloud shadow inside the box from the scene classification band, percent of the box. */
  boxCloudPct: number;
  /** Snow and ice (SCL class 11) inside the box from the scene classification band, percent of the box. */
  boxSnowPct: number;
  /** Growing-season calendar months (1 to 12) checked first, or null when no growing window was available. */
  seasonMonths: number[] | null;
  /** Which rule chose the scene: a snow-free scene in the growing season, or the clearest of the year as fallback. */
  selectionRule: TrueColourSelectionRule;
  bbox: Bbox;
  width: number;
  height: number;
  /** Row 0 north, 4 bytes per pixel; alpha 0 where the scene has no data. */
  rgba: Uint8Array;
  png: Uint8Array;
  attribution: string;
  /** How the image was chosen, with the rule and date, as a sentence for the sources panel. */
  selection: string;
}

export interface TrueColourOptions extends LiveFetchOptions {
  size?: number;
  lookbackDays?: number;
  maxSceneCloudPct?: number;
  maxCandidates?: number;
  /** Growing-season calendar months (1 to 12); when omitted, resolved from the place's MODIS growing window. */
  seasonMonths?: readonly number[] | null;
  cacheDir?: string;
}

interface Acquisition {
  key: string;
  datetime: string;
  platform: string;
  itemIds: string[];
  sceneCloudPct: number;
}

interface ScoredAcquisition {
  acq: Acquisition;
  cloud: number;
  snow: number;
  noData: number;
}

function monthOf(datetime: string): number {
  return Number.parseInt(datetime.slice(5, 7), 10);
}

/** Items of one platform on one day and orbit are one acquisition split across MGRS tiles. */
export function groupAcquisitions(items: readonly StacItem[]): Acquisition[] {
  const groups = new Map<string, Acquisition>();
  for (const it of items) {
    const dt = it.properties.datetime;
    if (typeof dt !== "string") continue;
    const platform =
      typeof it.properties.platform === "string" ? it.properties.platform : "Sentinel-2";
    const orbit = it.properties["sat:relative_orbit"];
    const cloud = it.properties["eo:cloud_cover"];
    const key = `${platform}|${dt.slice(0, 10)}|${typeof orbit === "number" ? orbit : ""}`;
    const g = groups.get(key) ?? { key, datetime: dt, platform, itemIds: [], sceneCloudPct: 0 };
    g.itemIds.push(it.id);
    g.sceneCloudPct = Math.max(g.sceneCloudPct, typeof cloud === "number" ? cloud : 100);
    if (dt < g.datetime) g.datetime = dt;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, itemIds: g.itemIds.sort() }))
    .sort((a, b) => a.sceneCloudPct - b.sceneCloudPct || b.datetime.localeCompare(a.datetime));
}

/** Cloud, snow (SCL class 11) and no-data shares of a box from merged SCL samples (0 means no data). */
export function sclShares(classes: Uint8Array): { cloud: number; snow: number; noData: number } {
  let cloud = 0;
  let snow = 0;
  let noData = 0;
  for (const c of classes) {
    if (c === 0) noData++;
    else if (SCL_CLOUD.has(c)) cloud++;
    else if (c === SCL_SNOW) snow++;
  }
  const n = Math.max(1, classes.length);
  return { cloud: cloud / n, snow: snow / n, noData: noData / n };
}

function rgbaCropUrl(item: string, bbox: Bbox, width: number, height: number): string {
  const params = new URLSearchParams({ collection: COLLECTION, item, assets: "visual" });
  params.set("asset_bidx", "visual|1,2,3");
  return `${PC_DATA_ITEM}/bbox/${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}/${width}x${height}.png?${params.toString()}`;
}

/** The output size in pixels: `size` on the longer side, keeping the box's ground aspect. */
export function imageSize(bbox: Bbox, size: number): { width: number; height: number } {
  const midLat = ((bbox[1] + bbox[3]) / 2) * (Math.PI / 180);
  const w = (bbox[2] - bbox[0]) * Math.cos(midLat);
  const h = bbox[3] - bbox[1];
  return w >= h
    ? { width: size, height: Math.max(1, Math.round((size * h) / w)) }
    : { width: Math.max(1, Math.round((size * w) / h)), height: size };
}

async function resolveSeasonMonths(
  bbox: Bbox,
  opts: TrueColourOptions,
  now: Date,
): Promise<number[] | null> {
  if (opts.seasonMonths !== undefined) {
    return opts.seasonMonths && opts.seasonMonths.length > 0 ? [...opts.seasonMonths] : null;
  }
  const useDiskCache = opts.cacheDir !== undefined || !opts.fetchImpl;
  const vegKey = liveCacheKey(bbox, undefined, VEGETATION_METHOD.version);
  if (useDiskCache) {
    const cachedSeries = readLiveCache<VegetationSeries>("vegetation", vegKey, opts.cacheDir);
    if (cachedSeries?.value.window.months.length) {
      return [...cachedSeries.value.window.months];
    }
    const cachedWindow = readLiveCache<SeasonWindow>("vegetation-window", vegKey, opts.cacheDir);
    if (cachedWindow?.value.months.length) {
      return [...cachedWindow.value.months];
    }
  }
  const window = await fetchGrowingWindow(bbox, opts);
  if (window && useDiskCache) {
    try {
      writeLiveCache(
        "vegetation-window",
        vegKey,
        {
          status: "measured",
          value: window,
          provenance: {
            source: "modis-13Q1-061",
            items: [],
            window: { start: "2003-01-01", end: "2021-12-31" },
            method: { ...VEGETATION_METHOD },
            retrievedAt: now.toISOString(),
            elapsedMs: 0,
          },
        },
        opts.cacheDir,
      );
    } catch {
      // Ignoring a cache write failure keeps the image fetch moving.
    }
  }
  return window ? [...window.months] : null;
}

/**
 * Finds the clearest Sentinel-2 L2A acquisition of the last `lookbackDays` over the box and returns its true-colour
 * image. Prefers a snow-free acquisition (at most 1% SCL class 11 snow and 25% cloud in the box) in the place's
 * growing season; falls back to the clearest acquisition of the year only when none in the growing window qualifies.
 */
export async function fetchTrueColour(
  bbox: Bbox,
  opts: TrueColourOptions = {},
): Promise<LiveResult<TrueColourImage>> {
  const startedAt = Date.now();
  const now = opts.now?.() ?? new Date();
  const size = opts.size ?? 1024;
  const lookbackDays = opts.lookbackDays ?? 365;
  const maxSceneCloud = opts.maxSceneCloudPct ?? 20;
  const maxCandidates = opts.maxCandidates ?? MAX_CANDIDATES;
  const t = withTimeout(opts.timeoutMs ?? 20_000, opts.signal);
  const inner: TrueColourOptions = { ...opts, signal: t.signal };
  try {
    const since = new Date(now.getTime() - lookbackDays * 86_400_000).toISOString();
    const [items, seasonMonths] = await Promise.all([
      stacSearch(
        {
          collections: [COLLECTION],
          bbox,
          datetime: `${since}/${now.toISOString()}`,
          query: { "eo:cloud_cover": { lt: maxSceneCloud } },
          limit: 1000,
        },
        inner,
      ),
      resolveSeasonMonths(bbox, inner, now),
    ]);
    const allAcqs = groupAcquisitions(items);
    if (allAcqs.length === 0) {
      throw new LiveFetchError(
        "no_items",
        `No Sentinel-2 L2A scene under ${maxSceneCloud}% cloud covers this place in the last ${lookbackDays} days.`,
      );
    }

    const scoredByKey = new Map<string, ScoredAcquisition>();
    const scoreBatch = async (batch: readonly Acquisition[]): Promise<ScoredAcquisition[]> => {
      const todo = batch.filter((a) => !scoredByKey.has(a.key));
      if (todo.length > 0) {
        const freshlyScored = await mapLimited(
          todo,
          opts.concurrency ?? PC_CONCURRENCY,
          async (acq) => {
            const merged = new Uint8Array(SCL_GRID * SCL_GRID);
            const crops = await Promise.all(
              acq.itemIds.map((id) =>
                fetchNpyCrop(
                  {
                    collection: COLLECTION,
                    item: id,
                    assets: ["SCL"],
                    bounds: bbox,
                    width: SCL_GRID,
                    height: SCL_GRID,
                    resampling: "nearest",
                  },
                  inner,
                ).then((arr) => ({ id, arr })),
              ),
            );
            for (const { id, arr } of crops) {
              const n = SCL_GRID * SCL_GRID;
              if (arr.shape[0] !== 2 || arr.data.length < 2 * n) {
                throw new LiveFetchError(
                  "decode_failed",
                  `SCL crop of ${id} came back ${arr.shape.join(" x ")}.`,
                );
              }
              for (let i = 0; i < n; i++) {
                if (merged[i] === 0 && (arr.data[n + i] ?? 0) !== 0) merged[i] = arr.data[i] ?? 0;
              }
            }
            return { acq, ...sclShares(merged) };
          },
        );
        for (const s of freshlyScored) scoredByKey.set(s.acq.key, s);
      }
      return batch
        .map((a) => scoredByKey.get(a.key))
        .filter((s): s is ScoredAcquisition => s !== undefined);
    };

    let best: ScoredAcquisition | undefined;
    let selectionRule: TrueColourSelectionRule = "year_clearest_fallback";
    let inSeasonScoredCount = 0;

    if (seasonMonths && seasonMonths.length > 0) {
      const seasonSet = new Set(seasonMonths);
      const inSeason = allAcqs
        .filter((a) => seasonSet.has(monthOf(a.datetime)))
        .slice(0, maxCandidates);
      const scoredInSeason = await scoreBatch(inSeason);
      inSeasonScoredCount = scoredInSeason.length;
      const qualifying = scoredInSeason
        .filter(
          (s) =>
            s.noData <= MAX_NO_DATA_SHARE &&
            s.snow <= MAX_SNOW_SHARE &&
            s.cloud <= MAX_GROWING_CLOUD_SHARE,
        )
        .sort(
          (a, b) =>
            a.cloud - b.cloud || a.snow - b.snow || b.acq.datetime.localeCompare(a.acq.datetime),
        );
      if (qualifying[0]) {
        best = qualifying[0];
        selectionRule = "growing_season_snow_free";
      }
    }

    if (!best) {
      await scoreBatch(allAcqs.slice(0, maxCandidates));
      const usable = [...scoredByKey.values()]
        .filter((s) => s.noData <= MAX_NO_DATA_SHARE)
        .sort(
          (a, b) =>
            Number(a.snow > MAX_SNOW_SHARE) - Number(b.snow > MAX_SNOW_SHARE) ||
            a.cloud - b.cloud ||
            a.snow - b.snow ||
            b.acq.datetime.localeCompare(a.acq.datetime),
        );
      best = usable[0];
      selectionRule = "year_clearest_fallback";
    }

    if (!best) {
      throw new LiveFetchError(
        "coverage_below_threshold",
        `None of the ${scoredByKey.size} clearest Sentinel-2 acquisitions covers the whole place.`,
      );
    }

    const { width, height } = imageSize(bbox, size);
    let rgba: Uint8Array | null = null;
    let png: Uint8Array | null = null;
    const pngs = await Promise.all(
      best.acq.itemIds.map(async (id) => {
        const res = await fetchWithRetry(rgbaCropUrl(id, bbox, width, height), {}, inner);
        if (!res.ok) {
          throw new LiveFetchError(
            "http_error",
            `True-colour crop of ${id} returned HTTP ${res.status}.`,
          );
        }
        return { id, bytes: new Uint8Array(await res.arrayBuffer()) };
      }),
    );
    for (const { id, bytes } of pngs) {
      const decoded = decodePngRgba(bytes);
      if (!decoded || decoded.width !== width || decoded.height !== height) {
        throw new LiveFetchError(
          "decode_failed",
          `True-colour crop of ${id} was not a ${width} x ${height} PNG.`,
        );
      }
      if (!rgba) {
        rgba = decoded.data;
        png = bytes;
      } else {
        for (let i = 0; i < width * height; i++) {
          if ((rgba[i * 4 + 3] ?? 0) === 0 && (decoded.data[i * 4 + 3] ?? 0) !== 0) {
            rgba.set(decoded.data.subarray(i * 4, i * 4 + 4), i * 4);
          }
        }
        png = null;
      }
    }
    if (!rgba) throw new LiveFetchError("no_items", "The chosen acquisition has no items.");
    const day = best.acq.datetime.slice(0, 10);
    const boxCloudPct = Number((best.cloud * 100).toFixed(2));
    const boxSnowPct = Number((best.snow * 100).toFixed(2));
    const selection =
      selectionRule === "growing_season_snow_free" && seasonMonths
        ? `Chosen by the snow-free growing-season rule (${windowLabel(seasonMonths)} window, at most 1% snow and 25% cloud in the box on the scene classification band) on ${day}: clearest of ${inSeasonScoredCount} growing-season Sentinel-2 acquisitions in the last ${lookbackDays} days (${boxCloudPct}% cloud, ${boxSnowPct}% snow in the box).`
        : seasonMonths
          ? `Chosen by the clearest-of-year fallback on ${day}: none of the ${inSeasonScoredCount} Sentinel-2 acquisitions in the ${windowLabel(seasonMonths)} growing window met the snow-free and cloud thresholds, so the clearest of ${scoredByKey.size} acquisitions of the last ${lookbackDays} days was used (${boxCloudPct}% cloud, ${boxSnowPct}% snow in the box).`
          : `Chosen by the clearest-of-year fallback on ${day}: the clearest of ${scoredByKey.size} Sentinel-2 acquisitions of the last ${lookbackDays} days, judged by cloud, shadow and snow inside the place on the scene classification band (${boxCloudPct}% cloud, ${boxSnowPct}% snow in the box).`;

    const image: TrueColourImage = {
      itemIds: best.acq.itemIds,
      datetime: best.acq.datetime,
      date: day,
      platform: best.acq.platform,
      sceneCloudPct: Number(best.acq.sceneCloudPct.toFixed(2)),
      boxCloudPct,
      boxSnowPct,
      seasonMonths,
      selectionRule,
      bbox,
      width,
      height,
      rgba,
      png: png ?? encodeRgbaPng(width, height, rgba),
      attribution: `Contains modified Copernicus Sentinel data ${best.acq.datetime.slice(0, 4)}`,
      selection,
    };
    return {
      status: "measured",
      value: image,
      provenance: {
        source: COLLECTION,
        items: best.acq.itemIds,
        window: { start: day, end: day },
        method: { ...IMAGERY_METHOD },
        retrievedAt: now.toISOString(),
        elapsedMs: Date.now() - startedAt,
      },
    };
  } catch (err) {
    return missingFrom(COLLECTION, err, startedAt, t.signal);
  } finally {
    t.clear();
  }
}

/**
 * Fetches or reads from cache the true-colour Sentinel-2 image of a place, storing the PNG bytes in `<key>.png`
 * beside a small `<key>.json` metadata file.
 */
export async function cachedTrueColour(
  bbox: Bbox,
  opts: TrueColourOptions = {},
): Promise<LiveResult<TrueColourImage>> {
  const seasonRing = opts.seasonMonths ? opts.seasonMonths.map((m) => [m, 0] as const) : undefined;
  const key = liveCacheKey(bbox, seasonRing, IMAGERY_METHOD.version);
  return cachedLive("imagery", key, () => fetchTrueColour(bbox, opts), opts.cacheDir);
}
