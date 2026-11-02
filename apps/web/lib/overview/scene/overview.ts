// The overview's scene (approved specimen D4, js/d4.js): the catchment relief, lit and draped, seen along the
// valley's long axis inside one upright hairline arc of a large circle, open at the bottom, whose ends fade to
// nothing. The arc draws on its own canvas over the land's depth, so the land's depth of field does not soften it.
// Opening a finding orbits the camera toward that finding's side and closes in, moves the arc away and rolls the
// finding round to face its record, and blurs the land outside a band around the focus. The case's proposed walking
// routes lie on the land as fine dashed amber lines (dashes of a fixed length on screen), draped on the drawn relief;
// hovering their entry lifts them, and selecting it moves the view toward them with the land under them kept sharp.
// The page (React) owns the words; every render hands it the screen positions it needs (design px at 1440 x 900).

import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Raycaster,
  Vector2,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  NoColorSpace,
  NoToneMapping,
  Scene,
  ShaderMaterial,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { makeFrame, makeHeightSampler, type Vec3 } from "../../instruments/valley/frame";
import { landFrame } from "../../land/geometry";
import type { LandPose } from "../../land/handoff";
import { createStage, type PerspectiveView } from "../../instruments/valley/scene/stage";
import { heightTexture } from "../../instruments/valley/scene/textures";
import {
  liftColours as LC,
  lifeColours,
  maskAt,
  overviewColours as C,
  timeColours as TC,
} from "../../theme/obsidian";
import { createLift, type LiftLayer } from "./lift";
import { cellColour, type CellPaint } from "../../instruments/pixel/paint";
import {
  ARC,
  DIAL,
  DIAL1,
  SPAN,
  STEP,
  arcAlpha,
  clamp01,
  ease,
  lerp,
  outward,
  spanAt,
  sstep,
  uOf,
  type ArcSpan,
} from "../arc";
import type { OverviewData } from "../data";
import { slopeColour } from "../footprint";
import type { FindingId } from "../findings";
import {
  bakeLight,
  channelVec,
  createOccluder,
  createRelief,
  createSurveyPlan,
  createWall,
  hexVec,
  lightDir,
  maskOnRelief,
  signedArea,
  smoothRing,
  waterTexture,
} from "./terrain";

export const OVERVIEW_DESIGN = { width: 1440, height: 900 } as const;
/** The vertical scale, and the elevation the model's y = 0 stands at (m). */
export const EXAG = 2.5;
/** Vertical field of view at the design height (degrees). */
const FOV = 26;
/**
 * The overview: D4's bearing (another land is looked at along its own long axis; see landFrame), elevation, the
 * land's height on screen, the widest it may be inside the arc, and the centre of its box (design px).
 */
const OV = { az: 52, el: 34, fh: 640, fw: 700, cx: 731, cy: 494 } as const;
/** The land's size (design px across) where the arrival from the globe begins: about the case's ring. */
const INTRO_PX = 30;
/** The least clearance (design px) of the land's rim from the arc at rest: D4's 57 and a margin for the walls. */
const ARC_CLEAR = 64;
/** D4's opened pixel: bearing, elevation, distance (km) and where its centre lands on screen. */
const ND = { az: 40, el: 33, dist: 42, x: 360, y: 600 } as const;
/**
 * A finding of the whole catchment opened (D4 defined only the pixel): the land kept whole, smaller and on the left,
 * clear of the record on the right.
 */
const WIDE = { fh: 560, cx: 300, cy: 470 } as const;
/** The next-steps package's view (UI-2): the whole land in the briefing's middle column (design px). */
const PKG = { fh: 540, cx: 720, cy: 478, aside: 190 } as const;
/**
 * The routes opened: the view of the pixel's side, a little higher, closed in until every route fits the box (design
 * px) on the left, clear of the arc and of the column on the right.
 */
const RT = { el: 40, w: 470, h: 320, cx: 370, cy: 570 } as const;
/**
 * The routes' dashes and gaps on screen (design px), their width at rest and lifted (CSS px), their opacity, and the
 * dark edge under each dash that keeps the amber legible on the lit land (extra width, opacity).
 */
const DASH = { dash: 6, gap: 4, w0: 1.5, w1: 2.2, a0: 0.85, a1: 1, edge: 1.6, edgeA: 0.5 } as const;
/** How far the routes not picked in the opened list step back (opacity factor). */
export const ROUTE_QUIET = 0.35;
/** Metres between two points where a route is draped on the drawn relief, and its height over it. */
const DRAPE = { step: 7.5, over: 4 } as const;
/** Recorded life's 3D markers (UI-2): stem height over the drawn relief (m), crown beacon size (CSS px), vertices of a ring. */
const LIFE = {
  over: 420,
  size: 10.5,
  baseSize: 5,
  ring: 72,
  footRing: 20,
  footRadiusM: 235,
} as const;
/** The pixel's clock in D4: its turn (ND.az - OV.az) is the turn for a finding at that clock. */
const PIXEL_CLOCK = 52;
const TURN = (ND.az - OV.az) / Math.sin((PIXEL_CLOCK * Math.PI) / 180);

/**
 * How far the arc, its labels and the ask step back (0 to 1) while the visitor has turned the land or brought it
 * closer: by a turn of 18 degrees, or a quarter closer, they are gone; R brings them back with the overview's pose.
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

const DEG = Math.PI / 180;
const rad = (d: number) => d * DEG;
/** How far (model km) the pixel's cells rise off the land when it is opened. */
const CELL_RISE = 0.22;
/**
 * The opened pixel's place among its cards (design px): the middle the pixel view leaves between its left column, 03
 * and 05 (U27: the pixel is the subject, its cards round it); the camera is solved so the pixel and its risen cells
 * fill it.
 */
const PIXEL_GAP = { x0: 495, y0: 200, x1: 820, y1: 830 };
const PIXEL_ELEVATION = 52;
/** A pixel this much taller than wide on screen is seen end on; the camera looks down on it instead (U25b). */
const TALL_PIXEL = 1.8;
const PIXEL_TOP = 75;

/**
 * A finding, the field check on the land, the ask's results (which move as the whole catchment's finding), or the
 * proposed walking routes.
 */
export type Selection = FindingId | "field" | "results" | "routes" | "package" | "time";

/** The side a selection's record opens on: a finding on the arc's left opens on the left, the land easing right. */
export const sideOf = (sel: Selection | null, clock: number | undefined): "left" | "right" =>
  sel !== null && sel !== "field" && sel !== "results" && sel !== "routes" && (clock ?? 0) > 180
    ? "left"
    : "right";

/** The findings about the whole catchment: their view keeps the land whole and unblurred, with no swing. */
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
  /** The visitor's own view: a factor on the camera's distance, a turn of its bearing, a pitch tilt, and a horizontal pan. */
  zoom?: number;
  turn?: number;
  pitch?: number;
  panX?: number;
  panY?: number;
  /** The finding opening or open (kept while it closes). */
  sel: Selection | null;
  /**
   * The arrival from the globe (decision 11), 0 to 1 each; absent at rest. `rise`: the camera moves on one path from
   * straight above the case's point (`from`, CSS px on the canvas, the land as small as the point's ring) to the
   * overview's pose while the land rises out of the dark; `arcDraw`: how much of the arc is drawn.
   */
  rise?: number;
  arcDraw?: number;
  from?: { x: number; y: number };
  /**
   * Handing the land to the layer stack (decision 12), 0 to 1: the camera's field of view narrows while it draws
   * back, so the picture keeps its size and becomes nearly orthographic, as the layer stack's view is.
   */
  exit?: number;
  /**
   * The pixel taken apart (decision 12), 0 to 1: the camera flies down to the pixel, its Sentinel-2 cells lie on it,
   * rise off the land one by one and stay risen, with the pixel's cards round them.
   */
  split?: number;
  /** How the risen cells are painted (U27): true colour, June NDVI or land cover class. */
  cellPaint?: CellPaint;
  /** One evidence layer lifted off the land at rest (decision 12): which, and how far (0 down to 1 up). */
  lift?: { layer: LiftId; k: number } | null;
  /**
   * The next-steps package open (UI-2): the height range (m) of each field check's band, in the package's order
   * (null bounds are the land's lowest and highest), and the one lit in the accent. Read only while `sel` is
   * "package".
   */
  ranges?: readonly { lo: number | null; hi: number | null }[];
  lit?: number | null;
  /** The package's land eased aside for its cards, 0 centred to 1 aside (UI-2). */
  aside?: number;
  /**
   * See It Over Time (UI-2): a canvas the view paints over the relief grid (overlayGrid), bound as the land's
   * footprint while `sel` is "time" (a new version is uploaded), and the month's snow by elevation band.
   */
  overlay?: { canvas: HTMLCanvasElement; version: number } | null;
  snow?: { limits: readonly [number, number]; shares: readonly [number, number, number] } | null;
  /** The arc stays out (UI-2: from the results to the package, and while it opens). */
  quiet?: boolean;
  /**
   * Recorded life (UI-2): the layer's dots shown, 0 to 1 (a global layer, off by default; drawn on the overview at
   * rest and over time only), the one recorded point in focus (index into setLife's points) and the stated
   * uncertainty (m) its ring shows, when there is one.
   */
  life?: number;
  lifeFocus?: number | null;
  lifeRing?: number | null;
}

