"use client";

import { type CaseSnapshot } from "@siterra/contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { en } from "../../lib/copy/en";
import { pkg } from "../../lib/copy/package";
import { bandLimitsOf } from "../../lib/land/record";
import type { AskStatus } from "../../lib/overview/ask-line";
import type { LiftId, Selection } from "../../lib/overview/scene/overview";
import type { packageView } from "../../lib/package/package";
import type { RunModel } from "../../lib/run/model";
import { OPENING_HREF, type KeyEntry } from "../controls/ScreenChrome";
import type { LifeMount } from "../life/LifeLayer";
import type { TimeMount } from "../time/TimeView";
import type { Stands } from "./useOverviewLayoutApply";
import type { useOverviewDomRefs } from "./useOverviewRunState";
import type { TearState } from "./useOverviewTearInPlace";
import { sheetOfTask, type StepTask } from "./AtWorkCursors";

/** Camera bounds: zoom factor, 360° bearing turn, vertical pitch tilt, and horizontal pan. */
const ZOOM = { min: 0.28, max: 2.2 } as const;
const PITCH = { min: -22, max: 48 } as const;
const PAN_MAX = 18;

export interface UseOverviewLayerFocusArgs {
  snapshot: CaseSnapshot;
  askSnapshot: CaseSnapshot;
  /** Where a question asked from the Ask stands (useOverviewAsk): its steps stay while it is at work or was not
   *  answered, and hand over only to its answer. */
  askStatus?: AskStatus | null;
  bandLimitValue: number | null;
  data: {
    footprints: {
      rain?: readonly unknown[] | null;
      slope?: unknown;
    };
  } | null;
  arrival: RefObject<{ t0: number | null; done: boolean }>;
  domRefs: ReturnType<typeof useOverviewDomRefs>;
  setMoved: (v: boolean) => void;
  setLiftShown: (v: LiftId | null) => void;
  sel: Selection | null;
  setSel: Dispatch<SetStateAction<Selection | null>>;
  atWorkShown: boolean;
  atWorkRef: RefObject<boolean>;
  setAtWork: Dispatch<SetStateAction<boolean>>;
  setThinkingHidden: Dispatch<SetStateAction<boolean>>;
  /** The steps hand over to their run's answer (the address names it). */
  handOver: () => void;
  /** The answer on screen is a run's (it has steps to show), not the case's own. */
  answerIsRun: boolean;
  tearRef: RefObject<TearState | null>;
  run: RunModel | null;
  thinkingRun: RunModel | null;
  runPaused: boolean;
  setRunPaused: Dispatch<SetStateAction<boolean>>;
  pkgBrief: { id: string } | undefined;
  pkgView: ReturnType<typeof packageView>;
  lifeBundle: unknown;
  lifeOn: boolean;
  setLifeOn: Dispatch<SetStateAction<boolean>>;
  tear: TearState | null;
  askOpen: boolean;
  arriving: boolean;
  hoverShown: RefObject<boolean>;
  panel: boolean;
  setPanel: Dispatch<SetStateAction<boolean>>;
  scope: boolean;
  setScope: Dispatch<SetStateAction<boolean>>;
  onAskOpen: () => void;
  open: (id: Selection) => void;
  back: () => void;
  go: () => void;
}

/** How long a finished run's steps stay up before its answer takes over, with no input. */
const REVEAL_AFTER_MS = 4000;

