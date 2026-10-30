"use client";

// The full-bleed valley stage in daylight: the MapLibre map with the arrival camera, names lying on a plane
// just above the land in perspective, and the stems drawn over the map. Everything the land shows is also listed for screen readers.

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { BudgetLine } from "../../lib/budget/measure";
import { en, format, isHonesty, type MessageId } from "../../lib/copy/en";
import type { LandPoint } from "../../lib/projection/places";
import { ARRIVAL_EXAGGERATION, ARRIVAL_POSE, VALLEY_NAME_REFERENCE } from "../../lib/stage/arrival";
import type { MapBundle } from "../../lib/map/bundle";
import {
  cameraMoved,
  clampBearing,
  clampCenter,
  clampPitch,
  clampZoom,
  expandBounds,
  maxZoomForDistance,
  MIN_VALLEY_ZOOM,
  normalizeBearing,
  OBLIQUE_MAX_PITCH,
  OBLIQUE_MIN_PITCH,
  orbitToMapCamera,
  VALLEY_ASSET_BOUNDS,
  widthFitScale,
  type MapCamera,
} from "../../lib/stage/camera";
import { easeInOut, FLAT_MOVE_MS, flatCamera, mixCamera } from "../../lib/stage/flat";
import { FlatFrame } from "./FlatFrame";
import { regionalCamera, SETTLE_MS, settleCameraAt } from "../../lib/stage/settle";
import { viewerSession } from "../../lib/shell/preferences";
import { valleyStyle } from "../../lib/stage/daylight-style";
import { groundCorners, screenReadingBearing, type LabelLine } from "../../lib/stage/ground-label";
import { northEdgeAnchor, valleyNameAnchor } from "../../lib/stage/placement";
import type { Feature, Position } from "../../lib/stage/geo";
import { smoothFeature } from "../../lib/stage/smooth";
import { drawHaze, hazeCorners } from "../../lib/stage/haze";
import { projectAt, quadMatrix3d } from "../../lib/stage/project";
import {
  arrivalSettledAfter,
  arrivalTiming,
  type ArrivalPart,
} from "../../lib/stage/arrival-sequence";
import { daylight } from "../../lib/theme/daylight";
import { DEPARTURE_FADE_MS } from "../../lib/map/departure";
import {
  addDepartureLayers,
  hatchTile,
  removeDepartureLayers,
  setDepartureOpacity,
  type DepartureMapLayer,
} from "../../lib/stage/departure-layers";
import styles from "./ValleyStage.module.css";

// MapLibre 6 is ESM-only; under Next.js and Turbopack its worker must be named by URL (MapLibre install docs,
// research/technology/stack-versions.md). Only in the browser: the module is also evaluated for server rendering.
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl(
    new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
  );
}

/**
 * Contour tiles from the terrain tiles, made in the browser by maplibre-contour (one shared DEM source per
 * terrain template, registered with MapLibre once). 100 m lines, every fifth (500 m) as an index line.
 */
const contourSources = new Map<string, string>();

async function contourTiles(terrainTiles: string, maxzoom: number): Promise<string> {
  const known = contourSources.get(terrainTiles);
  if (known) return known;
  const { default: mlcontour } = await import("maplibre-contour");
  const dem = new mlcontour.DemSource({
    url: terrainTiles,
    encoding: "terrarium",
    maxzoom,
    worker: true,
  });
  dem.setupMaplibre(maplibregl);
  const url = dem.contourProtocolUrl({
    thresholds: { 8: [100, 500] },
    levelKey: "level",
    elevationKey: "ele",
    contourLayer: "contours",
    // 512 px terrain tiles: build each contour tile from one quadrant of the tile a zoom above
    overzoom: 1,
  });
  contourSources.set(terrainTiles, url);
  return url;
}

/** Interface sans for names on the ground; must match the family the app loads. */
const LABEL_FAMILY = '"IBM Plex Sans Variable", "IBM Plex Sans", sans-serif';

interface Stem {
  id: string;
  name: string;
  x: number;
  y: number;
}

interface GroundText {
  id: string;
  lines: LabelLine[];
  budget: BudgetLine[];
  /** CSS transform that lays the text box on its plane above the land. */
  transform: string;
}

