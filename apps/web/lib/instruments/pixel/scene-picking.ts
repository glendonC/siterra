// Interactive boundary-slider picking and in-place card/leader projection controller for the
// pixel anatomy scene (Panel 05 Linear Mix Model and in-place card slot + leader geometry).

import { en, format } from "../../copy/en";
import { pixelColours as C } from "../../theme/obsidian";
import { change, day, fixed } from "../format";
import type { PixelData } from "./data";
import { mixSpectra, moveBoundary, ndviOf, type Shares } from "./mix";
import type { CellPaint } from "./paint";
import { renderFieldPanel } from "./scene-charts";
import {
  ANCHOR_OF,
  AROUND,
  ASK_CLEAR,
  BAR,
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
  const { c, svg, div, place, panelHead, part } = dom;
  const order = d.classes.map((k) => k.code);
  const measured: Shares = Object.fromEntries(
    order.map((code) => [code, d.measured_shares[String(code)] ?? 0]),
  );
  let shares: Shares = { ...measured };

  const { div: stage, g: overlay } = part("05");
  const y5 = around ? L.rowB + 30 : L.rowB;
  const x0 = L.col2.x + ASK_CLEAR;
  const w = L.col2.w - ASK_CLEAR;
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
      format(
        around ? "instrument.pixel.model.measuredShort" : "instrument.pixel.model.measured",
        {
          value: fixed(d.spectra.measured_ndvi, 2),
        },
      ),
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

  if (!around)
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
  const kbdChip = document.createElement("kbd");
  kbdChip.textContent = "Home";
  kbdChip.setAttribute("aria-hidden", "true");
  reset.appendChild(kbdChip);
  reset.setAttribute("aria-keyshortcuts", "Home");
  reset.addEventListener("click", () => {
    shares = { ...measured };
    redraw();
  });
  stage.appendChild(reset);
  if (!around)
    place(
      div("meaning", stage, en["instrument.pixel.model.meaning"].text),
      bx,
      by + BAR.h + 96,
      w,
    );

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

const CHIPS = [
  ["01", "instrument.pixel.locate"],
  ["03", "instrument.pixel.spectra"],
  ["04", "instrument.pixel.series"],
  ["05", "instrument.pixel.model"],
  ["06", "instrument.pixel.field"],
] as const;

const SLOT = new Set(["02", "01", "04", "06"]);

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
    const t =
      l2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    const q: Pt = [a[0] + dx * t, a[1] + dy * t];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
};

