import { describe, expect, it } from "vitest";
import type { Feature, Polygon } from "./geo";
import { localFrame, northEdgeAnchor, valleyNameAnchor } from "./placement";

// A box 0.4 degrees wide and 0.1 high, closed, counter-clockwise.
const box: Feature<Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-6.6, 31.6],
        [-6.4, 31.6],
        [-6.2, 31.6],
        [-6.2, 31.7],
        [-6.4, 31.7],
        [-6.6, 31.7],
        [-6.6, 31.6],
      ],
    ],
  },
};

describe("localFrame", () => {
  it("round-trips a position", () => {
    const f = localFrame(-6.4, 31.65);
    const p = f.toXY([-6.3, 31.7]);
    const [lon, lat] = f.toLonLat(p.x, p.y);
    expect(lon).toBeCloseTo(-6.3, 9);
    expect(lat).toBeCloseTo(31.7, 9);
  });
});

describe("valleyNameAnchor", () => {
  it("averages the outline east of the reference place, then shifts", () => {
    const a = valleyNameAnchor(
      box,
      { lon: -6.4, lat: 31.65 },
      {
        eastOfM: 1000,
        shiftM: { east: 0, north: 0 },
        readingBearingDeg: 43,
      },
    );
    expect(a.lon).toBeCloseTo(-6.2, 6);
    expect(a.lat).toBeCloseTo(31.65, 6);
    expect(a.readingBearingDeg).toBe(43);
  });

  it("refuses a reference place east of the whole outline", () => {
    expect(() =>
      valleyNameAnchor(
        box,
        { lon: -6.0, lat: 31.65 },
        { eastOfM: 0, shiftM: { east: 0, north: 0 }, readingBearingDeg: 0 },
      ),
    ).toThrow();
  });
});

describe("northEdgeAnchor", () => {
  it("sits outside the northern edge and reads east along it", () => {
    const a = northEdgeAnchor(box, { lonBand: [-6.7, -6.1], outM: 2400 });
    expect(a.lat).toBeGreaterThan(31.7);
    expect(a.lat).toBeCloseTo(31.7 + 2400 / 111320, 6);
    expect(a.lon).toBeCloseTo(-6.4, 6);
    expect(a.readingBearingDeg).toBeCloseTo(90, 6);
  });
});
