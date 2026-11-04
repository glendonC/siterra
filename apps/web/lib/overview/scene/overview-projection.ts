// Dial 3D placement, sight-line occlusion, and screen-space layout projection for the overview scene.

import { type Camera, Vector3 } from "three";
import type { Frame, Grid, Vec3 } from "../../instruments/valley/frame";
import type { Stage } from "../../instruments/valley/scene/stage";
import type { LandFrame } from "../../land/geometry";
import { ARC, type ArcSpan, DIAL, DIAL1, lerp, outward, SPAN, sstep, uOf } from "../arc";
import type { FindingId } from "../findings";
import {
  awayOf,
  type Box,
  bbox,
  contourSteps,
  createCameraRig,
  EXAG,
  FOV,
  OVERVIEW_DESIGN,
  type Point,
  reliefExaggeration,
  type SceneState,
  type Selection,
  sideOf,
  SURVEY_ACCENT,
  type View,
} from "./overview-camera";
import { CELL_RISE } from "./overview-sheets";
import type { StackLayout } from "./overview-stack";

export {
  awayOf,
  type Box,
  bbox,
  contourSteps,
  EXAG,
  FOV,
  OVERVIEW_DESIGN,
  type Point,
  reliefExaggeration,
  type SceneState,
  type Selection,
  sideOf,
  SURVEY_ACCENT,
  type View,
};

export interface FindingPlace {
  dot: Point;
  /** Outward unit vector on screen. */
  ux: number;
  uy: number;
  /** Occluded behind the terrain from the active camera. */
  behind: boolean;
  /** 1 on the drawn arc, 0 past its drawn end. */
  onArc: number;
  /** Anchored label position outside the land box. */
  label?: Point;
}

export interface OverviewLayout {
  /** Canvas CSS px = offset + design px * scale. */
  fit: { scale: number; ox: number; oy: number };
  e: number;
  centre: Point;
  findings: Partial<Record<FindingId, FindingPlace>>;
  ask: Point;
  field: Point | null;
  pixelTop: Point | null;
  /** The end of each proposed route (its candidate site) on screen, and whether the land hides it. */
  routeEnds: { id: string; at: Point; behind: boolean }[];
  /** Where the routes start (their shared first vertex) on screen, when the case has routes. */
  routeStart: { at: Point; behind: boolean } | null;
  /** The lifted layer's right-most rim point on screen, where its label's leader starts, while one is lifted. */
  liftAt: Point | null;
  /** The land's sheets off the land: every one while it stands split, else the one lifted alone (overview-stack). */
  stack: StackLayout;
  /** Screen-space bounding box of the terrain and anchor point for the open finding card. */
  landBox: { x0: number; y0: number; x1: number; y1: number };
  anchor: Point | null;
  /** Screen-space region that the open finding card must not occlude. */
  subject: { x0: number; y0: number; x1: number; y1: number };
  /** Points sampled every 2 degrees along the dial arc from its start clockwise over its span. */
  arcAt: Point[];
  /** Left-most rim point in the middle vertical band of the terrain on screen. */
  rimLeft: Point | null;
  /** Bounding box of the pixel footprint and its risen cells on screen while inspected. */
  pixelBox: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Screen position and occlusion flag for each package field check's elevation band centroid. */
  stands: ({ at: Point; behind: boolean } | null)[];
  /** Projected outline of the pixel footprint on the terrain and at its risen cell height while inspected. */
  pixelPlace: Point[] | null;
  pixelCells: Point[] | null;
  /** Right-most visible rim point of each elevation band (lowest first) for temporal snow band leaders. */
  bandEdges: (Point | null)[];
  /** Screen coordinates (x, y pairs, design px) of all recorded life occurrences while visible. */
  lifeAt: Float32Array | null;
  /** Focused recorded-life occurrence position, occlusion state, and terrain-draped uncertainty ring. */
  lifeFocus: { at: Point; behind: boolean; ring: Point[] | null } | null;
}

