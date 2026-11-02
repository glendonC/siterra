// The overview's land as a physical model (approved specimen D4, js/terrain.js): the 30 m relief clipped to the
// frozen catchment, lit by one warm low light with a soft cast shadow and ambient occlusion baked once from the
// relief itself (no invented shading), the WorldCover drape mixed into the albedo so it takes the same light, faint
// 250 m contours, a cool rim where slopes turn away, fog with distance, and an edge that dissolves downward. A
// depth-only copy hides the arc behind the land on its own canvas. The instruments keep specimen B's terrain
// (lib/instruments/valley/scene/terrain.ts); every colour here comes in from the tokens.

import {
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DataTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  type Texture,
} from "three";
import type { Frame, Grid, Rect } from "../../instruments/valley/frame";
import { hexRgb } from "../../instruments/valley/palette";
import type { Channels } from "../../theme/obsidian";

export const hexVec = (hex: string) => new Vector3(...hexRgb(hex));
export const channelVec = (c: Channels) => new Vector3(c[0], c[1], c[2]);

export interface Light {
  /** Unit vector towards the light, model space. */
  dir: Vector3;
  color: Vector3;
  ambient: Vector3;
  sky: Vector3;
}

/** The direction towards a light at a bearing (degrees clockwise from north) and an altitude. */
export function lightDir(bearing: number, altitude: number): Vector3 {
  const b = (bearing * Math.PI) / 180;
  const a = (altitude * Math.PI) / 180;
  return new Vector3(Math.sin(b) * Math.cos(a), Math.sin(a), -Math.cos(b) * Math.cos(a));
}

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
float contour(float h, float interval, float w) {
  float c = (h + 0.37) / interval;
  float fw = max(fwidth(c), 1e-5);
  float l = 1.0 - smoothstep(0.0, w, abs(fract(c - 0.5) - 0.5) / fw);
  return l * (1.0 - smoothstep(0.25, 0.6, fw));
}
float limitLine(float h, float at, float w) { float fw = max(fwidth(h), 1e-3); return 1.0 - smoothstep(0.0, w, abs(h - at) / fw); }
`;

const RELIEF_VERT = /* glsl */ `
attribute float elev;
uniform float uExag, uBase;
varying vec3 vWorld;
void main() {
  vec3 p = vec3(position.x, (elev - uBase) * uExag / 1000.0, position.z);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RELIEF_FRAG = /* glsl */ `
${HEIGHT_GLSL}
uniform sampler2D uMask;    // B channel: inside the catchment (10 m analysis grid); R tree cover; G cropland or built-up
uniform vec4 uMaskRect;
uniform sampler2D uLM;      // baked from the relief: R soft cast shadow (1 lit), G ambient occlusion (1 open)
uniform float uExag;
uniform vec3 uL, uLight, uAmbient, uSky, uAlbedo, uLine, uTreeC, uCropC, uLimitC;
uniform float uContour, uIndex, uCoverA, uLimitA, uLimitAt;
uniform vec3 uFogC;
uniform vec3 uFog;          // near, far (km from the camera), max mix
uniform float uDim;         // 1 normal; lower dims the land (the ask open)
uniform vec3 uRimC;
uniform float uRimA, uSmooth;
uniform sampler2D uOver;    // a finding's footprint painted on the land (RGBA, row 0 north, over uOverRect)
uniform vec4 uOverRect;
uniform float uOverA;       // 0 none, 1 the footprint shown
uniform float uBandAt, uBandA; // a band below this height (m) lit, the rest stepped back (0 to 1)
uniform float uRangeLo, uRangeHi, uRangeA; // a proposed field check's band between two heights (m), lit (UI-2)
uniform vec3 uRangeC;       // its colour: the accent, for a proposed thing
uniform vec2 uSnowLimits;   // the two elevation band limits (m), for snow by band (UI-2, See It Over Time)
uniform vec3 uSnow;         // each band's share under snow that month, lowest band first (0 to 1)
uniform float uSnowA;
uniform vec3 uSnowC;
uniform float uCarve;
varying vec3 vWorld;
void main() {
  vec2 xz = vWorld.xz;
  vec2 mu = (xz - uMaskRect.xy) / (uMaskRect.zw - uMaskRect.xy);
  vec4 mk = texture(uMask, mu);
  if (mk.b < 0.5 || mu.x < 0.0 || mu.y < 0.0 || mu.x > 1.0 || mu.y > 1.0) discard;

  vec2 uv = hUV(xz);
  float h = hAt(uv);
  vec2 e = 1.0 / uTex;
  float cell = 30.0;
  float effExag = uExag * mix(0.28, 1.0, uCarve);
  float hl = hAt(uv - vec2(e.x, 0.0)), hr = hAt(uv + vec2(e.x, 0.0));
  float hn = hAt(uv - vec2(0.0, e.y)), hs = hAt(uv + vec2(0.0, e.y));
  vec3 n1 = normalize(vec3(-(hr - hl) / (2.0 * cell) * effExag, 1.0, -(hs - hn) / (2.0 * cell) * effExag));
  // a second normal over 90 m, so the 30 m micro-relief reads as texture, not as hair
  float hl3 = hAt(uv - vec2(3.0 * e.x, 0.0)), hr3 = hAt(uv + vec2(3.0 * e.x, 0.0));
  float hn3 = hAt(uv - vec2(0.0, 3.0 * e.y)), hs3 = hAt(uv + vec2(0.0, 3.0 * e.y));
  vec3 n3 = normalize(vec3(-(hr3 - hl3) / (6.0 * cell) * effExag, 1.0, -(hs3 - hn3) / (6.0 * cell) * effExag));
  vec3 n = normalize(mix(n1, n3, uSmooth));
  float lap = (hl + hr + hn + hs - 4.0 * h);
  vec4 lm = texture(uLM, uv);
  float sh = mix(0.88, lm.r, uCarve), ao = mix(0.96, lm.g, uCarve);

  // albedo: neutral ground, then the WorldCover classes (2021, 10 m) mixed in before the light
  vec3 alb = uAlbedo;
  alb = mix(alb, uCropC, mk.g * uCoverA);
  alb = mix(alb, uTreeC, mk.r * uCoverA);

  float diff = max(dot(n, uL), 0.0) * sh;
  float sky = 0.5 + 0.5 * n.y;
  vec3 col = alb * (uLight * diff + uAmbient * ao * sky) + uSky * pow(1.0 - n.y, 2.0) * 0.06 * ao;
  // channel floors a touch darker, crests a touch lighter (from the relief itself)
  col *= 1.0 - clamp(lap / 220.0, -0.05, 0.05);

  // a finding's footprint on the land, lit by the land's own light so the relief still reads through it
  if (uOverA > 0.001) {
    vec2 ou = (xz - uOverRect.xy) / (uOverRect.zw - uOverRect.xy);
    vec4 ov = texture(uOver, ou);
    float shade = 0.5 + 0.5 * clamp(diff * 1.1 + 0.3 * sky, 0.0, 1.0);
    col = mix(col, ov.rgb * shade, ov.a * uOverA);
  }
  // the band a finding is about lit, the rest of the land stepped back
  if (uBandA > 0.001) {
    float inBand = 1.0 - smoothstep(uBandAt - 6.0, uBandAt + 6.0, h);
    col *= mix(1.0, mix(0.42, 1.12, inBand), uBandA);
  }

  // the band a proposed field check stands on, in the accent, the rest stepped back (the next-steps package)
  if (uRangeA > 0.001) {
    float inRange = smoothstep(uRangeLo - 6.0, uRangeLo + 6.0, h) * (1.0 - smoothstep(uRangeHi - 6.0, uRangeHi + 6.0, h));
    col *= mix(1.0, mix(0.5, 1.0, inRange), uRangeA);
    col = mix(col, uRangeC * (0.35 + 0.65 * diff), inRange * 0.42 * uRangeA);
  }

  // a month's snow, each band's measured share spread evenly over that band (where in the band it lay is not drawn)
  if (uSnowA > 0.001) {
    float b0 = 1.0 - smoothstep(uSnowLimits.x - 6.0, uSnowLimits.x + 6.0, h);
    float b2 = smoothstep(uSnowLimits.y - 6.0, uSnowLimits.y + 6.0, h);
    float share = uSnow.x * b0 + uSnow.y * (1.0 - b0 - b2) + uSnow.z * b2;
    col = mix(col, uSnowC * (0.45 + 0.55 * clamp(diff * 1.1 + 0.3 * sky, 0.0, 1.0)), clamp(share, 0.0, 1.0) * 0.85 * uSnowA);
  }

  float c250 = contour(h, 250.0, 0.9);
  float c1000 = contour(h, 1000.0, 1.2);
  float c50 = contour(h, 50.0, 0.75);
  col = mix(col, uLine, clamp(c250 * mix(0.55, uContour, uCarve) + c1000 * mix(0.65, uIndex, uCarve) + c50 * (1.0 - uCarve) * 0.25, 0.0, 1.0) * (0.55 + 0.45 * diff));
  if (uLimitA > 0.001) col = mix(col, uLimitC, limitLine(h, uLimitAt, 1.0) * uLimitA);

  // During Stage 1 (2D Survey Plan, uCarve < 1.0), overlay the Death Stranding survey grid & extraction tint
  if (uCarve < 0.999) {
    float planW = 1.0 - uCarve;
    vec2 gCoord = xz / 3.5;
    vec2 gFract = abs(fract(gCoord - 0.5) - 0.5);
    vec2 gFw = max(fwidth(gCoord), 1e-4);
    vec2 gLine2 = 1.0 - smoothstep(0.0, 1.2, gFract / gFw);
    float majorGrid = max(gLine2.x, gLine2.y);
    float distToNode = max(gFract.x, gFract.y);
    float onCrossArm = majorGrid * (1.0 - smoothstep(0.06, 0.11, distToNode));
    vec3 surveyCol = mix(col, vec3(0.15, 0.39, 0.92), 0.18 + majorGrid * 0.32 + onCrossArm * 0.55);
    col = mix(col, surveyCol, planW);
  }

  // a cool rim where slopes turn away from the eye, so the silhouette separates from the dark ground
  vec3 vdir = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(n, vdir), 0.0, 1.0), 4.0);
  col += uRimC * fres * uRimA;
  float dist = distance(cameraPosition, vWorld);
  col = mix(col, uFogC, smoothstep(uFog.x, uFog.y, dist) * uFog.z);
  col *= uDim;
  gl_FragColor = vec4(col, 1.0);
}
`;

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
 * Soft cast shadow toward the light and horizon-based ambient occlusion, from the relief only (cells outside the
 * catchment cast nothing, as on a cut model). An RGBA texture on the relief grid: R lit (1) to shadowed, G open (1).
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
      // cast shadow
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

export interface ReliefColours {
  albedo: string;
  line: string;
  treeC: string;
  cropC: string;
  limitC: Channels;
  fogC: string;
  rimC: string;
}

export interface ReliefOptions {
  hTex: DataTexture;
  light: Light;
  lightMap: Texture;
  colours: ReliefColours;
  coverA: number;
  rimA: number;
  smooth: number;
  contour?: number;
  index?: number;
  limitA?: number;
  limitAt?: number;
}

/** No footprint: one transparent texel. */
const EMPTY_OVERLAY = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, RGBAFormat);
EMPTY_OVERLAY.needsUpdate = true;

