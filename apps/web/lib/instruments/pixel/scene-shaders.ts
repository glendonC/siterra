// Layout constants, coordinate transforms, colour ramps, and DOM/SVG rendering primitives for the
// pixel anatomy instrument scene.

import { en, type MessageId } from "../../copy/en";
import type { InstrumentPalette, PixelPalette } from "../../theme/instruments";
import { cssColour } from "../../theme/obsidian";
import { ramp } from "../valley/palette";
import { NDVI_BREAKS, type CellPaint } from "./paint";

/** The stage dimensions the layout is authored against (CSS px). */
export const PIXEL_DESIGN = { width: 1440, height: 900 } as const;

/**
 * The locator's frame: 40 m cells over the catchment's outline with 400 m to spare on each side,
 * snapped to the 40 m lattice.
 */
export function locatorGrid(ring: readonly (readonly number[])[]): {
  origin_x: number;
  origin_y: number;
  res_m: number;
  width: number;
  height: number;
} {
  const res = 40;
  const pad = 400;
  const xs = ring.map((p) => p[0] ?? Number.NaN);
  const ys = ring.map((p) => p[1] ?? Number.NaN);
  const origin_x = Math.floor((Math.min(...xs) - pad) / res) * res;
  const origin_y = Math.ceil((Math.max(...ys) + pad) / res) * res;
  return {
    origin_x,
    origin_y,
    res_m: res,
    width: Math.ceil((Math.max(...xs) + pad - origin_x) / res),
    height: Math.ceil((origin_y - (Math.min(...ys) - pad)) / res),
  };
}

/**
 * The catchment's MODIS pixels (corners and growing-season slope) and its outline, both in the case's
 * UTM metres, with the trend cells' period and fixed display scale (a neutral middle within ±neutral,
 * each arm rising to full colour at ±domain).
 */
export interface PixelLocator {
  /** Per cell: four corners as E, N pairs, then the slope per decade. */
  cells: readonly (readonly number[])[];
  ring: readonly (readonly number[])[];
  period: readonly [number, number];
  /** The trend's season as its asset words it, or null. */
  window: string | null;
  scale: { domain: number; neutral: number };
  /** The record's lower elevation band limit (m), or null when the record holds no two limits. */
  bandTop: number | null;
}

export const L = {
  caption: { x: 40, y: 36, w: 820 },
  col1: { x: 40, w: 260 },
  col2: { x: 326, w: 704 },
  col3: { x: 1056, w: 344 },
  rowA: 152,
  rowB: 530,
  cellPx: 8,
  multiples: [326, 566, 806] as const,
  multY: 216,
  /** Two lines with the DEM notice, 16 px under the command line. */
  creditY: 856,
};

/** Maximum width (px) of a single cell view in panel 02. */
export const MULT_W = 224;
/** Vertical offset of panel 02's paint selector buttons below its title in in-place mode. */
export const PAINT_ROW = 34;
/** Composition bar dimensions and readout horizontal offset in panel 05; in place, narrower to fit the step list. */
export const BAR = { w: 300, h: 24, readout: 324 };
export const BAR_AROUND = { w: 236, h: 24, readout: 260 };

/** Class names a CSS module gives the scene's parts. */
export type PixelClasses = Readonly<Record<string, string>>;

/**
 * The sans face's box round a word, in em of its size: the browser draws it 1.05 em above the baseline and 0.3 em
 * below. Words set one under another are spaced by it at the size they are drawn at, so the 12 px floor, which
 * grows them on a scaled down stage, never makes them touch.
 */
export const TYPE_BOX = { ascent: 1.05, descent: 0.3 } as const;

/**
 * In-place inspection mode over the 3D terrain: the Sentinel-2 cells stand risen on the land in the
 * centre and the panels surround them as cards; panel 02 controls the 3D cells' paint mode.
 */
export interface PixelAround {
  paint: CellPaint;
  onPaint: (paint: CellPaint) => void;
  /** On the view's own page, with no land: the pixel's cells drawn large right of the list, in the chosen paint. */
  hero?: boolean;
}

/**
 * Screen-space anchor outlines or points on the terrain for card leader lines: the pixel footprint on
 * the terrain (`place`), the risen Sentinel-2 cells (`cells`), and the field check location (`field`).
 */
export interface PixelAnchors {
  place: readonly (readonly [number, number])[];
  cells: readonly (readonly [number, number])[];
  field: readonly (readonly [number, number])[];
}

/** Mapping from panel id to its target anchor geometry on the terrain. */
export const ANCHOR_OF: Record<string, keyof PixelAnchors> = {
  "01": "place",
  "02": "cells",
  "03": "cells",
  "04": "cells",
  "05": "cells",
  "06": "field",
};

/** Axis-aligned bounding box on the 1440 x 900 stage. */
export interface StageBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Layout geometry for in-place pixel inspection (stage px): the risen pixel stands in the centre, and the left column
 * holds the statement and, under it, one panel with the six steps in order; the open step's content opens under its
 * own row, one at a time.
 */
export const AROUND = {
  column: { x: 40, w: 400 },
  /** Panel 02's top before the list places it. */
  cellsY: 236,
  /** The list panel: its padding round the rows, a row's height, and the gap round an open step's content. */
  listPad: 8,
  rowH: 32,
  openGap: 10,
  /** On the view's own page: where the cells stand large, right of the list, and their longest side. */
  hero: { x: 560, y: 96, size: 600 },
};

