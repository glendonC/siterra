// Physical terrain model for the overview scene: 30 m relief clipped to the catchment boundary,
// lit by a directional key light with baked soft shadows and horizon-based ambient occlusion,
// WorldCover and optional true-colour albedo drape, topographic contours, Fresnel rim lighting,
// distance fog, dissolving boundary wall, depth-only occluder, and 2D regional survey plan.

import {
  CustomBlending,
  DataTexture,
  DoubleSide,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RedFormat,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  type Texture,
} from "three";
import type { Frame, Grid, Rect } from "../../instruments/valley/frame";
import { overviewColours, type Channels } from "../../theme/obsidian";
import {
  channelVec,
  hexVec,
  OCCL_FRAG,
  PLAN_FRAG,
  PLAN_VERT,
  RELIEF_FRAG,
  RELIEF_VERT,
  WALL_FRAG,
  WALL_VERT,
} from "./overview-shaders";
import {
  type AnalysisGrid,
  bakeLight,
  buildReliefGeometry,
  buildSurveyPlanGeometry,
  buildWallGeometry,
  maskOnRelief,
  signedArea,
  smoothRing,
  waterTexture,
} from "./terrain-mesh";

export {
  type AnalysisGrid,
  bakeLight,
  channelVec,
  hexVec,
  maskOnRelief,
  signedArea,
  smoothRing,
  waterTexture,
};

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

export interface ReliefColours {
  albedo: string;
  line: string;
  treeC: string;
  cropC: string;
  limitC: Channels;
  fogC: string;
  rimC: string;
  /** Water bodies (a live place's water mask). */
  waterC?: string;
  /** The measurement front's hairline and lit grid (the survey accent). */
  scanC?: string;
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
  /** Water's share of each relief cell (R, the relief's grid), when the place has a water mask. */
  water?: Texture;
  /** Snow-free growing-season Sentinel-2 true-colour composite on the relief grid, when read for a live place. */
  trueColour?: Texture;
  /** Mix weight (0 to 1) of the true-colour composite into the terrain albedo before lighting. */
  photoA?: number;
  /** The relief grid's cell (m); 30 for the bundled 30 m reliefs. */
  cellM?: number;
  /** Contour and index contour intervals (m); 250 and 1000 by default. */
  contourStep?: readonly [number, number];
}

/** No footprint: one transparent texel. */
const EMPTY_OVERLAY = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, RGBAFormat);
EMPTY_OVERLAY.needsUpdate = true;
/** No water: one texel of none. */
const NO_WATER = new DataTexture(new Uint8Array([0]), 1, 1, RedFormat, UnsignedByteType);
NO_WATER.needsUpdate = true;

export function createRelief(
  H: Float32Array,
  g: Grid,
  frame: Frame,
  maskTex: Texture,
  maskRect: Rect,
  o: ReliefOptions,
) {
  const geometry = buildReliefGeometry(H, g, frame);
  const c = o.colours;
  const uniforms = {
    uH: { value: o.hTex },
    uTex: { value: new Vector2(g.width, g.height) },
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
    uCell: { value: o.cellM ?? 30 },
    uStep: { value: new Vector2(o.contourStep?.[0] ?? 250, o.contourStep?.[1] ?? 1000) },
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
    uWater: { value: o.water ?? NO_WATER },
    uWaterC: { value: hexVec(c.waterC ?? c.albedo) },
    uPhoto: { value: o.trueColour ?? EMPTY_OVERLAY },
    uPhotoA: { value: o.trueColour ? (o.photoA ?? 0.38) : 0 },
    uScanA: { value: 0 },
    uScanH: { value: 0 },
    uScanC: { value: hexVec(c.scanC ?? c.line) },
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
  const geometry = buildWallGeometry(pts, sample, frame, o);
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

/**
 * Depth-only copy of the relief for the secondary arc renderer: occludes geometry behind the terrain
 * silhouette without writing color.
 */
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
  const { geometry, hx0, hz0, hx1, hz1, px0, pz0, px1, pz1, spanKm } = buildSurveyPlanGeometry(
    g,
    frame,
    maskRect,
    o.yPlane ?? 0,
  );
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
    uAccent: { value: hexVec(o.accent ?? overviewColours.surveyAccent) },
    uDim: { value: 1 },
    uCarve: { value: 1 },
    uGridStep: { value: gridStep },
    uScanA: { value: 0 },
    uScanH: { value: 0 },
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
