import { describe, expect, it } from "vitest";
import { makeFrame, makeHeightSampler, type Grid } from "./frame";

const origin = { origin_E: 752030, origin_N: 3501980 };

describe("makeFrame", () => {
  const f = makeFrame(origin, { exag: 1.5, base: 1200 });

  it("puts the origin at x = z = 0, the base elevation at y = 0, in kilometres", () => {
    expect(f.x(752030)).toBe(0);
    expect(f.z(3501980)).toBe(0);
    expect(f.y(1200)).toBe(0);
    expect(f.x(753030)).toBe(1);
  });

  it("points z south and scales y by the stated vertical exaggeration", () => {
    expect(f.z(3500980)).toBe(1);
    expect(f.y(2200)).toBeCloseTo(1.5, 12);
    expect(f.v(753030, 3500980, 2200)).toEqual([1, 1.5, 1]);
  });

  it("inverts its own mapping", () => {
    expect(f.E(f.x(733020))).toBeCloseTo(733020, 6);
    expect(f.N(f.z(3516980))).toBeCloseTo(3516980, 6);
  });

  it("gives a grid's outer rectangle in model x, z", () => {
    const g: Grid = { E0: 733020, N0: 3516980, res: 30, width: 1268, height: 1000 };
    const [x0, z0, x1, z1] = f.rect(g);
    expect(x0).toBeCloseTo(-19.01, 9);
    expect(z0).toBeCloseTo(-15, 9);
    expect(x1).toBeCloseTo(-19.01 + 38.04, 9);
    expect(z1).toBeCloseTo(-15 + 30, 9);
  });
});

describe("makeHeightSampler", () => {
  // 3 x 2 cells of 10 m, row 0 north: heights 0 10 20 / 100 110 120
  const g: Grid = { E0: 0, N0: 20, res: 10, width: 3, height: 2 };
  const H = new Float32Array([0, 10, 20, 100, 110, 120]);
  const at = makeHeightSampler(H, g);

  it("returns a cell's value at its centre", () => {
    expect(at(5, 15)).toBe(0);
    // the last row and column are clamped a millionth of a cell inside, so the far centre is within 1e-3
    expect(at(15, 5)).toBeCloseTo(110, 3);
  });

  it("interpolates bilinearly between cell centres", () => {
    expect(at(10, 15)).toBeCloseTo(5, 6);
    expect(at(10, 10)).toBeCloseTo(55, 6);
  });

  it("clamps outside the grid to the edge cells", () => {
    expect(at(-50, 15)).toBeCloseTo(0, 6);
    expect(at(25, -40)).toBeCloseTo(120, 3);
  });
});
