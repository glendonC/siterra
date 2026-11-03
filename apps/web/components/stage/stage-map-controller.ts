import * as maplibregl from "maplibre-gl";
import type { BudgetLine } from "../../lib/budget/measure";
import { en, format, isHonesty, type MessageId } from "../../lib/copy/en";
import type { LandPoint } from "../../lib/projection/places";
import { ARRIVAL_POSE, VALLEY_NAME_REFERENCE } from "../../lib/stage/arrival";
import { viewerSession } from "../../lib/shell/preferences";
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
  widthFitScale,
  type MapCamera,
} from "../../lib/stage/camera";
import { flatCamera } from "../../lib/stage/flat";
import type { Feature, Position } from "../../lib/stage/geo";
import { groundCorners, screenReadingBearing, type LabelLine } from "../../lib/stage/ground-label";
import { northEdgeAnchor, valleyNameAnchor } from "../../lib/stage/placement";
import { projectAt, quadMatrix3d } from "../../lib/stage/project";
import { regionalCamera } from "../../lib/stage/settle";

// MapLibre 6 is ESM-only; under Next.js and Turbopack its worker must be named by URL.
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl(
    new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
  );
}

/**
 * Contour tiles from the terrain tiles, generated in the browser by maplibre-contour (one shared DEM source per
 * terrain template, registered with MapLibre once). 100 m lines, every fifth (500 m) as an index line.
 */
const contourSources = new Map<string, string>();

export async function contourTiles(terrainTiles: string, maxzoom: number): Promise<string> {
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
    // 512 px terrain tiles: build each contour tile from one quadrant of the tile a zoom above.
    overzoom: 1,
  });
  contourSources.set(terrainTiles, url);
  return url;
}

/** Interface sans for names on the ground; must match the family the app loads. */
export const LABEL_FAMILY = '"IBM Plex Sans Variable", "IBM Plex Sans", sans-serif';

export type StageViewMode = "oblique" | "toFlat" | "flat" | "toOblique";
export type SettleState = "waiting" | "moving" | "done";

export interface Stem {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface GroundText {
  id: string;
  lines: LabelLine[];
  budget: BudgetLine[];
  /** CSS transform that lays the text box on its plane above the land. */
  transform: string;
}

export interface GroundBlockSpec {
  id: string;
  lines: LabelLine[];
  budget: BudgetLine[];
  anchor: { lon: number; lat: number };
  heightM: number;
  corners: readonly (readonly [number, number])[];
}

/** The outline at arrival rides this far above the land: 30 m on the crest, at the view's 2x relief. */
export const OUTLINE_LIFT_M = 60;

/** The text box the transform maps onto the land: CSS px, wide enough for the ground names. */
export const BOX_W = 1000;
export const LINE_H = 83;
/** The plane the names lie on: this far above the land at the name's anchor (0.6 km). */
export const PLANE_LIFT_M = 600;

export function outerRing(f: Feature): Position[] | undefined {
  const g = f.geometry;
  return g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0]?.[0];
}

/** The style's draped outline, shown in the dive and hidden while the crisp outline is drawn. */
export function showDrapedLine(m: maplibregl.Map | null, show: boolean): void {
  if (!m?.isStyleLoaded()) return;
  const want = show ? "visible" : "none";
  for (const id of ["catchment-casing", "catchment-line"])
    if (m.getLayer(id) && m.getLayoutProperty(id, "visibility") !== want)
      m.setLayoutProperty(id, "visibility", want);
}

