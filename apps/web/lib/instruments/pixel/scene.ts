// The pixel anatomy (approved specimen C): "Why can a pixel get greener while its pasture does not?" One MODIS pixel
// at three scales plus a model, laid out on a 1440 x 900 stage. Ported from the specimen's mount code: every number
// comes from the pixel's data file and the case record's context statements, every word from the catalog (the
// statements are the record's display texts), every colour from the
// theme; this module computes only the layout and the linear mix. 02 Pixel Cells and 05 Linear Mix Model are the
// heart; 01 Locate and 04 Season Record are compact.

import type { InstrumentCaption } from "@siterra/contracts";
import { en, format, type MessageId } from "../../copy/en";
import { cssColour, obsidian, pixelColours as C } from "../../theme/obsidian";
import type { PlacedStatements } from "../placed-statements";
import { change, day, fixed, metres, signed } from "../format";
import type { PixelData } from "./data";
import { NDVI_BREAKS, type CellPaint } from "./paint";
import { ramp } from "../valley/palette";
import { mixSpectra, moveBoundary, ndviOf, type Shares } from "./mix";

/** The stage the layout was measured at (CSS px). */
export const PIXEL_DESIGN = { width: 1440, height: 900 } as const;

/** The June NDVI ramp's step breaks: a design choice the key states. */
/**
 * The locator's frame: 40 m cells over the catchment's outline with 400 m to spare on each side, snapped to the
 * 40 m lattice (the specimen's frame for this case: 732800, 3517200, 962 x 761).
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
 * The catchment's MODIS pixels (corners and March to June slope) and its outline, both in the case's UTM metres,
 * with the trend cells' own period and fixed display scale (a neutral middle within ±neutral, each arm rising to full
 * colour at ±domain).
 */
export interface PixelLocator {
  /** Per cell: four corners as E, N pairs, then the slope per decade. */
  cells: readonly (readonly number[])[];
  ring: readonly (readonly number[])[];
  period: readonly [number, number];
  scale: { domain: number; neutral: number };
  /** The record's lower elevation band limit (m), the top of the pixel's band. */
  bandTop: number;
}

const L = {
  caption: { x: 40, y: 36, w: 820 },
  col1: { x: 40, w: 260 },
  col2: { x: 326, w: 704 },
  col3: { x: 1056, w: 344 },
  rowA: 152,
  rowB: 530,
  cellPx: 8,
  multiples: [326, 566, 806] as const,
  multY: 216,
  /** Two lines with the DEM notice, starting where the specimens' credit does (16 px under the command line). */
  creditY: 856,
};
/** The bar's size and the readout's offset in 05. */
const BAR = { w: 300, h: 24, readout: 324 };
/** 05 starts this far into its column, so the ask disc's place on the arc (decision 13) stays clear in this view. */
const ASK_CLEAR = 150;

/** Class names a CSS module gives the scene's parts. */
export type PixelClasses = Readonly<Record<string, string>>;

/**
 * The pixel opened in place over the land (U27): its cells stand risen on the land in the middle and the panels stand
 * round them as cards, each with a hairline leader to the pixel; 02 paints the land's cells instead of drawing them.
 */
export interface PixelAround {
  paint: CellPaint;
  onPaint: (paint: CellPaint) => void;
}

