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

import { type CaseSnapshot, type InstrumentListing } from "@siterra/contracts";
import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { buildRecordedRunForCase } from "../../lib/run/case-run";
import { ThemeIcon } from "../opening/Opening";
import { en, format } from "../../lib/copy/en";
import type { Box as CardBox, Side as CardSide } from "../../lib/overview/card";
import { bandLimitsOf } from "../../lib/land/record";
import { instrumentOf } from "../../lib/instruments/listing";
import {
  VIEW_HREF,
  VIEW_INSTRUMENT,
  actionsFor,
  type Action,
  type Thing,
  type ViewKind,
} from "../../lib/overview/actions";
import { shouldReopen } from "../../lib/overview/ask-line";
import { formatLiftStatus } from "../../lib/overview/hud-layout";
import { fallbackRecordData } from "../../lib/overview/terrain";
import {
  captionOf,
  findingsFrom,
  type FindingId,
} from "../../lib/overview/findings";
import {
  EXAG,
  sideOf,
  type OverviewLayout,
  type LiftId,
  type OverviewScene,
  type SceneState,
  type Selection,
} from "../../lib/overview/scene/overview";
import { catchmentAreaKm2 } from "../../lib/overview/record";
import { placeNamesFromCase } from "../../lib/projection/arrival";
import { takeQuestion } from "../../lib/shell/handoff";
import {
  useBlockedReasons,
  useInstrumentRecords,
  useRecordsRefresh,
} from "../instruments/InstrumentRecords";
import {
  Breadcrumb,
  ModeLine,
  KeyLegend,
  OPENING_HREF,
  SourcesLine,
  SourcesPanel,
  ViewControl,
  type KeyEntry,
} from "../controls/ScreenChrome";
import { Ask } from "./Ask";
import type { CellPaint } from "../../lib/instruments/pixel/paint";
import { runModel } from "../../lib/run/model";
import {
  RecordedRunContext,
  lengthOf,
  revealed,
  useRecordedClock,
  type RecordedRun,
} from "../../lib/run/recorded";
import { shortCitation } from "../../lib/overview/results";
import { ActionList } from "./ActionList";
import { AtWork } from "./AtWork";
import { Arrow, FindingMark, crumbOf, onLandOf } from "./FindingMark";
import { OverviewRecord } from "./OverviewRecord";
import { OverviewResults } from "./OverviewResults";
import { OverviewRoutes } from "./OverviewRoutes";
import { useOverviewAsk } from "./useOverviewAsk";
import {
  goTo,
  useOverviewCameraDragWheel,
  useOverviewIdleWake,
  useOverviewKeyboardShortcuts,
  useOverviewLandHover,
} from "./useOverviewControls";
import {
  DUR,
  IDLE,
  useOverviewLayoutApply,
  type Live,
  type RunArcState,
} from "./useOverviewLayoutApply";
import { useOverviewSceneData } from "./useOverviewSceneData";
import {
  OverviewInPlaceInstrument,
  useOverviewTearInPlace,
  type TearState,
} from "./useOverviewTearInPlace";
import { PackageBriefing, type LandMount, type Stands } from "../package/PackageBriefing";
import { pkg } from "../../lib/copy/package";
import type { HeightRange } from "../../lib/package/bands";
import { commandBrief, packageView, packageViewForCase } from "../../lib/package/package";
import { timeSourcesOf } from "../../lib/time/load";
import { TimeView, type TimeFrame, type TimeMount } from "../time/TimeView";
import { lifeSourceOf } from "../../lib/life/load";
import { LifeLayer, type LifeFrame, type LifeMount } from "../life/LifeLayer";
import styles from "./ValleyOverview.module.css";

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
  theme = "light",
  onToggleTheme,
  initialViewMode,
  commissionedQuestion,
}: {
  /** Once the land is drawn and the words placed, or the overview has failed (the journey waits on it). */
  onSettled?: () => void;
  intro?: OverviewIntro;
  theme?: "light" | "obsidian";
  onToggleTheme?: () => void;
  initialViewMode?: "run" | "briefing";
  commissionedQuestion?: string;
}) {
  const [localTheme, setLocalTheme] = useState<"light" | "obsidian">("light");
  useEffect(() => {
    if (onToggleTheme) return;
    const saved = window.localStorage.getItem("siterra.theme");
    const next = saved === "obsidian" ? "obsidian" : "light";
    setLocalTheme(next);
    document.documentElement.dataset.theme = next;
  }, [onToggleTheme]);
  const effectiveTheme = onToggleTheme ? theme : localTheme;
  const handleToggleTheme = useCallback(() => {
    if (onToggleTheme) {
      onToggleTheme();
      return;
    }
    setLocalTheme((prev) => {
      const next = prev === "obsidian" ? "light" : "obsidian";
      document.documentElement.dataset.theme = next;
      window.localStorage.setItem("siterra.theme", next);
      return next;
    });
  }, [onToggleTheme]);

  return (
    <div className={styles.root} data-theme={effectiveTheme} data-overview>
      <div className={styles.ground} aria-hidden="true" />
      <OverviewRecords
        onSettled={onSettled}
        intro={intro}
        theme={effectiveTheme}
        onToggleTheme={handleToggleTheme}
        initialViewMode={initialViewMode}
        commissionedQuestion={commissionedQuestion}
      />
    </div>
  );
}

