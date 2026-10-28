import { describe, expect, it } from "vitest";
import { REGIONS, terrarium, tileRange, tileX, tileY } from "./grids";

describe("terrarium", () => {
  it("decodes sea level and a valley floor height", () => {
    expect(terrarium(128, 0, 0)).toBe(0);
    // 1,800 m: 32768 + 1800 = 34568 = 135 * 256 + 8
    expect(terrarium(135, 8, 0)).toBe(1800);
  });
});

describe("tile coordinates", () => {
  it("puts the valley in the zoom 11 tile block DESIGN B used (x 985 to 990, y 831 to 836)", () => {
    expect(Math.floor(tileX(-6.37, 11))).toBeGreaterThanOrEqual(985);
    expect(Math.floor(tileX(-6.37, 11))).toBeLessThanOrEqual(990);
    expect(Math.floor(tileY(31.66, 11))).toBeGreaterThanOrEqual(831);
    expect(Math.floor(tileY(31.66, 11))).toBeLessThanOrEqual(836);
  });

  it("puts lon 0, lat 0 at the middle of the world", () => {
    expect(tileX(0, 1)).toBeCloseTo(1, 12);
    expect(tileY(0, 1)).toBeCloseTo(1, 12);
  });
});

describe("REGIONS", () => {
  it("nests the High Atlas patch inside the Morocco patch", () => {
    const [m, a] = REGIONS;
    if (!m || !a) throw new Error("two regions expected");
    expect(a.box[0]).toBeGreaterThan(m.box[0]);
    expect(a.box[1]).toBeGreaterThan(m.box[1]);
    expect(a.box[2]).toBeLessThan(m.box[2]);
    expect(a.box[3]).toBeLessThan(m.box[3]);
  });
});

describe("tileRange", () => {
  it("covers exactly the one tile a box drawn on its edges describes (data/map z6)", () => {
    expect(tileRange([-11.25, 27.0591, -5.625, 31.9522], 6)).toEqual({
      tx0: 30,
      tx1: 30,
      ty0: 26,
      ty1: 26,
    });
  });
});
