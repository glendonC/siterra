import { describe, expect, it } from "vitest";
import type { MapCamera } from "./camera";
import { regionalCamera, SETTLE_MS, settleCameraAt } from "./settle";

const home: MapCamera = {
  center: [-6.370535, 31.659089],
  elevation: 12614.8,
  zoom: 10.8853,
  pitch: 54,
  bearing: 133,
  verticalFovDeg: 22,
};

describe("MOT-01 arrival settle", () => {
  it("starts at the regional view over the same place: zoom about 9.4, pitch 25, bearing 0", () => {
    const r = regionalCamera(home);
    expect(r.center).toEqual(home.center);
    expect(r.zoom).toBe(9.4);
    expect(r.pitch).toBe(25);
    expect(r.bearing).toBe(0);
  });

  it("takes 2400 to 3000 ms and ends at the valley view", () => {
    expect(SETTLE_MS).toBeGreaterThanOrEqual(2400);
    expect(SETTLE_MS).toBeLessThanOrEqual(3000);
    expect(settleCameraAt(home, 0)).toEqual(regionalCamera(home));
    const end = settleCameraAt(home, 1);
    expect(end.zoom).toBeCloseTo(home.zoom, 10);
    expect(end.pitch).toBeCloseTo(home.pitch, 10);
    expect(end.bearing).toBeCloseTo(home.bearing, 10);
  });

  it("finishes turning before the last 20%", () => {
    for (const k of [0.8, 0.85, 0.9, 0.95, 1])
      expect(settleCameraAt(home, k).bearing).toBeCloseTo(home.bearing, 10);
    expect(settleCameraAt(home, 0.5).bearing).not.toBeCloseTo(home.bearing, 1);
  });
});