function OverviewRecords({
  onSettled,
  intro,
  theme,
  onToggleTheme,
  initialViewMode,
  commissionedQuestion,
}: {
  onSettled: (() => void) | undefined;
  intro: OverviewIntro | undefined;
  theme?: "light" | "obsidian";
  onToggleTheme?: () => void;
  initialViewMode?: "run" | "briefing";
  commissionedQuestion?: string;
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
        theme={theme}
        onToggleTheme={onToggleTheme}
        initialViewMode={initialViewMode}
        commissionedQuestion={commissionedQuestion}
      />
    );
  if (!failed) return null;
  return (
    <p className={styles.failed} role="status">
      {en["overview.failed"].text}
    </p>
  );
}

/** The visitor's own view: zoom factor, 360° bearing turn, vertical pitch tilt, and horizontal pan. */
const ZOOM = { min: 0.28, max: 2.2 } as const;
const PITCH = { min: -22, max: 48 } as const;
const PAN_MAX = 18;

function OverviewReady({
  snapshot,
  listing,
  onSettled,
  intro,
  theme = "light",
  onToggleTheme,
  initialViewMode,
  commissionedQuestion,
}: {
  snapshot: CaseSnapshot;
  listing: InstrumentListing;
  onSettled: (() => void) | undefined;
  intro: OverviewIntro | undefined;
  theme?: "light" | "obsidian";
  onToggleTheme?: () => void;
  initialViewMode?: "run" | "briefing";
  commissionedQuestion?: string;
}) {
  const urlRunMode = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("mode") === "run";
  }, []);
  const urlQuestion = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const q = new URLSearchParams(window.location.search).get("q");
    return q && q.trim() ? q.trim() : undefined;
  }, []);
  const effectiveQuestion = commissionedQuestion ?? urlQuestion;
  const effectiveViewMode = initialViewMode ?? (urlRunMode ? "run" : undefined);

  const [syntheticIntroDone, setSyntheticIntroDone] = useState(false);
  const effectiveIntro = useMemo<OverviewIntro | undefined>(() => {
    if (intro !== undefined) return intro;
    if (urlRunMode && !syntheticIntroDone) {
      return {
        run: true,
        skip: false,
        from: null,
        onDone: () => {
          setSyntheticIntroDone(true);
        },
      };
    }
    return undefined;
  }, [intro, urlRunMode, syntheticIntroDone]);

  const introRef = useRef(effectiveIntro);
  introRef.current = effectiveIntro;
  const arrival = useRef<{ t0: number | null; done: boolean }>({
    t0: null,
    done: effectiveIntro === undefined,
  });
  const appearRef = useRef(effectiveIntro === undefined ? 1 : 0);
  const [arriving, setArriving] = useState(effectiveIntro !== undefined);
  const { findings: all, bandLimit } = useMemo(
    () => findingsFrom(snapshot, listing),
    [snapshot, listing],
  );
  const findings = useMemo(
    () => all.filter((f) => f.id !== "band" || bandLimit !== null),
    [all, bandLimit],
  );
  const planned = instrumentOf(listing, "field_plan") !== undefined;
  const offered = useMemo(() => {
    const views = new Set(
      (Object.keys(VIEW_INSTRUMENT) as ViewKind[]).filter((v) =>
        listing.instruments.some(
          (x) =>
            x.spec.parameters.kind === VIEW_INSTRUMENT[v] &&
            x.spec.status === "ready" &&
            (v === "rainfall" || x.assets.every((a) => a.status === "available")),
        ),
      ),
    );
    if (timeSourcesOf(snapshot)) views.add("time");
    return views;
  }, [listing, snapshot]);
  const names = placeNamesFromCase(snapshot);
  const area = catchmentAreaKm2(snapshot);
  const reasons = useBlockedReasons("field_plan");
  const descriptionId = useId();

  const liftOrder = useRef<LiftId[]>([]);
  const liftShownRef = useRef<LiftId | null>(null);

  const ask = useOverviewAsk(snapshot);
  const recorded = useContext(RecordedRunContext);
  const recClock = useRecordedClock(recorded);
  const fallbackCommandId = useMemo(
    () =>
      ask.commandId ??
      recorded?.commandId ??
      (ask.snapshot.records.branchMergeRecords ?? []).at(-1)?.commandId ??
      ask.snapshot.records.taskRecords.at(-1)?.commandId ??
      null,
    [ask.commandId, recorded?.commandId, ask.snapshot],
  );
  const pkgBrief = useMemo(
    () =>
      (fallbackCommandId ? commandBrief(ask.snapshot, fallbackCommandId) : undefined) ??
      ask.snapshot.records.briefRecords.at(-1),
    [ask.snapshot, fallbackCommandId],
  );
  const pkgView = useMemo(
    () =>
      (pkgBrief ? packageView(ask.snapshot, pkgBrief.id) : undefined) ??
      packageViewForCase(ask.snapshot, fallbackCommandId ?? undefined),
    [ask.snapshot, pkgBrief, fallbackCommandId],
  );

  const [atWork, setAtWork] = useState(effectiveViewMode === "run");
  const [thinkingHidden, setThinkingHidden] = useState(false);
  const atWorkRef = useRef(atWork);
  atWorkRef.current = atWork;
  const builtinRecorded = useMemo<RecordedRun>(() => {
    return buildRecordedRunForCase(
      snapshot,
      effectiveQuestion ?? snapshot.case.objective,
      3.5,
      effectiveViewMode === "run" ? null : 120_000,
    );
  }, [snapshot, effectiveQuestion, effectiveViewMode]);
  const atWorkShown = (atWork || recorded !== null) && !thinkingHidden;
  const effectiveRecorded =
    recorded ?? (atWorkShown && !ask.commandId ? builtinRecorded : null);
  const effectiveRecClock = useRecordedClock(effectiveRecorded);
  const askRun = useMemo(
    () => (ask.commandId ? runModel(ask.snapshot, ask.events, ask.commandId) : null),
    [ask.snapshot, ask.events, ask.commandId],
  );
  const recRun = useMemo(
    () =>
      effectiveRecorded
        ? runModel(
            effectiveRecorded.snapshot,
            revealed(effectiveRecorded, Math.max(450, effectiveRecClock)),
            effectiveRecorded.commandId,
          )
        : null,
    [effectiveRecorded, effectiveRecClock],
  );
  const fallbackCompletedRun = useMemo(
    () => runModel(builtinRecorded.snapshot, builtinRecorded.events, builtinRecorded.commandId),
    [builtinRecorded],
  );
  const run = recRun ?? askRun;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))
      ) {
        return;
      }
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        if (atWorkShown) {
          setThinkingHidden(true);
          setAtWork(false);
        } else {
          if (selRef.current) backRef.current();
          setThinkingHidden(false);
          setAtWork(true);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [atWorkShown]);
  const [runArc, setRunArc] = useState<RunArcState | null>(null);
  const [sentText, setSentText] = useState("");
  const runArcKey = useRef("");
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
  const idle = useRef<{
    last: number;
    t0: number | null;
    layer: LiftId | null;
    k: number;
  }>({ last: performance.now(), t0: null, layer: null, k: 0 });
  const [liftShown, setLiftShown] = useState<LiftId | null>(null);
  const liftLabelRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const hoverNameRef = useRef<HTMLSpanElement>(null);
  const hoverStatusRef = useRef<HTMLSpanElement>(null);
  const hoverWireRef = useRef<SVGLineElement>(null);
  const hoverSide = useRef<CardSide | null>(null);
  const liftWireRef = useRef<SVGLineElement>(null);
  const reducedMotion = useRef(false);
  const [tear, setTear] = useState<TearState | null>(null);
  const [rainWide, setRainWide] = useState(false);
  const [cellPaint, setCellPaint] = useState<CellPaint>("rgb");
  const cellPaintRef = useRef<CellPaint>("rgb");
  const rainWideRef = useRef(rainWide);
  rainWideRef.current = rainWide;
  const tearRef = useRef(tear);
  tearRef.current = tear;
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
    const q = takeQuestion();
    if (q) {
      setAskText(q);
      setAskOpen(true);
    }
  }, []);

  const sceneRef = useRef<OverviewScene | null>(null);
  const live = useRef<Live>({ s: 0, h: 0, k: 0, o: 0, r: 0 });
  const goal = useRef<Live>({ s: 0, h: 0, k: 0, o: 0, r: 0 });
  const hov = useRef<FindingId | null>(null);
  const selRef = useRef<Selection | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const cardActions = useMemo(
    () => (sel && sel !== "package" && sel !== "time" ? actionsFor(sel, offered, true) : []),
    [sel, offered],
  );
  const cardActionsRef = useRef<readonly Action[]>(cardActions);
  cardActionsRef.current = cardActions;
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
  const placeTextRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const liftRef = useRef<HTMLDivElement>(null);
  const cornerRef = useRef<HTMLDivElement>(null);
  const camRef = useRef({ zoom: 1, turn: 0, pitch: 0, panX: 0, panY: 0 });
  const [moved, setMoved] = useState(false);
  const movedRef = useRef(false);
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
  const askPromptsRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLButtonElement>(null);
  const fieldTagRef = useRef<HTMLSpanElement>(null);
  const pixTagRef = useRef<HTMLDivElement>(null);
  const selWireRef = useRef<SVGLineElement>(null);
  const routesRef = useRef<HTMLButtonElement>(null);
  const verdictEntryRef = useRef<HTMLButtonElement>(null);
  const pickRef = useRef<string | null>(null);
  const pkgRangesRef = useRef<{ ranges: HeightRange[]; lit: number | null }>({
    ranges: [],
    lit: null,
  });
  const timeRef = useRef<{ overlay: SceneState["overlay"]; snow: SceneState["snow"] }>({
    overlay: null,
    snow: null,
  });
  const timeSubs = useRef(new Set<(f: TimeFrame) => void>());
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
  const hideHoverRef = useRef<() => void>(() => undefined);
  const lifeBundleRef = useRef(lifeBundle);
  lifeBundleRef.current = lifeBundle;
  const pkgAsideRef = useRef({ k: 0, goal: 0 });
  const backRef = useRef<() => void>(() => undefined);
  const openRef = useRef<(href: string) => boolean>(() => false);
  const pkgHandoff = useRef(false);
  const standSubs = useRef(new Set<(s: Stands) => void>());
  const panelRef = useRef(false);
  const endRefs = useRef(new Map<string, HTMLElement>());
  const startRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef(new Map<FindingId, HTMLDivElement>());
  const labelRefs = useRef(new Map<FindingId, HTMLButtonElement>());
  const numeralRefs = useRef(new Map<FindingId, HTMLSpanElement>());
  const wireRefs = useRef(new Map<FindingId, SVGLineElement>());
  const lastLayout = useRef<OverviewLayout | null>(null);
  const cardSide = useRef<CardSide | null>(null);
  const cardBox = useRef<CardBox | null>(null);
  const findingsRef = useRef<readonly typeof findings[number][]>(findings);
  findingsRef.current = findings;

  const { apply, go } = useOverviewLayoutApply({
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
  });

  const introRun = effectiveIntro?.run ?? false;
  const introSkip = effectiveIntro?.skip ?? false;
  useEffect(() => {
    if (introRun || introSkip) go();
  }, [introRun, introSkip, go]);

  const {
    layers,
    data,
    failed,
    recordData,
    routesLoad,
    scanTiming,
    origin,
    routeNumber,
    sourceSet,
  } = useOverviewSceneData({
    snapshot,
    listing,
    findings,
    findingsRef,
    bandLimitM: bandLimit?.value ?? null,
    sel,
    selRef,
    landRef,
    arcRef,
    blurRef,
    rootRef,
    sceneRef,
    lastLayout,
    raf,
    live,
    camRef,
    lifeRef,
    lifeOn,
    lifeBundle,
    liftOrder,
    offeredRef,
    openRef,
    onSettled,
    apply,
    go,
  });

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
  const open = useCallback(
    (id: Selection) => {
      if (selRef.current && selRef.current !== id) return;
      camRef.current = { zoom: 1, turn: 0, pitch: 0, panX: 0, panY: 0 };
      movedRef.current = false;
      setMoved(false);
      goal.current.h = 0;
      hov.current = null;
      goal.current.r = 0;
      idle.current.layer = null;
      idle.current.k = 0;
      liftShownRef.current = null;
      setLiftShown(null);
      pkgRangesRef.current = { ranges: [], lit: null };
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
      }, 350);
    },
    [go],
  );

  const [pkgShown, setPkgShown] = useState(false);
  const pkgOpenRef = useRef<(() => void) | null>(null);

  const back = useCallback(() => {
    const was = selRef.current;
    if (was === "package") {
      setPkgShown(false);
      pkgAsideRef.current.goal = 0;
    }
    if (was === "time" && window.location.pathname === VIEW_HREF.time) goTo("/valley");
    setRainWide(false);
    goal.current.s = 0;
    go();
    if (was === "field") fieldRef.current?.focus({ preventScroll: true });
    else if (was === "routes") routesRef.current?.focus({ preventScroll: true });
    else if (was === "results")
      window.setTimeout(() => askCircleRef.current?.focus({ preventScroll: true }), DUR.s * 1000);
    else if (was === "package" || was === "time")
      window.setTimeout(() => askCircleRef.current?.focus({ preventScroll: true }), DUR.s * 1000);
    else if (was) labelRefs.current.get(was)?.focus({ preventScroll: true });
  }, [go]);

  backRef.current = back;

  const { openInPlace, backInPlace, onStackDrawn, onStackStood, onStackBack } =
    useOverviewTearInPlace({
      selRef,
      findingsRef,
      bandLimitDisplay: bandLimit?.display ?? "",
      pkgHandoff,
      back,
      open,
      setRainWide,
      tearRef,
      setTear,
      reducedMotion,
      splitRef,
      exitRef,
      goal,
      go,
      openRef,
      backRef,
    });

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
      window.setTimeout(
        () => {
          if (selRef.current === "package") setPkgShown(true);
        },
        reducedMotion.current ? 0 : DUR.s * 700,
      );
    };
    tryOpen();
  }, [back, open]);

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

  const setCam = useCallback(
    (next: { zoom?: number; turn?: number; pitch?: number; panX?: number; panY?: number }) => {
      const c = camRef.current;
      c.zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, next.zoom ?? c.zoom));
      const rawTurn = next.turn ?? c.turn;
      c.turn = ((((rawTurn + 180) % 360) + 360) % 360) - 180;
      c.pitch = Math.min(PITCH.max, Math.max(PITCH.min, next.pitch ?? c.pitch));
      c.panX = Math.min(PAN_MAX, Math.max(-PAN_MAX, next.panX ?? c.panX));
      c.panY = Math.min(PAN_MAX, Math.max(-PAN_MAX, next.panY ?? c.panY));
      const isMoved =
        Math.abs(c.zoom - 1) > 1e-3 ||
        Math.abs(c.turn) > 0.1 ||
        Math.abs(c.pitch) > 0.1 ||
        Math.hypot(c.panX, c.panY) > 0.05;
      movedRef.current = isMoved;
      setMoved(isMoved);
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
  useOverviewIdleWake({
    reducedMotion,
    idle,
    waitSeconds: IDLE.wait,
    go,
  });
  useEffect(() => {
    panelRef.current = panel;
    go();
  }, [panel, go]);
  const toOpening = useCallback(() => {
    window.location.assign(OPENING_HREF);
  }, []);
  const reset = useCallback(() => {
    if (selRef.current) back();
    goal.current.r = 0;
    goal.current.h = 0;
    hov.current = null;
    idle.current.layer = null;
    idle.current.k = 0;
    liftShownRef.current = null;
    setLiftShown(null);
    pkgRangesRef.current = { ranges: [], lit: null };
    setCam({ zoom: 1, turn: 0, pitch: 0, panX: 0, panY: 0 });
  }, [back, setCam]);

  const focusCauseFromLedger = useCallback(
    (explanationId: string) => {
      const lim = bandLimit?.value ?? 2317;
      idle.current.t0 = -1;
      if (explanationId === "rainfall") {
        goal.current.r = 0;
        liftShownRef.current = "rain";
        setLiftShown("rain");
        idle.current.layer = "rain";
        idle.current.k = 1;
        pkgRangesRef.current = { ranges: [], lit: null };
        camRef.current.zoom = 1.08;
        camRef.current.turn = 14;
        go();
      } else if (explanationId === "grazing") {
        goal.current.r = 1;
        liftShownRef.current = "bands";
        setLiftShown("bands");
        idle.current.layer = "bands";
        idle.current.k = 1;
        pkgRangesRef.current = { ranges: [{ lo: lim, hi: 3200 }], lit: 0 };
        camRef.current.zoom = 1.18;
        camRef.current.turn = -26;
        go();
      } else if (explanationId === "land_use") {
        goal.current.r = 0;
        liftShownRef.current = "cover";
        setLiftShown("cover");
        idle.current.layer = "cover";
        idle.current.k = 1;
        pkgRangesRef.current = { ranges: [{ lo: 1800, hi: lim }], lit: 0 };
        camRef.current.zoom = 1.22;
        camRef.current.turn = -16;
        go();
      } else if (explanationId === "snow_terrain") {
        goal.current.r = 0;
        liftShownRef.current = "bands";
        setLiftShown("bands");
        idle.current.layer = "bands";
        idle.current.k = 1;
        pkgRangesRef.current = { ranges: [{ lo: lim, hi: 3200 }], lit: 0 };
        camRef.current.zoom = 1.14;
        camRef.current.turn = -20;
        go();
      } else if (explanationId === "data_artefact") {
        goal.current.r = 1;
        liftShownRef.current = "trend";
        setLiftShown("trend");
        idle.current.layer = "trend";
        idle.current.k = 1;
        pkgRangesRef.current = { ranges: [], lit: null };
        camRef.current.zoom = 1.32;
        camRef.current.turn = 22;
        go();
      }
    },
    [bandLimit?.value, go],
  );

  const focusLayer = useCallback(
    (lens: "bands" | "cover" | "trend" | "rain" | "routes" | null, manual = false) => {
      const lim = bandLimit?.value ?? 2317;
      const applyCam = (zoom: number, turn: number) => {
        if (!arrival.current.done) return;
        if (manual) {
          setCam({ zoom, turn, pitch: 0, panX: 0, panY: 0 });
        } else if (!movedRef.current) {
          camRef.current.zoom = zoom;
          camRef.current.turn = turn;
        }
      };
      if (!lens) {
        goal.current.r = 0;
        liftShownRef.current = null;
        setLiftShown(null);
        idle.current.t0 = null;
        idle.current.layer = null;
        idle.current.k = 0;
        pkgRangesRef.current = { ranges: [], lit: null };
        applyCam(1, 0);
        go();
        return;
      }
      if (manual) {
        idle.current.t0 = -1;
      } else {
        idle.current.t0 = null;
        idle.current.layer = null;
        idle.current.k = 0;
        liftShownRef.current = null;
        setLiftShown(null);
      }
      if (lens === "bands") {
        goal.current.r = 0;
        if (manual) {
          liftShownRef.current = "bands";
          setLiftShown("bands");
          idle.current.layer = "bands";
          idle.current.k = 1;
        }
        pkgRangesRef.current = {
          ranges: [
            { lo: 1800, hi: lim },
            { lo: lim, hi: 3200 },
          ],
          lit: 0,
        };
        applyCam(1.06, -8);
        go();
      } else if (lens === "rain") {
        goal.current.r = 0;
        if (manual) {
          liftShownRef.current = "rain";
          setLiftShown("rain");
          idle.current.layer = "rain";
          idle.current.k = 1;
        }
        pkgRangesRef.current = { ranges: [], lit: null };
        applyCam(1.04, 8);
        go();
      } else if (lens === "trend") {
        goal.current.r = 0;
        if (manual) {
          liftShownRef.current = "trend";
          setLiftShown("trend");
          idle.current.layer = "trend";
          idle.current.k = 1;
        }
        pkgRangesRef.current = { ranges: [], lit: null };
        applyCam(1.08, 10);
        go();
      } else if (lens === "cover") {
        goal.current.r = 0;
        if (manual) {
          liftShownRef.current = "cover";
          setLiftShown("cover");
          idle.current.layer = "cover";
          idle.current.k = 1;
        }
        pkgRangesRef.current = { ranges: [{ lo: 1800, hi: lim }], lit: 0 };
        applyCam(1.06, -6);
        go();
      } else if (lens === "routes") {
        goal.current.r = 1;
        if (manual) {
          liftShownRef.current = "bands";
          setLiftShown("bands");
          idle.current.layer = "bands";
          idle.current.k = 1;
        }
        pkgRangesRef.current = { ranges: [{ lo: lim, hi: 3200 }], lit: 0 };
        applyCam(1.08, -12);
        go();
      }
    },
    [bandLimit?.value, go, setCam],
  );

  const focusTaskLayer = useCallback(
    (task: { kind: string; sublabel?: string | null } | null) => {
      if (!task) return;
      if (task.kind === "plan") {
        focusLayer("bands", false);
      } else if (task.sublabel === "Vegetation" || task.sublabel === "NDVI & trend recipes") {
        focusLayer("trend", false);
      } else if (
        task.sublabel === "Rainfall & terrain" ||
        task.sublabel === "Terrain strata & rainfall"
      ) {
        focusLayer("rain", false);
      } else if (task.kind === "source_research") {
        focusLayer("cover", false);
      } else if (task.kind === "livelihood_governance") {
        focusLayer("routes", false);
      } else if (
        task.kind === "explanation_branches" ||
        task.kind === "instrument_composition"
      ) {
        focusLayer("bands", false);
      }
    },
    [focusLayer],
  );

  useOverviewKeyboardShortcuts({
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
  });

  useOverviewCameraDragWheel({
    rootRef,
    camRef,
    setCam,
  });

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
  useOverviewLandHover({
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
  });

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

  const pkgHref =
    sel === "package" && (pkgBrief || pkgView)
      ? `/brief?case=${encodeURIComponent(ask.snapshot.case.id)}&brief=${encodeURIComponent(pkgBrief?.id ?? pkgView?.briefId ?? "")}`
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
    ...(lifeBundle && (!sel || sel === "time") && !tear && !atWorkShown
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
  const results = sel === "results" ? (fallbackCommandId ?? "case_verdict") : null;
  const resultsActions = pkgView
    ? cardActions.map((a) =>
        a.key === "Enter" && a.view === "field" ? { ...a, key: "F" as const } : a,
      )
    : cardActions;
  pkgOpenRef.current = sel === "results" && pkgView ? openPackage : null;
  const limits = bandLimitsOf(snapshot);

  return (
    <div
      ref={rootRef}
      className={styles.layer}
      data-overview-root
      data-arriving={arriving ? "" : undefined}
      data-tearing={tear !== null ? "" : undefined}
      data-at-work={atWorkShown && run && !sel ? (run.done ? "done" : "running") : undefined}
      data-covered={tear?.shown ? (tear.kind === "pixel" ? "land" : "") : undefined}
      data-case-revision={snapshot.case.revision}
    >
      <p id={descriptionId} className={styles.srOnly}>
        {en["overview.description"].text} {en["overview.keys"].text}
      </p>
      <canvas ref={landRef} className={styles.canvas} aria-hidden="true" data-land />
      <canvas ref={blurRef} className={styles.blur} aria-hidden="true" data-land />
      <canvas ref={arcRef} className={`${styles.canvas} ${styles.arcCanvas}`} aria-hidden="true" />
      <div ref={cornerRef} className={styles.cornerfade} aria-hidden="true" />
      <div ref={hudRef} className={styles.hud}>
        <div ref={questionRef} className={styles.question} data-case-question>
          <span className={styles.questionCaret} aria-hidden="true">
            {"▸"}
          </span>
          <span>{effectiveQuestion ?? snapshot.case.objective}</span>
        </div>
        {!atWorkShown && !sel ? (
          <button
            type="button"
            className={styles.thinkingClosedPill}
            data-thinking-toggle="closed"
            onClick={() => {
              setThinkingHidden(false);
              setAtWork(true);
            }}
          >
            <span className={styles.thinkingPillDot} aria-hidden="true" />
            <span>{`${(run ?? fallbackCompletedRun).tasks.length} steps completed`}</span>
            <span className={styles.thinkingPillAction}>Inspect thinking ▸</span>
            <kbd className={styles.thinkingPillKbd}>T</kbd>
          </button>
        ) : null}
        {atWorkShown && run && !sel && runArc ? (
          <AtWork
            run={run}
            arc={runArc.arc}
            placeName={names.valleyName}
            question={
              effectiveRecorded?.question ??
              (sentText || effectiveQuestion || snapshot.case.objective)
            }
            onFindings={() => {
              setThinkingHidden(true);
              setAtWork(false);
              open("results");
            }}
            onToggleThinking={() => {
              setThinkingHidden(true);
              setAtWork(false);
            }}
            onFocusTask={focusTaskLayer}
            onFocusLayer={(l) => {
              focusLayer(l, true);
            }}
            onFocusCause={focusCauseFromLedger}
            rimLeft={runArc.rimLeft}
            {...(effectiveRecorded
              ? {
                  nowMs: effectiveRecClock,
                  recording: {
                    speed: effectiveRecorded.speed,
                    length: lengthOf(effectiveRecorded),
                  },
                }
              : {})}
            sourceName={(id) => {
              const src = (effectiveRecorded?.snapshot ?? ask.snapshot).records.sourceRecords.find(
                (x) => x.id === id,
              );
              return src ? shortCitation(src) : en["results.unknownSource"].text;
            }}
          />
        ) : null}
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
          {data ? (
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
                    <span className={styles.liftStatus}>
                      {formatLiftStatus(liftShown, findings, data, limits)}
                    </span>
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
              {data.pixel ? (
                <div ref={pixTagRef} className={styles.pixTag}>
                  <span>{en["overview.pixel"].text}</span>
                </div>
              ) : null}
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
                    caption={captionOf(f, bandLimit?.display ?? "", findings)}
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
          </div>
          <div className={styles.placeEntries}>
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
            {data ? (
              <button
                ref={verdictEntryRef}
                type="button"
                className={styles.verdictEntry}
                data-verdict-entry
                aria-expanded={sel === "results"}
                onClick={() => {
                  open("results");
                }}
              >
                <i className={styles.verdictDot} aria-hidden="true" />
                {pkg["verdict.open"].text}
                <Arrow deg={45} className={styles.tagArrow} />
              </button>
            ) : null}
          </div>
        </footer>
        {failed ? (
          <p className={styles.failed} role="status" data-overview-failed>
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
                onFocusCause={focusCauseFromLedger}
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
                caption={selFinding ? captionOf(selFinding, bandLimit?.display ?? "", findings) : []}
                bandLimit={bandLimit?.display ?? ""}
                data={sel === "field" ? null : (recordData[sel] ?? fallbackRecordData(sel, snapshot))}
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
                scanTiming={sel === "band" || sel === "fdr" ? scanTiming : null}
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
            onEnter={(text) => {
              setAtWork(true);
              setSentText(text);
              setAskOpen(false);
              ask.send(text);
            }}
            activity={ask.activity}
            onFindings={() => {
              open("results");
            }}
            onOpenPlan={pkgView ? openPackage : undefined}
            liveSearch={ask.liveSearch}
            onToggleLiveSearch={ask.setLiveSearch}
            onHover={setAskHover}
            circleRef={askCircleRef}
            besideRef={askBesideRef}
            suggestions={(listing.suggestedQuestions ?? []).filter(
              (q) =>
                q.question.trim().toLowerCase() !== snapshot.case.objective.trim().toLowerCase(),
            )}
            showPromptsAtRest={false}
            promptsRef={askPromptsRef}
          />
        ) : null}
      </div>
      {onToggleTheme ? (
        <button
          type="button"
          className={styles.overviewThemeBtn}
          onClick={onToggleTheme}
          aria-label={theme === "obsidian" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "obsidian" ? "Switch to light theme" : "Switch to dark theme"}
        >
          <ThemeIcon theme={theme} />
        </button>
      ) : null}
      <ModeLine
        mode={snapshot.case.mode}
        run={run?.sourceKnown ? (run.replay ? "replay" : "live") : null}
      />
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
            <SourcesLine sources={layers ? { ...sourceSet, relief: EXAG } : sourceSet} />
          </KeyLegend>
          <SourcesPanel
            sources={sourceSet}
            open={panel}
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
          on={lifeOn && (!sel || sel === "time") && !tear && !atWorkShown}
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
        <OverviewInPlaceInstrument
          tear={tear}
          snapshot={snapshot}
          listing={listing}
          backInPlace={backInPlace}
          onStackDrawn={onStackDrawn}
          onStackStood={onStackStood}
          onStackBack={onStackBack}
          cellPaint={cellPaint}
          cellPaintRef={cellPaintRef}
          setCellPaint={setCellPaint}
          go={go}
          lastLayout={lastLayout}
          hudRef={hudRef}
          className={styles.inPlace}
        />
      ) : null}
      <span hidden data-view-moved={moved ? "" : undefined} />
    </div>
  );
}
