// Overview 3D scene orchestrator: mounts the catchment relief, boundary wall, survey plan,
// footprint sheets, elevated evidence layers, instanced Sentinel-2 pixel cells, draped walking routes,
// recorded-life bio-markers, secondary dial arc overlay, depth-of-field blur, and layout projector.

import { makeFrame, makeHeightSampler } from "../../instruments/valley/frame";
import { createStage } from "../../instruments/valley/scene/stage";
import { heightTexture } from "../../instruments/valley/scene/textures";
import { extentKm, landFrame } from "../../land/geometry";
import type { LandPose } from "../../land/handoff";
import { overviewColours as C, timeColours as TC } from "../../theme/obsidian";
import { clamp01, ease, lerp, spanAt, sstep } from "../arc";
import type { OverviewData } from "../data";
import type { FindingId } from "../findings";
import {
  createLandProbe,
  createLifeRig,
  createRiverLines,
  createRoutesRig,
  type Gaps,
  type LandProbe,
  measureLandGaps,
  ROUTE_QUIET,
} from "./overview-features";
import {
  awayOf,
  bbox,
  contourSteps,
  createProjectionRig,
  EXAG,
  type FindingPlace,
  FOV,
  OVERVIEW_DESIGN,
  type OverviewLayout,
  type Point,
  reliefExaggeration,
  type SceneState,
  type Selection,
  sideOf,
  SURVEY_ACCENT,
} from "./overview-projection";
import { createArcOverlay, hexVec } from "./overview-shaders";
import {
  coverTexture,
  createDepthOfField,
  createFootprintSheets,
  createLiftRig,
  createOverlayController,
  createPixelCellsRig,
  type LiftId,
} from "./overview-sheets";
import {
  bakeLight,
  createOccluder,
  createRelief,
  createSurveyPlan,
  createWall,
  lightDir,
  maskOnRelief,
  signedArea,
  smoothRing,
  waterTexture,
} from "./terrain";
import { makeMeshHeightSampler } from "./terrain-mesh";

export {
  awayOf,
  contourSteps,
  EXAG,
  type FindingPlace,
  type Gaps,
  type LandProbe,
  type LiftId,
  OVERVIEW_DESIGN,
  type OverviewLayout,
  type Point,
  reliefExaggeration,
  ROUTE_QUIET,
  type SceneState,
  type Selection,
  sideOf,
};

