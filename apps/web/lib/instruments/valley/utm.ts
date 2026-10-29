// WGS 84 longitude and latitude to UTM north (EPSG:326zz), by Krüger's series to the third order in n, which is
// well under a millimetre within a zone. The transect bundles give their samples in degrees; the valley
// instruments' model frame is in EPSG:32629.

const A_AXIS = 6378137;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const FALSE_EASTING = 500000;

const n = F / (2 - F);
const RECT = (A_AXIS / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64);
const ALPHA = [
  n / 2 - (2 / 3) * n ** 2 + (5 / 16) * n ** 3,
  (13 / 48) * n ** 2 - (3 / 5) * n ** 3,
  (61 / 240) * n ** 3,
] as const;
const E2N = (2 * Math.sqrt(n)) / (1 + n);
const DEG = Math.PI / 180;

/** Easting and northing (m) in UTM zone `zone`, northern hemisphere. */
export function lonLatToUtm(lon: number, lat: number, zone: number): [number, number] {
  const phi = lat * DEG;
  const dLambda = (lon - (zone * 6 - 183)) * DEG;
  const s = Math.sin(phi);
  const t = Math.sinh(Math.atanh(s) - E2N * Math.atanh(E2N * s));
  const xi = Math.atan2(t, Math.cos(dLambda));
  const eta = Math.atanh(Math.sin(dLambda) / Math.sqrt(1 + t * t));
  let x = eta;
  let y = xi;
  ALPHA.forEach((a, k) => {
    const j = 2 * (k + 1);
    x += a * Math.cos(j * xi) * Math.sinh(j * eta);
    y += a * Math.sin(j * xi) * Math.cosh(j * eta);
  });
  return [FALSE_EASTING + K0 * RECT * x, K0 * RECT * y];
}
