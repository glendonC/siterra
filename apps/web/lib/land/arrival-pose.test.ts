import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARRIVAL_POSE } from "../stage/arrival";
import { arrivalPose, centreOf } from "./arrival-pose";

// The arrival follows the land: on the valley it is the approved pose again.

const geo = JSON.parse(
  readFileSync(
    new URL(
      "../../../../data/bundles/bundle_terrain_strata_ait_bouguemez/analysis-geometry.geojson",
      import.meta.url,
    ),
    "utf8",
  ),
) as { features: { geometry: { coordinates: number[][][] } }[] };
const ring = geo.features[0]?.geometry.coordinates[0] ?? [];

describe("arrivalPose", () => {
  it("is the approved arrival pose on the valley", () => {
    const p = arrivalPose(ring, [2316.8, 2815.2]);
    expect(p.target.lon).toBeCloseTo(ARRIVAL_POSE.target.lon, 2);
    expect(p.target.lat).toBeCloseTo(ARRIVAL_POSE.target.lat, 2);
    expect(p.cameraBearingFromTargetDeg).toBeCloseTo(ARRIVAL_POSE.cameraBearingFromTargetDeg, 0);
    expect(p.elevationDeg).toBe(ARRIVAL_POSE.elevationDeg);
    expect(Math.abs(p.distanceM / ARRIVAL_POSE.distanceM - 1)).toBeLessThan(0.02);
    expect(Math.abs(p.targetHeightM - ARRIVAL_POSE.targetHeightM)).toBeLessThan(5);
  });

  it("centres on the outline: the fade's and haze's centre of the valley", () => {
    const c = centreOf(ring);
    expect(c.lon).toBeCloseTo(-6.359132, 4);
    expect(c.lat).toBeCloseTo(31.651677, 4);
  });

  it("arrives at a smaller, lower land closer and lower", () => {
    // a 10 km square near the Bay Area, between 100 and 400 m
    const sq = [
      [-122.0, 37.5],
      [-121.887, 37.5],
      [-121.887, 37.59],
      [-122.0, 37.59],
      [-122.0, 37.5],
    ];
    const p = arrivalPose(sq, [100, 400]);
    expect(p.distanceM).toBeLessThan(ARRIVAL_POSE.distanceM / 3);
    expect(p.targetHeightM).toBeCloseTo(2 * (400 + 0.6792 * 300), 3);
    expect(Math.abs(p.target.lon + 121.94)).toBeLessThan(0.05);
  });
});