export interface OverviewScene {
  render(state: SceneState): void;
  /** The land under a point of the land canvas (CSS px from its top left), or null where the ray meets no land. */
  probe(x: number, y: number): LandProbe | null;
  /** The relief grid an overlay is painted on: its size in canvas px and a UTM point's place on it. */
  overlayGrid(): { width: number; height: number; px: (E: number, N: number) => [number, number] };
  /**
   * Recorded life occurrences (zone metres and group tone) rendered as 3D terrain-draped markers;
   * passing null clears the layer.
   */
  setLife(points: readonly { e: number; n: number; tone: string }[] | null): void;
  /** Current screen bounding box, camera orientation, and baked lighting for view handoff. */
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

export function mountOverview(
  canvases: CanvasSet,
  data: OverviewData,
  findings: readonly { id: FindingId; clock: number }[],
  bandLimitM: number | null,
): OverviewScene {
  const design = OVERVIEW_DESIGN;
  const stage = createStage(canvases.land, C.fog, { fov: FOV, alpha: true });
  const { scene, camera } = stage;

  // ---------- terrain, boundary wall, survey plan, and drainage ----------
  const lf = landFrame(data.ring, data.range);
  const BASE = lf.base;
  const az0 = lf.bearing;
  const g = data.meta.relief;
  const a = data.meta.analysis;
  const H = data.relief;
  const reliefM = Math.max(1, data.range.max - data.range.min);
  const exag = reliefExaggeration(reliefM, extentKm(data.ring));
  const frame = makeFrame(data.meta.frame, { exag, base: BASE });
  const sample = makeHeightSampler(H, g);
  const meshHeight = makeMeshHeightSampler(H, g);
  const hTex = heightTexture(H, g);
  const lcTex = coverTexture(data.landcover);
  const cv = new OffscreenCanvas(data.landcover.width, data.landcover.height);
  const c2 = cv.getContext("2d", { willReadFrequently: true });
  if (!c2) throw new Error("No 2D context for the land cover raster");
  c2.drawImage(data.landcover, 0, 0);
  const lcPx = c2.getImageData(0, 0, data.landcover.width, data.landcover.height).data;
  const M30 = maskOnRelief(lcPx, a, g);

  const light = {
    dir: lightDir(az0 + 45, 32),
    color: hexVec(C.keyLight).multiplyScalar(1.25),
    ambient: hexVec(C.ambient).multiplyScalar(0.62),
    sky: hexVec(C.sky),
  };
  const lightMap = bakeLight(H, g, M30, light.dir, { exag, base: BASE, soft: 14 });
  const waterTex = data.water ? waterTexture(data.water, g) : null;
  const trueColourTex = data.trueColour ? coverTexture(data.trueColour) : null;
  const relief = createRelief(H, g, frame, lcTex, frame.rect(a), {
    hTex,
    light,
    lightMap,
    ...(waterTex ? { water: waterTex } : {}),
    ...(trueColourTex ? { trueColour: trueColourTex } : {}),
    cellM: g.res,
    contourStep: contourSteps(reliefM),
    colours: {
      albedo: C.reliefAlbedo,
      line: C.contour,
      treeC: C.coverTree,
      cropC: C.coverCrop,
      limitC: C.bandLimit,
      fogC: C.fog,
      rimC: C.rim,
      waterC: C.drainage[0],
      scanC: SURVEY_ACCENT,
    },
    coverA: 0.82,
    rimA: 0.22,
    smooth: 0.55,
  });
  scene.add(relief.mesh);
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
    accent: SURVEY_ACCENT,
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

  const riverLines = createRiverLines(scene, stage.lines, data, frame);

  // ---------- sheets, lifted layers, pixel cells, routes, and recorded life ----------
  const { slopeTex, rainTex } = createFootprintSheets(data, g);
  const liftRig = createLiftRig(
    scene,
    stage.lines,
    data,
    g,
    a,
    frame,
    sample,
    relief,
    lcTex,
    slopeTex,
    rainTex,
    lf.kmScale,
  );
  const pixelRig = createPixelCellsRig(scene, stage.lines, data, frame, sample);
  const routesRig = createRoutesRig(scene, data, frame, sample, meshHeight);
  const lifeRig = createLifeRig(scene, () => stage.size(), frame, meshHeight, lf.kmScale);
  const overlayCtrl = createOverlayController();

  // ---------- camera rig, arc overlay, depth of field, and probe ----------
  const proj = createProjectionRig({
    stage,
    camera,
    lf,
    frame,
    g,
    H,
    M30,
    sample,
    rim,
    findings,
    bandLimitM,
    pixelCentre: data.pixel?.centre,
    pixelPts: pixelRig.pixelPts,
    RC: routesRig.RC,
    routeProbe: routesRig.routeProbe,
    routeEnds: routesRig.routeEnds,
    routeStart: routesRig.routeStart,
    exag,
  });

  const arcOverlay = createArcOverlay(canvases.arc, createOccluder(relief));
  const depthOfField = createDepthOfField(
    canvases,
    () => stage.size(),
    () => proj.getFit().scale,
  );
  const probe = createLandProbe(
    canvases.land,
    camera,
    scene,
    data,
    frame,
    g,
    a,
    M30,
    lcPx,
    sample,
    lf.ceiling,
    FOV,
  );

  // ---------- render synchronisation and layout emission ----------
  let state: SceneState = { s: 0, h: 0, k: 0, o: 0, r: 0, sel: null };
  const listeners: ((l: OverviewLayout) => void)[] = [];
  let gapWaiters: ((g: Gaps) => void)[] = [];
  let drawn = { w: 0, h: 0, bw: 0, bh: 0 };

  const sync = () => {
    const { width, height } = stage.size();
    if (drawn.w !== width || drawn.h !== height) {
      arcOverlay.setSize(width, height);
      routesRig.setResolution(width, height);
      lifeRig.setResolution(width, height);
    }
    const glc = canvases.land;
    if (drawn.bw !== glc.width || drawn.bh !== glc.height) {
      canvases.blur.width = glc.width;
      canvases.blur.height = glc.height;
    }
    drawn = { w: width, h: height, bw: glc.width, bh: glc.height };
  };

  stage.onRender(() => {
    proj.updateFit();
    sync();
    const fit = proj.getFit();
    const { e, view, selClock } = proj.getCurrent();
    proj.placeDial(e, view.distance, selClock, sideOf(state.sel, selClock) === "left");
    const drawnSpan = spanAt(state.s, state.k, state.o, selClock);
    const span = { ...drawnSpan, end: drawnSpan.end * (state.arcDraw ?? 1) };
    arcOverlay.buildDial(span, proj.dialAt, proj.getRoll());
    arcOverlay.render(camera);

    const target = state.sel ? proj.viewFor(state.sel).target : proj.view0.target;
    const focus = fit.oy + proj.project(target).y * fit.scale;
    if (state.sel === "routes" && routesRig.routeProbe.length) {
      const b = bbox(routesRig.routeProbe.map(proj.project));
      depthOfField(e, fit.oy + (b.y0 - 28) * fit.scale, fit.oy + (b.y1 + 28) * fit.scale);
    } else if (state.sel === "pixel" || state.sel === "field") {
      depthOfField(e, focus - 70, focus + 56);
    } else {
      depthOfField(0, 0, 0);
    }

    if (gapWaiters.length) {
      const { arcPts, arcA } = arcOverlay.getArcPoints();
      const gaps = measureLandGaps(
        canvases.land,
        () => stage.size(),
        fit,
        design,
        arcPts,
        arcA,
        proj.project,
      );
      for (const w of gapWaiters) w(gaps);
      gapWaiters = [];
    }

    const liftAt = liftRig.anchor(proj.rimTop, proj.project);
    const lifeData = lifeRig.projectLayout(state, proj.project, proj.occluded);
    const layout = proj.buildLayout(state, span, liftAt, lifeData);
    for (const l of listeners) l(layout);
  });

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
      const { e, v1, view, rise, splitK, exitK, carveShaderK, carveK } =
        proj.solveCameraFrame(next);
      pixelRig.paintCells(next.cellPaint ?? "rgb");
      pixelRig.placeCells(splitK);
      scene.scale.y = carveK;
      relief.uniforms.uCarve.value = carveShaderK;
      surveyPlan.uniforms.uCarve.value = carveShaderK;
      scene.updateMatrixWorld();

      const fogAt =
        rise < 1 || exitK > 0 || splitK > 0
          ? view.distance / (proj.view0.distance * (next.zoom ?? 1))
          : 1;
      relief.uniforms.uFog.value.set(
        lerp(proj.view0.distance - 8, v1.distance - 4, e) * fogAt,
        lerp(proj.view0.distance + 34, v1.distance + 40, e) * fogAt,
        lerp(0.32, 0.42, e),
      );

      const dim = (1 - 0.15 * ease(next.o)) * sstep(0, 0.18, rise);
      relief.uniforms.uDim.value = dim;
      wall.uniforms.uDim.value = dim;
      surveyPlan.uniforms.uDim.value = dim;

      routesRig.update(camera, proj.project, next.r, next.sel, next.route, e, dim);

      const { liftA } = liftRig.update(next.lift);
      relief.uniforms.uDim.value *= 1 - 0.15 * liftA;
      wall.uniforms.uDim.value *= 1 - 0.15 * liftA;
      surveyPlan.uniforms.uDim.value *= 1 - 0.15 * liftA;

      const fp = next.sel === "fdr" ? slopeTex : next.sel === "rain" ? rainTex : null;
      if (fp) relief.uniforms.uOver.value = fp;
      const tOv = next.sel === "time" && next.overlay ? overlayCtrl.overlayOf(next.overlay) : null;
      if (tOv) relief.uniforms.uOver.value = tOv;
      relief.uniforms.uOverA.value = fp ? 0.92 * e : tOv ? 0.96 * e : 0;

      const snow = next.sel === "time" ? (next.snow ?? null) : null;
      relief.uniforms.uSnowA.value = snow ? e : 0;
      if (snow) {
        relief.uniforms.uSnowLimits.value.set(snow.limits[0], snow.limits[1]);
        relief.uniforms.uSnow.value.set(snow.shares[0], snow.shares[1], snow.shares[2]);
      }

      const scanA = next.scan ? Math.max(0, Math.min(1, next.scan.a)) : 0;
      relief.uniforms.uScanA.value = scanA;
      surveyPlan.uniforms.uScanA.value = scanA;
      if (next.scan) {
        relief.uniforms.uScanH.value = next.scan.height;
        surveyPlan.uniforms.uScanH.value = next.scan.height;
      }

      relief.uniforms.uBandAt.value = bandLimitM ?? 0;
      relief.uniforms.uBandA.value = next.sel === "band" && bandLimitM !== null ? 0.9 * e : 0;

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

      arcOverlay.dialMat.opacity = 1 - awayOf(next);
      if (next.sel === "package" || next.sel === "time") arcOverlay.dialMat.opacity *= 1 - e;
      if (next.quiet) arcOverlay.dialMat.opacity = 0;

      lifeRig.update(next, dim);

      if (pixelRig.pixelLine) {
        const on = next.sel === "pixel" || next.sel === "field";
        pixelRig.pixelLine.material.opacity = on ? Math.min(0.999, clamp01((e - 0.55) / 0.45)) : 0;
        pixelRig.pixelLine.visible = on && e > 0.55;
      }

      surveyPlan.mesh.visible = gapWaiters.length === 0;
      stage.render();
    },
    setLife: lifeRig.setLife,
    onLayout(f) {
      listeners.push(f);
    },
    handoff() {
      const b = proj.landBox();
      const fit = proj.getFit();
      const { view } = proj.getCurrent();
      return {
        rect: {
          x0: fit.ox + b.x0 * fit.scale,
          y0: fit.oy + b.y0 * fit.scale,
          x1: fit.ox + b.x1 * fit.scale,
          y1: fit.oy + b.y1 * fit.scale,
        },
        azimuth: view.azimuth,
        elevation: view.elevation,
        light: [light.dir.x, light.dir.y, light.dir.z] as const,
        exag,
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
      arcOverlay.dispose();
      surveyPlan.mesh.geometry.dispose();
      surveyPlan.mesh.material.dispose();
      routesRig.dispose();
      lifeRig.dispose();
      slopeTex?.dispose();
      rainTex?.dispose();
      liftRig.dispose();
      pixelRig.dispose();
      stage.dispose();
      for (const t of [hTex, lcTex, lightMap]) t.dispose();
      waterTex?.dispose();
      trueColourTex?.dispose();
      data.landcover.close();
      data.trueColour?.close();
    },
  };
}
