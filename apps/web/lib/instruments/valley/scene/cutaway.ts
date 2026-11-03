// The cutaway: the catchment model cut along the S2 transect through Tabant, from boundary to
// boundary. The eastern block stays and shows its section: the bundle's profile as the one warm line along the top
// of the lit section face, the 2,316.8 m and 2,815.2 m band limits across the face with each band faintly tinted,
// WorldCover tree cover and cropland or built-up along the valley floor just under the profile, and an elevation
// ruler at the north end. The camera faces the section in perspective; its distance and lens shift are solved at
// the design size so that the block fills its region, and the words are placed by the component from `marks`.

import {
  Group,
  type Material,
  type Mesh,
  PerspectiveCamera,
  type ShaderMaterial,
  Vector3,
} from "three";
import type { LandPose } from "../../../land/handoff";
import { smoothRing } from "../../../stage/smooth";
import { modelColours, obsidian, overviewColours, sheetColours } from "../../../theme/obsidian";
import type { CutawayData } from "../cutaway-data";
import { makeFrame, makeHeightSampler, type Vec3 } from "../frame";
import { openRing, signedArea, type Point } from "../geometry";
import {
  atDistance,
  floorCoverRuns,
  makeCut,
  nearestSample,
  PLACE_ON_LINE_M,
  pointInRing,
  runsEastOf,
} from "../transect";
import { lonLatToUtm } from "../utm";
import { createStage, viewBack, type Stage } from "./stage";
import { contactShadow, createRelief, createWall, hexVec, lightFrom } from "./terrain";
import { landFrame } from "../../../land/geometry";
import { bitmapTexture, heightTexture } from "./textures";

/** The least vertical exaggeration of the model; the view states the one it uses. */
export const CUTAWAY_EXAG = 2.5;
/** The most: beyond it the relief's own 30 m noise stands up as spikes behind the face. */
const CUTAWAY_EXAG_MAX = 8;
/** The section's drawn height over its length that the vertical scale aims at (a low, long place's section is
 * not a flat strip). */
const PROFILE_RATIO = 0.3;

/**
 * The cut's vertical scale from the section's own extent (its height above the ruler's base over its length): the
 * one that draws it PROFILE_RATIO as high as it is long, to the nearest half, between CUTAWAY_EXAG and
 * CUTAWAY_EXAG_MAX.
 */
export function cutawayExag(data: Pick<CutawayData, "catchment" | "range" | "transect">): number {
  const { base } = cutawayRuler(data);
  const span = Math.max(Math.max(...data.transect.h) - base, 1);
  const length = Math.max(data.transect.d.at(-1) ?? 0, 1);
  const wanted = Math.round(((PROFILE_RATIO * length) / span) * 2) / 2;
  return Math.min(CUTAWAY_EXAG_MAX, Math.max(CUTAWAY_EXAG, wanted));
}
/** The size the view was solved at, in CSS px; other sizes scale the picture to fit. */
export const CUTAWAY_DESIGN = { width: 1440, height: 900 } as const;
/** Camera elevation above the horizon and vertical field of view, degrees, as the reference. */
const ELEVATION = 9;
const FOV = 26;
/**
 * The block's region at the design size: about half the frame width, centred a little low and right of centre, so
 * the ruler's labels keep clear of the ask disc's place on the arc.
 */
const FIT = { width: 700, cx: 812, cy: 474, maxHeight: 600 };
/**
 * The elevation ruler for a section: from one tick over the plinth's base to the section's highest point rounded up,
 * labelled at the roundest step that gives three to six labels (500 m on the valley: 1,500 to 3,000 m), with ticks
 * at a fifth of it, the labelled ones long.
 */
