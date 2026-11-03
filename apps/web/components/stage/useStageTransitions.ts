import type * as maplibregl from "maplibre-gl";
import { useEffect, type RefObject } from "react";
import { DEPARTURE_FADE_MS } from "../../lib/map/departure";
import { viewerSession } from "../../lib/shell/preferences";
import { ARRIVAL_EXAGGERATION } from "../../lib/stage/arrival";
import { arrivalSettledAfter, arrivalTiming } from "../../lib/stage/arrival-sequence";
import type { MapCamera } from "../../lib/stage/camera";
import {
  addDepartureLayers,
  hatchTile,
  removeDepartureLayers,
  setDepartureOpacity,
  type DepartureMapLayer,
} from "../../lib/stage/departure-layers";
import { easeInOut, FLAT_MOVE_MS, mixCamera } from "../../lib/stage/flat";
import type { Feature } from "../../lib/stage/geo";
import { SETTLE_MS, settleCameraAt } from "../../lib/stage/settle";
import { daylight } from "../../lib/theme/daylight";
import {
  showDrapedLine,
  stepFlatCamera,
  syncInteractive,
  type SettleState,
  type StageViewMode,
} from "./stage-map-controller";

export function useDepartureLayerEffect(params: {
  mapRef: RefObject<maplibregl.Map | null>;
  idle: boolean;
  departure: DepartureMapLayer | undefined;
  onDepartureRef: RefObject<((shown: boolean) => void) | undefined>;
}): void {
  const { mapRef, idle, departure, onDepartureRef } = params;
  // The departure raster and hatch fade in together once the picture has loaded (160 ms, frame by frame);
  // under reduced motion they appear at once.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !idle || !departure) return;
    let live = true;
    let raf = 0;
    const picture = new Image();
    picture.src = departure.imageUri;
    picture
      .decode()
      .then(() => {
        if (!live) return;
        const ratio = Math.max(1, Math.round(window.devicePixelRatio));
        addDepartureLayers(
          m,
          departure,
          hatchTile(daylight.excludedHatch, daylight.outlineCasing, ratio),
          daylight.excludedHatchEdge,
        );
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const t0 = performance.now();
        const step = () => {
          const k = reduced ? 1 : Math.min(1, (performance.now() - t0) / DEPARTURE_FADE_MS);
          setDepartureOpacity(m, k);
          if (k < 1) raf = requestAnimationFrame(step);
        };
        step();
        onDepartureRef.current?.(true);
      })
      .catch((e: unknown) => {
        console.error("Stage: the departure raster could not load", e);
        if (live) onDepartureRef.current?.(false);
      });
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      if (!m._removed) removeDepartureLayers(m);
      onDepartureRef.current?.(false);
    };
  }, [mapRef, idle, departure, onDepartureRef]);
}

