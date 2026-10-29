// The cutaway (approved specimen B): the catchment model cut along the S2 transect through Tabant, from boundary to
// boundary. The eastern block stays and shows its section: the bundle's profile as the one warm line along the top
// of the lit section face, the 2,316.8 m and 2,815.2 m band limits across the face with each band faintly tinted,
// WorldCover tree cover and cropland or built-up along the valley floor just under the profile, and an elevation
// ruler at the north end. The camera faces the section in perspective; its distance and lens shift are solved at
// the design size so that the block fills its region, and the words are placed by the component from `marks`.

import { PerspectiveCamera, Vector3 } from "three";
import { smoothRing } from "../../../stage/smooth";
import { modelColours, obsidian, sheetColours } from "../../../theme/obsidian";
import { SECTION_PLACE, type CutawayData } from "../cutaway-data";
import { BAND_LIMITS_M } from "../fixtures";
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
import { contactShadow, createRelief, createWall, lightFrom } from "./terrain";
import { heightTexture, loadDataTexture } from "./textures";

/** Vertical exaggeration of the model; the view states it. */
export const CUTAWAY_EXAG = 2.5;
/** Plinth base elevation (m), below the catchment's lowest point of 1,465 m. */
const BASE = 1200;
/** The size the view was solved at, in CSS px; other sizes scale the picture to fit. */
export const CUTAWAY_DESIGN = { width: 1440, height: 900 } as const;
/** Camera elevation above the horizon and vertical field of view, degrees, as specimen B. */
const ELEVATION = 9;
const FOV = 26;
/** The block's region at the design size: about 60 per cent of the frame width, centred a little low. */
const FIT = { width: 880, cx: 712, cy: 474, maxHeight: 600 };
/** The elevation ruler: ticks every 100 m from 1,300 m to its top, long ones every 500 m, labels at these. */
const RULER = { from: 1300, top: 3300, step: 100 };
export const RULER_LABELS = [1500, 2000, 2500, 3000] as const;
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
  dispose(): void;
}

export async function mountCutaway(
  canvas: HTMLCanvasElement,
  data: CutawayData,
  base: string,
  signal?: AbortSignal,
): Promise<CutawayScene> {
  const landcover = await loadDataTexture(`${base}landcover-10m.png`, signal);
  const { meta, relief: H, catchment, rivers, transect: line, places } = data;
  const g = meta.relief;
  const frame = makeFrame(meta.frame, { exag: CUTAWAY_EXAG, base: BASE });
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
  });
  relief.uniforms.uCut.value.set(...cut.plane, 1);
  scene.add(relief.mesh);
  const ring = openRing(smoothRing(catchment.ring, 2)).map(([E, N]): Point => [E, N]);
  const outward = signedArea(ring) > 0 ? -1 : 1;
  const runs = runsEastOf(ring, sideEN);
  for (const r of runs) scene.add(createWall(r, sample, frame, { outward, light }));
  const eastXZ = ring
    .map(([E, N]): Point => [frame.x(E), frame.z(N)])
    .filter(([x, z]) => cut.side(x, z) >= -0.05);
  scene.add(contactShadow(eastXZ, { blurPx: 28, alpha: 0.8, pad: 4 }));
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
  scene.add(
    createWall(prof, sample, frame, {
      light,
      albedo: modelColours.sectionAlbedo,
      bandTint: modelColours.sectionBandTint,
      lineA: 0.08,
      fade: 0.3,
      tops: line.h,
      bandA: [0, 0.13, 0.26],
      limitA: 0.92,
      faceNormal: [-ex, -ez],
    }),
  );
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
    const tip = along(rulerAt, -(e % 500 === 0 ? TICK.long : TICK.short));
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
  const target: Vec3 = [(pN[0] + pS[0]) / 2, frame.y(2200), (pN[1] + pS[1]) / 2];
  const { distance, shift, box: fitBox } = fitView(fitPts, target, cut.faceBearing);

  // the words' anchors
  const v = (E: number, N: number, h: number) => frame.v(E, N, h);
  const k = Math.max(
    0,
    line.d.findIndex((dm) => dm >= (line.d[last] ?? 0) - HIGH_SLOPE_FROM_END_M),
  );
  const named = places.places.find((p) => p.id === SECTION_PLACE);
  let place: CutawayMarks["place"] = null;
  if (named) {
    const [E, N] = lonLatToUtm(named.lonLat[0], named.lonLat[1], 29);
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
    southLimits: [v(sE, sN, BAND_LIMITS_M[0]), v(sE, sN, BAND_LIMITS_M[1])],
    northBase: v(nE, nN, BASE),
    highSlope: v(line.E[k] ?? 0, line.N[k] ?? 0, line.h[k] ?? 0),
    place,
    floorAnchor: place?.top ?? v(line.E[low] ?? 0, line.N[low] ?? 0, line.h[low] ?? 0),
    ruler: RULER_LABELS.map((e) => ({
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

  return {
    stage,
    marks,
    fitBox,
    reset,
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