export function cutawayRuler(data: Pick<CutawayData, "catchment" | "range" | "transect">): {
  base: number;
  from: number;
  top: number;
  step: number;
  every: number;
  labels: number[];
} {
  const base = landFrame(data.catchment.ring, data.range).base;
  const high = Math.max(...data.transect.h);
  const span = Math.max(high - base, 1);
  const every = [100, 200, 250, 500, 1000, 2000].find((s) => span / s <= 6) ?? 5000;
  const step = every / 5;
  const top = Math.ceil(high / step) * step;
  const labels: number[] = [];
  for (let e = Math.ceil((base + step) / every) * every; e <= top; e += every) labels.push(e);
  return { base, from: base + step, top, step, every, labels };
}
/** How far (km) the ruler stands north of the section's end, and its ticks' lengths. */
const RULER_OFFSET = 0.35;
const TICK = { long: 0.42, short: 0.2 };
/** Drainage line width (CSS px) by Strahler order 1 to 5. */
const DRAINAGE_WIDTH = [0.8, 1, 1.4, 1.9, 2.4] as const;
/** The high slopes the upper rangelands statement points at: this far (m) before the line's south end. */
const HIGH_SLOPE_FROM_END_M = 600;

/** Model points the component projects to place the words; all on the section face or its ends. */
export interface CutawayMarks {
  southBase: Vec3;
  southTop: Vec3;
  /** The band limits at the south end of the face, low then high. */
  southLimits: [Vec3, Vec3];
  northBase: Vec3;
  highSlope: Vec3;
  /** The section's place where the line passes it (null when it misses it by more than PLACE_ON_LINE_M). */
  place: { name: string; top: Vec3; offsetM: number } | null;
  /** Where the valley floor statement hangs: the place, or else the lowest point of the profile. */
  floorAnchor: Vec3;
  /** The ruler's label points, at the end of each long tick. */
  ruler: { elevation: number; at: Vec3 }[];
}

export interface CutawayScene {
  stage: Stage;
  marks: CutawayMarks;
  /** The block's measured box at the design size (CSS px), for the layout checks. */
  fitBox: { x0: number; y0: number; x1: number; y1: number };
  /** Shows the measured view again. */
  reset(): void;
  /** Turns the model about the measured target: degrees of bearing, and of elevation (kept within 2 to 60). */
  turn(dAzimuth: number, dElevation: number): void;
  /**
   * The land cut through in place: at 0 the overview's whole land as the overview showed it, at 1
   * the reference section; between, the land splits along the section line, the western half slides away and the
   * cut face turns toward the visitor.
   */
  setIntro(k: number, from: LandPose): void;
  dispose(): void;
}

