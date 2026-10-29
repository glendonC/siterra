// The model frame shared by the valley instruments: kilometres in EPSG:32629 around the analysis grid's centre,
// x east, z south, y up, with y = (elevation - base) x exaggeration / 1000, so one scene states one vertical scale.

export type Vec3 = [number, number, number];
/** A rectangle in model x, z: x0, z0, x1, z1. */
export type Rect = [number, number, number, number];

/** A north-up raster grid in EPSG:32629: outer corner (E0, N0), square cells of `res` metres. */
export interface Grid {
  E0: number;
  N0: number;
  res: number;
  width: number;
  height: number;
}

export interface Frame {
  exag: number;
  base: number;
  x(E: number): number;
  z(N: number): number;
  y(h: number): number;
  E(x: number): number;
  N(z: number): number;
  v(E: number, N: number, h: number): Vec3;
  /** A grid's outer rectangle in model x, z. */
  rect(g: Grid): Rect;
}

export function makeFrame(
  origin: { origin_E: number; origin_N: number },
  { exag, base }: { exag: number; base: number },
): Frame {
  const oE = origin.origin_E;
  const oN = origin.origin_N;
  return {
    exag,
    base,
    x: (E) => (E - oE) / 1000,
    z: (N) => (oN - N) / 1000,
    y: (h) => ((h - base) * exag) / 1000,
    E: (x) => oE + x * 1000,
    N: (z) => oN - z * 1000,
    v: (E, N, h) => [(E - oE) / 1000, ((h - base) * exag) / 1000, (oN - N) / 1000],
    rect: (g) => [
      (g.E0 - oE) / 1000,
      (oN - g.N0) / 1000,
      (g.E0 + g.width * g.res - oE) / 1000,
      (oN - (g.N0 - g.height * g.res)) / 1000,
    ],
  };
}

/** Bilinear height (m) at (E, N) on a grid whose values sit at the cell centres; outside, the edge cells. */
export function makeHeightSampler(H: Float32Array, g: Grid): (E: number, N: number) => number {
  const W = g.width;
  const R = g.height;
  return (E, N) => {
    const x = Math.min(Math.max((E - g.E0) / g.res - 0.5, 0), W - 1.000001);
    const y = Math.min(Math.max((g.N0 - N) / g.res - 0.5, 0), R - 1.000001);
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const o = j * W + i;
    const a = H[o] ?? 0;
    const b = H[o + 1] ?? 0;
    const c = H[o + W] ?? 0;
    const d = H[o + W + 1] ?? 0;
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}
