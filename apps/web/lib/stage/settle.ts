// MOT-01 arrival settle: on a first visit with no saved camera, the camera starts at the regional view
// over the valley and moves once to the valley view, so the reader sees where the valley sits in the range
// and its relief. The hero sequence's dive replaces it. Pure arithmetic; the stage moves the map.
//
// The frames are interpolated here rather than with MapLibre's flyTo: flyTo turns the bearing over the
// whole move, and MOT-01 wants no bearing change in the final 20%; the camera also carries the centre's
// height in the exaggerated frame (`elevation`), which the stage sets on every frame as the dive and the
// flat reading do. Any input ends the move at once (the stage).

import type { MapCamera } from "./camera";
import { easeInOut, mixCamera } from "./flat";

/** 2400 to 3000 ms (motion.md, MOT-01). */
export const SETTLE_MS = 2700;

/** The bearing has finished turning by this share of the move (no bearing change in the final 20%). */
const TURN_DONE = 0.8;

/** The regional start: zoom about 9.4, pitch 25, north up, over the valley view's centre. */
export function regionalCamera(home: MapCamera): MapCamera {
  return { ...home, zoom: 9.4, pitch: 25, bearing: 0 };
}

/** The camera at progress `k` (0 to 1) of the settle, eased; the turn ends at 80%. */
export function settleCameraAt(home: MapCamera, k: number): MapCamera {
  const from = regionalCamera(home);
  const c = mixCamera(from, home, easeInOut(k));
  const turn = mixCamera(from, home, easeInOut(Math.min(1, k / TURN_DONE)));
  return { ...c, bearing: turn.bearing };
}
