// Globe geometry for the opening and the dive, ported from the design lane's hero study A4 (globe4.js and
// gl4.js, our own code). Units are Earth radii; x, y, z with z through the north pole.

export type Vec3 = [number, number, number];

export const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const combine = (k: Vec3, e: Vec3, n: Vec3, u: Vec3): Vec3 => [
  k[0] * e[0] + k[1] * n[0] + k[2] * u[0],
  k[0] * e[1] + k[1] * n[1] + k[2] * u[1],
  k[0] * e[2] + k[1] * n[2] + k[2] * u[2],
];

/** Column-major 4 x 4 matrices, as WebGL takes them. */
export const mat = {
  perspective(
    fovy: number,
    aspect: number,
    near: number,
    far: number,
    shiftX = 0,
    shiftY = 0,
  ): Float32Array {
    const f = 1 / Math.tan(fovy / 2);
    const m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    m[8] = -shiftX;
    m[9] = -shiftY;
    return m;
  },
  lookAt(e: Vec3, t: Vec3, u: Vec3): Float32Array {
    const z = norm(sub(e, t));
    const x = norm(cross(u, z));
    const y = cross(z, x);
    return new Float32Array([
      x[0],
      y[0],
      z[0],
      0,
      x[1],
      y[1],
      z[1],
      0,
      x[2],
      y[2],
      z[2],
      0,
      -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]),
      -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]),
      -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]),
      1,
    ]);
  },
  mul(a: Float32Array, b: Float32Array): Float32Array {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        o[j * 4 + i] =
          (a[i] ?? 0) * (b[j * 4] ?? 0) +
          (a[4 + i] ?? 0) * (b[j * 4 + 1] ?? 0) +
          (a[8 + i] ?? 0) * (b[j * 4 + 2] ?? 0) +
          (a[12 + i] ?? 0) * (b[j * 4 + 3] ?? 0);
    return o;
  },
};

/** A point on the unit sphere. */
export const unit = (lon: number, lat: number): Vec3 => [
  Math.cos(rad(lat)) * Math.cos(rad(lon)),
  Math.cos(rad(lat)) * Math.sin(rad(lon)),
  Math.sin(rad(lat)),
];

/** East, north and up at a point on the sphere. */
export function localFrame(lon: number, lat: number): { up: Vec3; east: Vec3; north: Vec3 } {
  const up = unit(lon, lat);
  const east: Vec3 = [-Math.sin(rad(lon)), Math.cos(rad(lon)), 0];
  return { up, east, north: cross(up, east) };
}

export interface GlobeCameraInput {
  lon: number;
  lat: number;
  /** Target height above the sphere, km. */
  h?: number;
  /** Degrees clockwise from north, target to eye. */
  bearing: number;
  /** Degrees above the horizon at the target. */
  pitch: number;
  /** Target to eye, km. */
  distance: number;
  /** Vertical field of view, degrees. */
  fov: number;
  shiftX?: number;
  shiftY?: number;
}

export interface GlobeCamera {
  eye: Vec3;
  target: Vec3;
  right: Vec3;
  upv: Vec3;
  back: Vec3;
  vp: Float32Array;
  proj: [number, number, number, number];
}

/** The valley camera's parameters placed on the globe round lon, lat at h km. */
export function globeCamera(c: GlobeCameraInput, aspect: number): GlobeCamera {
  const { up: U, east: E, north: N } = localFrame(c.lon, c.lat);
  const s = 1 + (c.h ?? 0) / R_KM;
  const target: Vec3 = [U[0] * s, U[1] * s, U[2] * s];
  const b = rad(c.bearing);
  const p = rad(c.pitch);
  const d = c.distance / R_KM;
  const k: Vec3 = [Math.sin(b) * Math.cos(p), Math.cos(b) * Math.cos(p), Math.sin(p)];
  const off = combine(k, E, N, U);
  const eye: Vec3 = [target[0] + d * off[0], target[1] + d * off[1], target[2] + d * off[2]];
  const up = combine(
    [-Math.sin(b) * Math.sin(p), -Math.cos(b) * Math.sin(p), Math.cos(p)],
    E,
    N,
    U,
  );
  const fov = rad(c.fov);
  const sx = c.shiftX ?? 0;
  const sy = c.shiftY ?? 0;
  const near = Math.max(d * 0.02, 1e-5);
  const far = Math.hypot(eye[0], eye[1], eye[2]) + 2;
  const vp = mat.mul(mat.perspective(fov, aspect, near, far, sx, sy), mat.lookAt(eye, target, up));
  const back = norm(sub(eye, target));
  const right = norm(cross(up, back));
  const upv = cross(back, right);
  return { eye, target, right, upv, back, vp, proj: [1 / Math.tan(fov / 2), aspect, sx, sy] };
}

/** Projects a world point to CSS pixels, or undefined behind the camera. */
export function project(
  m: Float32Array,
  p: Vec3,
  w: number,
  h: number,
): [number, number, number] | undefined {
  const at = (i: number) => m[i] ?? 0;
  const x = at(0) * p[0] + at(4) * p[1] + at(8) * p[2] + at(12);
  const y = at(1) * p[0] + at(5) * p[1] + at(9) * p[2] + at(13);
  const ww = at(3) * p[0] + at(7) * p[1] + at(11) * p[2] + at(15);
  if (ww <= 0.001) return undefined;
  return [((x / ww) * 0.5 + 0.5) * w, (1 - ((y / ww) * 0.5 + 0.5)) * h, ww];
}
