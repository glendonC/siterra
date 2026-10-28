// Screen positions of points above the land, and the CSS transform that lays a flat box of text onto four
// screen corners. MapLibre's modelViewProjectionMatrix takes world pixels in x and y (Web Mercator times the
// world size) and metres in z (maplibre-gl 6.14.0 src/geo/projection/mercator_transform.ts).

export function mercatorX(lon: number): number {
  return (lon + 180) / 360;
}

export function mercatorY(lat: number): number {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2;
}

/** Column-major 4 x 4, as MapLibre and gl-matrix store it. */
export type Mat4 = ArrayLike<number>;

/** CSS pixel position of lon, lat at elevM metres (exaggeration included), or undefined behind the camera. */
export function projectAt(
  mvp: Mat4,
  worldSize: number,
  lon: number,
  lat: number,
  elevM: number,
  width: number,
  height: number,
): { x: number; y: number } | undefined {
  const x = mercatorX(lon) * worldSize;
  const y = mercatorY(lat) * worldSize;
  const m = (i: number) => mvp[i] ?? 0;
  const cx = m(0) * x + m(4) * y + m(8) * elevM + m(12);
  const cy = m(1) * x + m(5) * y + m(9) * elevM + m(13);
  const cw = m(3) * x + m(7) * y + m(11) * elevM + m(15);
  if (cw <= 1e-9) return undefined;
  return { x: ((cx / cw + 1) / 2) * width, y: ((1 - cy / cw) / 2) * height };
}

type P = { x: number; y: number };

/**
 * CSS matrix3d that maps a w x h box (origin top left) onto the quad tl, tr, br, bl (Heckbert's square to
 * quad projective mapping, scaled to the box).
 */
export function quadMatrix3d(w: number, h: number, tl: P, tr: P, br: P, bl: P): string {
  const dx1 = tr.x - br.x;
  const dx2 = bl.x - br.x;
  const dx3 = tl.x - tr.x + br.x - bl.x;
  const dy1 = tr.y - br.y;
  const dy2 = bl.y - br.y;
  const dy3 = tl.y - tr.y + br.y - bl.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const hh = (dx1 * dy3 - dx3 * dy1) / den;
  const a = tr.x - tl.x + g * tr.x;
  const b = bl.x - tl.x + hh * bl.x;
  const d = tr.y - tl.y + g * tr.y;
  const e = bl.y - tl.y + hh * bl.y;
  const v = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, tl.x, tl.y, 0, 1];
  return `matrix3d(${v.map((n) => n.toFixed(9)).join(",")})`;
}

/** Applies a quad mapping to a box point (for tests): the same numbers quadMatrix3d writes. */
export function mapBoxPoint(
  w: number,
  h: number,
  tl: P,
  tr: P,
  br: P,
  bl: P,
  x: number,
  y: number,
): P {
  const nums = quadMatrix3d(w, h, tl, tr, br, bl)
    .slice("matrix3d(".length, -1)
    .split(",")
    .map(Number);
  const n = (i: number) => nums[i] ?? 0;
  const X = n(0) * x + n(4) * y + n(12);
  const Y = n(1) * x + n(5) * y + n(13);
  const W = n(3) * x + n(7) * y + n(15);
  return { x: X / W, y: Y / W };
}
