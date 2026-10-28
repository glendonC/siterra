// Names written on the land: a box of text sized in kilometres, lying on a flat plane just above the land in
// perspective (the stage maps it there with a CSS transform). MapLibre symbol layers would need generated
// glyph files and cannot be sized in ground units; pictures draped on the terrain bend over its ridges.

import type { Corners } from "./daylight-style";

const M_PER_DEG_LAT = 111320;

export interface GroundPlacement {
  lon: number;
  lat: number;
  /** Width and height of the picture on the ground, metres. */
  widthM: number;
  heightM: number;
  /** Compass direction the text reads toward, degrees clockwise from north. */
  readingBearingDeg: number;
}

/** Corners of the label's picture on the land: top left, top right, bottom right, bottom left. */
export function groundCorners(p: GroundPlacement): Corners {
  const t = (p.readingBearingDeg * Math.PI) / 180;
  // reading direction and the text's up direction (90 degrees to the left of reading), as east and north metres
  const r = { e: Math.sin(t), n: Math.cos(t) };
  const u = { e: -Math.cos(t), n: Math.sin(t) };
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((p.lat * Math.PI) / 180);
  const at = (sr: number, su: number): [number, number] => {
    const e = ((sr * p.widthM) / 2) * r.e + ((su * p.heightM) / 2) * u.e;
    const n = ((sr * p.widthM) / 2) * r.n + ((su * p.heightM) / 2) * u.n;
    return [p.lon + e / mPerDegLon, p.lat + n / M_PER_DEG_LAT];
  };
  return [at(-1, 1), at(1, 1), at(1, -1), at(-1, -1)];
}

/** Reading direction that runs left to right across the screen for a map bearing. */
export function screenReadingBearing(mapBearingDeg: number): number {
  return (((mapBearingDeg + 90) % 360) + 360) % 360;
}

export interface LabelLine {
  text: string;
  /** Font size as a share of the text box height. */
  size: number;
  weight: 400 | 500;
  /** Letter spacing in em. */
  tracking?: number;
}
