// Camera rig solver, perspective view interpolation, and terrain scale/contour math for the
// overview scene.

import { Vector3 } from "three";
import type { CellPaint } from "../../instruments/pixel/paint";
import type { Frame, Grid, Vec3 } from "../../instruments/valley/frame";
import type { PerspectiveView, Stage } from "../../instruments/valley/scene/stage";
import type { LandFrame } from "../../land/geometry";
import { overviewColours } from "../../theme/obsidian";
import { clamp01, DIAL, ease, lerp, SPAN, sstep, uOf } from "../arc";
import type { FindingId } from "../findings";
import { CELL_RISE, type LiftId } from "./overview-sheets";

export const OVERVIEW_DESIGN = { width: 1440, height: 900 } as const;
/** Base vertical exaggeration factor for mountain relief. */
export const EXAG = 2.5;
/** Accent colour shared by the survey plan and the measurement front. */
export const SURVEY_ACCENT = overviewColours.surveyAccent;
/** Vertical field of view at the design height (degrees). */
export const FOV = 26;

/** Relief at least this share of the land's diagonal is drawn at EXAG; flatter land is raised more, to MAX_EXAG. */
const EXAG_REF_RATIO = 0.025;
const MAX_EXAG = 6;

/**
 * Display vertical scale for a terrain (all elevation readouts remain unscaled): EXAG for relief at least
 * EXAG_REF_RATIO of its diagonal, raised proportionally for gentler terrain up to MAX_EXAG, rounded to one decimal.
 */
export function reliefExaggeration(reliefM: number, diagonalKm: number): number {
  const ratio = Math.max(1e-6, reliefM) / Math.max(1e-3, diagonalKm * 1000);
  return Math.round(Math.min(MAX_EXAG, Math.max(EXAG, (EXAG * EXAG_REF_RATIO) / ratio)) * 10) / 10;
}

/** Contour and index intervals (m) for a relief range: about eight lines across it, never wider than 250 and 1000. */
export function contourSteps(reliefM: number): readonly [number, number] {
  const steps: ReadonlyArray<readonly [number, number]> = [
    [1, 5],
    [2, 10],
    [5, 25],
    [10, 50],
    [20, 100],
    [25, 100],
    [50, 250],
    [100, 500],
    [250, 1000],
  ];
  return steps.find(([c]) => c >= reliefM / 8) ?? [250, 1000];
}

/** Default overview camera parameters: bearing, elevation, fitted height/width limits, and target screen centre (design px). */
export const OV = { az: 52, el: 34, fh: 640, fw: 700, cx: 731, cy: 494 } as const;
/** Initial apparent diameter (design px) of the catchment when arriving from the globe view. */
export const INTRO_PX = 30;
/** Minimum clearance (design px) between the terrain rim and the dial arc at rest. */
export const ARC_CLEAR = 64;
/** Camera parameters when zoomed in on a single point finding (bearing, elevation, distance km, and screen target). */
export const ND = { az: 40, el: 33, dist: 42, x: 360, y: 600 } as const;
/** Whole-catchment finding layout: fits the entire terrain on one side clear of the open record card. */
export const WIDE = { fh: 560, cx: 300, cy: 470 } as const;
/** Next-steps package layout: fits the terrain in the middle column (design px). */
export const PKG = { fh: 540, cx: 720, cy: 478, aside: 190 } as const;
/** Walking routes layout: elevated close-in view fitting all routes on the left side of the stage. */
export const RT = { el: 40, w: 470, h: 320, cx: 370, cy: 570 } as const;
/** Reference clock angle (degrees) for scaling azimuthal camera swing by finding position. */
export const PIXEL_CLOCK = 52;
export const TURN = (ND.az - OV.az) / Math.sin((PIXEL_CLOCK * Math.PI) / 180);

/** Screen-space bounding box (design px) reserved for the inspected pixel and its risen cells between surrounding cards. */
const PIXEL_GAP = { x0: 495, y0: 200, x1: 820, y1: 830 };
const PIXEL_ELEVATION = 52;
/** Aspect ratio threshold above which a foreshortened slope pixel is viewed from a steeper top-down angle. */
const TALL_PIXEL = 1.8;
const PIXEL_TOP = 75;

const DEG = Math.PI / 180;
const rad = (d: number) => d * DEG;
const v3 = (p: Vec3) => new Vector3(p[0], p[1], p[2]);
const arr = (v: Vector3): Vec3 => [v.x, v.y, v.z];

