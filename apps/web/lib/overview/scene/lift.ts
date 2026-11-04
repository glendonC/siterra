// One evidence sheet over the overview's land: a copy of the relief surface (a coarser grid of the same heights)
// carrying one layer, the growing-season NDVI trend, CHIRPS rainfall, snow cover by height, WorldCover classes or the
// equal-area elevation bands, inside the catchment only (its edge is a line the stack rig draws). Its pose is
// `y = relief * uRelief + uY`: on the land (1, 0), lifted whole above it (1, lift), or nearly flat in the stack (a
// small share of the relief, at its slot). Drawn with depth testing off, so a sheet stays legible above the terrain
// and the sheets below it.

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  type Texture,
  Vector3,
  Vector4,
} from "three";
import type { Frame, Grid } from "../../instruments/valley/frame";

export type LiftMode = "overlay" | "cover" | "bands" | "snow";

const MODE: Record<LiftMode, number> = { overlay: 0, cover: 1, bands: 2, snow: 3 };
/** Snow bands a sheet can hold (the fixed 500 m bands of the snow tables: five for the first place). */
export const SNOW_BANDS = 8;

const VERT = /* glsl */ `
attribute float elev;
uniform float uExag, uBase, uRelief, uY;
varying vec3 vWorld;
varying float vElev;
void main() {
  vec3 p = vec3(position.x, (elev - uBase) * uExag / 1000.0 * uRelief + uY, position.z);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vElev = elev;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMask;    // B channel: inside the catchment
uniform vec4 uMaskRect;
uniform sampler2D uTex;     // the layer: an RGBA paint (overlay), the land cover mask, or the band mask
uniform vec4 uTexRect;
uniform int uMode;          // 0 overlay, 1 cover (R tree, G crop), 2 bands (R low, G mid, B high), 3 snow by height
uniform vec3 uC0, uC1, uC2, uC3, uPlate, uRim;
uniform float uEdges[${String(SNOW_BANDS - 1)}];
uniform float uShares[${String(SNOW_BANDS)}];
uniform int uBandsN;
uniform float uAlpha, uQuiet;
varying vec3 vWorld;
varying float vElev;
vec3 ramp4(float s) {
  s = clamp(s, 0.0, 1.0) * 3.0;
  if (s < 1.0) return mix(uC0, uC1, s);
  if (s < 2.0) return mix(uC1, uC2, s - 1.0);
  return mix(uC2, uC3, s - 2.0);
}
void main() {
  vec2 xz = vWorld.xz;
  vec4 m = texture2D(uMask, (xz - uMaskRect.xy) / (uMaskRect.zw - uMaskRect.xy));
  if (m.b < 0.5) discard;
  vec3 col;
  if (uMode == 0) {
    vec4 t = texture2D(uTex, (xz - uTexRect.xy) / (uTexRect.zw - uTexRect.xy));
    col = mix(uPlate, t.rgb, t.a);
  } else if (uMode == 1) {
    vec4 t = texture2D(uTex, (xz - uTexRect.xy) / (uTexRect.zw - uTexRect.xy));
    col = t.r > 0.5 ? uC0 : t.g > 0.5 ? uC1 : uPlate;
  } else if (uMode == 2) {
    vec4 t = texture2D(uTex, (xz - uTexRect.xy) / (uTexRect.zw - uTexRect.xy));
    col = t.r > 0.5 ? uC0 : t.g > 0.5 ? uC1 : t.b > 0.5 ? uC2 : uPlate;
  } else {
    int b = 0;
    for (int i = 0; i < ${String(SNOW_BANDS - 1)}; i++) {
      if (i < uBandsN - 1 && vElev >= uEdges[i]) b = i + 1;
    }
    col = ramp4(uShares[b]);
    // the band limits, hairlines across the sheet
    float fw = max(fwidth(vElev), 1e-3);
    float ln = 0.0;
    for (int i = 0; i < ${String(SNOW_BANDS - 1)}; i++) {
      if (i < uBandsN - 1) ln = max(ln, 1.0 - smoothstep(0.0, 1.0, abs(vElev - uEdges[i]) / fw));
    }
    col = mix(col, uRim, 0.35 * ln);
  }
  // a quiet sheet steps back toward its plate and lets what is behind it through, still readable
  col = mix(col, uPlate, 0.3 * uQuiet);
  gl_FragColor = vec4(col, uAlpha * (1.0 - 0.35 * uQuiet));
}
`;

export interface LiftLayer {
  mode: LiftMode;
  tex: Texture | null;
  /** The texture's rectangle in model x, z: x0, z0, x1, z1. */
  rect: readonly [number, number, number, number];
}

export interface SheetLook {
  /** Cover: tree, crop; bands: low, mid, high; snow: four stops, none to always. */
  colours: readonly Vector3[];
  plate: Vector3;
  rim: Vector3;
  /** Snow: the band limits (m) and each band's share, low to high. */
  snow?: { edges: readonly number[]; shares: readonly number[] };
}