function buildCutaway(canvas: HTMLCanvasElement, data: CutawayData): CutawayScene {
  const landcover = bitmapTexture(data.landcover);
  const { meta, relief: H, catchment, rivers, transect: line, places } = data;
  const g = meta.relief;
  const RULER = cutawayRuler(data);
  const BASE = RULER.base;
  const frame = makeFrame(meta.frame, { exag: cutawayExag(data), base: BASE });
  const sample = makeHeightSampler(H, g);
  const hTex = heightTexture(H, g);
  const aRect = frame.rect(meta.analysis);

  // the cut, north end to south end
  const last = line.d.length - 1;
  const nE = line.E[0] ?? 0;
  const nN = line.N[0] ?? 0;
  const sE = line.E[last] ?? 0;
  const sN = line.N[last] ?? 0;
  const sH = line.h[last] ?? 0;
  const pN: Point = [frame.x(nE), frame.z(nN)];
  const pS: Point = [frame.x(sE), frame.z(sN)];
  const cut = makeCut(pN, pS);
  const [ex, ez] = cut.east;
  const sideEN = ([E, N]: Point) => cut.side(frame.x(E), frame.z(N));
  // one warm low light from the front left of the view (north-west of the model), so the section face is lit
  const light = lightFrom(cut.faceBearing + 35, 24, 0.44, {
    colour: modelColours.sectionKeyLight,
    scale: 1.04,
  });

  const stage = createStage(canvas, obsidian.canvas, { fov: FOV });
  const { scene, lines } = stage;

  // the eastern block: relief discarded west of the cut, the catchment wall as runs that end on the cut
  const relief = createRelief(H, g, frame, landcover, aRect, {
    hTex,
    light,
    cover: landcover,
    coverA: 0.62,
    bandLines: 0.5,
    limits: data.limits,
  });
  relief.uniforms.uCut.value.set(...cut.plane, 1);
  scene.add(relief.mesh);
  // the western half, kept only to be cut away when the section opens in place over the overview's land
  const west = createRelief(H, g, frame, landcover, aRect, {
    hTex,
    light,
    cover: landcover,
    coverA: 0.62,
    bandLines: 0.5,
    limits: data.limits,
  });
  west.uniforms.uCut.value.set(-cut.plane[0], -cut.plane[1], -cut.plane[2], 1);
  const westGroup = new Group();
  westGroup.add(west.mesh);
  westGroup.visible = false;
  scene.add(westGroup);
  const walls: Mesh[] = [];
  const ring = openRing(smoothRing(catchment.ring, 2)).map(([E, N]): Point => [E, N]);
  const outward = signedArea(ring) > 0 ? -1 : 1;
  const runs = runsEastOf(ring, sideEN);
  for (const r of runs) {
    const w = createWall(r, sample, frame, { outward, light, limits: data.limits });
    walls.push(w);
    scene.add(w);
  }
  const eastXZ = ring
    .map(([E, N]): Point => [frame.x(E), frame.z(N)])
    .filter(([x, z]) => cut.side(x, z) >= -0.05);
  const shadow = contactShadow(eastXZ, { blurPx: 28, alpha: 0.8, pad: 4 });
  scene.add(shadow);
  scene.add(
    lines.lines(
      runs.map((r) => r.map(([E, N]) => frame.v(E, N, sample(E, N) + 6))),
      { color: modelColours.catchmentLine, opacity: 0.5, width: 1 },
    ),
  );
  // drainage east of the cut; every vertex height is the relief height (+4 m so the line shows)
  for (let order = 1; order <= 5; order++) {
    const pls: Vec3[][] = [];
    for (const r of rivers.reaches.filter((q) => q.order === order)) {
      let part: Vec3[] = [];
      for (const [E, N, h] of r.pts) {
        if (sideEN([E, N]) > 0.02) part.push(frame.v(E, N, h + 4));
        else {
          if (part.length > 1) pls.push(part);
          part = [];
        }
      }
      if (part.length > 1) pls.push(part);
    }
    scene.add(
      lines.lines(pls, {
        color: modelColours.drainage[order - 1] ?? modelColours.catchmentLine,
        width: DRAINAGE_WIDTH[order - 1] ?? 1,
        opacity: 0.9,
      }),
    );
  }

  // the section face under the bundle's profile, lit as one plane facing west
  const prof: Point[] = line.E.map((E, i) => [E, line.N[i] ?? 0]);
  const face = createWall(prof, sample, frame, {
    light,
    limits: data.limits,
    albedo: modelColours.sectionAlbedo,
    bandTint: modelColours.sectionBandTint,
    lineA: 0.08,
    fade: 0.3,
    tops: line.h,
    bandA: [0, 0.13, 0.26],
    limitA: 0.92,
    faceNormal: [-ex, -ez],
  });
  walls.push(face);
  // what the cut alone shows (its face, the lines on it, the ruler) comes in once the cut has opened
  const furnitureFrom = scene.children.length;
  scene.add(face);
  // shift a point toward the camera (west), so lines on the face draw in front of it
  const toward = (E: number, N: number, km: number): Point => [
    E - ex * km * 1000,
    N + ez * km * 1000,
  ];
  scene.add(
    lines.lines(
      [
        prof.map(([E, N], i) => {
          const [e, n] = toward(E, N, 0.02);
          return frame.v(e, n, (line.h[i] ?? 0) + 3);
        }),
      ],
      { color: obsidian.accent, width: 1.8 },
    ),
  );
  // WorldCover tree cover, and cropland or built-up, along the valley floor just under the profile
  for (const cover of ["tree", "crop"] as const) {
    const pls = floorCoverRuns(line)
      .filter((r) => r.cover === cover)
      .map((r) => {
        const pts: Vec3[] = [];
        for (let dm = r.from_m; dm <= r.to_m + 0.1; dm += 10) {
          const [E, N, h] = atDistance(line, Math.min(dm, r.to_m));
          const [e, n] = toward(E, N, 0.03);
          pts.push(frame.v(e, n, h - 22));
        }
        return pts;
      });
    scene.add(
      lines.lines(pls, {
        color: cover === "tree" ? sheetColours.coverTree : sheetColours.coverCrop,
        width: 4.2,
      }),
    );
  }

  // the elevation ruler beyond the north end of the section
  const along = (p: Point, km: number): Point => [
    p[0] + cut.along[0] * km,
    p[1] + cut.along[1] * km,
  ];
  const rulerAt = along(pN, -RULER_OFFSET);
  const rE = frame.E(rulerAt[0]);
  const rN = frame.N(rulerAt[1]);
  const ruler: Vec3[][] = [[frame.v(rE, rN, BASE), frame.v(rE, rN, RULER.top)]];
  for (let e = RULER.from; e <= RULER.top; e += RULER.step) {
    const tip = along(rulerAt, -(e % RULER.every === 0 ? TICK.long : TICK.short));
    ruler.push([frame.v(rE, rN, e), frame.v(frame.E(tip[0]), frame.N(tip[1]), e)]);
  }
  scene.add(lines.lines(ruler, { color: modelColours.catchmentLine, opacity: 0.8, width: 1 }));
  const labelTip = along(rulerAt, -TICK.long);

  // the points the view is fitted to: the block's walls, the face, the ruler, the relief east of the cut
  const fitPts: Vec3[] = [];
  for (const r of runs)
    for (const [E, N] of r) fitPts.push(frame.v(E, N, sample(E, N)), frame.v(E, N, BASE));
  prof.forEach(([E, N], i) => fitPts.push(frame.v(E, N, line.h[i] ?? 0), frame.v(E, N, BASE)));
  fitPts.push(frame.v(rE, rN, RULER.top));
  for (let j = 0; j < g.height; j += 8)
    for (let i = 0; i < g.width; i += 8) {
      const E = g.E0 + (i + 0.5) * g.res;
      const N = g.N0 - (j + 0.5) * g.res;
      if (sideEN([E, N]) < 0 || !pointInRing(ring, E, N)) continue;
      fitPts.push(frame.v(E, N, H[j * g.width + i] ?? 0));
    }
  // the view turns a little under the ruler's middle height (the reference 2,200 m on the valley)
  const pivot = BASE + 0.476 * (RULER.top - BASE);
  const target: Vec3 = [(pN[0] + pS[0]) / 2, frame.y(pivot), (pN[1] + pS[1]) / 2];
  const { distance, shift, box: fitBox } = fitView(fitPts, target, cut.faceBearing);

  // the words' anchors
  const v = (E: number, N: number, h: number) => frame.v(E, N, h);
  const k = Math.max(
    0,
    line.d.findIndex((dm) => dm >= (line.d[last] ?? 0) - HIGH_SLOPE_FROM_END_M),
  );
  // the place the section names: the first named place the cross section spec lists (placeFeatureIds)
  const named = places.places[0];
  let place: CutawayMarks["place"] = null;
  if (named) {
    const [E, N] = lonLatToUtm(named.lonLat[0], named.lonLat[1], data.zone);
    const near = nearestSample(line, E, N);
    if (near.offset_m <= PLACE_ON_LINE_M)
      place = {
        name: named.name,
        top: v(line.E[near.i] ?? 0, line.N[near.i] ?? 0, line.h[near.i] ?? 0),
        offsetM: near.offset_m,
      };
  }
  const low = line.h.indexOf(Math.min(...line.h));
  const marks: CutawayMarks = {
    southBase: v(sE, sN, BASE),
    southTop: v(sE, sN, sH),
    southLimits: [v(sE, sN, data.limits[0]), v(sE, sN, data.limits[1])],
    northBase: v(nE, nN, BASE),
    highSlope: v(line.E[k] ?? 0, line.N[k] ?? 0, line.h[k] ?? 0),
    place,
    floorAnchor: place?.top ?? v(line.E[low] ?? 0, line.N[low] ?? 0, line.h[low] ?? 0),
    ruler: RULER.labels.map((e) => ({
      elevation: e,
      at: v(frame.E(labelTip[0]), frame.N(labelTip[1]), e),
    })),
  };

  const view = (azimuth: number, elevation: number) => {
    stage.setPerspectiveView({
      target,
      azimuth,
      elevation,
      distance,
      shift,
      design: CUTAWAY_DESIGN,
    });
    stage.render();
  };
  const reset = () => {
    view(cut.faceBearing, ELEVATION);
  };
  reset();

  // ---------- the land cut through in place ----------
  const lf = landFrame(catchment.ring, data.range);
  const lightB = light.dir.clone();
  const keyB = (relief.uniforms as unknown as { uLight: { value: Vector3 } }).uLight.value.clone();
  const ambB = (
    relief.uniforms as unknown as { uAmbient: { value: Vector3 } }
  ).uAmbient.value.clone();
  const keyO = hexVec(overviewColours.keyLight).multiplyScalar(1.25);
  const ambO = hexVec(overviewColours.ambient).multiplyScalar(0.62);
  const lit = [relief, west].map(
    (r) =>
      r.uniforms as unknown as {
        uL: { value: Vector3 };
        uLight: { value: Vector3 };
        uAmbient: { value: Vector3 };
      },
  );
  const wallU = walls.map(
    (w) => (w.material as ShaderMaterial).uniforms as unknown as { uShow: { value: number } },
  );
  const shadowMat = shadow.material as Material;
  const shadowA = shadowMat.opacity;
  const rimPts = ring
    .filter((_, i) => i % 4 === 0)
    .flatMap(([E, N]) => {
      const s = sample(E, N);
      return [frame.v(E, N, s), frame.v(E, N, s - lf.rimFoot)];
    });
  let start: { key: string; target: Vec3; distance: number; shift: [number, number] } | null = null;
  /** The camera that puts the whole land in the box the overview left it in (canvas CSS px). */
  const fitStart = (from: LandPose, rect: LandPose["rect"]) => {
    const key = `${rect.x0.toFixed(1)},${rect.y0.toFixed(1)},${rect.x1.toFixed(1)},${rect.y1.toFixed(1)}`;
    if (start?.key === key) return start;
    const t0: Vec3 = [0, frame.y(lf.target), 0];
    let d = distance;
    let sh: [number, number] = [0, 0];
    const { width, height } = stage.size();
    const fit = Math.min(width / CUTAWAY_DESIGN.width, height / CUTAWAY_DESIGN.height);
    for (let it = 0; it < 8; it++) {
      stage.setPerspectiveView({
        target: t0,
        azimuth: from.azimuth,
        elevation: from.elevation,
        distance: d,
        shift: sh,
        design: CUTAWAY_DESIGN,
      });
      const q = rimPts.map((p) => stage.project(p));
      const bx0 = Math.min(...q.map((p) => p.x));
      const bx1 = Math.max(...q.map((p) => p.x));
      const by0 = Math.min(...q.map((p) => p.y));
      const by1 = Math.max(...q.map((p) => p.y));
      d *= (by1 - by0) / Math.max(rect.y1 - rect.y0, 1e-3);
      sh = [
        sh[0] + ((rect.x0 + rect.x1) / 2 - (bx0 + bx1) / 2) / fit,
        sh[1] + ((rect.y0 + rect.y1) / 2 - (by0 + by1) / 2) / fit,
      ];
    }
    start = { key, target: t0, distance: d, shift: sh };
    return start;
  };
  const setIntro = (k: number, from: LandPose) => {
    const box = canvas.getBoundingClientRect();
    const rect = {
      x0: from.rect.x0 - box.left,
      y0: from.rect.y0 - box.top,
      x1: from.rect.x1 - box.left,
      y1: from.rect.y1 - box.top,
    };
    const S = fitStart(from, rect);
    const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (6 * x - 15) + 10));
    const clamp = (x: number) => Math.min(1, Math.max(0, x));
    const c = ease(clamp((k - 0.12) / 0.7));
    const split = ease(clamp(k / 0.55));
    // the camera turns from the overview's view to face the cut
    const dAz = ((cut.faceBearing - from.azimuth + 540) % 360) - 180;
    stage.setPerspectiveView({
      target: [0, 1, 2].map(
        (i) => (S.target[i] ?? 0) + ((target[i] ?? 0) - (S.target[i] ?? 0)) * c,
      ) as Vec3,
      azimuth: from.azimuth + dAz * c,
      elevation: from.elevation + (ELEVATION - from.elevation) * c * c * (3 - 2 * c),
      // the camera stands back a little through the turn, so its path arcs round the block instead of sweeping
      // close past it while it comes down to the face's height
      distance:
        Math.exp(Math.log(S.distance) + (Math.log(distance) - Math.log(S.distance)) * c) *
        (1 + 0.22 * Math.sin(Math.PI * c)),
      shift: [S.shift[0] + (shift[0] - S.shift[0]) * c, S.shift[1] + (shift[1] - S.shift[1]) * c],
      design: CUTAWAY_DESIGN,
    });
    // the western half slides away from the cut and sinks; the cut face and the walls come up out of the ground
    const away = Math.max(lf.kmScale * 30, 1) * split;
    westGroup.visible = k < 0.999;
    westGroup.position.set(-ex * away, -0.6 * away, -ez * away);
    for (const u of wallU) u.uShow.value = ease(clamp((k - 0.15) / 0.45));
    for (const o of scene.children.slice(furnitureFrom)) o.visible = k > 0.35;
    shadowMat.opacity = shadowA * c;
    // lit as the overview lit it when handed over, then as this view lights it
    const l = new Vector3(...from.light).lerp(lightB, c).normalize();
    for (const u of lit) {
      u.uL.value.copy(l);
      u.uLight.value.copy(keyO).lerp(keyB, c);
      u.uAmbient.value.copy(ambO).lerp(ambB, c);
    }
    stage.render();
  };

  return {
    stage,
    marks,
    fitBox,
    reset,
    setIntro,
    turn(dAzimuth, dElevation) {
      const a = stage.angles();
      view(a.azimuth + dAzimuth, Math.min(60, Math.max(2, a.elevation + dElevation)));
    },
    dispose() {
      stage.dispose();
      for (const t of [hTex, landcover]) t.dispose();
    },
  };
}