/** The outline at arrival rides this far above the land: 30 m on the crest, at the view's 2x relief. */
const OUTLINE_LIFT_M = 60;

function outerRing(f: Feature): Position[] | undefined {
  const g = f.geometry;
  return g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0]?.[0];
}

/** The style's draped outline, shown in the dive and hidden while the crisp outline is drawn. */
function showDrapedLine(m: maplibregl.Map | null, show: boolean): void {
  if (!m?.isStyleLoaded()) return;
  const want = show ? "visible" : "none";
  for (const id of ["catchment-casing", "catchment-line"])
    if (m.getLayer(id) && m.getLayoutProperty(id, "visibility") !== want)
      m.setLayoutProperty(id, "visibility", want);
}

function stepFlatCamera(m: maplibregl.Map, catchment: Feature, home: MapCamera): MapCamera {
  const canvas = m.getCanvas();
  const ring = outerRing(catchment) ?? [];
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return {
    ...flatCamera(
      [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
      canvas.clientWidth,
      canvas.clientHeight,
      120,
    ),
    verticalFovDeg: home.verticalFovDeg,
  };
}

function syncInteractive(
  m: maplibregl.Map,
  unlocked: boolean,
  flatMode: boolean,
  bounds: [number, number, number, number],
): void {
  if (!unlocked) {
    m.setMinPitch(0);
    m.setMaxPitch(85);
    m.setMinZoom(0);
    m.setMaxZoom(22);
    m.setMaxBounds(null);
    m.dragPan.disable();
    m.dragRotate.disable();
    m.scrollZoom.disable();
    m.doubleClickZoom.disable();
    m.touchZoomRotate.disable();
    m.touchPitch.disable();
    return;
  }
  const maxZoom = maxZoomForDistance(ARRIVAL_POSE, m.getCanvas().clientHeight || 810);
  m.setMinZoom(MIN_VALLEY_ZOOM);
  m.setMaxZoom(maxZoom);
  m.setMinPitch(flatMode ? 0 : OBLIQUE_MIN_PITCH);
  m.setMaxPitch(flatMode ? 0 : OBLIQUE_MAX_PITCH);
  m.setMaxBounds(expandBounds(bounds));
  m.dragPan.enable();
  m.scrollZoom.enable();
  m.doubleClickZoom.enable();
  m.touchZoomRotate.enable();
  if (flatMode) {
    m.dragRotate.disable();
    m.touchPitch.disable();
    m.touchZoomRotate.disableRotation();
  } else {
    m.dragRotate.enable();
    m.touchPitch.enable();
    m.touchZoomRotate.enableRotation();
  }
}

/** The text box the transform maps onto the land: CSS px, wide enough for the hero's ground names. */
const BOX_W = 1000;
const LINE_H = 83;
/** The plane the names lie on: this far above the land at the name's anchor, as in the hero (0.6 km). */
const PLANE_LIFT_M = 600;

export interface ValleyStageProps {
  /** The valley's assets from the map bundle, or null when the bundle could not be read. */
  assets: MapBundle["valley"] | null;
  /** Where the bundle's terrain lets contour lines be made; none without it. */
  contourArea?: MapBundle["contours"];
  /** The analysis geometry from the case record (GeoSelection, its current revision). */
  catchment: Feature;
  /** Study valley name from the case record. */
  valleyName: string;
  /** Mountain region and country from the case record. */
  regionName: string;
  /** Its area in km² to one decimal, from the record. */
  areaKm2: string;
  /** Villages on stems, from the case's ContextFeature records. */
  places: LandPoint[];
  /** The outlet from its ContextFeature record; no beam and no outlet stem without one. */
  outlet: LandPoint | undefined;
  /** Called once the map has drawn the arrival frame with every tile loaded. */
  onIdle?: () => void;
  /** Called once the map has loaded, so the dive can drive its camera and relief frame by frame. */
  onMap?: (map: maplibregl.Map) => void;
  /** False while the dive comes down: the land only; names and stems land at arrival. */
  labels?: boolean;
  /** Called when arrival begins, so the chrome can land on the same clock. */
  onArrive?: (quick: boolean) => void;
  /** False in the work beat: the outline stays, the names and stems leave the land. */
  names?: boolean;
  /** The projected outline in CSS px, for a leader that ends on the line; empty in the flat reading. */
  onOutline?: (points: { x: number; y: number }[]) => void;
  /** The flat reading (MOT-12): top-down, north up, terrain off, with graticule ticks and a scale bar. */
  flat?: boolean;
  /** Called when the map cannot be drawn, so the text listing can take its place. */
  onFailed?: () => void;
  /**
   * MOT-01: a key for this case's arrival settle (the regional view moving once to the valley view).
   * None in the hero sequence, where the dive is the arrival. Kept per tab, so a reload skips it.
   */
  settleKey?: string;
  /** The Observations step's departure raster and cropland hatch; none draws nothing. */
  departure?: DepartureMapLayer;
  /** True once the departure layer is drawn, false when it is taken off or could not load. */
  onDeparture?: (shown: boolean) => void;
  /** Incremented when the viewer presses Home / H or Reset View to return to the active step's pose. */
  resetSeq?: number;
  /** Called when the viewer moves the camera away from or back to the active step's pose. */
  onMoved?: (moved: boolean) => void;
  /** Called when the map's compass bearing changes so the North instrument stays accurate. */
  onBearing?: (bearingDeg: number) => void;
}

export function ValleyStage({
  assets,
  contourArea,
  catchment,
  valleyName,
  regionName,
  areaKm2,
  places,
  outlet,
  onIdle,
  onMap,
  onArrive,
  onOutline,
  labels = true,
  names = true,
  flat = false,
  onFailed,
  settleKey,
  departure,
  onDeparture,
  resetSeq = 0,
  onMoved,
  onBearing,
}: ValleyStageProps) {
  const container = useRef<HTMLDivElement>(null);
  const [stems, setStems] = useState<Stem[]>([]);
  const [failed, setFailed] = useState(false);
  const [idle, setIdle] = useState(false);
  const [ground, setGround] = useState<GroundText[]>([]);
  const [outline, setOutline] = useState("");
  const mapRef = useRef<maplibregl.Map | null>(null);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const onOutlineRef = useRef(onOutline);
  onOutlineRef.current = onOutline;
  // read each frame, so a new snapshot revision moves the stems without rebuilding the map
  const placesRef = useRef(places);
  placesRef.current = places;
  const outletRef = useRef(outlet);
  outletRef.current = outlet;

  const [arrived, setArrived] = useState(false);
  const [settled, setSettled] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [moved, setMoved] = useState(false);
  // the beat's view, the flat reading, or the move between them
  const [view, setView] = useState<"oblique" | "toFlat" | "flat" | "toOblique">("oblique");
  const viewRef = useRef(view);
  viewRef.current = view;
  /** The arrival camera, and the camera and relief the map shows now. */
  const homeRef = useRef<MapCamera | null>(null);
  const nowRef = useRef<MapCamera | null>(null);
  const reliefRef = useRef<number>(ARRIVAL_EXAGGERATION);
  const flatAppliedRef = useRef(false);
  const resetAppliedRef = useRef(0);
  const flightActiveRef = useRef(false);
  const clampingRef = useRef(false);
  const unlockedRef = useRef(false);
  const catchmentRef = useRef(catchment);
  catchmentRef.current = catchment;
  const boundsRef = useRef<[number, number, number, number]>(
    assets?.terrain.bounds ?? VALLEY_ASSET_BOUNDS,
  );
  boundsRef.current = assets?.terrain.bounds ?? VALLEY_ASSET_BOUNDS;
  const onMovedRef = useRef(onMoved);
  onMovedRef.current = onMoved;
  const onBearingRef = useRef(onBearing);
  onBearingRef.current = onBearing;
  // MOT-01: "waiting" for the start view's tiles, then "moving", then "done" (or "done" from the start)
  const [settle, setSettle] = useState<"waiting" | "moving" | "done">("done");
  const startRef = useRef<MapCamera | null>(null);
  const settleRaf = useRef(0);
  /** Stops the settle's frame loop and removes its input listeners; run on unmount as well (b60). */
  const stopSettle = useRef<() => void>(() => undefined);
  // an interrupted settle shows the arrival at once (the reduced-motion timings)
  const [quick, setQuick] = useState(false);
  const settleRef = useRef(settle);
  settleRef.current = settle;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;
  const onDepartureRef = useRef(onDeparture);
  onDepartureRef.current = onDeparture;

  // the departure raster and the hatch fade in together once the picture has loaded (MOT-04, 160 ms,
  // frame by frame as the arrival fades are); under reduced motion they appear at once
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
      // the map may already be removed with the stage (maplibre-gl 6.14.0 marks it on map._removed)
      if (!m._removed) removeDepartureLayers(m);
      onDepartureRef.current?.(false);
    };
  }, [idle, departure]);

  // F or Home/H: one camera move to the top-down view (relief easing to flat, terrain off at the end) or back
  // to the active step's pose. Under reduced motion the camera cuts (MQ-03). Any user pointer/wheel/touch input
  // during the move yields immediately (MQ-02, SC-05).
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
    const el = container.current;
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
  }, [flat, resetSeq, arrived, settled, catchment]);

  // unlock the camera once arrival has settled and no transition is running
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const canInteract =
      settled && labels && !flightActiveRef.current && (view === "oblique" || view === "flat");
    unlockedRef.current = canInteract;
    setInteractive(canInteract);
    syncInteractive(m, canInteract, view === "flat", boundsRef.current);
  }, [settled, labels, view]);

  // at arrival the outline is drawn crisp above the crest (below); the draped line serves the dive
  useEffect(() => {
    showDrapedLine(mapRef.current, !labels);
  }, [labels]);

  // MOT-01: once the regional view's tiles are idle, one camera move to the valley view; the arrival
  // begins when it ends. Any input during the move ends it at once (MQ-02): this map takes no gestures, so
  // the camera jumps to the valley view, the arrival shows without its delays, and the input goes on to do
  // its own job (the listener only watches, in the capture phase, ahead of the key hints).
  useEffect(() => {
    const m = mapRef.current;
    const home = homeRef.current;
    // read through the ref: the state change to "moving" must not re-run this effect and cancel the move
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
          // the settle runs again on reload
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
    // `settle` is listed so the move starts when the setup marks it waiting; the ref keeps it to one run,
    // and the frame is cancelled only on unmount (below) or by input, not when the state moves on
  }, [settle, idle, settleKey]);
  useEffect(
    () => () => {
      // a navigation during the move leaves no frame loop and no listener behind
      stopSettle.current();
    },
    [],
  );

  // arrival begins once the land is drawn and the dive or the settle (if any) has ended
  useEffect(() => {
    if (!labels || !idle || arrived || settle !== "done" || !mapRef.current) return;
    setArrived(true);
    onArrive?.(quick);
  }, [labels, idle, arrived, settle, quick, onArrive]);

  // then the light pool warms and the beam lands, frame by frame (a MapLibre paint transition can stall
  // when nothing else requests a frame), and the stage marks itself settled once every part has landed
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
  }, [arrived, quick]);

  const reducedMotion =
    quick ||
    (typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  /** CSS variables for the landing class: this part's delay and duration. */
  const land = (part: ArrivalPart): Record<string, string> => {
    const t = arrivalTiming(part, reducedMotion);
    return { "--land-delay": `${String(t.delayMs)}ms`, "--land-dur": `${String(t.durationMs)}ms` };
  };
  const oblique = view === "oblique";
  const show = labels && arrived && names && oblique;

  useEffect(() => {
    let map: maplibregl.Map | undefined;
    let cancelled = false;
    const stopped = () => cancelled;

    const valleyLines: LabelLine[] = [
      {
        text: format("arrival.valleyName", { valley: valleyName }),
        size: 0.4,
        weight: 500,
        tracking: 0.022,
      },
      { text: format("arrival.region", { region: regionName }), size: 0.28, weight: 500 },
    ];
    const studyLines: LabelLine[] = [
      { text: format("arrival.studyArea", { area: areaKm2 }), size: 0.33, weight: 500 },
      { text: en["arrival.studyAreaLimit"].text, size: 0.22, weight: 500 },
    ];
    const budgetLines = (ids: MessageId[], texts: LabelLine[]): BudgetLine[] =>
      texts.map((t, i) => {
        const id = ids[i];
        return { text: t.text, honesty: id ? isHonesty(id) : false };
      });

    const onLoad = (m: maplibregl.Map, cam: MapCamera, catchment: Feature) => {
      const start = startRef.current ?? cam;
      m.jumpTo({
        center: start.center,
        zoom: start.zoom,
        pitch: start.pitch,
        bearing: start.bearing,
        elevation: start.elevation,
      });
      const reading = screenReadingBearing(cam.bearing);
      const blocks = [
        {
          id: "label-valley",
          lines: valleyLines,
          budget: budgetLines(["arrival.valleyName", "arrival.region"], valleyLines),
          anchor: valleyNameAnchor(catchment, VALLEY_NAME_REFERENCE, {
            eastOfM: 2500,
            shiftM: { east: -2050, north: -2190 },
            readingBearingDeg: reading,
          }),
        },
        {
          id: "label-study-area",
          lines: studyLines,
          budget: budgetLines(["arrival.studyArea", "arrival.studyAreaLimit"], studyLines),
          anchor: northEdgeAnchor(catchment, { lonBand: [-6.45, -6.3], outM: 2400 }),
        },
      ].map((b) => {
        const widthM = 15000;
        const heightM = (widthM * LINE_H * b.lines.length) / BOX_W;
        return { ...b, heightM, corners: groundCorners({ ...b.anchor, widthM, heightM }) };
      });

      const ring = (outerRing(smoothFeature(catchment)) ?? []).filter((_, i) => i % 2 === 0);
      mapRef.current = m;
      showDrapedLine(m, !labelsRef.current);
      // development and test builds only: lets end-to-end checks read the map's paint state
      if (process.env.NODE_ENV !== "production")
        (window as unknown as { __siterraStage?: maplibregl.Map }).__siterraStage = m;

      let last = "";
      const place = () => {
        // the flat reading draws the line on the land and no names; the leader has no line to end on
        if (viewRef.current !== "oblique") {
          if (last !== "flat") {
            last = "flat";
            onOutlineRef.current?.([]);
          }
          return;
        }
        const at = (lon: number, lat: number) => {
          const p = m.project([lon, lat]);
          return { x: p.x, y: p.y };
        };
        // maplibre-gl 6.14.0 keeps the camera's transform on map._camera (typed, underscored); pinned version
        const t = m._camera.transform;
        const canvas = m.getCanvas();
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const placedGround = blocks.flatMap((b) => {
          const elev = (m.queryTerrainElevation([b.anchor.lon, b.anchor.lat]) ?? 0) + PLANE_LIFT_M;
          const q = b.corners.map(([lon, lat]) =>
            projectAt(t.modelViewProjectionMatrix, t.worldSize, lon, lat, elev, w, h),
          );
          const [tl, tr, br, bl] = q;
          if (!tl || !tr || !br || !bl) return [];
          const transform = quadMatrix3d(BOX_W, LINE_H * b.lines.length, tl, tr, br, bl);
          return [{ id: b.id, lines: b.lines, budget: b.budget, transform }];
        });
        const pts = ring.map(([lon, lat]) => {
          const e = (m.queryTerrainElevation([lon, lat]) ?? 0) + OUTLINE_LIFT_M;
          return projectAt(t.modelViewProjectionMatrix, t.worldSize, lon, lat, e, w, h);
        });
        const allVisible = pts.every(Boolean);
        showDrapedLine(m, !labelsRef.current || !allVisible);
        const nextOutline = allVisible
          ? pts
              .map((p, i) => `${i ? "L" : "M"}${(p?.x ?? 0).toFixed(1)} ${(p?.y ?? 0).toFixed(1)}`)
              .join("") + "Z"
          : "";
        const o = outletRef.current;
        const nextStems = [
          ...(o ? [{ id: "outlet", name: en["arrival.outlet"].text, ...at(o.lon, o.lat) }] : []),
          ...placesRef.current.map((p) => ({ id: p.id, name: p.name, ...at(p.lon, p.lat) })),
        ];
        // skip React work when nothing moved (render fires every frame)
        const key = JSON.stringify([placedGround.map((g) => g.transform), nextStems, nextOutline]);
        if (key === last) return;
        last = key;
        setStems(nextStems);
        setGround(placedGround);
        setOutline(nextOutline);
        onOutlineRef.current?.(pts.flatMap((p) => (p ? [{ x: p.x, y: p.y }] : [])));
      };
      place();
      // terrain tiles arriving change the heights the names and stems stand on, so follow every render
      m.on("render", place);
      const onUserMove = () => {
        if (
          !unlockedRef.current ||
          flightActiveRef.current ||
          settleRef.current === "moving" ||
          clampingRef.current
        )
          return;
        const c = m.getCenter();
        const z = m.getZoom();
        const p = m.getPitch();
        const b = m.getBearing();
        const flatMode = viewRef.current === "flat";
        const maxZ = maxZoomForDistance(ARRIVAL_POSE, m.getCanvas().clientHeight || 810);
        const nextCenter = clampCenter([c.lng, c.lat], boundsRef.current);
        const nextZoom = clampZoom(z, maxZ);
        const nextPitch = clampPitch(p, flatMode);
        const nextBearing = flatMode ? 0 : clampBearing(b, cam.bearing);
        if (
          Math.abs(nextCenter[0] - c.lng) > 1e-5 ||
          Math.abs(nextCenter[1] - c.lat) > 1e-5 ||
          Math.abs(nextZoom - z) > 1e-4 ||
          Math.abs(nextPitch - p) > 1e-3 ||
          Math.abs(normalizeBearing(nextBearing - b)) > 1e-3
        ) {
          clampingRef.current = true;
          m.jumpTo({
            center: nextCenter,
            zoom: nextZoom,
            pitch: nextPitch,
            bearing: nextBearing,
            elevation: m.getCenterElevation(),
          });
          clampingRef.current = false;
        }
        const nextCam: MapCamera = {
          center: nextCenter,
          elevation: m.getCenterElevation(),
          zoom: nextZoom,
          pitch: nextPitch,
          bearing: nextBearing,
          verticalFovDeg: cam.verticalFovDeg,
        };
        nowRef.current = nextCam;
        const target = flatMode ? stepFlatCamera(m, catchmentRef.current, cam) : cam;
        const isMoved = cameraMoved(nextCam, target);
        setMoved(isMoved);
        onMovedRef.current?.(isMoved);
        onBearingRef.current?.(nextBearing);
      };
      m.on("move", onUserMove);
      m.once("idle", () => {
        setIdle(true);
        onIdle?.();
      });
    };

    const setup = async () => {
      if (!assets) throw new Error("No map bundle");
      const terrainTiles = assets.terrain.tiles[0];
      const contours =
        terrainTiles && contourArea
          ? {
              tiles: [await contourTiles(terrainTiles, assets.terrain.maxzoom)],
              ...contourArea,
              maxzoom: 13,
            }
          : undefined;
      await document.fonts.load(`500 64px ${LABEL_FAMILY}`);
      const el = container.current;
      if (cancelled || !el) return;
      // a hidden or not yet laid out frame has no height; wait for one rather than fail
      if (el.clientHeight === 0) {
        await new Promise<void>((resolve) => {
          const ro = new ResizeObserver(() => {
            if (el.clientHeight > 0) {
              ro.disconnect();
              resolve();
            }
          });
          ro.observe(el);
        });
      }
      // the effect may have been cleaned up while waiting for a size
      if (stopped()) return;

      const cam = orbitToMapCamera(
        {
          ...ARRIVAL_POSE,
          distanceM: ARRIVAL_POSE.distanceM * widthFitScale(el.clientWidth, el.clientHeight),
        },
        el.clientHeight,
      );
      // MOT-01 on a first visit to this case in this tab; under reduced motion the camera starts where it ends
      const settled = (() => {
        try {
          return !settleKey || viewerSession()?.getItem(settleKey) === "1";
        } catch {
          return true;
        }
      })();
      const reducedSettle = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const start = settled || reducedSettle ? cam : regionalCamera(cam);
      startRef.current = start;
      if (start !== cam) setSettle("waiting");
      const m = new maplibregl.Map({
        container: el,
        style: valleyStyle({
          assets: {
            ...assets,
            haze: { url: drawHaze(daylight.paper), coordinates: hazeCorners() },
          },
          catchment,
          contours,
          // the stronger regional veil belongs to the settle alone; the dive keeps the approved veil
          veilByZoom: settleKey !== undefined,
          outlet: outletRef.current,
        }),
        center: start.center,
        zoom: start.zoom,
        pitch: start.pitch,
        bearing: start.bearing,
        maxPitch: 85,
        interactive: false,
        attributionControl: false,
        // the camera centre sits at the target's height, not clamped to the terrain below it
        centerClampedToGround: false,
      });
      map = m;
      homeRef.current = cam;
      nowRef.current = cam;
      m.setVerticalFieldOfView(cam.verticalFovDeg);
      m.once("load", () => {
        onLoad(m, cam, catchment);
        onMap?.(m);
      });
    };

    setup().catch((e: unknown) => {
      console.error("Stage: map setup failed", e);
      setFailed(true);
      onFailedRef.current?.();
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
    // callers pass the record's geometry once (memoized), so the map is built once per case revision
  }, [assets, contourArea, catchment, valleyName, regionName, areaKm2, onIdle, onMap, settleKey]);

  return (
    <div
      className={styles.stage}
      data-stage-idle={idle ? "true" : "false"}
      data-arrival-settled={settled ? "true" : "false"}
      data-camera-interactive={interactive ? "true" : "false"}
      data-camera-moved={moved ? "true" : "false"}
      data-view={view}
      data-settle={settle}
    >
      <div ref={container} className={styles.map} aria-hidden="true" />
      {labels && outline && oblique ? (
        <svg className={styles.outline} aria-hidden="true">
          <path className={styles.outlineCasing} d={outline} />
          <path className={styles.outlineInk} d={outline} />
        </svg>
      ) : null}
      {(show ? stems : []).map((s) =>
        s.id === "outlet" ? (
          <span
            key={s.id}
            className={`${styles.outletLabel ?? ""} ${styles.landing ?? ""}`}
            style={{ left: s.x, top: s.y, ...land("outlet") }}
            aria-hidden="true"
            data-budget="land-label"
          >
            {s.name}
          </span>
        ) : (
          <span
            key={s.id}
            className={`${styles.stem ?? ""} ${styles.landing ?? ""}`}
            style={{ left: s.x, top: s.y, ...land("villages") }}
            aria-hidden="true"
          >
            <span
              className={`${styles.stemName ?? ""} ${styles.landing ?? ""}`}
              style={land("villageNames")}
              data-budget="land-label"
            >
              {s.name}
            </span>
          </span>
        ),
      )}
      {(show ? ground : []).map((g) => (
        <div
          key={g.id}
          className={`${styles.groundText ?? ""} ${styles.landing ?? ""}`}
          style={{
            width: BOX_W,
            height: LINE_H * g.lines.length,
            transform: g.transform,
            ...land(g.id === "label-valley" ? "name" : "study"),
          }}
          aria-hidden="true"
          data-budget="land-label"
          data-budget-text={g.lines.map((l) => l.text).join(" ")}
          data-budget-lines={JSON.stringify(g.budget)}
        >
          {g.lines.map((l) => (
            <p
              key={l.text}
              className={styles.groundLine}
              style={{
                fontSize: l.size * LINE_H * g.lines.length,
                letterSpacing: `${String(l.tracking ?? 0)}em`,
              }}
            >
              {l.text}
            </p>
          ))}
        </div>
      ))}
      {view === "flat" && mapRef.current ? <FlatFrame map={mapRef.current} /> : null}
      <ul
        className={styles.srOnly}
        aria-label={format("arrival.valleyName", { valley: valleyName })}
      >
        <li>{format("arrival.region", { region: regionName })}</li>
        <li>
          {format("arrival.studyArea", { area: areaKm2 })} {en["arrival.studyAreaLimit"].text}
        </li>
        {outlet ? <li>{en["arrival.outlet"].text}</li> : null}
        {places.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
        <li>{format("stage.relief", { factor: ARRIVAL_EXAGGERATION })}</li>
      </ul>
      {failed ? (
        <p className={styles.error} role="alert">
          {en["stage.mapFailed"].text}
        </p>
      ) : null}
    </div>
  );
}
