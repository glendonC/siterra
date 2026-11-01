"use client";

// Camera zoom/turn drag & wheel listener, keyboard shortcut listener, idle activity listener,
// and land hover probe listener extracted from ValleyOverview.tsx.

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { en, format } from "../../lib/copy/en";
import { metres } from "../../lib/instruments/format";
import { WORLDCOVER } from "../../lib/instruments/valley/fixtures";
import {
  VIEW_HREF,
  actionForKey,
  actionsFor,
  type Action,
  type Thing,
  type ViewKind,
} from "../../lib/overview/actions";
import { nearestOnBox, placeCard, type Side as CardSide } from "../../lib/overview/card";
import type {
  LiftId,
  OverviewLayout,
  OverviewScene,
  Selection,
} from "../../lib/overview/scene/overview";
import { typing } from "../controls/ScreenChrome";

/**
 * The address for what is on screen: a new history entry, or the current one replaced when the address is already
 * shown (a view reopened by the browser's Back), so history never holds the same place twice in a row.
 */
export function goTo(href: string): void {
  // the address keeps its query (the place, ?case=), so a reload opens the same place (UI-2's catch)
  const to = href + window.location.search;
  if (window.location.pathname === href) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
}

export function useOverviewCameraDragWheel({
  rootRef,
  camRef,
  setCam,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  camRef: RefObject<{ zoom: number; turn: number }>;
  setCam: (next: { zoom?: number; turn?: number }) => void;
}): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let from: number | null = null;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (e.button !== 0 || t.closest("button, a, input, textarea, [role='dialog']")) return;
      from = e.clientX;
    };
    const onMove = (e: PointerEvent) => {
      if (from === null) return;
      const dx = e.clientX - from;
      from = e.clientX;
      setCam({ turn: camRef.current.turn - dx * 0.2 });
    };
    const onUp = () => {
      from = null;
    };
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[role='dialog'], ul, ol")) return;
      e.preventDefault();
      setCam({ zoom: camRef.current.zoom * Math.exp(e.deltaY * 0.0015) });
    };
    root.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      root.removeEventListener("wheel", onWheel);
    };
  }, [rootRef, camRef, setCam]);
}

