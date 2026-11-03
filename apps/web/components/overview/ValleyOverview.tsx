"use client";

// The valley overview at /valley: the catchment relief seen along the valley's long axis inside one
// hairline arc, open at the bottom, with five findings at fixed clock angles and the proposed field check marked on
// the land. Hover or focus a finding: its halo grows, its numeral comes to full ink, its arrow fills, a hairline joins
// dot and label, and the others dim. Click or Enter opens it: the camera turns toward its side, the land blurs, and
// its record opens on its side with the way to its full instrument; Esc returns. The ask circle or "/" opens the ask;
// Enter sends the question. The case's proposed walking routes lie on the land as dashed amber lines
// with a small mark at each end; their entry lifts them on hover and opens them with each route's figures from the
// bundle. The scene is drawn by lib/overview/scene; this component orchestrates layout, run state, and HUD overlays.

import { type CaseSnapshot, type InstrumentListing } from "@siterra/contracts";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { en } from "../../lib/copy/en";
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
import { findingsFrom, type FindingId } from "../../lib/overview/findings";
import type { LiftId, Selection } from "../../lib/overview/scene/overview";
import { catchmentAreaKm2 } from "../../lib/overview/record";
import { placeNamesFromCase } from "../../lib/projection/arrival";
import { takeQuestion } from "../../lib/shell/handoff";
import { useBlockedReasons, useInstrumentRecords } from "../instruments/InstrumentRecords";
import type { CellPaint } from "../../lib/instruments/pixel/paint";
import {
  goTo,
  useOverviewCameraDragWheel,
  useOverviewIdleWake,
  useOverviewKeyboardShortcuts,
  useOverviewLandHover,
} from "./useOverviewControls";
import { DUR, IDLE, useOverviewLayoutApply } from "./useOverviewLayoutApply";
import { useOverviewSceneData } from "./useOverviewSceneData";
import { useOverviewTearInPlace, type TearState } from "./useOverviewTearInPlace";
import { timeSourcesOf } from "../../lib/time/load";
import { lifeSourceOf } from "../../lib/life/load";
import { OverviewHudLayer } from "./OverviewHudLayer";
import { useOverviewLayerFocus } from "./useOverviewLayerFocus";
import {
  useOverviewDomRefs,
  useOverviewRunState,
  type OverviewIntro,
} from "./useOverviewRunState";
import styles from "./ValleyOverview.module.css";

