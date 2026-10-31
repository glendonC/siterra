import { describe, expect, it } from "vitest";
import {
  atDistance,
  floorCoverRuns,
  makeCut,
  nearestSample,
  pointInRing,
  runsEastOf,
  transectFixture,
  type CutawayTransect,
} from "./transect";
import { lonLatToUtm } from "./utm";

const line = (over: Partial<CutawayTransect> = {}): CutawayTransect => ({
  sources: [
    {
      path: "data/bundles/bundle_transects_ait_bouguemez/transect-samples.json",
      sha256: "0".repeat(64),
    },
  ],
  transect: "tabant_meridian",
  label: "Cross-valley section",
  crs: "EPSG:32629",
  d: [0, 100, 200],
  E: [1000, 1000, 1000],
  N: [3000, 2900, 2800],
  h: [2000, 1800, 2100],
  land_cover_runs: [],
  valley_floor: { from_m: 50, to_m: 150 },
  ...over,
});

describe("makeCut", () => {
  it("faces west for a line running north to south, with east of it on the positive side", () => {
    const cut = makeCut([0, -1], [0, 1]); // model x, z: north is -z
    expect(cut.east[0]).toBeCloseTo(1);
    expect(cut.side(0.5, 0)).toBeGreaterThan(0);
    expect(cut.side(-0.5, 0)).toBeLessThan(0);
    expect(cut.faceBearing).toBeCloseTo(270);
  });
});

describe("runsEastOf", () => {
  it("returns the ring's eastern part as one open run ending on the cut at both ends", () => {
    const square: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    const runs = runsEastOf(square, ([x]) => x);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual([
      [0, -1],
      [1, -1],
      [1, 1],
      [0, 1],
    ]);
  });

  it("keeps a ring that starts east of the cut in one run", () => {
    const square: [number, number][] = [
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ];
    const runs = runsEastOf(square, ([x]) => x);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.[0]).toEqual([0, -1]);
    expect(runs[0]?.at(-1)).toEqual([0, 1]);
  });
});

describe("pointInRing", () => {
  it("tells inside from outside", () => {
    const tri: [number, number][] = [
      [0, 0],
      [4, 0],
      [0, 4],
    ];
    expect(pointInRing(tri, 1, 1)).toBe(true);
    expect(pointInRing(tri, 3, 3)).toBe(false);
  });
});

describe("the profile", () => {
  it("interpolates position and height at a distance along the line", () => {
    expect(atDistance(line(), 50)).toEqual([1000, 2950, 1900]);
    expect(atDistance(line(), 200)).toEqual([1000, 2800, 2100]);
  });

  it("finds the sample nearest a point and how far the point lies off the line", () => {
    const near = nearestSample(line(), 1030, 2905);
    expect(near.i).toBe(1);
    expect(near.offset_m).toBeCloseTo(Math.hypot(30, 5));
  });

  it("draws only tree cover and cropland or built-up runs, clipped to the valley floor", () => {
    const t = line({
      land_cover_runs: [
        { class: 30, from_m: 0, to_m: 60 },
        { class: 10, from_m: 40, to_m: 90 },
        { class: 40, from_m: 90, to_m: 120 },
        { class: 50, from_m: 140, to_m: 190 },
        { class: 10, from_m: 170, to_m: 200 },
      ],
    });
    expect(floorCoverRuns(t)).toEqual([
      { cover: "tree", from_m: 50, to_m: 90 },
      { cover: "crop", from_m: 90, to_m: 120 },
      { cover: "crop", from_m: 140, to_m: 150 },
    ]);
  });
  it("draws no runs where the transect states no valley floor (U25b)", () => {
    expect(
      floorCoverRuns(
        line({ valley_floor: null, land_cover_runs: [{ class: 10, from_m: 0, to_m: 90 }] }),
      ),
    ).toEqual([]);
  });
});

describe("transectFixture", () => {
  it("projects the bundle's samples to EPSG:32629 at 0.1 m and keeps its heights, runs and valley floor", () => {
    const samples = {
      transects: {
        tabant_meridian: {
          columns: {
            distance_m: [0, 30],
            lon: [-6.42007, -6.42007],
            lat: [31.709028, 31.7087572],
            elevation_m: [2657, 2655.1],
          },
          land_cover_runs: [{ class: 30, label: "grassland", from_m: 0, to_m: 30 }],
        },
      },
    };
    const terrain = {
      transects: {
        tabant_meridian: {
          label: "Cross-valley section",
          valley_floor: { from_m: 975, to_m: 8145 },
        },
      },
    };
    const t = transectFixture(
      samples,
      terrain,
      "tabant_meridian",
      [{ path: "data/bundles/x/transect-samples.json", sha256: "a".repeat(64) }],
      29,
    );
    const [E1, N1] = lonLatToUtm(-6.42007, 31.7087572, 29);
    expect(t.E[1]).toBe(Math.round(E1 * 10) / 10);
    expect(t.N[1]).toBe(Math.round(N1 * 10) / 10);
    expect(t.E[0]).toBe(744491.9);
    expect(t.h).toEqual([2657, 2655.1]);
    expect(t.land_cover_runs).toEqual([{ class: 30, from_m: 0, to_m: 30 }]);
    expect(t.valley_floor).toEqual({ from_m: 975, to_m: 8145 });
    expect(t.label).toBe("Cross-valley section");
  });
});
