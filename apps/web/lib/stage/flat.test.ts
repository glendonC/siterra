import { describe, expect, it } from "vitest";
import { easeInOut, flatCamera, graticuleTicks, mixCamera, scaleBar } from "./flat";
import type { MapCamera } from "./camera";

describe("flatCamera", () => {
  const box: [number, number, number, number] = [-6.66, 31.55, -6.18, 31.78];

  it("looks straight down, north up, at the middle of the area, terrain height 0", () => {
    const c = flatCamera(box, 1440, 810, 96);
    expect(c.pitch).toBe(0);
    expect(c.bearing).toBe(0);
    expect(c.elevation).toBe(0);
    expect(c.center[0]).toBeCloseTo(-6.42, 6);
  });

  it("fits the whole area inside the padding", () => {
    const c = flatCamera(box, 1440, 810, 96);
    const world = 512 * 2 ** c.zoom;
    const widthPx = ((box[2] - box[0]) / 360) * world;
    expect(widthPx).toBeLessThanOrEqual(1440 - 2 * 96 + 1e-6);
  });
});

describe("graticuleTicks", () => {
  it("picks a round step that gives at most the asked number of ticks", () => {
    const t = graticuleTicks(-6.7, -6.1, 8);
    expect(t.step).toBe(0.1);
    expect(t.values.map((v) => v.toFixed(1))).toEqual([
      "-6.7",
      "-6.6",
      "-6.5",
      "-6.4",
      "-6.3",
      "-6.2",
      "-6.1",
    ]);
    expect(t.decimals).toBe(1);
  });

  it("goes finer over a small span", () => {
    expect(graticuleTicks(31.6, 31.75, 8).step).toBe(0.02);
  });
});

describe("scaleBar", () => {
  it("picks the longest round length that fits", () => {
    expect(scaleBar(40, 160)).toEqual({ metres: 5000, px: 125 });
    expect(scaleBar(4, 160)).toEqual({ metres: 500, px: 125 });
  });
});

describe("mixCamera", () => {
  const a: MapCamera = {
    center: [0, 0],
    elevation: 100,
    zoom: 10,
    pitch: 54,
    bearing: 170,
    verticalFovDeg: 22,
  };
  const b: MapCamera = {
    center: [2, 4],
    elevation: 0,
    zoom: 12,
    pitch: 0,
    bearing: -170,
    verticalFovDeg: 22,
  };

  it("goes from one camera to the other, turning the short way", () => {
    expect(mixCamera(a, b, 0)).toEqual(a);
    const mid = mixCamera(a, b, 0.5);
    expect(mid.center).toEqual([1, 2]);
    expect(mid.zoom).toBe(11);
    expect(mid.pitch).toBe(27);
    expect(Math.abs(mid.bearing)).toBeCloseTo(180, 6);
    expect(mixCamera(a, b, 1).bearing).toBeCloseTo(-170, 6);
  });

  it("eases in and out", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.1)).toBeLessThan(0.1);
  });
});
