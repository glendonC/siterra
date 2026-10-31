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
import { metres } from "../../lib/instruments/format";
import type { LandPose } from "../../lib/land/handoff";
import {
  nearestOnBox,
  placeCard,
  type Box as CardBox,
  type Side as CardSide,
} from "../../lib/overview/card";
import { bandLimitsOf } from "../../lib/land/record";
import { InstrumentLayerStack } from "../instruments/InstrumentLayerStack";
import { InstrumentCutaway } from "../instruments/InstrumentCutaway";
import { InstrumentFieldPlan } from "../instruments/InstrumentFieldPlan";
import { InstrumentPixelAnatomy } from "../instruments/InstrumentPixelAnatomy";
import { InstrumentRainfallScatter } from "../instruments/InstrumentRainfallScatter";
import { InstrumentShell } from "../instruments/InstrumentShell";
import { instrumentOf } from "../../lib/instruments/listing";
import { WORLDCOVER } from "../../lib/instruments/valley/fixtures";
import { clamp01, ease, labelAt, labelSide, lerp, wireTo } from "../../lib/overview/arc";
import {
  VIEW_HREF,
  VIEW_INSTRUMENT,
  actionForKey,
  actionsFor,
  type Action,
  type Thing,
  type ViewKind,
} from "../../lib/overview/actions";
import { shouldReopen } from "../../lib/overview/ask-line";
import { loadOverviewData, type OverviewData } from "../../lib/overview/data";
import {
  directionWord,
  findingsFrom,
  sharesWords,
  type Finding,
  type FindingId,
} from "../../lib/overview/findings";
import {
  EXAG,
  ROUTE_QUIET,
  awayOf,
  mountOverview,
  sideOf,
  type OverviewLayout,
  type LiftId,
  type OverviewScene,
  type Point,
  type SceneState,
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
import type { CellPaint } from "../../lib/instruments/pixel/paint";
import { ActionList } from "./ActionList";
import { OverviewRecord } from "./OverviewRecord";
import { OverviewResults } from "./OverviewResults";
import { OverviewRoutes, type RoutesLoad } from "./OverviewRoutes";
import { useOverviewAsk } from "./useOverviewAsk";
import { PackageBriefing, type LandMount, type Stands } from "../package/PackageBriefing";
import { pkg } from "../../lib/copy/package";
import type { HeightRange } from "../../lib/package/bands";
import { commandBrief, packageView } from "../../lib/package/package";
import { tm } from "../../lib/copy/time";
import { timeSourcesOf } from "../../lib/time/load";
import { TimeView, type TimeFrame, type TimeMount } from "../time/TimeView";
import { lifeSourceOf } from "../../lib/life/load";
import { LifeLayer, type LifeFrame, type LifeMount } from "../life/LifeLayer";
import styles from "./ValleyOverview.module.css";

/** Seconds for each move: the opening, a finding's hover, the ask circle's hover, the ask opening, the routes' hover. */
const DUR = { s: 1.0, h: 0.3, k: 0.25, o: 0.7, r: 0.3 } as const;
/** How far the land and the findings rise while the ask is open (design px). */
const LIFT = 34;
/** The ask circle's radius on the arc (design px). */
const ASK_R = 56;

/** Each finding's caption lines under its number. */
function captionOf(f: Finding, bandLimit: string): string[] {
  // one short line under each number (decision 16): the season and years are in the opened card
  switch (f.id) {
    case "catchment":
      return [en["overview.finding.catchment.1"].text];
    case "band":
      return [format("overview.finding.band.1", { limit: bandLimit })];
    case "pixel":
      return [en["overview.finding.pixel.1"].text];
    case "rain":
      return [en["overview.finding.rain.1"].text];
    case "fdr":
      return f.pair
        ? [en["overview.finding.fdr.pair.1"].text]
        : [
            format("overview.finding.fdr.1", { direction: directionWord(f.direction) }),
            en["overview.finding.fdr.2"].text,
          ];
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

/** What the card says of the land while a finding is open: only the trend map's rule, when its asset was read. */
function onLandOf(sel: Selection, data: OverviewData | null): string | null {
  // decision 16: the lit land shows its footprint and the hover names it; only the trend map's rule stays in words
  if (sel === "fdr") return data?.footprints.slope ? en["overview.onLand.fdrRule"].text : null;
  return null;
}

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
    case "package":
      return pkg["package.title"].text;
    case "time":
      return tm["time.crumb"].text;
    case "band":
      return format("overview.crumb.band", { value: f?.display ?? "", limit: bandLimit });
    case "fdr":
      return f ? sharesWords(f) : "";
    default:
      return format(`overview.crumb.${sel}` as MessageId, { value: f?.display ?? "" });
  }
}

/**
 * The arrival from the globe (decision 11), given by the journey: the overview is mounted while the globe shows,
 * draws its land at rest out of sight, and when `run` is set plays its arrival: the camera comes down from straight
 * above the case's point (`from`, CSS px) to the overview's pose while the land rises, then the arc draws on, then
 * the findings and the chrome fade in. `skip` ends it at once (Esc, Enter, reduced motion). Until it has ended no key
 * reaches the overview but Esc and Enter, which skip.
 */
export interface OverviewIntro {
  run: boolean;
  skip: boolean;
  from: { x: number; y: number } | null;
  onDone: () => void;
}

export function ValleyOverview({
  onSettled,
  intro,
}: {
  /** Once the land is drawn and the words placed, or the overview has failed (the journey waits on it). */
  onSettled?: () => void;
  intro?: OverviewIntro;
}) {
  return (
    <div className={styles.root} data-theme="obsidian" data-overview>
      <div className={styles.ground} aria-hidden="true" />
      <OverviewRecords onSettled={onSettled} intro={intro} />
    </div>
  );
}

function OverviewRecords({
  onSettled,
  intro,
}: {
  onSettled: (() => void) | undefined;
  intro: OverviewIntro | undefined;
}) {
  const records = useInstrumentRecords();
  const failed = records.status === "failed";
  useEffect(() => {
    if (failed) onSettled?.();
  }, [failed, onSettled]);
  if (records.status === "ready")
    return (
      <OverviewReady
        snapshot={records.snapshot}
        listing={records.listing}
        onSettled={onSettled}
        intro={intro}
      />
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

/** The arrival's steps (s): the land rising as the camera comes down, the arc drawing on, the findings fading in. */
const ARRIVE_S = { rise: 1.5, arc: 0.5, appear: 0.4 } as const;
/** The idle lifts' rhythm (s): quiet before the first, then each layer up, held, down, and a pause before the next. */
const IDLE = { wait: 4, up: 0.7, hold: 2.2, down: 0.7, gap: 0.9 } as const;
/** The idle lifts wait until the one scene of decision 13 has landed (decision 13g). */
const IDLE_LIFTS: boolean = process.env.NEXT_PUBLIC_SITERRA_IDLE_LIFTS === "on";
/** The instruments the overview opens in place (decision 12), and the pixel's split and its play back (s). */
const PIXEL_HREF = VIEW_HREF.pixel;
/**
 * The address for what is on screen: a new history entry, or the current one replaced when the address is already
 * shown (a view reopened by the browser's Back), so history never holds the same place twice in a row.
 */
function goTo(href: string): void {
  if (window.location.pathname === href) window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);
}
const SPLIT_S = { in: 1.9, back: 1.2 } as const;

function OverviewReady({
  snapshot,
  listing,
  onSettled,
  intro,
}: {
  snapshot: CaseSnapshot;
  listing: InstrumentListing;
  onSettled: (() => void) | undefined;
  intro: OverviewIntro | undefined;
}) {
  // the arrival's clock: when it began, and how far the findings and the chrome have come in (1 at rest)
  const introRef = useRef(intro);
  introRef.current = intro;
  const arrival = useRef<{ t0: number | null; done: boolean }>({
    t0: null,
    done: intro === undefined,
  });
  const appearRef = useRef(intro === undefined ? 1 : 0);
  const [arriving, setArriving] = useState(intro !== undefined);
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
  // the views the record holds ready: what any action on the land may offer (decision 15)
  const offered = useMemo(() => {
    const views = new Set(
      (Object.keys(VIEW_INSTRUMENT) as ViewKind[]).filter((v) =>
        listing.instruments.some(
          (x) => x.spec.parameters.kind === VIEW_INSTRUMENT[v] && x.spec.status === "ready",
        ),
      ),
    );
    // See It Over Time (UI-2): offered where the case holds its own pixel seasons (timeSourcesOf)
    if (timeSourcesOf(snapshot)) views.add("time");
    return views;
  }, [listing, snapshot]);
  const names = placeNamesFromCase(snapshot);
  const area = catchmentAreaKm2(snapshot);
  const reasons = useBlockedReasons("field_plan");
  const descriptionId = useId();

  const [data, setData] = useState<OverviewData | null>(null);
  // the layers this case can lift, in the layer stack's order: only those whose evidence was read
  const liftOrder = useRef<LiftId[]>([]);
  const liftShownRef = useRef<LiftId | null>(null);
  useEffect(() => {
    liftOrder.current = data
      ? [
          ...(data.footprints.slope ? (["trend"] as const) : []),
          ...(data.footprints.rain ? (["rain"] as const) : []),
          "cover" as const,
          ...(data.bands ? (["bands"] as const) : []),
        ]
      : [];
  }, [data]);
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
    loadOverviewData(layers, pixel, snapshot, undefined, ac.signal).then(setData, (e: unknown) => {
      if (ac.signal.aborted) return;
      console.error("Overview not loaded", e);
      setFailed(true);
    });
    return () => {
      ac.abort();
    };
  }, [landKey]);

  // the ask; when the session's case revision moves past the records', the records are reopened for it and the
  // findings, the records and the field plan follow without a reload
  const ask = useOverviewAsk(snapshot);
  // the question's next-steps package, when its command committed one (UI-2)
  const pkgBrief = useMemo(
    () => (ask.commandId ? commandBrief(ask.snapshot, ask.commandId) : undefined),
    [ask.snapshot, ask.commandId],
  );
  const pkgView = useMemo(
    () => (pkgBrief ? packageView(ask.snapshot, pkgBrief.id) : undefined),
    [ask.snapshot, pkgBrief],
  );
  const refresh = useRecordsRefresh();
  const reopening = useRef<number | null>(null);
  useEffect(() => {
    const at = ask.snapshot.case.revision;
    if (!shouldReopen(snapshot.case.revision, at, reopening.current)) return;
    reopening.current = at;
    refresh(ask.snapshot);
  }, [ask.snapshot, snapshot.case.revision, refresh]);
  const [askOpen, setAskOpen] = useState(false);
  const askOpenRef = useRef(askOpen);
  askOpenRef.current = askOpen;
  // the idle lifts (decision 12): after a few quiet seconds at rest, one of the case's evidence layers lifts off the
  // land with its label and status, holds and settles, then the next; any input settles it at once
  const idle = useRef<{
    last: number;
    t0: number | null;
    layer: LiftId | null;
    k: number;
  }>({ last: performance.now(), t0: null, layer: null, k: 0 });
  const [liftShown, setLiftShown] = useState<LiftId | null>(null);
  const liftLabelRef = useRef<HTMLDivElement>(null);
  // the label under the cursor on the land at rest (decision 14)
  const hoverRef = useRef<HTMLDivElement>(null);
  const hoverNameRef = useRef<HTMLSpanElement>(null);
  const hoverStatusRef = useRef<HTMLSpanElement>(null);
  const hoverWireRef = useRef<SVGLineElement>(null);
  const hoverSide = useRef<CardSide | null>(null);
  const liftWireRef = useRef<SVGLineElement>(null);
  const reducedMotion = useRef(false);
  // the layer stack opened in place (decision 12): the overview hands its land over and is kept under the stack, so
  // Esc can play the stack back into this same land. `from` is the land's pose once the overview has let it go.
  const [tear, setTear] = useState<{
    /** The layer stack peels out of the land; the pixel splits into its cells. */
    // a view opened as an instrument over the land (See It Over Time opens as a selection instead, UI-2)
    kind: Exclude<ViewKind, "time">;
    /** The opened finding's crumb ("24.7% greening"), named in the view's breadcrumb. */
    crumb: string | null;
    from: LandPose | null;
    shown: boolean;
    back: boolean;
    stood: boolean;
    cut: boolean;
  } | null>(null);
  // the rain card compared with rainfall (decision 13): the card opens wide beside the rain-tinted land
  const [rainWide, setRainWide] = useState(false);
  // how the opened pixel's risen cells are painted (U27): its 02 card chooses
  const [cellPaint, setCellPaint] = useState<CellPaint>("rgb");
  const cellPaintRef = useRef<CellPaint>("rgb");
  const rainWideRef = useRef(rainWide);
  rainWideRef.current = rainWide;
  const tearRef = useRef(tear);
  tearRef.current = tear;
  // handing the land over: dir and progress; `narrow` for a view drawn orthographically (the layer stack), whose
  // first frame the overview meets by narrowing its lens
  const exitRef = useRef<{ dir: -1 | 0 | 1; k: number; away: number; narrow: boolean }>({
    dir: 0,
    k: 0,
    away: 0,
    narrow: true,
  });
  const splitRef = useRef<{ dir: -1 | 0 | 1; k: number }>({ dir: 0, k: 0 });
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
  // what can be done with the opened finding, beside its card (decision 15)
  const cardActions = useMemo(
    () => (sel && sel !== "package" && sel !== "time" ? actionsFor(sel, offered, true) : []),
    [sel, offered],
  );
  const cardActionsRef = useRef<readonly Action[]>(cardActions);
  cardActionsRef.current = cardActions;
  // the part of the land under the cursor, its actions, and whether its label shows
  const [hoverThing, setHoverThing] = useState<Thing | null>(null);
  const hoverActs = useRef<readonly Action[]>([]);
  const hoverShown = useRef(false);
  const offeredRef = useRef(offered);
  offeredRef.current = offered;
  const raf = useRef(0);
  const last = useRef(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const landRef = useRef<HTMLCanvasElement>(null);
  const arcRef = useRef<HTMLCanvasElement>(null);
  const blurRef = useRef<HTMLCanvasElement>(null);
  // the place's name, area and key, bottom left: they step aside while a record is open, so no words sit on the land
  // the opened finding brings close (lead, 30 Oct: the band's land ran under them)
  const placeTextRef = useRef<HTMLDivElement>(null);
  // the case question under the breadcrumb steps aside for a record opened on the left, whose kicker sits just under it
  const questionRef = useRef<HTMLDivElement>(null);
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
  const askBesideRef = useRef<HTMLParagraphElement>(null);
  const fieldRef = useRef<HTMLButtonElement>(null);
  const fieldTagRef = useRef<HTMLSpanElement>(null);
  const pixTagRef = useRef<HTMLDivElement>(null);
  const selWireRef = useRef<SVGLineElement>(null);
  const routesRef = useRef<HTMLButtonElement>(null);
  /** The route picked in the opened list (hovered or focused), if any. */
  const pickRef = useRef<string | null>(null);
  // the next-steps package open on the land (UI-2): the band it lights, and who follows its stand point
  const pkgRangesRef = useRef<{ ranges: HeightRange[]; lit: number | null }>({
    ranges: [],
    lit: null,
  });
  // See It Over Time (UI-2): what the view paints on the land and the month's snow, and who follows the band edges
  const timeRef = useRef<{ overlay: SceneState["overlay"]; snow: SceneState["snow"] }>({
    overlay: null,
    snow: null,
  });
  const timeSubs = useRef(new Set<(f: TimeFrame) => void>());
  // recorded life (UI-2): a global layer, off by default, where the case holds a species bundle; its dots, the point
  // in focus and its ring, who follows its frames, and whether a point holds the cursor (the land's label stands aside)
  const lifeBundle = useMemo(() => lifeSourceOf(snapshot), [snapshot]);
  const [lifeOn, setLifeOn] = useState(false);
  const lifeRef = useRef<{
    on: boolean;
    points: Parameters<OverviewScene["setLife"]>[0];
    focus: number | null;
    ring: number | null;
  }>({ on: false, points: null, focus: null, ring: null });
  lifeRef.current.on = lifeOn;
  const lifeSubs = useRef(new Set<(f: LifeFrame) => void>());
  const lifeHot = useRef(false);
  // the land's hover label, hidden at once when a recorded point takes the cursor (set by the hover effect)
  const hideHoverRef = useRef<() => void>(() => undefined);
  const lifeBundleRef = useRef(lifeBundle);
  lifeBundleRef.current = lifeBundle;
  // the package's land eased aside for its cards: where it is and where it is going (0 centred, 1 aside)
  const pkgAsideRef = useRef({ k: 0, goal: 0 });
  // back(), for handlers declared before it (the browser's Back leaving See It Over Time)
  const backRef = useRef<() => void>(() => undefined);
  // from the results to the package: the overview's own words stay out through the whole handover
  const pkgHandoff = useRef(false);
  const standSubs = useRef(new Set<(s: Stands) => void>());
  /** True while the sources panel is open: the labels it covers are dimmed. */
  const panelRef = useRef(false);
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
  // context with its caption at the midpoint
  const placeRecord = (cc: number, scale: number) => {
    const rec = recRef.current;
    const inst = instRef.current;
    if (!rec || !inst) return;
    rec.style.opacity = cc.toFixed(3);
    rec.style.visibility = cc > 0.001 ? "visible" : "hidden";
    const acts = linkRef.current?.parentElement;
    if (acts) acts.style.pointerEvents = cc > 0.5 ? "auto" : "none";
    const ib = toDesign(inst, scale);
    const frost = frostRef.current;
    if (frost)
      Object.assign(frost.style, {
        // wide enough that the card's own edges sit in the dark middle of the frost, over any land
        left: `${(ib.left - 170).toFixed(1)}px`,
        top: `${(ib.top - 140).toFixed(1)}px`,
        width: `${(ib.right - ib.left + 340).toFixed(1)}px`,
        height: `${(ib.bottom - ib.top + 280).toFixed(1)}px`,
      });
    const evid = evidRef.current;
    const link = linkRef.current?.parentElement ?? null;
    const svg = connectorRef.current;
    const mid = midcapRef.current;
    if (evid?.hidden && link && svg) {
      // the context closed: its toggle waits under the card's actions, with no dotted line (AUDIT's U28 advisory:
      // placed from the hidden context's empty box it stood at the stage's left edge)
      const lb = toDesign(link, scale);
      svg.style.visibility = "hidden";
      if (mid) {
        mid.style.left = `${lb.left.toFixed(1)}px`;
        mid.style.top = `${(lb.bottom + 14).toFixed(1)}px`;
      }
    } else if (evid && link && svg) {
      svg.style.visibility = "";
      const eb = toDesign(evid, scale);
      const lb = toDesign(link, scale);
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
      if (mid) {
        mid.style.left = `${(sx + 12).toFixed(1)}px`;
        mid.style.top = `${((sy + ey) / 2 - 8).toFixed(1)}px`;
      }
    }
  };

  // where the opened finding's card stands: beside its anchor, by free space, following the camera (decision 14)
  const cardSide = useRef<CardSide | null>(null);
  const cardBox = useRef<CardBox | null>(null);
  const placeCardNow = (layout: OverviewLayout, selected: Selection | null) => {
    const inst = instRef.current;
    cardBox.current = null;
    if (!selected || selected === "routes" || selected === "results") {
      cardSide.current = null;
      return;
    }
    if (!inst || !layout.anchor) return;
    const w = inst.offsetWidth;
    const h = inst.offsetHeight;
    const { box, side } = placeCard(layout.anchor, w, h, layout.subject, cardSide.current);
    cardSide.current = side;
    cardBox.current = box;
    inst.style.left = `${box.x0.toFixed(1)}px`;
    inst.style.top = `${box.y0.toFixed(1)}px`;
    // the published context under the card, or over it where there is no room below
    const ev = evidRef.current;
    if (ev) {
      const eh = ev.offsetHeight;
      // room for the "Published context" kicker between the card's actions and the context
      const below = box.y1 + 40;
      const y = below + eh <= 860 ? below : Math.max(110, box.y0 - 40 - eh);
      ev.style.left = `${box.x0.toFixed(1)}px`;
      ev.style.top = `${y.toFixed(1)}px`;
    }
  };

  const findingsRef = useRef(findings);
  findingsRef.current = findings;

  // the specimen's setState, for the words: places every label, dot, hairline and mark from the scene's layout
  const apply = useCallback((layout: OverviewLayout) => {
    lastLayout.current = layout;
    // See It Over Time's band labels follow their bands' lit edges (UI-2)
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
    // recorded life's dots and the point in focus, in CSS px over the overview (UI-2)
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
    // the package's markers follow their bands' places on the land (UI-2)
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
    const { s, h, k, o } = live.current;
    const { fit, e } = layout;
    // from the results to the package and while it opens, the overview's words, ask and arc stay out (UI-2)
    const pkgQuiet =
      pkgHandoff.current ||
      ((selRef.current === "package" || selRef.current === "time") && goal.current.s === 1);
    const oe = ease(o);
    const selected = selRef.current;
    const hud = hudRef.current;
    if (hud) {
      hud.style.transform = `translate(${fit.ox.toFixed(2)}px, ${fit.oy.toFixed(2)}px) scale(${fit.scale.toFixed(5)})`;
      // the arrival: the words on the land and round the arc come in once the arc is drawn
      // the package's words take the land's place round it: the overview's own words and dots step out (UI-2)
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
    // the opened record begins with the click and has settled well inside the one-second move (lead, 30 Oct: begin
    // within about 0.3 s, settle within about 1 s), while the land is still easing toward the finding
    // decision 14: the subject lights, then the leader draws from it, then the card fades in (and back in reverse)
    const cc = ease(clamp01((s - 0.25) / 0.45));
    const leadIn = ease(clamp01((s - 0.05) / 0.3));
    placeCardNow(layout, selected);
    placeRecord(cc * (1 - exitRef.current.away), fit.scale);
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
    // the routes' entry stays while the routes are open (it names them); a finding's record takes it aside too
    const routesEntry = routesRef.current;
    if (routesEntry) {
      const aside = selected !== null && selected !== "routes" ? e : 0;
      routesEntry.style.opacity = (1 - aside).toFixed(3);
      routesEntry.style.visibility = aside > 0.999 ? "hidden" : "visible";
    }
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
      // the arc's words step back while the visitor has turned the land or brought it closer (R brings them back)
      const aw = awayOf(camRef.current);
      // while a record is open no ring label stays, not even a faded trace (lead, 30 Oct): the opened finding is
      // its record, and the others come back as the record closes
      let op =
        (1 - aw) *
        (1 - 0.38 * other) *
        (1 - 0.3 * k) *
        (1 - e) *
        (lower ? 1 - oe : 1 - 0.16 * oe) *
        (isSel ? 1 : place.onArc);
      // what the sources panel covers is dimmed while it is open
      const panelEl = panelRef.current ? document.querySelector("[data-sources-panel]") : null;
      if (panelEl) {
        const p = toDesign(panelEl, fit.scale);
        const lr = { l: at.x, t: at.y, r: at.x + label.offsetWidth, b: at.y + label.offsetHeight };
        if (lr.l < p.right && p.left < lr.r && lr.t < p.bottom && p.top < lr.b) op *= 0.25;
      }
      label.style.opacity = op.toFixed(3);
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
            : (1 - awayOf(camRef.current)) *
              (1 - 0.38 * other) *
              (1 - 0.3 * k) *
              (1 - 0.6 * e) *
              place.onArc
      ).toFixed(3);
      if (wire) wire.style.opacity = (hv * (1 - e)).toFixed(3);
    }
    // the opened finding's card hangs from its subject on the land by one hairline leader (decision 14)
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
    // the ask circle sits on the arc's start; it steps away as the space moves toward a finding
    const away = ease(clamp01(s / 0.55));
    const circle = askCircleRef.current;
    if (circle) {
      circle.style.left = `${layout.ask.x.toFixed(2)}px`;
      circle.style.top = `${layout.ask.y.toFixed(2)}px`;
      const gone = Math.max(away, awayOf(camRef.current), pkgQuiet ? 1 : 0);
      circle.style.opacity = (1 - gone).toFixed(3);
      circle.style.visibility = gone > 0.99 ? "hidden" : "visible";
      circle.style.transform = `translateY(${(-LIFT * oe).toFixed(2)}px) scale(${(1 + 0.04 * Math.max(k, oe)).toFixed(4)})`;
    }
    const beside = askBesideRef.current;
    if (beside) {
      beside.style.left = `${layout.ask.x.toFixed(2)}px`;
      beside.style.top = `${layout.ask.y.toFixed(2)}px`;
      beside.style.opacity = (1 - Math.max(away, awayOf(camRef.current), pkgQuiet ? 1 : 0)).toFixed(
        3,
      );
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
    // the lifted layer's label at the end of a short leader from its right-most rim point
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
    // the moves keep wall-clock time on a slow renderer (at 0.05 a frame, a 4 fps pane stretched the one-second move
    // to five seconds); the cap only stops one long stall from jumping a whole move
    const dt = Math.min(0.25, (t - last.current) / 1000);
    last.current = t;
    let moving = false;
    const l = live.current;
    const gl = goal.current;
    const X = exitRef.current;
    for (const key of ["s", "h", "k", "o", "r"] as const) {
      const d = gl[key] - l[key];
      // handing the land over closes an open record quickly
      const step = dt / (key === "s" && X.dir === 1 ? 0.35 : DUR[key]);
      l[key] = Math.abs(d) <= step ? gl[key] : l[key] + Math.sign(d) * step;
      if (l[key] !== gl[key]) moving = true;
    }
    // the package's land eases aside while one of its cards is open (UI-2)
    const PA = pkgAsideRef.current;
    if (PA.k !== PA.goal) {
      const step = dt / 0.7;
      PA.k = Math.abs(PA.goal - PA.k) <= step ? PA.goal : PA.k + Math.sign(PA.goal - PA.k) * step;
      moving = true;
    }
    // a closed finding is let go once the space is back at rest
    if (l.s === 0 && gl.s === 0 && selRef.current) {
      selRef.current = null;
      setSel(null);
    }
    // handing the land to the layer stack: the words on the land and the arc step away at once, and come back with
    // the land; once the record has closed the lens narrows, and coming back it widens
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
    // the pixel taken apart: down to the pixel, its cells off the land; played back into the land
    const P = splitRef.current;
    if (P.dir === 1) {
      P.k = Math.min(1, P.k + dt / SPLIT_S.in);
      // the pixel's panels arrive while its last cells are still settling: no empty frame between them
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
    // the idle lifts: the cycle runs while the overview is quiet at rest; any input lets the layer settle
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

    // the arrival from the globe: the camera comes down and the land rises, the arc draws on, the findings come in
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
  // ---------- the layer stack opened in place: the land taken apart and put back (decision 12) ----------
  // the opened finding's crumb, as the overview's breadcrumb names it
  const crumbNow = (): string | null =>
    selRef.current ? crumbOf(selRef.current, findingsRef.current, bandLimit?.display ?? "") : null;
  const openRef = useRef<(href: string) => boolean>(() => false);
  const openInPlace = useCallback(
    (href: string): boolean => {
      const kind =
        (Object.keys(VIEW_HREF) as ViewKind[]).find((k) => VIEW_HREF[k] === href) ?? null;
      if (kind === "time") {
        // See It Over Time (UI-2): the finding's card closes, then the land plays its seasons in place
        const fromSel = selRef.current;
        // like the package: the overview's own words, ask and arc stay out through the handover
        pkgHandoff.current = true;
        if (fromSel && fromSel !== "time") back();
        const tryOpen = () => {
          if (selRef.current) {
            window.setTimeout(tryOpen, 60);
            return;
          }
          open("time");
          pkgHandoff.current = false;
          goTo(href);
        };
        tryOpen();
        return true;
      }
      if (kind === "rainfall" && selRef.current === "rain") {
        setRainWide(true);
        goTo(href);
        return true;
      }
      if (!kind || tearRef.current) return false;
      if (reducedMotion.current) {
        // reduced motion: the instrument opens by a cut
        setTear({
          kind,
          crumb: crumbNow(),
          from: null,
          shown: true,
          back: false,
          stood: true,
          cut: true,
        });
        goTo(href);
        return true;
      }
      if (kind === "pixel") {
        // the pixel's record stays the selection; the camera goes on down to the pixel
        setTear({
          kind,
          crumb: crumbNow(),
          from: null,
          shown: false,
          back: false,
          stood: true,
          cut: false,
        });
        splitRef.current = { dir: 1, k: 0 };
        go();
        return true;
      }
      if (kind === "rainfall" || kind === "field") {
        // the rainfall's seasons and the field plan arrive over the land, which stays (tinted by the rain cells)
        setTear({
          kind,
          crumb: crumbNow(),
          from: null,
          shown: false,
          back: false,
          stood: true,
          cut: false,
        });
        window.setTimeout(() => {
          setTear((p) => (p ? { ...p, shown: true } : p));
          goTo(href);
        }, 260);
        go();
        return true;
      }
      setTear({
        kind,
        crumb: crumbNow(),
        from: null,
        shown: false,
        back: false,
        stood: false,
        cut: false,
      });
      exitRef.current = { dir: 1, k: 0, away: exitRef.current.away, narrow: kind === "layers" };
      goal.current.s = 0;
      go();
      return true;
    },
    [go],
  );
  // the stack has drawn the land where the overview left it: it takes the screen
  openRef.current = openInPlace;
  const onStackDrawn = useCallback(() => {
    setTear((p) => (p ? { ...p, shown: true } : p));
    const t = tearRef.current;
    goTo(t ? VIEW_HREF[t.kind] : VIEW_HREF.layers);
  }, []);
  const onStackStood = useCallback(() => {
    setTear((p) => (p ? { ...p, stood: true } : p));
  }, []);
  // back (Esc, the back arrow, the valley crumb, the browser's back): the stack plays back into the land
  const backInPlace = useCallback(() => {
    const t = tearRef.current;
    if (!t) return;
    if (t.cut) {
      setTear(null);
      goTo("/valley");
      return;
    }
    if (t.kind === "rainfall" || t.kind === "field") {
      setTear({ ...t, shown: false, back: true });
      window.setTimeout(() => {
        setTear(null);
        goTo("/valley");
        go();
      }, 450);
      return;
    }
    if (t.kind === "pixel") {
      // the pixel's panels go, then its cells come back down into the land
      setTear({ ...t, shown: false, back: true });
      window.setTimeout(() => {
        splitRef.current = { dir: -1, k: splitRef.current.k };
        go();
      }, 450);
      return;
    }
    setTear({ ...t, back: true, stood: false });
  }, [go]);
  // the sheets are back in the land: the overview's own land takes it from here and widens its lens again
  const onStackBack = useCallback(() => {
    exitRef.current = { ...exitRef.current, dir: -1, k: 1 };
    setTear(null);
    goTo("/valley");
    go();
  }, [go]);
  const teardownOf = (t: NonNullable<typeof tear>) => ({
    from: t.from,
    back: t.back,
    onDrawn: onStackDrawn,
    onStood: onStackStood,
    onBack: onStackBack,
  });
  useEffect(() => {
    // the browser's Back and Forward: leaving a view's address plays the view back; coming to one opens it in place
    const onPop = () => {
      const t = tearRef.current;
      const path = window.location.pathname;
      if (t) {
        if (path !== VIEW_HREF[t.kind]) backInPlace();
        return;
      }
      // See It Over Time is a selection over the land (UI-2): leaving its address closes it
      if (selRef.current === "time" && path !== VIEW_HREF.time) {
        backRef.current();
        return;
      }
      if (Object.values<string>(VIEW_HREF).includes(path)) openRef.current(path);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [backInPlace]);

  // the arrival starts, or is skipped, when the journey says so
  const introRun = intro?.run ?? false;
  const introSkip = intro?.skip ?? false;
  useEffect(() => {
    if (introRun || introSkip) go();
  }, [introRun, introSkip, go]);

  const settled = useRef(onSettled);
  settled.current = onSettled;
  const timeAtArrival = useRef(false);
  // See It Over Time by its own address, on a case whose land is not drawn: the address says what is on screen
  useEffect(() => {
    if (!failed || timeAtArrival.current || window.location.pathname !== VIEW_HREF.time) return;
    timeAtArrival.current = true;
    window.history.replaceState(null, "", `/valley${window.location.search}`);
  }, [failed]);
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
    // recorded life's dots, if read before this scene was drawn (UI-2)
    scene.setLife(lifeRef.current.points);
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
        // See It Over Time by its own address (UI-2): once drawn, the land plays its seasons in place
        if (!timeAtArrival.current && window.location.pathname === VIEW_HREF.time) {
          timeAtArrival.current = true;
          if (offeredRef.current.has("time") && !selRef.current) openRef.current(VIEW_HREF.time);
          // a case that cannot play its seasons: the address says what is on screen, with no entry to come back to
          else window.history.replaceState(null, "", `/valley${window.location.search}`);
        }
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
    if (
      !sel ||
      sel === "field" ||
      sel === "results" ||
      sel === "routes" ||
      sel === "package" ||
      sel === "time" ||
      recordData[sel]
    )
      return;
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
    // the focus moves to the card's Enter action once the card is drawn (a hidden card takes no focus)
    window.setTimeout(() => {
      (id === "results" || id === "routes" ? firstResultRef.current : linkRef.current)?.focus({
        preventScroll: true,
      });
    }, 350);
  };
  const back = useCallback(() => {
    const was = selRef.current;
    if (was === "package") {
      setPkgShown(false);
      pkgAsideRef.current.goal = 0;
    }
    // See It Over Time has its own address (UI-2): closing it returns to the overview's
    if (was === "time" && window.location.pathname === VIEW_HREF.time) goTo("/valley");
    setRainWide(false);
    goal.current.s = 0;
    go();
    if (was === "field") fieldRef.current?.focus({ preventScroll: true });
    else if (was === "routes") routesRef.current?.focus({ preventScroll: true });
    else if (was === "results")
      // the ask circle comes back with the overview
      window.setTimeout(() => askCircleRef.current?.focus({ preventScroll: true }), DUR.s * 1000);
    else if (was === "package" || was === "time")
      window.setTimeout(() => askCircleRef.current?.focus({ preventScroll: true }), DUR.s * 1000);
    else if (was) labelRefs.current.get(was)?.focus({ preventScroll: true });
  }, [go]);
  // the next-steps package (UI-2): the results close, then the package opens over the same land
  const [pkgShown, setPkgShown] = useState(false);
  const pkgOpenRef = useRef<(() => void) | null>(null);
  const openPackage = useCallback(() => {
    pkgHandoff.current = true;
    if (selRef.current === "results") back();
    const tryOpen = () => {
      if (selRef.current) {
        window.setTimeout(tryOpen, 60);
        return;
      }
      open("package");
      pkgHandoff.current = false;
      // decision 14d: the land settles and its band lights first, then the package's words arrive
      window.setTimeout(
        () => {
          if (selRef.current === "package") setPkgShown(true);
        },
        reducedMotion.current ? 0 : DUR.s * 700,
      );
    };
    tryOpen();
  }, [back]);
  // See It Over Time (UI-2): the overlay grid it paints on, what it sets on the land, and each frame's band edges
  const timeMount = useMemo<TimeMount>(
    () => ({
      grid: () => sceneRef.current?.overlayGrid() ?? null,
      push: (overlay, snow) => {
        timeRef.current = { overlay, snow };
        go();
      },
      subscribe: (f) => {
        timeSubs.current.add(f);
        go();
        return () => {
          timeSubs.current.delete(f);
        };
      },
    }),
    [go],
  );
  // recorded life (UI-2): the dots it draws, the point in focus, and each frame's places
  const lifeMount = useMemo<LifeMount>(
    () => ({
      set: (points) => {
        lifeRef.current.points = points;
        sceneRef.current?.setLife(points);
        go();
      },
      focus: (index, ring) => {
        if (index !== null) hideHoverRef.current();
        lifeRef.current.focus = index;
        lifeRef.current.ring = ring;
        go();
      },
      subscribe: (f) => {
        lifeSubs.current.add(f);
        go();
        return () => {
          lifeSubs.current.delete(f);
        };
      },
      hot: lifeHot,
    }),
    [go],
  );
  useEffect(() => {
    go();
  }, [lifeOn, go]);
  const pkgLand = useMemo<LandMount>(
    () => ({
      limits: bandLimitsOf(snapshot),
      onRanges: (ranges, lit) => {
        pkgRangesRef.current = { ranges, lit };
        go();
      },
      onAside: (aside) => {
        pkgAsideRef.current.goal = aside ? 1 : 0;
        go();
      },
      subscribe: (f) => {
        standSubs.current.add(f);
        go();
        return () => {
          standSubs.current.delete(f);
        };
      },
    }),
    [snapshot, go],
  );
  backRef.current = back;
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
  // any input settles a lifted layer and restarts the quiet count; a timer wakes the loop when the quiet has lasted
  useEffect(() => {
    reducedMotion.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onInput = () => {
      idle.current.last = performance.now();
      idle.current.t0 = null;
    };
    const events = ["pointermove", "pointerdown", "wheel", "keydown"] as const;
    for (const ev of events) window.addEventListener(ev, onInput, { passive: true });
    const wake = window.setInterval(() => {
      if ((performance.now() - idle.current.last) / 1000 >= IDLE.wait) go();
    }, 500);
    return () => {
      for (const ev of events) window.removeEventListener(ev, onInput);
      window.clearInterval(wake);
    };
  }, [go]);
  useEffect(() => {
    panelRef.current = panel;
    go();
  }, [panel, go]);
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
  }, [arriving, askOpen, panel, back, reset, toOpening, openInPlace]);
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
  // hovering the land at rest names what lies there, from the case's own rasters and records (decision 14): the
  // pixel, a proposed route, a drainage line or the land cover class, then the height and its elevation third
  const hoverWords = useRef<{
    routes: readonly { id: string; title: string }[];
    limits: readonly [number, number] | null;
  }>({
    routes: [],
    limits: null,
  });
  hoverWords.current = { routes: data?.routes ?? [], limits: bandLimitsOf(snapshot) };
  const arrivingRef = useRef(arriving);
  arrivingRef.current = arriving;
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
      setHoverThing((t) => (t === thing ? t : thing));
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
  // recorded life's records credit their datasets through GBIF while the layer shows (UI-2)
  const lifeCredit =
    lifeOn && lifeBundle
      ? (snapshot.records.dataBundleRecords.find((b) => b.id === lifeBundle) ?? null)
      : null;
  const sourceSet = {
    lines: [...CREDITS.map((id) => en[id].text), ...(named ? [named.attribution] : [])],
    short: [...SHORT.map((id) => en[id].text), ...(named ? [en["source.geonames"].text] : [])],
  };
  if (lifeCredit) {
    sourceSet.lines.push(lifeCredit.attribution ?? lifeCredit.label);
    sourceSet.short.push(en["source.gbif"].text);
  }
  const pkgHref =
    sel === "package" && pkgBrief
      ? `/brief?case=${encodeURIComponent(ask.snapshot.case.id)}&brief=${encodeURIComponent(pkgBrief.id)}`
      : null;
  const keys: KeyEntry[] = [
    ...(pkgHref
      ? [
          {
            chip: "E",
            shortcut: "E",
            label: pkg["package.export"].text,
            onPress: () => {
              window.open(pkgHref, "_blank", "noopener");
            },
          },
        ]
      : []),
    ...(lifeBundle && (!sel || sel === "time") && !tear
      ? [
          {
            chip: "G",
            shortcut: "G",
            label: en["chrome.key.life"].text,
            onPress: () => {
              setLifeOn((v) => !v);
            },
            pressed: lifeOn,
          },
        ]
      : []),
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
  // the view opened in place over the land
  const viewOf = (t: NonNullable<typeof tear>) => {
    const td = t.cut ? {} : { teardown: teardownOf(t) };
    switch (t.kind) {
      case "layers":
        return <InstrumentLayerStack {...td} />;
      case "cutaway":
        return <InstrumentCutaway {...td} />;
      case "pixel":
        // the split pixel stays on the land with its cards round it; a cut (reduced motion) opens the panels alone
        return t.cut ? (
          <InstrumentPixelAnatomy />
        ) : (
          <InstrumentPixelAnatomy
            around={{
              paint: cellPaint,
              onPaint: (p) => {
                cellPaintRef.current = p;
                setCellPaint(p);
                go();
              },
              // in client px: the pixel view converts it to its own stage
              pixelBox: () => {
                const L = lastLayout.current;
                const h = hudRef.current?.getBoundingClientRect();
                const b = L?.pixelBox;
                if (!L || !h || !b) return null;
                const k = L.fit.scale;
                return {
                  x0: h.left + b.x0 * k,
                  y0: h.top + b.y0 * k,
                  x1: h.left + b.x1 * k,
                  y1: h.top + b.y1 * k,
                };
              },
              // where each card's leader ends (U28c): the pixel's place, its risen cells, the field check's point
              anchors: () => {
                const L = lastLayout.current;
                const h = hudRef.current?.getBoundingClientRect();
                if (!L?.pixelPlace || !L.pixelCells || !h) return null;
                const k = L.fit.scale;
                const at = (p: Point): [number, number] => [h.left + p.x * k, h.top + p.y * k];
                return {
                  place: L.pixelPlace.map(at),
                  cells: L.pixelCells.map(at),
                  field: L.field ? [at(L.field)] : L.pixelPlace.map(at),
                };
              },
            }}
          />
        );
      case "rainfall":
        return <InstrumentRainfallScatter />;
      default:
        return <InstrumentFieldPlan />;
    }
  };
  const selFinding =
    sel && sel !== "field" && sel !== "results" && sel !== "routes"
      ? (findings.find((f) => f.id === sel) ?? null)
      : null;
  const results = sel === "results" ? ask.commandId : null;
  // the question's next-steps package, when its command committed one (UI-2): Enter on the results opens it, and
  // the field plan the results also lead to keeps its own letter
  const resultsActions = pkgView
    ? cardActions.map((a) =>
        a.key === "Enter" && a.view === "field" ? { ...a, key: "F" as const } : a,
      )
    : cardActions;
  pkgOpenRef.current = sel === "results" && pkgView ? openPackage : null;
  // a lifted layer's status, from the record: the cells read, the finding it carries, the band limits
  const limits = bandLimitsOf(snapshot);
  const liftStatus = (id: LiftId): string => {
    const shown = (f: FindingId) => findings.find((x) => x.id === f)?.display ?? "";
    const count = (n: number) => new Intl.NumberFormat("en").format(n);
    switch (id) {
      case "trend": {
        const fdr = findings.find((x) => x.id === "fdr");
        const n = count(data?.footprints.slope?.cells.length ?? 0);
        // the season as the trend asset states it
        const window = data?.footprints.slope?.window ?? "";
        return fdr?.pair
          ? format("overview.lift.trend.pair", { n, window, shares: sharesWords(fdr) })
          : format("overview.lift.trend", {
              n,
              window,
              share: shown("fdr"),
              direction: directionWord(fdr?.direction),
            });
      }
      case "rain":
        return format("overview.lift.rain", {
          n: count(data?.footprints.rain?.length ?? 0),
          r2: shown("rain"),
        });
      case "cover":
        return format("overview.lift.cover", { year: WORLDCOVER.year });
      case "bands":
        return limits
          ? format("overview.lift.bands", { lower: metres(limits[0]), upper: metres(limits[1]) })
          : "";
    }
  };

  return (
    <div
      ref={rootRef}
      className={styles.layer}
      data-overview-root
      data-arriving={arriving ? "" : undefined}
      data-tearing={tear !== null ? "" : undefined}
      data-covered={tear?.shown ? (tear.kind === "pixel" ? "land" : "") : undefined}
      data-case-revision={snapshot.case.revision}
    >
      <p id={descriptionId} className={styles.srOnly}>
        {en["overview.description"].text} {en["overview.keys"].text}
      </p>
      <canvas ref={landRef} className={styles.canvas} aria-hidden="true" data-land />
      <canvas ref={blurRef} className={styles.blur} aria-hidden="true" data-land />
      <canvas ref={arcRef} className={styles.canvas} aria-hidden="true" />
      <div ref={cornerRef} className={styles.cornerfade} aria-hidden="true" />
      <div ref={hudRef} className={styles.hud}>
        <div ref={questionRef} className={styles.question} data-case-question>
          {snapshot.case.objective}
        </div>
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
            <line ref={liftWireRef} className={styles.liftWire} />
            <line ref={hoverWireRef} className={styles.hoverWire} />
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
              <div
                ref={liftLabelRef}
                className={styles.liftLabel}
                data-lift={liftShown ?? undefined}
                aria-hidden="true"
              >
                {liftShown ? (
                  <>
                    <span className={styles.liftName}>
                      {en[`instrument.sheet.${liftShown}`].text}
                    </span>
                    <span className={styles.liftStatus}>{liftStatus(liftShown)}</span>
                  </>
                ) : null}
              </div>
              <div ref={hoverRef} className={styles.hover} aria-hidden="true" data-hover-label>
                <span ref={hoverNameRef} className={styles.liftName} />
                <span ref={hoverStatusRef} className={styles.hoverStatus} />
                {hoverThing ? (
                  <ActionList still actions={actionsFor(hoverThing, offered, false)} />
                ) : null}
              </div>
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
                    caption={captionOf(f, bandLimit?.display ?? "")}
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
          <div ref={placeTextRef} data-place-text>
            <div className={styles.name}>{names.valleyName}</div>
            {area !== null ? (
              <div className={styles.sub}>
                {format("arrival.studyArea", { label: names.areaLabel, area })}
              </div>
            ) : null}
            {/* the key describes the drawn land: none without a land view (U25) */}
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
          <p className={styles.failed} role="status" data-overview-failed>
            {/* a record without a land view is a blocked state, not a failure to retry (U25) */}
            {en[layers === undefined ? "overview.noLand" : "overview.failed"].text}
          </p>
        ) : null}
        {sel ? (
          <>
            {results !== null ? (
              <OverviewResults
                snapshot={ask.snapshot}
                commandId={results}
                onOpen={openInPlace}
                {...(pkgView ? { onPackage: openPackage } : {})}
                actions={resultsActions}
                onBack={back}
                refs={{ root: recRef, inst: instRef, frost: frostRef, first: firstResultRef }}
              />
            ) : null}
            {sel === "routes" && data ? (
              <OverviewRoutes
                routes={data.routes}
                load={routesLoad}
                onPick={pickRoute}
                onOpen={openInPlace}
                actions={cardActions}
                onBack={back}
                refs={{ root: recRef, inst: instRef, frost: frostRef, first: firstResultRef }}
              />
            ) : null}
            {sel !== "results" && sel !== "routes" && sel !== "package" && sel !== "time" ? (
              <OverviewRecord
                sel={sel}
                finding={selFinding}
                caption={selFinding ? captionOf(selFinding, bandLimit?.display ?? "") : []}
                bandLimit={bandLimit?.display ?? ""}
                data={sel === "field" ? null : (recordData[sel] ?? null)}
                reasons={reasons}
                fieldCaption={instrumentOf(listing, "field_plan")?.spec.caption ?? null}
                pixelNote={data?.pixel?.note ?? null}
                areaLabel={names.areaLabel}
                side={sideOf(sel, selFinding?.clock)}
                onLand={onLandOf(sel, data)}
                slopeKey={
                  sel === "fdr" && data?.footprints.slope
                    ? { domain: data.footprints.slope.domain }
                    : null
                }
                wide={rainWide && sel === "rain"}
                actions={cardActions}
                onOpen={openInPlace}
                onBack={back}
                onContextToggle={go}
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
            keysOff={arriving || tear !== null}
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
            besideRef={askBesideRef}
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
          ...(sel
            ? [
                rainWide && sel === "rain"
                  ? {
                      label: crumbOf(sel, findings, bandLimit?.display ?? ""),
                      onSelect: () => {
                        setRainWide(false);
                        goTo("/valley");
                      },
                    }
                  : { label: crumbOf(sel, findings, bandLimit?.display ?? "") },
              ]
            : []),
          ...(rainWide && sel === "rain" ? [{ label: en["instrument.shell.rainfall"].text }] : []),
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
            {/* the relief's exaggeration said on the data line where the land is drawn (decision 16) */}
            <SourcesLine sources={layers ? { ...sourceSet, relief: EXAG } : sourceSet} />
          </KeyLegend>
          <SourcesPanel
            sources={sourceSet}
            open={panel}
            // an open record on the right (a finding there, the routes, the results) keeps its lines: the panel
            // opens on the left, where the place's words have stepped aside
            side={sel && sideOf(sel, selFinding?.clock) === "right" ? "left" : "right"}
            onClose={() => {
              setPanel(false);
            }}
          />
        </>
      ) : null}
      {sel === "time" && !tear ? <TimeView snapshot={snapshot} open mount={timeMount} /> : null}
      {lifeBundle && data ? (
        <LifeLayer
          snapshot={snapshot}
          zone={data.zone}
          on={lifeOn && (!sel || sel === "time") && !tear}
          mount={lifeMount}
        />
      ) : null}
      {sel === "package" && pkgView && !tear ? (
        <PackageBriefing
          snapshot={ask.snapshot}
          view={pkgView}
          open={pkgShown}
          onClose={back}
          onOpen={openInPlace}
          land={pkgLand}
        />
      ) : null}
      {tear ? (
        <div
          className={styles.inPlace}
          data-kind={tear.kind}
          data-shown={tear.shown ? "" : undefined}
        >
          <InstrumentShell
            current={tear.kind}
            records={{ snapshot, listing }}
            onBack={backInPlace}
            tearing={!tear.stood}
            finding={tear.crumb ?? undefined}
          >
            {viewOf(tear)}
          </InstrumentShell>
        </div>
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
          {f.pair ? (
            // both shares, each from its own Measurement, each with its direction (U25b)
            <span className={`${styles.value} ${styles.pair}`}>
              <span>
                {f.display}
                <span className={styles.shareWord}>{directionWord(f.direction)}</span>
              </span>
              <span>
                {f.pair.display}
                <span className={styles.shareWord}>{directionWord(f.pair.direction)}</span>
              </span>
            </span>
          ) : (
            <span className={styles.value}>{f.display}</span>
          )}
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
