// Layout constants, coordinate transforms, colour ramps, and DOM/SVG rendering primitives for the
// pixel anatomy instrument scene.

import { en, format, type MessageId } from "../../copy/en";
import { cssColour, pixelColours as C } from "../../theme/obsidian";
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
/** Composition bar dimensions and readout horizontal offset in panel 05. */
export const BAR = { w: 300, h: 24, readout: 324 };
/** Horizontal inset for panel 05 so it stays clear of the prompt disc on the dial arc. */
export const ASK_CLEAR = 150;

/** Class names a CSS module gives the scene's parts. */
export type PixelClasses = Readonly<Record<string, string>>;

/**
 * In-place inspection mode over the 3D terrain: the Sentinel-2 cells stand risen on the land in the
 * centre and the panels surround them as cards; panel 02 controls the 3D cells' paint mode.
 */
export interface PixelAround {
  paint: CellPaint;
  onPaint: (paint: CellPaint) => void;
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
 * Layout geometry for in-place pixel inspection (stage px): the risen pixel sits in the centre; at rest
 * the caption and panel 02 occupy the left column while panels 01, 03, 04, 05, and 06 wait as chips
 * beneath the caption. Selecting 01, 04, or 06 swaps it into 02's slot, while 03 and 05 open on the
 * right side so cards never overlap one another or the pixel.
 */
export const AROUND = {
  column: { x: 40, w: 400 },
  /** Initial top coordinate for panel 02 in the left column before dynamic chip-row placement. */
  cellsY: 236,
  /** Width of a slotted card in the left column (narrowed so panel 06 clears the prompt disc). */
  slotW: 280,
  /** Translation offsets for right-hand cards (03 and 05) relative to their standalone grid positions. */
  shift: {
    "03": [0, -52],
    "05": [370, -64],
  } as Record<string, readonly [number, number]>,
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

export const classColour = (code: number) => C.classes[code] ?? C.otherClass;

export const ndviColour = (v: number | null) => {
  if (v === null) return C.noValue;
  let i = 0;
  while (i < NDVI_BREAKS.length && v >= (NDVI_BREAKS[i] ?? Infinity)) i++;
  return C.ndviSteps[i] ?? C.noValue;
};

export const slopeFillColour = (v: number, scale: { domain: number; neutral: number }): string => {
  const a = Math.abs(v);
  if (a < scale.neutral) return C.slopeNeutral;
  return cssColour(
    ramp(
      [C.slopeNeutral, ...(v < 0 ? C.slopeBelow : C.slopeAbove)],
      Math.min(1, a / scale.domain),
    ),
  );
};

/** Creates DOM and SVG construction helpers and manages per-panel containers for the pixel scene. */
export function createSceneDom(
  stage: HTMLElement,
  cls: PixelClasses,
  around: PixelAround | null,
) {
  const c = (...names: string[]) => names.map((n) => cls[n] ?? n).join(" ");
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
  const chip = (n: number, tip: string) => {
    const b = document.createElement("button");
    b.className = c("chip");
    b.type = "button";
    b.textContent = String(n);
    b.setAttribute("aria-label", format("instrument.pixel.chip", { n, text: tip }));
    const t = document.createElement("span");
    t.className = c("chipTip");
    t.setAttribute("role", "tooltip");
    t.textContent = tip;
    b.appendChild(t);
    return b;
  };

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

  const panelHead = (
    x: number,
    y: number,
    w: number,
    num: string,
    title: MessageId,
    detail?: string,
  ) => {
    const host = part(num).div;
    const h = place(div("panelHead", host), x, y, w);
    div("num", h, num);
    div("title", h, en[title].text);
    if (detail) place(div("panelDetail", host, detail), x, y + 22, w);
  };

  return { c, svg, text, div, place, t12, chip, overlay, parts, part, panelHead };
}

export type SceneDom = ReturnType<typeof createSceneDom>;
