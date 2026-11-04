// Canvas raster buffers and 10 m cell grid views for the pixel anatomy scene
// (Caption, Panel 01 Locate, Panel 02 Pixel Cells, and standalone connectors).

import { en, format, type MessageId } from "../../copy/en";
import { cssColour } from "../../theme/obsidian";
import { signed } from "../format";
import type { PixelData } from "./data";
import { NDVI_BREAKS, type CellPaint } from "./paint";
import { renderSeriesPanel, renderSpectraPanel } from "./scene-charts";
import {
  AROUND,
  classColour,
  className,
  int,
  L,
  locatorGrid,
  ndviColour,
  PAINT_ROW,
  pct,
  type PixelAround,
  type PixelLocator,
  type Pt,
  pts,
  type SceneDom,
  slopeFillColour,
} from "./scene-shaders";
import type { PixelStatement } from "./statement";

export { renderSeriesPanel, renderSpectraPanel };

/** The catalog's month names, January first. */
const MONTHS: readonly MessageId[] = [
  "month.jan",
  "month.feb",
  "month.mar",
  "month.apr",
  "month.may",
  "month.jun",
  "month.jul",
  "month.aug",
  "month.sep",
  "month.oct",
  "month.nov",
  "month.dec",
];

/**
 * Renders the scene's statement (statement.ts): what the pixel did in plain words, the trend's figure under it as the
 * detail, then what covers the pixel and what that does to its greenness. Its sources are behind the shell's S.
 * Beside the step list the question is left out: the statement already says what it asks, and the list needs the
 * height.
 */
export function renderCaption(
  dom: SceneDom,
  statement: PixelStatement,
  around: PixelAround | null,
  question: string | null,
) {
  const { c, div, place, part } = dom;
  const stage = part("caption").div;
  const cap = place(
    div("caption", stage),
    L.caption.x,
    L.caption.y,
    around ? AROUND.column.w : L.caption.w,
  );
  if (!around) div("captionKey", cap, question ?? en["instrument.pixel.question"].text);
  const p = div("captionStatement", cap);
  const ink = document.createElement("span");
  ink.className = c("ink");
  ink.textContent = statement.lead;
  p.appendChild(ink);
  div("captionDetail", cap, statement.detail);
  if (statement.note !== null) div("captionGrey", cap, statement.note);
}

/** Renders Panel 01 (Locate): 2D catchment slope canvas buffer, pixel footprint marker, 5 km scale bar, and slope key. */
export function renderLocateBuffer(dom: SceneDom, d: PixelData, locator: PixelLocator): Pt {
  const { svg, text, div, place, t12, panelHead, part, C, O } = dom;
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
      ctx.fillStyle = slopeFillColour(v, SLOPE, C);
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
  svg("polygon", { points: pts(fp), fill: O.accent }, g);
  svg("circle", { cx, cy, r: 7.5, fill: "none", stroke: O.accent, "stroke-width": 1.5 }, g);
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
      "note",
      stage,
      format("instrument.pixel.locate.key", {
        window: locator.window ?? en["season.unstated"].text,
        from: locator.period[0],
        to: locator.period[1],
      }),
    ),
    x0,
    y0 + H + 36,
    W,
  );
  return [x0 + cx, y0 + cy];
}

