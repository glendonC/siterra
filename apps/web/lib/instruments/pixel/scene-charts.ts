// Spectral reflectance curves, multi-decade NDVI time-series plot, and proposed field transect
// diagram for the pixel anatomy scene (Panel 03 Class Spectra, Panel 04 Season Record, Panel 06 Field Check).

import { en, format } from "../../copy/en";
import { obsidian, pixelColours as C } from "../../theme/obsidian";
import { day, fixed, metres, signed } from "../format";
import type { PlacedStatements } from "../placed-statements";
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
} from "./scene-shaders";

/** Renders Panel 03 (Class Spectra): VNIR/SWIR reflectance curves, FWHM bands, and spectral table. */
export function renderSpectraPanel(
  dom: SceneDom,
  d: PixelData,
  around: PixelAround | null,
) {
  const { svg, text, div, place, t12, panelHead, part } = dom;
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
  text(
    g,
    right,
    bottom + 32,
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
}

/** Renders Panel 04 (Season Record): multi-decade NDVI series for the pixel and its elevation band, plus Theil-Sen trend. */
export function renderSeriesPanel(
  dom: SceneDom,
  d: PixelData,
  locator: PixelLocator,
) {
  const { svg, text, div, place, t12, panelHead, part } = dom;
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
  const lp = s.pixel.at(-1);
  const lb = s.band.at(-1);
  if (lp)
    text(g, right + 8, ys(lp.ndvi) + 4, en["instrument.pixel.series.pixel"].text, t12("ink2"));
  if (lb) {
    text(g, right + 8, ys(lb.ndvi) - 2, en["instrument.pixel.series.band"].text, t12("ink3"));
    if (locator.bandTop !== null)
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

/** Renders Panel 06 (Field Check): proposed 100 m quadrat transect, expandable cited context, and cell-grid transect overlay. */
export function renderFieldPanel(
  dom: SceneDom,
  d: PixelData,
  statements: PlacedStatements,
  around: PixelAround | null,
  multiples: readonly { x: number; g: SVGGElement }[],
  toGrid: (pt: readonly [number, number]) => Pt,
  onRefit: (id: string) => void,
): Pt {
  const { c, svg, text, div, place, t12, panelHead, part } = dom;
  const { div: stage, g: overlay } = part("06");
  const x0 = L.col3.x;
  const w = around ? AROUND.slotW : L.col3.w;
  const t = d.transect;
  panelHead(x0, L.rowB, w, "06", "instrument.pixel.field");
  place(div("proposed", stage, en["instrument.pixel.field.proposed"].text), x0, L.rowB + 22, w);
  const g = svg("g", { transform: `translate(${String(x0)},${String(L.rowB + 52)})` }, overlay);
  const len = around ? 200 : 250;
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
  const transectNote = place(
    div(
      "note nowrap",
      stage,
      format("instrument.pixel.field.transect", { length: t.length_m, n: t.quadrats }),
    ),
    x0,
    L.rowB + 110,
    w,
  );
  const records = place(
    div("recordsItem", stage, en["instrument.pixel.field.records"].text),
    x0,
    L.rowB + 126,
    w,
  );
  const hasContext = statements.statements.length > 0;
  const stepY = L.rowB + 126 + records.offsetHeight + 8;
  const behind =
    around && hasContext ? place(div("fieldContext", stage), x0, stepY + 32, w) : null;
  if (behind) {
    behind.style.display = "none";
    behind.dataset.fieldContext = "";
    const step = place(document.createElement("button"), x0, stepY);
    step.type = "button";
    step.className = c("textButton", "contextStep");
    step.textContent = en["overview.record.context"].text;
    step.setAttribute("aria-expanded", "false");
    step.dataset.fieldContextStep = "";
    stage.appendChild(step);
    step.addEventListener("click", () => {
      const open = behind.style.display === "none";
      behind.style.display = open ? "" : "none";
      step.setAttribute("aria-expanded", String(open));
      g.setAttribute("display", open ? "none" : "inline");
      g.style.visibility = open ? "hidden" : "";
      transectNote.style.display = open ? "none" : "";
      records.style.display = open ? "none" : "";
      place(step, x0, open ? L.rowB + 52 : stepY);
      place(behind, x0, open ? L.rowB + 84 : stepY + 32, w);
      behind.style.maxHeight = "";
      const disc = [...document.querySelectorAll("[data-ask]")]
        .map((e) => e.getBoundingClientRect())
        .find((q) => q.width > 0 && q.right > 0 && q.left < window.innerWidth);
      const r = behind.getBoundingClientRect();
      if (open && disc && r.right > disc.left && r.bottom > disc.top - 12) {
        const k = r.height / Math.max(behind.offsetHeight, 1) || 1;
        behind.style.maxHeight = `${String(Math.max(48, (disc.top - 12 - r.top) / k))}px`;
      }
      onRefit("06");
    });
  }
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
  if (hasContext) {
    const citation = div(
      "citation",
      behind ?? stage,
      [...statements.statements.map(ref), en["instrument.pixel.field.noSpectrum"].text].join(" "),
    );
    if (!behind) place(citation, x0, L.rowB + 168, w);
  }
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
  return [L.multiples[2] + ex, L.multY + ey];
}
