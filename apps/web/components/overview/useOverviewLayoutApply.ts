"use client";

import { useCallback, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import {
  nearestOnBox,
  type Box as CardBox,
  type Side as CardSide,
} from "../../lib/overview/card";
import { clamp01, ease, labelAt, labelSide, lerp, wireTo } from "../../lib/overview/arc";
import { VIEW_HREF } from "../../lib/overview/actions";
import {
  placeCardDom,
  placeRecordDom,
  toDesignRect,
} from "../../lib/overview/hud-layout";
import type { Finding, FindingId } from "../../lib/overview/findings";
import {
  ROUTE_QUIET,
  awayOf,
  sideOf,
  type LiftId,
  type OverviewLayout,
  type OverviewScene,
  type Point,
  type SceneState,
  type Selection,
} from "../../lib/overview/scene/overview";
import { goTo } from "./useOverviewControls";
import type { CellPaint } from "../../lib/instruments/pixel/paint";
import type { HeightRange } from "../../lib/package/bands";
import type { Stands } from "../package/PackageBriefing";
import type { TimeFrame } from "../time/TimeView";
import type { LifeFrame } from "../life/LifeLayer";
import type { OverviewIntro } from "./ValleyOverview";
import type { TearState } from "./useOverviewTearInPlace";

/** Seconds for each move: the opening, a finding's hover, the ask circle's hover, the ask opening, the routes' hover. */
export const DUR = { s: 1.0, h: 0.3, k: 0.25, o: 0.7, r: 0.3 } as const;
/** How far the land and the findings rise while the ask is open (design px). */
export const LIFT = 34;
/** The arrival's steps (s): the land rising as the camera comes down, the arc drawing on, the findings fading in. */
const ARRIVE_S = { rise: 1.5, arc: 0.5, appear: 0.4 } as const;
/** The idle lifts' rhythm (s): quiet before the first, then each layer up, held, down, and a pause before the next. */
export const IDLE = { wait: 4, up: 0.7, hold: 2.2, down: 0.7, gap: 0.9 } as const;
const IDLE_LIFTS: boolean = process.env.NEXT_PUBLIC_SITERRA_IDLE_LIFTS === "on";
const PIXEL_HREF = VIEW_HREF.pixel;
const SPLIT_S = { in: 1.9, back: 1.2 } as const;

export interface Live {
  s: number;
  h: number;
  k: number;
  o: number;
  r: number;
}

export interface RunArcState {
  arc: Point[];
  land: OverviewLayout["landBox"];
  rimLeft: Point | null;
}

export interface UseOverviewLayoutApplyArgs {
  lastLayout: MutableRefObject<OverviewLayout | null>;
  timeSubs: MutableRefObject<Set<(f: TimeFrame) => void>>;
  lifeSubs: MutableRefObject<Set<(f: LifeFrame) => void>>;
  standSubs: MutableRefObject<Set<(s: Stands) => void>>;
  runArcKey: MutableRefObject<string>;
  setRunArc: Dispatch<SetStateAction<RunArcState | null>>;
  live: MutableRefObject<Live>;
  goal: MutableRefObject<Live>;
  pkgHandoff: MutableRefObject<boolean>;
  selRef: MutableRefObject<Selection | null>;
  setSel: Dispatch<SetStateAction<Selection | null>>;
  hudRef: RefObject<HTMLDivElement | null>;
  appearRef: MutableRefObject<number>;
  exitRef: MutableRefObject<{ dir: -1 | 0 | 1; k: number; away: number; narrow: boolean }>;
  landRef: RefObject<HTMLCanvasElement | null>;
  arcRef: RefObject<HTMLCanvasElement | null>;
  blurRef: RefObject<HTMLCanvasElement | null>;
  liftRef: RefObject<HTMLDivElement | null>;
  instRef: RefObject<HTMLElement | null>;
  evidRef: RefObject<HTMLElement | null>;
  cardSide: MutableRefObject<CardSide | null>;
  cardBox: MutableRefObject<CardBox | null>;
  recRef: RefObject<HTMLDivElement | null>;
  linkRef: RefObject<HTMLAnchorElement | null>;
  frostRef: RefObject<HTMLDivElement | null>;
  connectorRef: RefObject<SVGSVGElement | null>;
  placeTextRef: RefObject<HTMLDivElement | null>;
  questionRef: RefObject<HTMLDivElement | null>;
  findingsRef: MutableRefObject<readonly Finding[]>;
  routesRef: RefObject<HTMLButtonElement | null>;
  verdictEntryRef: RefObject<HTMLButtonElement | null>;
  dotRefs: MutableRefObject<Map<FindingId, HTMLDivElement>>;
  labelRefs: MutableRefObject<Map<FindingId, HTMLButtonElement>>;
  numeralRefs: MutableRefObject<Map<FindingId, HTMLSpanElement>>;
  wireRefs: MutableRefObject<Map<FindingId, SVGLineElement>>;
  hov: MutableRefObject<FindingId | null>;
  camRef: MutableRefObject<{ zoom: number; turn: number }>;
  panelRef: MutableRefObject<boolean>;
  selWireRef: RefObject<SVGLineElement | null>;
  askCircleRef: RefObject<HTMLButtonElement | null>;
  askBesideRef: RefObject<HTMLParagraphElement | null>;
  askPromptsRef: RefObject<HTMLDivElement | null>;
  fieldRef: RefObject<HTMLButtonElement | null>;
  fieldTagRef: RefObject<HTMLSpanElement | null>;
  endRefs: MutableRefObject<Map<string, HTMLElement>>;
  pickRef: MutableRefObject<string | null>;
  liftLabelRef: RefObject<HTMLDivElement | null>;
  liftWireRef: RefObject<SVGLineElement | null>;
  idle: MutableRefObject<{
    last: number;
    t0: number | null;
    layer: LiftId | null;
    k: number;
  }>;
  startRef: RefObject<HTMLDivElement | null>;
  pixTagRef: RefObject<HTMLDivElement | null>;
  cornerRef: RefObject<HTMLDivElement | null>;
  rootRef: RefObject<HTMLDivElement | null>;
  sceneRef: MutableRefObject<OverviewScene | null>;
  raf: MutableRefObject<number>;
  last: MutableRefObject<number>;
  pkgAsideRef: MutableRefObject<{ k: number; goal: number }>;
  tearRef: MutableRefObject<TearState | null>;
  setTear: Dispatch<SetStateAction<TearState | null>>;
  splitRef: MutableRefObject<{ dir: -1 | 0 | 1; k: number }>;
  cellPaintRef: MutableRefObject<CellPaint>;
  setCellPaint: Dispatch<SetStateAction<CellPaint>>;
  reducedMotion: MutableRefObject<boolean>;
  askOpenRef: MutableRefObject<boolean>;
  arrival: MutableRefObject<{ t0: number | null; done: boolean }>;
  liftOrder: MutableRefObject<LiftId[]>;
  liftShownRef: MutableRefObject<LiftId | null>;
  setLiftShown: Dispatch<SetStateAction<LiftId | null>>;
  introRef: MutableRefObject<OverviewIntro | undefined>;
  setArriving: Dispatch<SetStateAction<boolean>>;
  timeRef: MutableRefObject<{ overlay: SceneState["overlay"]; snow: SceneState["snow"] }>;
  lifeRef: MutableRefObject<{
    on: boolean;
    points: Parameters<OverviewScene["setLife"]>[0];
    focus: number | null;
    ring: number | null;
  }>;
  pkgRangesRef: MutableRefObject<{ ranges: HeightRange[]; lit: number | null }>;
}

export function useOverviewLayoutApply(args: UseOverviewLayoutApplyArgs) {
  const {
    lastLayout,
    timeSubs,
    lifeSubs,
    standSubs,
    runArcKey,
    setRunArc,
    live,
    goal,
    pkgHandoff,
    selRef,
    setSel,
    hudRef,
    appearRef,
    exitRef,
    landRef,
    arcRef,
    blurRef,
    liftRef,
    instRef,
    evidRef,
    cardSide,
    cardBox,
    recRef,
    linkRef,
    frostRef,
    connectorRef,
    placeTextRef,
    questionRef,
    findingsRef,
    routesRef,
    verdictEntryRef,
    dotRefs,
    labelRefs,
    numeralRefs,
    wireRefs,
    hov,
    camRef,
    panelRef,
    selWireRef,
    askCircleRef,
    askBesideRef,
    askPromptsRef,
    fieldRef,
    fieldTagRef,
    endRefs,
    pickRef,
    liftLabelRef,
    liftWireRef,
    idle,
    startRef,
    pixTagRef,
    cornerRef,
    rootRef,
    sceneRef,
    raf,
    last,
    pkgAsideRef,
    tearRef,
    setTear,
    splitRef,
    cellPaintRef,
    setCellPaint,
    reducedMotion,
    askOpenRef,
    arrival,
    liftOrder,
    liftShownRef,
    setLiftShown,
    introRef,
    setArriving,
    timeRef,
    lifeRef,
    pkgRangesRef,
  } = args;

  const apply = useCallback((layout: OverviewLayout) => {
    lastLayout.current = layout;
    if (timeSubs.current.size) {
      const k = layout.fit.scale;
      const f: TimeFrame = {
        edges: layout.bandEdges.map((p) =>
          p ? { x: layout.fit.ox + p.x * k, y: layout.fit.oy + p.y * k } : null,
        ),
        e: layout.e,
      };
      for (const g of timeSubs.current) g(f);
    }
    if (lifeSubs.current.size) {
      const k = layout.fit.scale;
      const { ox, oy } = layout.fit;
      const src = layout.lifeAt;
      let at: Float32Array | null = null;
      if (src) {
        at = new Float32Array(src.length);
        for (let i = 0; i < src.length; i += 2) {
          at[i] = ox + (src[i] ?? 0) * k;
          at[i + 1] = oy + (src[i + 1] ?? 0) * k;
        }
      }
      const fc = layout.lifeFocus;
      const css = (p: { x: number; y: number }) => ({ x: ox + p.x * k, y: oy + p.y * k });
      const f: LifeFrame = {
        at,
        focus: fc
          ? { at: css(fc.at), behind: fc.behind, ring: fc.ring ? fc.ring.map(css) : null }
          : null,
      };
      for (const g of lifeSubs.current) g(f);
    }
    if (standSubs.current.size) {
      const k = layout.fit.scale;
      const at: Stands = {
        points: layout.stands.map((st) =>
          st
            ? {
                x: layout.fit.ox + st.at.x * k,
                y: layout.fit.oy + st.at.y * k,
                behind: st.behind,
              }
            : null,
        ),
        box: {
          x0: layout.fit.ox + layout.landBox.x0 * k,
          y0: layout.fit.oy + layout.landBox.y0 * k,
          x1: layout.fit.ox + layout.landBox.x1 * k,
          y1: layout.fit.oy + layout.landBox.y1 * k,
        },
      };
      for (const f of standSubs.current) f(at);
    }
    const a0 = layout.arcAt[0];
    const a1 = layout.arcAt[layout.arcAt.length - 1];
    const key = a0 && a1 ? [a0.x, a0.y, a1.x, a1.y].map((v) => v.toFixed(0)).join(",") : "";
    if (key !== runArcKey.current) {
      runArcKey.current = key;
      setRunArc({ arc: layout.arcAt, land: layout.landBox, rimLeft: layout.rimLeft });
    }
    const { s, h, k, o } = live.current;
    const { fit, e } = layout;
    const pkgQuiet =
      pkgHandoff.current ||
      ((selRef.current === "package" || selRef.current === "time") && goal.current.s === 1);
    const oe = ease(o);
    const selected = selRef.current;
    const hud = hudRef.current;
    if (hud) {
      hud.style.transform = `translate(${fit.ox.toFixed(2)}px, ${fit.oy.toFixed(2)}px) scale(${fit.scale.toFixed(5)})`;
      const pkgAway = pkgQuiet
        ? 1
        : selected === "package" || selected === "time"
          ? clamp01(s * 1.4)
          : 0;
      const shown = appearRef.current * (1 - exitRef.current.away) * (1 - pkgAway);
      hud.style.opacity = shown < 1 ? shown.toFixed(3) : "";
    }
    const lift = `translateY(${(-LIFT * oe * fit.scale).toFixed(2)}px)`;
    for (const c of [landRef.current, arcRef.current, blurRef.current])
      if (c) c.style.transform = lift;
    if (liftRef.current)
      liftRef.current.style.transform = `translateY(${(-LIFT * oe).toFixed(2)}px)`;

    const cc = ease(clamp01((s - 0.25) / 0.45));
    const leadIn = ease(clamp01((s - 0.05) / 0.3));
    const placed = placeCardDom(
      { inst: instRef.current, evid: evidRef.current },
      layout,
      selected,
      cardSide.current,
    );
    cardBox.current = placed.box;
    cardSide.current = placed.side;
    placeRecordDom(
      {
        rec: recRef.current,
        inst: instRef.current,
        link: linkRef.current,
        frost: frostRef.current,
        evid: evidRef.current,
        connector: connectorRef.current,
        hud: hudRef.current,
      },
      cc * (1 - exitRef.current.away),
      fit.scale,
    );
    const placeText = placeTextRef.current;
    if (placeText) {
      placeText.style.opacity = (1 - e).toFixed(3);
      placeText.style.visibility = e > 0.999 ? "hidden" : "visible";
    }
    const question = questionRef.current;
    if (question) {
      const left =
        selected !== null &&
        sideOf(selected, findingsRef.current.find((f) => f.id === selected)?.clock) === "left"
          ? e
          : 0;
      question.style.opacity = (1 - left).toFixed(3);
      question.style.visibility = left > 0.999 ? "hidden" : "visible";
    }
    const routesEntry = routesRef.current;
    if (routesEntry) {
      const aside = selected !== null && selected !== "routes" ? e : 0;
      routesEntry.style.opacity = (1 - aside).toFixed(3);
      routesEntry.style.visibility = aside > 0.999 ? "hidden" : "visible";
    }
    const verdictEntry = verdictEntryRef.current;
    if (verdictEntry) {
      const aside = selected !== null ? e : 0;
      verdictEntry.style.opacity = (1 - aside).toFixed(3);
      verdictEntry.style.visibility = aside > 0.999 ? "hidden" : "visible";
    }
    for (const f of findingsRef.current) {
      const place = layout.findings[f.id];
      const dot = dotRefs.current.get(f.id);
      const label = labelRefs.current.get(f.id);
      const numeral = numeralRefs.current.get(f.id);
      const wire = wireRefs.current.get(f.id);
      if (!place || !dot || !label || !numeral) continue;
      dot.style.left = `${place.dot.x.toFixed(2)}px`;
      dot.style.top = `${place.dot.y.toFixed(2)}px`;
      const where = labelSide(place.ux, place.uy);
      label.dataset.side = where.side;
      const at = labelAt(
        place.dot,
        { w: label.offsetWidth, h: label.offsetHeight, nh: numeral.offsetHeight },
        where,
      );
      label.style.left = `${at.x.toFixed(2)}px`;
      label.style.top = `${at.y.toFixed(2)}px`;
      const nb = {
        left: at.x + numeral.offsetLeft,
        top: at.y + numeral.offsetTop,
        right: at.x + numeral.offsetLeft + numeral.offsetWidth,
        bottom: at.y + numeral.offsetTop + numeral.offsetHeight,
      };
      const w = wireTo(place.dot, nb, where);
      wire?.setAttribute("x1", w.x1.toFixed(2));
      wire?.setAttribute("y1", w.y1.toFixed(2));
      wire?.setAttribute("x2", w.x2.toFixed(2));
      wire?.setAttribute("y2", w.y2.toFixed(2));
      const isSel = f.id === selected;
      const hv = f.id === hov.current ? h : 0;
      const other = f.id !== hov.current ? h : 0;
      const lower = place.dot.y > layout.centre.y + 40;
      const aw = awayOf(camRef.current);
      let op =
        (1 - aw) *
        (1 - 0.38 * other) *
        (1 - 0.3 * k) *
        (1 - e) *
        (lower ? 1 - oe : 1 - 0.16 * oe) *
        (isSel ? 1 : place.onArc);
      const panelEl = panelRef.current ? document.querySelector("[data-sources-panel]") : null;
      if (panelEl) {
        const p = toDesignRect(panelEl, hudRef.current, fit.scale);
        const lr = { l: at.x, t: at.y, r: at.x + label.offsetWidth, b: at.y + label.offsetHeight };
        if (lr.l < p.right && p.left < lr.r && lr.t < p.bottom && p.top < lr.b) op *= 0.25;
      }
      label.style.opacity = op.toFixed(3);
      label.style.setProperty("--hov", hv.toFixed(3));
      const quiet = Math.max(e - 0.05, 0.2 - op) > 0;
      label.style.pointerEvents = quiet ? "none" : "auto";
      dot.style.setProperty("--hov", (isSel ? Math.max(hv, e) : hv).toFixed(3));
      dot.style.opacity = (
        place.behind
          ? 0
          : isSel
            ? 1
            : (1 - awayOf(camRef.current)) *
              (1 - 0.38 * other) *
              (1 - 0.3 * k) *
              (1 - 0.6 * e) *
              place.onArc
      ).toFixed(3);
      if (wire) wire.style.opacity = (hv * (1 - e)).toFixed(3);
    }
    const sw = selWireRef.current;
    const cardB = cardBox.current;
    if (sw) {
      if (cardB && layout.anchor) {
        const a = layout.anchor;
        const e2 = nearestOnBox(a, cardB);
        sw.setAttribute("x1", a.x.toFixed(2));
        sw.setAttribute("y1", a.y.toFixed(2));
        sw.setAttribute("x2", (a.x + (e2.x - a.x) * leadIn).toFixed(2));
        sw.setAttribute("y2", (a.y + (e2.y - a.y) * leadIn).toFixed(2));
        sw.style.opacity = (leadIn > 0.001 ? 0.85 * (1 - exitRef.current.away) : 0).toFixed(3);
      } else sw.style.opacity = "0";
    }
    const away = ease(clamp01(s / 0.55));
    const askGone = Math.max(away, awayOf(camRef.current), pkgQuiet ? 1 : 0);
    const circle = askCircleRef.current;
    if (circle) {
      circle.style.left = `${layout.ask.x.toFixed(2)}px`;
      circle.style.top = `${layout.ask.y.toFixed(2)}px`;
      circle.style.opacity = (1 - askGone).toFixed(3);
      circle.style.visibility = askGone > 0.99 ? "hidden" : "visible";
      circle.style.transform = `translateY(${(-LIFT * oe).toFixed(2)}px) scale(${(1 + 0.04 * Math.max(k, oe)).toFixed(4)})`;
    }
    const beside = askBesideRef.current;
    if (beside) {
      beside.style.left = `${layout.ask.x.toFixed(2)}px`;
      beside.style.top = `${layout.ask.y.toFixed(2)}px`;
      beside.style.opacity = (1 - askGone).toFixed(3);
    }
    const prompts = askPromptsRef.current;
    if (prompts) {
      const shown = prompts.hasAttribute("data-shown");
      const op = shown ? (1 - askGone) * (1 - oe) : 0;
      prompts.style.opacity = op.toFixed(3);
      prompts.style.visibility = op < 0.01 ? "hidden" : "visible";
      prompts.style.pointerEvents = op < 0.5 ? "none" : "auto";
    }
    const field = fieldRef.current;
    if (field && layout.field) {
      field.style.left = `${layout.field.x.toFixed(2)}px`;
      field.style.top = `${layout.field.y.toFixed(2)}px`;
    }
    if (fieldTagRef.current)
      fieldTagRef.current.style.opacity = (
        (1 - 0.38 * h) *
        (1 - 0.3 * k) *
        (1 - oe) *
        (selected === "results" || selected === "routes" ? 1 - e : 1)
      ).toFixed(3);
    const lifted = Math.max(live.current.r, selected === "routes" ? e : 0);
    for (const r of layout.routeEnds) {
      const el = endRefs.current.get(r.id);
      if (!el) continue;
      el.style.left = `${r.at.x.toFixed(2)}px`;
      el.style.top = `${r.at.y.toFixed(2)}px`;
      const under = selected && selected !== "routes" ? 1 - 0.4 * e : 1;
      const pick = selected === "routes" ? pickRef.current : null;
      const quiet = pick && pick !== r.id ? ROUTE_QUIET : 1;
      el.style.opacity = (
        r.behind ? 0 : lerp(0.75, 1, lifted) * under * (1 - 0.15 * oe) * quiet
      ).toFixed(3);
      el.style.setProperty("--lift", (pick === r.id ? 2 : lifted).toFixed(3));
      el.style.setProperty(
        "--num",
        (selected === "routes" ? clamp01((e - 0.5) / 0.5) : 0).toFixed(3),
      );
    }
    const liftLabel = liftLabelRef.current;
    const liftWire = liftWireRef.current;
    const lk = idle.current.k;
    if (liftLabel && liftWire) {
      if (layout.liftAt && lk > 0) {
        const x2 = layout.liftAt.x + 64;
        const y2 = layout.liftAt.y - 34;
        liftWire.setAttribute("x1", layout.liftAt.x.toFixed(2));
        liftWire.setAttribute("y1", layout.liftAt.y.toFixed(2));
        liftWire.setAttribute("x2", x2.toFixed(2));
        liftWire.setAttribute("y2", y2.toFixed(2));
        liftWire.style.opacity = (0.8 * clamp01((lk - 0.3) / 0.5)).toFixed(3);
        liftLabel.style.left = `${(x2 + 8).toFixed(2)}px`;
        liftLabel.style.top = `${(y2 - 9).toFixed(2)}px`;
        liftLabel.style.opacity = clamp01((lk - 0.4) / 0.5).toFixed(3);
        liftLabel.style.visibility = "visible";
      } else {
        liftWire.style.opacity = "0";
        liftLabel.style.visibility = "hidden";
      }
    }
    const start = startRef.current;
    if (start && layout.routeStart) {
      start.style.left = `${layout.routeStart.at.x.toFixed(2)}px`;
      start.style.top = `${layout.routeStart.at.y.toFixed(2)}px`;
      const shown =
        selected === "routes" && !layout.routeStart.behind ? clamp01((e - 0.5) / 0.5) : 0;
      start.style.opacity = shown.toFixed(3);
      start.style.visibility = shown === 0 ? "hidden" : "visible";
    }
    const pix = pixTagRef.current;
    if (pix && layout.pixelTop) {
      pix.style.left = `${layout.pixelTop.x.toFixed(2)}px`;
      pix.style.top = `${(layout.pixelTop.y - 6).toFixed(2)}px`;
      const on = selected === "pixel" || selected === "field";
      const shown = on ? clamp01((e - 0.6) / 0.4) : 0;
      pix.style.opacity = shown.toFixed(3);
      pix.style.visibility = shown === 0 ? "hidden" : "visible";
    }
    if (cornerRef.current) cornerRef.current.style.opacity = e.toFixed(3);
    rootRef.current?.toggleAttribute("data-opened", e > 0.5);
    rootRef.current?.toggleAttribute("data-placed", true);
  }, []);

  const frame = useCallback((t: number) => {
    const scene = sceneRef.current;
    if (!scene) {
      raf.current = 0;
      return;
    }
    const dt = Math.min(0.25, (t - last.current) / 1000);
    last.current = t;
    let moving = false;
    const l = live.current;
    const gl = goal.current;
    const X = exitRef.current;
    for (const key of ["s", "h", "k", "o", "r"] as const) {
      const d = gl[key] - l[key];
      const step = dt / (key === "s" && X.dir === 1 ? 0.35 : DUR[key]);
      l[key] = Math.abs(d) <= step ? gl[key] : l[key] + Math.sign(d) * step;
      if (l[key] !== gl[key]) moving = true;
    }
    const PA = pkgAsideRef.current;
    if (PA.k !== PA.goal) {
      const step = dt / 0.7;
      PA.k = Math.abs(PA.goal - PA.k) <= step ? PA.goal : PA.k + Math.sign(PA.goal - PA.k) * step;
      moving = true;
    }
    if (l.s === 0 && gl.s === 0 && selRef.current) {
      selRef.current = null;
      setSel(null);
    }
    const awayTo = tearRef.current ? 1 : 0;
    if (X.away !== awayTo) {
      X.away = awayTo > X.away ? Math.min(1, X.away + dt / 0.25) : Math.max(0, X.away - dt / 0.45);
      moving = true;
    }
    if (X.dir === 1 && l.s < 0.02) {
      X.k = Math.min(1, X.k + dt / 0.4);
      if (X.k === 1) {
        X.dir = 0;
        const from = sceneRef.current?.handoff() ?? null;
        setTear((p) => (p ? { ...p, from } : p));
      } else moving = true;
    } else if (X.dir === 1) moving = true;
    if (X.dir === -1) {
      X.k = Math.max(0, X.k - dt / 0.4);
      if (X.k === 0) X.dir = 0;
      else moving = true;
    }
    const P = splitRef.current;
    if (P.dir === 1) {
      P.k = Math.min(1, P.k + dt / SPLIT_S.in);
      if (P.k >= 0.8 && !tearRef.current?.shown) {
        setTear((p) => (p ? { ...p, shown: true } : p));
        goTo(PIXEL_HREF);
      }
      if (P.k === 1) P.dir = 0;
      else moving = true;
    } else if (P.dir === -1) {
      P.k = Math.max(0, P.k - dt / SPLIT_S.back);
      if (P.k === 0) {
        P.dir = 0;
        cellPaintRef.current = "rgb";
        setCellPaint("rgb");
        setTear(null);
        goTo("/valley");
      } else moving = true;
    }
    const Q = idle.current;
    const quiet =
      IDLE_LIFTS &&
      !reducedMotion.current &&
      selRef.current === null &&
      !askOpenRef.current &&
      !panelRef.current &&
      arrival.current.done &&
      tearRef.current === null &&
      exitRef.current.k === 0 &&
      document.visibilityState === "visible";
    let lift: { layer: LiftId; k: number } | null = null;
    if (quiet && liftOrder.current.length && (t - Q.last) / 1000 >= IDLE.wait) {
      Q.t0 ??= t;
      const per = IDLE.up + IDLE.hold + IDLE.down + IDLE.gap;
      const c = (t - Q.t0) / 1000;
      const u = c % per;
      Q.layer = liftOrder.current[Math.floor(c / per) % liftOrder.current.length] ?? null;
      Q.k =
        u < IDLE.up
          ? u / IDLE.up
          : u < IDLE.up + IDLE.hold
            ? 1
            : u < IDLE.up + IDLE.hold + IDLE.down
              ? 1 - (u - IDLE.up - IDLE.hold) / IDLE.down
              : 0;
      moving = true;
    } else {
      Q.t0 = null;
      if (Q.k > 0) {
        Q.k = Math.max(0, Q.k - dt * 3);
        moving = true;
      }
    }
    if (Q.layer && Q.k > 0) lift = { layer: Q.layer, k: Q.k };
    if ((lift?.layer ?? null) !== liftShownRef.current) {
      liftShownRef.current = lift?.layer ?? null;
      setLiftShown(liftShownRef.current);
    }

    let arrive: { rise: number; arcDraw: number; from?: { x: number; y: number } } | null = null;
    const I = introRef.current;
    const A = arrival.current;
    if (I && !A.done && I.run) {
      A.t0 ??= t;
      const el = I.skip ? Infinity : (t - A.t0) / 1000;
      const rise = clamp01(el / ARRIVE_S.rise);
      const arcDraw = clamp01((el - ARRIVE_S.rise) / ARRIVE_S.arc);
      appearRef.current = clamp01((el - ARRIVE_S.rise - 0.5 * ARRIVE_S.arc) / ARRIVE_S.appear);
      arrive = { rise, arcDraw, ...(I.from ? { from: I.from } : {}) };
      if (appearRef.current >= 1) {
        A.done = true;
        arrive = null;
        setArriving(false);
        I.onDone();
      } else moving = true;
    }
    scene.render({
      ...l,
      ...camRef.current,
      sel: selRef.current,
      route: pickRef.current,
      exit: X.narrow ? X.k : 0,
      split: P.k,
      cellPaint: cellPaintRef.current,
      ...(X.away > 0 ? { arcDraw: 1 - X.away } : {}),
      lift,
      aside: ease(pkgAsideRef.current.k),
      overlay: timeRef.current.overlay,
      snow: timeRef.current.snow,
      life: lifeRef.current.on ? 1 : 0,
      lifeFocus: lifeRef.current.focus,
      lifeRing: lifeRef.current.ring,
      ranges: pkgRangesRef.current.ranges,
      lit: pkgRangesRef.current.lit,
      quiet:
        pkgHandoff.current ||
        ((selRef.current === "package" || selRef.current === "time") && goal.current.s === 1),
      ...(arrive ?? {}),
    });
    raf.current = moving ? requestAnimationFrame(frame) : 0;
  }, []);

  const go = useCallback(() => {
    if (raf.current) return;
    last.current = performance.now();
    raf.current = requestAnimationFrame(frame);
  }, [frame]);

  return { apply, go };
}