/** Renders Panel 02 (Pixel Cells): three aligned 10 m cell grid canvases (or in-place paint buttons) and their keys. */
export function renderCellsBuffers(
  dom: SceneDom,
  d: PixelData,
  around: PixelAround | null,
  cellPx: number,
  toGrid: (pt: readonly [number, number]) => Pt,
) {
  const { c, svg, text, div, place, t12, panelHead, part, C, O } = dom;
  const size = d.grid.cols * cellPx;
  const tall = d.grid.rows * cellPx;
  const fp = d.pixel.footprint_utm29n.map(toGrid);
  const multiples: { x: number; g: SVGGElement }[] = [];

  const { div: stage, g: overlay } = part("02");
  const p2 = around
    ? { x: AROUND.column.x, y: AROUND.cellsY, w: AROUND.column.w }
    : { x: L.col2.x, y: L.rowA, w: L.col2.w };
  panelHead(
    p2.x,
    p2.y,
    p2.w,
    "02",
    "instrument.pixel.cells",
    around
      ? undefined
      : format("instrument.pixel.cells.detail", { cells: int(d.pixel.analysis_cells) }),
  );

  const [year, month] = d.ndvi_month.split("-");
  const titles = [
    en["instrument.pixel.cells.truecolour"].text,
    format("instrument.pixel.cells.ndvi", {
      month: `${en[MONTHS[Number(month) - 1] ?? "month.jan"].text} ${year ?? ""}`,
    }),
    format("instrument.pixel.cells.class", { year: 2021 }),
  ];
  const painters: ((r: number, k: number) => string)[] = [
    (r, k) => {
      const rgb = d.grid.truecolour_rgb[r]?.[k] ?? [0, 0, 0];
      return cssColour(rgb.map((v) => v / 255));
    },
    (r, k) => ndviColour(d.grid.ndvi_median[r]?.[k] ?? null, C),
    (r, k) => classColour(d.grid.worldcover[r]?.[k] ?? -1, C),
  ];

  const dpr = window.devicePixelRatio || 1;
  const PAINTS: CellPaint[] = ["rgb", "ndvi", "class"];
  if (around) {
    // the cells' paint as one text segmented control, the chosen one on the shared selected background
    // its first choice's words on the column's edge, its background bleeding left as the list's rows do
    const row = place(div("segmented", stage), p2.x - 8, p2.y + PAINT_ROW, p2.w + 16);
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", en["instrument.pixel.cells.paint"].text);
    L.multiples.forEach((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = c("segment");
      b.textContent = titles[i] ?? "";
      const paint = PAINTS[i] ?? "rgb";
      b.dataset.paint = paint;
      b.setAttribute("aria-pressed", String(paint === around.paint));
      b.addEventListener("click", () => {
        around.onPaint(paint);
      });
      row.appendChild(b);
    });
  } else {
    L.multiples.forEach((x, i) => {
      place(div("multTitle", stage, titles[i]), x, L.multY - 18, size);
      const cv = document.createElement("canvas");
      cv.width = Math.round(size * dpr);
      cv.height = Math.round(tall * dpr);
      place(cv, x, L.multY, size, tall);
      stage.appendChild(cv);
      const ctx = cv.getContext("2d");
      const paint = painters[i];
      if (ctx && paint) {
        ctx.scale(dpr, dpr);
        for (let r = 0; r < d.grid.rows; r++)
          for (let k = 0; k < d.grid.cols; k++) {
            ctx.fillStyle = paint(r, k);
            ctx.fillRect(k * cellPx, r * cellPx, cellPx, cellPx);
          }
        ctx.strokeStyle = C.cellLine;
        ctx.lineWidth = 1 / dpr;
        ctx.beginPath();
        for (let k = 1; k < d.grid.cols; k++) {
          ctx.moveTo(k * cellPx, 0);
          ctx.lineTo(k * cellPx, tall);
        }
        for (let k = 1; k < d.grid.rows; k++) {
          ctx.moveTo(0, k * cellPx);
          ctx.lineTo(size, k * cellPx);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.rect(0, 0, size, tall);
        ctx.moveTo(...(fp[0] ?? [0, 0]));
        for (let k = 1; k < 4; k++) ctx.lineTo(...(fp[k] ?? [0, 0]));
        ctx.closePath();
        ctx.fillStyle = C.veil;
        ctx.fill("evenodd");
      }
      const g = svg("g", { transform: `translate(${String(x)},${String(L.multY)})` }, overlay);
      svg("polygon", { points: pts(fp), fill: "none", stroke: O.accent, "stroke-width": 1.25 }, g);
      multiples.push({ x, g });
    });
  }

  // 250 m dimension line along the footprint's top edge
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

  const ny0 = around ? p2.y + PAINT_ROW + 42 : L.multY + tall + 10;
  const kx = (i: number) => (around ? p2.x : (L.multiples[i] ?? p2.x));
  const keyOf = (e: Element, paint: CellPaint) => {
    if (around) e.setAttribute("data-paint-key", paint);
    return e;
  };
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
    div("swatch", row).style.background = classColour(k.code, C);
    div("className", row, className(k.code));
    div("classShare", row, pct(k.share));
  }

  // on the view's own page the cells stand large right of the list, in the paint the list's step 02 chooses, with
  // the pixel's outline and its name under them
  let repaint: ((paint: CellPaint) => void) | null = null;
  if (around?.hero) {
    const H = AROUND.hero;
    const big = Math.floor(H.size / Math.max(d.grid.rows, d.grid.cols));
    const hw = d.grid.cols * big;
    const hh = d.grid.rows * big;
    const cv = document.createElement("canvas");
    cv.width = Math.round(hw * dpr);
    cv.height = Math.round(hh * dpr);
    cv.dataset.pixelHero = "";
    place(cv, H.x, H.y, hw, hh);
    dom.root.appendChild(cv);
    const hfp = fp.map(([x, y]): Pt => [(x / cellPx) * big, (y / cellPx) * big]);
    const g = svg("g", { transform: `translate(${String(H.x)},${String(H.y)})` }, dom.overlay);
    svg("polygon", { points: pts(hfp), fill: "none", stroke: O.accent, "stroke-width": 1.5 }, g);
    const name = place(div("heroName", dom.root), H.x, H.y + hh + 10, hw);
    // the cells stay in sight under the open Ask; their name, where its line stands, steps aside
    name.dataset.askAside = "";
    const ctx = cv.getContext("2d");
    repaint = (paint: CellPaint) => {
      const at = PAINTS.indexOf(paint);
      const fill = painters[at] ?? painters[0];
      name.textContent = titles[at] ?? "";
      if (!ctx || !fill) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, hw, hh);
      for (let r = 0; r < d.grid.rows; r++)
        for (let k = 0; k < d.grid.cols; k++) {
          ctx.fillStyle = fill(r, k);
          ctx.fillRect(k * big, r * big, big, big);
        }
      ctx.strokeStyle = C.cellLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k < d.grid.cols; k++) {
        ctx.moveTo(k * big, 0);
        ctx.lineTo(k * big, hh);
      }
      for (let k = 1; k < d.grid.rows; k++) {
        ctx.moveTo(0, k * big);
        ctx.lineTo(hw, k * big);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(0, 0, hw, hh);
      ctx.moveTo(...(hfp[0] ?? [0, 0]));
      for (let k = 1; k < 4; k++) ctx.lineTo(...(hfp[k] ?? [0, 0]));
      ctx.closePath();
      ctx.fillStyle = C.veil;
      ctx.fill("evenodd");
    };
    repaint(around.paint);
  }

  return { size, tall, fp, multiples, repaint };
}

/** Renders standalone SVG connector hairlines linking the locator ring to the cell grid and the transect to the field check panel. */
export function renderConnectors(
  dom: SceneDom,
  around: PixelAround | null,
  multiples: readonly { x: number; g: SVGGElement }[],
  fp: readonly Pt[],
  ring: Pt,
  transectEnd: Pt,
) {
  const { svg, overlay, C, O } = dom;
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
    svg("circle", { cx: ex, cy: ey, r: 2, fill: O.accent }, g);
  }
}