export function useOverviewKeyboardShortcuts({
  arriving,
  askOpen,
  panel,
  setPanel,
  tearRef,
  rainWideRef,
  setRainWide,
  selRef,
  atWorkRef,
  setAtWork,
  pkgOpenRef,
  cardActionsRef,
  hoverShown,
  hoverActs,
  lifeBundleRef,
  setLifeOn,
  back,
  reset,
  toOpening,
  openInPlace,
}: {
  arriving: boolean;
  askOpen: boolean;
  panel: boolean;
  setPanel: Dispatch<SetStateAction<boolean>>;
  tearRef: RefObject<unknown>;
  rainWideRef: RefObject<boolean>;
  setRainWide: Dispatch<SetStateAction<boolean>>;
  selRef: RefObject<Selection | null>;
  atWorkRef: RefObject<boolean>;
  setAtWork: Dispatch<SetStateAction<boolean>>;
  pkgOpenRef: RefObject<(() => void) | null>;
  cardActionsRef: RefObject<readonly Action[]>;
  hoverShown: RefObject<boolean>;
  hoverActs: RefObject<readonly Action[]>;
  lifeBundleRef: RefObject<string | null>;
  setLifeOn: Dispatch<SetStateAction<boolean>>;
  back: () => void;
  reset: () => void;
  toOpening: () => void;
  openInPlace: (href: string) => boolean;
}): void {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // while the arrival plays no key reaches the overview; Esc and Enter end it (the journey says skip); while an
      // instrument is open in place its shell has the keys
      if (arriving || tearRef.current) return;
      if (askOpen || typing(ev)) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        if (panel) setPanel(false);
        else if (rainWideRef.current) {
          setRainWide(false);
          goTo("/valley");
        } else if (selRef.current) back();
        else if (atWorkRef.current) setAtWork(false);
        else toOpening();
      } else if (ev.key === "Enter" || /^[a-zA-Z]$/.test(ev.key)) {
        // the action keys of the opened card, or of the label under the cursor (decision 15); Enter on a focused
        // control is the control's own
        if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
        const t = ev.target as HTMLElement | null;
        // (a finding's own label keeps the focus while its card opens: Enter there is the card's Enter)
        if (ev.key === "Enter" && t?.closest("a, button") && !t.closest("[data-finding]")) return;
        if (ev.key === "Enter" && pkgOpenRef.current) {
          ev.preventDefault();
          pkgOpenRef.current();
          return;
        }
        const list = selRef.current
          ? cardActionsRef.current
          : hoverShown.current
            ? hoverActs.current
            : [];
        const a = actionForKey(list, ev.key);
        if (a?.view) {
          ev.preventDefault();
          openInPlace(VIEW_HREF[a.view]);
          return;
        }
        // recorded life, on the overview at rest and over time (UI-2)
        if ((ev.key === "g" || ev.key === "G") && lifeBundleRef.current) {
          if (!selRef.current || selRef.current === "time") {
            ev.preventDefault();
            setLifeOn((v) => !v);
          }
          return;
        }
        if (ev.key === "r" || ev.key === "R") {
          ev.preventDefault();
          reset();
        } else if (ev.key === "s" || ev.key === "S") {
          ev.preventDefault();
          setPanel((p) => !p);
        }
      } else if (ev.key === "r" || ev.key === "R") {
        ev.preventDefault();
        reset();
      } else if (ev.key === "s" || ev.key === "S") {
        ev.preventDefault();
        setPanel((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [
    arriving,
    askOpen,
    panel,
    setPanel,
    tearRef,
    rainWideRef,
    setRainWide,
    selRef,
    atWorkRef,
    setAtWork,
    pkgOpenRef,
    cardActionsRef,
    hoverShown,
    hoverActs,
    lifeBundleRef,
    setLifeOn,
    back,
    reset,
    toOpening,
    openInPlace,
  ]);
}

export function useOverviewIdleWake({
  reducedMotion,
  idle,
  waitSeconds,
  go,
}: {
  reducedMotion: RefObject<boolean>;
  idle: RefObject<{ last: number; t0: number | null; layer: LiftId | null; k: number }>;
  waitSeconds: number;
  go: () => void;
}): void {
  useEffect(() => {
    reducedMotion.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onInput = () => {
      idle.current.last = performance.now();
      idle.current.t0 = null;
    };
    const events = ["pointermove", "pointerdown", "wheel", "keydown"] as const;
    for (const ev of events) window.addEventListener(ev, onInput, { passive: true });
    const wake = window.setInterval(() => {
      if ((performance.now() - idle.current.last) / 1000 >= waitSeconds) go();
    }, 500);
    return () => {
      for (const ev of events) window.removeEventListener(ev, onInput);
      window.clearInterval(wake);
    };
  }, [reducedMotion, idle, waitSeconds, go]);
}

export function useOverviewLandHover({
  hoverRef,
  hoverNameRef,
  hoverStatusRef,
  hoverWireRef,
  hoverSide,
  hoverShown,
  hoverActs,
  setHoverThing,
  hideHoverRef,
  sceneRef,
  landRef,
  hudRef,
  lastLayout,
  lifeHot,
  selRef,
  tearRef,
  arrivingRef,
  askOpenRef,
  exitRef,
  hoverWords,
  offeredRef,
  openRef,
}: {
  hoverRef: RefObject<HTMLDivElement | null>;
  hoverNameRef: RefObject<HTMLSpanElement | null>;
  hoverStatusRef: RefObject<HTMLSpanElement | null>;
  hoverWireRef: RefObject<SVGLineElement | null>;
  hoverSide: RefObject<CardSide | null>;
  hoverShown: RefObject<boolean>;
  hoverActs: RefObject<readonly Action[]>;
  setHoverThing: Dispatch<SetStateAction<Thing | null>>;
  hideHoverRef: RefObject<() => void>;
  sceneRef: RefObject<OverviewScene | null>;
  landRef: RefObject<HTMLCanvasElement | null>;
  hudRef: RefObject<HTMLDivElement | null>;
  lastLayout: RefObject<OverviewLayout | null>;
  lifeHot: RefObject<boolean>;
  selRef: RefObject<Selection | null>;
  tearRef: RefObject<unknown>;
  arrivingRef: RefObject<boolean>;
  askOpenRef: RefObject<boolean>;
  exitRef: RefObject<{ away: number }>;
  hoverWords: RefObject<{
    routes: readonly { id: string; title: string }[];
    limits: readonly [number, number] | null;
  }>;
  offeredRef: RefObject<ReadonlySet<ViewKind>>;
  openRef: RefObject<(href: string) => boolean>;
}): void {
  useEffect(() => {
    let raf = 0;
    let last: PointerEvent | null = null;
    let held = false;
    const hide = () => {
      const el = hoverRef.current;
      if (el) el.removeAttribute("data-shown");
      if (hoverWireRef.current) hoverWireRef.current.style.opacity = "0";
      hoverSide.current = null;
      hoverShown.current = false;
    };
    hideHoverRef.current = hide;
    const show = () => {
      raf = 0;
      const ev = last;
      const scene = sceneRef.current;
      const land = landRef.current;
      const hud = hudRef.current;
      const el = hoverRef.current;
      const layout = lastLayout.current;
      if (!ev || !scene || !land || !hud || !el || !layout) return;
      const t = ev.target as HTMLElement | null;
      const quiet =
        held ||
        lifeHot.current ||
        selRef.current !== null ||
        tearRef.current !== null ||
        arrivingRef.current ||
        askOpenRef.current ||
        exitRef.current.away > 0 ||
        Boolean(
          t?.closest("button, a, input, textarea, [role='dialog'], [data-ask], [data-hover-off]"),
        );
      if (quiet) {
        hide();
        return;
      }
      const r = land.getBoundingClientRect();
      const p = scene.probe(ev.clientX - r.left, ev.clientY - r.top);
      if (!p) {
        hide();
        return;
      }
      const { routes, limits } = hoverWords.current;
      const route = p.route ? routes.find((x) => x.id === p.route) : undefined;
      const height = format("overview.hover.height", { value: metres(Math.round(p.h)) });
      const part = p.inPixel
        ? en["overview.pixel"].text
        : route
          ? route.title
          : p.order !== null
            ? format("overview.hover.drainage", { order: p.order })
            : p.cover === "tree"
              ? en["overview.key.tree"].text
              : p.cover === "crop"
                ? format("overview.key.crop", { year: WORLDCOVER.year })
                : null;
      // the part under the cursor names the label; bare land is named by its height
      const name = part ?? height;
      const thing: Thing = p.inPixel ? "pixel" : route ? "route" : "land";
      hoverActs.current = actionsFor(thing, offeredRef.current, false);
      setHoverThing((prev) => (prev === thing ? prev : thing));
      const lines = part ? [height] : [];
      if (limits) {
        const [lo, hi] = limits;
        lines.push(
          p.h < lo
            ? format("overview.hover.band.low", { limit: metres(lo) })
            : p.h < hi
              ? format("overview.hover.band.mid", { lower: metres(lo), upper: metres(hi) })
              : format("overview.hover.band.high", { limit: metres(hi) }),
        );
      }
      if (hoverNameRef.current) hoverNameRef.current.textContent = name;
      if (hoverStatusRef.current) hoverStatusRef.current.textContent = lines.join("\n");
      // the label stands beside the cursor by the same rule as a finding's card, its hairline from the point
      const hb = hud.getBoundingClientRect();
      const sc = layout.fit.scale;
      const at = { x: (ev.clientX - hb.left) / sc, y: (ev.clientY - hb.top) / sc };
      const w = el.offsetWidth || 240;
      const h = el.offsetHeight || 60;
      const subject = { x0: at.x - 16, y0: at.y - 16, x1: at.x + 16, y1: at.y + 16 };
      const { box, side } = placeCard(at, w, h, subject, hoverSide.current);
      hoverSide.current = side;
      el.style.left = `${box.x0.toFixed(1)}px`;
      el.style.top = `${box.y0.toFixed(1)}px`;
      el.dataset.side =
        side === "left" || side === "upLeft" || side === "downLeft" ? "left" : "right";
      el.setAttribute("data-shown", "");
      hoverShown.current = true;
      const wire = hoverWireRef.current;
      if (wire) {
        const e2 = nearestOnBox(at, box);
        wire.setAttribute("x1", at.x.toFixed(1));
        wire.setAttribute("y1", at.y.toFixed(1));
        wire.setAttribute("x2", e2.x.toFixed(1));
        wire.setAttribute("y2", e2.y.toFixed(1));
        wire.style.opacity = "0.85";
      }
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!raf) raf = requestAnimationFrame(show);
    };
    // a plain click on the land (no drag) runs the label's Enter action
    let down: { x: number; y: number; shown: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, shown: hoverShown.current };
      held = true;
      hide();
    };
    const onUp = (e: PointerEvent) => {
      held = false;
      const d = down;
      down = null;
      if (!d?.shown || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("button, a, input, textarea, [role='dialog'], [data-ask]")) return;
      const primary = actionForKey(hoverActs.current, "Enter");
      if (primary?.view) openRef.current(VIEW_HREF[primary.view]);
    };
    const onLeave = () => {
      last = null;
      hide();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);
}