export interface SheetPose {
  /** Share of the relief the sheet keeps (1 on the land), and its height offset (model km). */
  relief: number;
  y: number;
  alpha: number;
  /** 0 lit, 1 quiet. */
  quiet: number;
}

export interface Sheet {
  mesh: Mesh;
  setLayer(layer: LiftLayer, look: SheetLook): void;
  pose(p: SheetPose): void;
  dispose(): void;
}

/** The relief's heights on every `stride`-th cell: the sheets' shared, lighter copy of the land's surface. */
export function sheetGeometry(
  H: Float32Array,
  g: Grid,
  frame: Frame,
  stride: number,
): BufferGeometry {
  const W = Math.floor((g.width - 1) / stride) + 1;
  const R = Math.floor((g.height - 1) / stride) + 1;
  const pos = new Float32Array(W * R * 3);
  const elev = new Float32Array(W * R);
  for (let j = 0, k = 0; j < R; j++) {
    const z = frame.z(g.N0 - (j * stride + 0.5) * g.res);
    for (let i = 0; i < W; i++, k++) {
      pos[k * 3] = frame.x(g.E0 + (i * stride + 0.5) * g.res);
      pos[k * 3 + 2] = z;
      elev[k] = H[j * stride * g.width + i * stride] ?? 0;
    }
  }
  const idx = new Uint32Array((W - 1) * (R - 1) * 6);
  for (let j = 0, t = 0; j < R - 1; j++)
    for (let i = 0; i < W - 1; i++, t += 6) {
      const a = j * W + i;
      idx.set([a, a + W, a + 1, a + 1, a + W, a + W + 1], t);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  geometry.setAttribute("elev", new BufferAttribute(elev, 1));
  geometry.setIndex(new BufferAttribute(idx, 1));
  return geometry;
}

/**
 * A sheet over `geometry` (sheetGeometry); `relief` holds the land's height uniforms (shared, so a change of the
 * land's height carries over), `mask` the inside of the catchment over `maskRect`.
 */
export function createSheet(
  geometry: BufferGeometry,
  relief: { uExag: { value: number }; uBase: { value: number } },
  mask: Texture,
  maskRect: readonly [number, number, number, number],
): Sheet {
  const material = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uExag: relief.uExag,
      uBase: relief.uBase,
      uRelief: { value: 1 },
      uY: { value: 0 },
      uMask: { value: mask },
      uMaskRect: { value: new Vector4(...maskRect) },
      uTex: { value: mask },
      uTexRect: { value: new Vector4(...maskRect) },
      uMode: { value: 0 },
      uC0: { value: new Vector3() },
      uC1: { value: new Vector3() },
      uC2: { value: new Vector3() },
      uC3: { value: new Vector3() },
      uPlate: { value: new Vector3() },
      uRim: { value: new Vector3() },
      uEdges: { value: new Array<number>(SNOW_BANDS - 1).fill(0) },
      uShares: { value: new Array<number>(SNOW_BANDS).fill(0) },
      uBandsN: { value: 1 },
      uAlpha: { value: 0 },
      uQuiet: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 40;
  mesh.visible = false;
  mesh.frustumCulled = false;
  const u = material.uniforms as Record<string, { value: unknown }>;
  const num = (k: string, v: number) => {
    (u[k] as { value: number }).value = v;
  };
  return {
    mesh,
    setLayer(layer, look) {
      (u.uTex as { value: Texture }).value = layer.tex ?? mask;
      (u.uTexRect as { value: Vector4 }).value.set(...layer.rect);
      num("uMode", MODE[layer.mode]);
      look.colours.slice(0, 4).forEach((c, i) => {
        (u[`uC${String(i)}`] as { value: Vector3 }).value.copy(c);
      });
      (u.uPlate as { value: Vector3 }).value.copy(look.plate);
      (u.uRim as { value: Vector3 }).value.copy(look.rim);
      if (look.snow) {
        const edges = u.uEdges as { value: number[] };
        const shares = u.uShares as { value: number[] };
        edges.value.fill(0);
        shares.value.fill(0);
        look.snow.edges.slice(0, SNOW_BANDS - 1).forEach((e, i) => (edges.value[i] = e));
        look.snow.shares.slice(0, SNOW_BANDS).forEach((s, i) => (shares.value[i] = s));
        num("uBandsN", Math.min(SNOW_BANDS, look.snow.shares.length));
      }
    },
    pose(p) {
      mesh.visible = p.alpha > 0.002;
      num("uRelief", p.relief);
      num("uY", p.y);
      num("uAlpha", p.alpha);
      num("uQuiet", p.quiet);
    },
    dispose() {
      material.dispose();
    },
  };
}
