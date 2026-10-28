import { describe, expect, it } from "vitest";
import { ARRIVAL_POSE } from "./arrival";
import { normalizeBearing, orbitToMapCamera, widthFitScale } from "./camera";

describe("orbitToMapCamera", () => {
  it("turns the approved arrival pose into MapLibre camera options at 1440 x 810", () => {
    const cam = orbitToMapCamera(ARRIVAL_POSE, 810);
    expect(cam.center).toEqual([-6.370535, 31.659089]);
    expect(cam.elevation).toBeCloseTo(6307.4, 1);
    expect(cam.pitch).toBeCloseTo(54, 3);
    expect(cam.bearing).toBeCloseTo(-47, 3);
    // (405 / tan 11 deg) x C x cos(31.659 deg) / (512 x 73,388.7 m) = 2^10.8853
    expect(cam.zoom).toBeCloseTo(10.8853, 3);
    expect(cam.verticalFovDeg).toBe(22);
  });

  it("keeps the same ground scale when the viewport doubles: one zoom level more", () => {
    const a = orbitToMapCamera(ARRIVAL_POSE, 810);
    const b = orbitToMapCamera(ARRIVAL_POSE, 1620);
    expect(b.zoom - a.zoom).toBeCloseTo(1, 6);
  });

  it("looks north when the camera stands due south of the target", () => {
    const cam = orbitToMapCamera({ ...ARRIVAL_POSE, cameraBearingFromTargetDeg: 180 }, 810);
    expect(cam.bearing).toBeCloseTo(0, 6);
  });

  it("refuses a viewport without height", () => {
    expect(() => orbitToMapCamera(ARRIVAL_POSE, 0)).toThrow(RangeError);
  });
});

describe("normalizeBearing", () => {
  it.each([
    [313, -47],
    [-190, 170],
    [180, 180],
    [540, 180],
    [0, 0],
  ])("%d becomes %d", (input, expected) => {
    expect(normalizeBearing(input)).toBeCloseTo(expected, 9);
  });
});

describe("widthFitScale", () => {
  it("keeps the approved 16:9 framing and moves back on narrower screens so the sides keep their margins", () => {
    expect(widthFitScale(2560, 1440)).toBe(1);
    expect(widthFitScale(1920, 800)).toBe(1);
    expect(widthFitScale(1440, 900)).toBeCloseTo(16 / 9 / 1.6, 10);
    expect(widthFitScale(1280, 800)).toBeCloseTo(16 / 9 / 1.6, 10);
  });
});
