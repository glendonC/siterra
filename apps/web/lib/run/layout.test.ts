import { describe, expect, it } from "vitest";
import { along, centreOf, clockFraction, cursorPointsOf, lanesOf, outward } from "./layout";
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
  costMicroUsd: null,
  steps: [],
  searchedChips: [],
  activeTarget: null,
  activeLabel: null,
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

  it("places parallel agent cursors in non-overlapping valley zones", () => {
    const centre = { x: 640, y: 400 };
    const radius = 300;
    const tasks: RunTask[] = [
      {
        ...task("obs-ndvi", 6_000, null),
        kind: "observation_analysis",
        sublabel: "NDVI & trend recipes",
        activeLabel: "Computing vegetation trend",
        activeTarget: {
          kind: "land",
          stratumId: "valley_floor",
          bundleId: "bundle_1",
          recipeId: "ndvi_trend",
          sourceId: null,
          pages: [],
          sections: [],
          queryTerms: [],
        },
      },
      {
        ...task("obs-rain", 6_000, null),
        kind: "observation_analysis",
        sublabel: "Terrain & rainfall",
        activeLabel: "Checking rainfall & terrain",
        activeTarget: {
          kind: "bundle",
          stratumId: null,
          bundleId: "bundle_chirps",
          recipeId: "chirps_season",
          sourceId: null,
          pages: [],
          sections: [],
          queryTerms: [],
        },
      },
      {
        ...task("src-read", 8_000, null),
        kind: "source_reading",
        activeLabel: "Reading Aakairi et al. 2026",
        activeTarget: {
          kind: "source",
          stratumId: null,
          bundleId: null,
          recipeId: null,
          sourceId: "src_1",
          pages: [4],
          sections: [],
          queryTerms: [],
        },
      },
    ];
    const pts = cursorPointsOf(tasks, centre, radius, "src-read");
    expect(pts).toHaveLength(3);
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        const a = pts[i]?.at;
        const b = pts[j]?.at;
        expect(a).toBeDefined();
        expect(b).toBeDefined();
        if (!a || !b) continue;
        const overlaps = Math.abs(a.x - b.x) < 200 && Math.abs(a.y - b.y) < 55;
        expect(overlaps).toBe(false);
      }
    }
  });
});
