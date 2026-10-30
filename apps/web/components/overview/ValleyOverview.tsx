"use client";

// The overview (approved specimen D4) at /valley: the catchment relief seen along the valley's long axis inside one
// hairline arc, open at the bottom, with five findings at fixed clock angles and the proposed field check marked on
// the land. Hover or focus a finding: its halo grows, its numeral comes to full ink, its arrow fills, a hairline joins
// dot and label, and the others dim. Click or Enter opens it: the camera turns toward its side, the land blurs, and
// its record opens on its side (D4's opened node, built from the case) with the way to its full instrument; Esc
// returns. The ask circle or "/" opens the ask; Enter sends the question
// the way the valley's command line does. The case's proposed walking routes lie on the land as dashed amber lines
// with a small mark at each end; their one entry, under the key, lifts them on hover and opens them (the same
// movement, the land under them kept sharp) with each route's figures from the bundle. The scene is drawn by lib/overview/scene; this component owns the words and
// places them from each render's layout, as the specimen's setState did.

import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { en, format, type MessageId } from "../../lib/copy/en";
import { instrumentOf } from "../../lib/instruments/listing";
import {
  SEASON_TREND_YEARS,
  VALLEY_FIXTURES,
  WORLDCOVER,
} from "../../lib/instruments/valley/fixtures";
import { clamp01, ease, labelAt, labelSide, lerp, wireTo } from "../../lib/overview/arc";
import { shouldReopen } from "../../lib/overview/ask-line";
import { loadOverviewData, type OverviewData } from "../../lib/overview/data";
import { findingsFrom, type Finding, type FindingId } from "../../lib/overview/findings";
import {
  EXAG,
  OVERVIEW_DESIGN as DESIGN,
  ROUTE_QUIET,
  mountOverview,
  type OverviewLayout,
  type OverviewScene,
  type Selection,
} from "../../lib/overview/scene/overview";
import { catchmentAreaKm2 } from "../../lib/overview/record";
import { loadRecord, type RecordData } from "../../lib/overview/record-data";
import { inBundleOrder, loadRoutesRecord } from "../../lib/overview/routes";
import { placesFrom, type Place } from "../../lib/instruments/valley/context";
import { placeNamesFromCase } from "../../lib/projection/arrival";
import { takeQuestion } from "../../lib/shell/handoff";
import {
  useBlockedReasons,
  useInstrumentRecords,
  useRecordsRefresh,
} from "../instruments/InstrumentRecords";
import {
  Breadcrumb,
  KeyLegend,
  OPENING_HREF,
  SourcesLine,
  SourcesPanel,
  ViewControl,
  typing,
  type KeyEntry,
} from "../controls/ScreenChrome";
import { Ask } from "./Ask";
import { OverviewRecord } from "./OverviewRecord";
import { OverviewResults } from "./OverviewResults";
import { OverviewRoutes, type RoutesLoad } from "./OverviewRoutes";
import { useOverviewAsk } from "./useOverviewAsk";
import styles from "./ValleyOverview.module.css";

/** Seconds for each move: the opening, a finding's hover, the ask circle's hover, the ask opening, the routes' hover. */
const DUR = { s: 1.0, h: 0.3, k: 0.25, o: 0.7, r: 0.3 } as const;
/** How far the land and the findings rise while the ask is open (design px). */
const LIFT = 34;
/** The ask circle's radius on the arc (design px). */
const ASK_R = 56;

/** Each finding's caption lines under its number. */
function captionOf(id: FindingId, bandLimit: string): string[] {
  const [from, to] = SEASON_TREND_YEARS;
  switch (id) {
    case "catchment":
      return [
        en["overview.finding.catchment.1"].text,
        format("overview.finding.catchment.2", { from, to }),
      ];
    case "band":
      return [format("overview.finding.band.1", { limit: bandLimit })];
    case "pixel":
      return [en["overview.finding.pixel.1"].text];
    case "rain":
      return [en["overview.finding.rain.1"].text, en["overview.finding.rain.2"].text];
    case "fdr":
      return [en["overview.finding.fdr.1"].text, en["overview.finding.fdr.2"].text];
  }
}

/** The circled arrow: a hairline circle with an arrow pointing outward along the finding's angle. */
function Arrow({ deg, className }: { deg: number; className: string | undefined }) {
  return (
    <svg className={className} viewBox="-9 -9 18 18" aria-hidden="true">
      <circle r="8.2" />
      <g transform={`rotate(${String(deg)})`}>
        <path d="M0 4 L0 -4 M-2.6 -1.4 L0 -4 L2.6 -1.4" />
      </g>
    </svg>
  );
}

const CREDITS: MessageId[] = [
  "instrument.credit.modisNdvi",
  "instrument.credit.chirps",
  "instrument.credit.worldcover",
  "instrument.credit.dem",
];
/** The data's short names for the one visible line. */
const SHORT: MessageId[] = ["source.modis", "source.chirps", "source.worldcover", "source.dem"];

