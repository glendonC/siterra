import { describe, expect, it } from "vitest";
import { mixSpectra, moveBoundary, ndviOf, type ClassSpectrum } from "./mix";

const classes: ClassSpectrum[] = [
  { code: 10, median: { B04: 0.04, B08: 0.44 } },
  { code: 30, median: { B04: 0.2, B08: 0.28 } },
];

describe("mixSpectra and ndviOf", () => {
  it("weights each band by the class shares", () => {
    const r = mixSpectra(classes, { 10: 0.25, 30: 0.75 });
    expect(r["B04"]).toBeCloseTo(0.25 * 0.04 + 0.75 * 0.2);
    expect(r["B08"]).toBeCloseTo(0.25 * 0.44 + 0.75 * 0.28);
  });

  it("computes NDVI from red B04 and near-infrared B08", () => {
    expect(ndviOf({ B04: 0.1, B08: 0.3 })).toBeCloseTo(0.5);
  });
});

describe("moveBoundary", () => {
  const order = [10, 30, 60];
  const shares = { 10: 0.4, 30: 0.5, 60: 0.1 };

  it("moves share from the right class to the left one and keeps the sum", () => {
    const next = moveBoundary(order, shares, 0, 0.1);
    expect(next[10]).toBeCloseTo(0.5);
    expect(next[30]).toBeCloseTo(0.4);
    expect(next[60]).toBeCloseTo(0.1);
  });

  it("stops at the end of either class", () => {
    expect(moveBoundary(order, shares, 1, 0.5)[60]).toBe(0);
    expect(moveBoundary(order, shares, 1, -0.9)[30]).toBe(0);
  });
});
