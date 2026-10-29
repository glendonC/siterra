// The five layers over the valley (approved specimen A): the catchment as a physical model (30 m relief cut along
// the frozen boundary with a section wall, one warm low light, contours every 250 m, drainage from the same DEM)
// under five plates, one dataset each, stacked straight up. The camera, the gaps and the plate come from the
// fixture layout-a.json, measured before rendering so that no layer's content hides another's.

import { Group, type Object3D } from "three";
import { modelColours, obsidian, sheetColours } from "../../../theme/obsidian";
import { smoothRing } from "../../../stage/smooth";
import type { LayerStackData } from "../fixtures";
import { makeFrame, makeHeightSampler, type Rect, type Vec3 } from "../frame";
import { clipConvex, openRing, signedArea, type Point } from "../geometry";
import { rainColour, trendRgba, type Rgba } from "../palette";
import { RASTER_MODE, polyMesh, rasterSheet, sheetPlane } from "./sheets";
import { createStage, type Stage } from "./stage";
import { contactShadow, createRelief, createWall, lightFrom } from "./terrain";
import { heightTexture, loadDataTexture } from "./textures";

/** Vertical exaggeration of the model; the view states it. */
export const LAYER_STACK_EXAG = 1.5;
/** Plinth base elevation (m), below the catchment's lowest point of 1,465 m. */
const BASE = 1200;
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

export interface LayerStackScene {
  stage: Stage;
  /** Each sheet's height in the model, in the order of SHEETS. */
  sheetY: readonly number[];
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

export async function mountLayerStack(
  canvas: HTMLCanvasElement,
  data: LayerStackData,
  base: string,
  signal?: AbortSignal,
): Promise<LayerStackScene> {
  const [landcover, strata] = await Promise.all([
    loadDataTexture(`${base}landcover-10m.png`, signal),
    loadDataTexture(`${base}strata-10m.png`, signal),
  ]);
  const { meta, relief: H, catchment, rivers, trend, rain, snow, layout: L } = data;
  const g = meta.relief;
  const frame = makeFrame(meta.frame, { exag: LAYER_STACK_EXAG, base: BASE });
  const sample = makeHeightSampler(H, g);
  const hTex = heightTexture(H, g);
  const aRect = frame.rect(meta.analysis);
  const hRect = frame.rect(g);
  // one warm low light from the left of the view, 28 degrees above the horizon
  const light = lightFrom(L.az + 115, 28, 0.46);

  const stage = createStage(canvas, obsidian.canvas);
  const { scene, lines } = stage;

  // the model
  scene.add(createRelief(H, g, frame, landcover, aRect, { hTex, light }).mesh);
  const ring = openRing(smoothRing(catchment.ring, 2)).map(([E, N]): Point => [E, N]);
  const outward = signedArea(ring) > 0 ? -1 : 1;
  scene.add(createWall(ring, sample, frame, { closed: true, outward, light }));
  const footprint: Point[] = ring.map(([E, N]) => [frame.x(E), frame.z(N)]);
  scene.add(contactShadow(footprint, { blurPx: 30, alpha: 0.85, pad: 4 }));
  scene.add(
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
    scene.add(
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
  const ctx = { hTex, grid: g, hRect, aRect, landcover, strata };
  const scale = {
    domain: trend.display_scale.domain_per_decade[1],
    neutral: trend.display_scale.neutral_per_decade,
  };
  const shares = SNOW_BANDS.map((b) => snow.bands[b]?.monthly_mean[SNOW_MONTH] ?? 0);
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
          rgba: [...rainColour(c.sep_may_mm), 0.66] as Rgba,
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
  const sheetY = SHEETS.map((_, i) => L.sheet_y_km[i] ?? 0);
  SHEETS.forEach((id, i) => {
    const y = sheetY[i] ?? 0;
    const group = new Group();
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
  const reset = () => {
    view(L.az, L.el);
  };
  reset();

  return {
    stage,
    sheetY,
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