/**
 * Attenuation factor (0 to 1) for the dial arc, labels, and prompt disc when the camera is orbited,
 * tilted, panned, or zoomed away from the resting overview pose.
 */
export function awayOf(v: {
  zoom?: number;
  turn?: number;
  pitch?: number;
  panX?: number;
  panY?: number;
}): number {
  const turned = Math.abs(v.turn ?? 0) / 18;
  const pitched = Math.abs(v.pitch ?? 0) / 14;
  const panned = Math.hypot(v.panX ?? 0, v.panY ?? 0) / 1.5;
  const closer = Math.max(0, 1 / (v.zoom ?? 1) - 1) * 4;
  return Math.min(1, Math.max(turned, pitched, panned, closer));
}

/** Active selection mode in the overview scene. */
export type Selection = FindingId | "field" | "results" | "routes" | "package" | "time";

/** Side of the screen on which a selection's record opens: findings on the left half of the dial open on the left. */
export const sideOf = (sel: Selection | null, clock: number | undefined): "left" | "right" =>
  sel !== null && sel !== "field" && sel !== "results" && sel !== "routes" && (clock ?? 0) > 180
    ? "left"
    : "right";

/** Selections that frame the entire catchment without azimuthal camera swing or depth-of-field blur. */
const WHOLE = new Set<Selection>(["catchment", "fdr", "rain", "results", "package", "time"]);

export interface SceneState {
  /** Opening of the selection: 0 rest, 1 opened. */
  s: number;
  /** Hover on one finding, the ask circle hovered, the ask open (0 to 1 each). */
  h: number;
  k: number;
  o: number;
  /** The routes' entry hovered or focused (0 to 1). */
  r: number;
  /** One route picked in the opened list (its context feature id): it is lifted and the others quieted. */
  route?: string | null;
  /** Camera adjustments: distance multiplier, bearing turn, pitch tilt, and horizontal pan. */
  zoom?: number;
  turn?: number;
  pitch?: number;
  panX?: number;
  panY?: number;
  /** The finding opening or open (kept while it closes). */
  sel: Selection | null;
  /**
   * Arrival transition from the globe (0 to 1 each; absent at rest). `rise` interpolates the camera
   * from top-down above `from` (CSS px) through the 2D survey plan to the 3D overview pose; `arcDraw`
   * controls the drawn span of the dial arc.
   */
  rise?: number;
  arcDraw?: number;
  from?: { x: number; y: number };
  /**
   * Layer-stack transition (0 to 1): narrows field of view while dollying back so the terrain
   * approaches an orthographic projection at constant apparent size.
   */
  exit?: number;
  /**
   * Pixel inspection transition (0 to 1): flies the camera down to the MODIS pixel and raises its
   * 10 m Sentinel-2 cells above the surface.
   */
  split?: number;
  /** Colour mode for the risen Sentinel-2 cells: true colour, monthly NDVI, or WorldCover class. */
  cellPaint?: CellPaint;
  /** Elevated evidence layer state at rest: layer id and progress `k` (0 down to 1 raised). */
  lift?: { layer: LiftId; k: number } | null;
  /**
   * Next-steps package elevation bands: height bounds (m) for each field check in package order
   * (null bounds denote catchment minimum/maximum), and the index `lit` highlighted in the accent.
   */
  ranges?: readonly { lo: number | null; hi: number | null }[];
  /**
   * Measurement front: a hairline contour at `height` (m) rising through the relief with the survey
   * grid and 50 m contours lit below it at strength `a` (0 to 1).
   */
  scan?: { height: number; a: number } | null;
  lit?: number | null;
  /** Horizontal offset factor (0 centred to 1 shifted aside) when a package card is open. */
  aside?: number;
  /**
   * Temporal view ("time") overlay canvas painted over `overlayGrid`, and monthly snow share per elevation band.
   */
  overlay?: { canvas: HTMLCanvasElement; version: number } | null;
  snow?: { limits: readonly [number, number]; shares: readonly [number, number, number] } | null;
  /** Suppresses the dial arc when transitioning between results and package views. */
  quiet?: boolean;
  /**
   * Recorded life layer opacity (0 to 1), focused occurrence index, and uncertainty radius (m).
   */
  life?: number;
  lifeFocus?: number | null;
  lifeRing?: number | null;
}

export interface Point {
  x: number;
  y: number;
}

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type View = Omit<PerspectiveView, "design"> & { shift: [number, number] };

export const bbox = (pts: readonly Point[]): Box =>
  pts.reduce(
    (b, p) => ({
      x0: Math.min(b.x0, p.x),
      y0: Math.min(b.y0, p.y),
      x1: Math.max(b.x1, p.x),
      y1: Math.max(b.y1, p.y),
    }),
    { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 },
  );