/** The last crumb while something is open: the finding's own number with a few words, or what opened. */
function crumbOf(sel: Selection, findings: readonly Finding[], bandLimit: string): string {
  const f = findings.find((x) => x.id === sel);
  switch (sel) {
    case "field":
      return en["overview.crumb.field"].text;
    case "routes":
      return en["overview.crumb.routes"].text;
    case "results":
      return en["overview.crumb.results"].text;
    case "band":
      return format("overview.crumb.band", { value: f?.display ?? "", limit: bandLimit });
    default:
      return format(`overview.crumb.${sel}` as MessageId, { value: f?.display ?? "" });
  }
}

export function ValleyOverview({
  onSettled,
}: {
  /** Once the land is drawn and the words placed, or the overview has failed (the journey's cross-fade). */
  onSettled?: () => void;
}) {
  return (
    <div className={styles.root} data-theme="obsidian" data-overview>
      <div className={styles.ground} aria-hidden="true" />
      <OverviewRecords onSettled={onSettled} />
    </div>
  );
}

function OverviewRecords({ onSettled }: { onSettled: (() => void) | undefined }) {
  const records = useInstrumentRecords();
  const failed = records.status === "failed";
  useEffect(() => {
    if (failed) onSettled?.();
  }, [failed, onSettled]);
  if (records.status === "ready")
    return (
      <OverviewReady snapshot={records.snapshot} listing={records.listing} onSettled={onSettled} />
    );
  if (!failed) return null;
  return (
    <p className={styles.failed} role="status">
      {en["overview.failed"].text}
    </p>
  );
}

interface Live {
  s: number;
  h: number;
  k: number;
  o: number;
  r: number;
}

/** The visitor's own view: a factor on the camera's distance and a turn of its bearing (degrees). */
const ZOOM = { min: 0.55, max: 1.8 } as const;
const TURN_MAX = 60;

