export const CLIMATE_START_YEAR = 2000;
export const CLIMATE_END_YEAR = 2024;
export const OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

/** One calendar year of the reanalysis series; a year enters only when every day of it is present. */
export interface ClimateYearRow {
  year: number;
  precipMm: number;
  /** FAO reference evapotranspiration total, or null when any day of the year is missing. */
  et0Mm: number | null;
}

/** Where the yearly series came from, named so every value derived from it can cite it. */
export interface ClimateSeriesSource {
  kind: "open_meteo_archive" | "offline_seeded";
  label: string;
  url: string | null;
  window: string;
}

/** No satellite vegetation series is fetched for live places, so no vegetation number exists. */
export interface VegetationNotMeasured {
  status: "not_measured";
  reason: string;
}

export interface HistoricalClimateSummary {
  source: ClimateSeriesSource;
  years: ClimateYearRow[];
  /** Ordinary least squares slope of annual precipitation, mm per decade. */
  precipTrendMmPerDecade: number;
  /** 95% interval of that slope (Student t on n minus 2 degrees of freedom), or null below 3 years. */
  precipTrendLowerMmPerDecade: number | null;
  precipTrendUpperMmPerDecade: number | null;
  vegetation: VegetationNotMeasured;
}

export type AnnualClimateSummary = HistoricalClimateSummary;

export const VEGETATION_NOT_MEASURED: VegetationNotMeasured = {
  status: "not_measured",
  reason:
    "Cannot measure vegetation change: no validated satellite observations for this area. No vegetation index (NDVI) value or trend is recorded.",
};

export const OPEN_METEO_SOURCE: ClimateSeriesSource = {
  kind: "open_meteo_archive",
  label:
    "Open-Meteo Historical Weather API (ERA5 reanalysis), daily precipitation_sum and et0_fao_evapotranspiration",
  url: OPEN_METEO_ARCHIVE_URL,
  window: `${String(CLIMATE_START_YEAR)} to ${String(CLIMATE_END_YEAR)}`,
};

// Two-sided 95% Student t critical values for 1 to 30 degrees of freedom.
const T_975 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145,
  2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048,
  2.045, 2.042,
];

