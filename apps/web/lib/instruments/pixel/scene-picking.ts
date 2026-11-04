// Interactive boundary-slider picking and in-place card/leader projection controller for the
// pixel anatomy scene (Panel 05 Linear Mix Model and in-place card slot + leader geometry).

import { en, format } from "../../copy/en";
import { change, day, fixed } from "../format";
import type { PixelData } from "./data";
import { mixSpectra, moveBoundary, ndviOf, type Shares } from "./mix";
import type { CellPaint } from "./paint";
import { renderFieldPanel } from "./scene-charts";
import {
  ANCHOR_OF,
  AROUND,
  BAR,
  BAR_AROUND,
  classColour,
  className,
  classShort,
  L,
  pct,
  PIXEL_DESIGN,
  type PixelAnchors,
  type PixelAround,
  type Pt,
  type SceneDom,
  type StageBox,
} from "./scene-shaders";

export { renderFieldPanel };

/** Creates Panel 05 (Linear Mix Model): interactive class-share composition bar with pointer/keyboard boundary sliders. */
export function createModelController(
  dom: SceneDom,
  d: PixelData,
  around: PixelAround | null,
  onSpectraDraw: (refl: Record<string, number>, ndvi: number) => void,
) {
  const { c, svg, div, place, panelHead, part, C, type } = dom;
  const order = d.classes.map((k) => k.code);
  // the covers' names under the bar stand in two rows a line apart at the size they are drawn at (the module's 12 px
  // floor sets their line at 4/3 of it)
  const labelLine = Math.max(16, (type * 4) / 3);
  const labelRow = labelLine + 2;
  const measured: Shares = Object.fromEntries(
    order.map((code) => [code, d.measured_shares[String(code)] ?? 0]),
  );
  let shares: Shares = { ...measured };

  const { div: stage, g: overlay } = part("05");
  const y5 = L.rowB;
  const x0 = L.col2.x;
  const w = around ? AROUND.column.w : L.col2.w;
  // in place the bar is narrower, so the bar and its readout fit the step list's column
  const bar = around ? BAR_AROUND : BAR;
  panelHead(x0, y5, w, "05", "instrument.pixel.model");
  place(
    div(
      "modelLabel",
      stage,
      en[around ? "instrument.pixel.model.labelShort" : "instrument.pixel.model.label"].text,
    ),
    x0,
    y5 + 22,
    w,
  );
  const bx = x0;
  const by = y5 + 112;
  const g = svg("g", {}, overlay);
  if (!around)
    place(div("barCaption", stage, en["instrument.pixel.model.bar"].text), bx, y5 + 64, bar.w);
  const barG = svg("g", {}, g);
  const tickG = svg("g", {}, g);
  let acc = 0;
  for (let i = 0; i < order.length - 1; i++) {
    acc += measured[order[i] ?? -1] ?? 0;
    const x = bx + acc * bar.w;
    svg("line", { x1: x, x2: x, y1: by - 9, y2: by - 3, stroke: C.ink2, "stroke-width": 1 }, tickG);
  }
  const segLabels = place(div("segLabels", stage), bx, by + bar.h + 6, bar.w, labelRow + labelLine);
  const readout = place(div("readout", stage), x0 + bar.readout, y5 + 64, w - bar.readout);
  const handles: SVGGElement[] = [];

  const redraw = () => {
    barG.replaceChildren();
    segLabels.replaceChildren();
    let a = 0;
    order.forEach((code, i) => {
      const share = shares[code] ?? 0;
      const sx = bx + a * bar.w;
      const sw = share * bar.w;
      if (sw > 2)
        svg(
          "rect",
          {
            x: sx + (i ? 1 : 0),
            y: by,
            width: Math.max(0, sw - (i ? 2 : 0)),
            height: bar.h,
            rx: 2,
            fill: classColour(code, C),
          },
          barG,
        );
      const lab = div(
        "segLabel",
        segLabels,
        format("instrument.pixel.model.segment", { name: classShort(code), share: pct(share) }),
      );
      // centred under its segment, and kept within the bar, by its own width as drawn
      const mid = (a + share / 2) * bar.w;
      lab.style.left = `${mid.toFixed(1)}px`;
      lab.style.transform = `translateX(clamp(${(-mid).toFixed(1)}px, -50%, calc(${(bar.w - mid).toFixed(1)}px - 100%)))`;
      lab.style.top = `${((i % 2) * labelRow).toFixed(1)}px`;
      a += share;
    });
    a = 0;
    handles.forEach((h, i) => {
      a += shares[order[i] ?? -1] ?? 0;
      h.setAttribute("transform", `translate(${String(bx + a * bar.w)},${String(by)})`);
      h.setAttribute("aria-valuenow", String(Math.round(a * 100)));
    });
    const refl = mixSpectra(d.classes, shares);
    const nd0 = ndviOf(mixSpectra(d.classes, measured));
    const nd = ndviOf(refl);
    readout.replaceChildren();
    div(
      "roKey",
      readout,
      around
        ? en["instrument.pixel.model.keyShort"].text
        : format("instrument.pixel.model.key", { date: day(d.spectra.datetime) }),
    );
    const figRow = div("roFigRow", readout);
    div("roFigure", figRow, fixed(nd, 2));
    const moved = order.some(
      (code) => Math.abs((shares[code] ?? 0) - (measured[code] ?? 0)) > 1e-9,
    );
    if (moved)
      div(
        "roDelta",
        figRow,
        format("instrument.pixel.model.delta", { value: change(nd - nd0, 2) }),
      );
    if (!around)
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
      format(around ? "instrument.pixel.model.measuredShort" : "instrument.pixel.model.measured", {
        value: fixed(d.spectra.measured_ndvi, 2),
      }),
    );
    onSpectraDraw(refl, nd);
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
    svg("rect", { x: -7, y: -6, width: 14, height: bar.h + 12, fill: "transparent" }, h);
    svg("line", { x1: 0, x2: 0, y1: -4, y2: bar.h + 4, stroke: C.ink, "stroke-width": 2 }, h);
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
      shares = moveBoundary(order, shares, i, (xLocal - (bx + before * bar.w)) / bar.w);
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

  if (!around)
    place(
      div("barCaption nowrap", stage, en["instrument.pixel.model.drag"].text),
      bx,
      by + bar.h + 46,
      bar.w,
    );
  // a text button with its key in the key bar's chip, the chip first as the key bar draws it, under the covers' names
  const namesEnd = by + bar.h + 6 + labelRow + labelLine;
  const reset = place(document.createElement("button"), bx - 8, namesEnd + (around ? 6 : 26));
  reset.className = c("textButton");
  reset.type = "button";
  const kbdChip = document.createElement("kbd");
  kbdChip.textContent = "Home";
  kbdChip.setAttribute("aria-hidden", "true");
  reset.appendChild(kbdChip);
  reset.appendChild(document.createTextNode(en["instrument.pixel.model.reset"].text));
  reset.setAttribute("aria-keyshortcuts", "Home");
  reset.addEventListener("click", () => {
    shares = { ...measured };
    redraw();
  });
  stage.appendChild(reset);
  if (!around)
    place(div("meaning", stage, en["instrument.pixel.model.meaning"].text), bx, by + bar.h + 96, w);

  return {
    draw: redraw,
    setShares(next: Shares) {
      shares = { ...shares, ...next };
      redraw();
    },
    shares: (): Shares => ({ ...shares }),
    reset() {
      shares = { ...measured };
      redraw();
    },
  };
}

