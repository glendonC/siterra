// The overview's scene (approved specimen D4, js/d4.js): the catchment relief, lit and draped, seen along the
// valley's long axis inside one upright hairline arc of a large circle, open at the bottom, whose ends fade to
// nothing. The arc draws on its own canvas over the land's depth, so the land's depth of field does not soften it.
// Opening a finding orbits the camera toward that finding's side and closes in, moves the arc away and rolls the
// finding round to face its record, and blurs the land outside a band around the focus. The case's proposed walking
// routes lie on the land as fine dashed amber lines (dashes of a fixed length on screen), draped on the drawn relief;
// hovering their entry lifts them, and selecting it moves the view toward them with the land under them kept sharp.
// The page (React) owns the words; every render hands it the screen positions it needs (design px at 1440 x 900).

import {
  CanvasTexture,
  Color,
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
import { createStage, type PerspectiveView } from "../../instruments/valley/scene/stage";
import { heightTexture } from "../../instruments/valley/scene/textures";
import { maskAt, overviewColours as C } from "../../theme/obsidian";
import {
  ARC,
  DIAL,
  DIAL1,
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
  createWall,
  hexVec,
  lightDir,
  maskOnRelief,
  signedArea,
  smoothRing,
} from "./terrain";

export const OVERVIEW_DESIGN = { width: 1440, height: 900 } as const;
/** The vertical scale, and the elevation the model's y = 0 stands at (m). */
export const EXAG = 2.5;
const BASE = 1200;
/** Vertical field of view at the design height (degrees). */
const FOV = 26;
/** The overview: bearing, elevation, the land's height on screen and the centre of its box (design px). */
const OV = { az: 52, el: 34, fh: 640, cx: 731, cy: 494 } as const;
/** D4's opened pixel: bearing, elevation, distance (km) and where its centre lands on screen. */
const ND = { az: 40, el: 33, dist: 42, x: 360, y: 600 } as const;
/**
 * A finding of the whole catchment opened (D4 defined only the pixel): the land kept whole, smaller and on the left,
 * clear of the record on the right.
 */
const WIDE = { fh: 560, cx: 300, cy: 470 } as const;
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
/** The pixel's clock in D4: its turn (ND.az - OV.az) is the turn for a finding at that clock. */
const PIXEL_CLOCK = 52;
const TURN = (ND.az - OV.az) / Math.sin((PIXEL_CLOCK * Math.PI) / 180);

/**
 * How far the arc, its labels and the ask step back (0 to 1) while the visitor has turned the land or brought it
 * closer: by a turn of 18 degrees, or a quarter closer, they are gone; R brings them back with the overview's pose.
 */
export function awayOf(v: { zoom?: number; turn?: number }): number {
  const turned = Math.abs(v.turn ?? 0) / 18;
  const closer = Math.max(0, 1 / (v.zoom ?? 1) - 1) * 4;
  return Math.min(1, Math.max(turned, closer));
}

const DEG = Math.PI / 180;
const rad = (d: number) => d * DEG;

/**
 * A finding, the field check on the land, the ask's results (which move as the whole catchment's finding), or the
 * proposed walking routes.
 */
export type Selection = FindingId | "field" | "results" | "routes";

/** The side a selection's record opens on: a finding on the arc's left opens on the left, the land easing right. */
export const sideOf = (sel: Selection | null, clock: number | undefined): "left" | "right" =>
  sel !== null && sel !== "field" && sel !== "results" && sel !== "routes" && (clock ?? 0) > 180
    ? "left"
    : "right";

/** The findings about the whole catchment: their view keeps the land whole and unblurred, with no swing. */
const WHOLE = new Set<Selection>(["catchment", "fdr", "rain", "results"]);

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
  /** The visitor's own view: a factor on the camera's distance and a turn of its bearing (degrees). */
  zoom?: number;
  turn?: number;
  /** The finding opening or open (kept while it closes). */
  sel: Selection | null;
}

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
}

export interface Gaps {
  /** Smallest distance (design px) from the drawn arc to the land, and where. */
  arc: number;
  /** Distance (design px) from a design point to the land. */
  distanceAt(p: Point): number;
}

