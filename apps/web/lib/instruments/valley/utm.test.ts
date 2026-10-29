import { describe, expect, it } from "vitest";
import { lonLatToUtm } from "./utm";

// Reference pairs: the cutaway specimen's transect ends and acceptance point, which its builder projected with
// pyproj to EPSG:32629 and wrote to 0.1 m.
const PAIRS: [lon: number, lat: number, E: number, N: number][] = [
  [-6.42007, 31.65873, 744623.9, 3505501.4],
  [-6.42007, 31.709028, 744491.9, 3511078.8],
  [-6.42007, 31.600972, 744775.2, 3499096.8],
];

describe("lonLatToUtm", () => {
  it.each(PAIRS)("projects (%f, %f) to zone 29 north within 0.1 m", (lon, lat, E, N) => {
    const [e, n] = lonLatToUtm(lon, lat, 29);
    expect(Math.abs(e - E)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(n - N)).toBeLessThanOrEqual(0.1);
  });

  it("puts the central meridian on the false easting", () => {
    const [e, n] = lonLatToUtm(-9, 0, 29);
    expect(e).toBeCloseTo(500000, 6);
    expect(n).toBeCloseTo(0, 6);
  });
});
