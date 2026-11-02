import { describe, expect, it } from "vitest";
import { lonLatToUtm } from "../instruments/valley/utm";
import {
  buildWaterMask,
  decodeRuns,
  encodeRuns,
  overviewDataFromTerrain,
  utmToGridMapper,
  waterBodies,
  type LandCoverGrid,
  type TerrainFile,
} from "./terrain";

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

/** A WorldCover grid of one class everywhere but where `water` says water (class 80) or `none` says no reading. */
function worldCover(
  size: number,
  water: (r: number, c: number) => boolean,
  none: (r: number, c: number) => boolean = () => false,
): LandCoverGrid {
  const n = size * size;
  const g: LandCoverGrid = {
    width: size,
    height: size,
    tree: new Array<number>(n).fill(0),
    crop: new Array<number>(n).fill(0),
    grass: new Array<number>(n).fill(0),
    water: new Array<number>(n).fill(0),
    bare: new Array<number>(n).fill(0),
  };
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const q = r * size + c;
      if (none(r, c)) continue;
      if (water(r, c)) (g.water as number[])[q] = 255;
      else (g.grass as number[])[q] = 255;
    }
  return g;
}

describe("water mask", () => {
  it("round-trips its run-length encoding and refuses runs of the wrong length", () => {
    const mask = new Uint8Array([1, 1, 0, 0, 0, 1, 0, 1, 1, 1]);
    const runs = encodeRuns(mask);
    expect(runs).toEqual([0, 2, 3, 1, 1, 3]);
    expect(decodeRuns(runs, 10)).toEqual(mask);
    expect(decodeRuns(runs, 11)).toBeNull();
  });

  it("levels a flat water body at its median and a sloping sea floor at its 90th percentile", () => {
    const mask = new Uint8Array([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1]);
    const elev = [-9, -3, 5, 5, -6, 0, 5, 5, 5, 5, 5, 310, 5, 5, 5, 330];
    const { body, levels } = waterBodies(mask, elev, 4, 4);
    expect(body[0]).toBe(body[5]);
    expect(body[11]).toBe(body[15]);
    expect(body[0]).not.toBe(body[11]);
    // the sea floor -9 to 0 m is not flat: its 90th percentile; the lake is flat at 310 m with one shore cell
    expect(levels).toEqual([-3, 310]);
  });

  it("takes WorldCover water and the sea beyond its tiles, not low land, and drops a steep shore", () => {
    const size = 64;
    const elev: number[] = [];
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        // west strip: a lake at 310 m whose WorldCover pixels also cover a shore rising to 330 m (columns 8 to 9)
        if (c < 8) elev.push(310);
        else if (c < 10) elev.push(330);
        // middle: a polder 2 m below sea level that WorldCover calls land
        else if (c >= 20 && c < 30) elev.push(-2);
        // east strip: open sea beyond WorldCover's tiles, the sea floor as the DEM holds it
        else if (c >= 54) elev.push(-12 + (63 - c));
        else elev.push(40);
      }
    const lc = worldCover(
      size,
      (_r, c) => c < 10,
      (_r, c) => c >= 54,
    );
    const { mask, source } = buildWaterMask(elev, size, size, lc);
    expect(source).toBe("worldcover_terrarium");
    const at = (r: number, c: number) => mask[r * size + c];
    expect(at(30, 3)).toBe(1); // the lake
    expect(at(30, 9)).toBe(0); // the shore inside a WorldCover water pixel, 20 m above the lake
    expect(at(30, 25)).toBe(0); // the polder
    expect(at(30, 60)).toBe(1); // the sea
    expect(at(30, 40)).toBe(0); // land
  });

  it("without WorldCover, takes ground at or below 0 m reaching the box edge, not a closed hollow", () => {
    const size = 32;
    const elev: number[] = [];
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        if (c < 6) elev.push(-5);
        else if (r > 12 && r < 18 && c > 16 && c < 22) elev.push(-3);
        else elev.push(12);
      }
    const { mask, source } = buildWaterMask(elev, size, size);
    expect(source).toBe("terrarium");
    expect(mask[15 * size + 2]).toBe(1);
    expect(mask[15 * size + 19]).toBe(0);
  });
});

describe("water in the overview", () => {
  it("draws water flat at its level and leaves it out of the land's range", async () => {
    const t = eastRamp();
    const size = 256;
    const mask = new Uint8Array(size * size);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < 60; c++) {
        mask[r * size + c] = 1;
        // a lake whose DEM holds its bed, from 900 m in the west up to 980 m at the shore; the land starts at 1000 m
        t.elevations[r * size + c] = 900 + (80 * c) / 59;
      }
    t.waterMask = { runs: encodeRuns(mask), source: "worldcover_terrarium" };
    const overview = await overviewDataFromTerrain(t);
    // the land's own range: the lake bed is not land
    expect(overview.range.min).toBeGreaterThanOrEqual(975);
    const water = overview.water;
    if (!water) throw new Error("no water grid");
    const g = overview.meta.relief;
    const midLat = (BBOX[1] + BBOX[3]) / 2;
    const cellAt = (f: number) => {
      const [E, N] = lonLatToUtm(BBOX[0] + f * (BBOX[2] - BBOX[0]), midLat, overview.zone);
      return Math.round((g.N0 - N) / g.res - 0.5) * g.width + Math.round((E - g.E0) / g.res - 0.5);
    };
    // two places on the lake: both water, both drawn at one level near the shore, not at the bed under them
    const a = cellAt(0.03);
    const b = cellAt(0.15);
    expect(water[a]).toBe(255);
    expect(water[b]).toBe(255);
    expect(overview.relief[a]).toBe(overview.relief[b]);
    expect(overview.relief[a]).toBeGreaterThan(960);
  });
});
