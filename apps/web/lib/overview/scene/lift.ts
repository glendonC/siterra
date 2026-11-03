// Elevated evidence layer mesh: a copy of the terrain relief surface raised by `uLift` (km) to display a single
// analytical layer (growing-season NDVI trend slope, CHIRPS rainfall grid, WorldCover classes, or equal-area
// elevation bands). Rendered with depth testing disabled so the lifted sheet remains legible above the terrain.

import {
  type BufferGeometry,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  type Texture,
  Vector3,
  Vector4,
} from "three";

export type LiftMode = "overlay" | "cover" | "bands";

const VERT = /* glsl */ `
attribute float elev;
uniform float uExag, uBase, uLift;
varying vec3 vWorld;
void main() {
  vec3 p = vec3(position.x, (elev - uBase) * uExag / 1000.0 + uLift, position.z);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMask;    // B channel: inside the catchment
uniform vec4 uMaskRect;
uniform sampler2D uTex;     // the layer: an RGBA paint (overlay), the land cover mask, or the band mask
uniform vec4 uTexRect;
uniform int uMode;          // 0 overlay, 1 cover (R tree, G cropland or built-up), 2 bands (R low, G mid, B high)
uniform vec3 uC0, uC1, uC2, uPlate;
uniform float uAlpha;
varying vec3 vWorld;
void main() {
  vec2 xz = vWorld.xz;
  vec4 m = texture2D(uMask, (xz - uMaskRect.xy) / (uMaskRect.zw - uMaskRect.xy));
  if (m.b < 0.5) discard;
  vec4 t = texture2D(uTex, (xz - uTexRect.xy) / (uTexRect.zw - uTexRect.xy));
  vec3 col;
  float a = 0.9;
  if (uMode == 0) {
    col = mix(uPlate, t.rgb, t.a);
  } else if (uMode == 1) {
    col = t.r > 0.5 ? uC0 : t.g > 0.5 ? uC1 : uPlate;
  } else {
    col = t.r > 0.5 ? uC0 : t.g > 0.5 ? uC1 : t.b > 0.5 ? uC2 : uPlate;
  }
  gl_FragColor = vec4(col, a * uAlpha);
}
`;

export interface LiftLayer {
  mode: LiftMode;
  tex: Texture;
  /** The texture's rectangle in model x, z: x0, z0, x1, z1. */
  rect: readonly [number, number, number, number];
  /** Up to three colours for the mask modes (cover: tree, crop; bands: low, mid, high). */
  colours?: readonly Vector3[];
}

export interface Lift {
  mesh: Mesh;
  /** Shows a layer raised by `km`, at an opacity; null hides the mesh. */
  show(layer: LiftLayer | null, km: number, alpha: number): void;
  dispose(): void;
}

/**
 * The lifted layer over the relief's own geometry; `exag` and `base` are the relief's uniforms (shared, so a change
 * of the land's height carries over), `mask` the inside of the catchment over `maskRect`, `plate` the colour of the
 * layer where it holds nothing.
 */
export function createLift(
  geometry: BufferGeometry,
  relief: { uExag: { value: number }; uBase: { value: number } },
  mask: Texture,
  maskRect: readonly [number, number, number, number],
  plate: Vector3,
): Lift {
  const material = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uExag: relief.uExag,
      uBase: relief.uBase,
      uLift: { value: 0 },
      uMask: { value: mask },
      uMaskRect: { value: new Vector4(...maskRect) },
      uTex: { value: mask },
      uTexRect: { value: new Vector4(...maskRect) },
      uMode: { value: 0 },
      uC0: { value: new Vector3() },
      uC1: { value: new Vector3() },
      uC2: { value: new Vector3() },
      uPlate: { value: plate.clone() },
      uAlpha: { value: 0 },
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
  const u = material.uniforms;
  return {
    mesh,
    show(layer, km, alpha) {
      mesh.visible = layer !== null && alpha > 0.002;
      if (!layer) return;
      (u.uLift as { value: number }).value = km;
      (u.uAlpha as { value: number }).value = alpha;
      (u.uTex as { value: Texture }).value = layer.tex;
      (u.uTexRect as { value: Vector4 }).value.set(...layer.rect);
      (u.uMode as { value: number }).value =
        layer.mode === "overlay" ? 0 : layer.mode === "cover" ? 1 : 2;
      (layer.colours ?? []).forEach((c, i) => {
        (u[`uC${String(i)}`] as { value: Vector3 }).value.copy(c);
      });
    },
    dispose() {
      material.dispose();
    },
  };
}
