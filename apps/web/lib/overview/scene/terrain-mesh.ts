// Terrain geometry builders, catchment mask projection, shadow and horizon-based ambient occlusion
// baking, ring smoothing, and triangulated relief height sampling.

import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  LinearFilter,
  RedFormat,
  RGBAFormat,
  UnsignedByteType,
  type Vector3,
} from "three";
import type { Frame, Grid, Rect } from "../../instruments/valley/frame";

/** The analysis grid (10 m) the land cover raster is on. */
export type AnalysisGrid = Grid;

/** The catchment mask on the 30 m relief cells, read from the B channel of the 10 m land cover raster. */
export function maskOnRelief(lcPixels: Uint8ClampedArray, a: AnalysisGrid, g: Grid): Uint8Array {
  const W = g.width;
  const R = g.height;
  const M = new Uint8Array(W * R);
  for (let j = 0; j < R; j++) {
    const N = g.N0 - (j + 0.5) * g.res;
    const rj = Math.floor((a.N0 - N) / a.res);
    if (rj < 0 || rj >= a.height) continue;
    for (let i = 0; i < W; i++) {
      const E = g.E0 + (i + 0.5) * g.res;
      const ci = Math.floor((E - a.E0) / a.res);
      if (ci < 0 || ci >= a.width) continue;
      M[j * W + i] = (lcPixels[(rj * a.width + ci) * 4 + 2] ?? 0) > 127 ? 1 : 0;
    }
  }
  return M;
}

/**
 * Soft cast shadow toward the light and horizon-based ambient occlusion computed from the relief
 * grid (cells outside the catchment cast nothing). Returns an RGBA texture on the relief grid:
 * R is lit (1) to shadowed, G is open (1).
 */
