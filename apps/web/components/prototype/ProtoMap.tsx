"use client";

// The full-bleed valley stage for /prototype, following Hero 1.3 (docs/reference/components.md,
// docs/reference/scenes.md, docs/reference/motion.md):
// - Daylight terrain running to every edge into paper haze
// - Crisp screen-space catchment line (4.2 px paper casing under 1.5 px ink line)
// - Ground labels in perspective on a thin paper halo
// - Thin catchment-cut sheets that lift and descend onto the land in 900 ms
// - 3D season stems beside the catchment around the 1991 to 2020 mean plane
// - Three elevation bands tinted with the cool shadow colour in the Field Plan beat
// - One 1 px ink leader line from the card to the active stem (3 px dot) or catchment line (12 px tick)

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { MapBundle } from "../../lib/map/bundle";
import { CROPLAND_URL, pictureUrl, type Fixture } from "../../lib/prototype/fixture";
import { protoCopy } from "../../lib/prototype/proto-copy";
import { ARRIVAL_EXAGGERATION, ARRIVAL_POSE, VALLEY_NAME_REFERENCE } from "../../lib/stage/arrival";
import { orbitToMapCamera, widthFitScale, type MapCamera } from "../../lib/stage/camera";
import { valleyStyle } from "../../lib/stage/daylight-style";
import { hatchTile } from "../../lib/stage/departure-layers";
import { easeInOut, flatCamera, mixCamera } from "../../lib/stage/flat";
import { groundCorners, screenReadingBearing, type LabelLine } from "../../lib/stage/ground-label";
import { drawHaze, hazeCorners } from "../../lib/stage/haze";
import { northEdgeAnchor, valleyNameAnchor } from "../../lib/stage/placement";
import { projectAt, quadMatrix3d } from "../../lib/stage/project";
import { smoothFeature } from "../../lib/stage/smooth";
import { daylight, directionPalettes, rainTotal, type DirectionId } from "../../lib/theme/daylight";
import { FlatFrame } from "../stage/FlatFrame";
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
  d: string;
  opacity: number;
  empty: boolean;
  eastPt: { x: number; y: number } | null;
}

interface GroundText {
  id: string;
  lines: LabelLine[];
  transform: string;
}

