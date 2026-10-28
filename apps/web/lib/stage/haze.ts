// The paper haze away from the study area (DESIGN B's arrival: the land goes to paper from 24 to 52 km from
// the catchment centre). Drawn by the client as a radial picture laid on the land under the line.

import { groundCorners } from "./ground-label";
import type { Corners } from "./daylight-style";

/** The catchment centre (handoff arrival-camera.json). */
export const HAZE_CENTRE = { lon: -6.359132, lat: 31.651677 } as const;
export const HAZE_INNER_M = 24000;
export const HAZE_OUTER_M = 52000;
/** Half the side of the haze picture: wide enough that its square edge never shows. */
export const HAZE_HALF_M = 200000;

/** Gradient stops as offsets of the picture's half side, with the paper's opacity at each. */
export function hazeStops(steps = 8): [number, number][] {
  const stops: [number, number][] = [[0, 0]];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const r = HAZE_INNER_M + k * (HAZE_OUTER_M - HAZE_INNER_M);
    stops.push([r / HAZE_HALF_M, k * k * (3 - 2 * k)]); // smoothstep, as the shader did
  }
  stops.push([1, 1]);
  return stops;
}

export function hazeCorners(): Corners {
  return groundCorners({
    lon: HAZE_CENTRE.lon,
    lat: HAZE_CENTRE.lat,
    widthM: HAZE_HALF_M * 2,
    heightM: HAZE_HALF_M * 2,
    readingBearingDeg: 90,
  });
}

/** Draws the haze as a PNG data URL in the given paper colour (#rrggbb). Browser only. */
export function drawHaze(paper: string, size = 1024): string {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, a] of hazeStops()) {
    const alpha = Math.round(a * 255)
      .toString(16)
      .padStart(2, "0");
    g.addColorStop(Math.min(1, o), `${paper}${alpha}`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c.toDataURL("image/png");
}
