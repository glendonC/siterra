import { describe, expect, it } from "vitest";
import { along, centreOf, clockFraction, lanesOf, outward } from "./layout";
import type { RunTask } from "./model";

const task = (id: string, start: number, end: number | null): RunTask => ({
  id,
  kind: "observation_analysis",
  state: end === null ? "running" : "succeeded",
  model: "Muse Spark",
  calls: 1,
  running: 0,
  tools: 0,
  failedTools: 0,
  queuedMs: start,
  startMs: start,
  endMs: end,
});

describe("the run's place on the arc (U29)", () => {
  it("fills the arc with the run's length once done, and leaves room ahead while it runs", () => {
    expect(clockFraction(50_000, 100_000, true)).toBe(0.5);
    expect(clockFraction(100_000, 100_000, true)).toBe(1);
    expect(clockFraction(10_000, 10_000, false)).toBeCloseTo(1 / 3);
    expect(clockFraction(40_000, 40_000, false)).toBe(0.8);
    // a recording's known length holds the arc still while it plays
    expect(clockFraction(25_000, 30_000, false, 100_000)).toBe(0.25);
  });

  it("walks the arc's points and finds its centre", () => {
    const pts = [0, 90, 180].map((deg) => ({
      x: 100 + 50 * Math.sin((deg * Math.PI) / 180),
      y: 100 - 50 * Math.cos((deg * Math.PI) / 180),
    }));
    expect(along(pts, 0)).toEqual(pts[0]);
    expect(along(pts, 1)).toEqual(pts[2]);
    const c = centreOf(pts);
    expect(c.x).toBeCloseTo(100);
    expect(c.y).toBeCloseTo(100);
    const o = outward({ x: 150, y: 100 }, c, 10);
    expect(o.x).toBeCloseTo(160);
  });

  it("gives tasks running at once their own lanes, and frees a lane when its task ends", () => {
    const lanes = lanesOf(
      [
        task("plan", 0, 5_000),
        task("a", 6_000, 20_000),
        task("b", 6_000, 15_000),
        task("c", 16_000, null),
      ],
      30_000,
    );
    expect(lanes.get("plan")).toBe(0);
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(1);
    expect(lanes.get("c")).toBe(1);
  });
});
