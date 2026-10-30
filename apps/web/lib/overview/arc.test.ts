import { describe, expect, it } from "vitest";
import {
  ARC,
  REST_SPAN,
  SPAN,
  arcAlpha,
  labelAt,
  labelSide,
  outward,
  spanAt,
  uOf,
  wireTo,
} from "./arc";

describe("the arc's clock", () => {
  it("spans 252 degrees from 236 over the top to 128", () => {
    expect(SPAN).toBe(252);
    expect(uOf(ARC.a0)).toBe(0);
    expect(uOf(0)).toBe(124);
    expect(uOf(ARC.a1)).toBe(252);
  });

  it("points outward on screen: up at 0, right at 90, left at 270 (y down)", () => {
    const r = (v: { ux: number; uy: number }) => [Math.round(v.ux) + 0, Math.round(v.uy) + 0];
    expect(r(outward(0))).toEqual([0, -1]);
    expect(r(outward(90))).toEqual([1, 0]);
    expect(r(outward(270))).toEqual([-1, 0]);
    // a roll turns the clock: the pixel at 52 comes round to 90
    expect(r(outward(52, 38))).toEqual([1, 0]);
  });
});

describe("the arc's opacity", () => {
  it("is nothing at both ends and its peak between the fades", () => {
    expect(arcAlpha(0)).toBe(0);
    expect(arcAlpha(SPAN)).toBe(0);
    expect(arcAlpha(124)).toBeCloseTo(ARC.peak, 10);
    expect(arcAlpha(ARC.fa / 2)).toBeCloseTo(ARC.peak / 2, 10);
  });

  it("draws back to just past the opened finding and shortens its opening fade for the ask", () => {
    expect(spanAt(0, 0, 0, 52)).toEqual(REST_SPAN);
    expect(spanAt(1, 0, 0, 52)).toEqual({ end: uOf(52) + 10, fadeOut: 10, fadeIn: ARC.fa });
    expect(spanAt(0, 1, 0, 52).fadeIn).toBe(16);
  });
});

describe("labels beside their dots", () => {
  it("sit beyond the dot along the outward direction", () => {
    const left = labelSide(-0.81, -0.59); // catchment, 306
    expect(left).toEqual({ side: "left", rise: "above" });
    expect(labelSide(0.53, -0.85)).toEqual({ side: "right", rise: "above" }); // band, 32
    expect(labelSide(0.93, 0.37)).toEqual({ side: "right", rise: "middle" }); // rain, 112
    expect(labelAt({ x: 500, y: 300 }, { w: 200, h: 60, nh: 38 }, left)).toEqual({
      x: 270,
      y: 222,
    });
  });

  it("join the dot to the numeral's nearest corner by a hairline starting 7 px out", () => {
    const w = wireTo(
      { x: 0, y: 0 },
      { left: 30, top: -40, right: 130, bottom: -2 },
      { side: "right", rise: "above" },
    );
    expect(w.x2).toBe(26);
    expect(w.y2).toBe(0);
    expect(w.x1).toBeCloseTo(7, 10);
  });
});
