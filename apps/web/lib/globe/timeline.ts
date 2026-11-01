// What the globe shows at a time t, as a pure function of the clock and the moments the viewer acted: the limb
// under the opening's beats, the turn to the case when the action is pressed, then the zoom into the case, after
// which the overview's own land takes over (decision 11). Ported from the design lane's hero study A4 (app4.js
// frame()).

import { globeColours } from "../theme/obsidian";
import { R_KM, localFrame, type GlobeCamera, type Vec3 } from "./frame";
import type { GlobeFrame } from "./renderer";
import {
  ARRIVE,
  CAM,
  F_PX,
  FOV,
  LIMB,
  LIMB_ACT,
  globeView,
  limbView,
  mixView,
  type View,
} from "./views";

export interface Moments {
  /** Seconds at which each opening beat started. */
  beats: number[];
  /** Seconds at which the action appeared (the limb rises). */
  action?: number;
  /** Seconds at which the action was pressed (the globe turns the case toward the centre). */
  press?: number;
  /** Seconds at which the dive started. */
  dive?: number;
}

export const TURN_S = 2.0;
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

export interface GlobeState {
  view: View;
  uniforms: Omit<GlobeFrame, "cam" | "sun" | "key" | "caseV" | "fadeC">;
  /** 0 to 1: how far the light has turned from the camera's front-left to the land's light (0 on the globe). */
  sunK: number;
  /** Opacity of the case ring and point. */
  ringOpacity: number;
  /** Opacity of the range name along the range's crest. */
  rangeOpacity: number;
  /** True once the camera rests over the case and the earth has sunk into the ground: the land takes over. */
  done: boolean;
}

/** The zoom into the case (decision 11): Open to the land's handover (s). */
export const ZOOM_S = 1.4;
/** The camera's height over the case when the earth has sunk into the ground (km). */
const ZOOM_END_KM = 1500;

/**
 * The camera and overlays at time t. Open (the dive) zooms straight down onto the case's own outlet, north up, while
 * the earth sinks into the ground round it, so that the screen holds only the ground and the case's ring and point
 * when the land takes over (decision 11: one land object on one camera path; the land is the overview's own).
 */
export function globeStateAt(
  t: number,
  m: Moments,
  reduced = false,
  outlet: { lon: number; lat: number } = { lon: -6.5372222, lat: 31.6377778 },
): GlobeState {
  const p = (t0: number | undefined, dur: number, ease = ARRIVE) =>
    progress(t, t0, dur, ease, reduced);
  const beats = m.beats;
  // the opening and the globe page stand round the case's own place
  const vGlobe = globeView(outlet);
  let view = limbView(LIMB[0], outlet);
  for (let i = 1; i < LIMB.length; i++)
    view = mixView(
      view,
      limbView(LIMB[i] ?? LIMB_ACT, outlet),
      p((beats[i] ?? Infinity) - 0.2, 1.6, CAM),
    );
  view = mixView(view, limbView(LIMB_ACT, outlet), p(m.action, 1.6, CAM));
  view = mixView(view, vGlobe, p(m.press, TURN_S, CAM));

  const u = m.dive === undefined ? -1 : t - m.dive;
  const diving = u >= 0;
  if (diving) {
    const toCase = p(m.dive, 1.1, CAM);
    const down = p(m.dive, ZOOM_S, CAM);
    view = {
      lon: lerp(vGlobe.lon, outlet.lon, toCase),
      lat: lerp(vGlobe.lat, outlet.lat, toCase),
      tz: 0,
      bearing: 180,
      pitch: 90,
      distance: Math.exp(lerp(Math.log(vGlobe.distance), Math.log(ZOOM_END_KM), down)),
      fov: FOV,
      shiftX: lerp(vGlobe.shiftX, 0, toCase),
      shiftY: 0,
      rows: 1,
    };
  }
  const d0 = m.dive ?? 0;
  const pd = (from: number, dur: number, ease = ARRIVE) => (diving ? p(d0 + from, dur, ease) : 0);

  // the earth sinks into the ground round the case at the end of the zoom, slowly then fast, so the land rises out
  // of the ground right after the last dots go (lead, 30 Oct: the empty beat between them about 0.25 s at most)
  const sink = pd(0.6, ZOOM_S - 0.6, (x) => x * x * x);
  const level = clamp(Math.log2(view.distance / 160), 0, 8);
  // dots about 7 px apart where the view looks; behind the opening the visible cap is the limb, so rows halve there
  const N = (view.rows * Math.PI) / ((7 * view.distance) / (F_PX * R_KM));
  const lv = Math.log2(N / 150);
  const na = 150 * 2 ** Math.floor(lv);
  const layerK = p((beats[0] ?? 0) + 0.6, 1.2) * (1 - pd(0, 0.6, LIN));

  return {
    view,
    uniforms: {
      layerK,
      mode: [0, 1, 0, 0],
      exag: 0,
      dots: [na, na * 2, ARRIVE(clamp((lv - Math.floor(lv) - 0.3) / 0.4)), 1],
      cont: [level, 0, 1e-4, 0],
      fade: [0, 1 / R_KM, sink],
      haze: [70 / R_KM, 190 / R_KM, 0],
      grat: 0.045 * (1 - p(m.press, 0.6)),
      limb: [clamp((2 * view.rows) / 7, 0.08, 0.5), clamp((4 * view.rows) / 7, 0.2, 0.7)],
    },
    sunK: 0,
    ringOpacity: p((m.press ?? Infinity) + 2.0, 0.3, LIN),
    rangeOpacity: p((m.press ?? Infinity) + 2.3, 0.6) * (1 - pd(0, 0.3, LIN)),
    done: diving && u >= ZOOM_S - 1e-6, // clock sums like 34 + 1.4 - 34 fall just short
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
export const KEY: Vec3 = hexChannels(globeColours.keyLight);

function hexChannels(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
