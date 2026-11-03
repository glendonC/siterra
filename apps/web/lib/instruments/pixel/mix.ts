// The pixel anatomy's model: a linear mixture of the measured class spectra. In each band the
// mixed reflectance is the sum over classes of share x class median reflectance, and the NDVI of the mix is
// (B08 - B04) / (B08 + B04). It is a model, not a measurement of plant species.

export type Reflectance = Record<string, number>;
export type Shares = Record<number, number>;

export interface ClassSpectrum {
  code: number;
  median: Reflectance;
}

export function mixSpectra(classes: readonly ClassSpectrum[], shares: Shares): Reflectance {
  const out: Reflectance = {};
  for (const band of Object.keys(classes[0]?.median ?? {})) {
    let v = 0;
    for (const c of classes) v += (shares[c.code] ?? 0) * (c.median[band] ?? 0);
    out[band] = v;
  }
  return out;
}

export function ndviOf(r: Reflectance): number {
  const red = r["B04"] ?? 0;
  const nir = r["B08"] ?? 0;
  return (nir - red) / (nir + red);
}

/**
 * Moves share across one boundary between adjacent classes in `order`: delta > 0 moves the boundary right, so the
 * left class gains and the right class loses. Shares stay within 0 to 1 and keep their sum.
 */
export function moveBoundary(
  order: readonly number[],
  shares: Shares,
  boundary: number,
  delta: number,
): Shares {
  const left = order[boundary];
  const right = order[boundary + 1];
  if (left === undefined || right === undefined) return shares;
  const next = { ...shares };
  const l = next[left] ?? 0;
  const r = next[right] ?? 0;
  const d = Math.max(-l, Math.min(r, delta));
  next[left] = l + d;
  next[right] = r - d;
  return next;
}
