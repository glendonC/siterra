// The land as a physical model: the 30 m relief clipped to the frozen catchment, matte and neutral under one warm
// low light, contour lines every 250 m; section walls carry the same contour steps. Ported from the approved
// specimens' scene code; the colours come from the tokens.

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NoColorSpace,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type DataTexture,
  type Texture,
} from "three";
import { modelColours } from "../../../theme/obsidian";
import { BAND_LIMITS_M } from "../fixtures";
import type { Frame, Grid } from "../frame";
import { channels, hexRgb, type Rgb } from "../palette";

export interface Light {
  /** Unit vector towards the light, model space. */
  dir: Vector3;
  color: Vector3;
  ambient: Vector3;
}

export const rgbVec = (c: Rgb) => new Vector3(c[0], c[1], c[2]);
export const hexVec = (hex: string) => rgbVec(hexRgb(hex));

const HEIGHT_GLSL = /* glsl */ `
uniform sampler2D uH;
uniform vec2 uTex;          // relief grid size in cells
uniform vec4 uHRect;        // relief grid rectangle in model x, z: x0, z0, x1, z1 (outer cell edges)
vec2 hUV(vec2 xz) { return (xz - uHRect.xy) / (uHRect.zw - uHRect.xy); }
float hAt(vec2 uv) {
  vec2 p = uv * uTex - 0.5;
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  ivec2 m = ivec2(uTex) - 1;
  float a = texelFetch(uH, clamp(i, ivec2(0), m), 0).r;
  float b = texelFetch(uH, clamp(i + ivec2(1, 0), ivec2(0), m), 0).r;
  float c = texelFetch(uH, clamp(i + ivec2(0, 1), ivec2(0), m), 0).r;
  float d = texelFetch(uH, clamp(i + ivec2(1, 1), ivec2(0), m), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// a hairline about w device pixels wide at every multiple of interval (metres), faded where lines would crowd
float contour(float h, float interval, float w) {
  float c = (h + 0.37) / interval;
  float fw = max(fwidth(c), 1e-5);
  float l = 1.0 - smoothstep(0.0, w, abs(fract(c - 0.5) - 0.5) / fw);
  return l * (1.0 - smoothstep(0.25, 0.6, fw));
}
`;

const RELIEF_VERT = /* glsl */ `
attribute float elev;
uniform float uExag, uBase;
varying vec3 vWorld;
varying float vElev;
void main() {
  vec3 p = vec3(position.x, (elev - uBase) * uExag / 1000.0, position.z);
  vElev = elev;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RELIEF_FRAG = /* glsl */ `
