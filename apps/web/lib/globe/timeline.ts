// What the globe shows at a time t, as a pure function of the clock and the moments the viewer acted:
// the limb under the opening's beats, the turn to North Africa when the action is pressed, then the dive to
// the arrival pose. Ported from the design lane's hero study A4 (app4.js frame()); the dive ends on the
// MapLibre valley, which fades in where the study's valley block faded in (dive 2.5 to 3.1 s).

import { ARRIVAL_POSE } from "../stage/arrival";
import { daylight } from "../theme/daylight";
import { R_KM, localFrame, unit, type GlobeCamera, type Vec3 } from "./frame";
import type { GlobeFrame } from "./renderer";
import {
  ARRIVE,
  CAM,
  F_PX,
  FOV,
  LIMB,
  LIMB_ACT,
  V_GLOBE,
  limbView,
  mixView,
  type View,
} from "./views";

export interface Moments {
  /** Seconds at which each opening beat started. */
  beats: number[];
  /** Seconds at which the action appeared (the limb rises). */
  action?: number;
  /** Seconds at which the action was pressed (the globe turns North Africa to the centre). */
  press?: number;
  /** Seconds at which the dive started. */
  dive?: number;
}

export const TURN_S = 2.0;
export const DIVE_S = 4.4;
/** The approved recording's moments (hero study A4). */
export const RECORDING: Required<Moments> = {
  beats: [0.6, 7.6, 14.6, 21.6],
  action: 24.6,
  press: 29.0,
  dive: 34.0,
};

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const LIN = (x: number) => x;
const RAD = Math.PI / 180;

/** Progress of a step that starts at t0 and lasts dur, eased; a 150 ms cut under reduced motion. */
export function progress(
  t: number,
  t0: number | undefined,
  dur: number,
  ease = ARRIVE,
  reduced = false,
): number {
  if (t0 === undefined) return 0;
  return reduced ? clamp((t - t0) / 0.15) : ease(clamp((t - t0) / dur));
}

/** The dive's end: the approved arrival pose as a view (target height in the x2 frame, km). */
export const V_END: View = {
  lon: ARRIVAL_POSE.target.lon,
  lat: ARRIVAL_POSE.target.lat,
  tz: ARRIVAL_POSE.targetHeightM / 1000,
  bearing: ARRIVAL_POSE.cameraBearingFromTargetDeg,
  pitch: ARRIVAL_POSE.elevationDeg,
  distance: ARRIVAL_POSE.distanceM / 1000,
  fov: ARRIVAL_POSE.verticalFovDeg,
  shiftX: 0,
  shiftY: 0,
  rows: 1,
};

export interface GlobeState {
  view: View;
  /** Everything the renderer needs except the camera and the sun, which follow from the view. */
  uniforms: Omit<GlobeFrame, "cam" | "sun" | "key" | "caseV" | "fadeC">;
  /** 0 to 1: how far the dive has moved the light from the camera's front-left to the valley's light. */
  sunK: number;
  /** Opacity of the MapLibre valley over the globe. */
  valleyOpacity: number;
  /** Terrain exaggeration for the MapLibre valley while the relief rises (0 to 2). */
  valleyExaggeration: number;
  /** Opacity of the case ring and point. */
  ringOpacity: number;
  /** The range name along the Atlas: which name (0 the Atlas, 1 the High Atlas) and its opacity. */
  rangeName: 0 | 1;
  rangeOpacity: number;
  /** Opacity of the valley's name beside the case late in the dive. */
  valleyNameOpacity: number;
  /** True once the valley covers the globe, so the globe renderer can be disposed. */
  globeDone: boolean;
  /** True once the camera rests on the arrival pose: the arrival begins. */
  done: boolean;
}