export type Pt = [number, number];
export type Attrs = Record<string, string | number>;
export const NS = "http://www.w3.org/2000/svg";

export const pts = (arr: readonly Pt[]) =>
  arr.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
export const pct = (v: number) => `${String(Math.round(v * 100))}%`;
export const int = (n: number) => Math.round(n).toLocaleString("en-US");

export const className = (code: number) => {
  const id = `instrument.pixel.class.${String(code)}` as MessageId;
  return id in en ? en[id].text : String(code);
};

export const classShort = (code: number) => {
  const id = `instrument.pixel.classShort.${String(code)}` as MessageId;
  return id in en ? en[id].text : String(code);
};

export const classColour = (code: number, C: PixelPalette) => C.classes[code] ?? C.otherClass;

export const ndviColour = (v: number | null, C: PixelPalette) => {
  if (v === null) return C.noValue;
  let i = 0;
  while (i < NDVI_BREAKS.length && v >= (NDVI_BREAKS[i] ?? Infinity)) i++;
  return C.ndviSteps[i] ?? C.noValue;
};

export const slopeFillColour = (
  v: number,
  scale: { domain: number; neutral: number },
  C: PixelPalette,
): string => {
  const a = Math.abs(v);
  if (a < scale.neutral) return C.slopeNeutral;
  return cssColour(
    ramp([C.slopeNeutral, ...(v < 0 ? C.slopeBelow : C.slopeAbove)], Math.min(1, a / scale.domain)),
  );
};

/**
 * Creates DOM and SVG construction helpers and manages per-panel containers for the pixel scene; it carries the
 * theme's colours (C for the charts, O for the ground and the accent).
 */
export function createSceneDom(
  stage: HTMLElement,
  cls: PixelClasses,
  around: PixelAround | null,
  pal: InstrumentPalette,
) {
  const c = (...names: string[]) => names.map((n) => cls[n] ?? n).join(" ");
  // the size, in the stage's own px, the 12 px words are drawn at: 12 px on screen whatever the stage's scale (the
  // module's --min-type, from the --stage-scale the page sets before it mounts the scene)
  const type = Math.max(12, 12 / (parseFloat(stage.style.getPropertyValue("--stage-scale")) || 1));
  const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    parent.appendChild(e);
    return e;
  };
  const text = (parent: Element, x: number, y: number, str: string, attrs: Attrs = {}) => {
    const t = svg("text", { x, y, ...attrs }, parent);
    t.textContent = str;
    return t;
  };
  const div = (names: string, parent: Element, str?: string) => {
    const e = document.createElement("div");
    e.className = c(...names.split(" "));
    if (str !== undefined) e.textContent = str;
    parent.appendChild(e);
    return e;
  };
  const place = <E extends HTMLElement>(e: E, x: number, y: number, w?: number, h?: number) => {
    e.style.position = "absolute";
    e.style.left = `${String(x)}px`;
    e.style.top = `${String(y)}px`;
    if (w !== undefined) e.style.width = `${String(w)}px`;
    if (h !== undefined) e.style.height = `${String(h)}px`;
    return e;
  };
  const t12 = (tone: "ink2" | "ink3", anchor: "start" | "middle" | "end" = "start"): Attrs => ({
    class: c("t12", tone),
    "text-anchor": anchor,
  });
  stage.replaceChildren();
  const overlay = document.createElementNS(NS, "svg");
  overlay.setAttribute("class", c("overlay"));
  overlay.setAttribute("width", String(PIXEL_DESIGN.width));
  overlay.setAttribute("height", String(PIXEL_DESIGN.height));
  overlay.setAttribute(
    "viewBox",
    `0 0 ${String(PIXEL_DESIGN.width)} ${String(PIXEL_DESIGN.height)}`,
  );

  const parts = new Map<string, { div: HTMLElement; g: Element }>();
  const part = (id: string): { div: HTMLElement; g: Element } => {
    if (!around) return { div: stage, g: overlay };
    const had = parts.get(id);
    if (had) return had;
    const d = document.createElement("div");
    d.className = c("part");
    d.dataset.part = id;
    // a step's words and the statement step aside while the Ask is open (InstrumentShell.module.css)
    d.dataset.askAside = "";
    stage.appendChild(d);
    const g = document.createElementNS(NS, "svg");
    g.setAttribute("class", c("overlay"));
    g.setAttribute("width", String(PIXEL_DESIGN.width));
    g.setAttribute("height", String(PIXEL_DESIGN.height));
    d.appendChild(g);
    const p = { div: d, g };
    parts.set(id, p);
    return p;
  };

  // in place the step's own row in the list carries its number and title, so the panel draws only its detail
  const panelHead = (
    x: number,
    y: number,
    w: number,
    num: string,
    title: MessageId,
    detail?: string,
  ) => {
    const host = part(num).div;
    // the panel's own left edge: in place its words line up with the step list's at this x, whatever bleeds past it
    host.dataset.x0 = String(x);
    if (!around) {
      const h = place(div("panelHead", host), x, y, w);
      div("num", h, num);
      div("title", h, en[title].text);
    }
    if (detail) place(div("panelDetail", host, detail), x, y + 22, w);
  };

  return {
    c,
    type,
    svg,
    text,
    div,
    place,
    t12,
    overlay,
    parts,
    part,
    panelHead,
    C: pal.pixel,
    O: pal,
    root: stage,
  };
}

export type SceneDom = ReturnType<typeof createSceneDom>;