export function useOverviewLayerFocus({
  snapshot,
  askSnapshot,
  askStatus = null,
  bandLimitValue,
  data,
  arrival,
  domRefs,
  setMoved,
  setLiftShown,
  sel,
  setSel,
  atWorkShown,
  atWorkRef,
  setAtWork,
  setThinkingHidden,
  handOver,
  answerIsRun,
  tearRef,
  run,
  thinkingRun,
  runPaused,
  setRunPaused,
  pkgBrief,
  pkgView,
  lifeBundle,
  lifeOn,
  setLifeOn,
  tear,
  askOpen,
  arriving,
  hoverShown,
  panel,
  setPanel,
  scope,
  setScope,
  onAskOpen,
  open,
  back,
  go,
}: UseOverviewLayerFocusArgs) {
  const {
    reducedMotion,
    camRef,
    camTargetRef,
    movedRef,
    goal,
    hov,
    idle,
    liftShownRef,
    pkgRangesRef,
    standSubs,
    timeRef,
    timeSubs,
    lifeRef,
    lifeSubs,
    lifeHot,
    hideHoverRef,
    sceneRef,
    selRef,
    nextSelRef,
    live,
  } = domRefs;

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
    [go, sceneRef, timeRef, timeSubs],
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
    [go, hideHoverRef, lifeHot, lifeRef, lifeSubs, sceneRef],
  );

  // each lit band's place on screen, every frame, for the label that sits on it
  const subscribeStands = useCallback(
    (f: (s: Stands) => void) => {
      standSubs.current.add(f);
      go();
      return () => {
        standSubs.current.delete(f);
      };
    },
    [go, standSubs],
  );

  const setCam = useCallback(
    (next: { zoom?: number; turn?: number; pitch?: number; panX?: number; panY?: number }) => {
      camTargetRef.current = null;
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
    [camRef, camTargetRef, go, movedRef, setMoved],
  );

  const toOpening = useCallback(() => {
    window.location.assign(OPENING_HREF);
  }, []);

  const reset = useCallback(() => {
    // R puts the camera back; on the answer or a view that is all it does (the answer's lit sheet stays lit)
    const s = selRef.current;
    if (s === "results" || s === "package" || s === "time") {
      setCam({ zoom: 1, turn: 0, pitch: 0, panX: 0, panY: 0 });
      return;
    }
    if (s) back();
    goal.current.r = 0;
    goal.current.h = 0;
    hov.current = null;
    idle.current.layer = null;
    idle.current.k = 0;
    liftShownRef.current = null;
    setLiftShown(null);
    pkgRangesRef.current = { ranges: [], lit: null };
    setCam({ zoom: 1, turn: 0, pitch: 0, panX: 0, panY: 0 });
  }, [back, goal, hov, idle, liftShownRef, pkgRangesRef, selRef, setCam, setLiftShown]);

  const applyLayerLift = useCallback(
    (
      layer: LiftId | null,
      routeGoal: 0 | 1,
      ranges: { lo: number; hi: number }[],
      lit: number | null,
    ) => {
      goal.current.r = routeGoal;
      liftShownRef.current = layer;
      setLiftShown(layer);
      idle.current.layer = layer;
      if (!layer) idle.current.k = 0;
      else if (idle.current.k === 0) idle.current.k = reducedMotion.current ? 1 : 0.05;
      pkgRangesRef.current = { ranges, lit };
    },
    [goal, idle, liftShownRef, pkgRangesRef, reducedMotion, setLiftShown],
  );

  // a field check's place: the record's elevation strata, bounded by the case's own band limits; any other
  // stratum has no drawn extent, so nothing is lit for it
  const focusStrata = useCallback(
    (keys: readonly string[] | null) => {
      const limits = bandLimitsOf(snapshot);
      const range = (key: string): { lo: number; hi: number } | null =>
        !limits
          ? null
          : key === "elevation_low"
            ? { lo: -1000, hi: limits[0] }
            : key === "elevation_mid"
              ? { lo: limits[0], hi: limits[1] }
              : key === "elevation_high"
                ? { lo: limits[1], hi: 9000 }
                : null;
      const ranges = (keys ?? []).map(range).filter((r) => r !== null);
      idle.current.t0 = ranges.length ? -1 : null;
      applyLayerLift(null, 0, ranges, ranges.length ? 0 : null);
      go();
    },
    [applyLayerLift, go, idle, snapshot],
  );

  // the answer on the land: the sheet its claim reads, lifted with its own caption, and the next check's place lit
  // beneath it; with neither, the land is left as it is
  const showResult = useCallback(
    (layer: LiftId | null, keys: readonly string[]) => {
      const limits = bandLimitsOf(snapshot);
      const ranges = keys
        .map((key) =>
          !limits
            ? null
            : key === "elevation_low"
              ? { lo: -1000, hi: limits[0] }
              : key === "elevation_mid"
                ? { lo: limits[0], hi: limits[1] }
                : key === "elevation_high"
                  ? { lo: limits[1], hi: 9000 }
                  : null,
        )
        .filter((r) => r !== null);
      if (!layer && !ranges.length) {
        idle.current.t0 = null;
        applyLayerLift(null, 0, [], null);
        go();
        return;
      }
      idle.current.t0 = -1;
      applyLayerLift(layer ?? "bands", 0, ranges, ranges.length ? 0 : null);
      go();
    },
    [applyLayerLift, go, idle, snapshot],
  );

  const focusLayer = useCallback(
    (lens: "bands" | "cover" | "trend" | "rain" | "routes" | null, manual = false) => {
      const lim = bandLimitValue ?? 2317;
      const applyCam = (zoom: number, turn: number) => {
        if (!arrival.current.done) return;
        if (manual) {
          const isMoved = Math.abs(zoom - 1) > 1e-3 || Math.abs(turn) > 0.1;
          movedRef.current = isMoved;
          setMoved(isMoved);
        } else if (movedRef.current) {
          return;
        }
        if (reducedMotion.current) {
          camTargetRef.current = null;
          camRef.current.zoom = zoom;
          camRef.current.turn = turn;
          camRef.current.pitch = 0;
          camRef.current.panX = 0;
          camRef.current.panY = 0;
        } else {
          camTargetRef.current = { zoom, turn, pitch: 0, panX: 0, panY: 0 };
        }
      };
      if (!lens) {
        idle.current.t0 = null;
        applyLayerLift(null, 0, [], null);
        applyCam(1, 0);
        go();
        return;
      }
      idle.current.t0 = -1;
      if (lens === "bands") {
        applyLayerLift(
          "bands",
          0,
          [
            { lo: 1800, hi: lim },
            { lo: lim, hi: 3200 },
          ],
          0,
        );
        applyCam(1.06, -8);
      } else if (lens === "rain") {
        applyLayerLift(
          data?.footprints.rain?.length ? "rain" : "bands",
          0,
          [{ lo: lim, hi: 3200 }],
          0,
        );
        applyCam(1.04, 8);
      } else if (lens === "trend") {
        if (data?.footprints.slope) {
          applyLayerLift("trend", 0, [{ lo: 1800, hi: lim }], 0);
        } else {
          goal.current.r = 0;
          pkgRangesRef.current = { ranges: [{ lo: 1800, hi: lim }], lit: 0 };
        }
        applyCam(1.08, 10);
      } else if (lens === "cover") {
        applyLayerLift("cover", 0, [{ lo: 1800, hi: lim }], 0);
        applyCam(1.06, -6);
      } else {
        applyLayerLift("bands", 1, [{ lo: lim, hi: 3200 }], 0);
        applyCam(1.08, -12);
      }
      go();
    },
    [
      applyLayerLift,
      arrival,
      bandLimitValue,
      camRef,
      camTargetRef,
      data,
      go,
      goal,
      idle,
      movedRef,
      pkgRangesRef,
      reducedMotion,
      setMoved,
    ],
  );

  const focusTaskLayer = useCallback(
    (task: StepTask | null) => {
      if (!task) {
        focusLayer(null, false);
        return;
      }
      // the sheet the step's own line names, the one its cursor points at too (AtWorkCursors, sheetOfTask); the land
      // lifts no snow sheet, so a step about snow leaves every sheet lit
      const sheet = sheetOfTask(task, (s) =>
        s === "rain"
          ? (data?.footprints.rain?.length ?? 0) > 0
          : s === "trend"
            ? Boolean(data?.footprints.slope)
            : true,
      );
      focusLayer(sheet === "snow" ? null : sheet, false);
    },
    [data, focusLayer],
  );

  const pkgHref =
    sel === "package" && (pkgBrief || pkgView)
      ? `/brief?case=${encodeURIComponent(askSnapshot.case.id)}&brief=${encodeURIComponent(pkgBrief?.id ?? pkgView?.briefId ?? "")}`
      : null;

  // the steps hand over to the answer: a run's steps to that run's answer, which the address then names
  const seeFindings = useCallback(() => {
    if (atWorkRef.current) handOver();
    focusTaskLayer(null);
    setThinkingHidden(true);
    setAtWork(false);
    open("results");
  }, [atWorkRef, focusTaskLayer, handOver, open, setAtWork, setThinkingHidden]);

  // the steps take the screen from the answer at once, the land with them, or nothing happens: never the answer left
  // up under steps that are not drawn. Read from the refs, so a key pressed as the answer opens sees what is open.
  const showSteps = useCallback(() => {
    const s = selRef.current;
    if (tearRef.current || nextSelRef.current || (s && s !== "results")) return;
    focusTaskLayer(null);
    if (s) {
      selRef.current = null;
      setSel(null);
      live.current.s = 0;
      goal.current.s = 0;
    }
    setThinkingHidden(false);
    setAtWork(true);
    go();
  }, [
    focusTaskLayer,
    go,
    goal,
    live,
    nextSelRef,
    selRef,
    setAtWork,
    setSel,
    setThinkingHidden,
    tearRef,
  ]);

  // the analysis steps and their own answer swap places: T shows the steps of the run the answer is from (the case's own
  // answer has none: a recorded run asked another question), and T again goes back; steps opened by T stay until then
  const answerIsRunRef = useRef(answerIsRun);
  answerIsRunRef.current = answerIsRun;
  const manualSteps = useRef(false);
  const toggleThinking = useCallback(() => {
    if (!atWorkRef.current) {
      if (!answerIsRunRef.current) return;
      manualSteps.current = true;
      showSteps();
    } else if (!run || run.done) seeFindings();
  }, [atWorkRef, run, seeFindings, showSteps]);

  // a question asked from the Ask that is still at work, or was not answered, holds its steps: they never hand over by
  // themselves, and neither T nor Enter hands its command over to the answer (Esc and Ask Again are its ways on)
  const askHolds = askStatus !== null && askStatus.state !== "answered";

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
      const inReadout = selRef.current === "results" || selRef.current === "package";
      if (
        (e.key === "t" || e.key === "T") &&
        thinkingRun?.done &&
        !askHolds &&
        (!selRef.current || inReadout)
      ) {
        e.preventDefault();
        toggleThinking();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [askHolds, selRef, thinkingRun?.done, toggleThinking]);

  const keys: KeyEntry[] = [
    ...(!sel && (!atWorkShown || run?.done) && !askHolds
      ? [
          {
            chip: "↵",
            shortcut: "Enter",
            label: en["run.open"].text,
            onPress: seeFindings,
            ...(atWorkShown ? { marker: "data-run-open-findings" } : {}),
          },
        ]
      : []),
    ...(atWorkShown && run && !run.done && !sel
      ? [
          {
            chip: "P",
            shortcut: "P",
            label: en[runPaused ? "run.tree.resume" : "run.tree.pause"].text,
            onPress: () => {
              setRunPaused((p) => !p);
            },
            pressed: runPaused,
          },
        ]
      : []),
    ...(thinkingRun?.done &&
    !askHolds &&
    ((!sel && atWorkShown) || ((sel === "results" || sel === "package") && answerIsRun))
      ? [
          {
            chip: "T",
            shortcut: "T",
            label: en["chrome.key.thinking"].text,
            onPress: toggleThinking,
            pressed: atWorkShown,
          },
        ]
      : []),
    ...(pkgHref
      ? [
          {
            chip: "E",
            shortcut: "E",
            label: pkg["package.export"].text,
            onPress: () => window.open(pkgHref, "_blank", "noopener"),
          },
        ]
      : []),
    ...(Boolean(lifeBundle) && (!sel || sel === "time") && !tear && !atWorkShown
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
    { chip: "/", shortcut: "/", label: en["chrome.key.ask"].text, onPress: onAskOpen },
    ...(!atWorkShown && data
      ? [{ chip: "R", shortcut: "R", label: en["chrome.key.reset"].text, onPress: reset }]
      : []),
    {
      chip: "S",
      shortcut: "S",
      label: en["chrome.key.sources"].text,
      onPress: () => {
        setPanel((p) => !p);
      },
      pressed: panel,
    },
    {
      chip: "W",
      shortcut: "W",
      label: en["chrome.key.scope"].text,
      onPress: () => {
        setScope((s) => !s);
      },
      pressed: scope,
    },
    {
      chip: "Esc",
      shortcut: "Escape",
      label: en["chrome.key.back"].text,
      onPress: () => {
        // the answer is the overview's home: Back from it leaves the place; a view, or one opening, comes back to it
        const s = selRef.current;
        if ((s === "results" || s === "package") && !nextSelRef.current) toOpening();
        else if (s) back();
        else toOpening();
      },
    },
  ];

  // a finished run hands over to its answer by itself, once, a few seconds after it completes; any input restarts the
  // wait, so a visitor reading the steps is not pulled away, and after the hand-over T moves between steps and answer
  // (steps T opened are the visitor's: they stay until T, Enter or Esc, and never hand over by themselves). The wait is
  // the finished command's: a case record read again (a reconnecting stream sends its events again) is not input.
  const revealedFor = useRef<string | null>(null);
  const finished = thinkingRun?.done ? thinkingRun.commandId : null;
  useEffect(() => {
    if (!atWorkShown) manualSteps.current = false;
    if (finished === null || !atWorkShown || sel || revealedFor.current === finished) return;
    if (manualSteps.current || askHolds) return;
    const fire = () => {
      revealedFor.current = finished;
      seeFindings();
    };
    let timer = window.setTimeout(fire, REVEAL_AFTER_MS);
    // a visitor reading the steps, the pointer moving over them included, is not pulled away
    const busy = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fire, REVEAL_AFTER_MS);
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel"] as const;
    for (const ev of events) window.addEventListener(ev, busy, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const ev of events) window.removeEventListener(ev, busy);
    };
  }, [askHolds, atWorkShown, finished, seeFindings, sel]);

  const keysRef = useRef({ seeFindings, atWorkShown });
  keysRef.current = { seeFindings, atWorkShown };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || askOpen || arriving || tear) return;
      const t = ev.target;
      if (t instanceof HTMLElement && t.closest("input, textarea, select, [contenteditable]"))
        return;
      // Enter on a focused control belongs to that control; W works from anywhere, as S does
      const onControl = t instanceof HTMLElement && t.closest("a, button") !== null;
      if (ev.key === "w" || ev.key === "W") {
        ev.preventDefault();
        setScope((s) => !s);
      } else if (
        ev.key === "Enter" &&
        !onControl &&
        !selRef.current &&
        !keysRef.current.atWorkShown &&
        !hoverShown.current
      ) {
        ev.preventDefault();
        keysRef.current.seeFindings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [askOpen, arriving, hoverShown, selRef, setScope, tear]);

  return {
    timeMount,
    lifeMount,
    setCam,
    toOpening,
    reset,
    focusStrata,
    showResult,
    subscribeStands,
    focusLayer,
    focusTaskLayer,
    keys,
    seeFindings,
    showSteps,
  };
}