interface Leader {
  d: string;
  tick?: string;
  dot?: { x: number; y: number };
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
  /** True on Beat 1 (Arrival): draws the perspective valley name and study area labels on the ground. */
  showArrivalLabels?: boolean;
  /** True on Beat 3/5: draws the April/winter gap hatch callout on the upper band. */
  showGapLabel?: boolean;
  /** True on Beat 4 (The Record Answers): draws the 3D season stems around the 1991-2020 mean plane. */
  showSeasonStems?: boolean;
  /** True on Beat 6 (Field Plan): draws the 3 cool-shadow elevation bands and their ground labels. */
  showStrata?: boolean;
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
const SHEET_BASE_M = 580;
const SHEET_GAP_M = 1150;
const BOX_W = 1000;
const LINE_H = 83;
const PLANE_LIFT_M = 600;

/** 32 wet-season totals (1991/92 to 2022/23) in mm around the 562 mm mean, for the Hero 1.3 Season Stems. */
const WET_SEASON_TOTALS_MM: readonly number[] = [
  518, 462, 584, 412, 688, 595, 534, 488, 542, 389, 512, 576, 618, 495, 558, 472, 610, 712, 645,
  588, 524, 590, 548, 612, 405, 568, 622, 514, 478, 536, 650, 349,
];

/** Active season stem top in screen px (matches the 32nd stem in the Season Stems SVG). */
export const ACTIVE_SEASON_STEM_TOP = { x: 356, y: 663 } as const;

type Pt = { x: number; y: number };

const pathOf = (pts: Pt[]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("") + "Z";

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
  const elbow = { x: from.x - 28, y: from.y };
  return {
    d: `M${from.x.toFixed(1)} ${from.y.toFixed(1)}L${elbow.x.toFixed(1)} ${elbow.y.toFixed(1)}L${target.x.toFixed(1)} ${target.y.toFixed(1)}`,
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
  const dx = best.x - elbow.x;
  const dy = best.y - elbow.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 6;
  const ny = (dx / len) * 6;
  return {
    d: `M${from.x.toFixed(1)} ${from.y.toFixed(1)}L${elbow.x.toFixed(1)} ${elbow.y.toFixed(1)}L${best.x.toFixed(1)} ${best.y.toFixed(1)}`,
    tick: `M${(best.x - nx).toFixed(1)} ${(best.y - ny).toFixed(1)}L${(best.x + nx).toFixed(1)} ${(best.y + ny).toFixed(1)}`,
  };
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

function showDrapedLine(m: maplibregl.Map | null, show: boolean): void {
  if (!m?.isStyleLoaded()) return;
  for (const id of ["catchment-casing", "catchment-line"])
    if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", show ? "visible" : "none");
}

export const ProtoMap = forwardRef<ProtoMapHandle, ProtoMapProps>(function ProtoMap(
  {
    assets,
    fixture,
    view,
    direction = "2",
    layer,
    reading,
    frontProgress = null,
    showArrivalLabels = false,
    showGapLabel = false,
    showSeasonStems = false,
    showStrata = false,
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
  const [ground, setGround] = useState<GroundText[]>([]);
  const [strataPaths, setStrataPaths] = useState<{
    mid: string;
    low: string;
    upperPt: Pt | null;
    midPt: Pt | null;
    lowPt: Pt | null;
    floorPt: Pt | null;
    gapPt: Pt | null;
  }>({
    mid: "",
    low: "",
    upperPt: null,
    midPt: null,
    lowPt: null,
    floorPt: null,
    gapPt: null,
  });
  const [box, setBox] = useState<{ x0: number; x1: number; y0: number; y1: number } | null>(null);
  const [drawn, setDrawn] = useState<DrawnSheet[]>([]);
  const [leader, setLeader] = useState<Leader | null>(null);

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
    return home;
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
            ...flatCamera(bbox(fixture.catchment), canvas.clientWidth, canvas.clientHeight, 120),
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

    const valleyLines: LabelLine[] = [
      { text: protoCopy.valleyName, size: 0.4, weight: 500, tracking: 0.022 },
      { text: protoCopy.valleyRegion, size: 0.28, weight: 500 },
    ];
    const studyLines: LabelLine[] = [
      { text: protoCopy.studyAreaLabel, size: 0.33, weight: 500 },
      { text: protoCopy.studyAreaLimit, size: 0.22, weight: 500 },
    ];

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
      const readingBearing = screenReadingBearing(cam.bearing);
      const groundBlocks = [
        {
          id: "label-valley",
          lines: valleyLines,
          anchor: valleyNameAnchor(fixture.catchment, VALLEY_NAME_REFERENCE, {
            eastOfM: 2500,
            shiftM: { east: -2050, north: -2190 },
            readingBearingDeg: readingBearing,
          }),
        },
        {
          id: "label-study-area",
          lines: studyLines,
          anchor: northEdgeAnchor(fixture.catchment, { lonBand: [-6.45, -6.3], outM: 2400 }),
        },
      ].map((b) => {
        const widthM = 15000;
        const heightM = (widthM * LINE_H * b.lines.length) / BOX_W;
        return { ...b, heightM, corners: groundCorners({ ...b.anchor, widthM, heightM }) };
      });

      const t = assets.terrain.bounds;
      m = new maplibregl.Map({
        container,
        style: valleyStyle({
          assets: {
            ...assets,
            haze: { url: drawHaze(daylight.paper), coordinates: hazeCorners() },
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
        keyboard: false,
        dragRotate: true,
        pitchWithRotate: true,
        touchPitch: true,
      });
      m.setVerticalFieldOfView(cam.verticalFovDeg);
      m.jumpTo({ elevation: cam.elevation });
      mapRef.current = m;
      if (process.env.NODE_ENV !== "production")
        (window as unknown as { __proto?: maplibregl.Map }).__proto = m;

      m.once("load", () => {
        if (!m || !live) return;
        // Keep the approved Daylight Hero style by default; only apply dark palette when dir === "1"
        if (dirRef.current === "1") applyDirectionPalette(m, "1");
        else {
          m.setPaintProperty("light-pool", "fill-opacity", 1);
          if (m.getLayer("outlet-beam"))
            m.setPaintProperty("outlet-beam", "fill-extrusion-opacity", 0.9);
        }
        showDrapedLine(m, viewRef.current === "flat");
        addProtoLayers(m, fixture);

        let last = "";
        let lastSheets = "";
        let lastLeader = "";

        const place = () => {
          if (!m) return;
          onRenderRef.current?.(m);
          if (projectionType(m) === "globe" || viewRef.current === "globe") {
            return;
          }
          const tr = m._camera.transform;
          const canvas = m.getCanvas();
          const w = canvas.clientWidth;
          const h = canvas.clientHeight;
          const terrain = m.getTerrain() !== null;
          const groundElevs = rawRing.map(([lon, lat]) =>
            terrain ? (m?.queryTerrainElevation([lon, lat]) ?? 0) : 0,
          );
          const projectRing = (ringCoords: [number, number][], elev: (i: number) => number) => {
            const pts = ringCoords.map(([lon, lat], i) =>
              projectAt(tr.modelViewProjectionMatrix, tr.worldSize, lon, lat, elev(i), w, h),
            );
            return pts.every(Boolean) ? (pts as Pt[]) : null;
          };
          const projectCoord = (lon: number, lat: number, lift = LIFT_M + 40): Pt | null => {
            const g = terrain ? (m?.queryTerrainElevation([lon, lat]) ?? 0) + lift : 0;
            return projectAt(tr.modelViewProjectionMatrix, tr.worldSize, lon, lat, g, w, h) ?? null;
          };

          const placedGround = groundBlocks.flatMap((b) => {
            const elev =
              (terrain ? (m?.queryTerrainElevation([b.anchor.lon, b.anchor.lat]) ?? 0) : 0) +
              PLANE_LIFT_M;
            const q = b.corners.map(([lon, lat]) =>
              projectAt(
                tr.modelViewProjectionMatrix,
                t ? tr.worldSize : tr.worldSize,
                lon,
                lat,
                elev,
                w,
                h,
              ),
            );
            const [tl, trPt, br, bl] = q;
            if (!tl || !trPt || !br || !bl) return [];
            const transform = quadMatrix3d(BOX_W, LINE_H * b.lines.length, tl, trPt, br, bl);
            return [{ id: b.id, lines: b.lines, transform }];
          });

          const pts = projectRing(rawRing, (i) => (terrain ? (groundElevs[i] ?? 0) + LIFT_M : 0));
          const midPts = projectRing(midRing, (i) =>
            terrain ? (groundElevs[i] ?? 0) * 0.86 + LIFT_M : 0,
          );
          const lowPts = projectRing(lowRing, (i) =>
            terrain ? (groundElevs[i] ?? 0) * 0.72 + LIFT_M : 0,
          );

          const d = pts ? pathOf(pts) : "";
          const gKey = `${d}|${placedGround.map((g) => g.transform).join(",")}`;
          if (gKey !== last) {
            last = gKey;
            setOutline(d);
            setGround(placedGround);
            setStrataPaths({
              mid: midPts ? pathOf(midPts) : "",
              low: lowPts ? pathOf(lowPts) : "",
              upperPt: projectCoord(-6.345, 31.69, 120),
              midPt: projectCoord(-6.365, 31.662, 100),
              lowPt: projectCoord(-6.385, 31.642, 80),
              floorPt: projectCoord(-6.36, 31.612, 40),
              gapPt: projectCoord(-6.33, 31.618, 40),
            });
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

          // Hero 1.3 plan sheets cut to the catchment outline, labelled at their east edge
          const top = Math.max(...groundElevs, 1800);
          const list = (sheetsRef.current ?? []).filter((s) => s.opacity > 0.001);
          const next: DrawnSheet[] = list.flatMap((s, i) => {
            const plane = top + SHEET_BASE_M + SHEET_GAP_M * (list.length - 1 - i);
            const sp = projectRing(rawRing, (k) => {
              const g = groundElevs[k] ?? 0;
              return terrain ? g + LIFT_M + (plane - g) * s.height : 0;
            });
            if (!sp) return [];
            const east = sp.reduce((a, b) => (b.x > a.x ? b : a));
            return [
              {
                id: s.id,
                n: s.n,
                label: s.label,
                d: pathOf(sp),
                opacity: s.opacity,
                empty: s.empty === true,
                eastPt: east,
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
          const lk = ld
            ? `${ld.d}|${ld.tick ?? ""}|${ld.dot ? `${ld.dot.x},${ld.dot.y}` : ""}`
            : "";
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
    if (direction === "1") {
      applyDirectionPalette(m, "1");
    } else {
      applyDirectionPalette(m, "2");
      m.setPaintProperty("outside-veil", "fill-opacity", 0.82);
      m.setPaintProperty("light-pool", "fill-color", daylight.pool);
      m.setPaintProperty("light-pool", "fill-opacity", 1);
    }
  }, [direction, ready]);

  const firstViewSync = useRef(true);

  // Camera stays still at the approved arrival pose during the valley beats; F moves to the flat reading
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
    showDrapedLine(m, view === "flat");
    if (view === "flat") {
      const to = {
        ...flatCamera(bbox(fixture.catchment), canvas.clientWidth, canvas.clientHeight, 120),
        verticalFovDeg: home.verticalFovDeg,
      };
      if (isInitial) {
        m.jumpTo(to);
        m.setTerrain(null);
        reliefRef.current = 0;
        placeRef.current();
      } else {
        move(to, 0);
      }
      return;
    }
    if (isInitial) {
      m.jumpTo(home);
      m.setTerrain({ source: "terrain", exaggeration: ARRIVAL_EXAGGERATION });
      reliefRef.current = ARRIVAL_EXAGGERATION;
      placeRef.current();
    } else {
      move(home, ARRIVAL_EXAGGERATION);
    }
  }, [view, ready, fixture]);

  useEffect(() => {
    const m = mapRef.current;
    if (m && ready) applySelection(m, selection, view === "flat");
  }, [selection, view, ready]);

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

  const oblique = view !== "flat" && view !== "globe";

  return (
    <div className={styles.stage} data-ready={ready ? "true" : "false"} data-view={view}>
      <div ref={el} className={styles.map} aria-hidden="true" />

      {/* Beat 6 (Field Plan): three elevation bands as tints of the shadow colour + thin contour limits */}
      {showStrata && outline && strataPaths.mid && strataPaths.low && oblique ? (
        <svg className={styles.strataOverlay} aria-hidden="true">
          <path className={styles.stratumBandHigh} d={outline} />
          <path className={styles.stratumBandMid} d={strataPaths.mid} />
          <path className={styles.stratumBandLow} d={strataPaths.low} />
          <path className={styles.stratumLimit} d={strataPaths.mid} />
          <path className={styles.stratumLimit} d={strataPaths.low} />
        </svg>
      ) : null}

      {/* Crisp screen-space catchment outline above the ridge crest (4.2 px paper casing under 1.5 px ink) */}
      {outline && oblique ? (
        <svg className={styles.outline} aria-hidden="true">
          <path className={styles.outlineCasing} d={outline} />
          <path className={styles.outlineInk} d={outline} />
        </svg>
      ) : null}

      {/* Beat 1 (Arrival): perspective ground labels ("Aït Bouguemez valley" & "Valley catchment: 417.0 km²") */}
      {showArrivalLabels && oblique
        ? ground.map((g) => (
            <div
              key={g.id}
              className={styles.groundText}
              style={{
                width: BOX_W,
                height: LINE_H * g.lines.length,
                transform: g.transform,
              }}
              aria-hidden="true"
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
          ))
        : null}

      {/* Beat 6 (Field Plan): band labels on the ground on a paper halo */}
      {showStrata && oblique ? (
        <div className={styles.bandLabels} aria-hidden="true">
          {strataPaths.lowPt ? (
            <span
              className={styles.bandLabel}
              style={{
                left: strataPaths.lowPt.x,
                top: strataPaths.lowPt.y,
                transform: "translate(-50%, -50%) rotate(15deg)",
              }}
            >
              {protoCopy.bandLowerLabel}
            </span>
          ) : null}
          {strataPaths.midPt ? (
            <span
              className={styles.bandLabel}
              style={{
                left: strataPaths.midPt.x,
                top: strataPaths.midPt.y,
                transform: "translate(-50%, -50%) rotate(15deg)",
              }}
            >
              {protoCopy.bandMiddleLabel}
            </span>
          ) : null}
          {strataPaths.upperPt ? (
            <span
              className={styles.bandLabel}
              style={{
                left: strataPaths.upperPt.x,
                top: strataPaths.upperPt.y,
                transform: "translate(-50%, -50%) rotate(15deg)",
              }}
            >
              {protoCopy.bandUpperLabel}
            </span>
          ) : null}
          {strataPaths.floorPt ? (
            <span
              className={styles.excludedLabel}
              style={{
                left: strataPaths.floorPt.x,
                top: strataPaths.floorPt.y + 42,
              }}
            >
              <i className={styles.hatchSwatch} />
              {protoCopy.excludedFloorLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Beat 3 / 5: Gap hatch reason on the land */}
      {showGapLabel && strataPaths.gapPt && oblique ? (
        <span
          className={styles.gapLabel}
          style={{
            left: strataPaths.gapPt.x,
            top: strataPaths.gapPt.y,
          }}
          aria-hidden="true"
        >
          <i className={styles.gapSwatch} />
          {protoCopy.gapHatchLabel}
        </span>
      ) : null}

      {/* Beat 2 (Work): thin catchment-cut sheets labelled at their east edge */}
      {drawn.length && oblique ? (
        <svg className={styles.sheets} aria-hidden="true">
          {(() => {
            let prevY = 180;
            return drawn.map((s, idx) => {
              const anchor = s.eastPt;
              const rawY = anchor ? anchor.y - 36 - idx * 6 : 210 + idx * 34;
              const labelY = Math.max(rawY, prevY + 30);
              prevY = labelY;
              const labelX = anchor ? Math.min(anchor.x - 160, 740) : 700;
              return (
                <g key={s.id} style={{ opacity: s.opacity }}>
                  <path className={styles.sheet} data-empty={s.empty ? "true" : "false"} d={s.d} />
                  {anchor ? (
                    <g className={styles.sheetLabel}>
                      <circle cx={anchor.x} cy={anchor.y} r={2} />
                      <line x1={anchor.x} y1={anchor.y} x2={labelX + 12} y2={labelY + 8} />
                      <text x={labelX} y={labelY} dominantBaseline="middle">
                        <tspan className={styles.sheetN}>{s.n}</tspan>
                        <tspan dx="8" className={styles.sheetTitle}>
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

      {/* Beat 4 (Dry-year challenge / The Record Answers): 3D Season Stems beside the catchment */}
      {showSeasonStems && oblique ? (
        <svg className={styles.seasonStemsSvg} aria-hidden="true">
          {/* Oblique reference plane at the 1991 to 2020 mean (562 mm) */}
          <polygon className={styles.seasonPlane} points="52,616 364,616 352,650 40,650" />
          {/* Near-normal slab (509 to 603 mm) */}
          <polygon className={styles.seasonSlab} points="48,622 360,622 356,642 44,642" />
          {/* Mean line (1.2 px) */}
          <line className={styles.seasonMeanLine} x1="46" y1="633" x2="362" y2="633" />
          {/* Base zero line */}
          <line className={styles.seasonBaseLine} x1="34" y1="704" x2="350" y2="704" />

          {/* 32 wet season stems (1991/92 to 2022/23) */}
          {WET_SEASON_TOTALS_MM.map((mm, idx) => {
            const baseX = 42 + idx * 9.8;
            const baseY = 704;
            const h = Math.round((mm / 650) * 82);
            const topX = baseX + Math.round((h / 82) * 6);
            const topY = baseY - h;
            const meanX = baseX + Math.round(((704 - 633) / 82) * 6);
            const isPrev = idx === WET_SEASON_TOTALS_MM.length - 2; // 2021/22: 650 mm
            const isOnShow = idx === WET_SEASON_TOTALS_MM.length - 1; // 2022/23: 349 mm
            return (
              <g key={idx} data-role={isOnShow ? "on-show" : isPrev ? "recent" : "stem"}>
                <line className={styles.seasonStemLine} x1={baseX} y1={baseY} x2={topX} y2={topY} />
                {/* Small cross-tick at the mean plane */}
                <line
                  className={styles.seasonMeanTick}
                  x1={meanX - 2}
                  y1={633}
                  x2={meanX + 2}
                  y2={633}
                />
                <circle
                  className={styles.seasonStemDot}
                  cx={topX}
                  cy={topY}
                  r={isOnShow ? 2.8 : isPrev ? 2.2 : 1.6}
                />
              </g>
            );
          })}

          {/* Mono 11/16 labels beside their stem or line */}
          <text x="366" y="618" className={styles.seasonMonoLabel}>
            {protoCopy.stemsPrevious}
          </text>
          <text x="368" y="632" className={styles.seasonMonoLabel}>
            {protoCopy.stemsBand}
          </text>
          <text x="368" y="646" className={styles.seasonMonoLabel}>
            {protoCopy.stemsMean}
          </text>
          <text x="366" y="666" className={styles.seasonAccentLabel}>
            {protoCopy.stemsOnShow}
          </text>
          <text x="48" y="722" className={styles.seasonMonoLabel}>
            {protoCopy.stemsCaption}
          </text>
        </svg>
      ) : null}

      {/* Measurement front across the catchment (Work beat) */}
      {(reading || frontX !== null) && outline && box && oblique ? (
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
          </defs>
          {reading ? (
            <path className={styles.surveyFill} d={outline} mask="url(#sweepMask)" />
          ) : null}
          {frontX !== null ? (
            <g clipPath="url(#catchmentClip)">
              <line
                className={styles.frontLine}
                x1={frontX}
                y1={box.y0 - 20}
                x2={frontX}
                y2={box.y1 + 20}
              />
            </g>
          ) : null}
        </svg>
      ) : null}

      {/* The ONE Leader Line (1 px ink at 70%): ends in a 3 px dot on a stem or a 12 px tick on the catchment */}
      {leader && oblique ? (
        <svg className={styles.leader} aria-hidden="true">
          <path className={styles.leaderLine} d={leader.d} />
          {leader.tick ? <path className={styles.leaderTick} d={leader.tick} /> : null}
          {leader.dot ? (
            <circle className={styles.leaderDot} cx={leader.dot.x} cy={leader.dot.y} r={3} />
          ) : null}
        </svg>
      ) : null}

      {/* Flat reading frame (MOT-12): graticule ticks at frame edges and scale bar */}
      {view === "flat" && mapRef.current ? <FlatFrame map={mapRef.current} /> : null}
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

function applySelection(
  m: maplibregl.Map,
  selection: "none" | "proposed" | "set",
  isFlat: boolean,
): void {
  const line = selection === "set" && isFlat ? 1 : 0;
  for (const id of ["catchment-casing", "catchment-line"])
    if (m.getLayer(id)) m.setPaintProperty(id, "line-opacity", line);
  if (m.getLayer("outside-veil"))
    m.setLayoutProperty("outside-veil", "visibility", selection === "set" ? "visible" : "none");
  m.setPaintProperty("light-pool", "fill-opacity", selection === "none" ? 0 : 1);
  if (m.getLayer("outlet-beam"))
    m.setPaintProperty("outlet-beam", "fill-extrusion-opacity", selection === "set" ? 0.9 : 0);
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

function addProtoLayers(m: maplibregl.Map, f: ProtoMapProps["fixture"]): void {
  const before = beforeOutline(m);
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
        "line-color": daylight.rainLine,
        "line-width": 1.0,
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
}

let fadeRaf = 0;

function setLayer(
  m: maplibregl.Map,
  layer: MapLayer,
  f: ProtoMapProps["fixture"],
  _dir: DirectionId,
): void {
  const target = {
    "proto-departure": layer.kind === "greenness" || layer.kind === "pixeltrend" ? 0.9 : 0,
    "proto-rain-fill": layer.kind === "rain" && layer.values ? 0.6 : 0,
    "proto-rain-line":
      layer.kind === "rain"
        ? 0.85
        : (layer.kind === "greenness" ||
              layer.kind === "pixeltrend" ||
              layer.kind === "cropland") &&
            layer.rainOutline
          ? 0.5
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
  const ms = reduced() ? 0 : 220;
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
