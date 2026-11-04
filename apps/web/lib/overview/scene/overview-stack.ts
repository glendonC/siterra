// The land taken apart in place: one sheet per layer the place has (lib/overview/layers), each a copy of the relief
// carrying its data. Settled, the sheets lie in the land and only the layer in focus is lifted above it, as the
// overview has always lifted one; split, they rise off the relief one after another, the top sheet first, into an
// evenly spaced stack with the relief at the bottom, nearly flat so each pictures as a thin band from the stack's
// low side view, the one in focus lit and the others quiet. The rig keeps its own clock: `set` gives it a goal and
// `step` moves toward it, saying whether it still moves, so the page's frame loop runs only while it must.

import { type CanvasTexture, Group, type Object3D, type Texture, type Vector3 } from "three";
import type { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { Frame, Grid, Vec3 } from "../../instruments/valley/frame";
import type { LineKit } from "../../instruments/valley/scene/lines";
import { ramp } from "../../instruments/valley/palette";
import { cssColour } from "../../theme/obsidian";
import { clamp01, ease, lerp, sstep } from "../arc";
import type { OverviewData } from "../data";
import {
  litOf,
  paletteOf,
  sheetProgress,
  stackGap,
  stackHeights,
  stackOf,
  type StackLayer,
  type StackPalette,
  type Theme,
} from "../layers";
import type { StackData } from "../layers-data";
import type { Box, Point } from "./overview-camera";
import { createSheet, sheetGeometry, type LiftLayer, type Sheet, type SheetLook } from "./lift";
import { coverTexture, type LiftId, paintGridSheet } from "./overview-sheets";
import { hexVec } from "./overview-shaders";

/** The stack's camera: the layers view's bearing to the land's long axis and its elevation (lib/land/layer-layout). */
export const STACK_VIEW = { azOff: 84.16, el: 25 } as const;
/** Share of the relief a sheet keeps in the stack: enough to read the valley's shape, little enough to stay a band. */
const STACK_RELIEF = 0.2;
/** The split's lengths (s): taken apart, settled, and the arrival's quicker split and settle. */
const OPEN_S = 2.4;
const CLOSE_S = 1.5;
const PULSE_S = { open: 1.3, close: 1.1 } as const;
/**
 * The split's two motions, as shares of its clock: the camera turns to the stack's view in the first part, and the
 * sheets travel in the rest, so settling brings every sheet home before the camera turns back with the land.
 */
const CAMERA_PART = 0.4;
const SHEETS_FROM = 0.3;
/** How long the lit sheet takes to change (s). */
const LIT_S = 0.3;
/** A sheet's strength: lifted alone (as before), and in the stack. */
const KEPT_ALPHA = 0.55;
const STACK_ALPHA = 0.9;
/** The sheets' grid: every third relief cell (90 m on a 30 m relief); the edge and data are drawn per pixel. */
const STRIDE = 3;

export interface StackCommand {
  /** Split (every sheet in the stack) or settled (the layer in focus lifted alone, as before). */
  open: boolean;
  /** Straight to the end state, with no motion: a return from a view, reduced motion. */
  instant?: boolean;
  /** Split, hold this long (s), then settle by itself, quicker: the arrival's one split. */
  hold?: number;
}

export interface StackSheetPlace {
  id: StackLayer;
  /** The sheet's right-most edge point on screen (design px). */
  at: Point;
  /** The sheet's left-most edge point on screen (design px): where the steps' cursor for the layer points. */
  left: Point;
  /** How far its label is shown (0 to 1). */
  shown: number;
  /** Lit: the layer in focus (every sheet when none is). */
  lit: boolean;
}

export interface StackLayout {
  /** 0 settled to 1 split. */
  k: number;
  /** True while the stack is split or going to be; false when settled or settling. */
  open: boolean;
  /** The sheets off the land, top first: every one while split, else the one lifted alone. */
  sheets: StackSheetPlace[];
  /** The land and the sheets on screen (design px), for the labels to keep clear of. */
  box: Box;
  /** What the labels say about the data drawn: the trend's window, the rain sheet's window and shading. */
  facts: { trendWindow: string | null; rain: { window: string | null; amounts: boolean } };
}

interface Rim {
  x: number;
  z: number;
  /** Model y of the relief at the point. */
  y: number;
}

export function createStackRig(opts: {
  data: OverviewData;
  g: Grid;
  a: Grid;
  frame: Frame;
  relief: { uExag: { value: number }; uBase: { value: number } };
  lcTex: Texture;
  /** The overview's own footprint sheets: the trend slopes and the CHIRPS cells by share inside. */
  slopeTex: CanvasTexture | null;
  rainShareTex: CanvasTexture | null;
  /** The catchment's rim (model x, z with the relief's model y) for each sheet's edge, a sparser one for its label's
   *  anchor and the camera, and the depth of the land's foot below its rim (model km). */
  ring: readonly Rim[];
  rim: readonly Rim[];
  rimFoot: number;
  lines: LineKit;
  /** The land's lowest and highest model y, and its long axis bearing. */
  yMin: number;
  yMax: number;
  bearing: number;
  kmScale: number;
  addToScene: (o: Object3D) => void;
}) {
  const { data, g, a, frame, relief, lcTex, rim, yMin, yMax } = opts;
  const liftKm = 3.2 * opts.kmScale;
  const geometry = sheetGeometry(data.relief, g, frame, STRIDE);
  const bandsTex = data.bands ? coverTexture(data.bands) : null;
  const gridRect = frame.rect(g);
  const analysisRect = frame.rect(a);

  let stackData: StackData = { snow: null, rain: null };
  let theme: Theme = "light";
  const painted = new Map<string, CanvasTexture | null>();

  // ---------- each sheet's data, in the theme ----------
  const trace = (ctx: CanvasRenderingContext2D, pts: readonly [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };
  const paintTrend = (p: StackPalette): CanvasTexture | null => {
    const slope = data.footprints.slope;
    if (!slope) return null;
    return paintGridSheet(g, (ctx, px) => {
      for (const c of slope.cells) {
        trace(
          ctx,
          c.corners.map(([E, N]) => px(E, N)),
        );
        const s = Math.abs(c.slope);
        ctx.fillStyle =
          s < slope.neutral
            ? p.trend.neutral
            : cssColour(
                ramp(
                  [p.trend.neutral, ...(c.slope < 0 ? p.trend.below : p.trend.above)],
                  Math.min(1, s / slope.domain),
                ),
              );
        ctx.fill();
      }
    });
  };
  // the CHIRPS cells as inset tiles shaded by their average rain, so the gaps between them mark the grid
  const paintRain = (p: StackPalette): CanvasTexture | null => {
    const rain = stackData.rain;
    if (!rain) return null;
    return paintGridSheet(g, (ctx, px) => {
      for (const c of rain.cells) {
        const cx = c.corners.reduce((s, [E]) => s + E, 0) / c.corners.length;
        const cy = c.corners.reduce((s, [, N]) => s + N, 0) / c.corners.length;
        trace(
          ctx,
          c.corners.map(([E, N]) => px(cx + (E - cx) * 0.92, cy + (N - cy) * 0.92)),
        );
        ctx.fillStyle = cssColour(
          ramp(p.rain, (c.mm - rain.range.lo) / (rain.range.hi - rain.range.lo)),
        );
        ctx.fill();
      }
    });
  };
  const paintedFor = (id: "trend" | "rain"): CanvasTexture | null => {
    const key = `${id}:${theme}`;
    if (!painted.has(key))
      painted.set(key, (id === "trend" ? paintTrend : paintRain)(paletteOf(theme)));
    return painted.get(key) ?? null;
  };

  const has = (id: StackLayer): boolean =>
    id === "trend"
      ? data.footprints.slope !== null
      : id === "rain"
        ? stackData.rain !== null ||
          (opts.rainShareTex !== null && (data.footprints.rain?.length ?? 0) > 0)
        : id === "snow"
          ? stackData.snow !== null && stackData.snow.bands.length > 0
          : id === "bands"
            ? bandsTex !== null
            : true;

  const layerOf = (id: StackLayer): { layer: LiftLayer; look: SheetLook } => {
    const p = paletteOf(theme);
    const look: SheetLook = { colours: [], plate: hexVec(p.plate), rim: hexVec(p.rim) };
    switch (id) {
      case "trend":
        return {
          layer: { mode: "overlay", tex: paintedFor("trend") ?? opts.slopeTex, rect: gridRect },
          look,
        };
      case "rain":
        return {
          layer: { mode: "overlay", tex: paintedFor("rain") ?? opts.rainShareTex, rect: gridRect },
          look,
        };
      case "cover":
        return {
          layer: { mode: "cover", tex: lcTex, rect: analysisRect },
          look: { ...look, colours: [hexVec(p.cover.tree), hexVec(p.cover.crop)] },
        };
      case "bands":
        return {
          layer: { mode: "bands", tex: bandsTex, rect: analysisRect },
          look: { ...look, colours: p.bands.map(hexVec) },
        };
      case "snow": {
        const bands = stackData.snow?.bands ?? [];
        const colours: Vector3[] = p.snow.map(hexVec);
        return {
          layer: { mode: "snow", tex: null, rect: analysisRect },
          look: {
            ...look,
            colours,
            snow: {
              edges: bands.slice(1).map((b) => b.lo ?? 0),
              shares: bands.map((b) => b.share),
            },
          },
        };
      }
    }
  };

  // ---------- the sheets and where they stand ----------
  const sheets = new Map<StackLayer, Sheet>();
  /** Each sheet's edge: the catchment's rim at the relief's heights, posed as its sheet is (scale y and lift). */
  const edges = new Map<StackLayer, { group: Group; material: LineMaterial }>();
  const edgeOf = (id: StackLayer) => {
    const known = edges.get(id);
    if (known) return known;
    const line = opts.lines.lines([opts.ring.map((r): Vec3 => [r.x, r.y + 0.004, r.z])], {
      color: paletteOf(theme).rim,
      width: 1,
      opacity: 0.99,
      closed: true,
      depthTest: false,
    });
    const group = new Group();
    group.add(line);
    group.visible = false;
    opts.addToScene(group);
    const made = { group, material: line.material };
    edges.set(id, made);
    return made;
  };
  let order: StackLayer[] = [];
  let slots: number[] = [];
  /** How far each sheet's picture reaches along the stack's line of sight (km): the land's depth seen from its side. */
  const az = opts.bearing + STACK_VIEW.azOff;
  const fwd: [number, number] = [Math.sin((az * Math.PI) / 180), -Math.cos((az * Math.PI) / 180)];
  const depth = (() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of rim) {
      const d = r.x * fwd[0] + r.z * fwd[1];
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    return Math.max(0, hi - lo);
  })();
  const gap = stackGap(depth, STACK_VIEW.el, STACK_RELIEF * (yMax - yMin));
  let version = 0;

  const restack = () => {
    const before = order.join(" ");
    order = stackOf(has);
    slots = stackHeights(order.length, yMax, gap);
    if (order.join(" ") !== before) version++;
    order.forEach((id, i) => {
      let s = sheets.get(id);
      if (!s) {
        s = createSheet(geometry, relief, lcTex, analysisRect);
        sheets.set(id, s);
        opts.addToScene(s.mesh);
      }
      const { layer, look } = layerOf(id);
      s.setLayer(layer, look);
      // the higher sheet is drawn over the lower one: it is the nearer where their pictures meet
      s.mesh.renderOrder = 40 + 2 * (order.length - i);
      const edge = edgeOf(id);
      edge.material.color.set(paletteOf(theme).rim);
      edge.group.children.forEach((c) => (c.renderOrder = s.mesh.renderOrder + 1));
    });
  };
  restack();

  // ---------- the clock ----------
  let goalOpen = false;
  /** The arrival's split: how long it holds once standing (s), and until when (ms) once it stands. */
  let hold: number | null = null;
  let holdUntil: number | null = null;
  let pulse = false;
  let k = 0;
  let last: number | null = null;
  let focus: LiftId | null = null;
  let keptK = 0;
  /** The land is still arriving: no sheet is off it and no label shows. */
  let heldNow = false;
  const litW = new Map<StackLayer, number>();

  const set = (cmd: StackCommand) => {
    // the clock restarts with the command, so a stack set after a still spell starts from where it stood
    last = null;
    pulse = cmd.hold !== undefined;
    hold = cmd.hold ?? null;
    holdUntil = null;
    if (cmd.instant) {
      // the end state at once: a split that would settle by itself ends settled
      goalOpen = cmd.open && !pulse;
      k = goalOpen ? 1 : 0;
      hold = null;
      pulse = false;
      return;
    }
    goalOpen = cmd.open;
  };

  /**
   * Moves the stack toward its goal; `held` while the land is still arriving (the camera coming down and the relief
   * rising out of the plan), when a split waits for the land to stand before it starts.
   */
  const step = (
    now: number,
    lift: { layer: LiftId; k: number } | null | undefined,
    held = false,
  ): boolean => {
    const dt = last === null ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    focus = lift && lift.k > 0 ? lift.layer : null;
    keptK = lift?.k ?? 0;
    heldNow = held;
    let moving = false;
    if (goalOpen && k < 1) {
      // while held the split waits without keeping the page drawing: the arrival draws, and the page starts the clock
      // again once the land stands (pending)
      if (!held) {
        k = Math.min(1, k + dt / (pulse ? PULSE_S.open : OPEN_S));
        moving = true;
      }
    } else if (!goalOpen && k > 0) {
      k = Math.max(0, k - dt / (pulse ? PULSE_S.close : CLOSE_S));
      moving = true;
      if (k === 0) pulse = false;
    }
    // the arrival's split: once standing, it holds, then settles
    if (goalOpen && k === 1 && hold !== null) {
      holdUntil ??= now + hold * 1000;
      if (now >= holdUntil) {
        goalOpen = false;
        hold = null;
        holdUntil = null;
      }
      moving = true;
    }
    const lit = litOf(order, focus);
    for (const id of order) {
      const goal = lit === null || lit === id ? 1 : 0;
      const w = litW.get(id) ?? goal;
      const next = Math.abs(goal - w) <= dt / LIT_S ? goal : w + Math.sign(goal - w) * (dt / LIT_S);
      litW.set(id, k === 0 ? goal : next);
      if (k > 0 && next !== goal) moving = true;
    }
    return moving;
  };

  /** Each sheet's progress off the land (0 to 1, eased), top first. */
  const progress = (i: number) =>
    ease(sheetProgress(clamp01((k - SHEETS_FROM) / (1 - SHEETS_FROM)), i, order.length));

  const poseOf = (id: StackLayer, i: number) => {
    const p = progress(i);
    const kept = id === focus ? keptK : 0;
    const keptA = sstep(0, 0.35, kept);
    const slot = slots[i] ?? yMax;
    const quiet = 1 - (litW.get(id) ?? 1);
    return {
      p,
      relief: lerp(1, STACK_RELIEF, p),
      y: lerp(liftKm * ease(clamp01(kept)), slot - STACK_RELIEF * yMin, p),
      alpha: lerp(KEPT_ALPHA * keptA, STACK_ALPHA, Math.min(1, p * 2.5)),
      quiet: quiet * p,
      rimA: lerp(0.7 * keptA, 0.85, Math.min(1, p * 2.5)),
    };
  };

  /** Places every sheet for this frame; the land's dimming follows how much is lifted. */
  const place = (): { liftA: number } => {
    let liftA = 0;
    order.forEach((id, i) => {
      const pose = poseOf(id, i);
      sheets.get(id)?.pose(pose);
      const edge = edges.get(id);
      if (edge) {
        edge.group.scale.y = pose.relief;
        edge.group.position.y = pose.y;
        edge.material.opacity = pose.rimA * (1 - 0.45 * pose.quiet);
        edge.group.visible = pose.rimA > 0.002;
      }
      liftA = Math.max(liftA, id === focus ? sstep(0, 0.35, keptK) : 0, pose.p);
    });
    return { liftA };
  };

  /** A rim point on a sheet as drawn: the scene's own height scale (the relief rising on arrival) applies too. */
  const sheetPoint = (r: Rim, pose: { relief: number; y: number }, yScale: number): Vec3 => [
    r.x,
    (r.y * pose.relief + pose.y) * yScale,
    r.z,
  ];

  /** The points the stack's camera keeps in view: the land's rim and foot, and each sheet's rim at its slot. */
  const framePoints = (): Vec3[] => {
    const pts: Vec3[] = [];
    const every = rim.filter((_, n) => n % 2 === 0);
    for (const r of every) pts.push([r.x, r.y, r.z], [r.x, r.y - opts.rimFoot, r.z]);
    slots.forEach((slot) => {
      for (const r of every) {
        pts.push([r.x, slot, r.z], [r.x, slot + STACK_RELIEF * (yMax - yMin), r.z]);
      }
    });
    return pts;
  };

  const layout = (project: (p: Vec3) => Point, land: Box, yScale = 1): StackLayout => {
    const placed: StackSheetPlace[] = [];
    let box = { ...land };
    const lit = litOf(order, focus);
    order.forEach((id, i) => {
      if (heldNow) return;
      const pose = poseOf(id, i);
      const alone = k === 0 && !goalOpen && id === focus && keptK > 0;
      if (pose.p <= 0.001 && !alone) return;
      let at: Point | null = null;
      let left: Point | null = null;
      for (const r of rim) {
        const q = project(sheetPoint(r, pose, yScale));
        if (!at || q.x > at.x) at = q;
        if (!left || q.x < left.x) left = q;
        box = {
          x0: Math.min(box.x0, q.x),
          y0: Math.min(box.y0, q.y),
          x1: Math.max(box.x1, q.x),
          y1: Math.max(box.y1, q.y),
        };
      }
      if (!at || !left) return;
      placed.push({
        id,
        at,
        left,
        // a label comes in with its own sheet as it arrives and goes with it as it settles; the one lifted alone shows
        // its label as it rises, as the lifted sheet's caption always has
        shown: alone ? clamp01((keptK - 0.4) / 0.5) : sstep(0.55, 1, pose.p),
        lit: lit === null || lit === id,
      });
    });
    return {
      k,
      open: goalOpen,
      sheets: placed,
      box,
      facts: {
        trendWindow: data.footprints.slope?.window ?? null,
        rain: { window: stackData.rain?.window ?? null, amounts: stackData.rain !== null },
      },
    };
  };

  /** The lifted sheet's right-most rim point while it stands alone above the land (the old caption's anchor). */
  const liftAt = (project: (p: Vec3) => Point, yScale = 1): Point | null => {
    if (k > 0 || focus === null || keptK <= 0) return null;
    const i = order.indexOf(focus);
    if (i < 0) return null;
    const pose = poseOf(focus, i);
    if (pose.y <= 0.01) return null;
    return rim
      .map((r) => project(sheetPoint(r, pose, yScale)))
      .reduce<Point | null>((b, q) => (!b || q.x > b.x ? q : b), null);
  };

  return {
    set,
    step,
    place,
    layout,
    liftAt,
    framePoints,
    /** The camera's turn to the stack's view (0 to 1): ahead of the sheets as they rise, behind them as they settle. */
    camK: () => ease(sstep(0, CAMERA_PART, k)),
    /** Changes whenever the stack's sheets or heights change, so a camera solved for them is solved again. */
    version: () => version,
    /** A split is asked for and has not stood up yet (it may be waiting for the land to arrive). */
    pending: () => goalOpen && k < 1,
    azimuth: az,
    setData: (d: StackData) => {
      stackData = d;
      for (const key of [...painted.keys()].filter((key) => key.startsWith("rain:"))) {
        painted.get(key)?.dispose();
        painted.delete(key);
      }
      restack();
    },
    setTheme: (t: Theme) => {
      if (t === theme) return;
      theme = t;
      restack();
    },
    dispose() {
      for (const s of sheets.values()) s.dispose();
      for (const e of edges.values()) e.material.dispose();
      for (const t of painted.values()) t?.dispose();
      bandsTex?.dispose();
      geometry.dispose();
    },
  };
}

export type StackRig = ReturnType<typeof createStackRig>;