function OverviewReady({
  snapshot,
  listing,
  onSettled,
}: {
  snapshot: CaseSnapshot;
  listing: InstrumentListing;
  onSettled: (() => void) | undefined;
}) {
  const { findings: all, bandLimit } = useMemo(
    () => findingsFrom(snapshot, listing),
    [snapshot, listing],
  );
  // the band's caption names its limit: without the limit the band is not shown
  const findings = useMemo(
    () => all.filter((f) => f.id !== "band" || bandLimit !== null),
    [all, bandLimit],
  );
  const layers = instrumentOf(listing, "layer_stack");
  const pixel = instrumentOf(listing, "pixel_anatomy") ?? null;
  // the amber mark stands for the case's own field plan: none is drawn until the composer has opened one
  const planned = instrumentOf(listing, "field_plan") !== undefined;
  const names = placeNamesFromCase(snapshot);
  const area = catchmentAreaKm2(snapshot);
  const reasons = useBlockedReasons("field_plan");
  const descriptionId = useId();

  const [data, setData] = useState<OverviewData | null>(null);
  const [failed, setFailed] = useState(layers === undefined);
  // the land is read again only when the specs it is drawn from change, not on every new case revision
  const sources = useRef({ layers, pixel, snapshot });
  sources.current = { layers, pixel, snapshot };
  const landKey = JSON.stringify([
    layers?.spec.id,
    layers?.spec.revision,
    pixel?.spec.id,
    pixel?.spec.revision,
  ]);
  useEffect(() => {
    const { layers, pixel, snapshot } = sources.current;
    if (!layers) return;
    const ac = new AbortController();
    loadOverviewData(layers, pixel, snapshot, VALLEY_FIXTURES, undefined, ac.signal).then(
      setData,
      (e: unknown) => {
        if (ac.signal.aborted) return;
        console.error("Overview not loaded", e);
        setFailed(true);
      },
    );
    return () => {
      ac.abort();
    };
  }, [landKey]);

  // the ask; when the session's case revision moves past the records', the records are reopened for it and the
  // findings, the records and the field plan follow without a reload
  const ask = useOverviewAsk(snapshot);
  const refresh = useRecordsRefresh();
  const reopening = useRef<number | null>(null);
  useEffect(() => {
    const at = ask.snapshot.case.revision;
    if (!shouldReopen(snapshot.case.revision, at, reopening.current)) return;
    reopening.current = at;
    refresh(ask.snapshot);
  }, [ask.snapshot, snapshot.case.revision, refresh]);
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState("");
  const [askHover, setAskHover] = useState(false);
  useEffect(() => {
    // a question typed on an instrument page arrives here, open and focused; nothing is sent until Enter
    const q = takeQuestion();
    if (q) {
      setAskText(q);
      setAskOpen(true);
    }
  }, []);

  // ---------- the moving state, kept out of React: one render of the scene per frame while anything moves ----------
  const sceneRef = useRef<OverviewScene | null>(null);
  const live = useRef<Live>({ s: 0, h: 0, k: 0, o: 0, r: 0 });
  const goal = useRef<Live>({ s: 0, h: 0, k: 0, o: 0, r: 0 });
  const hov = useRef<FindingId | null>(null);
  const selRef = useRef<Selection | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const raf = useRef(0);
  const last = useRef(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const landRef = useRef<HTMLCanvasElement>(null);
  const arcRef = useRef<HTMLCanvasElement>(null);
  const blurRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const liftRef = useRef<HTMLDivElement>(null);
  const cornerRef = useRef<HTMLDivElement>(null);
  const camRef = useRef({ zoom: 1, turn: 0 });
  const [moved, setMoved] = useState(false);
  const recRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<HTMLElement>(null);
  const bigRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const evidRef = useRef<HTMLElement>(null);
  const frostRef = useRef<HTMLDivElement>(null);
  const connectorRef = useRef<SVGSVGElement>(null);
  const midcapRef = useRef<HTMLDivElement>(null);
  const firstResultRef = useRef<HTMLLIElement>(null);
  const askCircleRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLButtonElement>(null);
  const fieldTagRef = useRef<HTMLSpanElement>(null);
  const pixTagRef = useRef<HTMLDivElement>(null);
  const selWireRef = useRef<SVGLineElement>(null);
  const routesRef = useRef<HTMLButtonElement>(null);
  /** The route picked in the opened list (hovered or focused), if any. */
  const pickRef = useRef<string | null>(null);
  const endRefs = useRef(new Map<string, HTMLElement>());
  const startRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef(new Map<FindingId, HTMLDivElement>());
  const labelRefs = useRef(new Map<FindingId, HTMLButtonElement>());
  const numeralRefs = useRef(new Map<FindingId, HTMLSpanElement>());
  const wireRefs = useRef(new Map<FindingId, SVGLineElement>());
  const lastLayout = useRef<OverviewLayout | null>(null);

  /** An element's box on the 1440 x 900 stage (design px), through the stage's transform. */
  const toDesign = (el: Element, scale: number) => {
    const h = hudRef.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const ox = h?.left ?? 0;
    const oy = h?.top ?? 0;
    return {
      left: (r.left - ox) / scale,
      top: (r.top - oy) / scale,
      right: (r.right - ox) / scale,
      bottom: (r.bottom - oy) / scale,
    };
  };

  // the record as D4's nodeHud placed it: the frost around the record, the dotted line from under the record to the
  // context with its caption at the midpoint; returns the boxes the findings' labels keep clear of
  const placeRecord = (cc: number, scale: number) => {
    const rec = recRef.current;
    const inst = instRef.current;
    if (!rec || !inst) return [];
    rec.style.opacity = cc.toFixed(3);
    rec.style.visibility = cc > 0.001 ? "visible" : "hidden";
    inst.style.transform = `translateX(${(36 * (1 - cc)).toFixed(1)}px)`;
    if (linkRef.current) linkRef.current.style.pointerEvents = cc > 0.5 ? "auto" : "none";
    const ib = toDesign(inst, scale);
    const frost = frostRef.current;
    if (frost)
      Object.assign(frost.style, {
        left: `${(ib.left - 110).toFixed(1)}px`,
        top: `${(ib.top - 90).toFixed(1)}px`,
        width: `${(ib.right - ib.left + 220).toFixed(1)}px`,
        height: `${(ib.bottom - ib.top + 180).toFixed(1)}px`,
      });
    const keep = [ib];
    const evid = evidRef.current;
    const link = linkRef.current;
    const svg = connectorRef.current;
    if (evid && link && svg) {
      const eb = toDesign(evid, scale);
      const lb = toDesign(link, scale);
      keep.push(eb);
      const sx = eb.left + 20;
      const sy = lb.bottom + 16;
      const ey = eb.top - 16;
      svg
        .querySelector("path")
        ?.setAttribute(
          "d",
          `M${sx.toFixed(1)} ${sy.toFixed(1)} L${sx.toFixed(1)} ${ey.toFixed(1)}`,
        );
      const [c0, c1] = svg.querySelectorAll("circle");
      c0?.setAttribute("cx", sx.toFixed(1));
      c0?.setAttribute("cy", sy.toFixed(1));
      c1?.setAttribute("cx", sx.toFixed(1));
      c1?.setAttribute("cy", ey.toFixed(1));
      const mid = midcapRef.current;
      if (mid) {
        mid.style.left = `${(sx + 12).toFixed(1)}px`;
        mid.style.top = `${((sy + ey) / 2 - 8).toFixed(1)}px`;
      }
    }
    return cc > 0.01 ? keep : [];
  };

  const findingsRef = useRef(findings);
  findingsRef.current = findings;

  // the specimen's setState, for the words: places every label, dot, hairline and mark from the scene's layout
  const apply = useCallback((layout: OverviewLayout) => {
    lastLayout.current = layout;
    const { s, h, k, o } = live.current;
    const { fit, e } = layout;
    const oe = ease(o);
    const selected = selRef.current;
    const hud = hudRef.current;
    if (hud)
      hud.style.transform = `translate(${fit.ox.toFixed(2)}px, ${fit.oy.toFixed(2)}px) scale(${fit.scale.toFixed(5)})`;
    const lift = `translateY(${(-LIFT * oe * fit.scale).toFixed(2)}px)`;
    for (const c of [landRef.current, arcRef.current, blurRef.current])
      if (c) c.style.transform = lift;
    if (liftRef.current)
      liftRef.current.style.transform = `translateY(${(-LIFT * oe).toFixed(2)}px)`;
    // the opened record fades in once the space has moved (D4: from 62% of the move)
    const cc = ease(clamp01((s - 0.62) / 0.38));
    const keep = placeRecord(cc, fit.scale);
    // findings: rest, hover, opened, the ask; while the ask circle is hovered the findings step back a little
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
      let op =
        (1 - 0.38 * other) *
        (1 - 0.3 * k) *
        lerp(1, isSel ? 0 : 0.3, e) *
        (lower ? 1 - oe : 1 - 0.16 * oe) *
        (isSel ? 1 : place.onArc);
      if (e > 0.01) {
        // as the record opens, every label steps back to a blurred trace; traces that would sit under the record,
        // off the frame or behind the land go
        const r = {
          left: at.x,
          top: at.y,
          right: at.x + label.offsetWidth,
          bottom: at.y + label.offsetHeight,
        };
        const hit = keep.some(
          (q) =>
            r.left < q.right + 24 &&
            q.left - 24 < r.right &&
            r.top < q.bottom + 24 &&
            q.top - 24 < r.bottom,
        );
        const out = Math.min(r.left, r.top, DESIGN.width - r.right, DESIGN.height - r.bottom) < 0;
        // the routes opened leave no ring label behind, not even a blurred trace
        if (hit || place.behind || out || selected === "routes") op *= 1 - e;
      }
      label.style.opacity = op.toFixed(3);
      label.style.filter = e > 0.01 ? `blur(${(2.4 * e).toFixed(2)}px)` : "none";
      label.style.setProperty("--hov", hv.toFixed(3));
      // a label stepping back or faint takes no pointer
      const quiet = Math.max(e - 0.05, 0.2 - op) > 0;
      label.style.pointerEvents = quiet ? "none" : "auto";
      dot.style.setProperty("--hov", (isSel ? Math.max(hv, e) : hv).toFixed(3));
      dot.style.opacity = (
        place.behind
          ? 0
          : isSel
            ? 1
            : (1 - 0.38 * other) * (1 - 0.3 * k) * (1 - 0.6 * e) * place.onArc
      ).toFixed(3);
      if (wire) wire.style.opacity = (hv * (1 - e)).toFixed(3);
    }
    // the opened finding keeps its dot and joins the record by one hairline, to the left of its numeral
    const sw = selWireRef.current;
    const sp =
      selected && selected !== "field" && selected !== "results" && selected !== "routes"
        ? layout.findings[selected]
        : undefined;
    const big = bigRef.current ? toDesign(bigRef.current, fit.scale) : null;
    if (sw) {
      if (sp && big) {
        const tx = big.left - 14;
        const ty = big.top + (big.bottom - big.top) * 0.55;
        const L = Math.hypot(tx - sp.dot.x, ty - sp.dot.y) || 1;
        sw.setAttribute("x1", (sp.dot.x + ((tx - sp.dot.x) * 9) / L).toFixed(2));
        sw.setAttribute("y1", (sp.dot.y + ((ty - sp.dot.y) * 9) / L).toFixed(2));
        sw.setAttribute("x2", tx.toFixed(2));
        sw.setAttribute("y2", ty.toFixed(2));
      }
      sw.style.opacity = sp && big ? cc.toFixed(3) : "0";
    }
    // the ask circle sits on the arc's start; it steps away as the space moves toward a finding
    const away = ease(clamp01(s / 0.55));
    const circle = askCircleRef.current;
    if (circle) {
      circle.style.left = `${layout.ask.x.toFixed(2)}px`;
      circle.style.top = `${layout.ask.y.toFixed(2)}px`;
      circle.style.opacity = (1 - away).toFixed(3);
      circle.style.visibility = away > 0.99 ? "hidden" : "visible";
      circle.style.transform = `translateY(${(-LIFT * oe).toFixed(2)}px) scale(${(1 + 0.04 * Math.max(k, oe)).toFixed(4)})`;
    }
    // the land marks: the proposed field check, and the opened pixel's name
    const field = fieldRef.current;
    if (field && layout.field) {
      field.style.left = `${layout.field.x.toFixed(2)}px`;
      field.style.top = `${layout.field.y.toFixed(2)}px`;
    }
    // the field mark's label leaves while the results or the routes are open, so no text stays on the land
    if (fieldTagRef.current)
      fieldTagRef.current.style.opacity = (
        (1 - 0.38 * h) *
        (1 - 0.3 * k) *
        (1 - oe) *
        (selected === "results" || selected === "routes" ? 1 - e : 1)
      ).toFixed(3);
    // each route's end: a small amber mark, lifted with the routes, gone where the land hides it
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
      // its number, matching the opened list, shows once the routes are opened
      el.style.setProperty(
        "--num",
        (selected === "routes" ? clamp01((e - 0.5) / 0.5) : 0).toFixed(3),
      );
    }
    // the routes' shared start, named from the record while the routes are opened
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
    const dt = Math.min(0.05, (t - last.current) / 1000);
    last.current = t;
    let moving = false;
    const l = live.current;
    const gl = goal.current;
    for (const key of ["s", "h", "k", "o", "r"] as const) {
      const d = gl[key] - l[key];
      const step = dt / DUR[key];
      l[key] = Math.abs(d) <= step ? gl[key] : l[key] + Math.sign(d) * step;
      if (l[key] !== gl[key]) moving = true;
    }
    // a closed finding is let go once the space is back at rest
    if (l.s === 0 && gl.s === 0 && selRef.current) {
      selRef.current = null;
      setSel(null);
    }
    scene.render({ ...l, ...camRef.current, sel: selRef.current, route: pickRef.current });
    raf.current = moving ? requestAnimationFrame(frame) : 0;
  }, []);
  const go = useCallback(() => {
    if (raf.current) return;
    last.current = performance.now();
    raf.current = requestAnimationFrame(frame);
  }, [frame]);

  const settled = useRef(onSettled);
  settled.current = onSettled;
  useEffect(() => {
    if (failed) settled.current?.();
  }, [failed]);
  const arcKey = findings.map((f) => `${f.id}@${String(f.clock)}`).join(" ");
  const bandLimitM = bandLimit?.value ?? null;
  // mount the scene once the data is in
  useEffect(() => {
    const land = landRef.current;
    const arc = arcRef.current;
    const blur = blurRef.current;
    if (!data || !land || !arc || !blur) return;
    let scene: OverviewScene;
    try {
      scene = mountOverview(
        { land, arc, blur },
        data,
        findingsRef.current.map((f) => ({ id: f.id, clock: f.clock })),
        bandLimitM,
      );
    } catch (e) {
      console.error("Overview not drawn", e);
      setFailed(true);
      return;
    }
    sceneRef.current = scene;
    scene.onLayout(apply);
    scene.render({ ...live.current, ...camRef.current, sel: selRef.current });
    // the arc's and the ask circle's clearance from the land, as the specimen measured them
    scene
      .measureGaps()
      .then((g) => {
        const root = rootRef.current;
        const at = lastLayout.current;
        if (!root || !at) return;
        root.dataset.arcGap = g.arc.toFixed(1);
        root.dataset.askGap = (g.distanceAt(at.ask) - ASK_R).toFixed(1);
        root.dataset.ready = "";
        settled.current?.();
      })
      .catch((e: unknown) => {
        console.error("Overview gaps not measured", e);
      });
    return () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      sceneRef.current = null;
      scene.dispose();
    };
    // the scene follows which findings stand on the arc and the band limit, not their numbers
  }, [data, arcKey, bandLimitM, apply]);
  // new numbers change the labels' sizes: place them again
  useEffect(() => {
    go();
  }, [findings, go]);

  // ---------- the opened record's data, read from the case when a finding first opens ----------
  const [recordData, setRecordData] = useState<Partial<Record<FindingId, RecordData>>>({});
  // a new case revision may change what a record shows: read it again when it next opens
  useEffect(() => {
    setRecordData({});
  }, [listing.caseRevision]);
  useEffect(() => {
    if (!sel || sel === "field" || sel === "results" || sel === "routes" || recordData[sel]) return;
    const id = sel;
    const ac = new AbortController();
    loadRecord(id, listing, snapshot, data?.pixel?.series ?? null, undefined, ac.signal).then(
      (r) => {
        setRecordData((m) => ({ ...m, [id]: r }));
      },
      (e: unknown) => {
        if (ac.signal.aborted) return;
        console.error("Record not loaded", e);
        setRecordData((m) => ({ ...m, [id]: { chart: null, scatter: null, context: null } }));
      },
    );
    return () => {
      ac.abort();
    };
  }, [sel, recordData, listing, snapshot, data]);
  // the routes' figures and cost function, read from their bundle through the read API once the land is in
  const [routesLoad, setRoutesLoad] = useState<RoutesLoad>({ status: "loading" });
  const caseId = snapshot.case.id;
  useEffect(() => {
    if (!data?.routes.length) return;
    const ac = new AbortController();
    setRoutesLoad({ status: "loading" });
    loadRoutesRecord(caseId, data.routes, undefined, ac.signal).then(
      (record) => {
        setRoutesLoad({ status: "ready", record });
      },
      (e: unknown) => {
        if (ac.signal.aborted) return;
        console.error("Routes not loaded", e);
        setRoutesLoad({ status: "failed" });
      },
    );
    return () => {
      ac.abort();
    };
  }, [caseId, data]);
  // the record's words are placed with the next frame
  useEffect(() => {
    go();
  }, [sel, recordData, routesLoad, go]);

  // ---------- interaction ----------
  const hover = (id: FindingId, on: boolean) => {
    if (on) hov.current = id;
    goal.current.h = on ? 1 : 0;
    go();
  };
  const pickRoute = useCallback(
    (id: string | null) => {
      pickRef.current = id;
      go();
    },
    [go],
  );
  const hoverRoutes = (on: boolean) => {
    goal.current.r = on ? 1 : 0;
    go();
  };
  const open = (id: Selection) => {
    if (selRef.current && selRef.current !== id) return;
    selRef.current = id;
    setSel(id);
    pickRef.current = null;
    goal.current.s = 1;
    setAskOpen(false);
    go();
    window.setTimeout(() => {
      (id === "results" || id === "routes" ? firstResultRef.current : linkRef.current)?.focus({
        preventScroll: true,
      });
    }, 0);
  };
  const back = useCallback(() => {
    const was = selRef.current;
    goal.current.s = 0;
    go();
    if (was === "field") fieldRef.current?.focus({ preventScroll: true });
    else if (was === "routes") routesRef.current?.focus({ preventScroll: true });
    else if (was === "results")
      // the ask circle comes back with the overview
      window.setTimeout(() => askCircleRef.current?.focus({ preventScroll: true }), DUR.s * 1000);
    else if (was) labelRefs.current.get(was)?.focus({ preventScroll: true });
  }, [go]);
  // the visitor's own view: zoom (scroll or the view control) and turn (drag), both undone by R
  const setCam = useCallback(
    (next: { zoom?: number; turn?: number }) => {
      const c = camRef.current;
      c.zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, next.zoom ?? c.zoom));
      c.turn = Math.min(TURN_MAX, Math.max(-TURN_MAX, next.turn ?? c.turn));
      setMoved(Math.abs(c.zoom - 1) > 1e-3 || Math.abs(c.turn) > 0.1);
      go();
    },
    [go],
  );
  const zoomBy = useCallback(
    (f: number) => {
      setCam({ zoom: camRef.current.zoom * f });
    },
    [setCam],
  );
  const [panel, setPanel] = useState(false);
  const toOpening = useCallback(() => {
    window.location.assign(OPENING_HREF);
  }, []);
  // R: the overview's pose again, closing what is open
  const reset = useCallback(() => {
    if (selRef.current) back();
    setCam({ zoom: 1, turn: 0 });
  }, [back, setCam]);
  // Esc goes back one level: the panel, then what is open, then the opening; R resets; S the sources
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (askOpen || typing(ev)) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        if (panel) setPanel(false);
        else if (selRef.current) back();
        else toOpening();
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
  }, [askOpen, panel, back, reset, toOpening]);
  // drag on the land turns it, the wheel zooms
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
  }, [setCam]);
  useEffect(() => {
    goal.current.o = askOpen ? 1 : 0;
    go();
  }, [askOpen, go]);
  useEffect(() => {
    goal.current.k = askHover ? 1 : 0;
    go();
  }, [askHover, go]);
  const onAskOpen = useCallback(() => {
    setAskText("");
    setAskOpen(true);
  }, []);
  const onAskClose = useCallback(() => {
    setAskOpen(false);
  }, []);

  // the routes' start, the place the proposed_routes summary names, with the credit its source requires
  const origin = useMemo((): Place | null => {
    if (routesLoad.status !== "ready") return null;
    try {
      return placesFrom(snapshot, [routesLoad.record.cost.originId])[0] ?? null;
    } catch {
      return null;
    }
  }, [routesLoad, snapshot]);
  // the routes numbered in the opened list's order
  const routeNumber = useMemo(() => {
    const order = routesLoad.status === "ready" ? routesLoad.record.order : undefined;
    return new Map(inBundleOrder(data?.routes ?? [], order).map((r, i) => [r.id, i + 1]));
  }, [data, routesLoad]);
  // every credit in full behind S; the data's short names stay visible (GeoNames while the routes name Tabant)
  const named = sel === "routes" ? origin : null;
  const sourceSet = {
    lines: [...CREDITS.map((id) => en[id].text), ...(named ? [named.attribution] : [])],
    short: [...SHORT.map((id) => en[id].text), ...(named ? [en["source.geonames"].text] : [])],
  };
  const keys: KeyEntry[] = [
    {
      chip: "Esc",
      shortcut: "Escape",
      label: en["chrome.key.back"].text,
      onPress: () => {
        if (selRef.current) back();
        else toOpening();
      },
    },
    { chip: "R", shortcut: "R", label: en["chrome.key.reset"].text, onPress: reset },
    { chip: "/", shortcut: "/", label: en["chrome.key.ask"].text, onPress: onAskOpen },
    {
      chip: "S",
      shortcut: "S",
      label: en["chrome.key.sources"].text,
      onPress: () => {
        setPanel((p) => !p);
      },
      pressed: panel,
    },
  ];
  const selFinding =
    sel && sel !== "field" && sel !== "results" && sel !== "routes"
      ? (findings.find((f) => f.id === sel) ?? null)
      : null;
  const results = sel === "results" ? ask.commandId : null;

  return (
    <div
      ref={rootRef}
      className={styles.layer}
      data-overview-root
      data-case-revision={snapshot.case.revision}
    >
      <p id={descriptionId} className={styles.srOnly}>
        {en["overview.description"].text} {en["overview.keys"].text}
      </p>
      <canvas ref={landRef} className={styles.canvas} aria-hidden="true" />
      <canvas ref={blurRef} className={styles.blur} aria-hidden="true" />
      <canvas ref={arcRef} className={styles.canvas} aria-hidden="true" />
      <div ref={cornerRef} className={styles.cornerfade} aria-hidden="true" />
      <div ref={hudRef} className={styles.hud}>
        <div className={styles.question}>{snapshot.case.objective}</div>
        <div ref={liftRef} className={styles.lift}>
          <svg className={styles.marks} aria-hidden="true">
            {findings.map((f) => (
              <line
                key={f.id}
                className={styles.wire}
                data-wire={f.id}
                ref={(el) => {
                  if (el) wireRefs.current.set(f.id, el);
                  else wireRefs.current.delete(f.id);
                }}
              />
            ))}
            <line ref={selWireRef} className={styles.wire} />
          </svg>
          {data && layers && pixel ? (
            <>
              {planned && (
                <button
                  ref={fieldRef}
                  type="button"
                  className={styles.field}
                  data-field-mark
                  onClick={() => {
                    open("field");
                  }}
                >
                  <i className={styles.ring} aria-hidden="true" />
                  <span ref={fieldTagRef} className={styles.fieldTag}>
                    {en["overview.field"].text}
                    <Arrow deg={45} className={styles.tagArrow} />
                  </span>
                </button>
              )}
              <div ref={pixTagRef} className={styles.pixTag}>
                <span>{en["overview.pixel"].text}</span>
              </div>
              {data.routes.map((r) => (
                <span
                  key={r.id}
                  className={styles.site}
                  data-route-end={r.member}
                  aria-hidden="true"
                  ref={(el) => {
                    if (el) endRefs.current.set(r.id, el);
                    else endRefs.current.delete(r.id);
                  }}
                >
                  <i className={styles.siteRing} />
                  <span className={styles.siteNum}>{routeNumber.get(r.id)}</span>
                </span>
              ))}
              {origin ? (
                <div ref={startRef} className={styles.startTag} data-route-start>
                  <span>{origin.name}</span>
                </div>
              ) : null}
            </>
          ) : null}
          <section className={styles.findings} aria-label={en["overview.findings"].text}>
            {data
              ? findings.map((f) => (
                  <FindingMark
                    key={f.id}
                    finding={f}
                    caption={captionOf(f.id, bandLimit?.display ?? "")}
                    describedBy={descriptionId}
                    dotRef={(el) => {
                      if (el) dotRefs.current.set(f.id, el);
                      else dotRefs.current.delete(f.id);
                    }}
                    labelRef={(el) => {
                      if (el) labelRefs.current.set(f.id, el);
                      else labelRefs.current.delete(f.id);
                    }}
                    numeralRef={(el) => {
                      if (el) numeralRefs.current.set(f.id, el);
                      else numeralRefs.current.delete(f.id);
                    }}
                    onHover={(on) => {
                      hover(f.id, on);
                    }}
                    onOpen={() => {
                      open(f.id);
                    }}
                  />
                ))
              : null}
          </section>
        </div>
        <footer className={styles.place}>
          <div className={styles.name}>{names.valleyName}</div>
          {area !== null ? (
            <div className={styles.sub}>
              {format("arrival.studyArea", { label: names.areaLabel, area })}
            </div>
          ) : null}
          <div className={styles.key}>
            <span>
              <i className={styles.swatch} aria-hidden="true" />
              {en["overview.key.tree"].text}
            </span>
            <span>
              <i className={`${styles.swatch} ${styles.crop}`} aria-hidden="true" />
              {format("overview.key.crop", { year: WORLDCOVER.year })}
            </span>
            <span>{format("instrument.layers.scale", { value: EXAG })}</span>
          </div>
          {data && data.routes.length ? (
            <button
              ref={routesRef}
              type="button"
              className={styles.routes}
              data-routes-entry
              aria-expanded={sel === "routes"}
              onPointerEnter={() => {
                hoverRoutes(true);
              }}
              onPointerLeave={() => {
                hoverRoutes(false);
              }}
              onFocus={() => {
                hoverRoutes(true);
              }}
              onBlur={() => {
                hoverRoutes(false);
              }}
              onClick={() => {
                open("routes");
              }}
            >
              <i className={styles.dash} aria-hidden="true" />
              {en["overview.routes"].text}
              <Arrow deg={45} className={styles.tagArrow} />
            </button>
          ) : null}
        </footer>
        {failed ? (
          <p className={styles.failed} role="status">
            {en["overview.failed"].text}
          </p>
        ) : null}
        {sel ? (
          <>
            {results !== null ? (
              <OverviewResults
                snapshot={ask.snapshot}
                commandId={results}
                refs={{ root: recRef, inst: instRef, frost: frostRef, first: firstResultRef }}
              />
            ) : null}
            {sel === "routes" && data ? (
              <OverviewRoutes
                routes={data.routes}
                load={routesLoad}
                onPick={pickRoute}
                refs={{ root: recRef, inst: instRef, frost: frostRef, first: firstResultRef }}
              />
            ) : null}
            {sel !== "results" && sel !== "routes" ? (
              <OverviewRecord
                sel={sel}
                finding={selFinding}
                caption={selFinding ? captionOf(selFinding.id, bandLimit?.display ?? "") : []}
                bandLimit={bandLimit?.display ?? ""}
                data={sel === "field" ? null : (recordData[sel] ?? null)}
                reasons={reasons}
                fieldCaption={instrumentOf(listing, "field_plan")?.spec.caption ?? null}
                pixelNote={data?.pixel?.note ?? null}
                areaLabel={names.areaLabel}
                refs={{
                  root: recRef,
                  inst: instRef,
                  big: bigRef,
                  link: linkRef,
                  evid: evidRef,
                  frost: frostRef,
                  connector: connectorRef,
                  midcap: midcapRef,
                }}
              />
            ) : null}
          </>
        ) : null}
        {data ? (
          <Ask
            variant="arc"
            open={askOpen}
            onOpen={onAskOpen}
            onClose={onAskClose}
            text={askText}
            onText={setAskText}
            onEnter={ask.send}
            activity={ask.activity}
            onFindings={() => {
              open("results");
            }}
            onHover={setAskHover}
            circleRef={askCircleRef}
          />
        ) : null}
      </div>
      <Breadcrumb
        onBack={() => {
          if (selRef.current) back();
          else toOpening();
        }}
        crumbs={[
          { label: en["opening.title"].text, onSelect: toOpening },
          sel ? { label: names.valleyName, onSelect: back } : { label: names.valleyName },
          ...(sel ? [{ label: crumbOf(sel, findings, bandLimit?.display ?? "") }] : []),
        ]}
      />
      {data ? (
        <>
          <ViewControl
            onReset={reset}
            onZoom={(f) => {
              zoomBy(f);
            }}
          />
          <KeyLegend entries={keys}>
            <SourcesLine sources={sourceSet} />
          </KeyLegend>
          <SourcesPanel
            sources={sourceSet}
            open={panel}
            onClose={() => {
              setPanel(false);
            }}
          />
        </>
      ) : null}
      <span hidden data-view-moved={moved ? "" : undefined} />
    </div>
  );
}