export type { OverviewIntro } from "./useOverviewRunState";

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
  const {
    effectiveQuestion, effectiveIntro, introRef, arrival, appearRef, arriving, setArriving,
    runPaused, setRunPaused, ask, fallbackCommandId, pkgBrief, pkgView, setAtWork,
    setThinkingHidden, atWorkShown, atWorkRef, sentText, setSentText, effectiveRecorded,
    effectiveRecClock, run, thinkingRun, runArc, setRunArc, runArcKey,
  } = useOverviewRunState({ snapshot, intro, initialViewMode, commissionedQuestion });

  const { findings: all, bandLimit } = useMemo(() => findingsFrom(snapshot, listing), [snapshot, listing]);
  const findings = useMemo(() => all.filter((f) => f.id !== "band" || bandLimit !== null), [all, bandLimit]);
  const canvasFindings = useMemo(
    () => findings.filter((f) => f.id !== "catchment" || Boolean(f.missingReason)),
    [findings],
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

  const [askOpen, setAskOpen] = useState(false);
  const askOpenRef = useRef(askOpen);
  askOpenRef.current = askOpen;
  const [liftShown, setLiftShown] = useState<LiftId | null>(null);
  const [tear, setTear] = useState<TearState | null>(null);
  const [rainWide, setRainWide] = useState(false);
  const [cellPaint, setCellPaint] = useState<CellPaint>("rgb");
  const cellPaintRef = useRef<CellPaint>("rgb");
  const rainWideRef = useRef(rainWide);
  rainWideRef.current = rainWide;
  const tearRef = useRef(tear);
  tearRef.current = tear;
  const [askText, setAskText] = useState("");
  const [askHover, setAskHover] = useState(false);
  useEffect(() => {
    const q = takeQuestion();
    if (q) {
      setAskText(q);
      setAskOpen(true);
    }
  }, []);

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
  const [moved, setMoved] = useState(false);
  const lifeBundle = useMemo(() => lifeSourceOf(snapshot), [snapshot]);
  const [lifeOn, setLifeOn] = useState(false);
  const lifeBundleRef = useRef(lifeBundle);
  lifeBundleRef.current = lifeBundle;

  const domRefs = useOverviewDomRefs(canvasFindings, lifeOn);
  const {
    liftShownRef, idle, reducedMotion, goal, hov, selRef, rootRef, camRef, camTargetRef,
    movedRef, linkRef, firstResultRef, askCircleRef, fieldRef, routesRef, pickRef,
    pkgRangesRef, hideHoverRef, pkgAsideRef, backRef, pkgHandoff, panelRef, labelRefs,
  } = domRefs;

  const { apply, go } = useOverviewLayoutApply({
    ...domRefs, runArcKey, setRunArc, setSel, appearRef, tearRef, setTear,
    cellPaintRef, setCellPaint, askOpenRef, arrival, setLiftShown, introRef, setArriving,
  });

  const introRun = effectiveIntro?.run ?? false;
  const introSkip = effectiveIntro?.skip ?? false;
  useEffect(() => {
    if (introRun || introSkip) go();
  }, [introRun, introSkip, go]);

  const {
    layers, data, terrainOutline, failed, recordData, routesLoad, scanTiming, origin, routeNumber, sourceSet,
  } = useOverviewSceneData({
    ...domRefs, snapshot, listing, findings, bandLimitM: bandLimit?.value ?? null,
    sel, lifeOn, lifeBundle, offeredRef, onSettled, apply, go,
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
    [go, pickRef],
  );
  const open = useCallback(
    (id: Selection) => {
      if (selRef.current && selRef.current !== id && goal.current.s > 0) return;
      camTargetRef.current = null;
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
    [
      camRef, camTargetRef, firstResultRef, go, goal, hov, idle,
      liftShownRef, linkRef, movedRef, pickRef, pkgRangesRef, selRef,
    ],
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
    else if (was === "results" || was === "package" || was === "time")
      window.setTimeout(() => askCircleRef.current?.focus({ preventScroll: true }), DUR.s * 1000);
    else if (was) labelRefs.current.get(was)?.focus({ preventScroll: true });
  }, [askCircleRef, fieldRef, go, goal, labelRefs, pkgAsideRef, routesRef, selRef]);

  backRef.current = back;

  const { openInPlace, backInPlace, onStackDrawn, onStackStood, onStackBack } =
    useOverviewTearInPlace({
      ...domRefs, bandLimitDisplay: bandLimit?.display ?? "", back, open,
      setRainWide, tearRef, setTear, go,
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
  }, [back, open, pkgHandoff, reducedMotion, selRef]);

  useEffect(() => {
    go();
  }, [lifeOn, go]);

  const [panel, setPanel] = useState(false);
  const [scope, setScope] = useState(false);
  useOverviewIdleWake({ reducedMotion, idle, waitSeconds: IDLE.wait, go });
  useEffect(() => {
    panelRef.current = panel;
    go();
  }, [panel, go, panelRef]);

  const onAskOpen = useCallback(() => {
    setAskText("");
    setAskOpen(true);
  }, []);
  const onAskClose = useCallback(() => {
    setAskOpen(false);
  }, []);

  const {
    timeMount, lifeMount, pkgLand, setCam, toOpening, reset,
    focusCauseFromLedger, focusLayer, focusTaskLayer, keys,
  } = useOverviewLayerFocus({
    snapshot, askSnapshot: ask.snapshot, bandLimitValue: bandLimit?.value ?? null,
    data, arrival, domRefs, setMoved, setLiftShown, sel, atWorkShown, setAtWork,
    setThinkingHidden, run, thinkingRun, runPaused, setRunPaused, pkgBrief, pkgView,
    lifeBundle, lifeOn, setLifeOn, tear, askOpen, arriving, hoverShown,
    panel, setPanel, scope, setScope, onAskOpen, open, back, go,
  });

  useOverviewKeyboardShortcuts({
    arriving, askOpen, panel, setPanel, tearRef, rainWideRef, setRainWide,
    selRef, atWorkRef,
    setAtWork: (next) => {
      const val = typeof next === "function" ? next(atWorkRef.current) : next;
      if (!val) {
        if (run && !run.done) {
          toOpening();
          return;
        }
        focusTaskLayer(null);
        setThinkingHidden(true);
      }
      setAtWork(val);
    },
    pkgOpenRef, cardActionsRef, hoverShown, hoverActs, lifeBundleRef,
    setLifeOn, back, reset, toOpening, openInPlace,
  });

  useOverviewCameraDragWheel({ rootRef, camRef, setCam });

  const hoverWords = useRef<{
    routes: readonly { id: string; title: string }[];
    limits: readonly [number, number] | null;
  }>({ routes: [], limits: null });
  hoverWords.current = { routes: data?.routes ?? [], limits: bandLimitsOf(snapshot) };
  const arrivingRef = useRef(arriving);
  arrivingRef.current = arriving;
  useOverviewLandHover({
    ...domRefs, hoverShown, hoverActs, setHoverThing, tearRef,
    arrivingRef, askOpenRef, hoverWords, offeredRef, atWorkRef,
  });

  useEffect(() => {
    if (atWorkShown) hideHoverRef.current();
  }, [atWorkShown, hideHoverRef]);
  useEffect(() => {
    goal.current.o = askOpen ? 1 : 0;
    go();
  }, [askOpen, go, goal]);
  useEffect(() => {
    goal.current.k = askHover ? 1 : 0;
    go();
  }, [askHover, go, goal]);

  return (
    <OverviewHudLayer
      snapshot={snapshot} listing={listing} ask={ask} names={names} area={area}
      findings={findings} canvasFindings={canvasFindings} bandLimit={bandLimit}
      planned={planned} offered={offered} reasons={reasons} descriptionId={descriptionId}
      theme={theme} onToggleTheme={onToggleTheme} effectiveQuestion={effectiveQuestion}
      sentText={sentText} setSentText={setSentText} atWorkShown={atWorkShown}
      setAtWork={setAtWork} setThinkingHidden={setThinkingHidden} run={run}
      runArc={runArc} runPaused={runPaused} setRunPaused={setRunPaused}
      effectiveRecorded={effectiveRecorded} effectiveRecClock={effectiveRecClock}
      fallbackCommandId={fallbackCommandId} pkgView={pkgView} pkgShown={pkgShown}
      pkgOpenRef={pkgOpenRef} openPackage={openPackage} sel={sel}
      cardActions={cardActions} hoverThing={hoverThing} arriving={arriving}
      tear={tear} rainWide={rainWide} setRainWide={setRainWide}
      cellPaint={cellPaint} cellPaintRef={cellPaintRef} setCellPaint={setCellPaint}
      moved={moved} liftShown={liftShown} askOpen={askOpen} setAskOpen={setAskOpen}
      askText={askText} setAskText={setAskText} setAskHover={setAskHover}
      onAskOpen={onAskOpen} onAskClose={onAskClose} panel={panel} setPanel={setPanel}
      scope={scope} setScope={setScope} lifeBundle={lifeBundle} lifeOn={lifeOn}
      keys={keys} layers={layers} data={data} terrainOutline={terrainOutline}
      failed={failed} recordData={recordData} routesLoad={routesLoad}
      scanTiming={scanTiming} origin={origin} routeNumber={routeNumber}
      sourceSet={sourceSet} timeMount={timeMount} lifeMount={lifeMount}
      pkgLand={pkgLand} focusTaskLayer={focusTaskLayer} focusLayer={focusLayer}
      focusCauseFromLedger={focusCauseFromLedger} hover={hover} pickRoute={pickRoute}
      open={open} back={back} toOpening={toOpening} openInPlace={openInPlace}
      backInPlace={backInPlace} onStackDrawn={onStackDrawn} onStackStood={onStackStood}
      onStackBack={onStackBack} go={go} refs={domRefs}
    />
  );
}
