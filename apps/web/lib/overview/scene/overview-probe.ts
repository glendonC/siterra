// Spatial queries and distance-field measurement for the overview scene: terrain ray-marching
// cursor probe (`LandProbe`) and two-pass chamfer distance field for arc clearance (`Gaps`).

import { type Camera, Raycaster, type Scene, Vector2 } from "three";
import type { Frame, Grid, Vec3 } from "../../instruments/valley/frame";
import { clamp01 } from "../arc";
import type { OverviewData } from "../data";
import type { ScreenPoint } from "./overview-sheets";

export interface Gaps {
  /** Smallest distance (design px) from the drawn arc to the land. */
  arc: number;
  /** Distance (design px) from a design point to the land. */
  distanceAt(p: ScreenPoint): number;
}

/** Spatial properties under a screen point on the terrain, read from the case's rasters and vector records. */
export interface LandProbe {
  E: number;
  N: number;
  /** The relief's height there (m). */
  h: number;
  /** The WorldCover class there, of the two the overview draws. */
  cover: "tree" | "crop" | null;
  /** The stream order of the nearest drainage reach within reach of the point, if any. */
  order: number | null;
  /** The id of the nearest proposed route within reach of the point, if any. */
  route: string | null;
  /** Inside the field check's pixel. */
  inPixel: boolean;
}

