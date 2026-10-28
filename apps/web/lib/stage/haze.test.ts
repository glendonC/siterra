import { describe, expect, it } from "vitest";
import { HAZE_HALF_M, HAZE_INNER_M, HAZE_OUTER_M, hazeCorners, hazeStops } from "./haze";

describe("hazeStops", () => {
  it("leaves the land clear to 24 km and makes it paper by 52 km", () => {
    const stops = hazeStops();
    const at = (m: number) => stops.find(([o]) => Math.abs(o - m / HAZE_HALF_M) < 1e-12)?.[1];
    expect(at(HAZE_INNER_M)).toBe(0);
    expect(at(HAZE_OUTER_M)).toBe(1);
    expect(stops.at(-1)).toEqual([1, 1]);
  });

  it("only grows outward", () => {
    const stops = hazeStops();
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]?.[0]).toBeGreaterThanOrEqual(stops[i - 1]?.[0] ?? 0);
      expect(stops[i]?.[1]).toBeGreaterThanOrEqual(stops[i - 1]?.[1] ?? 0);
    }
  });
});

describe("hazeCorners", () => {
  it("centres a north-up square on the catchment centre", () => {
    const [tl, tr, br, bl] = hazeCorners();
    expect((tl[0] + br[0]) / 2).toBeCloseTo(-6.359132, 6);
    expect((tr[1] + bl[1]) / 2).toBeCloseTo(31.651677, 6);
  });
});
