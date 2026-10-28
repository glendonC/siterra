// Converts an orbit pose (a target on the land, the camera's direction and distance from it) into the
// camera options a MapLibre map takes. Pure arithmetic: no map instance, so it can be tested alone.

/** Web Mercator earth circumference in metres at the equator, the constant MapLibre uses. */
export const EARTH_CIRCUMFERENCE_M = 40075016.685578488;

/** MapLibre's world size at zoom 0 in CSS pixels (512 px tiles). */
const TILE_SIZE_PX = 512;

export interface OrbitPose {
  /** Point the camera looks at. */
  target: { lon: number; lat: number };
  /** Height of the target in metres, in the same exaggerated frame the terrain is drawn in. */
  targetHeightM: number;
  /** Compass bearing from the target to the camera, degrees clockwise from north. */
  cameraBearingFromTargetDeg: number;
  /** Camera height angle above the horizontal, seen from the target. */
  elevationDeg: number;
  /** Straight-line distance from the target to the camera, metres. */
  distanceM: number;
  /** Vertical field of view, degrees. */
  verticalFovDeg: number;
}

export interface MapCamera {
  center: [number, number];
  /**
   * Centre height in metres in the exaggerated frame: MapLibre's `elevation` camera option, whose terrain
   * heights include the exaggeration (maplibre-gl 6.14.0 src/render/terrain.ts).
   */
  elevation: number;
  zoom: number;
  pitch: number;
  bearing: number;
  verticalFovDeg: number;
}

/** Normalizes a bearing into the range (-180, 180]. */
export function normalizeBearing(deg: number): number {
  const b = ((deg % 360) + 360) % 360;
  return b > 180 ? b - 360 : b;
}

/**
 * Camera options for a viewport of the given CSS height. The camera looks from its position toward the
 * target, so the map bearing is the opposite of the bearing from the target to the camera, and the pitch
 * is measured from straight down.
 */
export function orbitToMapCamera(pose: OrbitPose, viewportHeightPx: number): MapCamera {
  if (viewportHeightPx <= 0) throw new RangeError("viewportHeightPx must be positive");
  const halfFov = (pose.verticalFovDeg * Math.PI) / 360;
  const cameraToCenterPx = viewportHeightPx / 2 / Math.tan(halfFov);
  const cosLat = Math.cos((pose.target.lat * Math.PI) / 180);
  const worldSizePx = (cameraToCenterPx * EARTH_CIRCUMFERENCE_M * cosLat) / pose.distanceM;
  return {
    center: [pose.target.lon, pose.target.lat],
    elevation: pose.targetHeightM,
    zoom: Math.log2(worldSizePx / TILE_SIZE_PX),
    pitch: 90 - pose.elevationDeg,
    bearing: normalizeBearing(pose.cameraBearingFromTargetDeg + 180),
    verticalFovDeg: pose.verticalFovDeg,
  };
}

/** Aspect ratio of the approved frames (2560 x 1440). */
export const APPROVED_ASPECT = 16 / 9;

/** Oblique camera limits after arrival settle (scenes.md, design language 1.3). */
export const OBLIQUE_MIN_PITCH = 25;
export const OBLIQUE_MAX_PITCH = 60;
export const MAX_ORBIT_DELTA_DEG = 30;
export const MIN_VALLEY_ZOOM = 9.4;
export const MIN_CAMERA_DISTANCE_M = 2000;

/** Default valley asset extent (west, south, east, north) when bundle bounds are absent. */
export const VALLEY_ASSET_BOUNDS: [number, number, number, number] = [-6.71, 31.33, -5.98, 31.92];

/**
 * How much farther the camera stands on a screen narrower than the approved frames, so the land keeps the
 * approved side margins: the field of view is vertical, so a narrower screen would otherwise crop the sides.
 * 1 at 16:9 and wider.
 */
export function widthFitScale(widthPx: number, heightPx: number): number {
  if (widthPx <= 0 || heightPx <= 0) return 1;
  return Math.max(1, APPROVED_ASPECT / (widthPx / heightPx));
}

/** Maximum zoom corresponding to a minimum straight-line camera distance (about 2 km). */
export function maxZoomForDistance(
  pose: OrbitPose,
  viewportHeightPx: number,
  minDistanceM = MIN_CAMERA_DISTANCE_M,
): number {
  if (minDistanceM <= 0) throw new RangeError("minDistanceM must be positive");
  return orbitToMapCamera({ ...pose, distanceM: minDistanceM }, Math.max(1, viewportHeightPx)).zoom;
}

/** Clamps a compass bearing within `maxDeltaDeg` of `homeBearing` (shortest turn). */
export function clampBearing(
  bearing: number,
  homeBearing: number,
  maxDeltaDeg = MAX_ORBIT_DELTA_DEG,
): number {
  const delta = normalizeBearing(bearing - homeBearing);
  if (delta > maxDeltaDeg) return normalizeBearing(homeBearing + maxDeltaDeg);
  if (delta < -maxDeltaDeg) return normalizeBearing(homeBearing - maxDeltaDeg);
  return normalizeBearing(bearing);
}

/** Clamps pitch to 25..60 deg in oblique mode, or 0 deg in Flat Map View. */
export function clampPitch(pitch: number, flat: boolean): number {
  if (flat) return 0;
  return Math.min(OBLIQUE_MAX_PITCH, Math.max(OBLIQUE_MIN_PITCH, pitch));
}

/** Clamps zoom between the regional overview and the closest allowed distance. */
export function clampZoom(zoom: number, maxZoom: number, minZoom = MIN_VALLEY_ZOOM): number {
  return Math.min(maxZoom, Math.max(minZoom, zoom));
}

/** Clamps a [lon, lat] center point inside a [west, south, east, north] box. */
export function clampCenter(
  center: [number, number],
  bounds: [number, number, number, number] = VALLEY_ASSET_BOUNDS,
): [number, number] {
  const [w, s, e, n] = bounds;
  return [Math.min(e, Math.max(w, center[0])), Math.min(n, Math.max(s, center[1]))];
}

/** Expands a [west, south, east, north] box so oblique frustum corners fit inside MapLibre maxBounds. */
export function expandBounds(
  bounds: [number, number, number, number] = VALLEY_ASSET_BOUNDS,
  padDeg = 0.8,
): [[number, number], [number, number]] {
  const [w, s, e, n] = bounds;
  return [
    [w - padDeg, s - padDeg],
    [e + padDeg, n + padDeg],
  ];
}

/** True when the camera has moved noticeably away from the active step's pose. */
export function cameraMoved(
  current: Pick<MapCamera, "center" | "zoom" | "pitch" | "bearing">,
  target: Pick<MapCamera, "center" | "zoom" | "pitch" | "bearing">,
): boolean {
  return (
    Math.abs(current.center[0] - target.center[0]) > 1e-4 ||
    Math.abs(current.center[1] - target.center[1]) > 1e-4 ||
    Math.abs(current.zoom - target.zoom) > 1e-2 ||
    Math.abs(current.pitch - target.pitch) > 0.2 ||
    Math.abs(normalizeBearing(current.bearing - target.bearing)) > 0.2
  );
}
