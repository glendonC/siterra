import { describe, expect, it } from "vitest";
import {
  buildWaterMask,
  decodeRuns,
  encodeRuns,
  waterBodies,
  type WaterLandCover,
} from "./water-mask.ts";

/** A WorldCover grid of one class everywhere but where `water` says water (class 80) or `none` says no reading. */
function worldCover(
  size: number,
  water: (r: number, c: number) => boolean,
  none: (r: number, c: number) => boolean = () => false,
): WaterLandCover {
  const n = size * size;
  const g: WaterLandCover = {
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
