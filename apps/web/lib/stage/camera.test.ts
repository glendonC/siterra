import { describe, expect, it } from "vitest";
import { ARRIVAL_POSE } from "./arrival";
import {
  cameraMoved,
  clampBearing,
  clampCenter,
  clampPitch,
  clampZoom,
  expandBounds,
  maxZoomForDistance,
  normalizeBearing,
  orbitToMapCamera,
  VALLEY_ASSET_BOUNDS,
  widthFitScale,
} from "./camera";

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

describe("interactive camera constraints", () => {
  it("clamps orbit bearing within 30 degrees of the arrival bearing", () => {
    const homeBearing = orbitToMapCamera(ARRIVAL_POSE, 810).bearing; // -47
    expect(clampBearing(-47, homeBearing)).toBeCloseTo(-47, 6);
    expect(clampBearing(-60, homeBearing)).toBeCloseTo(-60, 6);
    expect(clampBearing(-95, homeBearing)).toBeCloseTo(-77, 6);
    expect(clampBearing(10, homeBearing)).toBeCloseTo(-17, 6);
  });

  it("clamps tilt between 25 and 60 degrees in oblique mode and 0 in flat mode", () => {
    expect(clampPitch(10, false)).toBe(25);
    expect(clampPitch(54, false)).toBe(54);
    expect(clampPitch(75, false)).toBe(60);
    expect(clampPitch(54, true)).toBe(0);
  });

  it("computes max zoom for a 2 km camera distance and clamps zoom range", () => {
    const maxZ = maxZoomForDistance(ARRIVAL_POSE, 810, 2000);
    expect(maxZ).toBeCloseTo(16.082, 2);
    expect(clampZoom(8, maxZ)).toBe(9.4);
    expect(clampZoom(12, maxZ)).toBe(12);
    expect(clampZoom(19, maxZ)).toBeCloseTo(maxZ, 6);
  });

  it("clamps camera center to the valley asset extent and expands frustum maxBounds", () => {
    expect(clampCenter([-8, 30], VALLEY_ASSET_BOUNDS)).toEqual([-6.71, 31.33]);
    expect(clampCenter([-5, 33], VALLEY_ASSET_BOUNDS)).toEqual([-5.98, 31.92]);
    expect(clampCenter([-6.37, 31.66], VALLEY_ASSET_BOUNDS)).toEqual([-6.37, 31.66]);
    const [[swLon, swLat], [neLon, neLat]] = expandBounds(VALLEY_ASSET_BOUNDS, 0.8);
    expect(swLon).toBeLessThan(-7.5);
    expect(swLat).toBeLessThan(30.6);
    expect(neLon).toBeGreaterThan(-5.2);
    expect(neLat).toBeGreaterThan(32.7);
  });

  it("detects when the camera has moved away from the active step pose", () => {
    const home = orbitToMapCamera(ARRIVAL_POSE, 810);
    expect(cameraMoved(home, home)).toBe(false);
    expect(cameraMoved({ ...home, pitch: 40 }, home)).toBe(true);
    expect(cameraMoved({ ...home, bearing: home.bearing + 10 }, home)).toBe(true);
    expect(cameraMoved({ ...home, zoom: home.zoom + 0.5 }, home)).toBe(true);
    expect(cameraMoved({ ...home, center: [-6.45, 31.66] }, home)).toBe(true);
  });
});
