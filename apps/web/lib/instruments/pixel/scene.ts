// Pixel anatomy scene orchestrator: mounts the six steps (01 Where It Is, 02 What Covers It, 03 How Covers
// Reflect, 04 How It Changed, 05 How Covers Mix, 06 What to Check) on a 1440 x 900 stage, either all at once on the
// page or in place around the risen pixel as one ordered list that opens one step at a time.

import { instrumentPalette, type InstrumentPalette } from "../../theme/instruments";
import type { PlacedStatements } from "../placed-statements";
import type { PixelData } from "./data";
import type { Shares } from "./mix";
import type { CellPaint } from "./paint";
import { pixelStatement } from "./statement";
import {
  renderCaption,
  renderCellsBuffers,
  renderConnectors,
  renderLocateBuffer,
  renderSeriesPanel,
  renderSpectraPanel,
} from "./scene-buffers";
import { createAroundController, createModelController, renderFieldPanel } from "./scene-picking";
import {
  AROUND,
  createSceneDom,
  L,
  locatorGrid,
  MULT_W,
  PIXEL_DESIGN,
  type PixelAnchors,
  type PixelAround,
  type PixelClasses,
  type PixelLocator,
  type Pt,
  type StageBox,
} from "./scene-shaders";

export {
  AROUND,
  locatorGrid,
  PIXEL_DESIGN,
  type PixelAnchors,
  type PixelAround,
  type PixelClasses,
  type PixelLocator,
  type StageBox,
};

export interface PixelScene {
  /** Updates the pixel's current screen bounding box and 3D-projected anchor outlines for card leaders. */
  setPixelBox(box: StageBox | null, anchors?: PixelAnchors | null): void;
  /** Updates the active cell paint mode (`rgb`, `ndvi`, or `class`) in in-place mode. */
  setPaint(paint: CellPaint): void;
  /** Sets class shares (by WorldCover code) and redraws the linear spectral mixture model. */
  setShares(next: Shares): void;
  shares(): Shares;
  /** Resets class shares to the measured pixel composition. */
  reset(): void;
  dispose(): void;
}

export function mountPixel(
  stage: HTMLElement,
  d: PixelData,
  statements: PlacedStatements,
  locator: PixelLocator,
  cls: PixelClasses,
  around: PixelAround | null = null,
  /** The pixel's question as the case record states it, or the catalog's default question when absent. */
  question: string | null = null,
  /** The colours in the app's theme. */
  pal: InstrumentPalette = instrumentPalette("obsidian"),
): PixelScene {
  const dom = createSceneDom(stage, cls, around, pal);
  const cellPx = Math.min(L.cellPx, MULT_W / Math.max(d.grid.rows, d.grid.cols));
  const toGrid = ([x, y]: readonly [number, number]): Pt => [
    ((x - d.grid.origin_x) / 10) * cellPx,
    ((d.grid.origin_y - y) / 10) * cellPx,
  ];

  // the statement in plain words from the pixel's own data, the trend's season as the trend cells state it
  renderCaption(dom, pixelStatement(d, locator.window), around, question);
  const ring = renderLocateBuffer(dom, d, locator);
  const { fp, multiples, repaint } = renderCellsBuffers(dom, d, around, cellPx, toGrid);
  const spectra = renderSpectraPanel(dom, d, around);
  renderSeriesPanel(dom, d, locator);

  const transectEnd = renderFieldPanel(dom, d, statements, around, multiples, toGrid);
  const modelCtrl = createModelController(dom, d, around, (refl, ndvi) => {
    spectra.draw(refl, ndvi);
  });
  renderConnectors(dom, around, multiples, fp, ring, transectEnd);

  stage.appendChild(dom.overlay);
  modelCtrl.draw();
  const aroundCtrl = createAroundController(dom, stage, around);

  return {
    setPixelBox: (box, anchors) => {
      aroundCtrl.setPixelBox(box, anchors);
    },
    setPaint: (paint) => {
      aroundCtrl.setPaint(paint);
      repaint?.(paint);
    },
    setShares: (shares) => {
      modelCtrl.setShares(shares);
    },
    shares: () => modelCtrl.shares(),
    reset: () => {
      modelCtrl.reset();
    },
    dispose() {
      stage.replaceChildren();
    },
  };
}