/** The layers the overview can lift: each one the case's own (the trend cells, the CHIRPS cells, the land cover, the bands). */
export type LiftId = "trend" | "rain" | "cover" | "bands";

export interface Point {
  x: number;
  y: number;
}

export interface FindingPlace {
  dot: Point;
  /** Outward on screen. */
  ux: number;
  uy: number;
  /** Behind the land from the camera. */
  behind: boolean;
  /** 1 on the drawn arc, 0 past its drawn end. */
  onArc: number;
}

export interface OverviewLayout {
  /** Canvas CSS px = offset + design px x scale. */
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
  /**
   * The land's box on screen, and where the opened finding's card is anchored (decision 14): the catchment's edge
   * that faces the free side for a finding about the whole catchment or its rain, the band's own place for the band,
   * the pixel for the pixel and the field check.
   */
  landBox: { x0: number; y0: number; x1: number; y1: number };
  anchor: Point | null;
  /** What the opened finding's card must not cover: the whole land, the band's place, or the pixel's footprint. */
  subject: { x0: number; y0: number; x1: number; y1: number };
  /**
   * The drawn arc on screen, a point every 2 degrees from its start (where the ask rests) clockwise over its span: a
   * live question's run is drawn along it (U29, specimen R).
   */
  arcAt: Point[];
  /**
   * The catchment's left-most rim point in the land's middle band on screen: where a run's proposed check for the
   * whole catchment is anchored (U29).
   */
  rimLeft: Point | null;
  /** The pixel and its risen cells on screen while it is opened (U27), for the checks that no card covers it. */
  pixelBox: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Each package field check's band's mean place on the land, where its marker stands (UI-2); empty otherwise. */
  stands: ({ at: Point; behind: boolean } | null)[];
  /**
   * While the pixel is opened, where its cards' leaders end (U28c): its place on the land (the footprint's outline) and
   * its risen cells (the same outline lifted); null otherwise.
   */
  pixelPlace: Point[] | null;
  pixelCells: Point[] | null;
  /** See It Over Time (UI-2): a lit rim point of each elevation band, lowest first, where its label's leader ends. */
  bandEdges: (Point | null)[];
  /** Recorded life (UI-2): every recorded point on screen (x, y pairs, design px) while the layer shows; else null. */
  lifeAt: Float32Array | null;
  /** The recorded point in focus: where it stands, whether the land hides it, and its uncertainty ring on the land. */
  lifeFocus: { at: Point; behind: boolean; ring: Point[] | null } | null;
}

export interface Gaps {
  /** Smallest distance (design px) from the drawn arc to the land, and where. */
  arc: number;
  /** Distance (design px) from a design point to the land. */
  distanceAt(p: Point): number;
}

/** What lies under a point of the screen on the land, read from the case's own rasters and records (decision 14). */
export interface LandProbe {
  E: number;
  N: number;
  /** The relief's height there (m). */
  h: number;
  /** The WorldCover class there, of the two the overview draws. */
  cover: "tree" | "crop" | null;
  /** The stream order of the nearest drainage reach within reach of the point, if any. */
  order: number | null;
  /** The id of the nearest proposed route within reach of the point, if any. */
  route: string | null;
  /** Inside the field check's pixel. */
  inPixel: boolean;
}

export interface OverviewScene {
  render(state: SceneState): void;
  /** The land under a point of the land canvas (CSS px from its top left), or null where the ray meets no land. */
  probe(x: number, y: number): LandProbe | null;
  /** The relief grid an overlay is painted on (UI-2): its size in canvas px and a UTM point's place on it. */
  overlayGrid(): { width: number; height: number; px: (E: number, N: number) => [number, number] };
  /**
   * Recorded life (UI-2): the recorded points (the zone's metres) and each one's group tone, drawn as one layer of
   * same-size dots draped on the relief and hidden by the land in front of them; null takes the layer away.
   */
  setLife(points: readonly { e: number; n: number; tone: string }[] | null): void;
  /** Where the land stands on screen now and how it is seen and lit, for the view it is handed to. */
  handoff(): LandPose;
  onLayout(f: (layout: OverviewLayout) => void): void;
  /** The land's footprint and the arc's clearance, read back from the next render. */
  measureGaps(): Promise<Gaps>;
  dispose(): void;
}

interface CanvasSet {
  land: HTMLCanvasElement;
  arc: HTMLCanvasElement;
  blur: HTMLCanvasElement;
}