export interface OverviewScene {
  render(state: SceneState): void;
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
  const M30 = maskOnRelief(
    c2.getImageData(0, 0, data.landcover.width, data.landcover.height).data,
    a,
    g,
  );
  // the key light keeps D3's relation to the overview camera: 45 degrees round from it, 32 degrees up
  const light = {
    dir: lightDir(OV.az + 45, 32),
    color: hexVec(C.keyLight).multiplyScalar(1.25),
    ambient: hexVec(C.ambient).multiplyScalar(0.62),
    sky: hexVec(C.sky),
  };
  const lightMap = bakeLight(H, g, M30, light.dir, { exag: EXAG, base: BASE, soft: 14 });
  const relief = createRelief(H, g, frame, lcTex, frame.rect(a), {
    hTex,
    light,
    lightMap,
    colours: {
      albedo: C.reliefAlbedo,
      line: C.contour,
      treeC: C.coverTree,
      cropC: C.coverCrop,
      limitC: C.bandLimit,
      fogC: C.fog,
      rimC: C.rim,
    },
    coverA: 0.82,
    rimA: 0.22,
    smooth: 0.55,
  });
  scene.add(relief.mesh);
  const rim = smoothRing(data.ring, 2);
  const wall = createWall(rim, sample, frame, {
    outward: signedArea(rim) > 0 ? -1 : 1,
    albedo: C.wallAlbedo,
    light,
    depth: 900,
    fadePow: 2.2,
  });
  scene.add(wall.mesh);
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
  const WIDTHS = [0.7, 0.9, 1.2, 1.6, 2.0];
  const OPACITY = [0.55, 0.7, 0.85, 0.9, 0.95];
  for (const o of [1, 2, 3, 4, 5]) {
    const pls = data.rivers.reaches
      .filter((q) => q.order === o)
      .map((r) => r.pts.map(([E, N, h]) => frame.v(E, N, h + 4)));
    if (pls.length)
      scene.add(
        stage.lines.lines(pls, {
          color: C.drainage[o - 1] ?? C.catchmentLine,
          width: WIDTHS[o - 1] ?? 1,
          opacity: OPACITY[o - 1] ?? 1,
        }),
      );
  }
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
    .map(([E, N]) => frame.v(E, N, sample(E, N) - 450));
  const landBox = () => bbox([...rimTop, ...rimFoot].map(project));
  const T0: Vec3 = [0, frame.y(2400), 0];
  /** A view of the whole land: its height on screen fitted to `fh`, its box centred at (cx, cy). */
  const fitLand = (az: number, el: number, fh: number, cx: number, cy: number): View => {
    let distance = 90;
    for (let it = 0; it < 10; it++) {
      set({ target: T0, azimuth: az, elevation: el, distance, shift: [0, 0] });
      const b = landBox();
      distance *= (b.y1 - b.y0) / fh;
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
  // the overview looks along the valley's long axis from the east-north-east, so the land stands compact and upright
  const view0 = fitLand(OV.az, OV.el, OV.fh, OV.cx, OV.cy);
  /** A view closed in on one place on the land, put at (ND.x, ND.y). */
  const pointAt = (target: Vec3, az: number): View => {
    const v: View = { target, azimuth: az, elevation: ND.el, distance: ND.dist, shift: [0, 0] };
    set(v);
    const s = project(target);
    return { ...v, shift: [ND.x - s.x, ND.y - s.y] };
  };
  const pixelCentre = data.pixel?.centre;
  const TP: Vec3 | null = pixelCentre
    ? frame.v(pixelCentre[0], pixelCentre[1], sample(pixelCentre[0], pixelCentre[1]))
    : null;
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
  const clockOf = (sel: Selection | null) =>
    findings.find(
      (f) => f.id === (sel === "field" ? "pixel" : sel === "results" ? "catchment" : sel),
    )?.clock ?? PIXEL_CLOCK;
  /** The routes opened: the pixel's bearing, closed in until every route fits RT's box. */
  const routesView = (target: Vec3): View => {
    const base = { target, azimuth: ND.az, elevation: RT.el, shift: [0, 0] as [number, number] };
    let distance = ND.dist;
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
    const az = OV.az + TURN * Math.sin(rad(clockOf(sel)));
    const place = sel === "pixel" || sel === "field" ? TP : sel === "band" ? TB : null;
    // a whole-catchment finding keeps the overview's bearing (no swing); the land eases away from its record's side
    const left = sideOf(sel, clockOf(sel)) === "left";
    const v =
      sel === "routes" && RC
        ? routesView(RC)
        : place
          ? pointAt(place, az)
          : fitLand(
              WHOLE.has(sel) ? OV.az : az,
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
    const depth = targetDist + DIAL.back;
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
      if (y > frame.y(4100)) continue;
      const E = frame.E(x);
      const N = frame.N(z);
      const i = Math.floor((E - g.E0) / g.res);
      const j = Math.floor((g.N0 - N) / g.res);
      if (i < 0 || j < 0 || i >= g.width || j >= g.height || !M30[j * g.width + i]) continue;
      // the land is a slab: the surface and its 900 m edge hide what is behind; a line wholly under it does not
      const ty = frame.y(sample(E, N));
      if (y < ty - (20 * EXAG) / 1000 && y > ty - (900 * EXAG) / 1000) return true;
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
    }
    const glc = canvases.land;
    if (drawn.bw !== glc.width || drawn.bh !== glc.height) {
      canvases.blur.width = glc.width;
      canvases.blur.height = glc.height;
    }
    drawn = { w: width, h: height, bw: glc.width, bh: glc.height };
  };

  // every render of the land (the page's, or the stage's own on a resize) draws the arc and hands out the layout
  stage.onRender(() => {
    updateFit();
    sync();
    const { e, view, selClock } = current;
    placeDial(e, view.distance, selClock, sideOf(state.sel, selClock) === "left");
    const span = spanAt(state.s, state.k, state.o, selClock);
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

  return {
    render(next) {
      state = next;
      const e = ease(next.s);
      const v1 = next.sel ? viewFor(next.sel) : view0;
      const at = viewAt(view0, v1, e);
      const view = {
        ...at,
        distance: at.distance * (next.zoom ?? 1),
        azimuth: at.azimuth + (next.turn ?? 0),
      };
      set(view);
      current = { e, view, selClock: clockOf(next.sel) };
      relief.uniforms.uFog.value.set(
        lerp(view0.distance - 8, v1.distance - 4, e),
        lerp(view0.distance + 34, v1.distance + 40, e),
        lerp(0.32, 0.42, e),
      );
      // the land steps back a little while the ask is open
      const dim = 1 - 0.15 * ease(next.o);
      relief.uniforms.uDim.value = dim;
      wall.uniforms.uDim.value = dim;
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
      // the opened finding's footprint on the land
      const fp = next.sel === "fdr" ? slopeTex : next.sel === "rain" ? rainTex : null;
      if (fp) relief.uniforms.uOver.value = fp;
      relief.uniforms.uOverA.value = fp ? 0.92 * e : 0;
      relief.uniforms.uBandAt.value = bandLimitM ?? 0;
      relief.uniforms.uBandA.value = next.sel === "band" && bandLimitM !== null ? 0.9 * e : 0;
      outlineLine.material.opacity = lerp(0.32, next.sel === "catchment" ? 0.95 : 0.32, e);
      outlineLine.material.linewidth = lerp(1, next.sel === "catchment" ? 2 : 1, e);
      // the arc steps back while the visitor has turned the land or brought it closer, so the land never crosses it
      dialMat.opacity = 1 - awayOf(next);
      if (pixelLine) {
        const on = next.sel === "pixel" || next.sel === "field";
        pixelLine.material.opacity = on ? Math.min(0.999, clamp01((e - 0.55) / 0.45)) : 0;
        pixelLine.visible = on && e > 0.55;
      }
      stage.render();
    },
    onLayout(f) {
      listeners.push(f);
    },
    measureGaps() {
      return new Promise((resolve) => {
        gapWaiters.push(resolve);
        stage.render();
      });
    },
    dispose() {
      if (dialLine) dialLine.geometry.dispose();
      dialMat.dispose();
      for (const d of routeDraw) {
        d.geo.dispose();
        d.mat.dispose();
        d.edgeMat.dispose();
      }
      slopeTex?.dispose();
      rainTex?.dispose();
      for (const o of scene2.children)
        if (o instanceof Mesh && o.material instanceof ShaderMaterial) o.material.dispose();
      r2.dispose();
      stage.dispose();
      for (const t of [hTex, lcTex, lightMap]) t.dispose();
      data.landcover.close();
    },
  };
}
