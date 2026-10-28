// Cameras and easing for the opening, the globe and the dive, ported from the design lane's hero study A4
// (app4.js). A view is a target (lon, lat, tz km), a bearing, a pitch and a distance in km; mixView moves
// between two views with distance on a log scale, so a dive falls on a logarithmic altitude curve.

import { R_KM } from "./frame";

/** Cubic Bezier easing, as CSS cubic-bezier(x1, y1, x2, y2). */
export function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      const d = dx(t);
      if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}

/** Design language 1.3: arrivals ease out, the camera eases in and out. */
export const ARRIVE = bezier(0.2, 0, 0, 1);
export const CAM = bezier(0.65, 0, 0.35, 1);

export interface View {
  lon: number;
  lat: number;
  tz: number;
  bearing: number;
  pitch: number;
  distance: number;
  fov: number;
  shiftX: number;
  shiftY: number;
  /** Dot lattice density relative to the full globe. */
  rows: number;
}

const RAD = Math.PI / 180;
export const FOV = 22;
/** Focal length in CSS px on the 810-tall layout. */
export const F_PX = 405 / Math.tan((FOV / 2) * RAD);

/** Height above the surface at which the globe spans rpx CSS px in radius. */
export const distFor = (rpx: number) => R_KM * Math.sqrt(1 + (F_PX / rpx) ** 2) - R_KM;
/** Projection shift that puts the globe's centre cy CSS px from the top. */
export const shiftFor = (cy: number) => 1 - (2 * cy) / 810;

/** The opening's globe: a large limb under the type, North Africa and Arabia on it. */
export const R_OPEN = 1200;
const OPEN_LL: [number, number] = [8, -12];
/** The limb's top at each beat, CSS px from the top, then at the action. */
export const LIMB = [504, 500, 496, 488] as const;
export const LIMB_ACT = 424;

export const limbView = (top: number): View => ({
  lon: OPEN_LL[0],
  lat: OPEN_LL[1],
  tz: 0,
  bearing: 180,
  pitch: 90,
  distance: distFor(R_OPEN),
  fov: FOV,
  shiftX: 0,
  shiftY: shiftFor(top + R_OPEN),
  rows: 0.55,
});

/** The globe page: North Africa at the centre, 470 CSS px radius. */
export const V_GLOBE: View = {
  lon: -3,
  lat: 25,
  tz: 0,
  bearing: 180,
  pitch: 90,
  distance: distFor(470),
  fov: FOV,
  shiftX: 0,
  shiftY: 0,
  rows: 1,
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function mixView(a: View, b: View, k: number): View {
  return {
    lon: lerp(a.lon, b.lon, k),
    lat: lerp(a.lat, b.lat, k),
    tz: lerp(a.tz, b.tz, k),
    bearing: lerp(a.bearing, b.bearing, k),
    pitch: lerp(a.pitch, b.pitch, k),
    distance: Math.exp(lerp(Math.log(a.distance), Math.log(b.distance), k)),
    fov: lerp(a.fov, b.fov, k),
    shiftX: lerp(a.shiftX, b.shiftX, k),
    shiftY: lerp(a.shiftY, b.shiftY, k),
    rows: lerp(a.rows, b.rows, k),
  };
}