export function useFlatAndResetFlightEffect(params: {
  containerRef: RefObject<HTMLDivElement | null>;
  mapRef: RefObject<maplibregl.Map | null>;
  homeRef: RefObject<MapCamera | null>;
  nowRef: RefObject<MapCamera | null>;
  reliefRef: RefObject<number>;
  flatAppliedRef: RefObject<boolean>;
  resetAppliedRef: RefObject<number>;
  flightActiveRef: RefObject<boolean>;
  unlockedRef: RefObject<boolean>;
  boundsRef: RefObject<[number, number, number, number]>;
  labelsRef: RefObject<boolean>;
  onMovedRef: RefObject<((moved: boolean) => void) | undefined>;
  onBearingRef: RefObject<((bearingDeg: number) => void) | undefined>;
  flat: boolean;
  resetSeq: number;
  arrived: boolean;
  settled: boolean;
  catchment: Feature;
  setView: (view: StageViewMode) => void;
  setMoved: (moved: boolean) => void;
  setInteractive: (interactive: boolean) => void;
}): void {
  const {
    containerRef,
    mapRef,
    homeRef,
    nowRef,
    reliefRef,
    flatAppliedRef,
    resetAppliedRef,
    flightActiveRef,
    unlockedRef,
    boundsRef,
    labelsRef,
    onMovedRef,
    onBearingRef,
    flat,
    resetSeq,
    arrived,
    settled,
    catchment,
    setView,
    setMoved,
    setInteractive,
  } = params;

  // F or Home/H: one camera move to the top-down view (relief easing to flat, terrain off at the end) or back
  // to the active step's pose. Under reduced motion the camera cuts. Any user pointer/wheel/touch input
  // during the move yields immediately.
  useEffect(() => {
    const m = mapRef.current;
    const home = homeRef.current;
    const flatChanged = flat !== flatAppliedRef.current;
    const resetChanged = resetSeq !== resetAppliedRef.current;
    if (!m || !home || !arrived || (!flatChanged && !resetChanged)) return;
    flatAppliedRef.current = flat;
    resetAppliedRef.current = resetSeq;
    const to = flat ? stepFlatCamera(m, catchment, home) : home;
    const from = nowRef.current ?? home;
    const reliefFrom = reliefRef.current;
    const reliefTo = flat ? 0 : ARRIVAL_EXAGGERATION;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 0 : FLAT_MOVE_MS;
    flightActiveRef.current = true;
    if (flatChanged) setView(flat ? "toFlat" : "toOblique");
    showDrapedLine(m, true);
    if (!flat) m.setTerrain({ source: "terrain", exaggeration: Math.max(reliefFrom, 0.001) });
    const t0 = performance.now();
    let raf = 0;
    const el = containerRef.current;
    const gestures = ["pointerdown", "wheel", "touchstart"] as const;
    const cleanupGestures = () => {
      if (!el) return;
      for (const g of gestures) el.removeEventListener(g, onUserInterrupt, true);
    };
    function onUserInterrupt() {
      if (!flightActiveRef.current || !m || !home) return;
      cancelAnimationFrame(raf);
      cleanupGestures();
      flightActiveRef.current = false;
      if (flat) {
        m.setTerrain(null);
        setView("flat");
      } else {
        m.setTerrain({ source: "terrain", exaggeration: ARRIVAL_EXAGGERATION });
        reliefRef.current = ARRIVAL_EXAGGERATION;
        showDrapedLine(m, false);
        setView("oblique");
      }
      if (labelsRef.current) {
        unlockedRef.current = true;
        setInteractive(true);
        syncInteractive(m, true, flat, boundsRef.current);
      }
    }
    if (el && duration > 0) {
      for (const g of gestures)
        el.addEventListener(g, onUserInterrupt, { capture: true, passive: true });
    }
    const step = () => {
      const k = duration === 0 ? 1 : Math.min(1, (performance.now() - t0) / duration);
      const e = easeInOut(k);
      const c = mixCamera(from, to, e);
      const relief = reliefFrom + (reliefTo - reliefFrom) * e;
      m.jumpTo({
        center: c.center,
        zoom: c.zoom,
        pitch: c.pitch,
        bearing: c.bearing,
        elevation: c.elevation,
      });
      if (m.getTerrain())
        m.setTerrain({ source: "terrain", exaggeration: Math.max(relief, 0.001) });
      nowRef.current = c;
      reliefRef.current = relief;
      onBearingRef.current?.(c.bearing);
      if (k < 1) {
        raf = requestAnimationFrame(step);
        return;
      }
      cleanupGestures();
      flightActiveRef.current = false;
      if (flat) {
        m.setTerrain(null);
        setView("flat");
      } else {
        showDrapedLine(m, false);
        setView("oblique");
      }
      setMoved(false);
      onMovedRef.current?.(false);
      if (settled && labelsRef.current) {
        unlockedRef.current = true;
        setInteractive(true);
        syncInteractive(m, true, flat, boundsRef.current);
      }
    };
    if (duration === 0) step();
    else raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      cleanupGestures();
      flightActiveRef.current = false;
    };
  }, [
    containerRef,
    mapRef,
    homeRef,
    nowRef,
    reliefRef,
    flatAppliedRef,
    resetAppliedRef,
    flightActiveRef,
    unlockedRef,
    boundsRef,
    labelsRef,
    onMovedRef,
    onBearingRef,
    flat,
    resetSeq,
    arrived,
    settled,
    catchment,
    setView,
    setMoved,
    setInteractive,
  ]);
}