/** Creates the terrain ray-marching probe that resolves elevation, land cover, stream order, route, and pixel footprint under a cursor position. */
export function createLandProbe(
  landCanvas: HTMLCanvasElement,
  camera: Camera,
  scene: Scene,
  data: OverviewData,
  frame: Frame,
  g: Grid,
  a: Grid,
  M30: Uint8Array,
  lcPx: Uint8ClampedArray,
  sample: (E: number, N: number) => number,
  ceiling: number,
  defaultFov: number,
): (x: number, y: number) => LandProbe | null {
  const ray = new Raycaster();
  const ndc = new Vector2();
  const insideAt = (E: number, N: number) => {
    const i = Math.floor((E - g.E0) / g.res);
    const j = Math.floor((g.N0 - N) / g.res);
    return i >= 0 && j >= 0 && i < g.width && j < g.height && M30[j * g.width + i] === 1;
  };
  const segDist = (E: number, N: number, a0: readonly number[], a1: readonly number[]) => {
    const [x0 = 0, y0 = 0] = a0;
    const [x1 = 0, y1 = 0] = a1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = dx * dx + dy * dy;
    const t = L > 0 ? clamp01(((E - x0) * dx + (N - y0) * dy) / L) : 0;
    return Math.hypot(E - (x0 + dx * t), N - (y0 + dy * t));
  };
  const nearest = <T>(
    lines: readonly { pts: readonly (readonly number[])[]; v: T }[],
    E: number,
    N: number,
    within: number,
  ) => {
    let best: T | null = null;
    let bd = within;
    for (const l of lines)
      for (let k = 1; k < l.pts.length; k++) {
        const p0 = l.pts[k - 1];
        const p1 = l.pts[k];
        if (!p0 || !p1) continue;
        const d = segDist(E, N, p0, p1);
        if (d < bd) {
          bd = d;
          best = l.v;
        }
      }
    return best;
  };
  const reachLines = data.rivers.reaches.map((r) => ({ pts: r.pts, v: r.order }));
  const routeLines = data.routes.map((r) => ({ pts: r.pts, v: r.id }));
  const inPoly = (E: number, N: number, poly: readonly (readonly [number, number])[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i] ?? [0, 0];
      const [xj, yj] = poly[j] ?? [0, 0];
      if (yi > N !== yj > N && E < ((xj - xi) * (N - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  return (x: number, y: number): LandProbe | null => {
    const w = landCanvas.clientWidth;
    const hgt = landCanvas.clientHeight;
    if (w <= 0 || hgt <= 0) return null;
    ndc.set((x / w) * 2 - 1, -(y / hgt) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    const sy = Math.max(0.01, scene.scale.y);
    const ground = (wx: number, wz: number) => {
      const E = frame.E(wx);
      const N = frame.N(wz);
      return insideAt(E, N) ? frame.y(sample(E, N)) * sy : null;
    };
    const far = camera.position.length() * 3 + 50;
    const step = Math.max(0.004, (g.res / 1000) * 0.6);
    let prev = 0;
    for (let t = step; t < far; t += step) {
      const wx = o.x + d.x * t;
      const wy = o.y + d.y * t;
      const wz = o.z + d.z * t;
      if (d.y >= 0 && wy > frame.y(ceiling) * sy) break;
      const gy = ground(wx, wz);
      if (gy !== null && wy <= gy) {
        let lo = prev;
        let hi = t;
        for (let k = 0; k < 14; k++) {
          const m = (lo + hi) / 2;
          const gm = ground(o.x + d.x * m, o.z + d.z * m);
          if (gm !== null && o.y + d.y * m <= gm) hi = m;
          else lo = m;
        }
        const E = frame.E(o.x + d.x * hi);
        const N = frame.N(o.z + d.z * hi);
        const ci = Math.floor((E - a.E0) / a.res);
        const rj = Math.floor((a.N0 - N) / a.res);
        const q =
          ci >= 0 && rj >= 0 && ci < a.width && rj < a.height ? (rj * a.width + ci) * 4 : -1;
        const cover =
          q < 0 ? null : (lcPx[q] ?? 0) > 127 ? "tree" : (lcPx[q + 1] ?? 0) > 127 ? "crop" : null;
        const fov = "fov" in camera && typeof camera.fov === "number" ? camera.fov : defaultFov;
        const mPerPx = ((2 * hi * Math.tan(((fov / 2) * Math.PI) / 180)) / hgt) * 1000;
        const reach = Math.max(2 * g.res, 9 * mPerPx);
        return {
          E,
          N,
          h: sample(E, N),
          cover,
          order: nearest(reachLines, E, N, reach),
          route: nearest(routeLines, E, N, reach),
          inPixel: data.pixel ? inPoly(E, N, data.pixel.footprint) : false,
        };
      }
      prev = t;
    }
    return null;
  };
}

/** Computes a two-pass chamfer distance field (design px) from rendered terrain alpha and measures minimum arc clearance. */
export function measureLandGaps(
  landCanvas: HTMLCanvasElement,
  stageSize: () => { width: number; height: number },
  fit: { scale: number; ox: number; oy: number },
  design: { width: number; height: number },
  arcPts: readonly Vec3[],
  arcA: readonly number[],
  project: (p: Vec3) => ScreenPoint,
): Gaps {
  const { width: W, height: H2 } = stageSize();
  const INF = 1e9;
  const cnv = new OffscreenCanvas(W, H2);
  const x2 = cnv.getContext("2d", { willReadFrequently: true });
  const d = new Float32Array(W * H2);
  if (x2) {
    x2.drawImage(landCanvas, 0, 0, W, H2);
    const px = x2.getImageData(0, 0, W, H2).data;
    for (let i = 0; i < W * H2; i++) d[i] = (px[i * 4 + 3] ?? 0) > 5 ? 0 : INF;
  }
  const S2 = Math.SQRT2;
  const at0 = (i: number) => d[i] ?? INF;
  for (let y = 0; y < H2; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = at0(i);
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, at0(i - 1) + 1);
      if (y > 0) {
        v = Math.min(v, at0(i - W) + 1);
        if (x > 0) v = Math.min(v, at0(i - W - 1) + S2);
        if (x < W - 1) v = Math.min(v, at0(i - W + 1) + S2);
      }
      d[i] = v;
    }
  for (let y = H2 - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = at0(i);
      if (v === 0) continue;
      if (x < W - 1) v = Math.min(v, at0(i + 1) + 1);
      if (y < H2 - 1) {
        v = Math.min(v, at0(i + W) + 1);
        if (x < W - 1) v = Math.min(v, at0(i + W + 1) + S2);
        if (x > 0) v = Math.min(v, at0(i + W - 1) + S2);
      }
      d[i] = v;
    }
  const distanceAt = (p: ScreenPoint) => {
    const xi = Math.round(fit.ox + p.x * fit.scale);
    const yi = Math.round(fit.oy + p.y * fit.scale);
    return xi < 0 || yi < 0 || xi >= W || yi >= H2 ? INF : at0(yi * W + xi) / fit.scale;
  };
  let arc = INF;
  arcPts.forEach((p, i) => {
    if ((arcA[i] ?? 0) <= 0.01) return;
    const q = project(p);
    if (q.x < -4 || q.x > design.width + 4 || q.y < -4 || q.y > design.height + 4) return;
    arc = Math.min(arc, distanceAt(q));
  });
  return { arc, distanceAt };
}
