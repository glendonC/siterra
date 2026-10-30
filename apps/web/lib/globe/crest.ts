// The line the range name sits on: the crest of the range round the case found in the world grid (the highest smoothed cell
// in each column of longitude), fitted with a parabola and moved to pass through the case, so the name
// clears the case ring at every zoom. Ported from the design lane's hero study A4 (app4.js).

import type { Grid } from "./renderer";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Least squares lat = a + b lon + c lon² by Cramer's rule. */
export function fit2(pts: [number, number][]): [number, number, number] {
  const S = Array.from({ length: 5 }, (_, k) => pts.reduce((s, [x]) => s + x ** k, 0));
  const Y = [0, 1, 2].map((k) => pts.reduce((s, [x, y]) => s + y * x ** k, 0));
  const s = (i: number) => S[i] ?? 0;
  const y = (i: number) => Y[i] ?? 0;
  type M3 = [[number, number, number], [number, number, number], [number, number, number]];
  const M: M3 = [
    [s(0), s(1), s(2)],
    [s(1), s(2), s(3)],
    [s(2), s(3), s(4)],
  ];
  const det = (m: M3) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const col = (k: number): M3 =>
    M.map((r, i) => r.map((v, j) => (j === k ? y(i) : v)) as [number, number, number]) as M3;
  const D = det(M);
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
}

/**
 * The highest 5 x 5 smoothed cell in each 0.2 degree column of a box round the case (on the first case 9.4 W to
 * 4.0 W, 30.2 to 33.0 N). It assumes a range that runs east to west, as the High Atlas does.
 */
export function findCrest(
  world: Grid,
  around: { lon: number; lat: number } = { lon: -6.5372222, lat: 31.6377778 },
): [number, number][] {
  const cell = 360 / world.w;
  const elevAt = (lon: number, lat: number) => {
    const i = Math.round((lon + 180) / cell - 0.5);
    const j = Math.round((90 - lat) / cell - 0.5);
    return (
      world.data[
        (clamp(j, 0, world.h - 1) * world.w + (((i % world.w) + world.w) % world.w)) * 2
      ] ?? 0
    );
  };
  const crest: [number, number][] = [];
  // the box searched round the case: on the first case, -9.4 to -4.0 east and 30.2 to 33.0 north (the High Atlas)
  const w = around.lon - 2.8622222;
  const e = around.lon + 2.5377778;
  const s = around.lat - 1.4377778;
  const n = around.lat + 1.3622222;
  for (let lon = w; lon <= e + 1e-6; lon += 0.2) {
    let bl = around.lat;
    let bv = -1e9;
    for (let lat = s; lat <= n; lat += 0.04) {
      let sum = 0;
      for (let a = -2; a <= 2; a++)
        for (let b = -2; b <= 2; b++) sum += elevAt(lon + a * cell, lat + b * cell);
      if (sum > bv) {
        bv = sum;
        bl = lat;
      }
    }
    crest.push([lon, bl]);
  }
  return crest;
}

/** The fitted arc through the case, sampled every 0.05 degrees and carried on 14 degrees along its end tangents. */
export function crestCurve(
  crest: [number, number][],
  through: { lon: number; lat: number },
): [number, number][] {
  const [qa, qb, qc] = fit2(crest);
  const L0 = crest[0]?.[0] ?? through.lon;
  const L1 = crest.at(-1)?.[0] ?? through.lon;
  const qf = (lon: number) => qa + qb * lon + qc * lon * lon;
  const qd = (lon: number) => qb + 2 * qc * lon;
  const dq = through.lat - qf(through.lon);
  const out: [number, number][] = [];
  for (let lon = L0 - 14; lon <= L1 + 14 + 1e-6; lon += 0.05) {
    const lat =
      lon < L0 ? qf(L0) + qd(L0) * (lon - L0) : lon > L1 ? qf(L1) + qd(L1) * (lon - L1) : qf(lon);
    out.push([lon, dq + lat]);
  }
  return out;
}
