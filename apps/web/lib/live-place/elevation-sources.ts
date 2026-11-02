/**
 * Elevation of a live place from the best open model that covers all of it: USGS 3DEP 1/3 arc-second bare earth in
 * the United States, otherwise Copernicus DEM GLO-30 (a surface model that includes buildings and trees). When
 * neither covers the place the result is missing with the reason, and the terrain builder's Terrarium tiles remain
 * the fallback there, named by its own `elevationSource`.
 */
import {
  type Bbox,
  type LiveFetchOptions,
  type LiveResult,
  type LiveSourceId,
  type StacItem,
  LiveFetchError,
  PC_CONCURRENCY,
  fetchNpyCrop,
  mapLimited,
  missingFrom,
  stacSearch,
  withTimeout,
} from "./planetary.ts";

export const ELEVATION_METHOD = { id: "live_elevation", version: "1.0.0" } as const;

const MAX_NO_READING_SHARE = 0.01;
/** GLO-30 flattens water near 0 m, so a 3DEP gap where GLO-30 reads at or below this is taken as sea or shore. */
export const SEA_LEVEL_TOLERANCE_M = 1;

export type ElevationSourceId = Extract<LiveSourceId, "3dep-seamless" | "cop-dem-glo-30">;

export interface ElevationGrid {
  source: ElevationSourceId;
  /** 3DEP is bare earth; GLO-30 is a surface model with buildings and tree tops. */
  surface: "bare_earth" | "surface_model";
  /** Coarsest item resolution in the mosaic, metres. */
  nominalResolutionM: number;
  verticalDatum: string;
  bbox: Bbox;
  width: number;
  height: number;
  /** Row 0 north, metres; NaN where no reading. */
  elevationsM: Float32Array;
  noReadingShare: number;
  /**
   * Share of the grid where 3DEP has no reading and GLO-30 reads at or below 1 m, so the gap is sea, not land
   * (3DEP leaves the ocean empty). Null when no check was needed.
   */
  noReadingAtSeaShare: number | null;
  minM: number;
  maxM: number;
  itemIds: string[];
  /** Each source tried, in order, with what happened. */
  tried: { source: ElevationSourceId; outcome: string }[];
  attribution: string;
}

interface SourceSpec {
  id: ElevationSourceId;
  surface: ElevationGrid["surface"];
  verticalDatum: string;
  attribution: string;
  /** The items to mosaic: one per 1 degree cell, finest available. */
  pick: (items: readonly StacItem[]) => { ids: string[]; resolutionM: number };
}

function gsdOf(item: StacItem): number {
  const g = item.properties.gsd;
  return typeof g === "number" ? g : 30;
}

const SOURCES: readonly SourceSpec[] = [
  {
    id: "3dep-seamless",
    surface: "bare_earth",
    // From the item metadata: NAVD 88 over the conterminous United States; "the vertical reference will vary in
    // other areas".
    verticalDatum:
      "NAVD 88 over the conterminous United States; varies in other areas (USGS metadata)",
    attribution: "Elevation: USGS 3D Elevation Program",
    pick: (items) => {
      // Item IDs are <cell>-13 (1/3 arc-second) and <cell>-1 (1 arc-second); keep the finest per cell.
      const byCell = new Map<string, StacItem>();
      for (const it of items) {
        const cell = it.id.replace(/-\d+$/, "");
        const prev = byCell.get(cell);
        if (!prev || gsdOf(it) < gsdOf(prev)) byCell.set(cell, it);
      }
      const picked = [...byCell.values()];
      return { ids: picked.map((i) => i.id).sort(), resolutionM: Math.max(...picked.map(gsdOf)) };
    },
  },
  {
    id: "cop-dem-glo-30",
    surface: "surface_model",
    verticalDatum: "EGM2008 geoid (OpenTopography dataset page)",
    attribution:
      "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
    pick: (items) => ({ ids: items.map((i) => i.id).sort(), resolutionM: 30 }),
  },
];

/** Merges float crops (value band then mask band) into one grid: the first item with a reading wins per pixel. */
export function mosaicElevation(
  crops: readonly { shape: number[]; data: ArrayLike<number> }[],
  width: number,
  height: number,
): Float32Array {
  const n = width * height;
  const out = new Float32Array(n).fill(Number.NaN);
  for (const crop of crops) {
    const [bands, h, w] = crop.shape;
    if (bands !== 2 || h !== height || w !== width) {
      throw new LiveFetchError(
        "decode_failed",
        `Elevation crop came back ${crop.shape.join(" x ")}, expected 2 x ${height} x ${width}.`,
      );
    }
    for (let i = 0; i < n; i++) {
      if (!Number.isNaN(out[i] ?? Number.NaN)) continue;
      const v = crop.data[i] ?? Number.NaN;
      if ((crop.data[n + i] ?? 0) !== 0 && Number.isFinite(v)) out[i] = v;
    }
  }
  return out;
}

interface SourceRead {
  spec: SourceSpec;
  items: StacItem[];
  ids: string[];
  resolutionM: number;
  elevationsM: Float32Array;
  missing: number;
}

