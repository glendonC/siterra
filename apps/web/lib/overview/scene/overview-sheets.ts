// Layer sheet rendering and surface overlays for the overview scene: footprint canvases (`trend` slope
// and `rain` CHIRPS tiles), elevated evidence layers (`bands`, `trend`, `rain`, `cover`), Sentinel-2
// instanced pixel cells, dynamic temporal canvas overlay, and depth-of-field canvas blur.

import {
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  MeshBasicMaterial,
  NoColorSpace,
  PlaneGeometry,
  type Scene,
  Texture,
} from "three";
import { cellColour, type CellPaint } from "../../instruments/pixel/paint";
import type { Frame, Grid, Vec3 } from "../../instruments/valley/frame";
import type { Stage } from "../../instruments/valley/scene/stage";
import { liftColours as LC, maskAt, overviewColours as C } from "../../theme/obsidian";
import { clamp01, ease, sstep } from "../arc";
import type { OverviewData } from "../data";
import { slopeColour } from "../footprint";
import { createLift, type LiftLayer } from "./lift";
import { hexVec } from "./overview-shaders";
import type { Relief } from "./terrain";
import { smoothRing } from "./terrain-mesh";

/** Vertical rise (model km) of the Sentinel-2 cells above the terrain when the pixel is inspected. */
export const CELL_RISE = 0.22;

/** The layers the overview can lift: trend cells, CHIRPS rainfall cells, land cover, or elevation bands. */
export type LiftId = "trend" | "rain" | "cover" | "bands";

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Wraps an ImageBitmap raster as a linear mipmapped texture without colour-space conversion. */
export function coverTexture(bmp: ImageBitmap): Texture {
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

const traceRing = (ctx: CanvasRenderingContext2D, pts: [number, number][]) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
};

/** Paints a 2D canvas over the relief grid (row 0 north) at 2x resolution and returns a CanvasTexture. */
export function paintGridSheet(
  g: Grid,
  draw: (ctx: CanvasRenderingContext2D, px: (E: number, N: number) => [number, number]) => void,
): CanvasTexture | null {
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
}

