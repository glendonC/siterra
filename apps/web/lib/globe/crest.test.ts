import { describe, expect, it } from "vitest";
import { crestCurve, findCrest, fit2 } from "./crest";
import type { Grid } from "./renderer";

describe("fit2", () => {
  it("recovers an exact parabola", () => {
    const pts: [number, number][] = [-9, -8, -7, -6, -5, -4].map((x) => [
      x,
      30 + 0.2 * x + 0.01 * x * x,
    ]);
    const [a, b, c] = fit2(pts);
    expect(a).toBeCloseTo(30, 6);
    expect(b).toBeCloseTo(0.2, 6);
    expect(c).toBeCloseTo(0.01, 6);
  });
});

describe("findCrest", () => {
  it("finds a ridge along a line of latitude in a synthetic world grid", () => {
    // 0.08 degree cells, a ridge 3,000 m high along 31.6 N, flat elsewhere
    const w = 4500;
    const h = 2250;
    const data = new Float32Array(w * h * 2);
    const ridge = Math.round((90 - 31.6) / 0.08 - 0.5);
    for (let j = ridge - 1; j <= ridge + 1; j++)
      for (let i = 0; i < w; i++) data[(j * w + i) * 2] = 3000;
    const grid: Grid = { w, h, box: [-180, -90, 180, 90], data };
    const crest = findCrest(grid);
    expect(crest.length).toBe(28);
    // ties between equal 5 x 5 sums keep the southernmost latitude, up to two grid cells south of the ridge
    for (const [, lat] of crest) expect(Math.abs(lat - 31.6)).toBeLessThan(0.2);
  });
});

describe("crestCurve", () => {
  it("passes through the case", () => {
    const crest: [number, number][] = [-9, -8, -7, -6, -5, -4].map((x) => [x, 31 + 0.05 * x]);
    const curve = crestCurve(crest, { lon: -6.5, lat: 31.64 });
    const near = curve.reduce((b, p) => (Math.abs(p[0] + 6.5) < Math.abs(b[0] + 6.5) ? p : b));
    expect(near[1]).toBeCloseTo(31.64, 2);
  });
});
