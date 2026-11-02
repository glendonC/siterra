import { describe, expect, it } from "vitest";
import { benjaminiHochberg, mannKendall, theilSen, trendDirection } from "./trend-stats.ts";

// Expected values from science/pipeline/trend_stats.py run on the same series (2 Nov 2026), so a live place is
// tested exactly as the studied valleys are.
const years = Array.from({ length: 26 }, (_, i) => 2000 + i);
const rising = [
  0.41, 0.43, 0.4, 0.44, 0.45, 0.43, 0.47, 0.46, 0.44, 0.48, 0.47, 0.49, 0.46, 0.5, 0.51, 0.49,
  0.52, 0.5, 0.53, 0.52, 0.55, 0.51, 0.54, 0.56, 0.55, 0.57,
];
const falling = [
  0.6, 0.58, 0.61, 0.59, 0.6, 0.57, 0.58, 0.6, 0.56, 0.59, 0.57, 0.58, 0.55, 0.57, 0.56, 0.58, 0.54,
  0.56, 0.55, 0.53, 0.56, 0.54, 0.52, 0.55, 0.53, 0.52,
];
const flat = [
  0.3, 0.31, 0.3, 0.3, 0.32, 0.31, 0.3, 0.29, 0.31, 0.3, 0.3, 0.31, 0.29, 0.3, 0.31, 0.3, 0.3, 0.32,
  0.29, 0.3, 0.31, 0.3, 0.3, 0.29, 0.31, 0.3,
];

describe("theilSen", () => {
  it("matches the science pipeline's slope and Sen 95% interval", () => {
    const r = theilSen(years, rising);
    const f = theilSen(years, falling);
    const z = theilSen(years, flat);
    if (!r || !f || !z) throw new Error("expected a slope for every series");
    expect(r.slope).toBeCloseTo(0.005882352941176472, 12);
    expect(r.lower).toBeCloseTo(0.0050000000000000044, 12);
    expect(r.upper).toBeCloseTo(0.006666666666666672, 12);
    expect(r.pairs).toBe(325);
    expect(f.slope).toBeCloseTo(-0.0028571428571428545, 12);
    expect(f.lower).toBeCloseTo(-0.0037499999999999895, 12);
    expect(f.upper).toBeCloseTo(-0.0023076923076923096, 12);
    expect(z.slope).toBeCloseTo(0, 12);
    expect(z.lower).toBeCloseTo(-0.0005000000000000004, 12);
    expect(z.upper).toBeCloseTo(0, 12);
  });

  it("returns null without two distinct years", () => {
    expect(theilSen([2001, 2001], [0.2, 0.3])).toBeNull();
  });
});

describe("mannKendall", () => {
  it("matches the science pipeline's S, tie-corrected variance, Z and p", () => {
    const a = mannKendall(rising);
    expect(a.s).toBe(268);
    expect(a.varS).toBeCloseTo(2049.3333333333335, 9);
    expect(a.z).toBeCloseTo(5.898002595191209, 9);
    expect(a.p / 3.679281894522131e-9).toBeCloseTo(1, 5);
    const b = mannKendall(falling);
    expect(b.s).toBe(-220);
    expect(b.varS).toBeCloseTo(2026, 9);
    expect(b.z).toBeCloseTo(-4.865465465447168, 9);
    expect(b.p / 1.1418774919711722e-6).toBeCloseTo(1, 5);
    const c = mannKendall(flat);
    expect(c.s).toBe(-29);
    expect(c.varS).toBeCloseTo(1735.6666666666667, 9);
    expect(c.z).toBeCloseTo(-0.672086032518596, 9);
    expect(c.p).toBeCloseTo(0.5015289279362588, 6);
  });
});

describe("benjaminiHochberg", () => {
  it("matches the science pipeline's step-up decisions", () => {
    expect(benjaminiHochberg([0.001, 0.2, 0.03, 0.04, 0.012, 0.5, 0.049, 0.008], 0.05)).toEqual([
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
  });
});

describe("trendDirection", () => {
  it("reads direction from the interval", () => {
    expect(trendDirection(0.001, 0.004)).toBe("upward");
    expect(trendDirection(-0.004, -0.001)).toBe("downward");
    expect(trendDirection(-0.001, 0.004)).toBe("includes_zero");
  });
});