async function readSource(
  spec: SourceSpec,
  bbox: Bbox,
  size: number,
  opts: LiveFetchOptions,
): Promise<SourceRead | null> {
  const items = await stacSearch({ collections: [spec.id], bbox, limit: 50 }, opts);
  if (items.length === 0) return null;
  const { ids, resolutionM } = spec.pick(items);
  const crops = await mapLimited(ids, opts.concurrency ?? PC_CONCURRENCY, (id) =>
    fetchNpyCrop(
      {
        collection: spec.id,
        item: id,
        assets: ["data"],
        bounds: bbox,
        width: size,
        height: size,
        resampling: "bilinear",
      },
      opts,
    ),
  );
  const elevationsM = mosaicElevation(crops, size, size);
  const missing = elevationsM.reduce((a, v) => a + (Number.isNaN(v) ? 1 : 0), 0);
  return { spec, items, ids, resolutionM, elevationsM, missing };
}

/** Share of cells where `gappy` has no reading and `reference` reads at or below 1 m (sea), and where it reads above. */
export function classifyGaps(
  gappy: Float32Array,
  reference: Float32Array,
): { atSea: number; onLand: number } {
  let atSea = 0;
  let onLand = 0;
  for (let i = 0; i < gappy.length; i++) {
    if (!Number.isNaN(gappy[i] ?? Number.NaN)) continue;
    const r = reference[i] ?? Number.NaN;
    if (Number.isFinite(r) && r <= SEA_LEVEL_TOLERANCE_M) atSea++;
    else onLand++;
  }
  const n = Math.max(1, gappy.length);
  return { atSea: atSea / n, onLand: onLand / n };
}

/**
 * Tries 3DEP, then GLO-30, keeping the first that reads at least 99% of the land in the box at `size` x `size`
 * (bilinear, north-up lon/lat). 3DEP gaps where GLO-30 reads at or below 1 m count as sea and stay without a reading.
 * Returns a missing value naming every source tried when neither covers the place.
 */
export async function fetchElevation(
  bbox: Bbox,
  size = 256,
  opts: LiveFetchOptions = {},
): Promise<LiveResult<ElevationGrid>> {
  const startedAt = Date.now();
  const now = opts.now?.() ?? new Date();
  const t = withTimeout(opts.timeoutMs ?? 15_000, opts.signal);
  const inner: LiveFetchOptions = { ...opts, signal: t.signal };
  const tried: ElevationGrid["tried"] = [];
  const reads = new Map<ElevationSourceId, SourceRead | null>();
  const read = async (spec: SourceSpec) => {
    if (!reads.has(spec.id)) reads.set(spec.id, await readSource(spec, bbox, size, inner));
    return reads.get(spec.id) ?? null;
  };
  try {
    for (const spec of SOURCES) {
      const got = await read(spec);
      if (!got) {
        tried.push({ source: spec.id, outcome: "no item covers the place" });
        continue;
      }
      const n = got.elevationsM.length;
      let noReadingAtSeaShare: number | null = null;
      let landGapShare = got.missing / n;
      if (landGapShare > MAX_NO_READING_SHARE && spec.id === "3dep-seamless") {
        const glo = SOURCES.find((s) => s.id === "cop-dem-glo-30");
        const ref = glo ? await read(glo) : null;
        if (ref) {
          const gaps = classifyGaps(got.elevationsM, ref.elevationsM);
          noReadingAtSeaShare = Number(gaps.atSea.toFixed(4));
          landGapShare = gaps.onLand;
        }
      }
      if (landGapShare > MAX_NO_READING_SHARE) {
        tried.push({
          source: spec.id,
          outcome: `${(landGapShare * 100).toFixed(1)}% of the land in the place has no reading`,
        });
        continue;
      }
      tried.push({ source: spec.id, outcome: "used" });
      let min = Infinity;
      let max = -Infinity;
      for (const v of got.elevationsM) {
        if (Number.isNaN(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      return {
        status: "measured",
        value: {
          source: spec.id,
          surface: spec.surface,
          nominalResolutionM: got.resolutionM,
          verticalDatum: spec.verticalDatum,
          bbox,
          width: size,
          height: size,
          elevationsM: got.elevationsM,
          noReadingShare: Number((got.missing / n).toFixed(4)),
          noReadingAtSeaShare,
          minM: Number(min.toFixed(2)) + 0,
          maxM: Number(max.toFixed(2)),
          itemIds: got.ids,
          tried,
          attribution: spec.attribution,
        },
        provenance: {
          source: spec.id,
          items: got.ids,
          window: dateWindow(got.items.filter((i) => got.ids.includes(i.id))),
          method: { ...ELEVATION_METHOD },
          retrievedAt: now.toISOString(),
          elapsedMs: Date.now() - startedAt,
        },
      };
    }
    throw new LiveFetchError(
      "outside_coverage",
      `No open elevation model on Planetary Computer covers the land of the whole place (${tried
        .map((x) => `${x.source}: ${x.outcome}`)
        .join("; ")}).`,
    );
  } catch (err) {
    return missingFrom(
      tried[tried.length - 1]?.source ?? "3dep-seamless",
      err,
      startedAt,
      t.signal,
    );
  } finally {
    t.clear();
  }
}

function dateWindow(items: readonly StacItem[]): { start: string; end: string } {
  const dates = items
    .map((i) => i.properties.datetime)
    .filter((d): d is string => typeof d === "string")
    .map((d) => d.slice(0, 10))
    .sort();
  return { start: dates[0] ?? "", end: dates[dates.length - 1] ?? "" };
}
