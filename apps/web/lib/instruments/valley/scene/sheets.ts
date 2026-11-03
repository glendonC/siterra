// Thin sheets that lift off the model, one real dataset each. A sheet is a plate with a faint fill and a thin light
// rim (decoration, and it reads as such); its data is crisp line work plus a faint tint, drawn at the data's own
// cell size: MODIS 250 m cells, CHIRPS 0.05 degree cells, 10 m rasters. Ported from the design system.

import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  ShaderMaterial,
  Vector2,
  Vector4,
  type DataTexture,
  type Texture,
} from "three";
import { sheetColours } from "../../../theme/obsidian";
import type { Rect } from "../frame";
import type { Point } from "../geometry";
import type { Rgba } from "../palette";
import type { LineKit } from "./lines";
import { hexVec } from "./terrain";

/** A plate given by its corners in model x, z: a faint fill and a thin light rim. */
export function sheetPlane(
  lines: LineKit,
  corners: readonly Point[],
  y: number,
  { fillA = 0.06, rimA = 0.48, renderOrder = 0 } = {},
): Group {
  const group = new Group();
  const shape = new Shape(corners.map(([x, z]) => new Vector2(x, -z)));
  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const fill = new Mesh(
    geometry,
    new MeshBasicMaterial({
      color: sheetColours.plate,
      transparent: true,
      opacity: fillA,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  fill.position.y = y;
  fill.renderOrder = renderOrder;
  group.add(fill);
  group.add(
    lines.lines([corners.map(([x, z]) => [x, y, z])], {
      color: sheetColours.plateRim,
      opacity: rimA,
      closed: true,
      renderOrder: renderOrder + 4,
    }),
  );
  return group;
}

/** Convex polygons (model x, z), each with its own colour, as one flat mesh at height y. */
export function polyMesh(
  polys: readonly { c: readonly Point[]; rgba: Rgba }[],
  y: number,
  { renderOrder = 1 } = {},
): Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (const p of polys) {
    const base = pos.length / 3;
    for (const [x, z] of p.c) {
      pos.push(x, y, z);
      col.push(...p.rgba);
    }
    for (let i = 1; i < p.c.length - 1; i++) idx.push(base, base + i, base + i + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(col, 4));
  geometry.setIndex(idx);
  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  return mesh;
}

const RASTER_VERT = /* glsl */ `
varying vec2 vXZ;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vXZ = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RASTER_FRAG = /* glsl */ `
uniform sampler2D uH;
uniform vec2 uTex;
uniform vec4 uHRect;
uniform sampler2D uMask;   // landcover-10m.png: R tree cover, G cropland or built-up, B inside the catchment
uniform vec4 uMaskRect;
uniform sampler2D uStrata; // strata-10m.png: R band 1, G band 2, B band 3
uniform int uMode;         // 0 snow by 500 m band, 1 elevation bands, 2 land cover
uniform float uShare[5];
uniform vec3 uSnow[4];
uniform vec3 uTint, uTree, uCrop, uLine;
uniform vec2 uLimits;      // the equal-area band limits (m)
varying vec2 vXZ;
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
float level(float h, float at, float w) {
  float fw = max(fwidth(h), 1e-3);
  return 1.0 - smoothstep(0.0, w, abs(h - at) / fw);
}
vec3 snowRamp(float s) {
  s = clamp(s, 0.0, 1.0) * 3.0;
  if (s < 1.0) return mix(uSnow[0], uSnow[1], s);
  if (s < 2.0) return mix(uSnow[1], uSnow[2], s - 1.0);
  return mix(uSnow[2], uSnow[3], s - 2.0);
}
void main() {
  vec2 mu = (vXZ - uMaskRect.xy) / (uMaskRect.zw - uMaskRect.xy);
  if (mu.x < 0.0 || mu.y < 0.0 || mu.x > 1.0 || mu.y > 1.0) discard;
  vec4 mk = texture(uMask, mu);
  float inside = smoothstep(0.35, 0.65, mk.b);
  if (inside < 0.01) discard;
  float h = hAt((vXZ - uHRect.xy) / (uHRect.zw - uHRect.xy));
  vec3 col;
  float a;
  if (uMode == 0) {
    int b = h < 2000.0 ? 0 : h < 2500.0 ? 1 : h < 3000.0 ? 2 : h < 3500.0 ? 3 : 4;
    float s = uShare[b];
    col = snowRamp(s);
    a = 0.22 + 0.6 * s;
    float ln = max(max(level(h, 2000.0, 0.85), level(h, 2500.0, 0.85)), max(level(h, 3000.0, 0.85), level(h, 3500.0, 0.85)));
    col = mix(col, uLine, ln * 0.8);
    a = max(a, ln * 0.85);
  } else if (uMode == 1) {
    vec3 s = texture(uStrata, mu).rgb;
    float t = (0.05 * s.r + 0.13 * s.g + 0.24 * s.b) / max(s.r + s.g + s.b, 1e-3);
    col = uTint;
    a = t;
    float ln = max(level(h, uLimits.x, 1.05), level(h, uLimits.y, 1.05));
    col = mix(col, uLine, ln);
    a = max(a, ln * 0.95);
  } else {
    col = uTint;
    a = 0.07;
    col = mix(col, uTree, mk.r);
    a = mix(a, 0.95, mk.r);
    col = mix(col, uCrop, mk.g);
    a = mix(a, 0.98, mk.g);
  }
  gl_FragColor = vec4(col, a * inside);
}
`;

/** Snow by 500 m band, the three elevation bands, or land cover: what a raster sheet draws. */
export const RASTER_MODE = { snow: 0, bands: 1, cover: 2 } as const;

export interface RasterContext {
  hTex: DataTexture;
  /** Relief grid size in cells. */
  grid: { width: number; height: number };
  /** Relief grid and 10 m analysis grid rectangles in model x, z. */
  hRect: Rect;
  aRect: Rect;
  landcover: Texture;
  strata: Texture;
  /** The record's two elevation band limits (m), lowest first. */
  limits: readonly [number, number];
}

/** A sheet drawn from the 10 m rasters and the relief, inside the catchment only. */
export function rasterSheet(
  rect: Rect,
  y: number,
  mode: (typeof RASTER_MODE)[keyof typeof RASTER_MODE],
  ctx: RasterContext,
  { renderOrder = 1, shares = [0, 0, 0, 0, 0] as readonly number[] } = {},
): Mesh {
  const [x0, z0, x1, z1] = rect;
  const geometry = new PlaneGeometry(x1 - x0, z1 - z0);
  geometry.rotateX(-Math.PI / 2);
  const uniforms = {
    uH: { value: ctx.hTex },
    uTex: { value: new Vector2(ctx.grid.width, ctx.grid.height) },
    uHRect: { value: new Vector4(...ctx.hRect) },
    uMask: { value: ctx.landcover },
    uMaskRect: { value: new Vector4(...ctx.aRect) },
    uStrata: { value: ctx.strata },
    uMode: { value: mode },
    uShare: { value: shares.slice() },
    uSnow: { value: sheetColours.snow.map(hexVec) },
    uTint: { value: hexVec(sheetColours.bandTint) },
    uTree: { value: hexVec(sheetColours.coverTree) },
    uCrop: { value: hexVec(sheetColours.coverCrop) },
    uLine: { value: hexVec(sheetColours.outline) },
    uLimits: { value: new Vector2(...ctx.limits) },
  };
  const material = new ShaderMaterial({
    vertexShader: RASTER_VERT,
    fragmentShader: RASTER_FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  return mesh;
}
