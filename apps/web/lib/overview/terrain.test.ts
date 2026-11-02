import { describe, expect, it } from "vitest";
import { lonLatToUtm } from "../instruments/valley/utm";
import { overviewDataFromTerrain, utmToGridMapper, type TerrainFile } from "./terrain";

const BBOX: [number, number, number, number] = [-74.124532, 40.622899, -73.887508, 40.802561];

/** A 256 x 256 version 2 grid that rises 500 m from the west edge to the east edge. */
function eastRamp(): TerrainFile {
  const size = 256;
  const elevations: number[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      elevations.push(Number((1000 + (500 * c) / (size - 1)).toFixed(1)));
  const [w, s, e, n] = BBOX;
  return {
    version: 2,
    gridSize: size,
    width: size,
    height: size,
    bbox: BBOX,
    minElevationM: 1000,
    maxElevationM: 1500,
    elevations,
    catchmentRing: [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ],
    streamPaths: [],
  };
}

describe("terrain grid to overview relief", () => {
  it("maps a UTM point back to its place on the lon/lat grid", () => {
    const zone = 18;
    const toGrid = utmToGridMapper(BBOX, zone, 256, 256);
    for (const [fc, fr] of [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
      [0.13, 0.87],
    ] as const) {
      const lon = BBOX[0] + fc * (BBOX[2] - BBOX[0]);
      const lat = BBOX[3] - fr * (BBOX[3] - BBOX[1]);
      const [E, N] = lonLatToUtm(lon, lat, zone);
      const [col, row] = toGrid(E, N);
      expect(col).toBeCloseTo(fc * 255, 3);
      expect(row).toBeCloseTo(fr * 255, 3);
    }
  });

  it("puts each relief cell's height at that cell's own place, not stretched index to index", async () => {
    const overview = await overviewDataFromTerrain(eastRamp());
    const g = overview.meta.relief;
    const midLat = (BBOX[1] + BBOX[3]) / 2;
    const heightAt = (lon: number) => {
      const [E, N] = lonLatToUtm(lon, midLat, overview.zone);
      const c = Math.round((E - g.E0) / g.res - 0.5);
      const r = Math.round((g.N0 - N) / g.res - 0.5);
      return overview.relief[r * g.width + c] ?? NaN;
    };
    const widthM =
      lonLatToUtm(BBOX[2], midLat, overview.zone)[0] -
      lonLatToUtm(BBOX[0], midLat, overview.zone)[0];
    const perCell = (500 * g.res) / widthM; // the ramp's rise over one relief cell, about 2 m
    for (const f of [0.02, 0.25, 0.5, 0.75, 0.98]) {
      const lon = BBOX[0] + f * (BBOX[2] - BBOX[0]);
      expect(Math.abs(heightAt(lon) - (1000 + 500 * f))).toBeLessThanOrEqual(1.5 + perCell);
    }
  });
});
