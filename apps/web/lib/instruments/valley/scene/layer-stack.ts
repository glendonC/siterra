// The five layers over the valley: the catchment as a physical model (30 m relief cut along
// the frozen boundary with a section wall, one warm low light, contours every 250 m, drainage from the same DEM)
// under five plates, one dataset each, stacked straight up. The camera, the gaps and the plate come from the
// fixture layout-a.json, measured before rendering so that no layer's content hides another's.

import {
  Group,
  type Material,
  type Mesh,
  type Object3D,
  type ShaderMaterial,
  type Texture,
  Vector3,
} from "three";
import type { LandPose } from "../../../land/handoff";
import { bakeLight } from "../../../overview/scene/terrain";
import { modelColours, obsidian, overviewColours, sheetColours } from "../../../theme/obsidian";
import { smoothRing } from "../../../stage/smooth";
import type { LayerStackData } from "../fixtures";
import { makeFrame, makeHeightSampler, type Rect, type Vec3 } from "../frame";
import { clipConvex, openRing, signedArea, type Point } from "../geometry";
import { rainColour, rainRangeOf, trendRgba, type Rgba } from "../palette";
import { RASTER_MODE, polyMesh, rasterSheet, sheetPlane } from "./sheets";
import { createStage, type Stage } from "./stage";
import { contactShadow, createRelief, createWall, hexVec, lightFrom } from "./terrain";
import { landFrame } from "../../../land/geometry";
import { layerStackLayout } from "../../../land/layer-layout";
import { bitmapTexture, heightTexture } from "./textures";

/** Vertical exaggeration of the model; the view states it. */
export const LAYER_STACK_EXAG = 1.5;
/** The size the layout was measured at, in CSS px; other sizes scale the view to fit. */
export const LAYER_STACK_DESIGN = { width: 1440, height: 900 } as const;
/** The five 500 m snow bands, low to high, and the month the snow sheet shows (February). */
const SNOW_BANDS = [
  "elev_below_2000",
  "elev_2000_2500",
  "elev_2500_3000",
  "elev_3000_3500",
  "elev_3500_up",
] as const;
const SNOW_MONTH = 1;
/** Drainage line width (CSS px) by Strahler order 1 to 5. */
const DRAINAGE_WIDTH = [0.9, 1.15, 1.6, 2.1, 2.6] as const;

export type SheetId = "trend" | "rain" | "snow" | "cover" | "bands";
export const SHEETS: readonly SheetId[] = ["trend", "rain", "snow", "cover", "bands"];

/** The sheets a place's data has, in SHEETS order: no snow sheet where the spec names no snow layer. */
export function sheetsOf(data: { snow: unknown }): SheetId[] {
  return SHEETS.filter((id) => id !== "snow" || data.snow !== null);
}

export interface LayerStackScene {
  stage: Stage;
  /** The sheets drawn (sheetsOf); sheetY and sheetIn are in their order. */
  sheets: readonly SheetId[];
  /** Each sheet's height in the model now, in the order of `sheets` (they move while the land is taken apart). */
  sheetY: readonly number[];
  /** How far each sheet has come off the land (0 to 1, in the order of `sheets`); all 1 at rest. */
  sheetIn: readonly number[];
  /**
   * The land taken apart: at 0 the overview's land as the overview showed it (its pose, its height
   * scale and light, the sheets inside it), at 1 the reference stack; between, the camera moves to the measured view,
   * the land settles to this view's height scale and the sheets peel up one by one, the first to the top.
   */
  setIntro(k: number, from: LandPose): void;
  /** The plate's corners in model x, z. */
  plate: readonly Point[];
  /** The catchment footprint in model x, z (at the table, y = 0). */
  footprint: readonly Point[];
  /** Shows the measured view again. */
  reset(): void;
  /** Turns the model about the measured target: degrees of bearing, and of elevation (kept within 5 to 85). */
  turn(dAzimuth: number, dElevation: number): void;
  dispose(): void;
}

