/**
 * Land cover of a live place for every year of Impact Observatory's 10 m annual map (io-lulc-annual-v02, 2017 to
 * 2023), and where the class changed between the first and the last year. Read as nearest-neighbour samples on a
 * fixed lon/lat grid through the Planetary Computer data API, so every year is sampled at the same points.
 */
import {
  type Bbox,
  type LiveFetchOptions,
  type LiveResult,
  type NpyArray,
  type Ring,
  type StacItem,
  LiveFetchError,
  PC_CONCURRENCY,
  fetchNpyCrop,
  lonLatGridMask,
  mapLimited,
  missingFrom,
  stacSearch,
  withTimeout,
} from "./planetary.ts";

export const LANDCOVER_METHOD = { id: "live_landcover_change", version: "1.0.0" } as const;

const COLLECTION = "io-lulc-annual-v02";
/** Sample grid per side: about 39 m between points on a 20 km box. */
export const LANDCOVER_GRID = 512;

export type IoClass =
  | "water"
  | "trees"
  | "flooded_vegetation"
  | "crops"
  | "built_area"
  | "bare_ground"
  | "snow_ice"
  | "rangeland";

/** Class codes from the collection's `file:values`; 0 (no data) and 10 (clouds) are no reading. */
export const IO_CLASSES: Readonly<Record<number, IoClass>> = {
  1: "water",
  2: "trees",
  4: "flooded_vegetation",
  5: "crops",
  7: "built_area",
  8: "bare_ground",
  9: "snow_ice",
  11: "rangeland",
};

export const IO_CLASS_LABELS: Readonly<Record<IoClass, string>> = {
  water: "Water",
  trees: "Trees",
  flooded_vegetation: "Flooded vegetation",
  crops: "Crops",
  built_area: "Built area",
  bare_ground: "Bare ground",
  snow_ice: "Snow and ice",
  rangeland: "Rangeland",
};

export const LANDCOVER_LIMITATIONS = [
  "Each year is a composite of model predictions from Sentinel-2 imagery; the producer states an average accuracy of over 75%, so a class change between two years can be a difference in classification rather than a change on the ground.",
  "Shares are counted at sample points about 39 m apart on a 20 km box, each taking the class of the 10 m cell it falls in.",
  "Parks with paths and lawns, and mixed edges, can be classed as built area; the classes describe what the model saw, not land use or tenure.",
  "Points with no data or cloud in a year are left out of that year's shares and of the change between the first and last year.",
];

export interface LandCoverYear {
  year: number;
  itemIds: string[];
  /** Share of the place's points with a reading, by class; classes with no point are 0. */
  shares: Record<IoClass, number>;
  /** Share of the place's points with no data or cloud. */
  noReadingShare: number;
}

export interface LandCoverTransition {
  from: IoClass;
  to: IoClass;
  /** Share of points with a reading in both years. */
  share: number;
}

export interface LandCoverChange {
  years: LandCoverYear[];
  firstYear: number;
  lastYear: number;
  /** Share of points with a reading in both years whose class differs. */
  changedShare: number;
  comparedPoints: number;
  transitions: LandCoverTransition[];
  grid: {
    width: number;
    height: number;
    bbox: Bbox;
    inPlace: Uint8Array;
    /** IO class codes, 0 where no reading; row 0 north. */
    first: Uint8Array;
    last: Uint8Array;
  };
  limitations: string[];
}

function emptyShares(): Record<IoClass, number> {
  return {
    water: 0,
    trees: 0,
    flooded_vegetation: 0,
    crops: 0,
    built_area: 0,
    bare_ground: 0,
    snow_ice: 0,
    rangeland: 0,
  };
}

const round4 = (x: number) => Number(x.toFixed(4));

/** Class codes from a crop with the mask as its last band; 0 where no reading (no data, cloud or masked). */
export function classesFromCrop(arr: NpyArray, width: number, height: number): Uint8Array {
  const [bands, h, w] = arr.shape;
  if (bands !== 2 || h !== height || w !== width) {
    throw new LiveFetchError(
      "decode_failed",
      `Land cover crop came back ${arr.shape.join(" x ")}, expected 2 x ${height} x ${width}.`,
    );
  }
  const n = width * height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const code = arr.data[i] ?? 0;
    const mask = arr.data[n + i] ?? 0;
    out[i] = mask !== 0 && IO_CLASSES[code] ? code : 0;
  }
  return out;
}