export function useRegionalSettleEffect(params: {
  mapRef: RefObject<maplibregl.Map | null>;
  homeRef: RefObject<MapCamera | null>;
  settleRef: RefObject<SettleState>;
  settleRaf: RefObject<number>;
  stopSettle: RefObject<() => void>;
  unlockedRef: RefObject<boolean>;
  labelsRef: RefObject<boolean>;
  viewRef: RefObject<StageViewMode>;
  boundsRef: RefObject<[number, number, number, number]>;
  settle: SettleState;
  idle: boolean;
  settleKey: string | undefined;
  setSettle: (state: SettleState) => void;
  setQuick: (quick: boolean) => void;
  setSettled: (settled: boolean) => void;
  setInteractive: (interactive: boolean) => void;
}): void {
  const {
    mapRef,
    homeRef,
    settleRef,
    settleRaf,
    stopSettle,
    unlockedRef,
    labelsRef,
    viewRef,
    boundsRef,
    settle,
    idle,
    settleKey,
    setSettle,
    setQuick,
    setSettled,
    setInteractive,
  } = params;

  // Once the regional view's tiles are idle, animate the camera to the valley view; arrival begins when it ends.
  // Any user input during the move completes it immediately.
  useEffect(() => {
    const m = mapRef.current;
    const home = homeRef.current;
    if (settleRef.current !== "waiting" || !idle || !m || !home) return;
    settleRef.current = "moving";
    setSettle("moving");
    const jump = (c: MapCamera) => {
      m.jumpTo({
        center: c.center,
        zoom: c.zoom,
        pitch: c.pitch,
        bearing: c.bearing,
        elevation: c.elevation,
      });
    };
    const inputs = ["keydown", "pointerdown", "wheel", "touchstart"] as const;
    const finish = (interrupted: boolean) => {
      stopSettle.current();
      if (interrupted) jump(home);
      if (settleKey) {
        try {
          viewerSession()?.setItem(settleKey, "1");
        } catch {
          // The settle runs again on reload if session storage is unavailable.
        }
      }
      settleRef.current = "done";
      if (interrupted) {
        setQuick(true);
        setSettled(true);
        if (labelsRef.current) {
          unlockedRef.current = true;
          setInteractive(true);
          syncInteractive(m, true, viewRef.current === "flat", boundsRef.current);
        }
      }
      setSettle("done");
    };
    function onInput() {
      if (settleRef.current === "moving") finish(true);
    }
    for (const t of inputs) window.addEventListener(t, onInput, { capture: true, passive: true });
    stopSettle.current = () => {
      cancelAnimationFrame(settleRaf.current);
      for (const t of inputs) window.removeEventListener(t, onInput, true);
    };
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / SETTLE_MS);
      jump(settleCameraAt(home, k));
      if (k < 1) {
        settleRaf.current = requestAnimationFrame(step);
        return;
      }
      finish(false);
    };
    settleRaf.current = requestAnimationFrame(step);
  }, [
    mapRef,
    homeRef,
    settleRef,
    settleRaf,
    stopSettle,
    unlockedRef,
    labelsRef,
    viewRef,
    boundsRef,
    settle,
    idle,
    settleKey,
    setSettle,
    setQuick,
    setSettled,
    setInteractive,
  ]);

  useEffect(
    () => () => {
      stopSettle.current();
    },
    [stopSettle],
  );
}

export function useArrivalFadesEffect(params: {
  mapRef: RefObject<maplibregl.Map | null>;
  arrived: boolean;
  quick: boolean;
  setSettled: (settled: boolean) => void;
}): void {
  const { mapRef, arrived, quick, setSettled } = params;

  // Warm the light pool and fade in the outlet beam frame by frame, then mark the stage settled.
  useEffect(() => {
    const m = mapRef.current;
    if (!arrived || !m) return;
    const reduced = quick || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fades = [
      {
        layer: "light-pool",
        prop: "fill-opacity" as const,
        to: 1,
        t: arrivalTiming("pool", reduced),
      },
      {
        layer: "outlet-beam",
        prop: "fill-extrusion-opacity" as const,
        to: 0.9,
        t: arrivalTiming("outlet", reduced),
      },
    ];
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const now = performance.now() - t0;
      let running = false;
      for (const f of fades) {
        const k =
          f.t.durationMs <= 0 ? 1 : Math.min(1, Math.max(0, (now - f.t.delayMs) / f.t.durationMs));
        if (k < 1) running = true;
        m.setPaintProperty(f.layer, f.prop, f.to * k);
      }
      if (running) raf = requestAnimationFrame(step);
    };
    if (reduced) {
      step();
      setSettled(true);
      return;
    }
    raf = requestAnimationFrame(step);
    const timer = window.setTimeout(
      () => {
        setSettled(true);
      },
      arrivalSettledAfter(reduced) * 1000 + 100,
    );
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [mapRef, arrived, quick, setSettled]);
}