/** A box on the 1440 x 900 stage. */
export interface StageBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The pixel opened in place (stage px; U27, the lead's 16:15 judgment): the risen pixel is the subject in the middle;
 * three cards stay open round it (the caption and 02 in the left column, 03 at the top right, 05 at the bottom right),
 * and 01, 04 and 06 wait as small chips on their leaders in the left column, opening beside it on focus or a click.
 */
export const AROUND = {
  column: { x: 40, w: 400 },
  /** 02's top in the left column, under the caption. */
  cellsY: 236,
  /** The chips' first row and spacing. */
  chipY: 486,
  chipStep: 40,
  /**
   * How far each panel moves from its place in the standalone grid. An opened chip's card stands in the free strip
   * right of the left column (its content from x 484, y 150), over the land and the pixel's edge but never over
   * another card's words (the lead, 16:4x).
   */
  shift: {
    "01": [444, -2],
    "04": [444, -380],
    "05": [370, -30],
    "06": [-572, -380],
  } as Record<string, readonly [number, number]>,
};

export interface PixelScene {
  /** In place: where the pixel stands on the stage now, for the cards' leaders. */
  setPixelBox(box: StageBox | null): void;
  /** In place: the paint the land's cells carry. */
  setPaint(paint: CellPaint): void;
  /** Sets some class shares (by WorldCover code) and redraws the model. */
  setShares(next: Shares): void;
  shares(): Shares;
  /** The measured shares again. */
  reset(): void;
  dispose(): void;
}

type Pt = [number, number];
type Attrs = Record<string, string | number>;
const NS = "http://www.w3.org/2000/svg";

const pts = (arr: readonly Pt[]) =>
  arr.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
const pct = (v: number) => `${String(Math.round(v * 100))}%`;
const int = (n: number) => Math.round(n).toLocaleString("en-US");
const className = (code: number) => {
  const id = `instrument.pixel.class.${String(code)}` as MessageId;
  return id in en ? en[id].text : String(code);
};
const classShort = (code: number) => {
  const id = `instrument.pixel.classShort.${String(code)}` as MessageId;
  return id in en ? en[id].text : String(code);
};
const classColour = (code: number) => C.classes[code] ?? C.otherClass;

export function mountPixel(
  stage: HTMLElement,
  d: PixelData,
  /** The pixel anatomy spec's caption, as the case records carry it. */
  caption: InstrumentCaption,
  statements: PlacedStatements,
  locator: PixelLocator,
  cls: PixelClasses,
  around: PixelAround | null = null,
): PixelScene {
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
  const toGrid = ([x, y]: readonly [number, number]): Pt => [
    ((x - d.grid.origin_x) / 10) * L.cellPx,
    ((d.grid.origin_y - y) / 10) * L.cellPx,
  ];
  const ndviColour = (v: number | null) => {
    if (v === null) return C.noValue;
    let i = 0;
    while (i < NDVI_BREAKS.length && v >= (NDVI_BREAKS[i] ?? Infinity)) i++;
    return C.ndviSteps[i] ?? C.noValue;
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

  // in place, each panel lives in its own part (a div with its own svg) on its own frosted card, so it can move, stack
  // and wait as a chip; standalone, every part is the stage itself
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

  // the caption: the question, one ink sentence and one grey sentence, each with its source chip
  {
    const stage = part("caption").div;
    const cap = place(
      div("caption", stage),
      L.caption.x,
      L.caption.y,
      around ? AROUND.column.w : L.caption.w,
    );
    div("captionKey", cap, en["instrument.pixel.question"].text);
    const p = div("captionStatement", cap);
    const ink = document.createElement("span");
    ink.className = c("ink");
    ink.textContent = caption.ink;
    p.appendChild(ink);
    p.appendChild(chip(1, en["instrument.pixel.source.trend"].text));
    const grey = document.createElement("span");
    grey.className = c("grey");
    grey.textContent = ` ${caption.grey}`;
    p.appendChild(grey);
    p.appendChild(chip(2, en["instrument.pixel.source.spectra"].text));
  }

  // 01, compact: the catchment's March to June slope, the pixel marked, a 5 km bar and the key
  let ring: Pt;
  {
    const { div: stage, g: overlay } = part("01");
    const loc = locatorGrid(locator.ring);
    const SLOPE = locator.scale;
    const W = L.col1.w;
    const s = W / loc.width;
    const H = loc.height * s;
    const x0 = L.col1.x;
    const y0 = L.rowA + 26;
    panelHead(x0, L.rowA, W, "01", "instrument.pixel.locate");
    const g = svg("g", { transform: `translate(${String(x0)},${String(y0)})` }, overlay);
    const toLoc = ([x, y]: readonly number[]): Pt => [
      (((x ?? 0) - loc.origin_x) / loc.res_m) * s,
      ((loc.origin_y - (y ?? 0)) / loc.res_m) * s,
    ];
    const outline = locator.ring.map(toLoc);
    // the slope of every catchment pixel on a canvas under the overlay, over the catchment's ground
    const dpr = window.devicePixelRatio || 1;
    const cv = document.createElement("canvas");
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    place(cv, x0, y0, W, H);
    stage.appendChild(cv);
    const ctx = cv.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      const path = (poly: readonly Pt[]) => {
        ctx.beginPath();
        poly.forEach(([px, py], i) => {
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.closePath();
      };
      path(outline);
      ctx.fillStyle = C.locatorGround;
      ctx.fill();
      for (const cell of locator.cells) {
        const v = cell[8] ?? 0;
        const a = Math.abs(v);
        ctx.fillStyle =
          a < SLOPE.neutral
            ? C.slopeNeutral
            : cssColour(
                ramp(
                  [C.slopeNeutral, ...(v < 0 ? C.slopeBelow : C.slopeAbove)],
                  Math.min(1, a / SLOPE.domain),
                ),
              );
        path([0, 2, 4, 6].map((i) => toLoc([cell[i] ?? 0, cell[i + 1] ?? 0])));
        ctx.fill();
      }
    }
    svg(
      "polygon",
      { points: pts(outline), fill: "none", stroke: C.locatorOutline, "stroke-width": 0.75 },
      g,
    );
    const fp = d.pixel.footprint_utm29n.map(toLoc);
    const cx = fp.reduce((a, p) => a + p[0], 0) / 4;
    const cy = fp.reduce((a, p) => a + p[1], 0) / 4;
    svg("polygon", { points: pts(fp), fill: obsidian.accent }, g);
    svg(
      "circle",
      { cx, cy, r: 7.5, fill: "none", stroke: obsidian.accent, "stroke-width": 1.5 },
      g,
    );
    const km5 = (5000 / loc.res_m) * s;
    const sb = svg("g", { transform: `translate(${String(W - km5)},${String(H + 13)})` }, g);
    for (const [x1, y1, x2, y2] of [
      [0, 0, km5, 0],
      [0, -3, 0, 3],
      [km5, -3, km5, 3],
    ] as const)
      svg("line", { x1, y1, x2, y2, stroke: C.ink2, "stroke-width": 1 }, sb);
    text(sb, km5 / 2, 15, format("instrument.pixel.km", { value: 5 }), t12("ink2", "middle"));
    const kw = 132;
    const key = svg("g", { transform: `translate(0,${String(H + 10)})` }, g);
    const stops = [...[...C.slopeBelow].reverse(), C.slopeNeutral, ...C.slopeAbove];
    stops.forEach((fill, i) =>
      svg(
        "rect",
        { x: (i * kw) / stops.length, y: 0, width: kw / stops.length - 1, height: 6, fill },
        key,
      ),
    );
    const [lo, hi] = [-SLOPE.domain, SLOPE.domain];
    text(key, 0, 20, signed(lo, 2), t12("ink3"));
    text(key, kw / 2, 20, "0", t12("ink3", "middle"));
    text(key, kw, 20, signed(hi, 2), t12("ink3", "end"));
    place(
      div(
        "note nowrap",
        stage,
        format("instrument.pixel.locate.key", { from: locator.period[0], to: locator.period[1] }),
      ),
      x0,
      y0 + H + 36,
      W,
    );
    // the bundle's own words for how this pixel was chosen: an illustration, not a sample
    place(div("note", stage, d.selection.note), x0, y0 + H + 60, W).dataset.pixelNote = "";
    ring = [x0 + cx, y0 + cy];
  }

  // 02: the pixel as its 10 m cells in three aligned views, cells outside it veiled
  const size = d.grid.cols * L.cellPx;
  const fp = d.pixel.footprint_utm29n.map(toGrid);
  const multiples: { x: number; g: SVGGElement }[] = [];
  {
    const { div: stage, g: overlay } = part("02");
    // in place 02 stands in the left column under the caption, its views the paint of the land's own cells
    const p2 = around
      ? { x: AROUND.column.x, y: AROUND.cellsY, w: AROUND.column.w }
      : { x: L.col2.x, y: L.rowA, w: L.col2.w };
    panelHead(
      p2.x,
      p2.y,
      p2.w,
      "02",
      "instrument.pixel.cells",
      format(around ? "instrument.pixel.cells.detailLand" : "instrument.pixel.cells.detail", {
        tile: d.pixel.modis_tile,
        row: d.pixel.tile_row,
        col: d.pixel.tile_col,
        cells: int(d.pixel.analysis_cells),
      }),
    );
    const titles = [
      en["instrument.pixel.cells.truecolour"].text,
      format("instrument.pixel.cells.ndvi", {
        month: day(`${d.ndvi_month}-01`).replace(/^\d+ /, ""),
      }),
      format("instrument.pixel.cells.class", { year: 2021 }),
    ];
    const painters: ((r: number, k: number) => string)[] = [
      (r, k) => {
        const rgb = d.grid.truecolour_rgb[r]?.[k] ?? [0, 0, 0];
        return cssColour(rgb.map((v) => v / 255));
      },
      (r, k) => ndviColour(d.grid.ndvi_median[r]?.[k] ?? null),
      (r, k) => classColour(d.grid.worldcover[r]?.[k] ?? -1),
    ];
    const dpr = window.devicePixelRatio || 1;
    // in place the land's own cells are the picture: the three views become the paint they carry
    const PAINTS: CellPaint[] = ["rgb", "ndvi", "class"];
    if (around) {
      const row = place(div("paintRow", stage), p2.x, p2.y + 82, p2.w);
      L.multiples.forEach((_, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = c("textButton", "paintButton");
        b.textContent = titles[i] ?? "";
        const paint = PAINTS[i] ?? "rgb";
        b.dataset.paint = paint;
        b.setAttribute("aria-pressed", String(paint === around.paint));
        b.addEventListener("click", () => {
          around.onPaint(paint);
        });
        row.appendChild(b);
      });
    } else
      L.multiples.forEach((x, i) => {
        place(div("multTitle", stage, titles[i]), x, L.multY - 18, size);
        const cv = document.createElement("canvas");
        cv.width = Math.round(size * dpr);
        cv.height = Math.round(size * dpr);
        place(cv, x, L.multY, size, size);
        stage.appendChild(cv);
        const ctx = cv.getContext("2d");
        const paint = painters[i];
        if (ctx && paint) {
          ctx.scale(dpr, dpr);
          for (let r = 0; r < d.grid.rows; r++)
            for (let k = 0; k < d.grid.cols; k++) {
              ctx.fillStyle = paint(r, k);
              ctx.fillRect(k * L.cellPx, r * L.cellPx, L.cellPx, L.cellPx);
            }
          ctx.strokeStyle = C.cellLine;
          ctx.lineWidth = 1 / dpr;
          ctx.beginPath();
          for (let k = 1; k < d.grid.cols; k++) {
            ctx.moveTo(k * L.cellPx, 0);
            ctx.lineTo(k * L.cellPx, size);
            ctx.moveTo(0, k * L.cellPx);
            ctx.lineTo(size, k * L.cellPx);
          }
          ctx.stroke();
          ctx.beginPath();
          ctx.rect(0, 0, size, size);
          ctx.moveTo(...(fp[0] ?? [0, 0]));
          for (let k = 1; k < 4; k++) ctx.lineTo(...(fp[k] ?? [0, 0]));
          ctx.closePath();
          ctx.fillStyle = C.veil;
          ctx.fill("evenodd");
        }
        const g = svg("g", { transform: `translate(${String(x)},${String(L.multY)})` }, overlay);
        svg(
          "polygon",
          { points: pts(fp), fill: "none", stroke: obsidian.accent, "stroke-width": 1.25 },
          g,
        );
        multiples.push({ x, g });
      });
    // the 250 m dimension line along the footprint's top edge
    const a: Pt = fp[0] ?? [0, 0];
    const b: Pt = fp[1] ?? [0, 0];
    const rg = multiples[0]?.g;
    if (rg) {
      const nx = b[1] - a[1];
      const ny = -(b[0] - a[0]);
      const nl = Math.hypot(nx, ny);
      const ox = (nx / nl) * 8;
      const oy = (ny / nl) * 8;
      svg(
        "line",
        {
          x1: a[0] + ox,
          y1: a[1] + oy,
          x2: b[0] + ox,
          y2: b[1] + oy,
          stroke: C.ink2,
          "stroke-width": 0.75,
        },
        rg,
      );
      for (const p of [a, b])
        svg(
          "line",
          {
            x1: p[0] + ox * 0.5,
            y1: p[1] + oy * 0.5,
            x2: p[0] + ox * 1.5,
            y2: p[1] + oy * 1.5,
            stroke: C.ink2,
            "stroke-width": 0.75,
          },
          rg,
        );
    }
    // the key of each view under it; in place, the key of the paint the cells carry, under the buttons
    const ny0 = around ? p2.y + 128 : L.multY + size + 10;
    const kx = (i: number) => (around ? p2.x : (L.multiples[i] ?? p2.x));
    const keyOf = (e: Element, paint: CellPaint) => {
      if (around) e.setAttribute("data-paint-key", paint);
      return e;
    };
    keyOf(
      place(div("note", stage, en["instrument.pixel.cells.truecolourNote"].text), kx(0), ny0, size),
      "rgb",
    );
    const kg = keyOf(
      svg("g", { transform: `translate(${String(kx(1))},${String(ny0)})` }, overlay),
      "ndvi",
    );
    const sw = size / C.ndviSteps.length;
    C.ndviSteps.forEach((fill, i) =>
      svg("rect", { x: i * sw, y: 0, width: sw - 2, height: 8, fill }, kg),
    );
    NDVI_BREAKS.forEach((v, i) =>
      text(kg, (i + 1) * sw - 1, 22, v.toFixed(1), t12("ink3", "middle")),
    );
    keyOf(
      place(
        div(
          "note",
          stage,
          format("instrument.pixel.cells.ndviNote", {
            min: d.ndvi_inside.count_min,
            max: d.ndvi_inside.count_max,
          }),
        ),
        kx(1),
        ny0 + 28,
        size,
      ),
      "ndvi",
    );
    const key = keyOf(place(div("classKey", stage), kx(2), ny0, size), "class");
    for (const k of d.classes) {
      const row = div("classRow", key);
      div("swatch", row).style.background = classColour(k.code);
      div("className", row, className(k.code));
      div("classShare", row, pct(k.share));
    }
  }

  // 03: the measured class spectra, the pixel's mean, and the model mix drawn by 05
  const spectra = (() => {
    const { div: stage, g: overlay } = part("03");
    const x0 = L.col3.x;
    const w = L.col3.w;
    panelHead(
      x0,
      L.rowA,
      w,
      "03",
      "instrument.pixel.spectra",
      format("instrument.pixel.spectra.detail", {
        date: day(d.spectra.datetime),
        cells: d.spectra.cells_kept,
      }),
    );
    const left = x0 + 34;
    const right = x0 + w - 4;
    const top = L.rowA + 78;
    const bottom = L.rowA + 228;
    const segA = [440, 900] as const;
    const segB = [1500, 2300] as const;
    const gap = 30;
    const wB = 70;
    const wA = right - left - gap - wB;
    const yMax = 0.7;
    const xs = (nm: number) =>
      nm <= 1000
        ? left + ((nm - segA[0]) / (segA[1] - segA[0])) * wA
        : left + wA + gap + ((nm - segB[0]) / (segB[1] - segB[0])) * wB;
    const ys = (v: number) => bottom - (v / yMax) * (bottom - top);
    const g = svg("g", {}, overlay);
    for (const v of [0, 0.2, 0.4, 0.6]) {
      svg("line", { x1: left, x2: left + wA, y1: ys(v), y2: ys(v), stroke: C.gridLine }, g);
      svg("line", { x1: left + wA + gap, x2: right, y1: ys(v), y2: ys(v), stroke: C.gridLine }, g);
      text(g, left - 6, ys(v) + 4, v === 0 ? "0" : v.toFixed(1), t12("ink3", "end"));
    }
    text(g, x0, top - 8, en["instrument.pixel.spectra.reflectance"].text, t12("ink3"));
    // the NDVI bands at their full width at half maximum, each label beside or inside its own band
    const wl = d.spectra.wavelengths;
    const nmOf = (b: string) => (wl[b]?.center_wavelength_um ?? 0) * 1000;
    const fwhm = (b: string) => (wl[b]?.full_width_half_max_um ?? 0) * 1000;
    const rx1 = xs(nmOf("B04") - fwhm("B04") / 2);
    const rx2 = xs(nmOf("B04") + fwhm("B04") / 2);
    const nx1 = xs(nmOf("B08") - fwhm("B08") / 2);
    const nx2 = Math.min(xs(nmOf("B08") + fwhm("B08") / 2), left + wA);
    svg("rect", { x: rx1, y: top, width: rx2 - rx1, height: bottom - top, fill: C.bandShade }, g);
    svg("rect", { x: nx1, y: top, width: nx2 - nx1, height: bottom - top, fill: C.bandShade }, g);
    text(g, rx1 - 4, top + 13, en["instrument.pixel.spectra.red"].text, t12("ink2", "end"));
    text(g, nx2 - 3, top + 13, en["instrument.pixel.spectra.nir"].text, t12("ink2", "end"));
    for (const nm of [500, 700]) text(g, xs(nm), bottom + 16, String(nm), t12("ink3", "middle"));
    text(g, left + wA, bottom + 16, "900", t12("ink3", "end"));
    text(g, left + wA + gap, bottom + 16, "1600", t12("ink3"));
    text(g, right, bottom + 16, "2200", t12("ink3", "end"));
    text(g, right, bottom + 32, en["instrument.pixel.spectra.axis"].text, t12("ink3", "end"));
    const bx = left + wA + gap / 2;
    svg("line", { x1: bx - 5, y1: bottom + 4, x2: bx - 1, y2: bottom - 4, stroke: C.axis }, g);
    svg("line", { x1: bx + 1, y1: bottom + 4, x2: bx + 5, y2: bottom - 4, stroke: C.axis }, g);
    for (const nm of [1600, 900])
      svg("line", { x1: xs(nm), x2: xs(nm), y1: bottom, y2: bottom + 3, stroke: C.axis }, g);
    const vnir = d.spectra.bands.filter((b) => nmOf(b) < 1000);
    const swir = d.spectra.bands.filter((b) => nmOf(b) > 1000);
    const curve = (refl: Record<string, number>, attrs: Attrs, parent: Element, dot: Attrs) => {
      for (const set of [vnir, swir])
        svg(
          "polyline",
          {
            points: pts(set.map((b): Pt => [xs(nmOf(b)), ys(refl[b] ?? 0)])),
            fill: "none",
            "stroke-linejoin": "round",
            "stroke-linecap": "round",
            ...attrs,
          },
          parent,
        );
      for (const b of ["B04", "B08"])
        svg("circle", { cx: xs(nmOf(b)), cy: ys(refl[b] ?? 0), ...dot }, parent);
    };
    for (const k of d.classes) {
      const stroke = classColour(k.code);
      curve(k.median, { stroke, "stroke-width": 2 }, g, {
        r: 2.6,
        fill: stroke,
        stroke: obsidian.canvas,
        "stroke-width": 1,
      });
    }
    curve(d.spectra.pixel_mean, { stroke: C.ink2, "stroke-width": 1.25 }, g, {
      r: 2.6,
      fill: C.ink2,
      stroke: obsidian.canvas,
      "stroke-width": 1,
    });
    const modelG = svg("g", {}, overlay);
    const tbl = place(div("specTable", stage), x0, bottom + 42, w);
    const row = (colour: string, name: string, ndvi: string, cells: string, thin = false) => {
      const r = div("specRow", tbl);
      const k = div("lineKey", r);
      k.style.background = colour;
      if (thin) k.style.height = "1.5px";
      div("specName", r, name);
      const n = div("specNdvi", r, ndvi);
      div("specCells", r, cells);
      return n;
    };
    const cellCount = (n: number) => format("instrument.pixel.spectra.cellCount", { n: int(n) });
    const ndviText = (v: number) => format("instrument.pixel.spectra.ndvi", { value: fixed(v, 2) });
    for (const k of d.classes)
      row(
        classColour(k.code),
        className(k.code),
        ndviText(k.ndvi_of_median),
        cellCount(k.cells_kept),
      );
    row(
      C.ink2,
      en["instrument.pixel.spectra.pixel"].text,
      ndviText(d.spectra.measured_ndvi),
      cellCount(d.spectra.cells_kept),
      true,
    );
    const modelNdvi = row(C.ink, en["instrument.pixel.spectra.model"].text, "", "");
    return {
      draw(refl: Record<string, number>, ndvi: number) {
        modelG.replaceChildren();
        curve(refl, { stroke: C.ink, "stroke-width": 2 }, modelG, {
          r: 3.2,
          fill: obsidian.canvas,
          stroke: C.ink,
          "stroke-width": 1.5,
        });
        modelNdvi.textContent = ndviText(ndvi);
      },
    };
  })();

  // 04, compact: the pixel's own 26 seasons beside its elevation band's, the pixel's trend line
  {
    const { div: stage, g: overlay } = part("04");
    const x0 = L.col1.x;
    const w = L.col1.w;
    const s = d.series;
    panelHead(x0, L.rowB, w, "04", "instrument.pixel.series");
    const left = x0 + 30;
    const right = x0 + w - 84;
    const top = L.rowB + 32;
    const bottom = L.rowB + 160;
    const xs = (y: number) =>
      left + ((y - locator.period[0]) / (locator.period[1] - locator.period[0])) * (right - left);
    const ys = (v: number) => bottom - ((v - 0.2) / 0.4) * (bottom - top);
    const g = svg("g", {}, overlay);
    for (const v of [0.2, 0.3, 0.4, 0.5, 0.6]) {
      svg("line", { x1: left, x2: right, y1: ys(v), y2: ys(v), stroke: C.gridLine }, g);
      text(g, left - 6, ys(v) + 4, v.toFixed(1), t12("ink3", "end"));
    }
    for (const [y, anchor] of [
      [2000, "start"],
      [2010, "middle"],
      [2025, "end"],
    ] as const)
      text(g, xs(y), bottom + 16, String(y), t12("ink3", anchor));
    svg(
      "polyline",
      {
        points: pts(s.band.map((p): Pt => [xs(p.year), ys(p.ndvi)])),
        fill: "none",
        stroke: C.axis,
        "stroke-width": 1.25,
      },
      g,
    );
    const slope = s.pixel_theil_sen.slope_per_decade / 10;
    const yAt = (yr: number) => s.pixel_line_intercept + slope * yr;
    svg(
      "line",
      {
        x1: xs(2000),
        y1: ys(yAt(2000)),
        x2: xs(2025),
        y2: ys(yAt(2025)),
        stroke: C.ink2,
        "stroke-width": 1,
      },
      g,
    );
    svg(
      "polyline",
      {
        points: pts(s.pixel.map((p): Pt => [xs(p.year), ys(p.ndvi)])),
        fill: "none",
        stroke: C.series,
        "stroke-width": 1.5,
        "stroke-linejoin": "round",
      },
      g,
    );
    for (const p of s.pixel)
      svg(
        "circle",
        {
          cx: xs(p.year),
          cy: ys(p.ndvi),
          r: 2.6,
          fill: C.series,
          stroke: obsidian.canvas,
          "stroke-width": 1,
        },
        g,
      );
    // labels at the line ends
    const lp = s.pixel.at(-1);
    const lb = s.band.at(-1);
    if (lp)
      text(g, right + 8, ys(lp.ndvi) + 4, en["instrument.pixel.series.pixel"].text, t12("ink2"));
    if (lb) {
      text(g, right + 8, ys(lb.ndvi) - 2, en["instrument.pixel.series.band"].text, t12("ink3"));
      text(
        g,
        right + 8,
        ys(lb.ndvi) + 13,
        format("instrument.pixel.m", { value: metres(locator.bandTop) }),
        t12("ink3"),
      );
    }
    const t = s.pixel_theil_sen;
    place(
      div(
        "note nowrap",
        stage,
        format("instrument.pixel.series.trend", {
          slope: signed(t.slope_per_decade, 4),
          lower: signed(t.lower_per_decade, 4),
          upper: signed(t.upper_per_decade, 4),
        }),
      ),
      x0,
      bottom + 28,
      w,
    );
  }

  // 06: the proposed field check, dashed, and the cited species text as its own block
  let transectEnd: Pt;
  {
    const { div: stage, g: overlay } = part("06");
    const x0 = L.col3.x;
    const w = L.col3.w;
    const t = d.transect;
    panelHead(x0, L.rowB, w, "06", "instrument.pixel.field");
    place(div("proposed", stage, en["instrument.pixel.field.proposed"].text), x0, L.rowB + 22, w);
    const g = svg("g", { transform: `translate(${String(x0)},${String(L.rowB + 52)})` }, overlay);
    const len = 250;
    const pxm = len / t.length_m;
    svg(
      "line",
      {
        x1: 0,
        y1: 16,
        x2: len,
        y2: 16,
        stroke: obsidian.accent,
        "stroke-width": 1.5,
        "stroke-dasharray": "5 4",
      },
      g,
    );
    for (let q = 0; q < t.quadrats; q++) {
      const x = (q * t.spacing_m + t.spacing_m / 2) * pxm;
      svg(
        "rect",
        {
          x: x - 2.5,
          y: 13.5,
          width: 5,
          height: 5,
          fill: "none",
          stroke: obsidian.accent,
          "stroke-width": 1,
        },
        g,
      );
    }
    for (const m of [0, 50, 100])
      text(
        g,
        m * pxm,
        36,
        format("instrument.pixel.m", { value: m }),
        t12("ink3", m === 0 ? "start" : m === 100 ? "end" : "middle"),
      );
    const qx = len + 40;
    const qs = 30;
    svg(
      "rect",
      {
        x: qx,
        y: 1,
        width: qs,
        height: qs,
        fill: "none",
        stroke: obsidian.accent,
        "stroke-width": 1.25,
        "stroke-dasharray": "4 3",
      },
      g,
    );
    text(
      g,
      qx + qs / 2,
      qs + 16,
      format("instrument.pixel.m", { value: 1 }),
      t12("ink3", "middle"),
    );
    place(
      div(
        "note nowrap",
        stage,
        format("instrument.pixel.field.transect", { length: t.length_m, n: t.quadrats }),
      ),
      x0,
      L.rowB + 110,
      w,
    );
    place(
      div("recordsItem nowrap", stage, en["instrument.pixel.field.records"].text),
      x0,
      L.rowB + 126,
      w,
    );
    // each context statement as the record's display text, its sources after it in parentheses
    const ref = (st: PlacedStatements["statements"][number]) => {
      const refs = st.cites
        .map((ct) =>
          !ct.page
            ? ct.name
            : format(
                ct.page.includes(" ") ? "instrument.pixel.ref.pages" : "instrument.pixel.ref.page",
                {
                  id: ct.name,
                  page: ct.page,
                },
              ),
        )
        .join("; ");
      return format("instrument.pixel.ref", { text: st.text.replace(/\.$/, ""), refs });
    };
    place(
      div(
        "citation",
        stage,
        [...statements.statements.map(ref), en["instrument.pixel.field.noSpectrum"].text].join(" "),
      ),
      x0,
      L.rowB + 168,
      w,
    );
    const [sx, sy] = toGrid(t.start_utm29n);
    const [ex, ey] = toGrid(t.end_utm29n);
    const cg = multiples[2]?.g;
    if (cg) {
      svg(
        "line",
        { x1: sx, y1: sy, x2: ex, y2: ey, stroke: obsidian.canvas, "stroke-width": 3.5 },
        cg,
      );
      svg(
        "line",
        {
          x1: sx,
          y1: sy,
          x2: ex,
          y2: ey,
          stroke: obsidian.accent,
          "stroke-width": 1.5,
          "stroke-dasharray": "4 3",
        },
        cg,
      );
    }
    transectEnd = [L.multiples[2] + ex, L.multY + ey];
  }

  // 05: the composition bar with movable boundaries, the model NDVI and what it means
  const order = d.classes.map((k) => k.code);
  const measured: Shares = Object.fromEntries(
    order.map((code) => [code, d.measured_shares[String(code)] ?? 0]),
  );
  let shares: Shares = { ...measured };
  const draw = (() => {
    const { div: stage, g: overlay } = part("05");
    // in place, 05 stands a little lower, so the pixel between 02 and 05 has room
    const y5 = around ? L.rowB + 30 : L.rowB;
    const x0 = L.col2.x + ASK_CLEAR;
    const w = L.col2.w - ASK_CLEAR;
    panelHead(x0, y5, w, "05", "instrument.pixel.model");
    place(div("modelLabel", stage, en["instrument.pixel.model.label"].text), x0, y5 + 22, w);
    const bx = x0;
    const by = y5 + 112;
    const g = svg("g", {}, overlay);
    place(div("barCaption", stage, en["instrument.pixel.model.bar"].text), bx, y5 + 64, BAR.w);
    const barG = svg("g", {}, g);
    const tickG = svg("g", {}, g);
    let acc = 0;
    for (let i = 0; i < order.length - 1; i++) {
      acc += measured[order[i] ?? -1] ?? 0;
      const x = bx + acc * BAR.w;
      svg(
        "line",
        { x1: x, x2: x, y1: by - 9, y2: by - 3, stroke: C.ink2, "stroke-width": 1 },
        tickG,
      );
    }
    const segLabels = place(div("segLabels", stage), bx, by + BAR.h + 6, BAR.w, 36);
    const readout = place(div("readout", stage), x0 + BAR.readout, y5 + 64, w - BAR.readout);
    const handles: SVGGElement[] = [];
    const redraw = () => {
      barG.replaceChildren();
      segLabels.replaceChildren();
      let a = 0;
      order.forEach((code, i) => {
        const share = shares[code] ?? 0;
        const sx = bx + a * BAR.w;
        const sw = share * BAR.w;
        if (sw > 2)
          svg(
            "rect",
            {
              x: sx + (i ? 1 : 0),
              y: by,
              width: Math.max(0, sw - (i ? 2 : 0)),
              height: BAR.h,
              rx: 2,
              fill: classColour(code),
            },
            barG,
          );
        const lab = div(
          "segLabel",
          segLabels,
          format("instrument.pixel.model.segment", { name: classShort(code), share: pct(share) }),
        );
        lab.style.left = `${String(Math.min(BAR.w - 90, Math.max(0, (a + share / 2) * BAR.w - 45)))}px`;
        lab.style.top = `${String((i % 2) * 18)}px`;
        a += share;
      });
      a = 0;
      handles.forEach((h, i) => {
        a += shares[order[i] ?? -1] ?? 0;
        h.setAttribute("transform", `translate(${String(bx + a * BAR.w)},${String(by)})`);
        h.setAttribute("aria-valuenow", String(Math.round(a * 100)));
      });
      const refl = mixSpectra(d.classes, shares);
      // both figures live from the class medians and shares, never a stored rounded figure
      const nd0 = ndviOf(mixSpectra(d.classes, measured));
      const nd = ndviOf(refl);
      readout.replaceChildren();
      div(
        "roKey",
        readout,
        format("instrument.pixel.model.key", { date: day(d.spectra.datetime) }),
      );
      const figRow = div("roFigRow", readout);
      div("roFigure", figRow, fixed(nd, 2));
      div(
        "roDelta",
        figRow,
        format("instrument.pixel.model.delta", { value: change(nd - nd0, 2) }),
      );
      div(
        "roGloss",
        readout,
        format("instrument.pixel.model.gloss", {
          red: fixed(refl["B04"] ?? 0, 2),
          nir: fixed(refl["B08"] ?? 0, 2),
        }),
      );
      div(
        "roMeasured",
        readout,
        format("instrument.pixel.model.measured", { value: fixed(d.spectra.measured_ndvi, 2) }),
      );
      spectra.draw(refl, nd);
    };
    for (let i = 0; i < order.length - 1; i++) {
      const h = svg(
        "g",
        {
          class: c("handle"),
          tabindex: 0,
          role: "slider",
          "aria-label": format("instrument.pixel.model.boundary", {
            left: className(order[i] ?? -1),
            right: className(order[i + 1] ?? -1),
          }),
          "aria-valuemin": 0,
          "aria-valuemax": 100,
        },
        g,
      );
      h.dataset["boundary"] = String(i);
      svg("rect", { x: -7, y: -6, width: 14, height: BAR.h + 12, fill: "transparent" }, h);
      svg("line", { x1: 0, x2: 0, y1: -4, y2: BAR.h + 4, stroke: C.ink, "stroke-width": 2 }, h);
      let dragging = false;
      h.addEventListener("pointerdown", (e) => {
        dragging = true;
        h.setPointerCapture(e.pointerId);
      });
      h.addEventListener("pointerup", () => {
        dragging = false;
      });
      h.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const rect = overlay.getBoundingClientRect();
        const scale = rect.width / PIXEL_DESIGN.width;
        const xLocal = (e.clientX - rect.left) / scale;
        let before = 0;
        for (let k = 0; k <= i; k++) before += shares[order[k] ?? -1] ?? 0;
        shares = moveBoundary(order, shares, i, (xLocal - (bx + before * BAR.w)) / BAR.w);
        redraw();
      });
      h.addEventListener("keydown", (e) => {
        const step = e.shiftKey ? 0.05 : 0.01;
        const dir =
          e.key === "ArrowRight" || e.key === "ArrowUp"
            ? 1
            : e.key === "ArrowLeft" || e.key === "ArrowDown"
              ? -1
              : 0;
        if (dir) {
          shares = moveBoundary(order, shares, i, dir * step);
          redraw();
          e.preventDefault();
        } else if (e.key === "Home") {
          shares = { ...measured };
          redraw();
          e.preventDefault();
        }
      });
      handles.push(h);
    }
    place(
      div("barCaption nowrap", stage, en["instrument.pixel.model.drag"].text),
      bx,
      by + BAR.h + 46,
      BAR.w,
    );
    const reset = place(document.createElement("button"), bx, by + BAR.h + 66);
    reset.className = c("textButton");
    reset.type = "button";
    reset.textContent = en["instrument.pixel.model.reset"].text;
    // Home does the same: its chip sits inside, as on every control
    const chip = document.createElement("kbd");
    chip.textContent = "Home";
    chip.setAttribute("aria-hidden", "true");
    reset.appendChild(chip);
    reset.setAttribute("aria-keyshortcuts", "Home");
    reset.addEventListener("click", () => {
      shares = { ...measured };
      redraw();
    });
    stage.appendChild(reset);
    place(div("meaning", stage, en["instrument.pixel.model.meaning"].text), bx, by + BAR.h + 96, w);
    return redraw;
  })();

  // the connectors: the locator's ring to the true colour view's footprint, the transect to the field check
  {
    const g = svg("g", {}, overlay);
    const m0 = multiples[0];
    if (m0) {
      for (const corner of [fp[0], fp[3]]) {
        if (!corner) continue;
        const tx = m0.x + corner[0];
        const ty = L.multY + corner[1];
        const dx = tx - ring[0];
        const dy = ty - ring[1];
        const dl = Math.hypot(dx, dy);
        svg(
          "line",
          {
            x1: ring[0] + (dx / dl) * 8,
            y1: ring[1] + (dy / dl) * 8,
            x2: tx,
            y2: ty,
            stroke: C.connector,
            "stroke-width": 0.75,
          },
          g,
        );
      }
    }
    // in place the class view that held the transect is the land's own paint: no connector from it
    if (!around) {
      const [ex, ey] = transectEnd;
      const midX = (L.col2.x + L.col2.w + L.col3.x) / 2;
      svg(
        "polyline",
        {
          points: pts([
            [ex + 2, ey],
            [midX, ey],
            [midX, L.rowB + 10],
            [L.col3.x - 6, L.rowB + 10],
          ]),
          fill: "none",
          stroke: C.connectorWarm,
          "stroke-width": 0.75,
        },
        g,
      );
      svg("circle", { cx: ex, cy: ey, r: 2, fill: obsidian.accent }, g);
    }
  }

  // the credits sit behind the shell's Sources (InstrumentPixelAnatomy registers them)
  stage.appendChild(overlay);
  draw();

  // in place: each part's frosted back fitted to what it holds, the part moved to its place, and 01, 04 and 06 as
  // chips that open their card beside the column
  const CHIPS = [
    ["01", "instrument.pixel.locate"],
    ["04", "instrument.pixel.series"],
    ["06", "instrument.pixel.field"],
  ] as const;
  const partBox = new Map<string, StageBox>();
  const chipBox = new Map<string, StageBox>();
  let opened: string | null = null;
  let lastPixel: StageBox | null = null;
  if (around) {
    for (const [id, p] of parts) {
      const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      const grow = (x0: number, y0: number, x1: number, y1: number) => {
        if (x1 - x0 < 1 || y1 - y0 < 1) return;
        b.x0 = Math.min(b.x0, x0);
        b.y0 = Math.min(b.y0, y0);
        b.x1 = Math.max(b.x1, x1);
        b.y1 = Math.max(b.y1, y1);
      };
      for (const el of p.div.children)
        if (el instanceof HTMLElement)
          grow(
            el.offsetLeft,
            el.offsetTop,
            el.offsetLeft + el.offsetWidth,
            el.offsetTop + el.offsetHeight,
          );
      const bb = (p.g as SVGSVGElement).getBBox();
      grow(bb.x, bb.y, bb.x + bb.width, bb.y + bb.height);
      if (!Number.isFinite(b.x0)) continue;
      // the caption's card starts just above its question, clear of the case question over it
      const top = id === "caption" ? 4 : 12;
      const back = place(
        div("card", p.div),
        b.x0 - 12,
        b.y0 - top,
        b.x1 - b.x0 + 24,
        b.y1 - b.y0 + top + 12,
      );
      back.dataset.card = id;
      p.div.insertBefore(back, p.div.firstChild);
      const [dx, dy] = AROUND.shift[id] ?? [0, 0];
      p.div.style.transform = `translate(${String(dx)}px, ${String(dy)}px)`;
      partBox.set(id, {
        x0: b.x0 - 12 + dx,
        y0: b.y0 - top + dy,
        x1: b.x1 + 12 + dx,
        y1: b.y1 + 12 + dy,
      });
    }
  }
  const chipButtons = new Map<string, HTMLButtonElement>();
  const show = (id: string | null) => {
    opened = id;
    for (const [cid] of CHIPS) {
      const p = parts.get(cid);
      if (p) p.div.style.display = cid === id ? "" : "none";
      chipButtons.get(cid)?.setAttribute("aria-expanded", String(cid === id));
    }
    setPixelBox(lastPixel);
  };
  if (around) {
    CHIPS.forEach(([id, title], i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = c("textButton", "partChip");
      b.dataset.chip = id;
      b.setAttribute("aria-expanded", "false");
      div("num", b, id);
      div("title", b, en[title].text);
      const y = AROUND.chipY + i * AROUND.chipStep;
      place(b, AROUND.column.x, y);
      stage.appendChild(b);
      chipBox.set(id, { x0: AROUND.column.x, y0: y, x1: AROUND.column.x + 220, y1: y + 28 });
      chipButtons.set(id, b);
      // a click toggles its card; the keyboard's focus opens it; leaving the chip closes it
      b.addEventListener("click", () => {
        show(opened === id ? null : id);
      });
      b.addEventListener("focus", () => {
        if (b.matches(":focus-visible")) show(id);
      });
      b.addEventListener("blur", () => {
        if (opened === id) show(null);
      });
      const p = parts.get(id);
      if (p) p.div.style.zIndex = "2";
    });
  }

  // in place: one hairline from each open card, or each waiting chip, to the pixel on the land
  const leaders = svg("g", { "data-leaders": "" }, overlay);
  const near = (p: Pt, b: StageBox): Pt => [
    Math.min(b.x1, Math.max(b.x0, p[0])),
    Math.min(b.y1, Math.max(b.y0, p[1])),
  ];
  function setPixelBox(box: StageBox | null) {
    lastPixel = box;
    leaders.replaceChildren();
    if (!around || !box) return;
    const mid: Pt = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
    const from: Pt[] = (["01", "02", "03", "04", "05", "06"] as const).flatMap((id) => {
      const waiting = chipBox.get(id);
      const b = waiting && opened !== id ? waiting : partBox.get(id);
      return b ? [near(mid, b)] : [];
    });
    for (const a of from) {
      const b = near(a, box);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 6) continue;
      svg(
        "line",
        { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: C.connector, "stroke-width": 0.75 },
        leaders,
      );
      svg("circle", { cx: b[0], cy: b[1], r: 2, fill: C.connector }, leaders);
    }
  }
  // the pressed paint, and only its key under the buttons
  const setPaint = (paint: CellPaint) => {
    for (const b of stage.querySelectorAll<HTMLButtonElement>("[data-paint]"))
      b.setAttribute("aria-pressed", String(b.dataset.paint === paint));
    for (const k of stage.querySelectorAll("[data-paint-key]"))
      k.setAttribute("display", k.getAttribute("data-paint-key") === paint ? "inline" : "none");
  };
  if (around) {
    setPaint(around.paint);
    show(null);
  }

  return {
    setPixelBox,
    setPaint,
    setShares(next) {
      shares = { ...shares, ...next };
      draw();
    },
    shares: () => ({ ...shares }),
    reset() {
      shares = { ...measured };
      draw();
    },
    dispose() {
      stage.replaceChildren();
    },
  };
}
