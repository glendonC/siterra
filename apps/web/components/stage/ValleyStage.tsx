"use client";

// The full-bleed valley stage in daylight: the MapLibre map with the arrival camera, names lying on a plane
// just above the land in perspective, and the stems drawn over the map. Everything the land shows is also listed for screen readers.

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { MapBundle } from "../../lib/map/bundle";
import type { LandPoint } from "../../lib/projection/places";
import { ARRIVAL_EXAGGERATION } from "../../lib/stage/arrival";
import {
  VALLEY_ASSET_BOUNDS,
  type MapCamera,
} from "../../lib/stage/camera";
import { valleyStyle } from "../../lib/stage/daylight-style";
import type { DepartureMapLayer } from "../../lib/stage/departure-layers";
import type { Feature } from "../../lib/stage/geo";
import { drawHaze, hazeCorners } from "../../lib/stage/haze";
import { smoothFeature } from "../../lib/stage/smooth";
import { daylight } from "../../lib/theme/daylight";
import {
  buildGroundLabelBlocks,
  clampAndSyncUserCameraMove,
  contourTiles,
  LABEL_FAMILY,
  outerRing,
  projectStageOverlays,
  resolveInitialStageCameras,
  showDrapedLine,
  syncInteractive,
  waitForContainerHeight,
  type GroundText,
  type SettleState,
  type StageViewMode,
  type Stem,
} from "./stage-map-controller";
import { StageOverlays } from "./StageOverlays";
import {
  useArrivalFadesEffect,
  useDepartureLayerEffect,
  useFlatAndResetFlightEffect,
  useRegionalSettleEffect,
} from "./useStageTransitions";
import styles from "./ValleyStage.module.css";

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
  /** The record's name for that area ("Valley catchment"). */
  areaLabel: string;
  /** Villages on stems, from the case's ContextFeature records. */
  places: LandPoint[];
  /** The outlet from its ContextFeature record; no beam and no outlet stem without one. */
  outlet: LandPoint | undefined;
  /** Outline kind from TerrainFile.outline.kind; `arrival.outlet` is shown only for a watershed. */
  outlineKind?: "watershed" | "drainage_within_box" | "land_within_box" | "box";
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
  /** The flat reading: top-down, north up, terrain off, with graticule ticks and a scale bar. */
  flat?: boolean;
  /** Called when the map cannot be drawn, so the text listing can take its place. */
  onFailed?: () => void;
  /**
   * Key for this case's arrival settle (the regional view moving once to the valley view).
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
  areaLabel,
  places,
  outlet,
  outlineKind = "watershed",
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
  // Read each frame so a new snapshot revision moves the stems without rebuilding the map.
  const placesRef = useRef(places);
  placesRef.current = places;
  const outletRef = useRef(outlet);
  outletRef.current = outlet;
  const outlineKindRef = useRef(outlineKind);
  outlineKindRef.current = outlineKind;

  const [arrived, setArrived] = useState(false);
  const [settled, setSettled] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [moved, setMoved] = useState(false);
  const [view, setView] = useState<StageViewMode>("oblique");
  const viewRef = useRef(view);
  viewRef.current = view;
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
  // "waiting" for the start view's tiles, then "moving", then "done" (or "done" from the start).
  const [settle, setSettle] = useState<SettleState>("done");
  const startRef = useRef<MapCamera | null>(null);
  const settleRaf = useRef(0);
  /** Stops the settle's frame loop and removes its input listeners; run on unmount as well. */
  const stopSettle = useRef<() => void>(() => undefined);
  // An interrupted settle shows the arrival at once (using reduced-motion timings).
  const [quick, setQuick] = useState(false);
  const settleRef = useRef(settle);
  settleRef.current = settle;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;
  const onDepartureRef = useRef(onDeparture);
  onDepartureRef.current = onDeparture;

  useDepartureLayerEffect({
    mapRef,
    idle,
    departure,
    onDepartureRef,
  });

  useFlatAndResetFlightEffect({
    containerRef: container,
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
  });

  // Unlock the camera once arrival has settled and no transition is running.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const canInteract =
      settled && labels && !flightActiveRef.current && (view === "oblique" || view === "flat");
    unlockedRef.current = canInteract;
    setInteractive(canInteract);
    syncInteractive(m, canInteract, view === "flat", boundsRef.current);
  }, [settled, labels, view]);

  // At arrival the outline is drawn crisp above the crest; the draped line serves the dive.
  useEffect(() => {
    showDrapedLine(mapRef.current, !labels);
  }, [labels]);

  useRegionalSettleEffect({
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
  });

  // Arrival begins once the land is drawn and the dive or the settle (if any) has ended.
  useEffect(() => {
    if (!labels || !idle || arrived || settle !== "done" || !mapRef.current) return;
    setArrived(true);
    onArrive?.(quick);
  }, [labels, idle, arrived, settle, quick, onArrive]);

  useArrivalFadesEffect({
    mapRef,
    arrived,
    quick,
    setSettled,
  });

  const reducedMotion =
    quick ||
    (typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const oblique = view === "oblique";
  const show = labels && arrived && names && oblique;

  useEffect(() => {
    let map: maplibregl.Map | undefined;
    let cancelled = false;
    const stopped = () => cancelled;

    const onLoad = (m: maplibregl.Map, cam: MapCamera, catchmentFeature: Feature) => {
      const start = startRef.current ?? cam;
      m.jumpTo({
        center: start.center,
        zoom: start.zoom,
        pitch: start.pitch,
        bearing: start.bearing,
        elevation: start.elevation,
      });
      const blocks = buildGroundLabelBlocks({
        catchment: catchmentFeature,
        camBearing: cam.bearing,
        valleyName,
        regionName,
        areaLabel,
        areaKm2,
      });

      const ring = (outerRing(smoothFeature(catchmentFeature)) ?? []).filter((_, i) => i % 2 === 0);
      mapRef.current = m;
      showDrapedLine(m, !labelsRef.current);
      if (process.env.NODE_ENV !== "production")
        (window as unknown as { __siterraStage?: maplibregl.Map }).__siterraStage = m;

      let last = "";
      const place = () => {
        if (viewRef.current !== "oblique") {
          if (last !== "flat") {
            last = "flat";
            onOutlineRef.current?.([]);
          }
          return;
        }
        const {
          placedGround,
          allVisible,
          nextOutline,
          nextStems,
          outlinePoints,
        } = projectStageOverlays({
          map: m,
          blocks,
          ring,
          outlineKind: outlineKindRef.current,
          outlet: outletRef.current,
          places: placesRef.current,
        });
        showDrapedLine(m, !labelsRef.current || !allVisible);
        const key = JSON.stringify([placedGround.map((g) => g.transform), nextStems, nextOutline]);
        if (key === last) return;
        last = key;
        setStems(nextStems);
        setGround(placedGround);
        setOutline(nextOutline);
        onOutlineRef.current?.(outlinePoints);
      };
      place();
      m.on("render", place);
      const onUserMove = () => {
        if (
          !unlockedRef.current ||
          flightActiveRef.current ||
          settleRef.current === "moving" ||
          clampingRef.current
        )
          return;
        const flatMode = viewRef.current === "flat";
        const { nextCam, isMoved } = clampAndSyncUserCameraMove({
          map: m,
          homeCam: cam,
          catchment: catchmentRef.current,
          bounds: boundsRef.current,
          flatMode,
          setClamping: (c) => {
            clampingRef.current = c;
          },
        });
        nowRef.current = nextCam;
        setMoved(isMoved);
        onMovedRef.current?.(isMoved);
        onBearingRef.current?.(nextCam.bearing);
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
      await waitForContainerHeight(el);
      if (stopped()) return;

      const { cam, start } = resolveInitialStageCameras(el, settleKey);
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
  }, [
    assets,
    contourArea,
    catchment,
    valleyName,
    regionName,
    areaKm2,
    areaLabel,
    onIdle,
    onMap,
    settleKey,
  ]);

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
      <StageOverlays
        labels={labels}
        outline={outline}
        oblique={oblique}
        show={show}
        stems={stems}
        ground={ground}
        reducedMotion={reducedMotion}
        view={view}
        map={mapRef.current}
        valleyName={valleyName}
        regionName={regionName}
        areaLabel={areaLabel}
        areaKm2={areaKm2}
        outlet={outlet}
        places={places}
        failed={failed}
      />
    </div>
  );
}