/** Solves resting, survey-plan, arrival, pixel, route, and per-finding camera views and elevation centroids. */
export function createCameraRig(opts: {
  stage: Stage;
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
}) {
  const {
    stage,
    lf,
    frame,
    g,
    H,
    M30,
    sample,
    rim,
    findings,
    bandLimitM,
    pixelCentre,
    pixelPts,
    RC,
    routeProbe,
  } = opts;
  const design = OVERVIEW_DESIGN;
  const az0 = lf.bearing;
  const azN = az0 + (ND.az - OV.az);

  let fit = { scale: 1, ox: 0, oy: 0 };
  const updateFit = () => {
    const { width, height } = stage.size();
    const scale = Math.min(width / design.width, height / design.height);
    fit = {
      scale,
      ox: (width - design.width * scale) / 2,
      oy: (height - design.height * scale) / 2,
    };
  };
  const project = (p: Vec3): Point => {
    const q = stage.project(p);
    return { x: (q.x - fit.ox) / fit.scale, y: (q.y - fit.oy) / fit.scale };
  };
  const set = (v: View) => {
    stage.setPerspectiveView({ ...v, design });
    updateFit();
  };

  const rimTop = rim.filter((_, i) => i % 4 === 0).map(([E, N]) => frame.v(E, N, sample(E, N)));
  const rimFoot = rim
    .filter((_, i) => i % 4 === 0)
    .map(([E, N]) => frame.v(E, N, sample(E, N) - lf.rimFoot));
  const landBox = () => bbox([...rimTop, ...rimFoot].map(project));
  const T0: Vec3 = [0, frame.y(lf.target), 0];

  const fitLand = (az: number, el: number, fh: number, cx: number, cy: number): View => {
    let distance = 90 * lf.kmScale;
    const fw = (OV.fw * fh) / OV.fh;
    for (let it = 0; it < 10; it++) {
      set({ target: T0, azimuth: az, elevation: el, distance, shift: [0, 0] });
      const b = landBox();
      distance *= Math.max((b.y1 - b.y0) / fh, (b.x1 - b.x0) / fw);
    }
    set({ target: T0, azimuth: az, elevation: el, distance, shift: [0, 0] });
    const b = landBox();
    return {
      target: T0,
      azimuth: az,
      elevation: el,
      distance,
      shift: [cx - (b.x0 + b.x1) / 2, cy - (b.y0 + b.y1) / 2],
    };
  };

  const arcClearance = (v: View): number => {
    set({ ...v, shift: [0, 0] });
    let least = Infinity;
    for (const q of [...rimTop, ...rimFoot]) {
      const p = project(q);
      const x = p.x + v.shift[0] - DIAL.cx;
      const y = p.y + v.shift[1] - DIAL.cy;
      const clock = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
      if (uOf(clock) > SPAN) continue;
      least = Math.min(least, DIAL.r - Math.hypot(x, y));
    }
    return least;
  };

  let fh = OV.fh;
  let view0 = fitLand(az0, OV.el, fh, OV.cx, OV.cy);
  for (let it = 0; it < 8; it++) {
    const c = arcClearance(view0);
    if (c >= ARC_CLEAR) break;
    fh *= (DIAL.r - ARC_CLEAR) / Math.max(DIAL.r - c, DIAL.r - ARC_CLEAR + 1);
    view0 = fitLand(az0, OV.el, fh, OV.cx, OV.cy);
  }
  const viewPlan = fitLand(az0, 82, fh * 0.96, OV.cx, OV.cy);

  let introAt: { key: string; view: View } | null = null;
  const introView = (from: { x: number; y: number }): View => {
    const key = `${from.x.toFixed(1)},${from.y.toFixed(1)},${fit.scale.toFixed(4)}`;
    if (introAt?.key === key) return introAt.view;
    const top = { target: T0, azimuth: 180, elevation: 88, shift: [0, 0] as [number, number] };
    let distance = view0.distance;
    for (let it = 0; it < 8; it++) {
      set({ ...top, distance });
      const b = landBox();
      distance *= Math.max(b.x1 - b.x0, b.y1 - b.y0) / INTRO_PX;
    }
    set({ ...top, distance });
    const b = landBox();
    const dx = (from.x - fit.ox) / fit.scale;
    const dy = (from.y - fit.oy) / fit.scale;
    const view: View = {
      ...top,
      distance,
      shift: [dx - (b.x0 + b.x1) / 2, dy - (b.y0 + b.y1) / 2],
    };
    introAt = { key, view };
    return view;
  };

  const pointAt = (target: Vec3, az: number): View => {
    const v: View = {
      target,
      azimuth: az,
      elevation: ND.el,
      distance: ND.dist * lf.kmScale,
      shift: [0, 0],
    };
    set(v);
    const s = project(target);
    return { ...v, shift: [ND.x - s.x, ND.y - s.y] };
  };

  const TP: Vec3 | null = pixelCentre
    ? frame.v(pixelCentre[0], pixelCentre[1], sample(pixelCentre[0], pixelCentre[1]))
    : null;

  let pixelSolved: View | null = null;
  const pixelView = (tp: Vec3): View => {
    if (pixelSolved) return pixelSolved;
    const pts = pixelPts.flatMap((p): Vec3[] => [p, [p[0], p[1] + CELL_RISE, p[2]]]);
    const gw = PIXEL_GAP.x1 - PIXEL_GAP.x0;
    const gh = PIXEL_GAP.y1 - PIXEL_GAP.y0;
    const solve = (elevation: number): { v: View; tall: number } => {
      const v: View = {
        target: [tp[0], tp[1] + CELL_RISE / 2, tp[2]],
        azimuth: azN,
        elevation,
        distance: 3,
        shift: [0, 0],
      };
      let tall = 1;
      for (let it = 0; it < 8 && pts.length; it++) {
        set(v);
        const b = bbox(pts.map(project));
        tall = (b.y1 - b.y0) / Math.max(b.x1 - b.x0, 1);
        v.distance *= Math.max((b.x1 - b.x0) / gw, (b.y1 - b.y0) / gh);
        v.shift = [
          v.shift[0] + ((PIXEL_GAP.x0 + PIXEL_GAP.x1) / 2 - (b.x0 + b.x1) / 2),
          v.shift[1] + ((PIXEL_GAP.y0 + PIXEL_GAP.y1) / 2 - (b.y0 + b.y1) / 2),
        ];
      }
      return { v, tall };
    };
    let best = solve(PIXEL_ELEVATION);
    if (best.tall > TALL_PIXEL) best = solve(PIXEL_TOP);
    pixelSolved = best.v;
    return best.v;
  };

  let TB: Vec3 | null = null;
  if (bandLimitM !== null) {
    let sE = 0;
    let sN = 0;
    let n = 0;
    for (let j = 0; j < g.height; j++)
      for (let i = 0; i < g.width; i++) {
        const k = j * g.width + i;
        if (!M30[k] || (H[k] ?? Infinity) >= bandLimitM) continue;
        sE += g.E0 + (i + 0.5) * g.res;
        sN += g.N0 - (j + 0.5) * g.res;
        n++;
      }
    if (n) TB = frame.v(sE / n, sN / n, sample(sE / n, sN / n));
  }

  const rangePlaces = new Map<string, Vec3 | null>();
  const rangePlace = (lo: number | null, hi: number | null): Vec3 | null => {
    const key = `${String(lo)}:${String(hi)}`;
    if (rangePlaces.has(key)) return rangePlaces.get(key) ?? null;
    let sE = 0;
    let sN = 0;
    let n = 0;
    for (let j = 0; j < g.height; j++)
      for (let i = 0; i < g.width; i++) {
        const k = j * g.width + i;
        const h = H[k] ?? NaN;
        if (!M30[k] || !(h >= (lo ?? -Infinity)) || !(h < (hi ?? Infinity))) continue;
        sE += g.E0 + (i + 0.5) * g.res;
        sN += g.N0 - (j + 0.5) * g.res;
        n++;
      }
    const at = n ? frame.v(sE / n, sN / n, sample(sE / n, sN / n)) : null;
    rangePlaces.set(key, at);
    return at;
  };

  const clockOf = (sel: Selection | null) =>
    findings.find(
      (f) => f.id === (sel === "field" ? "pixel" : sel === "results" ? "catchment" : sel),
    )?.clock ?? PIXEL_CLOCK;

  const routesView = (target: Vec3): View => {
    const base = { target, azimuth: azN, elevation: RT.el, shift: [0, 0] as [number, number] };
    let distance = ND.dist * lf.kmScale;
    for (let it = 0; it < 10; it++) {
      set({ ...base, distance });
      const b = bbox(routeProbe.map(project));
      distance *= Math.max((b.y1 - b.y0) / RT.h, (b.x1 - b.x0) / RT.w);
    }
    set({ ...base, distance });
    const b = bbox(routeProbe.map(project));
    return { ...base, distance, shift: [RT.cx - (b.x0 + b.x1) / 2, RT.cy - (b.y0 + b.y1) / 2] };
  };

  const views = new Map<Selection, View>();
  const viewFor = (sel: Selection): View => {
    const known = views.get(sel);
    if (known) return known;
    const az = az0 + TURN * Math.sin(rad(clockOf(sel)));
    const place = sel === "pixel" || sel === "field" ? TP : sel === "band" ? TB : null;
    const left = sideOf(sel, clockOf(sel)) === "left";
    const v =
      sel === "time"
        ? view0
        : sel === "package"
          ? fitLand(az0, ND.el, PKG.fh, PKG.cx, PKG.cy)
          : sel === "routes" && RC
            ? routesView(RC)
            : place
              ? pointAt(place, az)
              : fitLand(
                  WHOLE.has(sel) ? az0 : az,
                  ND.el,
                  WIDE.fh,
                  left ? design.width - WIDE.cx : WIDE.cx,
                  WIDE.cy,
                );
    views.set(sel, v);
    return v;
  };

  for (const f of findings) viewFor(f.id);
  viewFor("field");
  viewFor("results");
  viewFor("package");
  viewFor("time");
  if (RC) viewFor("routes");
  set(view0);

  const viewAt = (v0: View, v1: View, e: number): View => {
    const dAz = ((v1.azimuth - v0.azimuth + 540) % 360) - 180;
    return {
      target: arr(v3(v0.target).lerp(v3(v1.target), e)),
      azimuth: v0.azimuth + dAz * e,
      elevation: lerp(v0.elevation, v1.elevation, e),
      distance: Math.exp(lerp(Math.log(v0.distance), Math.log(v1.distance), e)),
      shift: [lerp(v0.shift[0], v1.shift[0], e), lerp(v0.shift[1], v1.shift[1], e)],
    };
  };

  let current = { e: 0, view: view0, selClock: PIXEL_CLOCK };

  return {
    getFit: () => fit,
    updateFit,
    project,
    set,
    rimTop,
    landBox,
    view0,
    viewPlan,
    TP,
    TB,
    rangePlace,
    clockOf,
    viewFor,
    viewAt,
    introView,
    pixelView,
    getCurrent: () => current,
    solveCameraFrame(next: SceneState) {
      const e = ease(next.s);
      const v1 = next.sel ? viewFor(next.sel) : view0;
      const rise = next.rise ?? 1;
      const splitK = clamp01(next.split ?? 0);
      const destView = viewAt(view0, v1, e);
      const planToCarveK = ease(sstep(0.45, 1.0, rise));
      const atRest =
        rise < 1
          ? rise < 0.45 && next.from
            ? viewAt(introView(next.from), viewPlan, ease(clamp01(rise / 0.45)))
            : viewAt(viewPlan, destView, planToCarveK)
          : destView;
      const at =
        splitK > 0 && TP
          ? viewAt(atRest, pixelView(TP), ease(clamp01(splitK / 0.45)))
          : atRest;
      const carveShaderK = sstep(0.42, 0.96, rise);
      const carveK = Math.max(0.015, carveShaderK);
      const exitK = ease(clamp01(next.exit ?? 0));
      const fovK = 1 - 0.9 * exitK;
      stage.setFovScale(fovK);
      const dolly = Math.tan(rad(FOV / 2)) / Math.tan(rad((FOV * fovK) / 2));
      const az = at.azimuth + (next.turn ?? 0);
      const el = Math.max(10, Math.min(84, at.elevation + (next.pitch ?? 0)));
      const azRad = rad(az);
      const panRight = next.panX ?? 0;
      const panFwd = next.panY ?? 0;
      const target: Vec3 =
        panRight !== 0 || panFwd !== 0
          ? [
              at.target[0] + panRight * Math.cos(azRad) - panFwd * Math.sin(azRad),
              at.target[1],
              at.target[2] + panRight * Math.sin(azRad) + panFwd * Math.cos(azRad),
            ]
          : at.target;
      const view: View = {
        ...at,
        target,
        shift: [
          at.shift[0] - (next.sel === "package" ? (next.aside ?? 0) * PKG.aside * e : 0),
          at.shift[1],
        ] as [number, number],
        distance: at.distance * (next.zoom ?? 1) * dolly,
        azimuth: az,
        elevation: el,
      };
      set(view);
      current = { e, view, selClock: clockOf(next.sel) };
      return { e, v1, view, rise, splitK, exitK, carveShaderK, carveK };
    },
  };
}
