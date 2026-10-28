import { describe, expect, it } from "vitest";
import { groundCorners, screenReadingBearing } from "./ground-label";

const M_PER_DEG_LAT = 111320;

describe("groundCorners", () => {
  it("lays a north-up label reading east as a plain box", () => {
    const [tl, tr, br, bl] = groundCorners({
      lon: 0,
      lat: 0,
      widthM: 2000,
      heightM: 500,
      readingBearingDeg: 90,
    });
    expect(tl[0]).toBeCloseTo(-1000 / M_PER_DEG_LAT, 9);
    expect(tl[1]).toBeCloseTo(250 / M_PER_DEG_LAT, 9);
    expect(tr[0]).toBeCloseTo(1000 / M_PER_DEG_LAT, 9);
    expect(br[1]).toBeCloseTo(-250 / M_PER_DEG_LAT, 9);
    expect(bl[0]).toBeCloseTo(-1000 / M_PER_DEG_LAT, 9);
  });

  it("keeps the width in metres at the valley's latitude", () => {
    const lat = 31.65;
    const [tl, tr] = groundCorners({
      lon: -6.4,
      lat,
      widthM: 15000,
      heightM: 2000,
      readingBearingDeg: 90,
    });
    const widthM = (tr[0] - tl[0]) * M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
    expect(widthM).toBeCloseTo(15000, 6);
  });

  it("turns with the reading direction: reading north puts the top on the west", () => {
    const [tl, tr] = groundCorners({
      lon: 0,
      lat: 0,
      widthM: 2000,
      heightM: 500,
      readingBearingDeg: 0,
    });
    expect(tr[1]).toBeGreaterThan(tl[1]);
    expect(tl[0]).toBeLessThan(0);
  });
});

describe("screenReadingBearing", () => {
  it("reads across the screen for the arrival bearing", () => {
    expect(screenReadingBearing(-47)).toBe(43);
    expect(screenReadingBearing(0)).toBe(90);
  });
});