/** Builds the scene on the next tick; a failure to build rejects. */
export function mountCutaway(canvas: HTMLCanvasElement, data: CutawayData): Promise<CutawayScene> {
  return Promise.resolve().then(() => buildCutaway(canvas, data));
}

/**
 * Distance and lens shift that put the points' box in the design region: the distance scales the box to the
 * region's width or height, whichever binds; the shift then centres it without turning the camera.
 */
function fitView(points: readonly Vec3[], target: Vec3, azimuth: number) {
  const { width: W, height: Hd } = CUTAWAY_DESIGN;
  const cam = new PerspectiveCamera(FOV, W / Hd, 0.5, 4000);
  const back = new Vector3(...viewBack(azimuth, ELEVATION));
  const t = new Vector3(...target);
  const q = new Vector3();
  const box = (distance: number, shift: readonly [number, number]) => {
    cam.position.copy(t).addScaledVector(back, distance);
    cam.up.set(0, 1, 0);
    cam.lookAt(t);
    if (shift[0] || shift[1]) cam.setViewOffset(W, Hd, -shift[0], -shift[1], W, Hd);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of points) {
      q.set(p[0], p[1], p[2]).project(cam);
      const x = (q.x * 0.5 + 0.5) * W;
      const y = (-q.y * 0.5 + 0.5) * Hd;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return { x0, y0, x1, y1 };
  };
  let distance = 60;
  for (let k = 0; k < 7; k++) {
    const b = box(distance, [0, 0]);
    distance *= Math.max((b.x1 - b.x0) / FIT.width, (b.y1 - b.y0) / FIT.maxHeight);
  }
  const b0 = box(distance, [0, 0]);
  const shift: [number, number] = [FIT.cx - (b0.x0 + b0.x1) / 2, FIT.cy - (b0.y0 + b0.y1) / 2];
  return { distance, shift, box: box(distance, shift) };
}