${HEIGHT_GLSL}
uniform sampler2D uMask;    // B channel: inside the catchment (10 m analysis grid)
uniform vec4 uMaskRect;
uniform vec4 uCut;          // nx, nz, offset, on: keep where dot(xz, n) >= offset
uniform vec3 uOffset;       // model translation of this block (for an exploded cut)
uniform float uExag;
uniform vec3 uL, uLight, uAmbient, uAlbedo, uShadow, uLine;
uniform float uContour, uIndex;
uniform sampler2D uCover;   // optional WorldCover marks: R tree cover, G cropland or built-up
uniform float uCoverA;
uniform vec3 uTreeC, uCropC, uLimitC;
uniform vec2 uLimits;      // the equal-area band limits (m)
uniform float uBandLines;
varying vec3 vWorld;
varying float vElev;
float limitLine(float h, float at, float w) { float fw = max(fwidth(h), 1e-3); return 1.0 - smoothstep(0.0, w, abs(h - at) / fw); }
void main() {
  vec2 xz = vWorld.xz - uOffset.xz;
  vec2 mu = (xz - uMaskRect.xy) / (uMaskRect.zw - uMaskRect.xy);
  vec4 mk = texture(uMask, mu);
  if (mk.b < 0.5 || mu.x < 0.0 || mu.y < 0.0 || mu.x > 1.0 || mu.y > 1.0) discard;
  if (uCut.w > 0.5 && dot(xz, uCut.xy) < uCut.z) discard;

  vec2 uv = hUV(xz);
  float h = hAt(uv);
  vec2 e = 1.0 / uTex;
  float cell = 30.0;
  float hl = hAt(uv - vec2(e.x, 0.0)), hr = hAt(uv + vec2(e.x, 0.0));
  float hn = hAt(uv - vec2(0.0, e.y)), hs = hAt(uv + vec2(0.0, e.y));
  vec3 n = normalize(vec3(-(hr - hl) / (2.0 * cell) * uExag, 1.0, -(hs - hn) / (2.0 * cell) * uExag));
  float lap = (hl + hr + hn + hs - 4.0 * h);

  float diff = max(dot(n, uL), 0.0);
  float sky = 0.55 + 0.45 * n.y;
  vec3 col = uAlbedo * (uLight * diff + uAmbient * sky);
  col = mix(uShadow, col, smoothstep(-0.05, 0.25, diff) * 0.35 + 0.65);
  // a faint cavity term: channel floors slightly darker, crests slightly lighter (from the relief itself)
  col *= 1.0 - clamp(lap / 120.0, -0.10, 0.10);

  if (uCoverA > 0.001) {
    vec4 cv = texture(uCover, mu);
    float shade = 0.55 + 0.6 * diff;
    col = mix(col, uTreeC * shade, cv.r * uCoverA);
    col = mix(col, uCropC * shade, cv.g * uCoverA);
  }

  float c250 = contour(h, 250.0, 0.9);
  float c1000 = contour(h, 1000.0, 1.25);
  col = mix(col, uLine, clamp(c250 * uContour + c1000 * uIndex, 0.0, 1.0));
  if (uBandLines > 0.001) col = mix(col, uLimitC, max(limitLine(h, uLimits.x, 1.1), limitLine(h, uLimits.y, 1.1)) * uBandLines);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** The one warm low light: from a bearing (degrees clockwise from north), an altitude above the horizon. */
export function lightFrom(bearing: number, altitude: number, ambientScale: number): Light {
  const b = (bearing * Math.PI) / 180;
  const a = (altitude * Math.PI) / 180;
  return {
    dir: new Vector3(Math.sin(b) * Math.cos(a), Math.sin(a), -Math.cos(b) * Math.cos(a)),
    color: hexVec(modelColours.keyLight),
    ambient: hexVec(modelColours.ambient).multiplyScalar(ambientScale),
  };
}

export interface ReliefOptions {
  hTex: DataTexture;
  light: Light;
  cover?: Texture;
  coverA?: number;
  bandLines?: number;
  contour?: number;
  index?: number;
}

/**
 * The relief mesh: one vertex per 30 m cell centre, heights in an attribute, shading from the height texture.
 * Its uniforms are returned too, so a cutaway can set the cut after building it.
 */
export function createRelief(
  H: Float32Array,
  g: Grid,
  frame: Frame,
  mask: Texture,
  maskRect: [number, number, number, number],
  o: ReliefOptions,
) {
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
  let t = 0;
  const h = (n: number) => H[n] ?? 0;
  for (let j = 0; j < R - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const a = j * W + i;
      const b = a + 1;
      const c = a + W;
      const d = c + 1;
      // split each cell along the diagonal that follows the terrain better (lower pair joined)
      if (Math.abs(h(a) - h(d)) < Math.abs(h(b) - h(c))) idx.set([a, c, d, a, d, b], t);
      else idx.set([a, c, b, b, c, d], t);
      t += 6;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  geometry.setAttribute("elev", new BufferAttribute(elev, 1));
  geometry.setIndex(new BufferAttribute(idx, 1));
  const uniforms = {
    uH: { value: o.hTex },
    uTex: { value: new Vector2(W, R) },
    uHRect: { value: new Vector4(...frame.rect(g)) },
    uMask: { value: mask },
    uMaskRect: { value: new Vector4(...maskRect) },
    uCut: { value: new Vector4(0, 0, 0, 0) },
    uOffset: { value: new Vector3() },
    uExag: { value: frame.exag },
    uBase: { value: frame.base },
    uL: { value: o.light.dir.clone() },
    uLight: { value: o.light.color.clone() },
    uAmbient: { value: o.light.ambient.clone() },
    uAlbedo: { value: hexVec(modelColours.reliefAlbedo) },
    uShadow: { value: hexVec(modelColours.reliefShadow) },
    uLine: { value: hexVec(modelColours.contour) },
    uContour: { value: o.contour ?? 0.22 },
    uIndex: { value: o.index ?? 0.42 },
    uCover: { value: o.cover ?? mask },
    uCoverA: { value: o.coverA ?? 0 },
    uTreeC: { value: hexVec(modelColours.coverTree) },
    uCropC: { value: hexVec(modelColours.coverCrop) },
    uLimitC: { value: rgbVec(channels(modelColours.bandLimit)) },
    uLimits: { value: new Vector2(...BAND_LIMITS_M) },
    uBandLines: { value: o.bandLines ?? 0 },
  };
  const material = new ShaderMaterial({
    vertexShader: RELIEF_VERT,
    fragmentShader: RELIEF_FRAG,
    uniforms,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

const WALL_VERT = /* glsl */ `
attribute float elev;
attribute vec3 wallNormal;
uniform float uExag, uBase;
varying vec3 vWorld;
varying vec3 vN;
varying float vElev;
void main() {
  vec3 p = vec3(position.x, (elev - uBase) * uExag / 1000.0, position.z);
  vElev = elev;
  vN = wallNormal;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WALL_FRAG = /* glsl */ `
uniform vec3 uL, uLight, uAmbient, uAlbedo, uLine, uLimitC;
uniform float uLineA, uFade;
uniform vec3 uBandTint, uBandA;
uniform float uLimitA;
uniform vec2 uLimits;
varying vec3 vWorld;
varying vec3 vN;
varying float vElev;
float contour(float h, float interval, float w) {
  float c = (h + 0.37) / interval;
  float fw = max(fwidth(c), 1e-5);
  float l = 1.0 - smoothstep(0.0, w, abs(fract(c - 0.5) - 0.5) / fw);
  return l * (1.0 - smoothstep(0.25, 0.6, fw));
}
void main() {
  vec3 n = normalize(vN);
  float diff = max(dot(n, uL), 0.0);
  vec3 col = uAlbedo * (uLight * diff * 0.75 + uAmbient * 1.35);
  // the wall darkens toward the plinth base so the model sits on the table
  col *= mix(0.55, 1.0, smoothstep(0.0, uFade, vWorld.y));
  float c = contour(vElev, 250.0, 0.8);
  col = mix(col, uLine, c * uLineA);
  // the elevation bands on the section: a faint tint per band and a line at each limit
  float ta = vElev < uLimits.x ? uBandA.x : vElev < uLimits.y ? uBandA.y : uBandA.z;
  col = mix(col, uBandTint, ta);
  float fw = max(fwidth(vElev), 1e-3);
  float ln = max(1.0 - smoothstep(0.0, 1.3, abs(vElev - uLimits.x) / fw), 1.0 - smoothstep(0.0, 1.3, abs(vElev - uLimits.y) / fw));
  col = mix(col, uLimitC, ln * uLimitA);
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface WallOptions {
  light: Light;
  closed?: boolean;
  /** +1 or -1: which side of the polyline (its left normal) the wall faces. */
  outward?: 1 | -1;
  lineA?: number;
  fade?: number;
  /** Heights of the wall's top edge, one per point; the relief height when absent. */
  tops?: readonly number[];
  bandA?: [number, number, number];
  limitA?: number;
}

/** A vertical wall under a polyline of (E, N) points, from the relief surface down to the base elevation. */
export function createWall(
  pts: readonly (readonly [number, number])[],
  sample: (E: number, N: number) => number,
  frame: Frame,
  o: WallOptions,
): Mesh {
  const n = pts.length;
  const closed = o.closed ?? false;
  const outward = o.outward ?? 1;
  const count = closed ? n + 1 : n;
  const pos = new Float32Array(count * 6);
  const elev = new Float32Array(count * 2);
  const nor = new Float32Array(count * 6);
  const at = (i: number): readonly [number, number] => pts[((i % n) + n) % n] ?? [0, 0];
  for (let k = 0; k < count; k++) {
    const i = k % n;
    const p = at(i);
    let dE: number;
    let dN: number;
    if (!closed && i === 0) {
      dE = at(1)[0] - p[0];
      dN = at(1)[1] - p[1];
    } else if (!closed && i === n - 1) {
      dE = p[0] - at(n - 2)[0];
      dN = p[1] - at(n - 2)[1];
    } else {
      dE = at(i + 1)[0] - at(i - 1)[0];
      dN = at(i + 1)[1] - at(i - 1)[1];
    }
    const L = Math.hypot(dE, dN) || 1;
    // left normal of the direction in (E, N), then to model (x, z = -N)
    const nE = (-dN / L) * outward;
    const nN = (dE / L) * outward;
    const top = o.tops?.[i] ?? sample(p[0], p[1]);
    const x = frame.x(p[0]);
    const z = frame.z(p[1]);
    pos.set([x, 0, z, x, 0, z], k * 6);
    elev[k * 2] = top;
    elev[k * 2 + 1] = frame.base;
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
  geometry.setAttribute("wallNormal", new BufferAttribute(nor, 3));
  geometry.setIndex(idx);
  const uniforms = {
    uExag: { value: frame.exag },
    uBase: { value: frame.base },
    uL: { value: o.light.dir.clone() },
    uLight: { value: o.light.color.clone() },
    uAmbient: { value: o.light.ambient.clone() },
    uAlbedo: { value: hexVec(modelColours.wallAlbedo) },
    uLine: { value: hexVec(modelColours.wallContour) },
    uLineA: { value: o.lineA ?? 0.28 },
    uFade: { value: o.fade ?? 0.9 },
    uBandTint: { value: hexVec(modelColours.wallBandTint) },
    uBandA: { value: new Vector3(...(o.bandA ?? [0, 0, 0])) },
    uLimitA: { value: o.limitA ?? 0 },
    uLimitC: { value: rgbVec(channels(modelColours.wallLimit)) },
    uLimits: { value: new Vector2(...BAND_LIMITS_M) },
  };
  const material = new ShaderMaterial({
    vertexShader: WALL_VERT,
    fragmentShader: WALL_FRAG,
    uniforms,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

/** A soft shadow on the table under a footprint (model x, z), drawn as a blurred canvas texture. */
export function contactShadow(
  ringXZ: readonly (readonly [number, number])[],
  { blurPx = 26, alpha = 0.75, pad = 3, y = -0.002, res = 1024 } = {},
): Mesh {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of ringXZ) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  x0 -= pad;
  z0 -= pad;
  x1 += pad;
  z1 += pad;
  const W = res;
  const H = Math.round((res * (z1 - z0)) / (x1 - x0));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (g) {
    g.filter = `blur(${String(blurPx)}px)`;
    g.globalAlpha = alpha;
    g.fillStyle = modelColours.tableShadow;
    g.beginPath();
    ringXZ.forEach(([x, z], i) => {
      const u = ((x - x0) / (x1 - x0)) * W;
      const v = ((z - z0) / (z1 - z0)) * H;
      if (i) g.lineTo(u, v);
      else g.moveTo(u, v);
    });
    g.closePath();
    g.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  const geometry = new PlaneGeometry(x1 - x0, z1 - z0);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  mesh.renderOrder = -1;
  return mesh;
}
