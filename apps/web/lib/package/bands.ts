// The height range a package stratum names on the land, for the overview to light it and stand its measurement on
// it: the case's elevation keys (elevation_low, elevation_mid, elevation_high, the analysis configuration's strata,
// lowest first) between the record's two elevation band limits (bandLimitsOf, the elevation_band_limit
// measurements). Any other key (an aspect class, the whole catchment, a kind of place) names no height range.

const ORDER = ["low", "mid", "high"] as const;

export interface HeightRange {
  /** Lower limit (m), or null for the lowest band. */
  lo: number | null;
  /** Upper limit (m), or null for the highest band. */
  hi: number | null;
}

export function rangeOfKey(
  key: string,
  limits: readonly [number, number] | null,
): HeightRange | null {
  if (!limits) return null;
  const word = /^elevation_([a-z]+)$/.exec(key)?.[1];
  const i = ORDER.findIndex((w) => w === word);
  if (i < 0) return null;
  const [lower, upper] = limits;
  return i === 0
    ? { lo: null, hi: lower }
    : i === 1
      ? { lo: lower, hi: upper }
      : { lo: upper, hi: null };
}
