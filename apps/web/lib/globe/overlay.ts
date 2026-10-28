// Screen geometry for the globe's overlay: the case ring (a circle of fixed screen size round the outlet),
// and the range name's curve (one quadratic through the projected arc's ends and middle, since a polyline
// of many short segments drops glyphs on a text path). Ported from the design lane's hero study A4.

import { R_KM, project, unit, type Vec3 } from "./frame";
import { F_PX } from "./views";

/** Points of a ring of angular radius rho (radians) round a unit vector, lifted 3 km off the surface. */
export function ringPoints(c: Vec3, lonDeg: number, rho: number, n = 72): Vec3[] {
  const r = (lonDeg * Math.PI) / 180;
  const east: Vec3 = [-Math.sin(r), Math.cos(r), 0];
  const north: Vec3 = [
    c[1] * east[2] - c[2] * east[1],
    c[2] * east[0] - c[0] * east[2],
    c[0] * east[1] - c[1] * east[0],
  ];
  const lift = 1 + 3 / R_KM;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [0, 1, 2].map(
      (j) =>
        (Math.cos(rho) * (c[j] ?? 0) +
          Math.sin(rho) * (Math.cos(a) * (east[j] ?? 0) + Math.sin(a) * (north[j] ?? 0))) *
        lift,
    ) as Vec3;
  });
}

/** Angular radius that keeps the ring 12 CSS px wide on screen at a view distance in km. */
export const ringRho = (distanceKm: number) => (12 * distanceKm) / (F_PX * R_KM);

/** An SVG path through screen points, closed, or undefined if any point is behind the camera. */
export function polygonPath(
  vp: Float32Array,
  pts: Vec3[],
  w: number,
  h: number,
): string | undefined {
  const s = pts.map((p) => project(vp, p, w, h));
  if (s.some((p) => !p)) return undefined;
  return (
    s
      .map((p, i) => `${i ? "L" : "M"}${(p?.[0] ?? 0).toFixed(1)} ${(p?.[1] ?? 0).toFixed(1)}`)
      .join(" ") + " Z"
  );
}

/** The range name's path: a quadratic through the curve's ends, bent to pass through its middle. */
export function rangePath(
  vp: Float32Array,
  curve: [number, number][],
  w: number,
  h: number,
): string | undefined {
  const at = (k: number) => {
    const ll = curve[Math.round(k * (curve.length - 1))];
    if (!ll) return undefined;
    const u = unit(ll[0], ll[1]);
    const lift = 1 + 4 / R_KM;
    return project(vp, [u[0] * lift, u[1] * lift, u[2] * lift], w, h);
  };
  const p0 = at(0);
  const pm = at(0.5);
  const p2 = at(1);
  if (!p0 || !pm || !p2) return undefined;
  const cx = 2 * pm[0] - (p0[0] + p2[0]) / 2;
  const cy = 2 * pm[1] - (p0[1] + p2[1]) / 2;
  return `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
}