/** The land cover raster as a texture whose bytes are data (no colour conversion). */
function coverTexture(bmp: ImageBitmap): Texture {
  const t = new Texture(bmp);
  t.flipY = false;
  t.colorSpace = NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const v3 = (p: Vec3) => new Vector3(p[0], p[1], p[2]);
const arr = (v: Vector3): Vec3 => [v.x, v.y, v.z];

export function mountOverview(
  canvases: CanvasSet,
  data: OverviewData,
  findings: readonly { id: FindingId; clock: number }[],
  bandLimitM: number | null,
): OverviewScene {
  const design = OVERVIEW_DESIGN;
  const stage = createStage(canvases.land, C.fog, { fov: FOV, alpha: true });
  const { scene, camera } = stage;

  // ---------- the land ----------
  // the base, the camera's pivot, the walls' depth and the bearing from this land's own outline and heights; the
  // D4 values (OV.az, ND.dist, ...) are the valley's and scale to another land through `lf`
  const lf = landFrame(data.ring, data.range);
  const BASE = lf.base;
  const az0 = lf.bearing;
  const azN = az0 + (ND.az - OV.az);
  const g = data.meta.relief;
  const a = data.meta.analysis;
  const H = data.relief;
  const frame = makeFrame(data.meta.frame, { exag: EXAG, base: BASE });
  const sample = makeHeightSampler(H, g);
  const hTex = heightTexture(H, g);
  const lcTex = coverTexture(data.landcover);
  const cv = new OffscreenCanvas(data.landcover.width, data.landcover.height);
  const c2 = cv.getContext("2d", { willReadFrequently: true });
  if (!c2) throw new Error("No 2D context for the land cover raster");
  c2.drawImage(data.landcover, 0, 0);
  const lcPx = c2.getImageData(0, 0, data.landcover.width, data.landcover.height).data;
  const M30 = maskOnRelief(lcPx, a, g);
  // the key light keeps D3's relation to the overview camera: 45 degrees round from it, 32 degrees up
  const light = {
    dir: lightDir(az0 + 45, 32),
    color: hexVec(C.keyLight).multiplyScalar(1.25),
    ambient: hexVec(C.ambient).multiplyScalar(0.62),
    sky: hexVec(C.sky),
  };
  const lightMap = bakeLight(H, g, M30, light.dir, { exag: EXAG, base: BASE, soft: 14 });
  const waterTex = data.water ? waterTexture(data.water, g) : null;
  const relief = createRelief(H, g, frame, lcTex, frame.rect(a), {
    hTex,
    light,
    lightMap,
    ...(waterTex ? { water: waterTex } : {}),
    colours: {
      albedo: C.reliefAlbedo,
      line: C.contour,
      treeC: C.coverTree,
      cropC: C.coverCrop,
      limitC: C.bandLimit,
      fogC: C.fog,
      rimC: C.rim,
      waterC: C.drainage[0],
    },
    coverA: 0.82,
    rimA: 0.22,
    smooth: 0.55,
  });
  scene.add(relief.mesh);
  // the package's lit band takes the accent, the colour of a proposed thing (UI-2); snow is the time view's white
  relief.uniforms.uRangeC.value = hexVec(C.route);
  relief.uniforms.uSnowC.value = hexVec(TC.snow);
  const rim = smoothRing(data.ring, 2);
  const wall = createWall(rim, sample, frame, {
    outward: signedArea(rim) > 0 ? -1 : 1,
    albedo: C.wallAlbedo,
    light,
    depth: lf.wall,
    fadePow: 2.2,
  });
  scene.add(wall.mesh);
  const surveyPlan = createSurveyPlan(g, frame, lcTex, frame.rect(a), {
    hTex,
    light,
    albedo: C.reliefAlbedo,
    line: C.contour,
    accent: "#2563eb",
    yPlane: 0,
  });
  scene.add(surveyPlan.mesh);
  const outlineLine = stage.lines.lines([rim.map(([E, N]) => frame.v(E, N, sample(E, N) + 5))], {
    color: C.catchmentLine,
    opacity: 0.32,
    width: 1,
    closed: true,
  });
  scene.add(outlineLine);

  // ---------- the findings' footprints, painted over the relief grid (row 0 north), from the case's assets ----------
  const paint = (
    draw: (ctx: CanvasRenderingContext2D, px: (E: number, N: number) => [number, number]) => void,
  ) => {
    const k = 2;
    const cv = document.createElement("canvas");
    cv.width = g.width * k;
    cv.height = g.height * k;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    draw(ctx, (E, N) => [((E - g.E0) / g.res) * k, ((g.N0 - N) / g.res) * k]);
    const tex = new CanvasTexture(cv);
    tex.flipY = false;
    tex.colorSpace = NoColorSpace;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.needsUpdate = true;
    return tex;
  };
  const ring = (ctx: CanvasRenderingContext2D, pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };
  // every cell's continuous March to June slope on the asset's own fixed scale (never a significance class)
  const slopeData = data.footprints.slope;
  const slopeTex = slopeData
    ? paint((ctx, px) => {
        for (const c of slopeData.cells) {
          ring(
            ctx,
            c.corners.map(([E, N]) => px(E, N)),
          );
          ctx.fillStyle = slopeColour(c.slope, slopeData.domain, slopeData.neutral);
          ctx.fill();
        }
      })
    : null;
  // the CHIRPS cells over the land as tiles, shaded by the share of each inside the catchment; each tile is drawn a
  // little inside its cell, so the untinted gaps between them mark the cells' grid without a line the eye could take
  // for the drainage
  const rainData = data.footprints.rain;
  const rainTex = rainData
    ? paint((ctx, px) => {
        for (const c of rainData) {
          const pts = c.ring.slice(0, -1);
          const cx = pts.reduce((a, [E]) => a + E, 0) / pts.length;
          const cy = pts.reduce((a, [, N]) => a + N, 0) / pts.length;
          ring(
            ctx,
            c.ring.map(([E, N]) => px(cx + (E - cx) * 0.9, cy + (N - cy) * 0.9)),
          );
          ctx.globalAlpha = 0.12 + 0.5 * Math.min(1, c.inside);
          ctx.fillStyle = C.rainCell;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      })
    : null;
  const WIDTHS = [0.9, 1.2, 1.6, 2.1, 2.7];
  const OPACITY = [0.65, 0.78, 0.88, 0.95, 1.0];
  // the rivers, kept with their resting opacity so the arrival can bring them up with the land
  const riverLines: { line: { material: { opacity: number } }; rest: number }[] = [];
  for (const o of [1, 2, 3, 4, 5]) {
    const pls = data.rivers.reaches
      .filter((q) => q.order === o)
      .map((r) => r.pts.map(([E, N, h]) => frame.v(E, N, h + 4)));
    if (pls.length) {
      const line = stage.lines.lines(pls, {
        color: C.drainage[o - 1] ?? C.catchmentLine,
        width: WIDTHS[o - 1] ?? 1,
        opacity: OPACITY[o - 1] ?? 1,
      });
      riverLines.push({ line, rest: OPACITY[o - 1] ?? 1 });
      scene.add(line);
    }
  }
  // ---------- one evidence layer lifted off the land at rest (decision 12) ----------
  const LIFT_KM = 3.2 * lf.kmScale;
  const bandsTex = data.bands ? coverTexture(data.bands) : null;
  const liftLayers: Partial<Record<LiftId, LiftLayer>> = {
    ...(slopeTex
      ? { trend: { mode: "overlay" as const, tex: slopeTex, rect: frame.rect(g) } }
      : {}),
    ...(rainTex ? { rain: { mode: "overlay" as const, tex: rainTex, rect: frame.rect(g) } } : {}),
    cover: {
      mode: "cover",
      tex: lcTex,
      rect: frame.rect(a),
      colours: [hexVec(LC.tree), hexVec(LC.crop)],
    },
    ...(bandsTex
      ? {
          bands: {
            mode: "bands" as const,
            tex: bandsTex,
            rect: frame.rect(a),
            colours: [hexVec(LC.bandLow), hexVec(LC.bandMid), hexVec(LC.bandHigh)],
          },
        }
      : {}),
  };
  const lift = createLift(
    relief.mesh.geometry,
    relief.uniforms,
    lcTex,
    frame.rect(a),
    hexVec(LC.plate),
  );
  scene.add(lift.mesh);
  // the lifted layer's own edge: the catchment's rim, carried up with it
  const liftEdge = new Group();
  const liftEdgeLine = stage.lines.lines(
    [smoothRing(data.ring, 2).map(([E, N]) => frame.v(E, N, sample(E, N) + 5))],
    { color: C.catchmentLine, width: 1, opacity: 0, closed: true },
  );
  liftEdgeLine.renderOrder = 41;
  liftEdge.add(liftEdgeLine);
  scene.add(liftEdge);
  let liftHeight = 0;
  /** The lifted layer's right-most rim point on screen (design px). */
  const liftAnchor = (km: number): Point =>
    rimTop.map((p) => project([p[0], p[1] + km, p[2]])).reduce((b, q) => (q.x > b.x ? q : b));

  // ---------- the pixel taken apart into its Sentinel-2 cells (decision 12) ----------
  const pxCells = data.pixel?.cells ?? [];
  const cellKm = (data.pixel?.cellM ?? 10) / 1000;
  const cellGeo = new PlaneGeometry(cellKm * 0.86, cellKm * 0.86);
  cellGeo.rotateX(-Math.PI / 2);
  const cellMat = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const cellMesh = new InstancedMesh(cellGeo, cellMat, Math.max(1, pxCells.length));
  cellMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  cellMesh.renderOrder = 42;
  cellMesh.visible = false;
  cellMesh.frustumCulled = false;
  const cellBase = pxCells.map((c) => frame.v(c.E, c.N, sample(c.E, c.N) + 1));
  // each cell's own moment to leave the land: a fixed scatter, so every run takes the pixel apart the same way
  const cellDelay = pxCells.map((_, i) => (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1);
  // the cells painted as the pixel's view asks: true colour, June NDVI or land cover class (U27)
  let painted: CellPaint | null = null;
  const paintCells = (paint: CellPaint) => {
    if (paint === painted) return;
    painted = paint;
    const col = new Color();
    pxCells.forEach((c, i) => {
      const v = cellColour(paint, c);
      if (typeof v === "string") col.set(v);
      else col.setRGB(v[0], v[1], v[2]);
      cellMesh.setColorAt(i, col);
    });
    if (cellMesh.instanceColor) cellMesh.instanceColor.needsUpdate = true;
  };
  paintCells("rgb");
  scene.add(cellMesh);
  const cellM4 = new Matrix4();
  /** The cells at a split k: lying on the pixel, rising off the land one by one, dissolving at the end. */
  const placeCells = (k: number) => {
    const on = pxCells.length > 0 && k > 0.33;
    cellMesh.visible = on;
    if (!on) return;
    // the cells stay risen over the pixel once it is open: its cards stand round them (U27)
    cellMat.opacity = sstep(0.33, 0.45, k);
    const riseKm = CELL_RISE;
    cellBase.forEach((b, i) => {
      const r = ease(clamp01((k - 0.45 - 0.22 * (cellDelay[i] ?? 0)) / 0.3));
      cellM4.makeTranslation(b[0], b[1] + riseKm * r, b[2]);
      cellMesh.setMatrixAt(i, cellM4);
    });
    cellMesh.instanceMatrix.needsUpdate = true;
  };

  // the opened pixel's true footprint on the land (D4 nodeScene)
  const pixelPts: Vec3[] = [];
  const corners = data.pixel?.footprint ?? [];
  for (let k = 0; k < corners.length; k++) {
    const [E0, N0] = corners[k] ?? [0, 0];
    const [E1, N1] = corners[(k + 1) % corners.length] ?? [0, 0];
    for (let s = 0; s < 12; s++) {
      const t = s / 12;
      const E = E0 + (E1 - E0) * t;
      const N = N0 + (N1 - N0) * t;
      pixelPts.push(frame.v(E, N, sample(E, N) + 6));
    }
  }
  const pixelLine = pixelPts.length
    ? stage.lines.lines([pixelPts], {
        color: C.footprint,
        width: 1.5,
        opacity: 0.999,
        closed: true,
        renderOrder: 4,
      })
    : null;
  if (pixelLine) scene.add(pixelLine);

  // the drawn relief's own height at a place: the 30 m grid's triangles, split as createRelief splits them
  const meshHeight = (E: number, N: number): number => {
    const x = (E - g.E0) / g.res - 0.5;
    const y = (g.N0 - N) / g.res - 0.5;
    const i = Math.max(0, Math.min(g.width - 2, Math.floor(x)));
    const j = Math.max(0, Math.min(g.height - 2, Math.floor(y)));
    const fx = Math.max(0, Math.min(1, x - i));
    const fy = Math.max(0, Math.min(1, y - j));
    const at = (n: number) => H[n] ?? 0;
    const ha = at(j * g.width + i);
    const hb = at(j * g.width + i + 1);
    const hc = at((j + 1) * g.width + i);
    const hd = at((j + 1) * g.width + i + 1);
    if (Math.abs(ha - hd) < Math.abs(hb - hc))
      return fy >= fx ? ha + fx * (hd - hc) + fy * (hc - ha) : ha + fx * (hb - ha) + fy * (hd - hb);
    return fx + fy <= 1
      ? ha + fx * (hb - ha) + fy * (hc - ha)
      : hd + (1 - fx) * (hc - hd) + (1 - fy) * (hb - hd);
  };
  // the proposed walking routes, draped on the drawn relief: each record vertex and points every 7.5 m between them
  // set on the relief's own surface, so no stretch of a line runs above a ridge or under the land
  const routePts: Vec3[][] = data.routes.map((r) => {
    const out: Vec3[] = [];
    r.pts.forEach(([E1, N1], i) => {
      const prev = r.pts[i - 1];
      const [E0, N0] = prev ?? [E1, N1];
      const n = prev ? Math.max(1, Math.ceil(Math.hypot(E1 - E0, N1 - N0) / DRAPE.step)) : 1;
      for (let k = prev ? 1 : 0; k <= n; k++) {
        const E = E0 + ((E1 - E0) * k) / n;
        const N = N0 + ((N1 - N0) * k) / n;
        out.push(frame.v(E, N, meshHeight(E, N) + DRAPE.over));
      }
    });
    return out;
  });
  const dashMat = (color: string, width: number, opacity: number) =>
    new LineMaterial({
      color: new Color(color),
      linewidth: width,
      worldUnits: false,
      dashed: true,
      dashSize: DASH.dash,
      gapSize: DASH.gap,
      dashScale: 1,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: false,
    });
  // one line per route (its amber dashes over a dark edge), so a route picked in the list can be lifted alone
  const routeDraw = routePts.flatMap((pl, k) => {
    const id = data.routes[k]?.id;
    const seg: number[] = [];
    for (let i = 0; i + 1 < pl.length; i++) {
      const p = pl[i];
      const q = pl[i + 1];
      if (p && q) seg.push(...p, ...q);
    }
    if (!id || !seg.length) return [];
    const geo = new LineSegmentsGeometry();
    geo.setPositions(seg);
    const mat = dashMat(C.route, DASH.w0, DASH.a0);
    const edgeMat = dashMat(C.fog, DASH.w0 + DASH.edge, DASH.edgeA);
    const edge = new LineSegments2(geo, edgeMat);
    edge.computeLineDistances();
    edge.frustumCulled = false;
    edge.renderOrder = 5;
    const line = new LineSegments2(geo, mat);
    line.frustumCulled = false;
    line.renderOrder = 6;
    scene.add(edge, line);
    return [{ id, geo, mat, edgeMat }];
  });
  // each route's end, its candidate site, a little over the land; the routes' middle, the place the view turns to
  const routeEnds = data.routes.map((r) => {
    const [E, N] = r.pts[r.pts.length - 1] ?? [0, 0];
    return { id: r.id, p: frame.v(E, N, sample(E, N) + 10) };
  });
  const [E0s, N0s] = data.routes[0]?.pts[0] ?? [0, 0];
  const routeStart: Vec3 | null = data.routes.length
    ? frame.v(E0s, N0s, sample(E0s, N0s) + 10)
    : null;
  const routeAll = data.routes.flatMap((r) => r.pts);
  const RC: Vec3 | null = routeAll.length
    ? (() => {
        const Es = routeAll.map((q) => q[0]);
        const Ns = routeAll.map((q) => q[1]);
        const E = (Math.min(...Es) + Math.max(...Es)) / 2;
        const N = (Math.min(...Ns) + Math.max(...Ns)) / 2;
        return frame.v(E, N, sample(E, N));
      })()
    : null;
  // a few points of every route, enough to box them on screen
  const routeProbe = routePts.flatMap((pl) =>
    pl.filter((_, i) => i % 6 === 0 || i === pl.length - 1),
  );
  // recorded life (UI-2): 3D diegetic bio-markers anchored to the DEM relief — terrain-conforming ground ring,
  // vertical luminous stem rising from the true ground point, 3D sculptural diamond crystal, and crisp crown reticle
  const lifeDisc = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    if (x) {
      x.fillStyle = lifeColours.halo;
      x.beginPath();
      x.arc(32, 32, 24, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = lifeColours.core;
      x.lineWidth = 3.5;
      x.beginPath();
      x.arc(32, 32, 22, 0, Math.PI * 2);
      x.stroke();
      // the core is white so each marker takes its taxonomic group's tone from the vertex colour
      x.fillStyle = lifeColours.core;
      x.beginPath();
      x.arc(32, 32, 11, 0, Math.PI * 2);
      x.fill();
    }
    const t = new CanvasTexture(c);
    t.colorSpace = LinearSRGBColorSpace;
    return t;
  })();
  let life: {
    pts: Vec3[];
    ne: [number, number][];
    obj: Group;
    geos: (BufferGeometry | LineSegmentsGeometry)[];
    mats: { mat: PointsMaterial | LineMaterial | MeshBasicMaterial; baseOpacity: number }[];
    lineMats: LineMaterial[];
  } | null = null;
  const setLife: OverviewScene["setLife"] = (points) => {
    if (life) {
      scene.remove(life.obj);
      for (const g2 of life.geos) g2.dispose();
      for (const m2 of life.mats) m2.mat.dispose();
      life = null;
    }
    if (!points?.length) return;
    const { width: sw, height: sh } = stage.size();
    const stemRiseM = LIFE.over * lf.kmScale;
    const footRadius = LIFE.footRadiusM * lf.kmScale;
    const pts = points.map((p) => frame.v(p.e, p.n, meshHeight(p.e, p.n) + stemRiseM));
    const bases = points.map((p) => frame.v(p.e, p.n, meshHeight(p.e, p.n) + 6));
    const flatColors = points.flatMap((p) => {
      const c = new Color(p.tone);
      return [c.r, c.g, c.b];
    });

    // 1. Crown reticle beacons at the top of each 3D stem
    const beaconGeo = new BufferGeometry();
    beaconGeo.setAttribute("position", new Float32BufferAttribute(pts.flat(), 3));
    beaconGeo.setAttribute("color", new Float32BufferAttribute(flatColors, 3));
    const beaconMat = new PointsMaterial({
      size: LIFE.size,
      sizeAttenuation: false,
      vertexColors: true,
      map: lifeDisc,
      alphaTest: 0.15,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    const beaconObj = new Points(beaconGeo, beaconMat);
    beaconObj.frustumCulled = false;
    beaconObj.renderOrder = 9;

    // 2. Ground contact nodes anchoring the foot of each stem on the terrain surface
    const baseGeo = new BufferGeometry();
    baseGeo.setAttribute("position", new Float32BufferAttribute(bases.flat(), 3));
    baseGeo.setAttribute("color", new Float32BufferAttribute(flatColors, 3));
    const baseMat = new PointsMaterial({
      size: LIFE.baseSize,
      sizeAttenuation: false,
      vertexColors: true,
      map: lifeDisc,
      alphaTest: 0.15,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    const baseObj = new Points(baseGeo, baseMat);
    baseObj.frustumCulled = false;
    baseObj.renderOrder = 6;

    // 3. 3D vertical bio-stems rising from the terrain surface to each crown (LineSegments2 for Retina line width)
    const stemPos: number[] = [];
    const stemCol: number[] = [];
    points.forEach((p, idx) => {
      const b = bases[idx];
      const t = pts[idx];
      if (!b || !t) return;
      const c = new Color(p.tone);
      stemPos.push(b[0], b[1], b[2], t[0], t[1], t[2]);
      stemCol.push(c.r * 0.72, c.g * 0.72, c.b * 0.72, c.r, c.g, c.b);
    });
    const stemGeo = new LineSegmentsGeometry();
    stemGeo.setPositions(stemPos);
    stemGeo.setColors(stemCol);
    const stemMat = new LineMaterial({
      color: 0xffffff,
      linewidth: 1.75,
      vertexColors: true,
      worldUnits: false,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    stemMat.resolution.set(sw, sh);
    const stemObj = new LineSegments2(stemGeo, stemMat);
    stemObj.frustumCulled = false;
    stemObj.renderOrder = 7;

    // 4. 3D terrain-draped ground rings around each occurrence's true ground coordinate
    const ringPos: number[] = [];
    const ringCol: number[] = [];
    points.forEach((p) => {
      const c = new Color(p.tone);
      for (let i = 0; i < LIFE.footRing; i++) {
        const a0 = (i / LIFE.footRing) * Math.PI * 2;
        const a1 = ((i + 1) / LIFE.footRing) * Math.PI * 2;
        const e0 = p.e + footRadius * Math.cos(a0);
        const n0 = p.n + footRadius * Math.sin(a0);
        const e1 = p.e + footRadius * Math.cos(a1);
        const n1 = p.n + footRadius * Math.sin(a1);
        const v0 = frame.v(e0, n0, meshHeight(e0, n0) + 6);
        const v1 = frame.v(e1, n1, meshHeight(e1, n1) + 6);
        ringPos.push(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2]);
        ringCol.push(c.r * 0.88, c.g * 0.88, c.b * 0.88, c.r * 0.88, c.g * 0.88, c.b * 0.88);
      }
    });
    const ringGeo = new LineSegmentsGeometry();
    ringGeo.setPositions(ringPos);
    ringGeo.setColors(ringCol);
    const ringMat = new LineMaterial({
      color: 0xffffff,
      linewidth: 1.25,
      vertexColors: true,
      worldUnits: false,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    ringMat.resolution.set(sw, sh);
    const ringObj = new LineSegments2(ringGeo, ringMat);
    ringObj.frustumCulled = false;
    ringObj.renderOrder = 6;

    // 5. 3D sculptural diamond crystals at each crown in world space
    const prismPos: number[] = [];
    const prismCol: number[] = [];
    const rx = 0.095 * lf.kmScale;
    const ry = 0.145 * lf.kmScale;
    points.forEach((p, idx) => {
      const at = pts[idx];
      if (!at) return;
      const [cx, cy, cz] = at;
      const c = new Color(p.tone);
      const top: Vec3 = [cx, cy + ry, cz];
      const bot: Vec3 = [cx, cy - ry, cz];
      const eq: Vec3[] = [
        [cx + rx, cy, cz],
        [cx, cy, cz + rx],
        [cx - rx, cy, cz],
        [cx, cy, cz - rx],
      ];
      for (let i = 0; i < 4; i++) {
        const pA = eq[i];
        const pB = eq[(i + 1) % 4];
        if (!pA || !pB) continue;
        const shadeTop = i % 2 === 0 ? 1.0 : 0.84;
        const shadeBot = i % 2 === 0 ? 0.68 : 0.56;
        prismPos.push(top[0], top[1], top[2], pA[0], pA[1], pA[2], pB[0], pB[1], pB[2]);
        for (let k = 0; k < 3; k++) {
          prismCol.push(
            Math.min(1, c.r * shadeTop),
            Math.min(1, c.g * shadeTop),
            Math.min(1, c.b * shadeTop),
          );
        }
        prismPos.push(bot[0], bot[1], bot[2], pB[0], pB[1], pB[2], pA[0], pA[1], pA[2]);
        for (let k = 0; k < 3; k++) {
          prismCol.push(c.r * shadeBot, c.g * shadeBot, c.b * shadeBot);
        }
      }
    });
    const prismGeo = new BufferGeometry();
    prismGeo.setAttribute("position", new Float32BufferAttribute(prismPos, 3));
    prismGeo.setAttribute("color", new Float32BufferAttribute(prismCol, 3));
    const prismMat = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    const prismObj = new Mesh(prismGeo, prismMat);
    prismObj.frustumCulled = false;
    prismObj.renderOrder = 8;

    const obj = new Group();
    obj.add(ringObj, baseObj, stemObj, prismObj, beaconObj);
    obj.visible = false;
    scene.add(obj);
    life = {
      pts,
      ne: points.map((p) => [p.e, p.n]),
      obj,
      geos: [beaconGeo, baseGeo, stemGeo, ringGeo, prismGeo],
      mats: [
        { mat: beaconMat, baseOpacity: 1 },
        { mat: baseMat, baseOpacity: 0.85 },
        { mat: stemMat, baseOpacity: 0.92 },
        { mat: ringMat, baseOpacity: 0.72 },
        { mat: prismMat, baseOpacity: 0.92 },
      ],
      lineMats: [stemMat, ringMat],
    };
  };
  /** The focused point's stated uncertainty as a ring on the drawn relief (UI-2). */
  const lifeRingOf = (k: number, r: number): Point[] | null => {
    const at = life?.ne[k];
    if (!at) return null;
    return Array.from({ length: LIFE.ring + 1 }, (_, i) => {
      const a = (i / LIFE.ring) * Math.PI * 2;
      const E = at[0] + r * Math.cos(a);
      const N = at[1] + r * Math.sin(a);
      return project(frame.v(E, N, meshHeight(E, N) + 12));
    });
  };

  // ---------- design px and the screen ----------
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
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const bbox = (pts: Point[]): Box =>
    pts.reduce(
      (b, p) => ({
        x0: Math.min(b.x0, p.x),
        y0: Math.min(b.y0, p.y),
        x1: Math.max(b.x1, p.x),
        y1: Math.max(b.y1, p.y),
      }),
      { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 },
    );

  // ---------- cameras ----------
  type View = Omit<PerspectiveView, "design"> & { shift: [number, number] };
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
  /**
   * A view of the whole land: its height on screen fitted to `fh` (and its width kept within OV.fw, for a land
   * longer than it is tall), its box centred at (cx, cy).
   */
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
  /**
   * How close the land's rim comes to the arc at rest (design px) in a view: the least clearance inside the dial of
   * any rim point whose clock angle lies on the drawn arc (negative when it crosses the arc).
   */
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
  // the overview looks along the land's long axis, so it stands compact and upright, as large as D4 drew the
  // valley but never nearer the arc than the specimen's clearance (57 px, with a margin for the drawn walls)
  let fh = OV.fh;
  let view0 = fitLand(az0, OV.el, fh, OV.cx, OV.cy);
  for (let it = 0; it < 8; it++) {
    const c = arcClearance(view0);
    if (c >= ARC_CLEAR) break;
    fh *= (DIAL.r - ARC_CLEAR) / Math.max(DIAL.r - c, DIAL.r - ARC_CLEAR + 1);
    view0 = fitLand(az0, OV.el, fh, OV.cx, OV.cy);
  }
  // Stage 1 2D Topographic Survey Plan view: looking nearly straight down (82 deg) at the regional 2D survey map
  // before the camera pitches to 34 deg and extrudes the 3D carved terrain block out of the 2D plan.
  const viewPlan = fitLand(az0, 82, fh * 0.96, OV.cx, OV.cy);
  /**
   * Where the arrival begins: straight above the land (north up, as the globe looked down on it), the land as small
   * as the case's ring on the globe (INTRO_PX across) and centred on its point, given in CSS px on the canvas.
   */
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
  /** A view closed in on one place on the land, put at (ND.x, ND.y). */
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
  const pixelCentre = data.pixel?.centre;
  const TP: Vec3 | null = pixelCentre
    ? frame.v(pixelCentre[0], pixelCentre[1], sample(pixelCentre[0], pixelCentre[1]))
    : null;
  // the camera on the opened pixel, solved once: distance and lens shift that put the pixel and its risen cells in
  // PIXEL_GAP, looking down between the land and the cells
  let pixelSolved: View | null = null;
  const pixelView = (tp: Vec3): View => {
    if (pixelSolved) return pixelSolved;
    const pts = pixelPts.flatMap((p): Vec3[] => [p, [p[0], p[1] + CELL_RISE, p[2]]]);
    const gw = PIXEL_GAP.x1 - PIXEL_GAP.x0;
    const gh = PIXEL_GAP.y1 - PIXEL_GAP.y0;
    // the view from one bearing: the distance and lens shift that fit the pixel and its cells in PIXEL_GAP
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
    // from the overview's own bearing; a pixel seen end on down a slope (much taller than wide on screen, U25b) is
    // looked down on instead, so its footprint reads in plan (the lead's U25b judgment)
    let best = solve(PIXEL_ELEVATION);
    if (best.tall > TALL_PIXEL) best = solve(PIXEL_TOP);
    pixelSolved = best.v;
    return best.v;
  };

  // the band below the lower limit: the mean place of the catchment's relief cells under it
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
  // the package's bands (UI-2): the mean place of the relief cells between two heights, solved once per range
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
  // See It Over Time (UI-2): the view's overlay canvas as a texture, and each band's rim points for its label
  let overlayTex: { canvas: HTMLCanvasElement; tex: CanvasTexture; version: number } | null = null;
  const overlayOf = (o: NonNullable<SceneState["overlay"]>): CanvasTexture => {
    if (overlayTex?.canvas !== o.canvas) {
      overlayTex?.tex.dispose();
      const tex = new CanvasTexture(o.canvas);
      tex.flipY = false;
      tex.colorSpace = NoColorSpace;
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      overlayTex = { canvas: o.canvas, tex, version: -1 };
    }
    if (overlayTex.version !== o.version) {
      overlayTex.tex.needsUpdate = true;
      overlayTex.version = o.version;
    }
    return overlayTex.tex;
  };
  const rimByHeight = rim
    .filter((_, i) => i % 3 === 0)
    .map(([E, N]) => ({ h: sample(E, N), p: frame.v(E, N, sample(E, N)) }));
  /** The right-most visible rim point of each band on screen, so a label's leader never crosses the land. */
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
  /** Where each package field check's marker stands on screen (UI-2): its band's mean place on the land. */
  const standsOf = (st: SceneState): OverviewLayout["stands"] =>
    st.sel !== "package"
      ? []
      : (st.ranges ?? []).map((r) => {
          const p = rangePlace(r.lo, r.hi);
          return p ? { at: project(p), behind: occluded(p) } : null;
        });
  const clockOf = (sel: Selection | null) =>
    findings.find(
      (f) => f.id === (sel === "field" ? "pixel" : sel === "results" ? "catchment" : sel),
    )?.clock ?? PIXEL_CLOCK;
  /** The routes opened: the pixel's bearing, closed in until every route fits RT's box. */
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
  /**
   * Each finding's view, derived as D4 derived the pixel's: the camera orbits toward the finding's clock direction
   * (the pixel's turn scaled by the sine of the clock) and closes in on its place on the land; a finding of the whole
   * catchment keeps the land whole.
   */
  const viewFor = (sel: Selection): View => {
    const known = views.get(sel);
    if (known) return known;
    const az = az0 + TURN * Math.sin(rad(clockOf(sel)));
    const place = sel === "pixel" || sel === "field" ? TP : sel === "band" ? TB : null;
    // a whole-catchment finding keeps the overview's bearing (no swing); the land eases away from its record's side
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
  // every view is solved now, so no later render moves the camera to measure one
  for (const f of findings) viewFor(f.id);
  viewFor("field");
  viewFor("results");
  viewFor("package");
  viewFor("time");
  if (RC) viewFor("routes");
  set(view0);
  const viewAt = (v0: View, v1: View, e: number): View => {
    // azimuth the short way round, distance in log space, target and lens shift linear
    const dAz = ((v1.azimuth - v0.azimuth + 540) % 360) - 180;
    return {
      target: arr(v3(v0.target).lerp(v3(v1.target), e)),
      azimuth: v0.azimuth + dAz * e,
      elevation: lerp(v0.elevation, v1.elevation, e),
      distance: Math.exp(lerp(Math.log(v0.distance), Math.log(v1.distance), e)),
      shift: [lerp(v0.shift[0], v1.shift[0], e), lerp(v0.shift[1], v1.shift[1], e)],
    };
  };

  // ---------- the arc ----------
  const fwd = new Vector3();
  const dashR = new Vector3();
  const camR = new Vector3();
  const camU = new Vector3();
  let DC = new Vector3();
  let DR = new Vector3();
  let DU = new Vector3();
  let DRW = 1;
  let ROLL = 0;
  const fpx = design.height / 2 / Math.tan(rad(FOV / 2));
  const placeDial = (e: number, targetDist: number, selClock: number, left: boolean) => {
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
    // the opened finding rolls round to face its record: to 3 o'clock for a record on the right, 9 for the left
    ROLL = ((left ? 270 : 90) - selClock) * e;
  };
  const dialAt = (clock: number): Vec3 =>
    arr(
      DC.clone()
        .addScaledVector(DR, Math.sin(rad(clock + ROLL)) * DRW)
        .addScaledVector(DU, Math.cos(rad(clock + ROLL)) * DRW),
    );

  const r2 = new WebGLRenderer({
    canvas: canvases.arc,
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
  });
  r2.outputColorSpace = LinearSRGBColorSpace;
  r2.toneMapping = NoToneMapping;
  r2.setPixelRatio(window.devicePixelRatio);
  r2.setClearColor(0x000000, 0);
  const scene2 = new Scene();
  scene2.add(createOccluder(relief));
  // vertex colour channels carry (opacity along the arc, tint, 0); the tint mixes the arc's two colours, a little
  // brighter toward the upper left, where the key light comes from
  const dialMat = new LineMaterial({
    color: 0xffffff,
    linewidth: 1.1,
    vertexColors: true,
    worldUnits: false,
    depthTest: true,
    depthWrite: false,
    transparent: true,
    opacity: 1,
  });
  const FRAG_OUT = "gl_FragColor = vec4( diffuseColor.rgb, alpha );";
  dialMat.onBeforeCompile = (sh) => {
    if (!sh.fragmentShader.includes(FRAG_OUT))
      console.error("Overview arc: the line shader's output is not where the fade expects it");
    sh.uniforms.uArcDim = { value: channelVec(C.arcDim) };
    sh.uniforms.uArcLit = { value: channelVec(C.arcLit) };
    sh.fragmentShader = `uniform vec3 uArcDim;\nuniform vec3 uArcLit;\n${sh.fragmentShader.replace(
      FRAG_OUT,
      "gl_FragColor = vec4( mix( uArcDim, uArcLit, vColor.g ), alpha * vColor.r );",
    )}`;
  };
  let dialLine: LineSegments2 | null = null;
  let arcPts: Vec3[] = [];
  let arcA: number[] = [];
  const buildDial = (span: ArcSpan) => {
    const n = Math.max(2, Math.ceil(span.end / STEP));
    arcPts = [];
    arcA = [];
    for (let i = 0; i <= n; i++) {
      const u = (span.end * i) / n;
      arcPts.push(dialAt(ARC.a0 + u));
      arcA.push(arcAlpha(u, span));
    }
    const pos: number[] = [];
    const col: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = arcPts[i] ?? [0, 0, 0];
      const q = arcPts[i + 1] ?? [0, 0, 0];
      pos.push(...p, ...q);
      for (const k of [i, i + 1])
        col.push(
          arcA[k] ?? 0,
          0.5 + 0.5 * Math.cos(rad(ARC.a0 + (span.end * k) / n + ROLL - 330)),
          0,
        );
    }
    if (dialLine) {
      scene2.remove(dialLine);
      dialLine.geometry.dispose();
    }
    const geo = new LineSegmentsGeometry();
    geo.setPositions(pos);
    geo.setColors(col);
    dialLine = new LineSegments2(geo, dialMat);
    dialLine.frustumCulled = false;
    dialLine.renderOrder = 3;
    scene2.add(dialLine);
  };

  // is a world point hidden by the relief from the current camera? (more than 20 m under the land on the sight line)
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
      // the land is a slab: the surface and its 900 m edge hide what is behind; a line wholly under it does not
      const ty = frame.y(sample(E, N));
      if (y < ty - (20 * EXAG) / 1000 && y > ty - (lf.wall * EXAG) / 1000) return true;
    }
    return false;
  };

  // ---------- depth of field: a blurred copy outside a sharp band around the focus ----------
  const bctx = canvases.blur.getContext("2d");
  const depthOfField = (e: number, top: number, bottom: number) => {
    const glc = canvases.land;
    if (e <= 0.001 || !bctx) {
      canvases.blur.style.opacity = "0";
      glc.style.maskImage = "none";
      return;
    }
    const ramp = 150;
    const H2 = stage.size().height;
    const pc = (y: number) => `${((Math.max(0, Math.min(H2, y)) / H2) * 100).toFixed(2)}%`;
    bctx.clearRect(0, 0, canvases.blur.width, canvases.blur.height);
    bctx.filter = `blur(${(6 * e * fit.scale * window.devicePixelRatio).toFixed(2)}px)`;
    bctx.drawImage(glc, 0, 0);
    const k = maskAt(1);
    const none = maskAt(0);
    const rest = maskAt(1 - e);
    const y0 = pc(top - ramp);
    const y1 = pc(top);
    const y2 = pc(bottom);
    const y3 = pc(bottom + ramp);
    canvases.blur.style.maskImage = `linear-gradient(to bottom, ${k} 0%, ${k} ${y0}, ${none} ${y1}, ${none} ${y2}, ${k} ${y3}, ${k} 100%)`;
    canvases.blur.style.opacity = "1";
    glc.style.maskImage = `linear-gradient(to bottom, ${rest} 0%, ${rest} ${y0}, ${k} ${y1}, ${k} ${y2}, ${rest} ${y3}, ${rest} 100%)`;
  };

  // ---------- one function sets every state ----------
  let state: SceneState = { s: 0, h: 0, k: 0, o: 0, r: 0, sel: null };
  let current = { e: 0, view: view0, selClock: PIXEL_CLOCK };
  const listeners: ((l: OverviewLayout) => void)[] = [];
  let gapWaiters: ((g: Gaps) => void)[] = [];
  let drawn = { w: 0, h: 0, bw: 0, bh: 0 };

  const sync = () => {
    const { width, height } = stage.size();
    if (drawn.w !== width || drawn.h !== height) {
      r2.setSize(width, height, false);
      dialMat.resolution.set(width, height);
      for (const d of routeDraw) {
        d.mat.resolution.set(width, height);
        d.edgeMat.resolution.set(width, height);
      }
      if (life) {
        for (const lm of life.lineMats) lm.resolution.set(width, height);
      }
    }
    const glc = canvases.land;
    if (drawn.bw !== glc.width || drawn.bh !== glc.height) {
      canvases.blur.width = glc.width;
      canvases.blur.height = glc.height;
    }
    drawn = { w: width, h: height, bw: glc.width, bh: glc.height };
  };

  /** What a finding's card must not cover (design px): its footprint for the pixel and the band, else the land. */
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
  /** Where a finding's card is anchored on screen (design px), for the finding opened. */
  const anchorOf = (sel: Selection | null, lb: { x0: number; x1: number }): Point | null => {
    if (!sel || sel === "results" || sel === "routes") return null;
    if ((sel === "pixel" || sel === "field") && TP) return project(TP);
    if (sel === "band" && TB) return project(TB);
    // the catchment's edge on the side of the screen that has room: the rim point furthest that way
    const toward = (lb.x0 + lb.x1) / 2 > design.width / 2 ? -1 : 1;
    const pts = rimTop.map(project);
    return pts.reduce((b, q) => (q.x * toward > b.x * toward ? q : b));
  };

  /** Recorded life's dots shown (UI-2): on the overview at rest and over time, faded out under any other record. */
  const lifeShown = (st: SceneState): number => {
    const on = st.life ?? 0;
    if (!on) return 0;
    const open = st.sel !== null && st.sel !== "time";
    return on * (open ? 1 - ease(st.s) : 1) * (1 - (st.split ?? 0)) * (st.rise ?? 1);
  };
  const lifeScreen = (pts: readonly Vec3[]): Float32Array => {
    const out = new Float32Array(pts.length * 2);
    pts.forEach((p, i) => {
      const q = project(p);
      out[i * 2] = q.x;
      out[i * 2 + 1] = q.y;
    });
    return out;
  };
  // every render of the land (the page's, or the stage's own on a resize) draws the arc and hands out the layout
  stage.onRender(() => {
    updateFit();
    sync();
    const { e, view, selClock } = current;
    placeDial(e, view.distance, selClock, sideOf(state.sel, selClock) === "left");
    const drawnSpan = spanAt(state.s, state.k, state.o, selClock);
    const span = { ...drawnSpan, end: drawnSpan.end * (state.arcDraw ?? 1) };
    buildDial(span);
    r2.render(scene2, camera);
    const target = state.sel ? viewFor(state.sel).target : view0.target;
    const focus = fit.oy + project(target).y * fit.scale;
    // the sharp band: around the focus, or, for the routes, over all of them so no land under a route is blurred
    if (state.sel === "routes" && routeProbe.length) {
      const b = bbox(routeProbe.map(project));
      depthOfField(e, fit.oy + (b.y0 - 28) * fit.scale, fit.oy + (b.y1 + 28) * fit.scale);
    } else if (state.sel === "pixel" || state.sel === "field")
      depthOfField(e, focus - 70, focus + 56);
    // the whole catchment and the band are what those findings are about: nothing of them is blurred
    else depthOfField(0, 0, 0);
    if (gapWaiters.length) {
      const gaps = landGaps();
      for (const w of gapWaiters) w(gaps);
      gapWaiters = [];
    }
    const placed: OverviewLayout["findings"] = {};
    for (const f of findings) {
      const p = dialAt(f.clock);
      placed[f.id] = {
        dot: project(p),
        ...outward(f.clock, ROLL),
        behind: occluded(p),
        onArc: sstep(-2, 6, span.end - uOf(f.clock)),
      };
    }
    const lb = landBox();
    const layout: OverviewLayout = {
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
      liftAt: liftHeight > 0.01 ? liftAnchor(liftHeight) : null,
      landBox: lb,
      anchor: anchorOf(state.sel, lb),
      subject: subjectOf(state.sel, lb),
      arcAt: Array.from({ length: Math.floor(SPAN / 2) + 1 }, (_, i) =>
        project(dialAt(ARC.a0 + i * 2)),
      ),
      rimLeft: (() => {
        // the left-most rim point in the land's middle band, so a card there stands beside the land, not its tip
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
      lifeAt: lifeShown(state) > 0.01 && life ? lifeScreen(life.pts) : null,
      lifeFocus:
        lifeShown(state) > 0.01 && life && state.lifeFocus != null && life.pts[state.lifeFocus]
          ? (() => {
              const k = state.lifeFocus;
              const p = life.pts[k] as Vec3;
              return {
                at: project(p),
                behind: occluded(p),
                ring: state.lifeRing ? lifeRingOf(k, state.lifeRing) : null,
              };
            })()
          : null,
    };
    for (const l of listeners) l(layout);
  });

  // the land's footprint on screen, read back from the rendered relief (alpha above 2%), and a chamfer distance
  // (design px) from every pixel to it
  function landGaps(): Gaps {
    const { width: W, height: H2 } = stage.size();
    const INF = 1e9;
    const cnv = new OffscreenCanvas(W, H2);
    const x2 = cnv.getContext("2d", { willReadFrequently: true });
    const d = new Float32Array(W * H2);
    if (x2) {
      x2.drawImage(canvases.land, 0, 0, W, H2);
      const px = x2.getImageData(0, 0, W, H2).data;
      for (let i = 0; i < W * H2; i++) d[i] = (px[i * 4 + 3] ?? 0) > 5 ? 0 : INF;
    }
    const S2 = Math.SQRT2;
    const at0 = (i: number) => d[i] ?? INF;
    for (let y = 0; y < H2; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let v = at0(i);
        if (v === 0) continue;
        if (x > 0) v = Math.min(v, at0(i - 1) + 1);
        if (y > 0) {
          v = Math.min(v, at0(i - W) + 1);
          if (x > 0) v = Math.min(v, at0(i - W - 1) + S2);
          if (x < W - 1) v = Math.min(v, at0(i - W + 1) + S2);
        }
        d[i] = v;
      }
    for (let y = H2 - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        let v = at0(i);
        if (v === 0) continue;
        if (x < W - 1) v = Math.min(v, at0(i + 1) + 1);
        if (y < H2 - 1) {
          v = Math.min(v, at0(i + W) + 1);
          if (x < W - 1) v = Math.min(v, at0(i + W + 1) + S2);
          if (x > 0) v = Math.min(v, at0(i + W - 1) + S2);
        }
        d[i] = v;
      }
    const distanceAt = (p: Point) => {
      const xi = Math.round(fit.ox + p.x * fit.scale);
      const yi = Math.round(fit.oy + p.y * fit.scale);
      return xi < 0 || yi < 0 || xi >= W || yi >= H2 ? INF : at0(yi * W + xi) / fit.scale;
    };
    let arc = INF;
    arcPts.forEach((p, i) => {
      if ((arcA[i] ?? 0) <= 0.01) return;
      const q = project(p);
      if (q.x < -4 || q.x > design.width + 4 || q.y < -4 || q.y > design.height + 4) return;
      arc = Math.min(arc, distanceAt(q));
    });
    return { arc, distanceAt };
  }

  // ---------- what lies under the cursor (decision 14): a ray marched against the relief, then the records there ----------
  const ray = new Raycaster();
  const ndc = new Vector2();
  const insideAt = (E: number, N: number) => {
    const i = Math.floor((E - g.E0) / g.res);
    const j = Math.floor((g.N0 - N) / g.res);
    return i >= 0 && j >= 0 && i < g.width && j < g.height && M30[j * g.width + i] === 1;
  };
  const segDist = (E: number, N: number, a0: readonly number[], a1: readonly number[]) => {
    const [x0 = 0, y0 = 0] = a0;
    const [x1 = 0, y1 = 0] = a1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = dx * dx + dy * dy;
    const t = L > 0 ? clamp01(((E - x0) * dx + (N - y0) * dy) / L) : 0;
    return Math.hypot(E - (x0 + dx * t), N - (y0 + dy * t));
  };
  const nearest = <T>(
    lines: readonly { pts: readonly (readonly number[])[]; v: T }[],
    E: number,
    N: number,
    within: number,
  ) => {
    let best: T | null = null;
    let bd = within;
    for (const l of lines)
      for (let k = 1; k < l.pts.length; k++) {
        const p0 = l.pts[k - 1];
        const p1 = l.pts[k];
        if (!p0 || !p1) continue;
        const d = segDist(E, N, p0, p1);
        if (d < bd) {
          bd = d;
          best = l.v;
        }
      }
    return best;
  };
  const reachLines = data.rivers.reaches.map((r) => ({ pts: r.pts, v: r.order }));
  const routeLines = data.routes.map((r) => ({ pts: r.pts, v: r.id }));
  const inPoly = (E: number, N: number, poly: readonly (readonly [number, number])[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i] ?? [0, 0];
      const [xj, yj] = poly[j] ?? [0, 0];
      if (yi > N !== yj > N && E < ((xj - xi) * (N - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const probe = (x: number, y: number): LandProbe | null => {
    const el = canvases.land;
    const w = el.clientWidth;
    const hgt = el.clientHeight;
    if (w <= 0 || hgt <= 0) return null;
    ndc.set((x / w) * 2 - 1, -(y / hgt) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    const sy = Math.max(0.01, scene.scale.y);
    // the land's surface height (world y) under a world point, or null outside the catchment
    const ground = (wx: number, wz: number) => {
      const E = frame.E(wx);
      const N = frame.N(wz);
      return insideAt(E, N) ? frame.y(sample(E, N)) * sy : null;
    };
    const far = camera.position.length() * 3 + 50;
    const step = Math.max(0.004, (g.res / 1000) * 0.6);
    let prev = 0;
    for (let t = step; t < far; t += step) {
      const wx = o.x + d.x * t;
      const wy = o.y + d.y * t;
      const wz = o.z + d.z * t;
      if (d.y >= 0 && wy > frame.y(lf.ceiling) * sy) break;
      const gy = ground(wx, wz);
      if (gy !== null && wy <= gy) {
        // halve back to the surface
        let lo = prev;
        let hi = t;
        for (let k = 0; k < 14; k++) {
          const m = (lo + hi) / 2;
          const gm = ground(o.x + d.x * m, o.z + d.z * m);
          if (gm !== null && o.y + d.y * m <= gm) hi = m;
          else lo = m;
        }
        const E = frame.E(o.x + d.x * hi);
        const N = frame.N(o.z + d.z * hi);
        const ci = Math.floor((E - a.E0) / a.res);
        const rj = Math.floor((a.N0 - N) / a.res);
        const q =
          ci >= 0 && rj >= 0 && ci < a.width && rj < a.height ? (rj * a.width + ci) * 4 : -1;
        const cover =
          q < 0 ? null : (lcPx[q] ?? 0) > 127 ? "tree" : (lcPx[q + 1] ?? 0) > 127 ? "crop" : null;
        // within about 9 screen px of a line on the ground (at this distance and lens), so the cursor need not land
        // on a hairline
        const fov = "fov" in camera ? camera.fov : FOV;
        const mPerPx = ((2 * hi * Math.tan(rad(fov / 2))) / hgt) * 1000;
        const reach = Math.max(2 * g.res, 9 * mPerPx);
        return {
          E,
          N,
          h: sample(E, N),
          cover,
          order: nearest(reachLines, E, N, reach),
          route: nearest(routeLines, E, N, reach),
          inPixel: data.pixel ? inPoly(E, N, data.pixel.footprint) : false,
        };
      }
      prev = t;
    }
    return null;
  };

  return {
    probe,
    overlayGrid() {
      const k = 2;
      return {
        width: g.width * k,
        height: g.height * k,
        px: (E: number, N: number): [number, number] => [
          ((E - g.E0) / g.res) * k,
          ((g.N0 - N) / g.res) * k,
        ],
      };
    },
    render(next) {
      state = next;
      const e = ease(next.s);
      const v1 = next.sel ? viewFor(next.sel) : view0;
      const rise = next.rise ?? 1;
      const splitK = clamp01(next.split ?? 0);
      const destView = viewAt(view0, v1, e);
      // Two-stage arrival choreography:
      // Stage 1 (rise 0 -> 0.45): Globe zooms into the flat 2D Topographic Survey Plan (viewPlan, 82 deg top-down).
      // Stage 2 (rise 0.45 -> 1.0): Camera pitches from 82 deg down to 34 deg while the 3D carved terrain block
      // extrudes upward out of the 2D survey plan.
      const planToCarveK = ease(sstep(0.45, 1.0, rise));
      const atRest =
        rise < 1
          ? rise < 0.45 && next.from
            ? viewAt(introView(next.from), viewPlan, ease(clamp01(rise / 0.45)))
            : viewAt(viewPlan, destView, planToCarveK)
          : destView;
      // the pixel taken apart: the camera flies down to it from wherever it stood
      const at =
        splitK > 0 && TP
          ? viewAt(
              atRest,
              // stood back so the pixel and its risen cells sit in the gap its six cards leave (U27)
              pixelView(TP),
              ease(clamp01(splitK / 0.45)),
            )
          : atRest;
      paintCells(next.cellPaint ?? "rgb");
      placeCells(splitK);
      // Stage 1 holds the terrain flat on the 2D survey plan (0.015); Stage 2 extrudes the 3D carve-out (0.015 -> 1.0)
      const carveShaderK = sstep(0.42, 0.96, rise);
      const carveK = Math.max(0.015, carveShaderK);
      scene.scale.y = carveK;
      relief.uniforms.uCarve.value = carveShaderK;
      surveyPlan.uniforms.uCarve.value = carveShaderK;
      scene.updateMatrixWorld();
      // handing the land to the layer stack: a narrower lens from farther back, the same picture size
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
      const view = {
        ...at,
        target,
        // the package's land eases aside while one of its cards is open (UI-2)
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
      // the fog stands where it stands at rest; during the arrival it moves with the camera (the same distances in
      // front of and behind the land as at rest), so the land is not lost in it while the camera is far
      const fogAt =
        rise < 1 || exitK > 0 || splitK > 0
          ? view.distance / (view0.distance * (next.zoom ?? 1))
          : 1;
      relief.uniforms.uFog.value.set(
        lerp(view0.distance - 8, v1.distance - 4, e) * fogAt,
        lerp(view0.distance + 34, v1.distance + 40, e) * fogAt,
        lerp(0.32, 0.42, e),
      );
      // the land steps back a little while the ask is open; during the arrival it comes up out of the dark
      const dim = (1 - 0.15 * ease(next.o)) * sstep(0, 0.18, rise);
      relief.uniforms.uDim.value = dim;
      wall.uniforms.uDim.value = dim;
      surveyPlan.uniforms.uDim.value = dim;
      // the routes: lifted while their entry is hovered and when opened, a little quieter under another opened record;
      // their dashes keep one length on screen at every distance
      if (routeDraw.length && RC) {
        const lift = Math.max(next.r, next.sel === "routes" ? e : 0);
        const under = next.sel && next.sel !== "routes" ? 1 - 0.4 * e : 1;
        const pick = next.sel === "routes" ? (next.route ?? null) : null;
        camera.updateMatrixWorld();
        dashR.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        const a = project(RC);
        const b = project(arr(v3(RC).add(dashR)));
        const scale = Math.hypot(b.x - a.x, b.y - a.y);
        for (const d of routeDraw) {
          const quiet = pick && pick !== d.id ? ROUTE_QUIET : 1;
          d.mat.opacity = lerp(DASH.a0, DASH.a1, lift) * under * dim * quiet;
          d.mat.linewidth = pick === d.id ? DASH.w1 + 0.5 : lerp(DASH.w0, DASH.w1, lift);
          d.edgeMat.opacity = DASH.edgeA * under * dim * quiet;
          d.edgeMat.linewidth = d.mat.linewidth + DASH.edge;
          d.mat.dashScale = scale;
          d.edgeMat.dashScale = scale;
        }
      }
      // a layer lifted off the land at rest, rising, held and settling with the page's idle clock
      const lk = next.lift ? ease(clamp01(next.lift.k)) : 0;
      liftHeight = LIFT_KM * lk;
      const liftA = sstep(0, 0.35, next.lift?.k ?? 0);
      // light enough that the land reads through the lifted layer (lead, 30 Oct 14:48)
      lift.show(next.lift ? (liftLayers[next.lift.layer] ?? null) : null, liftHeight, 0.55 * liftA);
      liftEdge.position.y = liftHeight;
      liftEdgeLine.material.opacity = 0.7 * liftA;
      liftEdgeLine.visible = liftA > 0.002;
      // the land under a lifted layer steps back a little, so the layer reads as lifted off it
      relief.uniforms.uDim.value *= 1 - 0.15 * liftA;
      wall.uniforms.uDim.value *= 1 - 0.15 * liftA;
      surveyPlan.uniforms.uDim.value *= 1 - 0.15 * liftA;
      // the opened finding's footprint on the land
      const fp = next.sel === "fdr" ? slopeTex : next.sel === "rain" ? rainTex : null;
      if (fp) relief.uniforms.uOver.value = fp;
      // See It Over Time (UI-2): the view's own overlay, and the month's snow by band
      const tOv = next.sel === "time" && next.overlay ? overlayOf(next.overlay) : null;
      if (tOv) relief.uniforms.uOver.value = tOv;
      relief.uniforms.uOverA.value = fp ? 0.92 * e : tOv ? 0.96 * e : 0;
      const snow = next.sel === "time" ? (next.snow ?? null) : null;
      relief.uniforms.uSnowA.value = snow ? e : 0;
      if (snow) {
        relief.uniforms.uSnowLimits.value.set(snow.limits[0], snow.limits[1]);
        relief.uniforms.uSnow.value.set(snow.shares[0], snow.shares[1], snow.shares[2]);
      }
      relief.uniforms.uBandAt.value = bandLimitM ?? 0;
      relief.uniforms.uBandA.value = next.sel === "band" && bandLimitM !== null ? 0.9 * e : 0;
      // the package's pointed field check's band (UI-2)
      const rg =
        next.sel === "package" && next.lit != null ? (next.ranges?.[next.lit] ?? null) : null;
      relief.uniforms.uRangeLo.value = rg?.lo ?? -1e5;
      relief.uniforms.uRangeHi.value = rg?.hi ?? 1e5;
      relief.uniforms.uRangeA.value = rg ? 0.9 * e : 0;
      const planTraceBoost = 1 - sstep(0.42, 0.95, rise);
      outlineLine.material.opacity =
        Math.max(planTraceBoost * 0.92, lerp(0.38, next.sel === "catchment" ? 0.95 : 0.38, e)) *
        sstep(0, 0.18, rise);
      for (const r of riverLines) r.line.material.opacity = r.rest * sstep(0, 0.18, rise);
      outlineLine.material.linewidth = Math.max(
        1 + planTraceBoost * 1.1,
        lerp(1, next.sel === "catchment" ? 2 : 1, e),
      );
      // the arc steps back while the visitor has turned the land or brought it closer, so the land never crosses it
      dialMat.opacity = 1 - awayOf(next);
      // the package's words stand where the arc runs: the arc steps out while it is open (UI-2)
      if (next.sel === "package" || next.sel === "time") dialMat.opacity *= 1 - e;
      if (next.quiet) dialMat.opacity = 0;
      // recorded life (UI-2): the layer's 3D markers, stepping back with the land
      if (life) {
        const a = lifeShown(next);
        for (const m2 of life.mats) m2.mat.opacity = a * dim * m2.baseOpacity;
        life.obj.visible = a > 0.01;
      }
      if (pixelLine) {
        const on = next.sel === "pixel" || next.sel === "field";
        pixelLine.material.opacity = on ? Math.min(0.999, clamp01((e - 0.55) / 0.45)) : 0;
        pixelLine.visible = on && e > 0.55;
      }
      surveyPlan.mesh.visible = gapWaiters.length === 0;
      stage.render();
    },
    setLife,
    onLayout(f) {
      listeners.push(f);
    },
    handoff() {
      const b = landBox();
      return {
        rect: {
          x0: fit.ox + b.x0 * fit.scale,
          y0: fit.oy + b.y0 * fit.scale,
          x1: fit.ox + b.x1 * fit.scale,
          y1: fit.oy + b.y1 * fit.scale,
        },
        azimuth: current.view.azimuth,
        elevation: current.view.elevation,
        light: [light.dir.x, light.dir.y, light.dir.z] as const,
        exag: EXAG,
        lightMap: { map: lightMap, width: g.width, height: g.height },
      };
    },
    measureGaps() {
      return new Promise((resolve) => {
        gapWaiters.push((g) => {
          surveyPlan.mesh.visible = true;
          resolve(g);
        });
        surveyPlan.mesh.visible = false;
        stage.render();
      });
    },
    dispose() {
      if (dialLine) dialLine.geometry.dispose();
      dialMat.dispose();
      surveyPlan.mesh.geometry.dispose();
      surveyPlan.mesh.material.dispose();
      for (const d of routeDraw) {
        d.geo.dispose();
        d.mat.dispose();
        d.edgeMat.dispose();
      }
      if (life) {
        for (const g2 of life.geos) g2.dispose();
        for (const m2 of life.mats) m2.mat.dispose();
      }
      slopeTex?.dispose();
      rainTex?.dispose();
      bandsTex?.dispose();
      lift.dispose();
      cellGeo.dispose();
      cellMat.dispose();
      for (const o of scene2.children)
        if (o instanceof Mesh && o.material instanceof ShaderMaterial) o.material.dispose();
      r2.dispose();
      stage.dispose();
      for (const t of [hTex, lcTex, lightMap]) t.dispose();
      waterTex?.dispose();
      data.landcover.close();
    },
  };
}
