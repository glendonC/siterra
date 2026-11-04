// Spectral reflectance curves, multi-decade NDVI time-series plot, and proposed field transect
// diagram for the pixel anatomy scene (Panel 03 Class Spectra, Panel 04 Season Record, Panel 06 Field Check).

import { en, format } from "../../copy/en";
import { day, fixed, metres, signed } from "../format";
import { citedText, type PlacedStatements } from "../placed-statements";
import type { PixelData } from "./data";
import {
  AROUND,
  type Attrs,
  classColour,
  className,
  int,
  L,
  type PixelAround,
  type PixelLocator,
  type Pt,
  pts,
  type SceneDom,
  TYPE_BOX,
} from "./scene-shaders";

/** The baseline of a line of words whose box starts `gap` px under `y`, at the drawn type size. */
const lineUnder = (y: number, gap: number, type: number) => y + gap + TYPE_BOX.ascent * type;

/** The baseline of the line after the one on `baseline`, `gap` px between their boxes. */
const nextLine = (baseline: number, gap: number, type: number) =>
  baseline + (TYPE_BOX.descent + TYPE_BOX.ascent) * type + gap;

/** Renders Panel 03 (Class Spectra): VNIR/SWIR reflectance curves, FWHM bands, and spectral table. */
export function renderSpectraPanel(dom: SceneDom, d: PixelData, around: PixelAround | null) {
  const { svg, text, div, place, t12, panelHead, part, C, O, type } = dom;
  const { div: stage, g: overlay } = part("03");
  const x0 = L.col3.x;
  const w = L.col3.w;
  panelHead(
    x0,
    L.rowA,
    w,
    "03",
    "instrument.pixel.spectra",
    around
      ? undefined
      : format("instrument.pixel.spectra.detail", {
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
  // the short-wave segment is wide enough for its two wavelengths side by side at the drawn size (each about 2.5 em)
  const wB = Math.max(84, 5 * type + 8);
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
  // the axis's name ends 6 px over the plot, and the bands' names below start 3 px inside it, at the drawn size
  text(
    g,
    x0,
    top - 6 - TYPE_BOX.descent * type,
    en["instrument.pixel.spectra.reflectance"].text,
    t12("ink3"),
  );

  const wl = d.spectra.wavelengths;
  const nmOf = (b: string) => (wl[b]?.center_wavelength_um ?? 0) * 1000;
  const fwhm = (b: string) => (wl[b]?.full_width_half_max_um ?? 0) * 1000;
  const rx1 = xs(nmOf("B04") - fwhm("B04") / 2);
  const rx2 = xs(nmOf("B04") + fwhm("B04") / 2);
  const nx1 = xs(nmOf("B08") - fwhm("B08") / 2);
  const nx2 = Math.min(xs(nmOf("B08") + fwhm("B08") / 2), left + wA);
  svg("rect", { x: rx1, y: top, width: rx2 - rx1, height: bottom - top, fill: C.bandShade }, g);
  svg("rect", { x: nx1, y: top, width: nx2 - nx1, height: bottom - top, fill: C.bandShade }, g);
  const bandY = lineUnder(top, 3, type);
  text(g, rx1 - 4, bandY, en["instrument.pixel.spectra.red"].text, t12("ink2", "end"));
  // the near-infrared label starts on its own band and runs right, clear of the red one at any type size
  text(g, nx1 + 3, bandY, en["instrument.pixel.spectra.nir"].text, t12("ink2"));
  // the wavelengths under the plot, the axis's name under them and the table under that, each spaced from the size
  // the words are drawn at
  const tickY = lineUnder(bottom, 3, type);
  const nameY = nextLine(tickY, 2, type);
  for (const nm of [500, 700]) text(g, xs(nm), tickY, String(nm), t12("ink3", "middle"));
  text(g, left + wA, tickY, "900", t12("ink3", "end"));
  text(g, left + wA + gap, tickY, "1600", t12("ink3"));
  text(g, right, tickY, "2200", t12("ink3", "end"));
  text(
    g,
    right,
    nameY,
    en[around ? "instrument.pixel.spectra.axisShort" : "instrument.pixel.spectra.axis"].text,
    t12("ink3", "end"),
  );
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
    const stroke = classColour(k.code, C);
    curve(k.median, { stroke, "stroke-width": 2 }, g, {
      r: 2.6,
      fill: stroke,
      stroke: O.canvas,
      "stroke-width": 1,
    });
  }
  curve(d.spectra.pixel_mean, { stroke: C.ink2, "stroke-width": 1.25 }, g, {
    r: 2.6,
    fill: C.ink2,
    stroke: O.canvas,
    "stroke-width": 1,
  });
  const modelG = svg("g", {}, overlay);
  const tbl = place(div("specTable", stage), x0, nameY + TYPE_BOX.descent * type + 6, w);
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
      classColour(k.code, C),
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
        fill: O.canvas,
        stroke: C.ink,
        "stroke-width": 1.5,
      });
      modelNdvi.textContent = ndviText(ndvi);
    },
  };
}

