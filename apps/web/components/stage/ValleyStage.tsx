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
import { orbitToMapCamera, widthFitScale, type MapCamera } from "../../lib/stage/camera";
import { easeInOut, FLAT_MOVE_MS, flatCamera, mixCamera } from "../../lib/stage/flat";
import { FlatFrame } from "./FlatFrame";
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
import styles from "./ValleyStage.module.css";

// MapLibre 6 is ESM-only; under Next.js and Turbopack its worker must be named by URL (MapLibre install docs,
// research/technology/stack-versions.md). Only in the browser: the module is also evaluated for server rendering.
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl(
    new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
  );
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
  for (const id of ["catchment-casing", "catchment-line"])
    if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", show ? "visible" : "none");
}

/** The text box the transform maps onto the land: CSS px, wide enough for the hero's ground names. */
const BOX_W = 1000;
const LINE_H = 83;
/** The plane the names lie on: this far above the land at the name's anchor, as in the hero (0.6 km). */
const PLANE_LIFT_M = 600;

export interface ValleyStageProps {
  /** The valley's assets from the map bundle, or null when the bundle could not be read. */
  assets: MapBundle["valley"] | null;
  /** The analysis geometry from the case record (GeoSelection, its current revision). */
  catchment: Feature;
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
  onArrive?: () => void;
  /** False in the work beat: the outline stays, the names and stems leave the land. */
  names?: boolean;
  /** The projected outline in CSS px, for a leader that ends on the line; empty in the flat reading. */
  onOutline?: (points: { x: number; y: number }[]) => void;
  /** The flat reading (MOT-12): top-down, north up, terrain off, with graticule ticks and a scale bar. */
  flat?: boolean;
  /** Called when the map cannot be drawn, so the text listing can take its place. */
  onFailed?: () => void;
}

export function ValleyStage({
  assets,
  catchment,
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
  // the beat's view, the flat reading, or the move between them
  const [view, setView] = useState<"oblique" | "toFlat" | "flat" | "toOblique">("oblique");
  const viewRef = useRef(view);
  viewRef.current = view;
  /** The arrival camera, and the camera and relief the map shows now. */
  const homeRef = useRef<MapCamera | null>(null);
  const nowRef = useRef<MapCamera | null>(null);
  const reliefRef = useRef<number>(ARRIVAL_EXAGGERATION);
  const flatAppliedRef = useRef(false);
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;

  // F: one camera move to the top-down view with the relief easing to flat, terrain off at the end; F again
  // returns. Under reduced motion the camera cuts.
  useEffect(() => {
    const m = mapRef.current;
    const home = homeRef.current;
    if (!m || !home || !arrived || flat === flatAppliedRef.current) return;
    flatAppliedRef.current = flat;
    const canvas = m.getCanvas();
    const ring = outerRing(catchment) ?? [];
    const lons = ring.map((p) => p[0]);
    const lats = ring.map((p) => p[1]);
    const to = flat
      ? {
          ...flatCamera(
            [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
            canvas.clientWidth,
            canvas.clientHeight,
            120,
          ),
          verticalFovDeg: home.verticalFovDeg,
        }
      : home;
    const from = nowRef.current ?? home;
    const reliefFrom = reliefRef.current;
    const reliefTo = flat ? 0 : ARRIVAL_EXAGGERATION;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 0 : FLAT_MOVE_MS;
    setView(flat ? "toFlat" : "toOblique");
    showDrapedLine(m, true);
    if (!flat) m.setTerrain({ source: "terrain", exaggeration: Math.max(reliefFrom, 0.001) });
    const t0 = performance.now();
    let raf = 0;
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
      if (k < 1) {
        raf = requestAnimationFrame(step);
        return;
      }
      if (flat) {
        m.setTerrain(null);
        setView("flat");
      } else {
        showDrapedLine(m, false);
        setView("oblique");
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [flat, arrived, catchment]);

  // at arrival the outline is drawn crisp above the crest (below); the draped line serves the dive
  useEffect(() => {
    showDrapedLine(mapRef.current, !labels);
  }, [labels]);

  // arrival begins once the land is drawn and the dive (if any) has ended
  useEffect(() => {
    if (!labels || !idle || arrived || !mapRef.current) return;
    setArrived(true);
    onArrive?.();
  }, [labels, idle, arrived, onArrive]);

  // then the light pool warms and the beam lands, frame by frame (a MapLibre paint transition can stall
  // when nothing else requests a frame), and the stage marks itself settled once every part has landed
  useEffect(() => {
    const m = mapRef.current;
    if (!arrived || !m) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
        const k = Math.min(1, Math.max(0, (now - f.t.delayMs) / f.t.durationMs));
        if (k < 1) running = true;
        m.setPaintProperty(f.layer, f.prop, f.to * k);
      }
      if (running) raf = requestAnimationFrame(step);
    };
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
  }, [arrived]);

  const reducedMotion =
    typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      { text: en["arrival.valleyName"].text, size: 0.4, weight: 500, tracking: 0.022 },
      { text: en["arrival.region"].text, size: 0.28, weight: 500 },
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
      m.jumpTo({
        center: cam.center,
        zoom: cam.zoom,
        pitch: cam.pitch,
        bearing: cam.bearing,
        elevation: cam.elevation,
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
        const nextOutline = pts.every(Boolean)
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
      m.once("idle", () => {
        setIdle(true);
        onIdle?.();
      });
    };

    const setup = async () => {
      if (!assets) throw new Error("No map bundle");
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
      const m = new maplibregl.Map({
        container: el,
        style: valleyStyle({
          assets: {
            ...assets,
            haze: { url: drawHaze(daylight.paper), coordinates: hazeCorners() },
          },
          catchment,
          outlet: outletRef.current,
        }),
        center: cam.center,
        zoom: cam.zoom,
        pitch: cam.pitch,
        bearing: cam.bearing,
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
  }, [assets, catchment, areaKm2, onIdle, onMap]);

  return (
    <div
      className={styles.stage}
      data-stage-idle={idle ? "true" : "false"}
      data-arrival-settled={settled ? "true" : "false"}
      data-view={view}
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
      <ul className={styles.srOnly} aria-label={en["arrival.valleyName"].text}>
        <li>{en["arrival.region"].text}</li>
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