export function stepFlatCamera(m: maplibregl.Map, catchment: Feature, home: MapCamera): MapCamera {
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

export function syncInteractive(
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

export function buildGroundLabelBlocks(params: {
  catchment: Feature;
  camBearing: number;
  valleyName: string;
  regionName: string;
  areaLabel: string;
  areaKm2: string;
}): GroundBlockSpec[] {
  const { catchment, camBearing, valleyName, regionName, areaLabel, areaKm2 } = params;
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
    {
      text: format("arrival.studyArea", { label: areaLabel, area: areaKm2 }),
      size: 0.33,
      weight: 500,
    },
    { text: en["arrival.studyAreaLimit"].text, size: 0.22, weight: 500 },
  ];
  const budgetLines = (ids: MessageId[], texts: LabelLine[]): BudgetLine[] =>
    texts.map((t, i) => {
      const id = ids[i];
      return { text: t.text, honesty: id ? isHonesty(id) : false };
    });

  const reading = screenReadingBearing(camBearing);
  return [
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
}

export function projectStageOverlays(params: {
  map: maplibregl.Map;
  blocks: readonly GroundBlockSpec[];
  ring: readonly Position[];
  outlineKind: "watershed" | "drainage_within_box" | "land_within_box" | "box";
  outlet: LandPoint | undefined;
  places: readonly LandPoint[];
}): {
  placedGround: GroundText[];
  allVisible: boolean;
  nextOutline: string;
  nextStems: Stem[];
  outlinePoints: { x: number; y: number }[];
} {
  const { map: m, blocks, ring, outlineKind, outlet, places } = params;
  const at = (lon: number, lat: number) => {
    const p = m.project([lon, lat]);
    return { x: p.x, y: p.y };
  };
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
  const nextOutline = allVisible
    ? pts
        .map((p, i) => `${i ? "L" : "M"}${(p?.x ?? 0).toFixed(1)} ${(p?.y ?? 0).toFixed(1)}`)
        .join("") + "Z"
    : "";
  const o = outlineKind === "watershed" ? outlet : undefined;
  const nextStems: Stem[] = [
    ...(o ? [{ id: "outlet", name: en["arrival.outlet"].text, ...at(o.lon, o.lat) }] : []),
    ...places.map((p) => ({ id: p.id, name: p.name, ...at(p.lon, p.lat) })),
  ];
  const outlinePoints = pts.flatMap((p) => (p ? [{ x: p.x, y: p.y }] : []));
  return {
    placedGround,
    allVisible,
    nextOutline,
    nextStems,
    outlinePoints,
  };
}

export function clampAndSyncUserCameraMove(params: {
  map: maplibregl.Map;
  homeCam: MapCamera;
  catchment: Feature;
  bounds: [number, number, number, number];
  flatMode: boolean;
  setClamping: (clamping: boolean) => void;
}): {
  nextCam: MapCamera;
  isMoved: boolean;
} {
  const { map: m, homeCam, catchment, bounds, flatMode, setClamping } = params;
  const c = m.getCenter();
  const z = m.getZoom();
  const p = m.getPitch();
  const b = m.getBearing();
  const maxZ = maxZoomForDistance(ARRIVAL_POSE, m.getCanvas().clientHeight || 810);
  const nextCenter = clampCenter([c.lng, c.lat], bounds);
  const nextZoom = clampZoom(z, maxZ);
  const nextPitch = clampPitch(p, flatMode);
  const nextBearing = flatMode ? 0 : clampBearing(b, homeCam.bearing);
  if (
    Math.abs(nextCenter[0] - c.lng) > 1e-5 ||
    Math.abs(nextCenter[1] - c.lat) > 1e-5 ||
    Math.abs(nextZoom - z) > 1e-4 ||
    Math.abs(nextPitch - p) > 1e-3 ||
    Math.abs(normalizeBearing(nextBearing - b)) > 1e-3
  ) {
    setClamping(true);
    m.jumpTo({
      center: nextCenter,
      zoom: nextZoom,
      pitch: nextPitch,
      bearing: nextBearing,
      elevation: m.getCenterElevation(),
    });
    setClamping(false);
  }
  const nextCam: MapCamera = {
    center: nextCenter,
    elevation: m.getCenterElevation(),
    zoom: nextZoom,
    pitch: nextPitch,
    bearing: nextBearing,
    verticalFovDeg: homeCam.verticalFovDeg,
  };
  const target = flatMode ? stepFlatCamera(m, catchment, homeCam) : homeCam;
  const isMoved = cameraMoved(nextCam, target);
  return { nextCam, isMoved };
}

export async function waitForContainerHeight(el: HTMLElement): Promise<void> {
  if (el.clientHeight > 0) return;
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

export function resolveInitialStageCameras(
  el: HTMLElement,
  settleKey: string | undefined,
): { cam: MapCamera; start: MapCamera } {
  const cam = orbitToMapCamera(
    {
      ...ARRIVAL_POSE,
      distanceM: ARRIVAL_POSE.distanceM * widthFitScale(el.clientWidth, el.clientHeight),
    },
    el.clientHeight,
  );
  const settledInTab = (() => {
    try {
      return !settleKey || viewerSession()?.getItem(settleKey) === "1";
    } catch {
      return true;
    }
  })();
  const reducedSettle = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = settledInTab || reducedSettle ? cam : regionalCamera(cam);
  return { cam, start };
}