export function createRelief(
  H: Float32Array,
  g: Grid,
  frame: Frame,
  maskTex: Texture,
  maskRect: Rect,
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
  const c = o.colours;
  const uniforms = {
    uH: { value: o.hTex },
    uTex: { value: new Vector2(W, R) },
    uHRect: { value: new Vector4(...frame.rect(g)) },
    uMask: { value: maskTex },
    uMaskRect: { value: new Vector4(...maskRect) },
    uLM: { value: o.lightMap },
    uExag: { value: frame.exag },
    uBase: { value: frame.base },
    uL: { value: o.light.dir.clone() },
    uLight: { value: o.light.color.clone() },
    uAmbient: { value: o.light.ambient.clone() },
    uSky: { value: o.light.sky.clone() },
    uAlbedo: { value: hexVec(c.albedo) },
    uLine: { value: hexVec(c.line) },
    uContour: { value: o.contour ?? 0.12 },
    uIndex: { value: o.index ?? 0.22 },
    uCoverA: { value: o.coverA },
    uTreeC: { value: hexVec(c.treeC) },
    uCropC: { value: hexVec(c.cropC) },
    uLimitC: { value: channelVec(c.limitC) },
    uLimitA: { value: o.limitA ?? 0 },
    uLimitAt: { value: o.limitAt ?? 0 },
    uFogC: { value: hexVec(c.fogC) },
    uFog: { value: new Vector3(60, 120, 0) },
    uDim: { value: 1 },
    uRimC: { value: hexVec(c.rimC) },
    uRimA: { value: o.rimA },
    uSmooth: { value: o.smooth },
    uOver: { value: EMPTY_OVERLAY as Texture },
    uOverRect: { value: new Vector4(...frame.rect(g)) },
    uOverA: { value: 0 },
    uBandAt: { value: 0 },
    uBandA: { value: 0 },
    uRangeLo: { value: -1e5 },
    uRangeHi: { value: 1e5 },
    uRangeA: { value: 0 },
    uRangeC: { value: new Vector3(0, 0, 0) },
    uSnowLimits: { value: new Vector2(0, 0) },
    uSnow: { value: new Vector3(0, 0, 0) },
    uSnowA: { value: 0 },
    uSnowC: { value: new Vector3(1, 1, 1) },
    uCarve: { value: 1 },
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

export type Relief = ReturnType<typeof createRelief>;

const WALL_VERT = /* glsl */ `
attribute float elev;
attribute float fr;
attribute vec3 wallNormal;
uniform float uExag, uBase;
varying vec3 vN;
varying float vFr;
varying float vElev;
void main() {
  vec3 p = vec3(position.x, (elev - uBase) * uExag / 1000.0, position.z);
  vFr = fr;
  vN = wallNormal;
  vElev = elev;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}
`;
const WALL_FRAG = /* glsl */ `
uniform vec3 uL, uLight, uAmbient, uAlbedo;
uniform float uDim, uFadePow;
varying vec3 vN;
varying float vFr;
varying float vElev;
float wallContour(float h, float interval, float w) {
  float c = (h + 0.37) / interval;
  float fw = max(fwidth(c), 1e-5);
  float l = 1.0 - smoothstep(0.0, w, abs(fract(c - 0.5) - 0.5) / fw);
  return l * (1.0 - smoothstep(0.25, 0.6, fw));
}
void main() {
  vec3 n = normalize(vN);
  float diff = max(dot(n, uL), 0.0);
  vec3 col = uAlbedo * (uLight * diff * 0.42 + uAmbient * 1.12);
  // geological & topographic elevation strata along the carved block wall
  float c250 = wallContour(vElev, 250.0, 0.95);
  float c75 = wallContour(vElev, 75.0, 0.7);
  col = mix(col, col * 1.38, (c250 * 0.55 + c75 * 0.22) * vFr);
  // crisp top-cut bevel right under the relief surface rim
  float lip = smoothstep(0.88, 1.0, vFr);
  col += uLight * lip * (0.08 + 0.12 * diff);
  // the edge of the slab dissolves downward: opaque at the land's rim, gone a little below it
  float a = pow(clamp(vFr, 0.0, 1.0), uFadePow);
  col *= uDim * (0.55 + 0.45 * vFr);
  gl_FragColor = vec4(col * a, a);
}
`;

/**
 * The rim of the model: a band hanging from the relief at the catchment edge, `depth` metres deep, fading out
 * downward. Normals come from a strongly smoothed copy of the edge so the band shades as one surface.
 */
export function createWall(
  pts: readonly (readonly [number, number])[],
  sample: (E: number, N: number) => number,
  frame: Frame,
  o: {
    outward: 1 | -1;
    albedo: string;
    light: Light;
    depth?: number;
    fadePow?: number;
    smooth?: number;
  },
) {
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
  const uniforms = {
    uExag: { value: frame.exag },
    uBase: { value: frame.base },
    uL: { value: o.light.dir.clone() },
    uLight: { value: o.light.color.clone() },
    uAmbient: { value: o.light.ambient.clone() },
    uAlbedo: { value: hexVec(o.albedo) },
    uDim: { value: 1 },
    uFadePow: { value: o.fadePow ?? 2.2 },
  };
  const material = new ShaderMaterial({
    vertexShader: WALL_VERT,
    fragmentShader: WALL_FRAG,
    uniforms,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return { mesh, uniforms };
}

// A depth-only copy of the relief for a second renderer: it hides what stands behind the land without drawing it, so
// an overlay (the arc) can be drawn crisp on its own canvas yet still pass behind the land.
const OCCL_FRAG = /* glsl */ `
uniform sampler2D uMask;
uniform vec4 uMaskRect;
varying vec3 vWorld;
void main() {
  vec2 mu = (vWorld.xz - uMaskRect.xy) / (uMaskRect.zw - uMaskRect.xy);
  if (texture(uMask, mu).b < 0.5 || mu.x < 0.0 || mu.y < 0.0 || mu.x > 1.0 || mu.y > 1.0) discard;
  gl_FragColor = vec4(0.0);
}
`;

export function createOccluder(relief: Relief): Mesh {
  const u = relief.uniforms;
  const material = new ShaderMaterial({
    vertexShader: RELIEF_VERT,
    fragmentShader: OCCL_FRAG,
    colorWrite: false,
    depthWrite: true,
    uniforms: { uExag: u.uExag, uBase: u.uBase, uMask: u.uMask, uMaskRect: u.uMaskRect },
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
  });
  const mesh = new Mesh(relief.mesh.geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

const PLAN_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PLAN_FRAG = /* glsl */ `
${HEIGHT_GLSL}
uniform sampler2D uMask;
uniform vec4 uMaskRect;
uniform vec4 uPlanRect;
uniform float uExag;
uniform vec3 uL, uAlbedo, uLine, uAccent;
uniform float uDim, uCarve, uGridStep;
varying vec3 vWorld;

float regionalElev(vec2 xz) {
  vec2 uv = hUV(xz);
  vec2 cUv = clamp(uv, 0.0, 1.0);
  float baseH = hAt(cUv);
  vec2 over = xz - mix(uHRect.xy, uHRect.zw, cUv);
  float d = length(over);
  if (d < 1e-3) return baseH;
  // Smooth multi-octave regional ridge continuation outside the tight DEM box so contour lines remain continuous
  float wave = sin(xz.x * 0.28 + xz.y * 0.19) * 140.0 + cos(xz.x * 0.61 - xz.y * 0.43) * 65.0;
  return baseH + wave * smoothstep(0.0, 4.0, d);
}

void main() {
  vec2 xz = vWorld.xz;
  vec2 pu = (xz - uPlanRect.xy) / (uPlanRect.zw - uPlanRect.xy);
  if (pu.x < 0.0 || pu.y < 0.0 || pu.x > 1.0 || pu.y > 1.0) discard;

  // Radial + box feathering around the wide regional survey sheet
  vec2 dBox = min(pu, 1.0 - pu);
  float boxFade = smoothstep(0.02, 0.18, min(dBox.x, dBox.y));
  float radDist = length((pu - 0.5) * vec2(1.04, 1.04));
  float radFade = 1.0 - smoothstep(0.30, 0.49, radDist);
  float edgeFade = boxFade * radFade;
  if (edgeFade < 0.005) discard;

  // Sample regional elevation & 2D hillshade across the entire surrounding survey sheet
  float h = regionalElev(xz);
  float stepX = 0.08;
  float hl = regionalElev(xz - vec2(stepX, 0.0)), hr = regionalElev(xz + vec2(stepX, 0.0));
  float hn = regionalElev(xz - vec2(0.0, stepX)), hs = regionalElev(xz + vec2(0.0, stepX));
  vec3 n = normalize(vec3(-(hr - hl) / 160.0 * uExag, 1.0, -(hs - hn) / 160.0 * uExag));
  float diff = clamp(dot(n, uL), 0.0, 1.0);

  // Sample catchment mask & detect extraction perimeter on the 2D plan
  vec2 mu = (xz - uMaskRect.xy) / (uMaskRect.zw - uMaskRect.xy);
  float inMask = (mu.x >= 0.0 && mu.y >= 0.0 && mu.x <= 1.0 && mu.y <= 1.0) ? texture(uMask, mu).b : 0.0;
  vec2 me = 2.4 / uTex;
  float mL = (mu.x >= 0.0 && mu.y >= 0.0 && mu.x <= 1.0 && mu.y <= 1.0) ? texture(uMask, clamp(mu - vec2(me.x, 0.0), 0.0, 1.0)).b : 0.0;
  float mR = (mu.x >= 0.0 && mu.y >= 0.0 && mu.x <= 1.0 && mu.y <= 1.0) ? texture(uMask, clamp(mu + vec2(me.x, 0.0), 0.0, 1.0)).b : 0.0;
  float mN = (mu.x >= 0.0 && mu.y >= 0.0 && mu.x <= 1.0 && mu.y <= 1.0) ? texture(uMask, clamp(mu - vec2(0.0, me.y), 0.0, 1.0)).b : 0.0;
  float mS = (mu.x >= 0.0 && mu.y >= 0.0 && mu.x <= 1.0 && mu.y <= 1.0) ? texture(uMask, clamp(mu + vec2(0.0, me.y), 0.0, 1.0)).b : 0.0;
  float borderGrad = clamp((abs(mR - mL) + abs(mS - mN)) * 1.5, 0.0, 1.0);

  // Topographic contour lines across the surrounding 2D survey region
  float c250 = contour(h, 250.0, 1.15);
  float c50 = contour(h, 50.0, 0.85);

  // Death Stranding style cartographic coordinate grid + '+' intersection crosshairs
  vec2 gCoord = xz / max(0.25, uGridStep);
  vec2 gFract = abs(fract(gCoord - 0.5) - 0.5);
  vec2 gFw = max(fwidth(gCoord), 1e-4);
  vec2 gLine2 = 1.0 - smoothstep(0.0, 1.25, gFract / gFw);
  float majorGrid = max(gLine2.x, gLine2.y);

  // Sub-grid (4 subdivisions per major cell)
  vec2 subCoord = gCoord * 4.0;
  vec2 subFract = abs(fract(subCoord - 0.5) - 0.5);
  vec2 subFw = max(fwidth(subCoord), 1e-4);
  vec2 subLine2 = 1.0 - smoothstep(0.0, 1.05, subFract / subFw);
  float minorGrid = max(subLine2.x, subLine2.y);

  // '+' crosshair reticle ticks at major grid intersections
  float distToNode = max(gFract.x, gFract.y);
  float onCrossArm = majorGrid * (1.0 - smoothstep(0.06, 0.13, distToNode));

  // Fade out the flat 2D interior & perimeter outline as the 3D carve-out extrudes upward (uCarve: 0 -> 1)
  float carveProgress = clamp(uCarve, 0.0, 1.0);
  float flatStage = 1.0 - smoothstep(0.12, 0.58, carveProgress);
  float maskCutout = mix(1.0, 1.0 - inMask * 0.92, smoothstep(0.15, 0.65, carveProgress));
  float flatBorder = borderGrad * flatStage;
  float flatCatchmentFill = inMask * flatStage * 0.16;

  // Cartographic feature weights: contours, survey grid, '+' crosshairs, subtle hillshade, and Stage 1 extraction perimeter
  float contourInk = clamp(c250 * 0.62 + c50 * 0.26, 0.0, 1.0);
  float gridInk = clamp(majorGrid * 0.48 + minorGrid * 0.15 + onCrossArm * 0.78, 0.0, 1.0);
  float hillInk = (1.0 - diff) * mix(0.22, 0.09, carveProgress);

  vec3 topoCol = mix(uLine * 0.75, uAlbedo, 0.35);
  vec3 col = topoCol;
  col = mix(col, uAccent, clamp(gridInk * 0.85 + flatCatchmentFill * 2.2, 0.0, 1.0));
  col = mix(col, uAccent, flatBorder * 0.96);

  float featureAlpha = clamp(
    hillInk + contourInk * 0.58 + gridInk * 0.68 + flatCatchmentFill + flatBorder * 0.92,
    0.0,
    0.92
  );
  float planStrength = mix(0.98, 0.72, carveProgress);
  float a = edgeFade * maskCutout * planStrength * featureAlpha;
  col *= uDim;
  gl_FragColor = vec4(col * a, a);
}
`;

export function createSurveyPlan(
  g: Grid,
  frame: Frame,
  maskTex: Texture,
  maskRect: Rect,
  o: {
    hTex: DataTexture;
    light: Light;
    albedo: string;
    line: string;
    accent?: string;
    yPlane?: number;
    gridStepKm?: number;
  },
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

  const y = o.yPlane ?? 0;
  const pos = new Float32Array([
    px0, y, pz0,
    px1, y, pz0,
    px1, y, pz1,
    px0, y, pz1,
  ]);
  const idx = new Uint16Array([0, 2, 1, 0, 3, 2]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  geometry.setIndex(new BufferAttribute(idx, 1));
  const spanKm = Math.max(Math.abs(hx1 - hx0), Math.abs(hz1 - hz0));
  const gridStep = o.gridStepKm ?? Math.max(0.8, Math.round((spanKm / 7) * 2) / 2);
  const uniforms = {
    uH: { value: o.hTex },
    uTex: { value: new Vector2(g.width, g.height) },
    uHRect: { value: new Vector4(hx0, hz0, hx1, hz1) },
    uPlanRect: { value: new Vector4(px0, pz0, px1, pz1) },
    uMask: { value: maskTex },
    uMaskRect: { value: new Vector4(...maskRect) },
    uExag: { value: frame.exag },
    uL: { value: o.light.dir.clone() },
    uAlbedo: { value: hexVec(o.albedo) },
    uLine: { value: hexVec(o.line) },
    uAccent: { value: hexVec(o.accent ?? "#2563eb") },
    uDim: { value: 1 },
    uCarve: { value: 1 },
    uGridStep: { value: gridStep },
  };
  const material = new ShaderMaterial({
    vertexShader: PLAN_VERT,
    fragmentShader: PLAN_FRAG,
    uniforms,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms };
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
