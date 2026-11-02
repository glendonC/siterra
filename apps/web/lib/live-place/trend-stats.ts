/**
 * Theil-Sen slope with Sen's 95% interval, the Mann-Kendall test and the Benjamini-Hochberg procedure, ported from
 * `science/pipeline/trend_stats.py` so a live place is tested the way the studied valleys are.
 */

const Z975 = 1.959963984540054;

export interface TheilSen {
  slope: number;
  lower: number;
  upper: number;
  pairs: number;
}

export interface MannKendall {
  s: number;
  varS: number;
  z: number;
  p: number;
}

export type TrendDirection = "upward" | "downward" | "includes_zero";

/** Python's round(): halves go to the even neighbour. */
function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/**
 * Median of pairwise slopes with Sen's 95% interval; ranks (N - C) / 2 and (N + C) / 2 + 1 rounded to integers,
 * C = 1.96 sqrt(n (n - 1) (2n + 5) / 18), no tie correction (the indexing of scipy.stats.theilslopes).
 * Returns null when fewer than two distinct x values are given.
 */
export function theilSen(x: readonly number[], y: readonly number[]): TheilSen | null {
  const n = x.length;
  const slopes: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = (x[j] ?? 0) - (x[i] ?? 0);
      if (dx !== 0) slopes.push(((y[j] ?? 0) - (y[i] ?? 0)) / dx);
    }
  }
  const N = slopes.length;
  if (N === 0) return null;
  slopes.sort((a, b) => a - b);
  const slope =
    N % 2 ? (slopes[(N - 1) / 2] ?? 0) : 0.5 * ((slopes[N / 2 - 1] ?? 0) + (slopes[N / 2] ?? 0));
  const C = Z975 * Math.sqrt((n * (n - 1) * (2 * n + 5)) / 18);
  const lo = Math.max(roundHalfEven((N - C) / 2) - 1, 0);
  const hi = Math.min(roundHalfEven((N + C) / 2), N - 1);
  return { slope, lower: slopes[lo] ?? 0, upper: slopes[hi] ?? 0, pairs: N };
}

/** Complementary error function, Numerical Recipes erfcc (fractional error below 1.2e-7). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

export function normalTwoSidedP(z: number): number {
  return erfc(Math.abs(z) / Math.SQRT2);
}

/** Mann-Kendall S of y in time order, tie-corrected variance, Z with continuity correction, two-sided normal p. */
export function mannKendall(y: readonly number[]): MannKendall {
  const n = y.length;
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      s += Math.sign((y[j] ?? 0) - (y[i] ?? 0));
    }
  }
  const ties = new Map<number, number>();
  for (const v of y) ties.set(v, (ties.get(v) ?? 0) + 1);
  let tieTerm = 0;
  for (const t of ties.values()) if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
  const varS = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  const z = s === 0 || varS <= 0 ? 0 : (s - Math.sign(s)) / Math.sqrt(varS);
  return { s, varS, z, p: normalTwoSidedP(z) };
}

/** True for each p that the Benjamini-Hochberg step-up procedure rejects at false discovery rate q. */
export function benjaminiHochberg(pvals: readonly number[], q: number): boolean[] {
  const m = pvals.length;
  const order = pvals.map((_, i) => i).sort((a, b) => (pvals[a] ?? 0) - (pvals[b] ?? 0) || a - b);
  let k = 0;
  order.forEach((i, idx) => {
    if ((pvals[i] ?? 0) <= ((idx + 1) * q) / m) k = idx + 1;
  });
  const passed = new Array<boolean>(m).fill(false);
  for (const i of order.slice(0, k)) passed[i] = true;
  return passed;
}

export function trendDirection(lower: number, upper: number): TrendDirection {
  if (lower > 0) return "upward";
  if (upper < 0) return "downward";
  return "includes_zero";
}
