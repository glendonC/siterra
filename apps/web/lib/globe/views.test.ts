import { describe, expect, it } from "vitest";
import { R_KM } from "./frame";
import { ARRIVE, CAM, F_PX, V_GLOBE, bezier, distFor, limbView, mixView, shiftFor } from "./views";

describe("bezier", () => {
  it("runs from 0 to 1 and clamps outside", () => {
    for (const e of [ARRIVE, CAM]) {
      expect(e(-1)).toBe(0);
      expect(e(0)).toBe(0);
      expect(e(1)).toBe(1);
      expect(e(2)).toBe(1);
    }
  });

  it("is symmetric for the camera curve and ahead of linear for arrivals", () => {
    expect(CAM(0.5)).toBeCloseTo(0.5, 4);
    expect(ARRIVE(0.25)).toBeGreaterThan(0.25);
  });

  it("is the identity for a linear curve", () => {
    expect(bezier(1 / 3, 1 / 3, 2 / 3, 2 / 3)(0.3)).toBeCloseTo(0.3, 5);
  });
});

describe("distFor", () => {
  it("gives the height at which the globe's silhouette has the asked radius", () => {
    const d = distFor(470);
    // silhouette half-angle from the eye: asin(R / (R + d)); its tangent times the focal length is the radius
    const half = Math.asin(R_KM / (R_KM + d));
    expect(Math.tan(half) * F_PX).toBeCloseTo(470, 6);
  });
});

describe("views", () => {
  it("centres the opening globe below the frame so only its limb shows", () => {
    expect(limbView(504).shiftY).toBeCloseTo(shiftFor(1704), 12);
    expect(shiftFor(405)).toBe(0);
  });

  it("moves distance on a log scale between views", () => {
    const a = { ...V_GLOBE, distance: 10 };
    const b = { ...V_GLOBE, distance: 1000 };
    expect(mixView(a, b, 0.5).distance).toBeCloseTo(100, 9);
  });
});
