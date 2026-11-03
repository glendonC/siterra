// Pixel anatomy scene orchestrator: mounts the six analytical panels (01 Locate, 02 Pixel Cells,
// 03 Class Spectra, 04 Season Record, 05 Linear Mix Model, 06 Field Check) on a 1440 x 900 stage in
// either standalone full-page mode or in-place card mode around the 3D terrain pixel.

import type { InstrumentCaption } from "@siterra/contracts";
import type { PlacedStatements } from "../placed-statements";
import type { PixelData } from "./data";
import type { Shares } from "./mix";
import type { CellPaint } from "./paint";
import {
  renderCaption,
  renderCellsBuffers,
  renderConnectors,
  renderLocateBuffer,
  renderSeriesPanel,
  renderSpectraPanel,
} from "./scene-buffers";
import {
  createAroundController,
  createModelController,
  renderFieldPanel,
} from "./scene-picking";
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
  /** The pixel anatomy spec's caption, as the case records carry it. */
  caption: InstrumentCaption,
  statements: PlacedStatements,
  locator: PixelLocator,
  cls: PixelClasses,
  around: PixelAround | null = null,
  /**
   * The caption's two source notes from the case record: what its first citation and its model citation
   * measure, falling back to the catalog's default notes when the record states none.
   */
  tips: readonly [string | null, string | null] = [null, null],
  /** The pixel's question as the case record states it, or the catalog's default question when absent. */
  question: string | null = null,
): PixelScene {
  const dom = createSceneDom(stage, cls, around);
  const cellPx = Math.min(L.cellPx, MULT_W / Math.max(d.grid.rows, d.grid.cols));
  const toGrid = ([x, y]: readonly [number, number]): Pt => [
    ((x - d.grid.origin_x) / 10) * cellPx,
    ((d.grid.origin_y - y) / 10) * cellPx,
  ];

  renderCaption(dom, caption, around, tips, question);
  const ring = renderLocateBuffer(dom, d, locator);
  const { fp, multiples } = renderCellsBuffers(dom, d, around, cellPx, toGrid);
  const spectra = renderSpectraPanel(dom, d, around);
  renderSeriesPanel(dom, d, locator);

  let aroundCtrl: ReturnType<typeof createAroundController> | null = null;
  const transectEnd = renderFieldPanel(
    dom,
    d,
    statements,
    around,
    multiples,
    toGrid,
    (id) => aroundCtrl?.refit(id),
  );
  const modelCtrl = createModelController(dom, d, around, (refl, ndvi) => {
    spectra.draw(refl, ndvi);
  });
  renderConnectors(dom, around, multiples, fp, ring, transectEnd);

  stage.appendChild(dom.overlay);
  modelCtrl.draw();
  aroundCtrl = createAroundController(dom, stage, around);

  return {
    setPixelBox: (box, anchors) => {
      aroundCtrl.setPixelBox(box, anchors);
    },
    setPaint: (paint) => {
      aroundCtrl.setPaint(paint);
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
