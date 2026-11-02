/**
 * Growing-season greenness of a live place from MODIS Terra MOD13Q1 v6.1 NDVI, 2000 onward, read on the native
 * 250 m sinusoidal grid through the Planetary Computer data API, with the per-pixel Theil-Sen trend, Sen's 95%
 * interval, Mann-Kendall p and the Benjamini-Hochberg check of the studied valleys' `pixel_trend_long_record`
 * (docs/reference/analysis-recipes.md). The growing window is not pre-registered per place: a rule fixed in code
 * picks it from three reference years before any trend is computed, and the output says so.
 */
import {
  type Bbox,
  type LiveFetchOptions,
  type LiveResult,
  type NpyArray,
  type Ring,
  type SinusoidalWindow,
  type StacItem,
  LiveFetchError,
  MODIS_250M_PIXEL_M,
  MODIS_SINUSOIDAL_PROJ,
  PC_CONCURRENCY,
  fetchNpyCrop,
  mapLimited,
  missingFrom,
  modisWindowForBbox,
  pointInRing,
  sinusoidalToLonLat,
  stacSearch,
  withTimeout,
} from "./planetary.ts";
import { benjaminiHochberg, mannKendall, theilSen, trendDirection } from "./trend-stats.ts";

export const VEGETATION_METHOD = { id: "live_vegetation_trend", version: "1.0.0" } as const;

/** Fixed in code before any place was read (lead, 2 Nov 2026): spread across the record. */
export const REFERENCE_YEARS = [2003, 2012, 2021] as const;

const COLLECTION = "modis-13Q1-061";
const NDVI_ASSET = "250m_16_days_NDVI";
const REL_ASSET = "250m_16_days_pixel_reliability";
const FIRST_YEAR = 2000;
const MIN_COMPOSITE_SHARE = 0.5;
const AREA_COVERAGE = 0.7;
const MIN_SEASONS = 15;
const FDR_Q = 0.05;
const MAX_UNREAD_SHARE = 0.05;
const WINDOW_MONTHS = 4;

export const QA_RULE =
  "Terra MOD13Q1 v6.1 only; NDVI = DN / 10000 kept where pixel reliability is 0 or 1 and -0.2 <= NDVI <= 1.0; a season's value per pixel is the mean of kept composites, defined when at least half of the window's 16-day periods are kept";