/** Manages in-place frosted cards, chip bar navigation, slot swapping, paint selection, and leader lines. */
export function createAroundController(
  dom: SceneDom,
  stage: HTMLElement,
  around: PixelAround | null,
) {
  const { c, svg, div, place, overlay, parts } = dom;
  const natural = new Map<string, StageBox>();
  const shiftOf = new Map<string, readonly [number, number]>();
  const partBox = new Map<string, StageBox>();
  const chipBox = new Map<string, StageBox>();
  const chipButtons = new Map<string, HTMLButtonElement>();
  let opened: string | null = null;
  let lastPixel: StageBox | null = null;
  let lastAnchors: PixelAnchors | null = null;

  const fitBack = (id: string, p: { div: HTMLElement; g: Element }) => {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const grow = (x0: number, y0: number, x1: number, y1: number) => {
      if (x1 - x0 < 1 || y1 - y0 < 1) return;
      b.x0 = Math.min(b.x0, x0);
      b.y0 = Math.min(b.y0, y0);
      b.x1 = Math.max(b.x1, x1);
      b.y1 = Math.max(b.y1, y1);
    };
    let back: HTMLDivElement | null = null;
    for (const el of p.div.children)
      if (el instanceof HTMLElement) {
        if (el.dataset.card !== undefined) back = el as HTMLDivElement;
        else if (el.style.visibility !== "hidden" && el.style.display !== "none")
          grow(
            el.offsetLeft,
            el.offsetTop,
            el.offsetLeft + el.offsetWidth,
            el.offsetTop + el.offsetHeight,
          );
      }
    const bb = (p.g as SVGSVGElement).getBBox();
    grow(bb.x, bb.y, bb.x + bb.width, bb.y + bb.height);
    if (!Number.isFinite(b.x0)) return;
    const top = id === "caption" ? 4 : 12;
    if (!back) {
      back = div("card", p.div);
      back.dataset.card = id;
      p.div.insertBefore(back, p.div.firstChild);
    }
    place(back, b.x0 - 12, b.y0 - top, b.x1 - b.x0 + 24, b.y1 - b.y0 + top + 12);
    natural.set(id, { x0: b.x0 - 12, y0: b.y0 - top, x1: b.x1 + 12, y1: b.y1 + 12 });
    const sh = shiftOf.get(id);
    if (sh)
      partBox.set(id, {
        x0: b.x0 - 12 + sh[0],
        y0: b.y0 - top + sh[1],
        x1: b.x1 + 12 + sh[0],
        y1: b.y1 + 12 + sh[1],
      });
  };

  const leaders = svg("g", { "data-leaders": "" }, overlay);

  function setPixelBox(box: StageBox | null, anchors?: PixelAnchors | null) {
    lastPixel = box;
    if (anchors !== undefined) lastAnchors = anchors;
    leaders.replaceChildren();
    if (!around || !box || !lastAnchors) return;
    const open = (["02", "01", "03", "04", "05", "06"] as const).filter((id) =>
      id === "02" ? !(opened !== null && SLOT.has(opened)) : opened === id,
    );
    for (const id of open) {
      const b = partBox.get(id);
      const kind = ANCHOR_OF[id];
      const outline = kind ? lastAnchors[kind] : [];
      if (!b || !outline.length) continue;
      const a = near(middle(outline), b);
      const e = onOutline(a, outline);
      if (Math.hypot(e[0] - a[0], e[1] - a[1]) < 6) continue;
      svg(
        "line",
        { x1: a[0], y1: a[1], x2: e[0], y2: e[1], stroke: C.connector, "stroke-width": 0.75 },
        leaders,
      ).dataset.leader = id;
      svg("circle", { cx: e[0], cy: e[1], r: 2, fill: C.connector }, leaders);
    }
  }

  function show(id: string | null) {
    opened = id;
    for (const [cid] of CHIPS) {
      const p = parts.get(cid);
      if (p) p.div.style.display = cid === id ? "" : "none";
      chipButtons.get(cid)?.setAttribute("aria-expanded", String(cid === id));
    }
    const p02 = parts.get("02");
    if (p02) p02.div.style.display = id !== null && SLOT.has(id) ? "none" : "";
    setPixelBox(lastPixel);
  }

  function refit(id: string) {
    const p = parts.get(id);
    if (!around || !p) return;
    fitBack(id, p);
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
    refit("02");
  };

  if (around) {
    for (const k of stage.querySelectorAll<HTMLElement | SVGElement>("[data-paint-key]")) {
      const on = k.getAttribute("data-paint-key") === around.paint;
      k.setAttribute("display", on ? "inline" : "none");
      k.style.visibility = on ? "" : "hidden";
    }
    for (const [id, p] of parts) fitBack(id, p);

    const cap = natural.get("caption");
    const row = place(
      div("chipRow", stage),
      AROUND.column.x,
      (cap?.y1 ?? AROUND.cellsY - 40) + 14,
      AROUND.column.w,
    );
    for (const [id, title] of CHIPS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = c("textButton", "partChip");
      b.dataset.chip = id;
      b.setAttribute("aria-expanded", "false");
      div("num", b, id);
      div("title", b, en[title].text);
      row.appendChild(b);
      chipButtons.set(id, b);
      const card = parts.get(id)?.div;
      const stays = (to: EventTarget | null) =>
        to instanceof Node && (to === b || (card?.contains(to) ?? false));
      b.addEventListener("click", () => {
        show(opened === id ? null : id);
      });
      b.addEventListener("focus", () => {
        if (b.matches(":focus-visible")) show(id);
      });
      b.addEventListener("blur", (e) => {
        if (opened === id && !stays(e.relatedTarget)) show(null);
      });
      card?.addEventListener("focusout", (e) => {
        if (opened === id && !stays(e.relatedTarget)) show(null);
      });
    }
    for (const [id, b] of chipButtons)
      chipBox.set(id, {
        x0: row.offsetLeft + b.offsetLeft,
        y0: row.offsetTop + b.offsetTop,
        x1: row.offsetLeft + b.offsetLeft + b.offsetWidth,
        y1: row.offsetTop + b.offsetTop + b.offsetHeight,
      });
    const slotY = row.offsetTop + row.offsetHeight + 14;
    for (const [id, nb] of natural) {
      const sh: readonly [number, number] = SLOT.has(id)
        ? [AROUND.column.x - 12 - nb.x0, slotY - nb.y0]
        : (AROUND.shift[id] ?? [0, 0]);
      shiftOf.set(id, sh);
      const p = parts.get(id);
      if (p) p.div.style.transform = `translate(${String(sh[0])}px, ${String(sh[1])}px)`;
      partBox.set(id, {
        x0: nb.x0 + sh[0],
        y0: nb.y0 + sh[1],
        x1: nb.x1 + sh[0],
        y1: nb.y1 + sh[1],
      });
    }
    setPaint(around.paint);
    show(null);
  }

  return {
    refit,
    setPixelBox,
    setPaint,
  };
}