export function bakeLight(
  H: Float32Array,
  g: Grid,
  M: Uint8Array,
  L: Vector3,
  {
    exag,
    base,
    soft = 14,
    aoKm = 1.4,
    aoDirs = 12,
    aoSteps = 16,
  }: {
    exag: number;
    base: number;
    soft?: number;
    aoKm?: number;
    aoDirs?: number;
    aoSteps?: number;
  },
): DataTexture {
  const W = g.width;
  const R = g.height;
  const cell = g.res / 1000;
  const Y = new Float32Array(W * R);
  let ymax = -1e9;
  for (let k = 0; k < W * R; k++) {
    const y = M[k] ? (((H[k] ?? 0) - base) * exag) / 1000 : -1e3;
    Y[k] = y;
    if (M[k] && y > ymax) ymax = y;
  }
  const yAt = (fi: number, fj: number) => {
    const i = Math.floor(fi);
    const j = Math.floor(fj);
    const fx = fi - i;
    const fy = fj - j;
    const o = j * W + i;
    const a = Y[o] ?? 0;
    const b = Y[o + 1] ?? 0;
    const c = Y[o + W] ?? 0;
    const d = Y[o + W + 1] ?? 0;
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  const lh = Math.hypot(L.x, L.z);
  const dx = L.x / lh;
  const dz = L.z / lh;
  const tanA = L.y / lh;
  const out = new Uint8Array(W * R * 4);
  const dirs: [number, number][] = [];
  for (let k = 0; k < aoDirs; k++) {
    const t = (k / aoDirs) * Math.PI * 2;
    dirs.push([Math.cos(t), Math.sin(t)]);
  }
  for (let j = 1; j < R - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      const k = j * W + i;
      if (!M[k]) {
        out[k * 4] = 255;
        out[k * 4 + 1] = 255;
        out[k * 4 + 3] = 255;
        continue;
      }
      const yk = Y[k] ?? 0;
      const y0 = yk + 0.002;
      let s = 1;
      let t = cell * 0.8;
      for (let n = 0; n < 900; n++) {
        const fi = i + (dx * t) / cell;
        const fj = j + (dz * t) / cell;
        if (fi < 0 || fj < 0 || fi >= W - 1 || fj >= R - 1) break;
        const ry = y0 + tanA * t;
        if (ry > ymax) break;
        const d = ry - yAt(fi, fj);
        s = Math.min(s, (soft * d) / t);
        if (s <= 0) {
          s = 0;
          break;
        }
        t += Math.max(cell * 0.7, t * 0.02);
      }
      // ambient occlusion: mean sine of the horizon angle over aoDirs directions within aoKm
      let occ = 0;
      for (const [ux, uz] of dirs) {
        let hmax = 0;
        for (let st = 1; st <= aoSteps; st++) {
          const dkm = (aoKm * st) / aoSteps;
          const fi = i + (ux * dkm) / cell;
          const fj = j + (uz * dkm) / cell;
          if (fi < 0 || fj < 0 || fi >= W - 1 || fj >= R - 1) break;
          const dy = yAt(fi, fj) - yk;
          if (dy > 0) hmax = Math.max(hmax, dy / Math.hypot(dy, dkm));
        }
        occ += hmax;
      }
      const ao = 1 - occ / aoDirs;
      out[k * 4] = Math.round(Math.max(0, Math.min(1, s)) * 255);
      out[k * 4 + 1] = Math.round(Math.max(0, Math.min(1, ao)) * 255);
      out[k * 4 + 3] = 255;
    }
  }
  const tex = new DataTexture(out, W, R, RGBAFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/** Water's share of each relief cell (0 to 255, row 0 north) as a linear-filtered texture on the relief grid. */
export function waterTexture(water: Uint8Array<ArrayBuffer>, g: Grid): DataTexture {
  const t = new DataTexture(water, g.width, g.height, RedFormat, UnsignedByteType);
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.unpackAlignment = 1;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

/** Builds the triangulated relief mesh geometry, splitting each quad along the flatter diagonal. */
export function buildReliefGeometry(H: Float32Array, g: Grid, frame: Frame): BufferGeometry {
  const W = g.width;
  const R = g.height;
  const pos = new Float32Array(W * R * 3);
  const elev = new Float32Array(W * R);
  let k = 0;
  for (let j = 0; j < R; j++) {
    const z = frame.z(g.N0 - (j + 0.5) * g.res);
    for (let i = 0; i < W; i++, k++) {
      pos[k * 3] = frame.x(g.E0 + (i + 0.5) * g.res);
      pos[k * 3 + 2] = z;
      elev[k] = H[k] ?? 0;
    }
  }
  const idx = new Uint32Array((W - 1) * (R - 1) * 6);
  const h = (n: number) => H[n] ?? 0;
  let t = 0;
  for (let j = 0; j < R - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const a = j * W + i;
      const b = a + 1;
      const c = a + W;
      const d = c + 1;
      if (Math.abs(h(a) - h(d)) < Math.abs(h(b) - h(c))) idx.set([a, c, d, a, d, b], t);
      else idx.set([a, c, b, b, c, d], t);
      t += 6;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  geometry.setAttribute("elev", new BufferAttribute(elev, 1));
  geometry.setIndex(new BufferAttribute(idx, 1));
  return geometry;
}

/** Exact height on the triangulated relief surface, matching the diagonal split in `buildReliefGeometry`. */
export function makeMeshHeightSampler(
  H: Float32Array,
  g: Grid,
): (E: number, N: number) => number {
  return (E: number, N: number): number => {
    const x = (E - g.E0) / g.res - 0.5;
    const y = (g.N0 - N) / g.res - 0.5;
    const i = Math.max(0, Math.min(g.width - 2, Math.floor(x)));
    const j = Math.max(0, Math.min(g.height - 2, Math.floor(y)));
    const fx = Math.max(0, Math.min(1, x - i));
    const fy = Math.max(0, Math.min(1, y - j));
    const at = (n: number) => H[n] ?? 0;
    const ha = at(j * g.width + i);
    const hb = at(j * g.width + i + 1);
    const hc = at((j + 1) * g.width + i);
    const hd = at((j + 1) * g.width + i + 1);
    if (Math.abs(ha - hd) < Math.abs(hb - hc))
      return fy >= fx ? ha + fx * (hd - hc) + fy * (hc - ha) : ha + fx * (hb - ha) + fy * (hd - hb);
    return fx + fy <= 1
      ? ha + fx * (hb - ha) + fy * (hc - ha)
      : hd + (1 - fx) * (hc - hd) + (1 - fy) * (hb - hd);
  };
}

/** Builds the vertical boundary wall geometry hanging from the catchment rim. */
export function buildWallGeometry(
  pts: readonly (readonly [number, number])[],
  sample: (E: number, N: number) => number,
  frame: Frame,
  o: { outward: 1 | -1; depth?: number; smooth?: number },
): BufferGeometry {
  const n = pts.length;
  const smooth = o.smooth ?? 14;
  const depth = o.depth ?? 900;
  const at = (i: number) => pts[((i % n) + n) % n] ?? [0, 0];
  const sm: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let e = 0;
    let nn = 0;
    for (let d = -smooth; d <= smooth; d++) {
      const p = at(i + d);
      e += p[0];
      nn += p[1];
    }
    sm.push([e / (2 * smooth + 1), nn / (2 * smooth + 1)]);
  }
  const count = n + 1;
  const pos = new Float32Array(count * 2 * 3);
  const elev = new Float32Array(count * 2);
  const fr = new Float32Array(count * 2);
  const nor = new Float32Array(count * 2 * 3);
  for (let k = 0; k < count; k++) {
    const i = k % n;
    const p = at(i);
    const a = sm[(i - 1 + n) % n] ?? [0, 0];
    const b = sm[(i + 1) % n] ?? [0, 0];
    const dE = b[0] - a[0];
    const dN = b[1] - a[1];
    const Ln = Math.hypot(dE, dN) || 1;
    const nE = (-dN / Ln) * o.outward;
    const nN = (dE / Ln) * o.outward;
    const top = sample(p[0], p[1]);
    const x = frame.x(p[0]);
    const z = frame.z(p[1]);
    pos.set([x, 0, z, x, 0, z], k * 6);
    elev[k * 2] = top;
    elev[k * 2 + 1] = top - depth;
    fr[k * 2] = 1;
    fr[k * 2 + 1] = 0;
    nor.set([nE, 0, -nN, nE, 0, -nN], k * 6);
  }
  const idx: number[] = [];
  for (let k = 0; k < count - 1; k++) {
    const a = k * 2;
    idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  geometry.setAttribute("elev", new BufferAttribute(elev, 1));
  geometry.setAttribute("fr", new BufferAttribute(fr, 1));
  geometry.setAttribute("wallNormal", new BufferAttribute(nor, 3));
  geometry.setIndex(idx);
  return geometry;
}

/** Builds the horizontal quad geometry and bounding rectangles for the regional survey plan. */
export function buildSurveyPlanGeometry(
  g: Grid,
  frame: Frame,
  maskRect: Rect,
  yPlane = 0,
) {
  const [hx0, hz0, hx1, hz1] = frame.rect(g);
  const cx = (maskRect[0] + maskRect[2]) * 0.5;
  const cz = (maskRect[1] + maskRect[3]) * 0.5;
  const spanX = Math.max(Math.abs(hx1 - hx0), Math.abs(maskRect[2] - maskRect[0])) * 1.45;
  const spanZ = Math.max(Math.abs(hz1 - hz0), Math.abs(maskRect[3] - maskRect[1])) * 1.45;
  const span = Math.max(spanX, spanZ);
  const px0 = cx - span * 0.5;
  const px1 = cx + span * 0.5;
  const pz0 = cz - span * 0.5;
  const pz1 = cz + span * 0.5;

  const pos = new Float32Array([px0, yPlane, pz0, px1, yPlane, pz0, px1, yPlane, pz1, px0, yPlane, pz1]);
  const idx = new Uint16Array([0, 2, 1, 0, 3, 2]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  geometry.setIndex(new BufferAttribute(idx, 1));
  const spanKm = Math.max(Math.abs(hx1 - hx0), Math.abs(hz1 - hz0));
  return { geometry, hx0, hz0, hx1, hz1, px0, pz0, px1, pz1, spanKm };
}

/** Lightly smoothed ring (moving average over 2k + 1 vertices), its closing vertex dropped. */
export function smoothRing(
  ring: readonly (readonly [number, number])[],
  k = 2,
): [number, number][] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = first && last && first[0] === last[0] && first[1] === last[1];
  const n = ring.length - (closed ? 1 : 0);
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let e = 0;
    let nn = 0;
    for (let d = -k; d <= k; d++) {
      const p = ring[(i + d + n) % n] ?? [0, 0];
      e += p[0];
      nn += p[1];
    }
    out.push([e / (2 * k + 1), nn / (2 * k + 1)]);
  }
  return out;
}

/** Signed area in E, N (positive when counter-clockwise seen from above, north up). */
export function signedArea(ring: readonly (readonly [number, number])[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i] ?? [0, 0];
    const q = ring[(i + 1) % ring.length] ?? [0, 0];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