const DEG = Math.PI / 180;
const rad = (d: number) => d * DEG;
const arr = (v: Vector3): Vec3 => [v.x, v.y, v.z];

/** Builds the camera rig solver, dial 3D projector, sight-line occlusion tester, and layout assembler. */
export function createProjectionRig(opts: {
  stage: Stage;
  camera: Camera;
  lf: LandFrame;
  frame: Frame;
  g: Grid;
  H: Float32Array;
  M30: Uint8Array;
  sample: (E: number, N: number) => number;
  rim: readonly [number, number][];
  findings: readonly { id: FindingId; clock: number }[];
  bandLimitM: number | null;
  pixelCentre: readonly [number, number] | undefined;
  pixelPts: readonly Vec3[];
  RC: Vec3 | null;
  routeProbe: readonly Vec3[];
  routeEnds: readonly { id: string; p: Vec3 }[];
  routeStart: Vec3 | null;
  exag: number;
}) {
  const {
    stage,
    camera,
    lf,
    frame,
    g,
    M30,
    sample,
    rim,
    findings,
    pixelCentre,
    pixelPts,
    routeEnds,
    routeStart,
    exag,
  } = opts;
  const design = OVERVIEW_DESIGN;
  const camRig = createCameraRig(opts);
  const { project, rimTop, landBox, TP, TB, rangePlace } = camRig;

  // Dial 3D placement and sight-line occlusion
  const fwd = new Vector3();
  const camR = new Vector3();
  const camU = new Vector3();
  let DC = new Vector3();
  let DR = new Vector3();
  let DU = new Vector3();
  let DRW = 1;
  let ROLL = 0;
  const fpx = design.height / 2 / Math.tan(rad(FOV / 2));

  const placeDial = (e: number, targetDist: number, selClock: number, left: boolean) => {
    const fit = camRig.getFit();
    camera.updateMatrixWorld();
    camera.getWorldDirection(fwd);
    camR.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    camU.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const cx = lerp(DIAL.cx, left ? design.width - DIAL1.cx : DIAL1.cx, e);
    const cy = lerp(DIAL.cy, DIAL1.cy, e);
    const r = lerp(DIAL.r, DIAL1.r, e);
    const yaw = rad(lerp(0, left ? -DIAL1.yaw : DIAL1.yaw, e));
    const depth = targetDist + DIAL.back * lf.kmScale;
    const { width, height } = stage.size();
    const px = fit.ox + cx * fit.scale;
    const py = fit.oy + cy * fit.scale;
    const ndc = new Vector3((px / width) * 2 - 1, 1 - (py / height) * 2, 0.5).unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    DC = camera.position.clone().addScaledVector(dir, depth / dir.dot(fwd));
    DR = camR.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(fwd, Math.sin(yaw)).normalize();
    DU = camU.clone();
    DRW = (r * depth) / fpx;
    ROLL = ((left ? 270 : 90) - selClock) * e;
  };

  const dialAt = (clock: number): Vec3 =>
    arr(
      DC.clone()
        .addScaledVector(DR, Math.sin(rad(clock + ROLL)) * DRW)
        .addScaledVector(DU, Math.cos(rad(clock + ROLL)) * DRW),
    );

  const occluded = (p: Vec3): boolean => {
    const c = camera.position;
    const L = Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - c.z);
    const n = 1500;
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if ((1 - t) * L < 0.35) break;
      const x = c.x + (p[0] - c.x) * t;
      const y = c.y + (p[1] - c.y) * t;
      const z = c.z + (p[2] - c.z) * t;
      if (y > frame.y(lf.ceiling)) continue;
      const E = frame.E(x);
      const N = frame.N(z);
      const i = Math.floor((E - g.E0) / g.res);
      const j = Math.floor((g.N0 - N) / g.res);
      if (i < 0 || j < 0 || i >= g.width || j >= g.height || !M30[j * g.width + i]) continue;
      const ty = frame.y(sample(E, N));
      if (y < ty - (20 * exag) / 1000 && y > ty - (lf.wall * exag) / 1000) return true;
    }
    return false;
  };

  const rimByHeight = rim
    .filter((_, i) => i % 3 === 0)
    .map(([E, N]) => ({ h: sample(E, N), p: frame.v(E, N, sample(E, N)) }));

  const bandEdgesOf = (st: SceneState): OverviewLayout["bandEdges"] => {
    if (st.sel !== "time" || !st.snow) return [];
    const [lo, hi] = st.snow.limits;
    const inBand = (h: number, b: number) =>
      b === 0 ? h < lo : b === 1 ? h >= lo && h < hi : h >= hi;
    return [0, 1, 2].map((b) => {
      let best: Point | null = null;
      for (const r of rimByHeight) {
        if (!inBand(r.h, b) || occluded(r.p)) continue;
        const q = project(r.p);
        if (!best || q.x > best.x) best = q;
      }
      return best;
    });
  };

  const standsOf = (st: SceneState): OverviewLayout["stands"] =>
    st.sel !== "package" && st.sel !== "results"
      ? []
      : (st.ranges ?? []).map((r) => {
          const p = rangePlace(r.lo, r.hi);
          return p ? { at: project(p), behind: occluded(p) } : null;
        });

  const subjectOf = (sel: Selection | null, lb: Box): Box => {
    if ((sel === "pixel" || sel === "field") && pixelPts.length) {
      const b = bbox(pixelPts.map(project));
      return { x0: b.x0 - 36, y0: b.y0 - 36, x1: b.x1 + 36, y1: b.y1 + 36 };
    }
    if (sel === "band" && TB) {
      const c = project(TB);
      return { x0: c.x - 140, y0: c.y - 90, x1: c.x + 140, y1: c.y + 90 };
    }
    return lb;
  };

  const anchorOf = (sel: Selection | null, lb: { x0: number; x1: number }): Point | null => {
    if (!sel || sel === "results" || sel === "routes") return null;
    if ((sel === "pixel" || sel === "field") && TP) return project(TP);
    if (sel === "band" && TB) return project(TB);
    const toward = (lb.x0 + lb.x1) / 2 > design.width / 2 ? -1 : 1;
    const pts = rimTop.map(project);
    return pts.reduce((b, q) => (q.x * toward > b.x * toward ? q : b));
  };

  return {
    ...camRig,
    placeDial,
    dialAt,
    getRoll: () => ROLL,
    occluded,
    buildLayout(
      state: SceneState,
      span: ArcSpan,
      liftAt: Point | null,
      stack: StackLayout,
      lifeData: {
        lifeAt: Float32Array | null;
        lifeFocus: { at: Point; behind: boolean; ring: Point[] | null } | null;
      },
    ): OverviewLayout {
      const fit = camRig.getFit();
      const { e } = camRig.getCurrent();
      const lb = landBox();
      const rimPts = rimTop.map(project);
      const rimAtY = (side: "left" | "right", yTarget: number): Point => {
        const band = rimPts.filter((q) => Math.abs(q.y - yTarget) <= 95);
        const from = band.length ? band : rimPts;
        if (!from.length) return { x: side === "left" ? lb.x0 : lb.x1, y: yTarget };
        return from.reduce((b, q) => (side === "left" ? (q.x < b.x ? q : b) : q.x > b.x ? q : b));
      };
      const placed: OverviewLayout["findings"] = {};
      for (const f of findings) {
        const onArc = sstep(-2, 6, span.end - uOf(f.clock));
        if (f.id === "band" && TB) {
          const p = project(TB);
          placed[f.id] = {
            dot: { x: p.x, y: p.y - 26 },
            ux: 1,
            uy: 0,
            behind: false,
            onArc,
            label: { x: Math.min(1120, Math.max(lb.x1 + 36, 980)), y: 300 },
          };
        } else if (f.id === "pixel" && TP) {
          const p = project(TP);
          placed[f.id] = {
            dot: { x: p.x, y: p.y - 26 },
            ux: 1,
            uy: 0,
            behind: false,
            onArc,
            label: { x: Math.min(1120, Math.max(lb.x1 + 36, 980)), y: 452 },
          };
        } else if (f.id === "rain") {
          const yTarget = TB || TP ? 560 : 365;
          placed[f.id] = {
            dot: rimAtY("right", yTarget),
            ux: 1,
            uy: 0,
            behind: false,
            onArc,
            label: { x: Math.min(1120, Math.max(lb.x1 + 36, 980)), y: yTarget },
          };
        } else if (f.id === "fdr") {
          placed[f.id] = {
            dot: rimAtY("left", 520),
            ux: -1,
            uy: 0,
            behind: false,
            onArc,
            label: { x: Math.max(300, Math.min(lb.x0 - 36, 430)), y: 520 },
          };
        } else if (f.id === "catchment") {
          placed[f.id] = {
            dot: rimAtY("left", 470),
            ux: -1,
            uy: 0,
            behind: false,
            onArc,
            label: { x: Math.max(300, Math.min(lb.x0 - 36, 430)), y: 470 },
          };
        } else {
          const p = dialAt(f.clock);
          placed[f.id] = {
            dot: project(p),
            ...outward(f.clock, ROLL),
            behind: occluded(p),
            onArc,
          };
        }
      }
      const selPlace =
        state.sel && state.sel !== "field" && state.sel !== "results" && state.sel !== "routes"
          ? placed[state.sel as FindingId]
          : undefined;
      return {
        fit,
        e,
        centre: project(arr(DC)),
        findings: placed,
        ask: project(dialAt(ARC.a0)),
        field: pixelCentre
          ? project(
              frame.v(pixelCentre[0], pixelCentre[1], sample(pixelCentre[0], pixelCentre[1]) + 10),
            )
          : null,
        pixelTop: pixelPts.length
          ? pixelPts.map(project).reduce((b, q) => (q.y < b.y ? q : b))
          : null,
        routeEnds: routeEnds.map((r) => ({ id: r.id, at: project(r.p), behind: occluded(r.p) })),
        routeStart: routeStart ? { at: project(routeStart), behind: occluded(routeStart) } : null,
        liftAt,
        stack,
        landBox: lb,
        anchor: selPlace ? selPlace.dot : anchorOf(state.sel, lb),
        subject: subjectOf(state.sel, lb),
        arcAt: Array.from({ length: Math.floor(SPAN / 2) + 1 }, (_, i) =>
          project(dialAt(ARC.a0 + i * 2)),
        ),
        rimLeft: (() => {
          const pts = rimTop.map(project);
          const mid = pts.filter(
            (q) => q.y >= lb.y0 + 0.35 * (lb.y1 - lb.y0) && q.y <= lb.y0 + 0.65 * (lb.y1 - lb.y0),
          );
          const from = mid.length ? mid : pts;
          return from.length ? from.reduce((b, q) => (q.x < b.x ? q : b)) : null;
        })(),
        pixelBox:
          (state.split ?? 0) > 0.5 && pixelPts.length
            ? bbox(pixelPts.flatMap((p) => [project(p), project([p[0], p[1] + CELL_RISE, p[2]])]))
            : null,
        stands: standsOf(state),
        pixelPlace: (state.split ?? 0) > 0.5 && pixelPts.length ? pixelPts.map(project) : null,
        pixelCells:
          (state.split ?? 0) > 0.5 && pixelPts.length
            ? pixelPts.map((p) => project([p[0], p[1] + CELL_RISE, p[2]]))
            : null,
        bandEdges: bandEdgesOf(state),
        lifeAt: lifeData.lifeAt,
        lifeFocus: lifeData.lifeFocus,
      };
    },
  };
}