function buildLayerStack(canvas: HTMLCanvasElement, data: LayerStackData): LayerStackScene {
  if (!data.bands) throw new Error("the layer stack draws the elevation bands, and none were read");
  const landcover = bitmapTexture(data.landcover);
  const strata = bitmapTexture(data.bands);
  const { meta, relief: H, catchment, rivers, trend, rain, snow } = data;
  const g = meta.relief;
  // the plinth's base, and the layout (the reference, carried to this land) from the land's own outline and heights
  const lf = landFrame(catchment.ring, data.range);
  const frame = makeFrame(meta.frame, { exag: LAYER_STACK_EXAG, base: lf.base });
  const L = layerStackLayout(
    catchment.ring.map(([E, N]): [number, number] => [frame.x(E), frame.z(N)]),
    frame.y(data.range.max),
    lf.bearing,
    lf.kmScale,
  );
  const sample = makeHeightSampler(H, g);
  const hTex = heightTexture(H, g);
  const aRect = frame.rect(meta.analysis);
  const hRect = frame.rect(g);
  // one warm low light from the left of the view, 28 degrees above the horizon
  const light = lightFrom(L.az + 115, 28, 0.46);

  const stage = createStage(canvas, obsidian.canvas);
  const { scene, lines } = stage;

  // the model, in one group so the land's height scale can follow another view's while it is handed over
  const land = new Group();
  scene.add(land);
  const relief = createRelief(H, g, frame, landcover, aRect, { hTex, light, limits: data.limits });
  land.add(relief.mesh);
  const ring = openRing(smoothRing(catchment.ring, 2)).map(([E, N]): Point => [E, N]);
  const outward = signedArea(ring) > 0 ? -1 : 1;
  const wall = createWall(ring, sample, frame, {
    closed: true,
    outward,
    light,
    limits: data.limits,
  });
  land.add(wall);
  const footprint: Point[] = ring.map(([E, N]) => [frame.x(E), frame.z(N)]);
  const shadow = contactShadow(footprint, { blurPx: 30, alpha: 0.85, pad: 4 });
  scene.add(shadow);
  land.add(
    lines.lines([ring.map(([E, N]) => frame.v(E, N, sample(E, N) + 6))], {
      color: modelColours.catchmentLine,
      opacity: 0.55,
      closed: true,
    }),
  );
  // drainage: Strahler order sets the width; every vertex height is the relief height (+4 m so the line shows)
  for (let order = 1; order <= 5; order++) {
    const reaches = rivers.reaches
      .filter((r) => r.order === order)
      .map((r) => r.pts.map(([E, N, h]) => frame.v(E, N, h + 4)));
    land.add(
      lines.lines(reaches, {
        color: modelColours.drainage[order - 1] ?? modelColours.catchmentLine,
        width: DRAINAGE_WIDTH[order - 1] ?? 1,
      }),
    );
  }

  // the five plates
  const plate = L.plate_xz;
  const xs = plate.map((p) => p[0]);
  const zs = plate.map((p) => p[1]);
  const rasterRect: Rect = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  const ctx = { hTex, grid: g, hRect, aRect, landcover, strata, limits: data.limits };
  const scale = {
    domain: trend.display_scale.domain_per_decade[1],
    neutral: trend.display_scale.neutral_per_decade,
  };
  const shares = SNOW_BANDS.map((b) => snow?.bands[b]?.monthly_mean[SNOW_MONTH] ?? 0);
  const ids = sheetsOf(data);
  const rainRange = rainRangeOf(rain.cells);
  const build: Record<SheetId, (y: number) => Object3D> = {
    trend: (y) =>
      polyMesh(
        trend.cells.map((c) => ({
          c: [0, 2, 4, 6].map((i): Point => [frame.x(c[i] ?? 0), frame.z(c[i + 1] ?? 0)]),
          rgba: trendRgba(c[8], scale),
        })),
        y,
        { renderOrder: 20 },
      ),
    rain: (y) => {
      const group = new Group();
      const polys = rain.cells
        .map((c) => ({
          c: clipConvex(
            c.corners.map(([E, N]): Point => [frame.x(E), frame.z(N)]),
            plate,
          ),
          rgba: [...rainColour(c.window_mm, rainRange), 0.66] as Rgba,
        }))
        .filter((p) => p.c.length >= 3);
      group.add(polyMesh(polys, y, { renderOrder: 20 }));
      group.add(
        lines.lines(
          polys.map((p) => p.c.map(([x, z]): Vec3 => [x, y + 0.005, z])),
          { color: sheetColours.rainEdge, opacity: 0.7, closed: true, renderOrder: 25 },
        ),
      );
      return group;
    },
    snow: (y) => rasterSheet(rasterRect, y, RASTER_MODE.snow, ctx, { shares, renderOrder: 20 }),
    cover: (y) => rasterSheet(rasterRect, y, RASTER_MODE.cover, ctx, { renderOrder: 20 }),
    bands: (y) => rasterSheet(rasterRect, y, RASTER_MODE.bands, ctx, { renderOrder: 20 }),
  };
  const restY = ids.map((_, i) => L.sheet_y_km[i] ?? 0);
  const sheetY = restY.slice();
  const sheetIn = ids.map(() => 1);
  const sheets: { group: Group; mats: { m: Material; a: number }[] }[] = [];
  ids.forEach((id, i) => {
    const y = restY[i] ?? 0;
    const group = new Group();
    sheets.push({ group, mats: [] });
    group.add(sheetPlane(lines, plate, y, { renderOrder: 10 }));
    group.add(build[id](y + 0.004));
    group.add(
      lines.lines([footprint.map(([x, z]): Vec3 => [x, y + 0.01, z])], {
        color: sheetColours.outline,
        opacity: 0.62,
        closed: true,
        renderOrder: 30,
      }),
    );
    scene.add(group);
    const entry = sheets[sheets.length - 1];
    group.traverse((o) => {
      const m = (o as Mesh).material as Material | Material[] | undefined;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
        mat.transparent = true;
        entry?.mats.push({ m: mat, a: mat.opacity });
      }
    });
  });

  // the camera, orthographic, as measured
  const view = (azimuth: number, elevation: number) => {
    stage.setView({
      target: L.target,
      azimuth,
      elevation,
      scale: L.scale_px_per_km,
      design: LAYER_STACK_DESIGN,
    });
    stage.render();
  };

  // ---------- the land taken apart from the overview's ----------
  const lightA = light.dir.clone();
  const reliefU = relief.uniforms as unknown as {
    uL: { value: Vector3 };
    uLight: { value: Vector3 };
    uAmbient: { value: Vector3 };
  };
  // the overview's light colour and ambient (lib/overview/scene/overview: key light x 1.25, ambient x 0.62), so the
  // land is lit as the overview lit it when it is handed over, then as this view lights it
  const keyA = reliefU.uLight.value.clone();
  const ambA = reliefU.uAmbient.value.clone();
  const keyO = hexVec(overviewColours.keyLight).multiplyScalar(1.25);
  const ambO = hexVec(overviewColours.ambient).multiplyScalar(0.62);
  // the overview's own baked light (its cast shadows and occlusion) and land cover, for the first frames, so the
  // land handed over is lit and marked as the overview drew it (lead, 30 Oct 14:48: no shading jump)
  const coverU = relief.uniforms as unknown as {
    uCover: { value: Texture };
    uCoverA: { value: number };
    uLM: { value: Texture };
    uLMA: { value: number };
  };
  coverU.uCover.value = landcover;
  let bakedFor: string | null = null;
  const bakeFor = (from: LandPose) => {
    const key = from.light.join(",");
    if (bakedFor === key) return;
    bakedFor = key;
    // the overview's own bake when it is on this grid (baking again would hold the page for seconds)
    const lm = from.lightMap;
    if (lm && lm.width === g.width && lm.height === g.height) {
      coverU.uLM.value = lm.map;
      return;
    }
    const inside = new Uint8Array(g.width * g.height).fill(1);
    coverU.uLM.value = bakeLight(H, g, inside, new Vector3(...from.light), {
      exag: from.exag,
      base: lf.base,
      soft: 14,
    });
  };
  const wallU = (wall.material as ShaderMaterial).uniforms as unknown as {
    uL: { value: Vector3 };
    uShow: { value: number };
  };
  const shadowMat = shadow.material as Material;
  const shadowA = shadowMat.opacity;
  const topY = frame.y(data.range.max);
  /** The other view's exaggeration over this one's: the land's height scale at the start. */
  let fromScale = 1;
  let start: { key: string; target: Vec3; scale: number; az: number; el: number } | null = null;
  // the overview's points that fit its land on screen: the rim at the surface and its foot (its exaggeration)
  const rimPts = (k: number): Vec3[] =>
    ring
      .filter((_, i) => i % 4 === 0)
      .flatMap(([E, N]) => {
        const s = sample(E, N);
        return [frame.v(E, N, s), frame.v(E, N, s - lf.rimFoot)].map(([x, y, z]): Vec3 => [
          x,
          y * k,
          z,
        ]);
      });
  /** This view's camera fitted so the land fills the box the overview left it in (canvas CSS px). */
  const fitStart = (from: LandPose, rect: LandPose["rect"]) => {
    const key = `${rect.x0.toFixed(1)},${rect.y0.toFixed(1)},${rect.x1.toFixed(1)},${rect.y1.toFixed(1)}`;
    if (start?.key === key) return start;
    const k = from.exag / LAYER_STACK_EXAG;
    const pts = rimPts(k);
    let target: Vec3 = [0, frame.y(lf.target) * k, 0];
    let s = L.scale_px_per_km;
    const right = new Vector3();
    const up = new Vector3();
    for (let it = 0; it < 6; it++) {
      stage.setView({
        target,
        azimuth: from.azimuth,
        elevation: from.elevation,
        scale: s,
        design: LAYER_STACK_DESIGN,
      });
      const q = pts.map((p) => stage.project(p));
      const bx0 = Math.min(...q.map((p) => p.x));
      const bx1 = Math.max(...q.map((p) => p.x));
      const by0 = Math.min(...q.map((p) => p.y));
      const by1 = Math.max(...q.map((p) => p.y));
      s *= (rect.y1 - rect.y0) / Math.max(by1 - by0, 1e-3);
      // CSS px per km now, from the projection itself
      const o = stage.project(target);
      stage.camera.updateMatrixWorld();
      right.setFromMatrixColumn(stage.camera.matrixWorld, 0);
      up.setFromMatrixColumn(stage.camera.matrixWorld, 1);
      const r1 = stage.project([target[0] + right.x, target[1] + right.y, target[2] + right.z]);
      const ppk = Math.hypot(r1.x - o.x, r1.y - o.y) || 1;
      const dx = (rect.x0 + rect.x1) / 2 - (bx0 + bx1) / 2;
      const dy = (rect.y0 + rect.y1) / 2 - (by0 + by1) / 2;
      target = [
        target[0] - (right.x * dx - up.x * dy) / ppk,
        target[1] - (right.y * dx - up.y * dy) / ppk,
        target[2] - (right.z * dx - up.z * dy) / ppk,
      ];
    }
    start = { key, target, scale: s, az: from.azimuth, el: from.elevation };
    return start;
  };
  const setIntro = (k: number, from: LandPose) => {
    const canvasBox = canvas.getBoundingClientRect();
    const rect = {
      x0: from.rect.x0 - canvasBox.left,
      y0: from.rect.y0 - canvasBox.top,
      x1: from.rect.x1 - canvasBox.left,
      y1: from.rect.y1 - canvasBox.top,
    };
    fromScale = from.exag / LAYER_STACK_EXAG;
    const S = fitStart(from, rect);
    const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (6 * x - 15) + 10));
    const clamp = (x: number) => Math.min(1, Math.max(0, x));
    const c = ease(clamp(k / 0.55));
    const hk = ease(clamp(k / 0.45));
    // the camera: bearing the short way round, elevation, scale in log space, target in a line
    const dAz = ((L.az - S.az + 540) % 360) - 180;
    stage.setView({
      target: [0, 1, 2].map(
        (i) => (S.target[i] ?? 0) + ((L.target[i] ?? 0) - (S.target[i] ?? 0)) * c,
      ) as Vec3,
      azimuth: S.az + dAz * c,
      elevation: S.el + (L.el - S.el) * c,
      scale: Math.exp(Math.log(S.scale) + (Math.log(L.scale_px_per_km) - Math.log(S.scale)) * c),
      design: LAYER_STACK_DESIGN,
    });
    // the land's height scale settles from the other view's to this one's; its light turns to this view's
    const hs = fromScale + (1 - fromScale) * hk;
    land.scale.y = hs;
    const l = new Vector3(...from.light).lerp(lightA, c).normalize();
    reliefU.uL.value.copy(l);
    reliefU.uLight.value.copy(keyO).lerp(keyA, c);
    reliefU.uAmbient.value.copy(ambO).lerp(ambA, c);
    bakeFor(from);
    coverU.uLMA.value = 1 - c;
    coverU.uCoverA.value = 0.82 * (1 - c);
    wallU.uL.value.copy(l);
    shadowMat.opacity = shadowA * c;
    // the plinth's wall comes up out of the ground as the camera moves (the overview's land has none so deep)
    wallU.uShow.value = c;
    // the sheets peel up one by one from the land's top, the first (the top sheet) first
    const top = topY * hs;
    sheets.forEach((sh, i) => {
      const p = ease(clamp((k - 0.18 - 0.11 * i) / 0.38));
      sheetIn[i] = p;
      const y = restY[i] ?? 0;
      sheetY[i] = top + (y - top) * p;
      sh.group.position.y = sheetY[i] - y;
      sh.group.visible = p > 0.001;
      const a = Math.min(1, p * 4);
      for (const { m, a: a0 } of sh.mats) m.opacity = a0 * a;
    });
    stage.render();
  };
  const reset = () => {
    view(L.az, L.el);
  };
  reset();

  return {
    stage,
    sheets: ids,
    sheetY,
    sheetIn,
    setIntro,
    plate,
    footprint,
    reset,
    turn(dAzimuth, dElevation) {
      const a = stage.angles();
      view(a.azimuth + dAzimuth, Math.min(85, Math.max(5, a.elevation + dElevation)));
    },
    dispose() {
      stage.dispose();
      for (const t of [hTex, landcover, strata]) t.dispose();
    },
  };
}

/** Builds the scene on the next tick; a failure to build rejects. */
export function mountLayerStack(
  canvas: HTMLCanvasElement,
  data: LayerStackData,
): Promise<LayerStackScene> {
  return Promise.resolve().then(() => buildLayerStack(canvas, data));
}
