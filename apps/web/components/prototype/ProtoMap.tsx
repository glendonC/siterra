"use client";

// The prototype's full-bleed valley stage across all map views (Globe, 3D Terrain, 5-Layer Stack,
// Time Record, Split Comparison, Field View) and 3 switchable visual directions (1: SHD Obsidian Table,
// 2: Mireye Daylight Model, 3: Dune Nocturnal Volume).
// Includes FireTrace-inspired animated hydrological drainage flow, animated field-verification route,
// widely separated colour-coded 5-layer sheets with right-hand callouts, and tethered evidence leader.

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { MapBundle } from "../../lib/map/bundle";
import { CROPLAND_URL, pictureUrl, type Fixture } from "../../lib/prototype/fixture";
import { ARRIVAL_EXAGGERATION, ARRIVAL_POSE } from "../../lib/stage/arrival";
import { orbitToMapCamera, widthFitScale, type MapCamera } from "../../lib/stage/camera";
import { valleyStyle } from "../../lib/stage/daylight-style";
import { hatchTile } from "../../lib/stage/departure-layers";
import { easeInOut, flatCamera, mixCamera } from "../../lib/stage/flat";
import { drawHaze, hazeCorners } from "../../lib/stage/haze";
import { projectAt } from "../../lib/stage/project";
import { smoothFeature } from "../../lib/stage/smooth";
import { daylight, directionPalettes, rainTotal, type DirectionId } from "../../lib/theme/daylight";
import styles from "./ProtoMap.module.css";

if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl(
    new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
  );
}

export type View = "globe" | "relief" | "flat" | "stack" | "timerecord" | "split" | "viewpoint";

export type MapLayer =
  | { kind: "none" }
  | { kind: "greenness"; periodId: string; rainOutline?: boolean; dryPulse?: boolean }
  | {
      kind: "pixeltrend";
      step?: number;
      window?: "mar_jun" | "jun_sep";
      rainOutline?: boolean;
      dryPulse?: boolean;
    }
  | { kind: "rain"; values: Record<string, number> | null; dryPulse?: boolean }
  | { kind: "cropland"; rainOutline?: boolean };

/** A plan sheet above the valley: height 1 is fully lifted, 0 lies on the land. */
export interface SheetState {
  id: string;
  n: string;
  label: string;
  sub?: string;
  badge?: string;
  height: number;
  opacity: number;
  empty?: boolean;
}

interface DrawnSheet {
  id: string;
  n: string;
  label: string;
  sub?: string;
  badge?: string;
  d: string;
  innerD: string;
  streamD: string;
  opacity: number;
  empty: boolean;
  layerIdx: number;
  eastPt: { x: number; y: number } | null;
  westPt: { x: number; y: number } | null;
}

interface Leader {
  d: string;
  tick: string;
  dot: { x: number; y: number };
}

export interface ProtoMapHandle {
  fly(shot: Shot): void;
  pad(top: number, left?: number): void;
  map(): maplibregl.Map | null;
}

export type Shot = "home" | "valley-floor" | "rain-grid" | "viewpoint-50m" | "stack-pose";

export interface ProtoMapProps {
  assets: MapBundle["valley"];
  fixture: Pick<Fixture, "catchment" | "outlet" | "pictureCorners" | "rainCells" | "places">;
  view: View;
  direction?: DirectionId;
  layer: MapLayer;
  reading: string | null;
  frontProgress?: number | null;
  showStrata?: boolean;
  showRoute?: boolean;
  activeSheetId?: string | null;
  onSelectSheet?: (id: string | null) => void;
  sheets?: SheetState[];
  leaderFrom?: { x: number; y: number } | null;
  leaderTarget?: { x: number; y: number } | null;
  onReady?: () => void;
  onRender?: (map: maplibregl.Map) => void;
  selection?: "none" | "proposed" | "set";
  dimImagery?: boolean;
}

const MOVE_MS = 1400;
const LIFT_M = 60;
/** Wide vertical separation between the 5 floating catchment sheets so each layer is crystal clear. */
const SHEET_BASE_M = 680;
const SHEET_GAP_M = 1720;

type Pt = { x: number; y: number };

