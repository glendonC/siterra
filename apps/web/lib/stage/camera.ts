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
