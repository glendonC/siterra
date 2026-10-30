// The layer stack's layout for any land: specimen A's measured stack for the Aït Bouguemez valley (layout-a.json),
// written relative to the land it was measured on, so another land gets the same composition. The plate is the
// smallest rectangle round the outline with a margin; the sheets stand one gap apart from one gap above the land's
// highest point; the camera keeps its bearing to the land's long axis, its elevation, and its target's place against
// the plate (turned with the bearing); distances scale with the land's size (landFrame's kmScale).

import type { LayerStackLayout } from "../instruments/valley/fixtures";

type XZ = readonly [number, number];

/** Specimen A, measured on the valley (layout-a.json), relative to that land. */
const A = {
  /** Camera bearing less the land's long axis bearing (140 against 55.84). */
  azOff: 84.16,
  el: 25,
  /** Sheet gap, the first sheet over the land's top, and the target over it (km of model y). */
  gap: 9.435,
  first: 9.4315,
  targetY: 15.259,
  /** The target against the plate's centre (km, model x and z), turned back by the specimen's bearing. */
  targetAt: [-7.977, -0.397] as XZ,
  az: 140,
  scale: 11.442,
  margin: 1.6,
  labelX: 1084,
} as const;

/** (x, z) turned by a bearing (degrees clockwise seen from above; z points south). */
function turn([x, z]: XZ, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c - z * s, x * s + z * c];
}

/** The smallest-area rectangle round the points (searched at quarter degrees), grown by `margin` on every side. */
export function plateAround(pts: readonly XZ[], margin: number): [number, number][] {
  let best: { area: number; deg: number; box: [number, number, number, number] } | null = null;
  for (let q = 0; q < 360; q++) {
    const deg = q / 4;
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const p of pts) {
      const [u, v] = turn(p, -deg);
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, deg, box: [u0, v0, u1, v1] };
  }
  if (!best) throw new Error("no points to put a plate under");
  const [u0, v0, u1, v1] = best.box;
  const m = margin;
  return (
    [
      [u0 - m, v0 - m],
      [u1 + m, v0 - m],
      [u1 + m, v1 + m],
      [u0 - m, v1 + m],
    ] as const
  ).map((c) => turn(c, best.deg));
}

/**
 * The stack's layout for a land: its outline in model x, z (km), the model y of its highest point, its long axis
 * bearing and its kmScale (landFrame).
 */
export function layerStackLayout(
  outlineXZ: readonly XZ[],
  topY: number,
  bearing: number,
  kmScale: number,
): LayerStackLayout {
  const plate = plateAround(outlineXZ, A.margin * kmScale);
  const cx = plate.reduce((s, p) => s + p[0], 0) / plate.length;
  const cz = plate.reduce((s, p) => s + p[1], 0) / plate.length;
  const az = bearing + A.azOff;
  const [tx, tz] = turn(turn(A.targetAt, -A.az), az);
  return {
    az,
    el: A.el,
    scale_px_per_km: A.scale / kmScale,
    target: [cx + tx * kmScale, topY + A.targetY * kmScale, cz + tz * kmScale],
    sheet_y_km: [0, 1, 2, 3, 4].map((i) => topY + (A.first + (4 - i) * A.gap) * kmScale),
    plate_xz: plate,
    label_x: A.labelX,
  };
}