/** Pure computation over per-year class grids sampled at the same points. */
export function computeLandCoverChange(
  yearsIn: readonly { year: number; itemIds: string[]; classes: Uint8Array }[],
  grid: { width: number; height: number; bbox: Bbox; inPlace: Uint8Array },
): LandCoverChange {
  const years = [...yearsIn].sort((a, b) => a.year - b.year);
  const n = grid.width * grid.height;
  const placePoints = grid.inPlace.reduce((a, b) => a + b, 0);

  const yearRows: LandCoverYear[] = years.map((y) => {
    const counts = emptyShares();
    let read = 0;
    for (let i = 0; i < n; i++) {
      if (grid.inPlace[i] !== 1) continue;
      const cls = IO_CLASSES[y.classes[i] ?? 0];
      if (!cls) continue;
      counts[cls]++;
      read++;
    }
    const shares = emptyShares();
    for (const k of Object.keys(shares) as IoClass[])
      shares[k] = read > 0 ? round4(counts[k] / read) : 0;
    return {
      year: y.year,
      itemIds: y.itemIds,
      shares,
      noReadingShare: placePoints > 0 ? round4(1 - read / placePoints) : 1,
    };
  });

  const first = years[0];
  const last = years[years.length - 1];
  const pairCounts = new Map<string, number>();
  let compared = 0;
  let changed = 0;
  if (first && last && first !== last) {
    for (let i = 0; i < n; i++) {
      if (grid.inPlace[i] !== 1) continue;
      const a = IO_CLASSES[first.classes[i] ?? 0];
      const b = IO_CLASSES[last.classes[i] ?? 0];
      if (!a || !b) continue;
      compared++;
      if (a !== b) {
        changed++;
        const key = `${a}>${b}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const transitions: LandCoverTransition[] = [...pairCounts.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split(">") as [IoClass, IoClass];
      return { from, to, share: round4(count / compared), count };
    })
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
    .map(({ from, to, share }) => ({ from, to, share }));

  return {
    years: yearRows,
    firstYear: first?.year ?? 0,
    lastYear: last?.year ?? 0,
    changedShare: compared > 0 ? round4(changed / compared) : 0,
    comparedPoints: compared,
    transitions,
    grid: {
      ...grid,
      first: first?.classes ?? new Uint8Array(n),
      last: last?.classes ?? new Uint8Array(n),
    },
    limitations: [...LANDCOVER_LIMITATIONS],
  };
}

function yearOf(item: StacItem): number | null {
  const start = item.properties.start_datetime;
  const m = typeof start === "string" ? /^(\d{4})-/.exec(start) : null;
  return m?.[1] ? Number.parseInt(m[1], 10) : null;
}

/**
 * Fetches every annual map that covers the place and computes shares per year and the change from the first to the
 * last year. Neighbouring UTM zones of one year are merged point by point. Any failure is a missing value with the
 * reason; a year that cannot be read makes the whole result missing rather than a shorter series.
 */
export async function fetchLandCoverChange(
  bbox: Bbox,
  ring?: Ring,
  opts: LiveFetchOptions & { gridSize?: number } = {},
): Promise<LiveResult<LandCoverChange>> {
  const startedAt = Date.now();
  const now = opts.now?.() ?? new Date();
  const size = opts.gridSize ?? LANDCOVER_GRID;
  const t = withTimeout(opts.timeoutMs ?? 20_000, opts.signal);
  const inner: LiveFetchOptions = { ...opts, signal: t.signal };
  try {
    const items = await stacSearch({ collections: [COLLECTION], bbox, limit: 100 }, inner);
    const byYear = new Map<number, string[]>();
    for (const it of items) {
      const y = yearOf(it);
      if (y === null) continue;
      byYear.set(y, [...(byYear.get(y) ?? []), it.id].sort());
    }
    if (byYear.size < 2) {
      throw new LiveFetchError(
        "no_items",
        `Found ${byYear.size} annual land cover map${byYear.size === 1 ? "" : "s"} for this place; a change needs two.`,
      );
    }
    const yearList = [...byYear.entries()].sort((a, b) => a[0] - b[0]);
    const read = await mapLimited(
      yearList,
      opts.concurrency ?? PC_CONCURRENCY,
      async ([year, ids]) => {
        let classes: Uint8Array | null = null;
        for (const id of ids) {
          const arr = await fetchNpyCrop(
            {
              collection: COLLECTION,
              item: id,
              assets: ["data"],
              bounds: bbox,
              width: size,
              height: size,
              resampling: "nearest",
            },
            inner,
          );
          const next = classesFromCrop(arr, size, size);
          if (!classes) classes = next;
          else
            for (let i = 0; i < next.length; i++) if (classes[i] === 0) classes[i] = next[i] ?? 0;
        }
        return { year, itemIds: ids, classes: classes ?? new Uint8Array(size * size) };
      },
    );
    const inPlace = lonLatGridMask(bbox, size, size, ring);
    const change = computeLandCoverChange(read, { width: size, height: size, bbox, inPlace });
    if (change.comparedPoints === 0) {
      throw new LiveFetchError(
        "coverage_below_threshold",
        `No point of the place had a land cover reading in both ${change.firstYear} and ${change.lastYear}.`,
      );
    }
    return {
      status: "measured",
      value: change,
      provenance: {
        source: COLLECTION,
        items: read.flatMap((r) => r.itemIds),
        window: { start: `${change.firstYear}-01-01`, end: `${change.lastYear}-12-31` },
        method: { ...LANDCOVER_METHOD },
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
