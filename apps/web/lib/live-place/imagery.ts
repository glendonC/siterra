/**
 * A true-colour Sentinel-2 L2A image of a live place for the 3D land: the clearest acquisition of the last year,
 * judged inside the place's box by the scene classification band (SCL), not by the whole granule's cloud figure.
 * The image is a picture of one day, not a measurement; it carries its date, its cloud share and the Copernicus notice.
 */
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

export const IMAGERY_METHOD = { id: "live_true_colour", version: "1.0.0" } as const;

const COLLECTION = "sentinel-2-l2a";
const SCL_GRID = 64;
const MAX_CANDIDATES = 12;
const MAX_NO_DATA_SHARE = 0.01;
/** SCL classes counted as not seeing the ground: cloud shadow, cloud medium and high probability, thin cirrus. */
const SCL_CLOUD = new Set([3, 8, 9, 10]);

export interface TrueColourImage {
  itemIds: string[];
  /** Acquisition time of the first item, ISO 8601. */
  datetime: string;
  platform: string;
  /** Largest granule-wide cloud cover among the items, percent, as the STAC records state it. */
  sceneCloudPct: number;
  /** Cloud and cloud shadow inside the box from the scene classification band, percent of the box. */
  boxCloudPct: number;
  bbox: Bbox;
  width: number;
  height: number;
  /** Row 0 north, 4 bytes per pixel; alpha 0 where the scene has no data. */
  rgba: Uint8Array;
  png: Uint8Array;
  attribution: string;
  /** How the image was chosen, as a sentence for the sources panel. */
  selection: string;
}

interface Acquisition {
  key: string;
  datetime: string;
  platform: string;
  itemIds: string[];
  sceneCloudPct: number;
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

/** Cloud and no-data shares of a box from merged SCL samples (0 means no data). */
export function sclShares(classes: Uint8Array): { cloud: number; noData: number } {
  let cloud = 0;
  let noData = 0;
  for (const c of classes) {
    if (c === 0) noData++;
    else if (SCL_CLOUD.has(c)) cloud++;
  }
  const n = Math.max(1, classes.length);
  return { cloud: cloud / n, noData: noData / n };
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

/**
 * Finds the clearest Sentinel-2 L2A acquisition of the last `lookbackDays` over the box and returns its true-colour
 * image. Candidates are the acquisitions with the lowest granule cloud cover; each is scored on its SCL band inside
 * the box, and one with more than 1% of the box unseen (no data) is not used. Ties go to the most recent.
 */
export async function fetchTrueColour(
  bbox: Bbox,
  opts: LiveFetchOptions & {
    size?: number;
    lookbackDays?: number;
    maxSceneCloudPct?: number;
    maxCandidates?: number;
  } = {},
): Promise<LiveResult<TrueColourImage>> {
  const startedAt = Date.now();
  const now = opts.now?.() ?? new Date();
  const size = opts.size ?? 1024;
  const lookbackDays = opts.lookbackDays ?? 365;
  const maxSceneCloud = opts.maxSceneCloudPct ?? 20;
  const t = withTimeout(opts.timeoutMs ?? 20_000, opts.signal);
  const inner: LiveFetchOptions = { ...opts, signal: t.signal };
  try {
    const since = new Date(now.getTime() - lookbackDays * 86_400_000).toISOString();
    const items = await stacSearch(
      {
        collections: [COLLECTION],
        bbox,
        datetime: `${since}/${now.toISOString()}`,
        query: { "eo:cloud_cover": { lt: maxSceneCloud } },
        limit: 1000,
      },
      inner,
    );
    const candidates = groupAcquisitions(items).slice(0, opts.maxCandidates ?? MAX_CANDIDATES);
    if (candidates.length === 0) {
      throw new LiveFetchError(
        "no_items",
        `No Sentinel-2 L2A scene under ${maxSceneCloud}% cloud covers this place in the last ${lookbackDays} days.`,
      );
    }

    const scored = await mapLimited(candidates, opts.concurrency ?? PC_CONCURRENCY, async (acq) => {
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
    });
    const usable = scored
      .filter((s) => s.noData <= MAX_NO_DATA_SHARE)
      .sort((a, b) => a.cloud - b.cloud || b.acq.datetime.localeCompare(a.acq.datetime));
    const best = usable[0];
    if (!best) {
      throw new LiveFetchError(
        "coverage_below_threshold",
        `None of the ${scored.length} clearest Sentinel-2 acquisitions covers the whole place.`,
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
    const image: TrueColourImage = {
      itemIds: best.acq.itemIds,
      datetime: best.acq.datetime,
      platform: best.acq.platform,
      sceneCloudPct: Number(best.acq.sceneCloudPct.toFixed(2)),
      boxCloudPct: Number((best.cloud * 100).toFixed(2)),
      bbox,
      width,
      height,
      rgba,
      png: png ?? encodeRgbaPng(width, height, rgba),
      attribution: `Contains modified Copernicus Sentinel data ${best.acq.datetime.slice(0, 4)}`,
      selection: `The clearest of the ${scored.length} least cloudy Sentinel-2 acquisitions of the last ${lookbackDays} days, judged by cloud and cloud shadow inside the place on the scene classification band.`,
    };
    const day = best.acq.datetime.slice(0, 10);
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
