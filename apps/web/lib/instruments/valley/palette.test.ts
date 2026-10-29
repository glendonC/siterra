import { describe, expect, it } from "vitest";
import { sheetColours } from "../../theme/obsidian";
import { hexRgb, ramp, rainColour, snowColour, trendRgba } from "./palette";

const scale = { domain: 0.05, neutral: 0.0025 };

describe("hexRgb", () => {
  it("reads a hex colour as 0 to 1 channels", () => {
    expect(hexRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
  });
});

describe("ramp", () => {
  const stops = ["#000000", "#ffffff"] as const;

  it("returns the end stops at 0 and 1 and clamps beyond them", () => {
    expect(ramp(stops, 0)).toEqual([0, 0, 0]);
    expect(ramp(stops, 1)).toEqual([1, 1, 1]);
    expect(ramp(stops, -3)).toEqual([0, 0, 0]);
    expect(ramp(stops, 7)).toEqual([1, 1, 1]);
  });

  it("interpolates linearly between neighbouring stops", () => {
    expect(ramp(["#000000", "#ffffff", "#000000"], 0.25)).toEqual([0.5, 0.5, 0.5]);
  });
});

describe("trendRgba", () => {
  it("draws slopes within the neutral band as one faint grey", () => {
    expect(trendRgba(0.002, scale)).toEqual([...sheetColours.trendNeutral, 0.16]);
    expect(trendRgba(-0.0025, scale)).toEqual([...sheetColours.trendNeutral, 0.16]);
  });

  it("colours direction by ramp and lets opacity rise with magnitude", () => {
    const up = trendRgba(0.05, scale);
    const down = trendRgba(-0.05, scale);
    expect(up.slice(0, 3)).toEqual(hexRgb(sheetColours.trendAbove[2]));
    expect(down.slice(0, 3)).toEqual(hexRgb(sheetColours.trendBelow[2]));
    expect(up[3]).toBeCloseTo(0.92, 12);
    expect(trendRgba(0.01, scale)[3]).toBeLessThan(up[3]);
  });
});

describe("rainColour and snowColour", () => {
  it("span their ramps over the stated display range", () => {
    expect(rainColour(500)).toEqual(hexRgb(sheetColours.rain[0]));
    expect(rainColour(850)).toEqual(hexRgb(sheetColours.rain[3]));
    expect(snowColour(0)).toEqual(hexRgb(sheetColours.snow[0]));
    expect(snowColour(1)).toEqual(hexRgb(sheetColours.snow[3]));
  });
});
