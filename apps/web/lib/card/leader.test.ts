import { describe, expect, it } from "vitest";
import { LEADER_ANCHOR_DY, LEADER_RUN_PX, leaderGeometry, nearestOnOutline } from "./leader";

describe("leaderGeometry", () => {
  it("leaves the card level with its line, runs left, then goes straight to the place", () => {
    const g = leaderGeometry(1000, 200, { x: 600, y: 500 }, "dot");
    const y = 200 + LEADER_ANCHOR_DY;
    expect(g.d).toBe(
      `M1000.0 ${y.toFixed(1)} L${(1000 - LEADER_RUN_PX).toFixed(1)} ${y.toFixed(1)} L600.0 500.0`,
    );
    expect(g.dot).toEqual({ x: 600, y: 500 });
    expect(g.tick).toBeUndefined();
  });

  it("ends on the outline with a 12 px tick across the last segment", () => {
    // last segment straight down from (972, 212) to (972, 412): the tick runs left to right
    const g = leaderGeometry(1000, 200, { x: 972, y: 412 }, "tick");
    expect(g.tick).toBe("M978.0 412.0 L966.0 412.0");
    expect(g.dot).toBeUndefined();
  });
});

describe("nearestOnOutline", () => {
  it("picks the closest projected point", () => {
    expect(
      nearestOnOutline(
        [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
          { x: 50, y: 50 },
        ],
        { x: 12, y: 9 },
      ),
    ).toEqual({ x: 10, y: 10 });
  });

  it("has no answer for an empty outline", () => {
    expect(nearestOnOutline([], { x: 0, y: 0 })).toBeUndefined();
  });
});