function FindingMark({
  finding: f,
  caption,
  describedBy,
  dotRef,
  labelRef,
  numeralRef,
  onHover,
  onOpen,
}: {
  finding: Finding;
  caption: string[];
  describedBy: string;
  dotRef: (el: HTMLDivElement | null) => void;
  labelRef: (el: HTMLButtonElement | null) => void;
  numeralRef: (el: HTMLSpanElement | null) => void;
  onHover: (on: boolean) => void;
  onOpen: () => void;
}) {
  return (
    <>
      <div ref={dotRef} className={`${styles.dot} ${styles[f.tone] ?? ""}`} aria-hidden="true">
        <i className={styles.halo} />
        <i className={styles.core} />
      </div>
      <button
        ref={labelRef}
        type="button"
        className={styles.finding}
        data-finding={f.id}
        aria-describedby={describedBy}
        onPointerEnter={() => {
          onHover(true);
        }}
        onPointerLeave={() => {
          onHover(false);
        }}
        onFocus={() => {
          onHover(true);
        }}
        onBlur={() => {
          onHover(false);
        }}
        onClick={onOpen}
      >
        <span ref={numeralRef} className={styles.numeral}>
          <span className={styles.value}>{f.display}</span>
          <Arrow deg={f.clock} className={styles.arrow} />
        </span>
        {caption.map((line) => (
          <span key={line} className={styles.caption}>
            {line}
          </span>
        ))}
      </button>
    </>
  );
}