/** Renders Panel 04 (Season Record): multi-decade NDVI series for the pixel and its elevation band, plus Theil-Sen trend. */
export function renderSeriesPanel(dom: SceneDom, d: PixelData, locator: PixelLocator) {
  const { svg, text, div, place, t12, panelHead, part, C, O, type } = dom;
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
  const all = [...s.band, ...s.pixel].map((p) => p.ndvi);
  const fits = Math.min(...all) >= 0.2 && Math.max(...all) <= 0.6;
  const lo = fits ? 0.2 : Math.floor(Math.min(...all) * 10) / 10;
  const hi = fits ? 0.6 : Math.max(lo + 0.4, Math.ceil(Math.max(...all) * 10) / 10);
  const ys = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const g = svg("g", {}, overlay);
  const steps = Math.round((hi - lo) * 10);
  for (const v of Array.from(
    { length: steps + 1 },
    (_, i) => Math.round((lo + i / 10) * 10) / 10,
  )) {
    svg("line", { x1: left, x2: right, y1: ys(v), y2: ys(v), stroke: C.gridLine }, g);
    text(g, left - 6, ys(v) + 4, v.toFixed(1), t12("ink3", "end"));
  }
  // the years under the plot, spaced from the size the words are drawn at; the middle one only where it keeps clear
  // of the two ends at that size (a year is about 2.5 em wide)
  const tickY = lineUnder(bottom, 3, type);
  const yearW = 2.5 * type;
  const midFits =
    xs(2010) - yearW / 2 >= left + yearW + 6 && xs(2010) + yearW / 2 <= right - yearW - 6;
  for (const [y, anchor] of [
    [2000, "start"],
    [2010, "middle"],
    [2025, "end"],
  ] as const)
    if (y !== 2010 || midFits) text(g, xs(y), tickY, String(y), t12("ink3", anchor));
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
        stroke: O.canvas,
        "stroke-width": 1,
      },
      g,
    );
  const lp = s.pixel.at(-1);
  const lb = s.band.at(-1);
  // each line's name at its end: the band's on two lines, the second a line's height under the first at the drawn
  // size; where the two lines end close together, the pixel's name moves clear of the band's, to the side its own
  // line ends on
  const bandY = lb ? ys(lb.ndvi) - 2 : null;
  const bandEnd =
    bandY === null ? null : locator.bandTop !== null ? nextLine(bandY, 2, type) : bandY;
  let pixelY = lp ? ys(lp.ndvi) + 0.35 * type : null;
  if (lp && lb && pixelY !== null && bandY !== null && bandEnd !== null) {
    const bandTop = bandY - TYPE_BOX.ascent * type;
    const bandBottom = bandEnd + TYPE_BOX.descent * type;
    const meets =
      pixelY + TYPE_BOX.descent * type + 2 > bandTop &&
      pixelY - TYPE_BOX.ascent * type < bandBottom + 2;
    if (meets)
      pixelY =
        lp.ndvi >= lb.ndvi
          ? bandTop - 2 - TYPE_BOX.descent * type
          : bandBottom + 2 + TYPE_BOX.ascent * type;
  }
  if (pixelY !== null)
    text(g, right + 8, pixelY, en["instrument.pixel.series.pixel"].text, t12("ink2"));
  if (bandY !== null) {
    text(g, right + 8, bandY, en["instrument.pixel.series.band"].text, t12("ink3"));
    if (locator.bandTop !== null && bandEnd !== null)
      text(
        g,
        right + 8,
        bandEnd,
        format("instrument.pixel.m", { value: metres(locator.bandTop) }),
        t12("ink3"),
      );
  }
  const t = s.pixel_theil_sen;
  place(
    div(
      "note",
      stage,
      format("instrument.pixel.series.trend", {
        slope: signed(t.slope_per_decade, 4),
        lower: signed(t.lower_per_decade, 4),
        upper: signed(t.upper_per_decade, 4),
      }),
    ),
    x0,
    tickY + TYPE_BOX.descent * type + 8,
    w,
  );
}