/** Builds the `trend` (NDVI slope) and `rain` (CHIRPS cell share) footprint textures over the relief grid. */
export function createFootprintSheets(data: OverviewData, g: Grid) {
  const slopeData = data.footprints.slope;
  const slopeTex = slopeData
    ? paintGridSheet(g, (ctx, px) => {
        for (const c of slopeData.cells) {
          traceRing(
            ctx,
            c.corners.map(([E, N]) => px(E, N)),
          );
          ctx.fillStyle = slopeColour(c.slope, slopeData.domain, slopeData.neutral);
          ctx.fill();
        }
      })
    : null;

  // CHIRPS rainfall cells rendered as inset tiles shaded by their share inside the catchment so the
  // gaps between tiles mark the grid without introducing lines that could be confused with drainage.
  const rainData = data.footprints.rain;
  const rainTex = rainData
    ? paintGridSheet(g, (ctx, px) => {
        for (const c of rainData) {
          const pts = c.ring.slice(0, -1);
          const cx = pts.reduce((a, [E]) => a + E, 0) / pts.length;
          const cy = pts.reduce((a, [, N]) => a + N, 0) / pts.length;
          traceRing(
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

  return { slopeTex, rainTex };
}

/** Creates the lifted evidence layer mesh (`trend`, `rain`, `cover`, `bands`) and its accompanying rim outline. */
export function createLiftRig(
  scene: Scene,
  stageLines: Stage["lines"],
  data: OverviewData,
  g: Grid,
  a: Grid,
  frame: Frame,
  sample: (E: number, N: number) => number,
  relief: Relief,
  lcTex: Texture,
  slopeTex: CanvasTexture | null,
  rainTex: CanvasTexture | null,
  kmScale: number,
) {
  const liftKm = 3.2 * kmScale;
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

  const liftEdge = new Group();
  const liftEdgeLine = stageLines.lines(
    [smoothRing(data.ring, 2).map(([E, N]) => frame.v(E, N, sample(E, N) + 5))],
    { color: C.catchmentLine, width: 1, opacity: 0, closed: true },
  );
  liftEdgeLine.renderOrder = 41;
  liftEdge.add(liftEdgeLine);
  scene.add(liftEdge);

  let liftHeight = 0;

  return {
    update(nextLift: { layer: LiftId; k: number } | null | undefined) {
      const lk = nextLift ? ease(clamp01(nextLift.k)) : 0;
      liftHeight = liftKm * lk;
      const liftA = sstep(0, 0.35, nextLift?.k ?? 0);
      lift.show(nextLift ? (liftLayers[nextLift.layer] ?? null) : null, liftHeight, 0.55 * liftA);
      liftEdge.position.y = liftHeight;
      liftEdgeLine.material.opacity = 0.7 * liftA;
      liftEdgeLine.visible = liftA > 0.002;
      return { liftA, liftHeight };
    },
    anchor(rimTop: readonly Vec3[], project: (p: Vec3) => ScreenPoint): ScreenPoint | null {
      if (liftHeight <= 0.01) return null;
      return rimTop
        .map((p) => project([p[0], p[1] + liftHeight, p[2]]))
        .reduce((b, q) => (q.x > b.x ? q : b));
    },
    dispose() {
      bandsTex?.dispose();
      lift.dispose();
    },
  };
}

/** Creates the instanced Sentinel-2 10 m cell mesh and MODIS pixel footprint outline on the terrain. */
export function createPixelCellsRig(
  scene: Scene,
  stageLines: Stage["lines"],
  data: OverviewData,
  frame: Frame,
  sample: (E: number, N: number) => number,
) {
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
  const cellDelay = pxCells.map((_, i) => (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1);

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
  const placeCells = (k: number) => {
    const on = pxCells.length > 0 && k > 0.33;
    cellMesh.visible = on;
    if (!on) return;
    cellMat.opacity = sstep(0.33, 0.45, k);
    cellBase.forEach((b, i) => {
      const r = ease(clamp01((k - 0.45 - 0.22 * (cellDelay[i] ?? 0)) / 0.3));
      cellM4.makeTranslation(b[0], b[1] + CELL_RISE * r, b[2]);
      cellMesh.setMatrixAt(i, cellM4);
    });
    cellMesh.instanceMatrix.needsUpdate = true;
  };

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
    ? stageLines.lines([pixelPts], {
        color: C.footprint,
        width: 1.5,
        opacity: 0.999,
        closed: true,
        renderOrder: 4,
      })
    : null;
  if (pixelLine) scene.add(pixelLine);

  return {
    pixelPts,
    pixelLine,
    paintCells,
    placeCells,
    dispose() {
      cellGeo.dispose();
      cellMat.dispose();
    },
  };
}

/** Manages the versioned CanvasTexture used by the temporal ("time") overlay mode. */
export function createOverlayController() {
  let overlayTex: { canvas: HTMLCanvasElement; tex: CanvasTexture; version: number } | null = null;
  return {
    overlayOf(o: { canvas: HTMLCanvasElement; version: number }): CanvasTexture {
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
    },
  };
}

/** Renders a depth-of-field blur pass over the land canvas outside the active vertical focus band. */
export function createDepthOfField(
  canvases: { land: HTMLCanvasElement; blur: HTMLCanvasElement },
  stageSize: () => { width: number; height: number },
  getScale: () => number,
) {
  const bctx = canvases.blur.getContext("2d");
  return (e: number, top: number, bottom: number) => {
    const glc = canvases.land;
    if (e <= 0.001 || !bctx) {
      canvases.blur.style.opacity = "0";
      glc.style.maskImage = "none";
      return;
    }
    const ramp = 150;
    const H2 = stageSize().height;
    const pc = (y: number) => `${((Math.max(0, Math.min(H2, y)) / H2) * 100).toFixed(2)}%`;
    bctx.clearRect(0, 0, canvases.blur.width, canvases.blur.height);
    bctx.filter = `blur(${(6 * e * getScale() * window.devicePixelRatio).toFixed(2)}px)`;
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
}
