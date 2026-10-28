import { describe, expect, it } from "vitest";
import type { Position } from "./geo";
import { smoothFeature, smoothRing } from "./smooth";

// a stair-stepped square, closed, as a raster outline would be
const steps: Position[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [2, 1],
  [2, 2],
  [3, 2],
  [3, 3],
  [0, 3],
  [0, 0],
];

describe("smoothRing", () => {
  it("keeps the ring closed and the vertex count", () => {
    const s = smoothRing(steps);
    expect(s).toHaveLength(steps.length);
    expect(s[0]).toEqual(s.at(-1));
  });

  it("averages each vertex with its two neighbours on each side, wrapping round", () => {
    const s = smoothRing(steps, 1);
    // vertex 1 = mean of (0,0), (1,0), (1,1)
    expect(s[1]?.[0]).toBeCloseTo(2 / 3, 12);
    expect(s[1]?.[1]).toBeCloseTo(1 / 3, 12);
    // vertex 0 wraps to the last open vertex (0,3)
    expect(s[0]?.[0]).toBeCloseTo(1 / 3, 12);
    expect(s[0]?.[1]).toBeCloseTo(1, 12);
  });

  it("leaves a ring too short to average unchanged", () => {
    const tri: Position[] = [
      [0, 0],
      [1, 0],
      [0, 1],
      [0, 0],
    ];
    expect(smoothRing(tri, 2)).toBe(tri);
  });
});

describe("smoothFeature", () => {
  it("smooths a polygon's rings and keeps its properties", () => {
    const f = smoothFeature({
      type: "Feature",
      properties: { id: "x" },
      geometry: { type: "Polygon", coordinates: [steps] },
    });
    expect(f.properties).toEqual({ id: "x" });
    expect(f.geometry.type).toBe("Polygon");
  });
});