/** The six steps in order, each named by what it shows. */
const STEPS = [
  ["01", "instrument.pixel.locate"],
  ["02", "instrument.pixel.cells"],
  ["03", "instrument.pixel.spectra"],
  ["04", "instrument.pixel.series"],
  ["05", "instrument.pixel.model"],
  ["06", "instrument.pixel.field"],
] as const;

const near = (p: Pt, b: StageBox): Pt => [
  Math.min(b.x1, Math.max(b.x0, p[0])),
  Math.min(b.y1, Math.max(b.y0, p[1])),
];

const middle = (pts: readonly (readonly [number, number])[]): Pt => [
  pts.reduce((s, q) => s + q[0], 0) / pts.length,
  pts.reduce((s, q) => s + q[1], 0) / pts.length,
];

/** Point on a closed polygon outline (or single point) nearest `p`. */
const onOutline = (p: Pt, pts: readonly (readonly [number, number])[]): Pt => {
  let best: Pt = [pts[0]?.[0] ?? 0, pts[0]?.[1] ?? 0];
  let bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] ?? [0, 0];
    const b = pts[(i + 1) % pts.length] ?? a;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    const q: Pt = [a[0] + dx * t, a[1] + dy * t];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
};

/**
 * In place: the statement on its frosted card and, under it, one panel with the six steps in order. A step's content
 * opens directly under its own row, one step at a time, with a leader to where it is on the land; 02 is open at first.
 */
