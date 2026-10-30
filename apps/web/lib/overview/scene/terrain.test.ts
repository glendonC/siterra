import { describe, expect, it } from "vitest";
import { centreOf } from "../data";
import { maskOnRelief, signedArea, smoothRing } from "./terrain";

describe("the overview's land helpers", () => {
  it("reads the catchment mask from the land cover raster's blue channel onto the relief cells", () => {
    // a 2 x 2 relief grid of 30 m cells over a 6 x 6 analysis grid of 10 m cells; inside only in the top-left 3 x 3
    const a = { E0: 0, N0: 60, res: 10, width: 6, height: 6 };
    const g = { E0: 0, N0: 60, res: 30, width: 2, height: 2 };
    const px = new Uint8ClampedArray(6 * 6 * 4);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) px[(r * 6 + c) * 4 + 2] = 255;
    expect([...maskOnRelief(px, a, g)]).toEqual([1, 0, 0, 0]);
  });

  it("smooths a closed ring by a moving average and drops its closing vertex", () => {
    const ring: [number, number][] = [
      [0, 0],
      [3, 0],
      [3, 3],
      [0, 3],
      [0, 0],
    ];
    const s = smoothRing(ring, 1);
    expect(s).toHaveLength(4);
    expect(s[0]).toEqual([1, 1]);
  });

  it("gives the signed area, positive counter-clockwise with north up", () => {
    const ccw: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ];
    expect(signedArea(ccw)).toBe(4);
    expect(signedArea([...ccw].reverse())).toBe(-4);
  });

  it("puts a pixel's centre at the mean of its corners", () => {
    expect(
      centreOf([
        [0, 0],
        [4, 0],
        [4, 2],
        [0, 2],
      ]),
    ).toEqual([2, 1]);
  });
});
