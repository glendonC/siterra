import { describe, expect, it } from "vitest";
import { R_KM, globeCamera, unit } from "./frame";
import { polygonPath, rangePath, ringPoints, ringRho } from "./overlay";

describe("ringPoints", () => {
  it("keeps every point at the ring's angle from the case", () => {
    const c = unit(-6.537, 31.638);
    const rho = 0.002;
    for (const p of ringPoints(c, -6.537, rho, 12)) {
      const l = Math.hypot(...p);
      const cos = (p[0] * c[0] + p[1] * c[1] + p[2] * c[2]) / l;
      expect(Math.acos(Math.min(1, cos))).toBeCloseTo(rho, 9);
      expect(l).toBeCloseTo(1 + 3 / R_KM, 12);
    }
  });
});

describe("paths", () => {
  const cam = globeCamera(
    { lon: -3, lat: 25, bearing: 180, pitch: 90, distance: 18000, fov: 22 },
    16 / 9,
  );

  it("draws a closed ring path on the visible side of the globe", () => {
    const d = polygonPath(
      cam.vp,
      ringPoints(unit(-6.537, 31.638), -6.537, ringRho(18000)),
      1440,
      810,
    );
    expect(d?.startsWith("M")).toBe(true);
    expect(d?.endsWith("Z")).toBe(true);
  });

  it("draws no path with a non-number in it when the globe has no height (hidden behind the overview)", () => {
    // the lead's walk: 'path d: Expected number, MNaN 0.0 LNaN 0.0' while the globe drew at zero height
    const flat = globeCamera(
      { lon: -6.5, lat: 31.6, bearing: 180, pitch: 60, distance: 18000, fov: 22 },
      0 / 0,
    );
    const ring = polygonPath(
      flat.vp,
      ringPoints(unit(-6.537, 31.638), -6.537, ringRho(18000)),
      0,
      0,
    );
    const curve: [number, number][] = [
      [-9, 31],
      [-6.5, 31.6],
      [-4, 32],
    ];
    const range = rangePath(flat.vp, curve, 0, 0);
    for (const d of [ring, range]) expect(d ?? "").not.toMatch(/NaN|Infinity/);
  });

  it("draws one quadratic for the range name", () => {
    const curve: [number, number][] = [
      [-9, 31],
      [-6.5, 31.6],
      [-4, 32],
    ];
    expect(rangePath(cam.vp, curve, 1440, 810)).toMatch(
      /^M[\d.-]+ [\d.-]+ Q[\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+$/,
    );
  });
});
