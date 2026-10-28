// The flat reading (MOT-12, "F Read flat"): top-down and north up with terrain off, graticule ticks at the
// frame edges and a scale bar, so areas and patterns can be read. Pure arithmetic for the camera, the
// ticks and the bar; the stage moves the map.

import { EARTH_CIRCUMFERENCE_M, normalizeBearing, type MapCamera } from "./camera";
import { mercatorX, mercatorY } from "./project";

/** The camera move between the beat's view and the flat reading (motion.md, MOT-12, hero). */
export const FLAT_MOVE_MS = 1600;

/** Top-down, north up, over the middle of a west, south, east, north box, fitted inside the padding. */
export function flatCamera(
  box: [number, number, number, number],
  widthPx: number,
  heightPx: number,
  paddingPx: number,
): MapCamera {
  const [w, s, e, n] = box;
  const dx = mercatorX(e) - mercatorX(w);
  const dy = mercatorY(s) - mercatorY(n);
  const world = Math.min((widthPx - 2 * paddingPx) / dx, (heightPx - 2 * paddingPx) / dy);
  const cy = (mercatorY(s) + mercatorY(n)) / 2;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * cy))) * 180) / Math.PI;
  return {
    center: [(w + e) / 2, lat],
    elevation: 0,
    zoom: Math.log2(world / 512),
    pitch: 0,
    bearing: 0,
    verticalFovDeg: 22,
  };
}

const STEPS = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1];

/** Round degree values between two edges, at most `maxTicks` of them, and the decimals they need. */
export function graticuleTicks(
  from: number,
  to: number,
  maxTicks: number,
): { step: number; values: number[]; decimals: number } {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const step = STEPS.find((s) => Math.floor(hi / s) - Math.ceil(lo / s) + 1 <= maxTicks) ?? 1;
  const values: number[] = [];
  for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + 1e-9; i++) values.push(i * step);
  const decimals = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
  return { step, values, decimals };
}

const LENGTHS_M = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

/** The longest round length that fits in `maxPx`, and its length on screen. */
export function scaleBar(metresPerPx: number, maxPx: number): { metres: number; px: number } {
  const metres =
    [...LENGTHS_M].reverse().find((m) => m / metresPerPx <= maxPx) ?? LENGTHS_M[0] ?? 100;
  return { metres, px: Math.round(metres / metresPerPx) };
}

/** Metres per CSS pixel at a latitude, for a top-down map at a zoom (512 px tiles). */
export function metresPerPx(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

export function easeInOut(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
}

/** A camera part way from `a` to `b`; the bearing turns the short way round. */
export function mixCamera(a: MapCamera, b: MapCamera, k: number): MapCamera {
  const lerp = (x: number, y: number) => x + (y - x) * k;
  const turn = normalizeBearing(b.bearing - a.bearing);
  return {
    center: [lerp(a.center[0], b.center[0]), lerp(a.center[1], b.center[1])],
    elevation: lerp(a.elevation, b.elevation),
    zoom: lerp(a.zoom, b.zoom),
    pitch: lerp(a.pitch, b.pitch),
    bearing: k === 0 ? a.bearing : normalizeBearing(a.bearing + turn * k),
    verticalFovDeg: lerp(a.verticalFovDeg, b.verticalFovDeg),
  };
}
