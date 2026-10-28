import { describe, expect, it } from "vitest";
import { arrivalSettledAfter, arrivalTiming } from "./arrival-sequence";

describe("arrival sequence", () => {
  it("lands the parts in the approved order", () => {
    const order = (["name", "outlet", "villages", "study", "command", "instruments"] as const).map(
      (p) => arrivalTiming(p, false).delayMs,
    );
    expect(order).toEqual([800, 1400, 2200, 3000, 3300, 3600]);
  });

  it("lands names one after another about a second apart", () => {
    const gaps = [
      arrivalTiming("outlet", false).delayMs - arrivalTiming("name", false).delayMs,
      arrivalTiming("villages", false).delayMs - arrivalTiming("outlet", false).delayMs,
      arrivalTiming("study", false).delayMs - arrivalTiming("villages", false).delayMs,
    ];
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(600);
  });

  it("settles about 4 s after arrival, and cross-fades at once under reduced motion", () => {
    expect(arrivalSettledAfter(false)).toBeCloseTo(4.0, 9);
    expect(arrivalTiming("study", true)).toEqual({ delayMs: 0, durationMs: 150 });
    expect(arrivalSettledAfter(true)).toBe(0.15);
  });
});