/** Renders Panel 06 (What to Check): the field team's 100 m line of quadrats, what it would record, and the published context. */
export function renderFieldPanel(
  dom: SceneDom,
  d: PixelData,
  statements: PlacedStatements,
  around: PixelAround | null,
  multiples: readonly { x: number; g: SVGGElement }[],
  toGrid: (pt: readonly [number, number]) => Pt,
): Pt {
  const { svg, text, div, place, t12, panelHead, part, O } = dom;
  const { div: stage, g: overlay } = part("06");
  const x0 = L.col3.x;
  const w = around ? AROUND.column.w : L.col3.w;
  const t = d.transect;
  panelHead(x0, L.rowB, w, "06", "instrument.pixel.field");
  // each part under the one above it, so a line that wraps at a larger type size pushes the rest down
  const proposed = place(
    div("proposed", stage, en["instrument.pixel.field.proposed"].text),
    x0,
    L.rowB + 22,
    w,
  );
  const gy = proposed.offsetTop + proposed.offsetHeight + 12;
  const g = svg("g", { transform: `translate(${String(x0)},${String(gy)})` }, overlay);
  const len = around ? 200 : 250;
  const pxm = len / t.length_m;
  svg(
    "line",
    {
      x1: 0,
      y1: 16,
      x2: len,
      y2: 16,
      stroke: O.accent,
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
        stroke: O.accent,
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
  const qx = len + (around ? 26 : 40);
  const qs = 30;
  svg(
    "rect",
    {
      x: qx,
      y: 1,
      width: qs,
      height: qs,
      fill: "none",
      stroke: O.accent,
      "stroke-width": 1.25,
      "stroke-dasharray": "4 3",
    },
    g,
  );
  text(g, qx + qs / 2, qs + 16, format("instrument.pixel.m", { value: 1 }), t12("ink3", "middle"));
  const transectNote = place(
    div(
      "note",
      stage,
      format("instrument.pixel.field.transect", { length: t.length_m, n: t.quadrats }),
    ),
    x0,
    gy + 58,
    w,
  );
  const records = place(
    div("recordsItem", stage, en["instrument.pixel.field.records"].text),
    x0,
    transectNote.offsetTop + transectNote.offsetHeight + 4,
    w,
  );
  // the published context under what the check would record, in place as on the page
  if (statements.statements.length > 0)
    place(
      div(
        "citation",
        stage,
        [
          ...statements.statements.map(citedText),
          en["instrument.pixel.field.noSpectrum"].text,
        ].join(" "),
      ),
      x0,
      records.offsetTop + records.offsetHeight + 12,
      w,
    );
  const [sx, sy] = toGrid(t.start_utm29n);
  const [ex, ey] = toGrid(t.end_utm29n);
  const cg = multiples[2]?.g;
  if (cg) {
    svg("line", { x1: sx, y1: sy, x2: ex, y2: ey, stroke: O.canvas, "stroke-width": 3.5 }, cg);
    svg(
      "line",
      {
        x1: sx,
        y1: sy,
        x2: ex,
        y2: ey,
        stroke: O.accent,
        "stroke-width": 1.5,
        "stroke-dasharray": "4 3",
      },
      cg,
    );
  }
  return [L.multiples[2] + ex, L.multY + ey];
}