const pathOf = (pts: Pt[]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("") + "Z";

const openPathOf = (pts: Pt[]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");

function scaleRing(
  ring: [number, number][],
  center: [number, number],
  scale: number,
): [number, number][] {
  return ring.map(([lon, lat]) => [
    center[0] + (lon - center[0]) * scale,
    center[1] + (lat - center[1]) * scale,
  ]);
}

function leaderToPoint(from: Pt, target: Pt): Leader {
  const elbow = { x: from.x - 26, y: from.y };
  const dx = target.x - elbow.x;
  const dy = target.y - elbow.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 6;
  const ny = (dx / len) * 6;
  return {
    d: `M${from.x.toFixed(1)} ${from.y.toFixed(1)}L${elbow.x.toFixed(1)} ${elbow.y.toFixed(1)}L${target.x.toFixed(1)} ${target.y.toFixed(1)}`,
    tick: `M${(target.x - nx).toFixed(1)} ${(target.y - ny).toFixed(1)}L${(target.x + nx).toFixed(1)} ${(target.y + ny).toFixed(1)}`,
    dot: target,
  };
}

function leaderTo(from: Pt, ring: Pt[]): Leader | null {
  if (!ring.length) return null;
  const elbow = { x: from.x - 28, y: from.y };
  let best = ring[0] as Pt;
  let bd = Infinity;
  for (const p of ring) {
    const d = (p.x - elbow.x) ** 2 + (p.y - elbow.y) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  if (bd === Infinity) return null;
  return leaderToPoint(from, best);
}

export const RAIN_CLASSES = [
  { upTo: 400, color: rainTotal.class1 },
  { upTo: 550, color: rainTotal.class2 },
  { upTo: Infinity, color: rainTotal.class3 },
] as const;

export function projectionType(m: maplibregl.Map): string | undefined {
  const p = m.getProjection() as maplibregl.ProjectionSpecification | undefined;
  return p?.type as string | undefined;
}

function reduced(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ringOf(f: Fixture["catchment"]) {
  const g = f.geometry;
  return (g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0]?.[0]) ?? [];
}

function centroidOf(f: Fixture["catchment"]): [number, number] {
  const [x0, y0, x1, y1] = bbox(f);
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

function bbox(f: Fixture["catchment"]): [number, number, number, number] {
  const ring = ringOf(f);
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

function currentCamera(m: maplibregl.Map): MapCamera {
  const c = m.getCenter();
  return {
    center: [c.lng, c.lat],
    elevation: m.getCenterElevation(),
    zoom: m.getZoom(),
    pitch: m.getPitch(),
    bearing: m.getBearing(),
    verticalFovDeg: m.getVerticalFieldOfView(),
  };
}

/** Hydrological stream coordinates along Assif n'Ait Bouguemez and high snowmelt tributaries. */
const MAIN_STREAM_COORDS: [number, number][] = [
  [-6.265, 31.692],
  [-6.302, 31.681],
  [-6.338, 31.669],
  [-6.372, 31.656],
  [-6.404, 31.646],
  [-6.432, 31.639],
  [-6.458, 31.629],
  [-6.484, 31.619],
];

const TRIBUTARY_COORDS: [number, number][][] = [
  [
    [-6.312, 31.714],
    [-6.326, 31.691],
    [-6.338, 31.669],
  ],
  [
    [-6.352, 31.616],
    [-6.364, 31.637],
    [-6.372, 31.656],
  ],
  [
    [-6.398, 31.682],
    [-6.414, 31.661],
    [-6.432, 31.639],
  ],
];

/** Field verification route connecting the 4 mapped ground stops from Tabant floor to the upper ridge. */
const FIELD_ROUTE_COORDS: [number, number][] = [
  [-6.425, 31.641],
  [-6.442, 31.633],
  [-6.406, 31.644],
  [-6.372, 31.656],
  [-6.324, 31.678],
];

export const ProtoMap = forwardRef<ProtoMapHandle, ProtoMapProps>(function ProtoMap(
  {
    assets,
    fixture,
    view,
    direction = "1",
    layer,
    reading,
    frontProgress = null,
    showStrata = true,
    showRoute = false,
    activeSheetId = null,
    onSelectSheet,
    sheets,
    leaderFrom,
    leaderTarget = null,
    onReady,
    onRender,
    selection = "set",
    dimImagery = false,
  },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [outline, setOutline] = useState("");
  const [strataPaths, setStrataPaths] = useState<{ mid: string; low: string }>({
    mid: "",
    low: "",
  });
  const [hydroPaths, setHydroPaths] = useState<{ main: string; tribs: string[] }>({
    main: "",
    tribs: [],
  });
  const [routePath, setRoutePath] = useState("");
  const [box, setBox] = useState<{ x0: number; x1: number; y0: number; y1: number } | null>(null);
  const [drawn, setDrawn] = useState<DrawnSheet[]>([]);
  const [leader, setLeader] = useState<Leader | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    lon: string;
    lat: string;
    elev: string;
    band: string;
  } | null>(null);

  const sheetsRef = useRef(sheets);
  sheetsRef.current = sheets;
  const leaderFromRef = useRef(leaderFrom);
  leaderFromRef.current = leaderFrom;
  const leaderTargetRef = useRef(leaderTarget);
  leaderTargetRef.current = leaderTarget;
  const placeRef = useRef<() => void>(() => undefined);
  const homeRef = useRef<MapCamera | null>(null);
  const reliefRef = useRef(ARRIVAL_EXAGGERATION);
  const viewRef = useRef<View>("relief");
  const anim = useRef(0);
  const onRenderRef = useRef(onRender);
  onRenderRef.current = onRender;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const dirRef = useRef<DirectionId>(direction);
  dirRef.current = direction;

  const move = (to: MapCamera, reliefTo: number, after?: () => void) => {
    const m = mapRef.current;
    if (!m) return;
    cancelAnimationFrame(anim.current);
    m.stop();
    const from = currentCamera(m);
    const reliefFrom = reliefRef.current;
    const ms = reduced() ? 0 : MOVE_MS;
    if (reliefTo > 0 && !m.getTerrain())
      m.setTerrain({ source: "terrain", exaggeration: Math.max(reliefFrom, 0.001) });
    const t0 = performance.now();
    const step = () => {
      const k = ms === 0 ? 1 : Math.min(1, (performance.now() - t0) / ms);
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
      reliefRef.current = relief;
      if (k < 1) {
        anim.current = requestAnimationFrame(step);
        return;
      }
      if (reliefTo === 0) m.setTerrain(null);
      after?.();
    };
    anim.current = requestAnimationFrame(step);
  };

  const shotCamera = (shot: Shot): MapCamera | null => {
    const home = homeRef.current;
    if (!home) return null;
    if (shot === "home") return home;
    const floor = fixture.places.find((p) => p.role === "settlement");
    if (shot === "viewpoint-50m") {
      // Tactical oblique valley survey pose: keeps Sentinel-2 10m texture, river flow, and 4 field stops crisp
      // and well-spaced without over-zooming past the 30m DEM resolution into blurry clay.
      const target = floor ?? { lon: -6.425, lat: 31.641 };
      return orbitToMapCamera(
        {
          target: { lon: target.lon + 0.036, lat: target.lat + 0.011 },
          targetHeightM: 2 * 1950,
          cameraBearingFromTargetDeg: -124,
          elevationDeg: 32,
          distanceM: 23500,
          verticalFovDeg: home.verticalFovDeg,
        },
        el.current?.clientHeight ?? 900,
      );
    }
    if (shot === "stack-pose") {
      return {
        ...home,
        center: [home.center[0] + 0.058, home.center[1] - 0.014],
        zoom: home.zoom - 0.42,
        pitch: 48,
        bearing: -24,
      };
    }
    if (shot === "valley-floor" && floor)
      return orbitToMapCamera(
        {
          target: { lon: floor.lon, lat: floor.lat },
          targetHeightM: 2 * 1900,
          cameraBearingFromTargetDeg: 160,
          elevationDeg: 38,
          distanceM: 34000,
          verticalFovDeg: home.verticalFovDeg,
        },
        el.current?.clientHeight ?? 900,
      );
    return { ...home, zoom: home.zoom - 0.25, pitch: 30, bearing: -10 };
  };

  useImperativeHandle(ref, () => ({
    fly(shot) {
      const to = shotCamera(shot);
      const m = mapRef.current;
      if (!to || !m) return;
      if (viewRef.current === "flat") {
        const canvas = m.getCanvas();
        move(
          {
            ...flatCamera(bbox(fixture.catchment), canvas.clientWidth, canvas.clientHeight, 140),
            verticalFovDeg: to.verticalFovDeg,
          },
          0,
        );
        return;
      }
      move(to, ARRIVAL_EXAGGERATION);
    },
    pad(top, left = 0) {
      const m = mapRef.current;
      if (!m) return;
      m.easeTo({
        padding: { top, bottom: 0, left, right: 0 },
        duration: reduced() ? 0 : MOVE_MS,
        easing: easeInOut,
        essential: false,
      });
    },
    map: () => mapRef.current,
  }));

  useEffect(() => {
    const container = el.current;
    if (!container) return;
    let live = true;
    let m: maplibregl.Map | undefined;
    const rawRing = ringOf(smoothFeature(fixture.catchment)).filter((_, i) => i % 2 === 0) as [
      number,
      number,
    ][];
    const centerPt = centroidOf(fixture.catchment);
    const midRing = scaleRing(rawRing, centerPt, 0.72);
    const lowRing = scaleRing(rawRing, centerPt, 0.44);

    const start = () => {
      if (!live) return;
      const cam = orbitToMapCamera(
        {
          ...ARRIVAL_POSE,
          distanceM:
            ARRIVAL_POSE.distanceM * widthFitScale(container.clientWidth, container.clientHeight),
        },
        container.clientHeight,
      );
      homeRef.current = cam;
      const t = assets.terrain.bounds;
      const pal = directionPalettes[dirRef.current];
      m = new maplibregl.Map({
        container,
        style: valleyStyle({
          assets: {
            ...assets,
            haze: { url: drawHaze(pal.paper), coordinates: hazeCorners() },
          },
          catchment: fixture.catchment,
          outlet: fixture.outlet,
        }),
        center: cam.center,
        zoom: cam.zoom,
        pitch: cam.pitch,
        bearing: cam.bearing,
        maxPitch: 82,
        minZoom: 2,
        maxZoom: 15,
        ...(t
          ? {
              maxBounds: [t[0] - 0.6, t[1] - 0.6, t[2] + 0.6, t[3] + 0.6] as [
                number,
                number,
                number,
                number,
              ],
            }
          : {}),
        attributionControl: false,
        centerClampedToGround: false,
        keyboard: true,
        dragRotate: true,
        pitchWithRotate: true,
        touchPitch: true,
      });
      m.setVerticalFieldOfView(cam.verticalFovDeg);
      m.jumpTo({ elevation: cam.elevation });
      mapRef.current = m;
      if (process.env.NODE_ENV !== "production")
        (window as unknown as { __proto?: maplibregl.Map }).__proto = m;

      m.on("mousemove", (e) => {
        if (!m) return;
        const elevNum = m.getTerrain()
          ? (m.queryTerrainElevation([e.lngLat.lng, e.lngLat.lat]) ?? 2150)
          : 2150;
        const trueElev = Math.round(elevNum / Math.max(1, reliefRef.current));
        const band =
          trueElev < 2317
            ? "Valley Floor (< 2,317 m)"
            : trueElev <= 2815
              ? "Middle Slopes (2,317 to 2,815 m)"
              : "High Summer Pastures (> 2,815 m)";
        setHoverInfo({
          x: e.point.x,
          y: e.point.y,
          lon: `${Math.abs(e.lngLat.lng).toFixed(3)}° W`,
          lat: `${e.lngLat.lat.toFixed(3)}° N`,
          elev: `${String(trueElev)} m`,
          band,
        });
      });
      m.on("mouseout", () => {
        setHoverInfo(null);
      });

      m.once("load", () => {
        if (!m || !live) return;
        applyDirectionPalette(m, dirRef.current);
        applySelection(m, selectionRef.current);
        addProtoLayers(m, fixture, dirRef.current);
        let last = "";
        let lastSheets = "";
        let lastLeader = "";
        const clearOverlays = () => {
          if (last !== "none") {
            last = "none";
            setOutline("");
            setStrataPaths({ mid: "", low: "" });
            setHydroPaths({ main: "", tribs: [] });
            setRoutePath("");
          }
          if (lastSheets !== "") {
            lastSheets = "";
            setDrawn([]);
          }
          if (lastLeader !== "") {
            lastLeader = "";
            setLeader(null);
          }
        };
        const place = () => {
          if (!m) return;
          onRenderRef.current?.(m);
          if (projectionType(m) === "globe" || viewRef.current === "globe") {
            clearOverlays();
            return;
          }
          const tr = m._camera.transform;
          const canvas = m.getCanvas();
          const w = canvas.clientWidth;
          const h = canvas.clientHeight;
          const terrain = m.getTerrain() !== null;
          const ground = rawRing.map(([lon, lat]) =>
            terrain ? (m?.queryTerrainElevation([lon, lat]) ?? 0) : 0,
          );
          const projectRing = (ringCoords: [number, number][], elev: (i: number) => number) => {
            const pts = ringCoords.map(([lon, lat], i) =>
              projectAt(tr.modelViewProjectionMatrix, tr.worldSize, lon, lat, elev(i), w, h),
            );
            return pts.every(Boolean) ? (pts as Pt[]) : null;
          };
          const projectCoords = (coords: [number, number][], lift = LIFT_M + 25) => {
            const pts = coords.map(([lon, lat]) => {
              const g = terrain ? (m?.queryTerrainElevation([lon, lat]) ?? 0) + lift : 0;
              return projectAt(tr.modelViewProjectionMatrix, tr.worldSize, lon, lat, g, w, h);
            });
            return pts.every(Boolean) ? (pts as Pt[]) : null;
          };

          const pts = projectRing(rawRing, (i) => (terrain ? (ground[i] ?? 0) + LIFT_M : 0));
          const midPts = projectRing(midRing, (i) =>
            terrain ? (ground[i] ?? 0) * 0.86 + LIFT_M : 0,
          );
          const lowPts = projectRing(lowRing, (i) =>
            terrain ? (ground[i] ?? 0) * 0.72 + LIFT_M : 0,
          );

          const streamPts = projectCoords(MAIN_STREAM_COORDS, LIFT_M + 30);
          const tribPaths = TRIBUTARY_COORDS.map((tc) => {
            const tp = projectCoords(tc, LIFT_M + 30);
            return tp ? openPathOf(tp) : "";
          }).filter(Boolean);

          const fRoutePts = projectCoords(FIELD_ROUTE_COORDS, LIFT_M + 42);

          const d = pts ? pathOf(pts) : "";
          if (d !== last) {
            last = d;
            setOutline(d);
            setStrataPaths({
              mid: midPts ? pathOf(midPts) : "",
              low: lowPts ? pathOf(lowPts) : "",
            });
            setHydroPaths({
              main: streamPts ? openPathOf(streamPts) : "",
              tribs: tribPaths,
            });
            setRoutePath(fRoutePts ? openPathOf(fRoutePts) : "");
            const xs = (pts ?? []).map((p) => p.x);
            const ys = (pts ?? []).map((p) => p.y);
            setBox(
              xs.length && ys.length
                ? {
                    x0: Math.min(...xs),
                    x1: Math.max(...xs),
                    y0: Math.min(...ys),
                    y1: Math.max(...ys),
                  }
                : null,
            );
          }

          // 5 colour-coded, widely separated sheets above the valley with inner feature geometry
          const top = Math.max(...ground, 1800);
          const list = (sheetsRef.current ?? []).filter((s) => s.opacity > 0.001);
          const next: DrawnSheet[] = list.flatMap((s, i) => {
            const plane = top + SHEET_BASE_M + SHEET_GAP_M * (list.length - 1 - i);
            const sp = projectRing(rawRing, (k) => {
              const g = ground[k] ?? 0;
              return terrain ? g + LIFT_M + (plane - g) * s.height : 0;
            });
            if (!sp) return [];
            const innerRing = i % 2 === 0 ? midRing : lowRing;
            const innerSp = projectRing(innerRing, (k) => {
              const g = ground[k] ?? 0;
              return terrain ? g + LIFT_M + (plane - g) * s.height : 0;
            });
            const streamSp = MAIN_STREAM_COORDS.map(([lon, lat]) => {
              const g = terrain ? (m?.queryTerrainElevation([lon, lat]) ?? 0) : 0;
              const z = terrain ? g + LIFT_M + (plane - g) * s.height : 0;
              return projectAt(tr.modelViewProjectionMatrix, tr.worldSize, lon, lat, z, w, h);
            });
            const validStream = streamSp.every(Boolean) ? openPathOf(streamSp as Pt[]) : "";
            const east = sp.reduce((a, b) => (b.x > a.x ? b : a));
            const west = sp.reduce((a, b) => (b.x < a.x ? b : a));
            return [
              {
                id: s.id,
                n: s.n,
                label: s.label,
                ...(s.sub ? { sub: s.sub } : {}),
                ...(s.badge ? { badge: s.badge } : {}),
                d: pathOf(sp),
                innerD: innerSp ? pathOf(innerSp) : "",
                streamD: validStream,
                opacity: s.opacity,
                empty: s.empty === true,
                layerIdx: (i % 5) + 1,
                eastPt: east,
                westPt: west,
              },
            ];
          });
          const sk = next.map((s) => `${s.id}:${s.d}|${s.opacity.toFixed(3)}`).join(";");
          if (sk !== lastSheets) {
            lastSheets = sk;
            setDrawn(next);
          }

          const from = leaderFromRef.current;
          const target = leaderTargetRef.current;
          const ld = from
            ? target
              ? leaderToPoint(from, target)
              : pts
                ? leaderTo(from, pts)
                : null
            : null;
          const lk = ld ? ld.d : "";
          if (lk !== lastLeader) {
            lastLeader = lk;
            setLeader(ld);
          }
        };
        placeRef.current = place;
        m.on("render", place);
        place();
        m.once("idle", () => {
          setReady(true);
          onReadyRef.current?.();
        });
      });
    };
    void document.fonts.ready.then(start);
    return () => {
      live = false;
      cancelAnimationFrame(anim.current);
      m?.remove();
      mapRef.current = null;
    };
  }, [assets, fixture]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    applyDirectionPalette(m, direction);
  }, [direction, ready]);

  const firstViewSync = useRef(true);

  useEffect(() => {
    const m = mapRef.current;
    const home = homeRef.current;
    if (!m || !ready || !home) return;
    const isInitial = firstViewSync.current;
    firstViewSync.current = false;
    const prev = viewRef.current;
    viewRef.current = view;
    if (prev === view && !isInitial) return;
    const canvas = m.getCanvas();
    const jumpOrMove = (to: MapCamera, reliefTo: number) => {
      if (isInitial) {
        m.jumpTo({
          center: to.center,
          zoom: to.zoom,
          pitch: to.pitch,
          bearing: to.bearing,
          elevation: to.elevation,
        });
        if (reliefTo === 0) m.setTerrain(null);
        else m.setTerrain({ source: "terrain", exaggeration: reliefTo });
        reliefRef.current = reliefTo;
        placeRef.current();
      } else {
        move(to, reliefTo);
      }
    };
    if (view === "globe") {
      cancelAnimationFrame(anim.current);
      m.setTerrain(null);
      reliefRef.current = 0;
      m.setMaxBounds(null);
      m.setProjection({ type: "globe" });
      const c = fixture.outlet;
      if (reduced() || isInitial)
        m.jumpTo({ center: [c.lon + 6, c.lat + 6], zoom: 2.2, pitch: 0, bearing: 0 });
      else
        m.flyTo({
          center: [c.lon + 6, c.lat + 6],
          zoom: 2.2,
          pitch: 0,
          bearing: 0,
          duration: 1800,
          essential: false,
        });
      return;
    }
    if (prev === "globe") {
      m.setProjection({ type: "mercator" });
      const t = assets.terrain.bounds;
      if (t) m.setMaxBounds([t[0] - 0.6, t[1] - 0.6, t[2] + 0.6, t[3] + 0.6]);
    }
    if (view === "flat") {
      jumpOrMove(
        {
          ...flatCamera(bbox(fixture.catchment), canvas.clientWidth, canvas.clientHeight, 140),
          verticalFovDeg: home.verticalFovDeg,
        },
        0,
      );
      return;
    }
    if (view === "viewpoint") {
      const vp = shotCamera("viewpoint-50m");
      if (vp) jumpOrMove(vp, 1.55);
      return;
    }
    if (view === "stack") {
      const sp = shotCamera("stack-pose");
      if (sp) jumpOrMove(sp, 1.65);
      return;
    }
    if (view === "split") {
      jumpOrMove(
        {
          ...home,
          center: [home.center[0] + 0.024, home.center[1]],
          pitch: 38,
          bearing: -18,
          zoom: home.zoom - 0.12,
        },
        1.6,
      );
      return;
    }
    if (view === "timerecord") {
      jumpOrMove(
        {
          ...home,
          center: [home.center[0] + 0.032, home.center[1] - 0.006],
          pitch: 44,
          bearing: -20,
          zoom: home.zoom - 0.08,
        },
        ARRIVAL_EXAGGERATION,
      );
      return;
    }
    jumpOrMove(
      {
        ...home,
        center: [home.center[0] + 0.024, home.center[1]],
      },
      ARRIVAL_EXAGGERATION,
    );
  }, [view, ready, fixture, assets]);

  useEffect(() => {
    const m = mapRef.current;
    if (m && ready) applySelection(m, selection);
  }, [selection, ready]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || !m.getLayer("imagery")) return;
    m.setPaintProperty("imagery", "raster-opacity-transition", {
      duration: reduced() ? 0 : 500,
      delay: 0,
    });
    m.setPaintProperty("imagery", "raster-opacity", dimImagery ? 0.14 : 1);
  }, [dimImagery, ready]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    setLayer(m, layer, fixture, direction);
  }, [layer, ready, fixture, direction]);

  const [sweepKey, setSweepKey] = useState(0);
  useEffect(() => {
    if (reading) setSweepKey((k) => k + 1);
  }, [reading]);

  useEffect(() => {
    if (ready) placeRef.current();
  }, [sheets, leaderFrom?.x, leaderFrom?.y, leaderTarget?.x, leaderTarget?.y, ready]);

  const frontX =
    box && frontProgress !== null
      ? box.x0 + (box.x1 - box.x0) * Math.max(0, Math.min(1, frontProgress))
      : null;

  return (
    <div className={styles.stage} data-ready={ready ? "true" : "false"} data-view={view}>
      <div ref={el} className={styles.map} aria-hidden="true" />

      {/* Elevation strata contour limits, animated hydrological stream network, and field verification route */}
      {showStrata && outline && strataPaths.mid && strataPaths.low && view !== "globe" ? (
        <svg className={styles.strataOverlay} aria-hidden="true">
          <path className={styles.stratumBandHigh} d={outline} />
          <path className={styles.stratumBandMid} d={strataPaths.mid} />
          <path className={styles.stratumBandLow} d={strataPaths.low} />
          <path className={styles.stratumLimit} d={strataPaths.mid} />
          <path className={styles.stratumLimit} d={strataPaths.low} />

          {/* Animated Hydrological Drainage & Snowmelt Flow Network */}
          {hydroPaths.tribs.map((td, idx) => (
            <g key={idx}>
              <path className={styles.hydroTribBase} d={td} />
              <path className={styles.hydroTribPulse} d={td} />
            </g>
          ))}
          {hydroPaths.main ? (
            <g>
              <path className={styles.hydroMainCasing} d={hydroPaths.main} />
              <path className={styles.hydroMainBase} d={hydroPaths.main} />
              <path className={styles.hydroMainPulse} d={hydroPaths.main} />
            </g>
          ) : null}

          {/* Animated Field Verification Route (Stage 5 / Field View) */}
          {(showRoute || view === "viewpoint") && routePath ? (
            <g>
              <path className={styles.routeCasing} d={routePath} />
              <path className={styles.routeLine} d={routePath} />
              <path className={styles.routePulse} d={routePath} />
            </g>
          ) : null}
        </svg>
      ) : null}

      {/* 5 Colour-Coded Exploded Layer Sheets with Right-Hand Callout Pills (Zero lines crossing polygon) */}
      {drawn.length ? (
        <svg className={styles.sheets} aria-hidden="true">
          <defs>
            <pattern id="sheetGrid1" width="24" height="24" patternUnits="userSpaceOnUse">
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="var(--layer-1-fg)"
                strokeWidth="0.7"
                strokeOpacity="0.36"
              />
            </pattern>
            <pattern id="sheetGrid2" width="14" height="14" patternUnits="userSpaceOnUse">
              <rect
                x="1.5"
                y="1.5"
                width="10"
                height="10"
                fill="var(--layer-2-fill)"
                stroke="var(--layer-2-fg)"
                strokeWidth="0.6"
                strokeOpacity="0.48"
              />
            </pattern>
            <pattern id="sheetGrid3" width="32" height="32" patternUnits="userSpaceOnUse">
              <rect
                x="1"
                y="1"
                width="29"
                height="29"
                fill="var(--layer-3-soft)"
                stroke="var(--layer-3-fg)"
                strokeWidth="0.9"
                strokeOpacity="0.55"
              />
            </pattern>
            <pattern id="sheetGrid4" width="20" height="20" patternUnits="userSpaceOnUse">
              <path
                d="M 0 10 Q 5 5, 10 10 T 20 10"
                fill="none"
                stroke="var(--layer-4-fg)"
                strokeWidth="0.9"
                strokeOpacity="0.45"
              />
            </pattern>
            <pattern id="sheetGrid5" width="12" height="12" patternUnits="userSpaceOnUse">
              <path
                d="M 0 12 L 12 0"
                fill="none"
                stroke="var(--layer-5-fg)"
                strokeWidth="0.9"
                strokeOpacity="0.45"
              />
            </pattern>
          </defs>
          {(() => {
            let prevY = 128;
            return drawn.map((s, idx) => {
              const isActive = activeSheetId === s.id;
              const anchor = s.eastPt ?? s.westPt;
              const rawY = anchor ? anchor.y : 156 + idx * 54;
              const leaderY = Math.max(rawY, prevY + 52);
              prevY = leaderY;
              const targetX = anchor ? Math.min(Math.max(anchor.x + 48, 630), 740) : 660;
              return (
                <g
                  key={s.id}
                  style={{ opacity: s.opacity }}
                  data-active={isActive ? "true" : "false"}
                  data-layer={String(s.layerIdx)}
                  onClick={() => onSelectSheet?.(isActive ? null : s.id)}
                >
                  <path
                    className={styles.sheet}
                    data-empty={s.empty ? "true" : "false"}
                    data-active={isActive ? "true" : "false"}
                    data-layer={String(s.layerIdx)}
                    d={s.d}
                  />
                  <path
                    className={styles.sheetGridFill}
                    d={s.d}
                    fill={`url(#sheetGrid${String(s.layerIdx)})`}
                  />
                  {s.innerD ? (
                    <path
                      className={styles.sheetInnerFeature}
                      data-layer={String(s.layerIdx)}
                      d={s.innerD}
                    />
                  ) : null}
                  {s.streamD ? (
                    <path
                      className={styles.sheetStreamFeature}
                      data-layer={String(s.layerIdx)}
                      d={s.streamD}
                    />
                  ) : null}
                  {anchor ? (
                    <g className={styles.sheetLabel} data-layer={String(s.layerIdx)}>
                      <circle cx={anchor.x} cy={anchor.y} r={4} />
                      <path
                        d={`M${anchor.x.toFixed(1)} ${anchor.y.toFixed(1)}L${(anchor.x + 22).toFixed(1)} ${leaderY.toFixed(1)}L${targetX.toFixed(1)} ${leaderY.toFixed(1)}`}
                        fill="none"
                      />
                      <circle cx={targetX} cy={leaderY} r={3} />
                      <rect
                        className={styles.sheetPillBg}
                        x={targetX + 8}
                        y={leaderY - 17}
                        width={264}
                        height={34}
                        rx={8}
                      />
                      <rect
                        className={styles.sheetSwatch}
                        data-layer={String(s.layerIdx)}
                        x={targetX + 42}
                        y={leaderY - 5}
                        width={10}
                        height={10}
                        rx={2.5}
                      />
                      <text x={targetX + 18} y={leaderY + 1} dominantBaseline="middle">
                        <tspan className={styles.sheetN}>{s.n}</tspan>
                        <tspan dx="24" className={styles.sheetTitle}>
                          {s.label}
                        </tspan>
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            });
          })()}
        </svg>
      ) : null}

      {/* Tethered Evidence Leader Line (Perplexity Rule 3: connects active pin/land to right-hand card) */}
      {leader ? (
        <svg className={styles.leader} aria-hidden="true">
          <path d={leader.d} />
          <path d={leader.tick} />
          <circle cx={leader.dot.x} cy={leader.dot.y} r={3} />
        </svg>
      ) : null}

      {/* Constant-speed survey scan front (Time Record & Evidence beats) */}
      {(reading || frontX !== null) && outline && box ? (
        <svg className={styles.survey} aria-hidden="true">
          <defs>
            <clipPath id="catchmentClip">
              <path d={outline} />
            </clipPath>
            <linearGradient
              id="sweep"
              gradientUnits="userSpaceOnUse"
              x1={box.x0}
              x2={box.x1}
              y1="0"
              y2="0"
            >
              <stop offset="0" stopColor="white" stopOpacity="0" />
              <stop offset="0.5" stopColor="white" stopOpacity="1" />
              <stop offset="1" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <mask id="sweepMask">
              <rect
                key={sweepKey}
                className={styles.sweepBand}
                x={box.x0 - (box.x1 - box.x0) * 0.35}
                y="0"
                width={(box.x1 - box.x0) * 0.35}
                height="100%"
                fill="url(#sweep)"
                style={
                  { "--sweep": `${String((box.x1 - box.x0) * 1.35)}px` } as React.CSSProperties
                }
              />
            </mask>
            <pattern id="cellTrendGrid" width="14" height="14" patternUnits="userSpaceOnUse">
              <rect
                x="1"
                y="1"
                width="11"
                height="11"
                fill="var(--ndvi-up-mod)"
                fillOpacity="0.28"
                stroke="var(--ndvi-up-strong)"
                strokeWidth="0.6"
                strokeOpacity="0.52"
              />
            </pattern>
          </defs>
          {reading ? (
            <path className={styles.surveyFill} d={outline} mask="url(#sweepMask)" />
          ) : null}
          {frontX !== null ? (
            <g clipPath="url(#catchmentClip)">
              <rect
                x={box.x0}
                y={box.y0}
                width={Math.max(0, frontX - box.x0)}
                height={box.y1 - box.y0}
                fill="url(#cellTrendGrid)"
              />
              <line
                className={styles.frontLine}
                x1={frontX}
                y1={box.y0 - 20}
                x2={frontX}
                y2={box.y1 + 20}
              />
            </g>
          ) : null}
          <path className={styles.surveyCasing} d={outline} />
          <path className={styles.surveyLine} d={outline} />
        </svg>
      ) : null}

      {/* Precision 4-hairline reticle on hover */}
      {hoverInfo && view !== "globe" ? (
        <div
          className={styles.reticle}
          style={{ left: hoverInfo.x, top: hoverInfo.y }}
          aria-hidden="true"
        >
          <span className={styles.reticleTickN} />
          <span className={styles.reticleTickS} />
          <span className={styles.reticleTickE} />
          <span className={styles.reticleTickW} />
          <div className={styles.reticleReadout}>
            <span>
              {hoverInfo.lat} · {hoverInfo.lon} · {hoverInfo.elev}
            </span>
            <span>{hoverInfo.band}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
});

function applyDirectionPalette(m: maplibregl.Map, dir: DirectionId): void {
  const pal = directionPalettes[dir];
  if (m.getLayer("paper")) m.setPaintProperty("paper", "background-color", pal.paper);
  if (m.getLayer("imagery")) {
    m.setPaintProperty("imagery", "raster-saturation", pal.imagerySaturation);
    m.setPaintProperty("imagery", "raster-brightness-min", pal.imageryBrightnessMin);
    m.setPaintProperty("imagery", "raster-brightness-max", pal.imageryBrightnessMax);
    m.setPaintProperty("imagery", "raster-contrast", pal.imageryContrast);
  }
  if (m.getLayer("relief")) {
    m.setPaintProperty("relief", "hillshade-shadow-color", pal.hillshadeShadow);
    m.setPaintProperty("relief", "hillshade-highlight-color", pal.hillshadeHighlight);
    m.setPaintProperty("relief", "hillshade-accent-color", pal.hillshadeAccent);
  }
  if (m.getLayer("light-pool")) m.setPaintProperty("light-pool", "fill-color", pal.pool);
  if (m.getLayer("outside-veil")) {
    m.setPaintProperty("outside-veil", "fill-color", pal.outsideVeil);
    m.setPaintProperty("outside-veil", "fill-opacity", pal.outsideVeilOpacity);
  }
  if (m.getLayer("catchment-casing"))
    m.setPaintProperty("catchment-casing", "line-color", pal.outlineCasing);
  if (m.getLayer("catchment-line")) m.setPaintProperty("catchment-line", "line-color", pal.outline);
  if (m.getLayer("outlet-beam"))
    m.setPaintProperty("outlet-beam", "fill-extrusion-color", pal.accent);
  const hazeSrc = m.getSource<maplibregl.ImageSource>("haze");
  if (hazeSrc) hazeSrc.updateImage({ url: drawHaze(pal.paper), coordinates: hazeCorners() });
  if (m.getTerrain()) m.terrain.tileManager.releaseAllRTT();
  m.triggerRepaint();
}

function applySelection(m: maplibregl.Map, selection: "none" | "proposed" | "set"): void {
  const line = selection === "set" ? 1 : 0;
  for (const id of ["catchment-casing", "catchment-line"])
    if (m.getLayer(id)) m.setPaintProperty(id, "line-opacity", line);
  if (m.getLayer("outside-veil"))
    m.setLayoutProperty("outside-veil", "visibility", selection === "set" ? "visible" : "none");
  m.setPaintProperty("light-pool", "fill-opacity", selection === "none" ? 0 : 1);
  if (m.getLayer("outlet-beam"))
    m.setPaintProperty("outlet-beam", "fill-extrusion-opacity", selection === "set" ? 0.92 : 0);
}

export function landPoint(
  m: maplibregl.Map,
  at: [number, number],
  liftM = LIFT_M,
): { x: number; y: number } | undefined {
  const tr = m._camera.transform;
  const canvas = m.getCanvas();
  const ground = m.getTerrain() ? (m.queryTerrainElevation(at) ?? 0) + liftM : 0;
  return projectAt(
    tr.modelViewProjectionMatrix,
    tr.worldSize,
    at[0],
    at[1],
    ground,
    canvas.clientWidth,
    canvas.clientHeight,
  );
}

function beforeOutline(m: maplibregl.Map): string | undefined {
  return m.getLayer("catchment-casing") ? "catchment-casing" : undefined;
}

function addProtoLayers(m: maplibregl.Map, f: ProtoMapProps["fixture"], dir: DirectionId): void {
  const before = beforeOutline(m);
  const pal = directionPalettes[dir];
  m.addSource("proto-departure", {
    type: "image",
    url: pictureUrl("period_2022-06"),
    coordinates: f.pictureCorners,
  });
  m.addLayer(
    {
      id: "proto-departure",
      type: "raster",
      source: "proto-departure",
      paint: {
        "raster-opacity": 0,
        "raster-resampling": "nearest",
        "raster-fade-duration": 0,
        "raster-opacity-transition": { duration: 0, delay: 0 },
      },
    },
    before,
  );
  m.addSource("proto-rain", {
    type: "geojson",
    data: f.rainCells,
    promoteId: "cell_id",
  });
  m.addLayer(
    {
      id: "proto-rain-fill",
      type: "fill",
      source: "proto-rain",
      paint: {
        "fill-color": [
          "case",
          ["==", ["feature-state", "mm"], null],
          "transparent",
          ["<", ["feature-state", "mm"], RAIN_CLASSES[0].upTo],
          RAIN_CLASSES[0].color,
          ["<", ["feature-state", "mm"], RAIN_CLASSES[1].upTo],
          RAIN_CLASSES[1].color,
          RAIN_CLASSES[2].color,
        ],
        "fill-opacity": 0,
        "fill-opacity-transition": { duration: 0, delay: 0 },
      },
    },
    before,
  );
  m.addLayer(
    {
      id: "proto-rain-line",
      type: "line",
      source: "proto-rain",
      paint: {
        "line-color": pal.rainLine,
        "line-width": 1.1,
        "line-opacity": 0,
        "line-opacity-transition": { duration: 0, delay: 0 },
      },
    },
    before,
  );
  const ratio = Math.max(1, Math.round(window.devicePixelRatio));
  const hatch = hatchTile(daylight.excludedHatch, daylight.outlineCasing, ratio);
  m.addImage(
    "proto-hatch",
    { width: hatch.width, height: hatch.height, data: hatch.data },
    { pixelRatio: hatch.pixelRatio },
  );
  m.addSource("proto-cropland", { type: "geojson", data: CROPLAND_URL });
  m.addLayer(
    {
      id: "proto-cropland",
      type: "fill",
      source: "proto-cropland",
      paint: {
        "fill-pattern": "proto-hatch",
        "fill-opacity": 0,
        "fill-opacity-transition": { duration: 0, delay: 0 },
      },
    },
    before,
  );
  m.addSource("proto-mark", {
    type: "geojson",
    data: {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: centroidOf(f.catchment) },
    },
  });
  m.addLayer({
    id: "proto-mark",
    type: "circle",
    source: "proto-mark",
    maxzoom: 6,
    paint: {
      "circle-radius": 8,
      "circle-color": "transparent",
      "circle-stroke-color": pal.accent,
      "circle-stroke-width": 2,
    },
  });
}

let fadeRaf = 0;

function setLayer(
  m: maplibregl.Map,
  layer: MapLayer,
  f: ProtoMapProps["fixture"],
  dir: DirectionId,
): void {
  const pal = directionPalettes[dir];
  const isDryPulse =
    (layer.kind === "greenness" || layer.kind === "pixeltrend" || layer.kind === "rain") &&
    layer.dryPulse === true;
  if (m.getLayer("proto-rain-line")) {
    m.setPaintProperty(
      "proto-rain-line",
      "line-color",
      isDryPulse ? pal.rainDryPulse : pal.rainLine,
    );
    m.setPaintProperty("proto-rain-line", "line-width", isDryPulse ? 2.2 : 1.0);
  }
  const target = {
    "proto-departure": layer.kind === "greenness" || layer.kind === "pixeltrend" ? 0.88 : 0,
    "proto-rain-fill": layer.kind === "rain" && layer.values ? 0.62 : 0,
    "proto-rain-line":
      layer.kind === "rain" || isDryPulse
        ? 0.95
        : (layer.kind === "greenness" ||
              layer.kind === "pixeltrend" ||
              layer.kind === "cropland") &&
            layer.rainOutline
          ? 0.52
          : 0,
    "proto-cropland": layer.kind === "cropland" ? 1 : 0,
  } as const;
  const prop = {
    "proto-departure": "raster-opacity",
    "proto-rain-fill": "fill-opacity",
    "proto-rain-line": "line-opacity",
    "proto-cropland": "fill-opacity",
  } as const;
  if (layer.kind === "greenness") {
    const src = m.getSource<maplibregl.ImageSource>("proto-departure");
    const url = pictureUrl(layer.periodId);
    if (src && src.url !== url) src.updateImage({ url, coordinates: f.pictureCorners });
  }
  if (layer.kind === "pixeltrend") {
    const src = m.getSource<maplibregl.ImageSource>("proto-departure");
    const stepNum = layer.step ? Math.max(1, Math.min(16, Math.round(layer.step))) : 16;
    const url =
      layer.window === "jun_sep"
        ? "/map/pixel-trend/overview-jun_sep.png"
        : stepNum < 16
          ? `/map/pixel-trend/frames/reveal-step-${String(stepNum).padStart(2, "0")}.png`
          : "/map/pixel-trend/overview.png";
    if (src && src.url !== url) src.updateImage({ url, coordinates: f.pictureCorners });
  }
  if (layer.kind === "rain") {
    for (const c of f.rainCells.features) {
      const mm = layer.values?.[c.properties.cell_id];
      m.setFeatureState({ source: "proto-rain", id: c.properties.cell_id }, { mm: mm ?? null });
    }
  }
  const ids = Object.keys(target) as (keyof typeof target)[];
  const from = Object.fromEntries(
    ids.map((id) => [id, (m.getPaintProperty(id, prop[id]) as number | undefined) ?? 0]),
  ) as Record<keyof typeof target, number>;
  cancelAnimationFrame(fadeRaf);
  const ms = reduced() ? 0 : 260;
  const t0 = performance.now();
  const step = () => {
    const k = ms === 0 ? 1 : Math.min(1, (performance.now() - t0) / ms);
    for (const id of ids) m.setPaintProperty(id, prop[id], from[id] + (target[id] - from[id]) * k);
    if (m.getTerrain()) m.terrain.tileManager.releaseAllRTT();
    m.triggerRepaint();
    if (k < 1) fadeRaf = requestAnimationFrame(step);
  };
  step();
  m.once("sourcedata", () => {
    if (m.getTerrain()) m.terrain.tileManager.releaseAllRTT();
    m.triggerRepaint();
  });
}