export const VEGETATION_LIMITATIONS = [
  "Each 250 m MODIS pixel mixes surfaces; a value is one pixel's mean over the composites of one window that passed the quality filter, not a measurement of a field or plant.",
  "A pixel belongs to the place when its centre lies inside it, and every such pixel counts equally; the studied valleys weight pixels by the 10 m cells of the catchment they hold.",
  "Pixels the product never gives a season value (its permanent fill, for example open water) are left out; each season's valid pixel share is counted against the pixels that have a value in at least one season.",
  "NDVI measures greenness, not forage, crop yield or species.",
  "The series is not adjusted for rainfall: wet and dry years move greenness as well as land use does.",
  "Trend methods can miss real change, and an interval that includes zero is not evidence of no change.",
  "With thousands of pixels tested, about 2.5% per direction would show a trend by chance alone; the false discovery rate check is shown beside the raw shares for that reason.",
  "Terra's overpass has drifted earlier since 2020, from 10:30 to about 9:06 mean local time by December 2025 (NASA), which may shift NDVI without any change on the ground.",
  "The growing window was chosen by a fixed rule from three reference years of the same record, not registered in advance for this place.",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export interface SeasonWindow {
  /** Calendar months 1 to 12 in season order; a window that wraps the year end belongs to the year it starts. */
  months: number[];
  label: string;
  rule: string;
  referenceYears: number[];
  /** Mean area NDVI per calendar month over the reference years (null where no composite kept a pixel). */
  referenceCycle: (number | null)[];
}

/** One 16-day composite date with its per-pixel NDVI after the quality filter (NaN where not kept). */
export interface ModisComposite {
  /** Start of the 16-day period, YYYY-MM-DD. */
  start: string;
  itemIds: string[];
  values: Float32Array;
}

export interface ModisStack {
  window: SinusoidalWindow;
  /** 1 where the pixel centre lies inside the place, row 0 north. */
  inPlace: Uint8Array;
  composites: ModisComposite[];
  /** Composite periods the archive lists but that could not be read. */
  unread: string[];
  /** End of the newest composite in the archive, YYYY-MM-DD. */
  archiveEnd: string;
}

export interface VegetationSeason {
  year: number;
  meanNdvi: number | null;
  validPixelShare: number;
  compositesKept: number;
  compositesExpected: number;
}

export interface VegetationPixelShares {
  pixelsTested: number;
  upward: number;
  downward: number;
  includesZero: number;
  fdrUpward: number;
  fdrDownward: number;
  fdrQ: number;
  chancePerDirection: number;
}

export interface VegetationSeries {
  window: SeasonWindow;
  qaRule: string;
  method: { id: string; version: string };
  seasons: VegetationSeason[];
  yearsUsed: number[];
  /** Pixels whose centre lies in the place. */
  placePixels: number;
  /** Place pixels with a season value in at least one season; the base of every share. */
  analysisPixels: number;
  areaTrend: {
    perDecade: number;
    sen95PerDecade: [number, number];
    mannKendallP: number;
    seasonsUsed: number;
  } | null;
  /** Why the area trend is null, in a plain sentence; null when it was computed. */
  areaTrendWithheld: string | null;
  pixelShares: VegetationPixelShares | null;
  grid: {
    width: number;
    height: number;
    pixelSizeM: number;
    /** Left, bottom, right, top in MODIS sinusoidal metres. */
    boundsSinusoidal: [number, number, number, number];
    inPlace: Uint8Array;
    /** seasons x rows x columns, row 0 north; NaN means no value, never zero. */
    seasonMeans: Float32Array;
    slopePerDecade: Float32Array;
  };
  unreadComposites: string[];
  limitations: string[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Start dates of the 23 MODIS 16-day periods of a year (day of year 1, 17, ..., 353). */
export function periodStarts(year: number): string[] {
  const out: string[] = [];
  for (let doy = 1; doy <= 353; doy += 16) {
    out.push(isoDate(new Date(Date.UTC(year, 0, doy))));
  }
  return out;
}

function monthOf(date: string): number {
  return Number.parseInt(date.slice(5, 7), 10);
}

/** The periods of a season that starts in `year`: those starting in the window months, wrapping into `year + 1`. */
export function seasonPeriods(year: number, months: readonly number[]): string[] {
  const first = months[0] ?? 1;
  const out: string[] = [];
  for (const m of months) {
    const y = m >= first ? year : year + 1;
    for (const p of periodStarts(y)) if (monthOf(p) === m) out.push(p);
  }
  return out;
}

function windowLabel(months: readonly number[]): string {
  const first = months[0] ?? 1;
  const last = months[months.length - 1] ?? first;
  return `${MONTH_NAMES[first - 1] ?? ""} to ${MONTH_NAMES[last - 1] ?? ""}`;
}

function areaMean(
  values: Float32Array,
  inPlace: Uint8Array,
): { mean: number | null; kept: number } {
  let sum = 0;
  let kept = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? Number.NaN;
    if (inPlace[i] === 1 && !Number.isNaN(v)) {
      sum += v;
      kept++;
    }
  }
  return { mean: kept > 0 ? sum / kept : null, kept };
}

/**
 * The four-month window with the highest mean NDVI on the reference years' mean cycle, allowed to wrap the year end.
 * A month's value is the mean of the area means of the reference-year composites starting in it; a window with a
 * month that has no kept composite cannot be chosen. Ties go to the earliest starting month. Null when no window
 * qualifies.
 */
export function chooseGrowingWindow(
  stack: Pick<ModisStack, "composites" | "inPlace">,
  referenceYears: readonly number[] = REFERENCE_YEARS,
): SeasonWindow | null {
  const sums = new Array<number>(12).fill(0);
  const counts = new Array<number>(12).fill(0);
  for (const c of stack.composites) {
    const year = Number.parseInt(c.start.slice(0, 4), 10);
    if (!referenceYears.includes(year)) continue;
    const { mean } = areaMean(c.values, stack.inPlace);
    if (mean === null) continue;
    const m = monthOf(c.start) - 1;
    sums[m] = (sums[m] ?? 0) + mean;
    counts[m] = (counts[m] ?? 0) + 1;
  }
  const cycle = sums.map((s, i) => ((counts[i] ?? 0) > 0 ? s / (counts[i] ?? 1) : null));
  let best: { start: number; score: number } | null = null;
  for (let s = 0; s < 12; s++) {
    let total = 0;
    let ok = true;
    for (let k = 0; k < WINDOW_MONTHS; k++) {
      const v = cycle[(s + k) % 12];
      if (v === null || v === undefined) {
        ok = false;
        break;
      }
      total += v;
    }
    if (ok && (best === null || total / WINDOW_MONTHS > best.score)) {
      best = { start: s, score: total / WINDOW_MONTHS };
    }
  }
  if (!best) return null;
  const startMonth = best.start;
  const months = Array.from({ length: WINDOW_MONTHS }, (_, k) => ((startMonth + k) % 12) + 1);
  return {
    months,
    label: windowLabel(months),
    rule: `The four consecutive months with the highest mean NDVI on the mean seasonal cycle of ${referenceYears.join(", ")} (reference years fixed in code), chosen before any trend was computed; a window that crosses the year end belongs to the year it starts.`,
    referenceYears: [...referenceYears],
    referenceCycle: cycle.map((v) => (v === null ? null : Number(v.toFixed(4)))),
  };
}

/** Pure computation over a filtered stack: season means, area trend and per-pixel trend shares. */
export function computeVegetationSeries(stack: ModisStack, window: SeasonWindow): VegetationSeries {
  const { width, height } = stack.window;
  const n = width * height;
  const byStart = new Map(stack.composites.map((c) => [c.start, c]));
  const placePixels = stack.inPlace.reduce((a, b) => a + b, 0);

  const archiveEndYear = Number.parseInt(stack.archiveEnd.slice(0, 4), 10);
  const built: { year: number; grid: Float32Array; kept: number; expected: number }[] = [];
  for (let year = FIRST_YEAR; year <= archiveEndYear; year++) {
    const periods = seasonPeriods(year, window.months);
    const lastStart = periods[periods.length - 1];
    if (!lastStart) continue;
    const lastEnd = isoDate(new Date(Date.parse(`${lastStart}T00:00:00Z`) + 15 * 86_400_000));
    // Only seasons the archive has fully produced; a period it never held counts as nothing kept.
    if (lastEnd > stack.archiveEnd) continue;
    const need = Math.ceil(periods.length * MIN_COMPOSITE_SHARE);
    const sum = new Float64Array(n);
    const kept = new Uint16Array(n);
    let compositesKept = 0;
    for (const p of periods) {
      const c = byStart.get(p);
      if (!c) continue;
      compositesKept++;
      for (let i = 0; i < n; i++) {
        const v = c.values[i] ?? Number.NaN;
        if (!Number.isNaN(v)) {
          sum[i] = (sum[i] ?? 0) + v;
          kept[i] = (kept[i] ?? 0) + 1;
        }
      }
    }
    const grid = new Float32Array(n).fill(Number.NaN);
    for (let i = 0; i < n; i++) {
      const k = kept[i] ?? 0;
      if (k >= need && k > 0) grid[i] = Number(((sum[i] ?? 0) / k).toFixed(5));
    }
    built.push({ year, grid, kept: compositesKept, expected: periods.length });
  }

  // Analysis pixels: place pixels with a season value in at least one season. Pixels the product never reads
  // (its permanent fill, such as open water) leave the denominator, so coverage measures season gaps, not fill.
  const analysis = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (stack.inPlace[i] === 1 && built.some((b) => !Number.isNaN(b.grid[i] ?? Number.NaN)))
      analysis[i] = 1;
  }
  const analysisPixels = analysis.reduce((a, b) => a + b, 0);

  const seasons: VegetationSeason[] = built.map((b) => {
    let areaSum = 0;
    let defined = 0;
    for (let i = 0; i < n; i++) {
      const g = b.grid[i] ?? Number.NaN;
      if (analysis[i] === 1 && !Number.isNaN(g)) {
        areaSum += g;
        defined++;
      }
    }
    const validPixelShare = analysisPixels > 0 ? defined / analysisPixels : 0;
    return {
      year: b.year,
      meanNdvi:
        validPixelShare >= AREA_COVERAGE && defined > 0
          ? Number((areaSum / defined).toFixed(4))
          : null,
      validPixelShare: Number(validPixelShare.toFixed(4)),
      compositesKept: b.kept,
      compositesExpected: b.expected,
    };
  });

  const seasonMeans = new Float32Array(built.length * n);
  built.forEach((b, s) => {
    seasonMeans.set(b.grid, s * n);
  });

  const usable = seasons.filter((s) => s.meanNdvi !== null);
  const areaTs =
    usable.length >= MIN_SEASONS
      ? theilSen(
          usable.map((s) => s.year),
          usable.map((s) => s.meanNdvi ?? 0),
        )
      : null;
  const areaMk =
    usable.length >= MIN_SEASONS ? mannKendall(usable.map((s) => s.meanNdvi ?? 0)) : null;

  const slopePerDecade = new Float32Array(n).fill(Number.NaN);
  const tested: { lower: number; upper: number; slope: number; p: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (analysis[i] !== 1) continue;
    const xs: number[] = [];
    const ys: number[] = [];
    seasons.forEach((s, k) => {
      const v = seasonMeans[k * n + i] ?? Number.NaN;
      if (!Number.isNaN(v)) {
        xs.push(s.year);
        ys.push(v);
      }
    });
    if (xs.length < MIN_SEASONS) continue;
    const ts = theilSen(xs, ys);
    if (!ts) continue;
    slopePerDecade[i] = ts.slope * 10;
    tested.push({ lower: ts.lower, upper: ts.upper, slope: ts.slope, p: mannKendall(ys).p });
  }

  let pixelShares: VegetationPixelShares | null = null;
  if (tested.length > 0) {
    const fdr = benjaminiHochberg(
      tested.map((t) => t.p),
      FDR_Q,
    );
    const share = (count: number) => Number((count / tested.length).toFixed(4));
    let up = 0;
    let down = 0;
    let fdrUp = 0;
    let fdrDown = 0;
    tested.forEach((t, k) => {
      const dir = trendDirection(t.lower, t.upper);
      if (dir === "upward") up++;
      if (dir === "downward") down++;
      if (fdr[k] && t.slope > 0) fdrUp++;
      if (fdr[k] && t.slope < 0) fdrDown++;
    });
    pixelShares = {
      pixelsTested: tested.length,
      upward: share(up),
      downward: share(down),
      includesZero: share(tested.length - up - down),
      fdrUpward: share(fdrUp),
      fdrDownward: share(fdrDown),
      fdrQ: FDR_Q,
      chancePerDirection: 0.025,
    };
  }

  return {
    window,
    qaRule: QA_RULE,
    method: { ...VEGETATION_METHOD },
    seasons,
    yearsUsed: usable.map((s) => s.year),
    placePixels,
    analysisPixels,
    areaTrend:
      areaTs && areaMk
        ? {
            perDecade: Number((areaTs.slope * 10).toFixed(5)),
            sen95PerDecade: [
              Number((areaTs.lower * 10).toFixed(5)),
              Number((areaTs.upper * 10).toFixed(5)),
            ],
            mannKendallP: areaMk.p,
            seasonsUsed: usable.length,
          }
        : null,
    areaTrendWithheld:
      usable.length >= MIN_SEASONS
        ? null
        : `Only ${usable.length} of ${seasons.length} seasons had a value for at least 70% of the place's pixels; an area trend needs at least ${MIN_SEASONS}.`,
    pixelShares,
    grid: {
      width,
      height,
      pixelSizeM: MODIS_250M_PIXEL_M,
      boundsSinusoidal: stack.window.bounds,
      inPlace: stack.inPlace,
      seasonMeans,
      slopePerDecade,
    },
    unreadComposites: [...stack.unread],
    limitations: [...VEGETATION_LIMITATIONS],
  };
}

/** 1 for each window pixel whose centre lies in the ring, or in the box when no ring is given. */
export function placeMask(window: SinusoidalWindow, bbox: Bbox, ring?: Ring): Uint8Array {
  const { width, height, bounds } = window;
  const p = MODIS_250M_PIXEL_M;
  const mask = new Uint8Array(width * height);
  for (let r = 0; r < height; r++) {
    const y = bounds[3] - (r + 0.5) * p;
    for (let c = 0; c < width; c++) {
      const [lon, lat] = sinusoidalToLonLat(bounds[0] + (c + 0.5) * p, y);
      const inside =
        ring && ring.length >= 3
          ? pointInRing(lon, lat, ring)
          : lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
      mask[r * width + c] = inside ? 1 : 0;
    }
  }
  return mask;
}

/** NDVI after the quality filter, from a crop holding NDVI, reliability and the mask band. NaN where not kept. */
export function filterComposite(arr: NpyArray, window: SinusoidalWindow): Float32Array {
  const [bands, h, w] = arr.shape;
  if (bands !== 3 || h !== window.height || w !== window.width) {
    throw new LiveFetchError(
      "decode_failed",
      `MODIS crop came back ${arr.shape.join(" x ")}, expected 3 x ${window.height} x ${window.width}.`,
    );
  }
  const n = h * w;
  const out = new Float32Array(n).fill(Number.NaN);
  for (let i = 0; i < n; i++) {
    const dn = arr.data[i] ?? -3000;
    const rel = arr.data[n + i] ?? -1;
    const mask = arr.data[2 * n + i] ?? 0;
    if (mask !== 0 && (rel === 0 || rel === 1) && dn >= -2000 && dn <= 10000) out[i] = dn / 10000;
  }
  return out;
}

/** Merges two filtered crops of the same date from neighbouring MODIS tiles: the first kept value wins. */
function mergeInto(target: Float32Array, next: Float32Array): void {
  for (let i = 0; i < target.length; i++) {
    if (Number.isNaN(target[i] ?? Number.NaN)) target[i] = next[i] ?? Number.NaN;
  }
}

interface CompositeItems {
  start: string;
  end: string;
  itemIds: string[];
}

/**
 * Terra items grouped by period start, as `science/pipeline/modis-fetch.py` selects them: the MOD13Q1 prefix of the
 * item ID, and the platform property when an item carries one. Per tile and date the newest production (last ID part)
 * is kept.
 */
export function groupTerraItems(items: readonly StacItem[]): CompositeItems[] {
  const byTileDate = new Map<
    string,
    { id: string; start: string; end: string; production: string }
  >();
  for (const it of items) {
    const m = /^MOD13Q1\.A(\d{7})\.(h\d{2}v\d{2})\.061\.(\d+)$/.exec(it.id);
    if (!m) continue;
    const platform = it.properties.platform;
    if (typeof platform === "string" && platform.toLowerCase() !== "terra") continue;
    const startRaw = it.properties.start_datetime;
    const endRaw = it.properties.end_datetime;
    const start = typeof startRaw === "string" ? startRaw.slice(0, 10) : "";
    const end = typeof endRaw === "string" ? endRaw.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
    const key = `${m[2] ?? ""}|${start}`;
    const prev = byTileDate.get(key);
    if (!prev || (m[3] ?? "") > prev.production) {
      byTileDate.set(key, { id: it.id, start, end, production: m[3] ?? "" });
    }
  }
  const byStart = new Map<string, CompositeItems>();
  for (const v of byTileDate.values()) {
    const g = byStart.get(v.start) ?? { start: v.start, end: v.end, itemIds: [] };
    g.itemIds.push(v.id);
    if (v.end > g.end) g.end = v.end;
    byStart.set(v.start, g);
  }
  return [...byStart.values()]
    .map((g) => ({ ...g, itemIds: g.itemIds.sort() }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Lists and reads the Terra composites a place needs: first every composite of the reference years, which choose the
 * growing window, then every composite of that window in every season. Throws a LiveFetchError with the reason when
 * the place cannot be measured.
 */
export async function fetchModisStack(
  bbox: Bbox,
  ring: Ring | undefined,
  opts: LiveFetchOptions & { signal: AbortSignal },
): Promise<{ stack: ModisStack; seasonWindow: SeasonWindow }> {
  const now = opts.now?.() ?? new Date();
  const limit = opts.concurrency ?? PC_CONCURRENCY;
  const window = modisWindowForBbox(bbox);
  const inPlace = placeMask(window, bbox, ring);
  if (!inPlace.some((v) => v === 1)) {
    throw new LiveFetchError(
      "coverage_below_threshold",
      "No 250 m MODIS pixel centre falls inside the place.",
    );
  }

  const years = Array.from(
    { length: now.getUTCFullYear() - FIRST_YEAR + 1 },
    (_, k) => FIRST_YEAR + k,
  );
  const pages = await mapLimited(years, limit, (year) =>
    stacSearch(
      {
        collections: [COLLECTION],
        bbox,
        datetime: `${year}-01-01T00:00:00Z/${year}-12-31T23:59:59Z`,
        // No server-side platform filter: many items carry no platform property and would be dropped.
        limit: 200,
      },
      opts,
    ),
  );
  const groups = groupTerraItems(pages.flat());
  if (groups.length === 0)
    throw new LiveFetchError("no_items", "No Terra MOD13Q1 composite covers this place.");
  const archiveEnd = groups.reduce((a, g) => (g.end > a ? g.end : a), "");

  const read = new Map<string, ModisComposite>();
  const unread: string[] = [];
  const readGroups = async (todo: CompositeItems[]) => {
    await mapLimited(todo, limit, async (g) => {
      let values: Float32Array | null = null;
      for (const id of g.itemIds) {
        try {
          const arr = await fetchNpyCrop(
            {
              collection: COLLECTION,
              item: id,
              assets: [NDVI_ASSET, REL_ASSET],
              bounds: window.bounds,
              crs: MODIS_SINUSOIDAL_PROJ,
            },
            opts,
          );
          const filtered = filterComposite(arr, window);
          if (values) mergeInto(values, filtered);
          else values = filtered;
        } catch (err) {
          if (opts.signal.aborted) throw err;
        }
      }
      if (values) read.set(g.start, { start: g.start, itemIds: g.itemIds, values });
      else unread.push(g.start);
    });
  };

  // Phase 1: the reference years' composites choose the window before any trend is computed.
  const reference = groups.filter((g) => REFERENCE_YEARS.some((y) => g.start.startsWith(`${y}-`)));
  await readGroups(reference);
  if (reference.length > 0 && unread.length / reference.length > MAX_UNREAD_SHARE) {
    throw new LiveFetchError(
      "http_error",
      `${unread.length} of ${reference.length} MODIS composites of the reference years could not be read.`,
    );
  }
  const seasonWindow = chooseGrowingWindow({ composites: [...read.values()], inPlace });
  if (!seasonWindow) {
    throw new LiveFetchError(
      "coverage_below_threshold",
      `No four-month window had kept MODIS composites in every month of ${REFERENCE_YEARS.join(", ")}.`,
    );
  }

  // Phase 2: every composite of every season in that window.
  const wanted = new Set<string>();
  for (let y = FIRST_YEAR; y <= now.getUTCFullYear(); y++) {
    for (const p of seasonPeriods(y, seasonWindow.months)) wanted.add(p);
  }
  await readGroups(groups.filter((g) => wanted.has(g.start) && !read.has(g.start)));

  const listedInWindow = groups.filter((g) => wanted.has(g.start)).length;
  const unreadInWindow = unread.filter((s) => wanted.has(s));
  if (listedInWindow > 0 && unreadInWindow.length / listedInWindow > MAX_UNREAD_SHARE) {
    throw new LiveFetchError(
      "http_error",
      `${unreadInWindow.length} of ${listedInWindow} MODIS composites in the window could not be read.`,
    );
  }
  return {
    stack: {
      window,
      inPlace,
      composites: [...read.values()]
        .filter((c) => wanted.has(c.start))
        .sort((a, b) => a.start.localeCompare(b.start)),
      unread: unreadInWindow.sort(),
      archiveEnd,
    },
    seasonWindow,
  };
}

/**
 * Fetches MOD13Q1 composites for a place and computes its growing-season series. Never returns a fallback number:
 * a failed search, too many unreadable composites, no qualifying window or too few seasons give a missing value
 * with the reason.
 */
export async function fetchVegetationSeries(
  bbox: Bbox,
  ring?: Ring,
  opts: LiveFetchOptions = {},
): Promise<LiveResult<VegetationSeries>> {
  const startedAt = Date.now();
  const now = opts.now?.() ?? new Date();
  const t = withTimeout(opts.timeoutMs ?? 20_000, opts.signal);
  try {
    const { stack, seasonWindow } = await fetchModisStack(bbox, ring, {
      ...opts,
      now: () => now,
      signal: t.signal,
    });
    const series = computeVegetationSeries(stack, seasonWindow);
    if (!series.areaTrend && !series.pixelShares) {
      throw new LiveFetchError(
        "coverage_below_threshold",
        `${series.areaTrendWithheld ?? "No area trend."} No pixel had a value in ${MIN_SEASONS} or more seasons.`,
      );
    }
    const firstSeason = series.seasons[0];
    const lastSeason = series.seasons[series.seasons.length - 1];
    const lastPeriods = lastSeason ? seasonPeriods(lastSeason.year, seasonWindow.months) : [];
    const lastStart = lastPeriods[lastPeriods.length - 1] ?? stack.archiveEnd;
    return {
      status: "measured",
      value: series,
      provenance: {
        source: COLLECTION,
        items: stack.composites.flatMap((c) => c.itemIds),
        window: {
          start: firstSeason ? (seasonPeriods(firstSeason.year, seasonWindow.months)[0] ?? "") : "",
          end: isoDate(new Date(Date.parse(`${lastStart}T00:00:00Z`) + 15 * 86_400_000)),
        },
        method: { ...VEGETATION_METHOD },
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
