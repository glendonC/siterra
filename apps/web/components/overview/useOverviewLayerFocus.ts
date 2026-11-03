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
import type { LiftId, Selection } from "../../lib/overview/scene/overview";
import type { packageView } from "../../lib/package/package";
import type { RunModel } from "../../lib/run/model";
import { OPENING_HREF, type KeyEntry } from "../controls/ScreenChrome";
import type { LifeMount } from "../life/LifeLayer";
import type { LandMount } from "../package/PackageBriefing";
import type { TimeMount } from "../time/TimeView";
import type { useOverviewDomRefs } from "./useOverviewRunState";
import type { TearState } from "./useOverviewTearInPlace";

/** Camera bounds: zoom factor, 360° bearing turn, vertical pitch tilt, and horizontal pan. */
const ZOOM = { min: 0.28, max: 2.2 } as const;
const PITCH = { min: -22, max: 48 } as const;
const PAN_MAX = 18;

export interface UseOverviewLayerFocusArgs {
  snapshot: CaseSnapshot;
  askSnapshot: CaseSnapshot;
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
  atWorkShown: boolean;
  setAtWork: Dispatch<SetStateAction<boolean>>;
  setThinkingHidden: Dispatch<SetStateAction<boolean>>;
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

export function useOverviewLayerFocus({
  snapshot,
  askSnapshot,
  bandLimitValue,
  data,
  arrival,
  domRefs,
  setMoved,
  setLiftShown,
  sel,
  atWorkShown,
  setAtWork,
  setThinkingHidden,
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
    pkgAsideRef,
    timeRef,
    timeSubs,
    lifeRef,
    lifeSubs,
    lifeHot,
    standSubs,
    hideHoverRef,
    sceneRef,
    selRef,
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
    [snapshot, go, pkgAsideRef, pkgRangesRef, standSubs],
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

  const focusCauseFromLedger = useCallback(
    (explanationId: string) => {
      const lim = bandLimitValue ?? 2317;
      idle.current.t0 = -1;
      const smoothCam = (zoom: number, turn: number) => {
        if (reducedMotion.current) {
          camTargetRef.current = null;
          camRef.current.zoom = zoom;
          camRef.current.turn = turn;
        } else {
          camTargetRef.current = {
            zoom,
            turn,
            pitch: camRef.current.pitch,
            panX: camRef.current.panX,
            panY: camRef.current.panY,
          };
        }
      };
      if (explanationId === "rainfall") {
        applyLayerLift(data?.footprints.rain?.length ? "rain" : null, 0, [], null);
        smoothCam(1.08, 14);
        go();
      } else if (explanationId === "grazing") {
        applyLayerLift("bands", 1, [{ lo: lim, hi: 3200 }], 0);
        smoothCam(1.18, -26);
        go();
      } else if (explanationId === "land_use") {
        applyLayerLift("cover", 0, [{ lo: 1800, hi: lim }], 0);
        smoothCam(1.22, -16);
        go();
      } else if (explanationId === "snow_terrain") {
        applyLayerLift("bands", 0, [{ lo: lim, hi: 3200 }], 0);
        smoothCam(1.14, -20);
        go();
      } else if (explanationId === "data_artefact") {
        applyLayerLift(data?.footprints.slope ? "trend" : null, 1, [], null);
        smoothCam(1.32, 22);
        go();
      }
    },
    [applyLayerLift, bandLimitValue, camRef, camTargetRef, data, go, idle, reducedMotion],
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
    (task: { kind: string; sublabel?: string | null } | null) => {
      if (!task) {
        focusLayer(null, false);
        return;
      }
      const sub = (task.sublabel ?? "").toLowerCase();
      if (task.kind === "plan") {
        focusLayer("bands", false);
      } else if (
        sub.includes("vegetation") ||
        sub.includes("ndvi") ||
        sub.includes("trend") ||
        sub.includes("valley floor")
      ) {
        focusLayer("trend", false);
      } else if (sub.includes("rain") || sub.includes("terrain") || sub.includes("catchment")) {
        focusLayer("rain", false);
      } else if (task.kind === "source_research" || task.kind === "source_reading") {
        focusLayer("cover", false);
      } else if (task.kind === "livelihood_governance") {
        focusLayer("routes", false);
      } else if (
        task.kind === "explanation_branches" ||
        task.kind === "field_check" ||
        task.kind === "instrument_composition"
      ) {
        focusLayer("bands", false);
      }
    },
    [focusLayer],
  );

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
      if ((e.key === "t" || e.key === "T") && thinkingRun?.done && !selRef.current) {
        e.preventDefault();
        focusTaskLayer(null);
        setThinkingHidden(atWorkShown);
        setAtWork(!atWorkShown);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [atWorkShown, focusTaskLayer, selRef, setAtWork, setThinkingHidden, thinkingRun?.done]);

  const pkgHref =
    sel === "package" && (pkgBrief || pkgView)
      ? `/brief?case=${encodeURIComponent(askSnapshot.case.id)}&brief=${encodeURIComponent(pkgBrief?.id ?? pkgView?.briefId ?? "")}`
      : null;

  const seeFindings = useCallback(() => {
    focusTaskLayer(null);
    setThinkingHidden(true);
    setAtWork(false);
    open("results");
  }, [focusTaskLayer, open, setAtWork, setThinkingHidden]);

  const toggleThinking = useCallback(() => {
    if (atWorkShown && run && !run.done) return;
    focusTaskLayer(null);
    setThinkingHidden(atWorkShown);
    setAtWork(!atWorkShown);
  }, [atWorkShown, focusTaskLayer, run, setAtWork, setThinkingHidden]);

  const keys: KeyEntry[] = [
    ...(!sel && (!atWorkShown || run?.done)
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
            label: runPaused ? "Resume" : "Pause",
            onPress: () => { setRunPaused((p) => !p); },
            pressed: runPaused,
          },
        ]
      : []),
    ...(thinkingRun?.done && !sel
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
            onPress: () => { setLifeOn((v) => !v); },
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
      onPress: () => { setPanel((p) => !p); },
      pressed: panel,
    },
    {
      chip: "W",
      shortcut: "W",
      label: en["chrome.key.scope"].text,
      onPress: () => { setScope((s) => !s); },
      pressed: scope,
    },
    {
      chip: "Esc",
      shortcut: "Escape",
      label: en["chrome.key.back"].text,
      onPress: () => {
        if (selRef.current) back();
        else toOpening();
      },
    },
  ];

  const keysRef = useRef({ seeFindings, atWorkShown });
  keysRef.current = { seeFindings, atWorkShown };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || askOpen || arriving || tear) return;
      const t = ev.target;
      if (
        t instanceof HTMLElement &&
        t.closest("input, textarea, select, a, button, [contenteditable]")
      )
        return;
      if (ev.key === "w" || ev.key === "W") {
        ev.preventDefault();
        setScope((s) => !s);
      } else if (
        ev.key === "Enter" &&
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
    pkgLand,
    setCam,
    toOpening,
    reset,
    focusCauseFromLedger,
    focusLayer,
    focusTaskLayer,
    keys,
  };
}
