"use client";

import type { CaseSnapshot } from "@siterra/contracts";
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { Box as CardBox, Side as CardSide } from "../../lib/overview/card";
import { shouldReopen } from "../../lib/overview/ask-line";
import type { Finding, FindingId } from "../../lib/overview/findings";
import type {
  LiftId,
  OverviewLayout,
  OverviewScene,
  SceneState,
  Selection,
} from "../../lib/overview/scene/overview";
import type { HeightRange } from "../../lib/package/bands";
import { commandBrief, packageView, packageViewForCase } from "../../lib/package/package";
import { buildRecordedRunForCase } from "../../lib/run/case-run";
import { runModel, type RunModel } from "../../lib/run/model";
import {
  RecordedRunContext,
  revealed,
  useRecordedClock,
  type RecordedRun,
} from "../../lib/run/recorded";
import { useRecordsRefresh } from "../instruments/InstrumentRecords";
import type { LifeFrame } from "../life/LifeLayer";
import type { Stands } from "../package/PackageBriefing";
import type { TimeFrame } from "../time/TimeView";
import { useOverviewAsk } from "./useOverviewAsk";
import type { Live, RunArcState } from "./useOverviewLayoutApply";

/**
 * Arrival state passed from the globe journey: the overview mounts while the globe is visible,
 * draws its terrain out of sight, and when `run` is set plays the camera descent to the overview pose.
 * `skip` ends the transition immediately (Esc, Enter, or reduced motion).
 */
export interface OverviewIntro {
  run: boolean;
  skip: boolean;
  from: { x: number; y: number } | null;
  onDone: () => void;
}

export interface OverviewRunState {
  effectiveQuestion: string | undefined;
  effectiveIntro: OverviewIntro | undefined;
  introRef: RefObject<OverviewIntro | undefined>;
  arrival: RefObject<{ t0: number | null; done: boolean }>;
  appearRef: RefObject<number>;
  arriving: boolean;
  setArriving: Dispatch<SetStateAction<boolean>>;
  runPaused: boolean;
  setRunPaused: Dispatch<SetStateAction<boolean>>;
  ask: ReturnType<typeof useOverviewAsk>;
  fallbackCommandId: string | null;
  pkgBrief: ReturnType<typeof commandBrief>;
  pkgView: ReturnType<typeof packageView>;
  atWork: boolean;
  setAtWork: Dispatch<SetStateAction<boolean>>;
  thinkingHidden: boolean;
  setThinkingHidden: Dispatch<SetStateAction<boolean>>;
  atWorkShown: boolean;
  atWorkRef: RefObject<boolean>;
  sentText: string;
  setSentText: Dispatch<SetStateAction<string>>;
  effectiveRecorded: RecordedRun | null;
  effectiveRecClock: number;
  run: RunModel | null;
  thinkingRun: RunModel | null;
  runArc: RunArcState | null;
  setRunArc: Dispatch<SetStateAction<RunArcState | null>>;
  runArcKey: RefObject<string>;
}

export function useOverviewRunState({
  snapshot,
  intro,
  initialViewMode,
  commissionedQuestion,
}: {
  snapshot: CaseSnapshot;
  intro: OverviewIntro | undefined;
  initialViewMode: "run" | "briefing" | undefined;
  commissionedQuestion: string | undefined;
}): OverviewRunState {
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

  const [runPaused, setRunPaused] = useState(false);
  const ask = useOverviewAsk(snapshot, runPaused);
  const recorded = useContext(RecordedRunContext);

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

  const pkgView = useMemo<ReturnType<typeof packageView>>(
    () =>
      (pkgBrief ? packageView(ask.snapshot, pkgBrief.id) : undefined) ??
      packageViewForCase(ask.snapshot, fallbackCommandId ?? undefined),
    [ask.snapshot, pkgBrief, fallbackCommandId],
  );

  const [atWork, setAtWork] = useState(effectiveViewMode === "run");
  const [thinkingHidden, setThinkingHidden] = useState(false);
  useEffect(() => {
    if (effectiveViewMode === "run") {
      setThinkingHidden(false);
      setAtWork(true);
    }
  }, [effectiveViewMode]);

  const builtinRecorded = useMemo<RecordedRun | null>(
    () => buildRecordedRunForCase(snapshot, 3.5, effectiveViewMode !== "run"),
    [snapshot, effectiveViewMode],
  );
  const atWorkShown = (atWork || recorded !== null) && !thinkingHidden;
  const atWorkRef = useRef(atWorkShown);
  atWorkRef.current = atWorkShown;
  const [sentText, setSentText] = useState("");

  const effectiveRecorded = recorded ?? (!ask.commandId && !sentText ? builtinRecorded : null);
  const effectiveRecClock = useRecordedClock(effectiveRecorded, runPaused);
  const askRun = useMemo(
    () => (ask.commandId ? runModel(ask.snapshot, ask.events, ask.commandId) : null),
    [ask.snapshot, ask.events, ask.commandId],
  );
  const recRun = useMemo(
    () =>
      effectiveRecorded
        ? runModel(
            effectiveRecorded.snapshot,
            revealed(effectiveRecorded, Math.max(550, effectiveRecClock)),
            effectiveRecorded.commandId,
          )
        : null,
    [effectiveRecorded, effectiveRecClock],
  );
  const fallbackCompletedRun = useMemo(
    () =>
      builtinRecorded
        ? runModel(builtinRecorded.snapshot, builtinRecorded.events, builtinRecorded.commandId)
        : null,
    [builtinRecorded],
  );
  const run = recRun ?? askRun;
  const thinkingRun = run ?? fallbackCompletedRun;

  useEffect(() => {
    if (run?.done) setRunPaused(false);
  }, [run?.done]);

  const [runArc, setRunArc] = useState<RunArcState | null>(null);
  const runArcKey = useRef("");
  const refresh = useRecordsRefresh();
  const reopening = useRef<number | null>(null);
  useEffect(() => {
    const at = ask.snapshot.case.revision;
    if (!shouldReopen(snapshot.case.revision, at, reopening.current)) return;
    reopening.current = at;
    refresh(ask.snapshot);
  }, [ask.snapshot, snapshot.case.revision, refresh]);

  return {
    effectiveQuestion,
    effectiveIntro,
    introRef,
    arrival,
    appearRef,
    arriving,
    setArriving,
    runPaused,
    setRunPaused,
    ask,
    fallbackCommandId,
    pkgBrief,
    pkgView,
    atWork,
    setAtWork,
    thinkingHidden,
    setThinkingHidden,
    atWorkShown,
    atWorkRef,
    sentText,
    setSentText,
    effectiveRecorded,
    effectiveRecClock,
    run,
    thinkingRun,
    runArc,
    setRunArc,
    runArcKey,
  };
}