export function createAroundController(
  dom: SceneDom,
  stage: HTMLElement,
  around: PixelAround | null,
) {
  const { c, svg, div, place, overlay, parts, C } = dom;
  const rows = new Map<string, HTMLButtonElement>();
  /** The open step's content where it stands now. */
  let openBox: StageBox | null = null;
  let opened: string | null = "02";
  let lastPixel: StageBox | null = null;
  let lastAnchors: PixelAnchors | null = null;
  let list: HTMLDivElement | null = null;
  let listTop = 0;

  // a part's own box before it is moved: the words it shows and its drawing
  const boxOf = (p: { div: HTMLElement; g: Element }): StageBox | null => {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const grow = (x0: number, y0: number, x1: number, y1: number) => {
      if (x1 - x0 < 1 || y1 - y0 < 1) return;
      b.x0 = Math.min(b.x0, x0);
      b.y0 = Math.min(b.y0, y0);
      b.x1 = Math.max(b.x1, x1);
      b.y1 = Math.max(b.y1, y1);
    };
    for (const el of p.div.children)
      if (
        el instanceof HTMLElement &&
        el.dataset.card === undefined &&
        el.style.visibility !== "hidden" &&
        el.style.display !== "none"
      )
        grow(
          el.offsetLeft,
          el.offsetTop,
          el.offsetLeft + el.offsetWidth,
          el.offsetTop + el.offsetHeight,
        );
    const bb = (p.g as SVGSVGElement).getBBox();
    grow(bb.x, bb.y, bb.x + bb.width, bb.y + bb.height);
    return Number.isFinite(b.x0) ? b : null;
  };

  // the open step's leader steps aside with the step while the Ask is open, as the list does
  const leaders = svg("g", { "data-leaders": "", "data-ask-aside": "" }, overlay);

  function setPixelBox(box: StageBox | null, anchors?: PixelAnchors | null) {
    lastPixel = box;
    if (anchors !== undefined) lastAnchors = anchors;
    leaders.replaceChildren();
    if (!around || !box || !lastAnchors || !opened || !openBox) return;
    const kind = ANCHOR_OF[opened];
    const outline = kind ? lastAnchors[kind] : [];
    if (!outline.length) return;
    const a = near(middle(outline), openBox);
    const e = onOutline(a, outline);
    if (Math.hypot(e[0] - a[0], e[1] - a[1]) < 6) return;
    svg(
      "line",
      { x1: a[0], y1: a[1], x2: e[0], y2: e[1], stroke: C.connector, "stroke-width": 0.75 },
      leaders,
    ).dataset.leader = opened;
    svg("circle", { cx: e[0], cy: e[1], r: 2, fill: C.connector }, leaders);
  }

  // the rows top to bottom: the open step's content under its own row, and the rows after it below that
  function layout() {
    if (!list) return;
    const x = AROUND.column.x;
    let y = listTop + AROUND.listPad;
    openBox = null;
    for (const [id] of STEPS) {
      const row = rows.get(id);
      const p = parts.get(id);
      if (!row || !p) continue;
      place(row, x - 8, y, AROUND.column.w + 16, AROUND.rowH);
      y += AROUND.rowH;
      const open = opened === id;
      row.setAttribute("aria-expanded", String(open));
      p.div.style.display = open ? "" : "none";
      if (!open) continue;
      const nb = boxOf(p);
      if (!nb) continue;
      const top = y + AROUND.openGap;
      const x0 = Number(p.div.dataset.x0 ?? nb.x0);
      p.div.style.transform = `translate(${String(x - x0)}px, ${String(top - nb.y0)}px)`;
      openBox = {
        x0: x - 12,
        y0: top - 4,
        x1: x + AROUND.column.w + 12,
        y1: top + nb.y1 - nb.y0 + 4,
      };
      y = top + (nb.y1 - nb.y0) + AROUND.openGap + 2;
    }
    place(list, x - 12, listTop, AROUND.column.w + 24, y + AROUND.listPad - listTop);
    setPixelBox(lastPixel);
  }

  const setPaint = (paint: CellPaint) => {
    for (const b of stage.querySelectorAll<HTMLButtonElement>("[data-paint]"))
      b.setAttribute("aria-pressed", String(b.dataset.paint === paint));
    for (const k of stage.querySelectorAll<HTMLElement | SVGElement>("[data-paint-key]")) {
      const on = k.getAttribute("data-paint-key") === paint;
      k.setAttribute("display", on ? "inline" : "none");
      k.style.visibility = on ? "" : "hidden";
    }
    // the key under the paint control changes height: the rows after it move with it
    layout();
  };

  if (around) {
    // the statement's card
    const cap = parts.get("caption");
    const cb = cap ? boxOf(cap) : null;
    if (cap && cb) {
      const back = div("card", cap.div);
      back.dataset.card = "caption";
      cap.div.insertBefore(back, cap.div.firstChild);
      place(back, cb.x0 - 12, cb.y0 - 4, cb.x1 - cb.x0 + 24, cb.y1 - cb.y0 + 16);
    }
    listTop = (cb?.y1 ?? AROUND.cellsY - 40) + 24;
    // the steps' panel, then each step's row followed by its content, so the focus moves through them in order
    list = div("card", stage);
    list.dataset.stepList = "";
    list.dataset.askAside = "";
    for (const [id, title] of STEPS) {
      const p = parts.get(id);
      if (!p) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = c("stepRow");
      b.dataset.step = id;
      b.dataset.askAside = "";
      b.setAttribute("aria-expanded", "false");
      const num = document.createElement("span");
      num.className = c("stepNum");
      num.textContent = id;
      const name = document.createElement("span");
      name.textContent = en[title].text;
      b.append(num, name);
      b.addEventListener("click", () => {
        opened = opened === id ? null : id;
        layout();
      });
      stage.appendChild(b);
      stage.appendChild(p.div);
      rows.set(id, b);
    }
    stage.appendChild(overlay);
    setPaint(around.paint);
  }

  return {
    setPixelBox,
    setPaint,
  };
}