function seededNoise(seed: number): () => number {
  let s = Math.floor(seed) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

/**
 * The ordinary least squares precipitation trend per decade and its 95% interval over the given
 * years. Nothing about vegetation is computed: no vegetation series exists for live places.
 */
export function computeStatsFromAnnual(
  years: ClimateYearRow[],
  source: ClimateSeriesSource = OPEN_METEO_SOURCE,
): HistoricalClimateSummary {
  const n = years.length;
  const meanYear = n > 0 ? years.reduce((s, y) => s + y.year, 0) / n : 0;
  const meanPrecip = n > 0 ? years.reduce((s, y) => s + y.precipMm, 0) / n : 0;

  let sxx = 0;
  let sxy = 0;
  for (const row of years) {
    const dx = row.year - meanYear;
    sxx += dx * dx;
    sxy += dx * (row.precipMm - meanPrecip);
  }
  const slopeYr = sxx > 0 ? sxy / sxx : 0;

  let lower: number | null = null;
  let upper: number | null = null;
  if (n >= 3 && sxx > 0) {
    let ssr = 0;
    for (const row of years) {
      const pred = meanPrecip + slopeYr * (row.year - meanYear);
      ssr += (row.precipMm - pred) ** 2;
    }
    const df = n - 2;
    const t = T_975[Math.min(df, T_975.length) - 1] ?? 2.042;
    const half = t * Math.sqrt(ssr / df / sxx) * 10;
    lower = Number((slopeYr * 10 - half).toFixed(2));
    upper = Number((slopeYr * 10 + half).toFixed(2));
  }

  return {
    source,
    years,
    precipTrendMmPerDecade: Number((slopeYr * 10).toFixed(2)),
    precipTrendLowerMmPerDecade: lower,
    precipTrendUpperMmPerDecade: upper,
    vegetation: VEGETATION_NOT_MEASURED,
  };
}

interface ArchiveDaily {
  time?: string[];
  precipitation_sum?: Array<number | null>;
  et0_fao_evapotranspiration?: Array<number | null>;
}

/**
 * Sums the archive's daily values into calendar years. A year whose precipitation has any missing
 * day is left out rather than filled; its ET0 total is null when any ET0 day is missing.
 */
export function yearlyRowsFromDaily(daily: ArchiveDaily): ClimateYearRow[] {
  const times = daily.time ?? [];
  const precip = daily.precipitation_sum ?? [];
  const et0 = daily.et0_fao_evapotranspiration ?? [];
  const sums = new Map<number, { p: number; pDays: number; e: number; eDays: number }>();
  for (let i = 0; i < times.length; i++) {
    const yr = Number((times[i] ?? "").slice(0, 4));
    if (!(yr >= CLIMATE_START_YEAR && yr <= CLIMATE_END_YEAR)) continue;
    const acc = sums.get(yr) ?? { p: 0, pDays: 0, e: 0, eDays: 0 };
    const pVal = precip[i];
    const eVal = et0[i];
    if (typeof pVal === "number" && Number.isFinite(pVal)) {
      acc.p += pVal;
      acc.pDays += 1;
    }
    if (typeof eVal === "number" && Number.isFinite(eVal)) {
      acc.e += eVal;
      acc.eDays += 1;
    }
    sums.set(yr, acc);
  }
  const rows: ClimateYearRow[] = [];
  for (let yr = CLIMATE_START_YEAR; yr <= CLIMATE_END_YEAR; yr++) {
    const acc = sums.get(yr);
    if (!acc || acc.pDays !== daysInYear(yr)) continue;
    rows.push({
      year: yr,
      precipMm: Number(acc.p.toFixed(1)),
      et0Mm: acc.eDays === daysInYear(yr) ? Number(acc.e.toFixed(1)) : null,
    });
  }
  return rows;
}

/**
 * Fetches daily precipitation and FAO reference evapotranspiration (2000 to 2024) from the
 * Open-Meteo historical archive (ERA5 reanalysis) and sums them into calendar years.
 */
export async function fetchHistoricalClimate(
  lon: number,
  lat: number,
): Promise<HistoricalClimateSummary> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    const url = `${OPEN_METEO_ARCHIVE_URL}?latitude=${encodeURIComponent(
      String(lat),
    )}&longitude=${encodeURIComponent(
      String(lon),
    )}&start_date=${String(CLIMATE_START_YEAR)}-01-01&end_date=${String(CLIMATE_END_YEAR)}-12-31&daily=precipitation_sum,et0_fao_evapotranspiration&timezone=UTC`;
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: "application/json", "User-Agent": "Siterra/1.0" },
    });
    if (res.ok) {
      const data = (await res.json()) as { daily?: ArchiveDaily };
      const years = yearlyRowsFromDaily(data.daily ?? {});
      if (years.length >= 20) return computeStatsFromAnnual(years, OPEN_METEO_SOURCE);
    }
  } catch {
    // Fall back to the coordinate-seeded series below when offline
  } finally {
    clearTimeout(timer);
  }

  // Coordinate-seeded rainfall when Open-Meteo is unreachable: not data, and labeled as such
  const rand = seededNoise(Math.round((lon + 180) * 10000 + (lat + 90) * 10000));
  const meanP = 380 + Math.round(Math.abs(Math.cos((lat * Math.PI) / 180)) * 550);
  const years: ClimateYearRow[] = [];
  for (let yr = CLIMATE_START_YEAR; yr <= CLIMATE_END_YEAR; yr++) {
    const anomaly = (rand() - 0.5) * meanP * 0.38;
    years.push({
      year: yr,
      precipMm: Number(Math.max(40, meanP + anomaly).toFixed(1)),
      et0Mm: null,
    });
  }
  return computeStatsFromAnnual(years, {
    kind: "offline_seeded",
    label: "Coordinate-seeded placeholder series (Open-Meteo unreachable); not a measurement",
    url: null,
    window: `${String(CLIMATE_START_YEAR)} to ${String(CLIMATE_END_YEAR)}`,
  });
}