export function globeStateAt(t: number, m: Moments, reduced = false): GlobeState {
  const p = (t0: number | undefined, dur: number, ease = ARRIVE) =>
    progress(t, t0, dur, ease, reduced);
  const beats = m.beats;
  let view = limbView(LIMB[0]);
  for (let i = 1; i < LIMB.length; i++)
    view = mixView(view, limbView(LIMB[i] ?? LIMB_ACT), p((beats[i] ?? Infinity) - 0.2, 1.6, CAM));
  view = mixView(view, limbView(LIMB_ACT), p(m.action, 1.6, CAM));
  view = mixView(view, V_GLOBE, p(m.press, TURN_S, CAM));

  const u = m.dive === undefined ? -1 : t - m.dive;
  const diving = u >= 0;
  const x = clamp(u / DIVE_S);
  const outlet = { lon: -6.5372222, lat: 31.6377778 };
  if (diving) {
    const s = 0.5 * x + 0.5 * x * x * (3 - 2 * x); // the logarithmic fall, eased at both ends
    const toCase = p(m.dive, 1.6, CAM);
    const tilt = p((m.dive ?? 0) + 2.8, 1.6, CAM);
    view = {
      lon: lerp(lerp(V_GLOBE.lon, outlet.lon, toCase), V_END.lon, tilt),
      lat: lerp(lerp(V_GLOBE.lat, outlet.lat, toCase), V_END.lat, tilt),
      tz: lerp(0, V_END.tz, tilt),
      bearing: lerp(180, V_END.bearing, tilt),
      pitch: lerp(90, V_END.pitch, tilt),
      distance: Math.exp(lerp(Math.log(V_GLOBE.distance), Math.log(V_END.distance), s)),
      fov: FOV,
      shiftX: 0,
      shiftY: 0,
      rows: 1,
    };
  }
  const d0 = m.dive ?? 0;
  const pd = (from: number, dur: number, ease = ARRIVE) => (diving ? p(d0 + from, dur, ease) : 0);

  const rise = pd(2.2, 1.2, CAM);
  const dotsK = 1 - pd(1.2, 0.8, LIN);
  const contK = pd(1.0, 0.4, LIN) * (1 - pd(3.4, 1.0, LIN));
  const revealKm = diving
    ? u >= 2.2
      ? 1e5
      : pd(1.0, 1.2, LIN) * 3.2 * view.distance * Math.tan((FOV / 2) * RAD) * 1.8
    : 0;
  const level = clamp(Math.log2(view.distance / 160), 0, 8);
  const kf = pd(2.4, 1.6, CAM);
  const fadeIn = lerp(2000, 24, kf);
  const fadeOut = lerp(4000, 52, kf);
  const fadeOn = pd(2.0, 0.6, LIN);
  const hazeK = 0.55 * pd(3.4, 1.0, LIN);
  // dots about 7 px apart where the view looks; behind the opening the visible cap is the limb, so rows halve there
  const N = (view.rows * Math.PI) / ((7 * view.distance) / (F_PX * R_KM));
  const lv = Math.log2(N / 150);
  const na = 150 * 2 ** Math.floor(lv);
  const layerK = p((beats[0] ?? 0) + 0.6, 1.2) * (diving ? 1 - pd(0, 0.8, LIN) : 1);

  return {
    view,
    uniforms: {
      layerK,
      mode: [0, dotsK, 0, rise],
      // relief exaggerated for legibility at altitude, and exactly 2.0 once the valley is drawn over it
      exag: rise * 2.0 * lerp(clamp(Math.sqrt(view.distance / 66), 1, 6), 1, pd(2.5, 0.6, LIN)),
      dots: [na, na * 2, ARRIVE(clamp((lv - Math.floor(lv) - 0.3) / 0.4)), 1],
      cont: [level, revealKm / R_KM, (0.25 * revealKm) / R_KM + 1e-4, contK],
      fade: [fadeIn / R_KM, fadeOut / R_KM, fadeOn],
      haze: [70 / R_KM, 190 / R_KM, hazeK],
      grat: 0.045 * (1 - p(m.press, 0.6)),
      limb: [clamp((2 * view.rows) / 7, 0.08, 0.5), clamp((4 * view.rows) / 7, 0.2, 0.7)],
    },
    sunK: pd(1.6, 1.8, CAM),
    valleyOpacity: pd(2.5, 0.6, LIN),
    valleyExaggeration: 2 * rise,
    ringOpacity: p((m.press ?? Infinity) + 2.0, 0.3, LIN) * (diving ? 1 - pd(3.6, 0.6, LIN) : 1),
    rangeName: diving && u >= 0.6 ? 1 : 0,
    rangeOpacity:
      p((m.press ?? Infinity) + 2.3, 0.6) *
      (diving
        ? u < 0.6
          ? 1 - pd(0.45, 0.15, LIN)
          : pd(0.6, 0.2, LIN) * (1 - pd(2.2, 0.2, LIN))
        : 1),
    valleyNameOpacity: pd(2.4, 0.3, LIN) * (1 - pd(3.6, 0.5, LIN)),
    globeDone: diving && u >= 3.1,
    done: diving && u >= DIVE_S - 1e-6, // clock sums like 34 + 4.4 - 34 fall just short
  };
}

/** DESIGN B's arrival light, x east, y up, z south (handoff arrival-camera.json). */
const LIGHT_B: Vec3 = [-0.5749, 0.5626, 0.5941];

const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The light on the globe: front-left of the camera, turning to the valley's light as the dive comes down. */
export function sunFor(cam: GlobeCamera, sunK: number): Vec3 {
  const camSun = norm(
    [0, 1, 2].map(
      (i) => -0.42 * (cam.right[i] ?? 0) + 0.5 * (cam.upv[i] ?? 0) + 0.76 * (cam.back[i] ?? 0),
    ) as Vec3,
  );
  const { east, north, up } = localFrame(-6.5372222, 31.6377778);
  const lb = norm(LIGHT_B);
  // DESIGN B's x east, y up, z south becomes east, north (-z), up (y)
  const local: Vec3 = [lb[0], -lb[2], lb[1]];
  const valleySun = norm(
    [0, 1, 2].map(
      (i) => local[0] * (east[i] ?? 0) + local[1] * (north[i] ?? 0) + local[2] * (up[i] ?? 0),
    ) as Vec3,
  );
  return norm([0, 1, 2].map((i) => lerp(camSun[i] ?? 0, valleySun[i] ?? 0, sunK)) as Vec3);
}

/** DESIGN B's key light (the keyLight token) as sRGB values, unchanged through the dive. */
export const KEY: Vec3 = hexChannels(daylight.keyLight);

function hexChannels(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** The case on the sphere: the catchment outlet. */
export const CASE_V: Vec3 = unit(-6.5372222, 31.6377778);

/** The centre the land fades to paper around: the catchment centre (handoff arrival-camera.json). */
export const FADE_V: Vec3 = unit(-6.359132, 31.651677);
