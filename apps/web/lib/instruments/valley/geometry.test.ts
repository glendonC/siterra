import { describe, expect, it } from "vitest";
import { clipConvex, openRing, signedArea } from "./geometry";

const square = (s: number): [number, number][] => [
  [0, 0],
  [s, 0],
  [s, s],
  [0, s],
];

describe("signedArea", () => {
  it("is positive for a counter-clockwise ring and negative when reversed", () => {
    expect(signedArea(square(2))).toBe(4);
    expect(signedArea(square(2).reverse())).toBe(-4);
  });
});

describe("openRing", () => {
  it("drops a closing vertex that repeats the first", () => {
    expect(openRing([...square(1), [0, 0]])).toEqual(square(1));
  });

  it("leaves an open ring as it is", () => {
    expect(openRing(square(1))).toEqual(square(1));
  });
});

describe("clipConvex", () => {
  it("keeps the part of a polygon inside a convex clip", () => {
    const clipped = clipConvex(
      square(2).map(([x, z]) => [x + 1, z + 1]),
      square(2),
    );
    expect(Math.abs(signedArea(clipped))).toBeCloseTo(1, 12);
    for (const [x, z] of clipped) {
      expect(x).toBeGreaterThanOrEqual(1);
      expect(z).toBeLessThanOrEqual(2);
    }
  });

  it("works whichever way the clip polygon winds", () => {
    const clipped = clipConvex(
      square(2).map(([x, z]) => [x + 1, z + 1]),
      square(2).reverse(),
    );
    expect(Math.abs(signedArea(clipped))).toBeCloseTo(1, 12);
  });

  it("returns nothing for a polygon wholly outside", () => {
    expect(
      clipConvex(
        square(1).map(([x, z]) => [x + 5, z]),
        square(2),
      ),
    ).toEqual([]);
  });
});
