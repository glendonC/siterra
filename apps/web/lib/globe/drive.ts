// The dive drives the MapLibre valley with the same camera the globe uses, so the cross-fade shows one
// place from one viewpoint in two renderers.

import { orbitToMapCamera, type MapCamera } from "../stage/camera";
import type { View } from "./views";

export function viewToMapCamera(v: View, viewportHeightPx: number): MapCamera {
  return orbitToMapCamera(
    {
      target: { lon: v.lon, lat: v.lat },
      targetHeightM: v.tz * 1000,
      cameraBearingFromTargetDeg: v.bearing,
      elevationDeg: v.pitch,
      distanceM: v.distance * 1000,
      verticalFovDeg: v.fov,
    },
    viewportHeightPx,
  );
}