export function useOverviewDomRefs(canvasFindings: readonly Finding[], lifeOn: boolean) {
  const liftOrder = useRef<LiftId[]>([]);
  const liftShownRef = useRef<LiftId | null>(null);
  const idle = useRef<{
    last: number;
    t0: number | null;
    layer: LiftId | null;
    k: number;
  }>({ last: performance.now(), t0: null, layer: null, k: 0 });
  const liftLabelRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const hoverNameRef = useRef<HTMLSpanElement>(null);
  const hoverStatusRef = useRef<HTMLSpanElement>(null);
  const hoverWireRef = useRef<SVGLineElement>(null);
  const hoverSide = useRef<CardSide | null>(null);
  const liftWireRef = useRef<SVGLineElement>(null);
  const reducedMotion = useRef(false);
  const exitRef = useRef<{ dir: -1 | 0 | 1; k: number; away: number; narrow: boolean }>({
    dir: 0,
    k: 0,
    away: 0,
    narrow: true,
  });
  const splitRef = useRef<{ dir: -1 | 0 | 1; k: number }>({ dir: 0, k: 0 });
  const sceneRef = useRef<OverviewScene | null>(null);
  const live = useRef<Live>({ s: 0, h: 0, k: 0, o: 0, r: 0 });
  const goal = useRef<Live>({ s: 0, h: 0, k: 0, o: 0, r: 0 });
  const hov = useRef<FindingId | null>(null);
  const selRef = useRef<Selection | null>(null);
  const raf = useRef(0);
  const last = useRef(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const landRef = useRef<HTMLCanvasElement>(null);
  const arcRef = useRef<HTMLCanvasElement>(null);
  const blurRef = useRef<HTMLCanvasElement>(null);
  const placeTextRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const hatchRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const liftRef = useRef<HTMLDivElement>(null);
  const cornerRef = useRef<HTMLDivElement>(null);
  const camRef = useRef({ zoom: 1, turn: 0, pitch: 0, panX: 0, panY: 0 });
  const camTargetRef = useRef<{
    zoom: number;
    turn: number;
    pitch: number;
    panX: number;
    panY: number;
  } | null>(null);
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
  const findingsRef = useRef<readonly Finding[]>(canvasFindings);
  findingsRef.current = canvasFindings;

  return {
    liftOrder,
    liftShownRef,
    idle,
    liftLabelRef,
    hoverRef,
    hoverNameRef,
    hoverStatusRef,
    hoverWireRef,
    hoverSide,
    liftWireRef,
    reducedMotion,
    exitRef,
    splitRef,
    sceneRef,
    live,
    goal,
    hov,
    selRef,
    raf,
    last,
    rootRef,
    landRef,
    arcRef,
    blurRef,
    placeTextRef,
    questionRef,
    answerRef,
    hatchRef,
    hudRef,
    liftRef,
    cornerRef,
    camRef,
    camTargetRef,
    movedRef,
    recRef,
    instRef,
    bigRef,
    linkRef,
    evidRef,
    frostRef,
    connectorRef,
    midcapRef,
    firstResultRef,
    askCircleRef,
    askBesideRef,
    askPromptsRef,
    fieldRef,
    fieldTagRef,
    pixTagRef,
    selWireRef,
    routesRef,
    verdictEntryRef,
    pickRef,
    pkgRangesRef,
    timeRef,
    timeSubs,
    lifeRef,
    lifeSubs,
    lifeHot,
    hideHoverRef,
    pkgAsideRef,
    backRef,
    openRef,
    pkgHandoff,
    standSubs,
    panelRef,
    endRefs,
    startRef,
    dotRefs,
    labelRefs,
    numeralRefs,
    wireRefs,
    lastLayout,
    cardSide,
    cardBox,
    findingsRef,
  };
}
