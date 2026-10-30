import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extentKm, landFrame, longAxisBearing } from "./geometry";

// A land is framed from its own outline and heights; the D4 valley's hand-set values come out of its own geometry.

const ring = (
  JSON.parse(
    readFileSync(
      new URL("../../public/instruments/valley/catchment.json", import.meta.url),
      "utf8",
    ),
  ) as { ring: [number, number][] }
).ring;
const valley = { min: 1463.82, max: 4001.64, median: 2588.64 };

describe("landFrame", () => {
  it("gives the D4 valley the base, target, walls and ceiling it was drawn with", () => {
    const f = landFrame(ring, valley);
    expect(f.base).toBe(1200);
    expect(f.target).toBeCloseTo(2400, -1);
    expect(f.wall).toBeCloseTo(900, -1);
    expect(f.rimFoot).toBeCloseTo(450, -1);
    expect(f.ceiling).toBeCloseTo(4100, -1);
    expect(f.kmScale).toBeCloseTo(1, 2);
    // its long axis runs north-east to south-west, about where D4 set its bearing (52 degrees)
    expect(f.bearing).toBeGreaterThan(50);
    expect(f.bearing).toBeLessThan(60);
  });

  it("follows another land's own shape and heights", () => {
    // a land 10 km long running north to south, from 100 to 700 m
    const tall: [number, number][] = [
      [0, 0],
      [2000, 0],
      [2000, 10000],
      [0, 10000],
      [0, 0],
    ];
    const f = landFrame(tall, { min: 100, max: 700, median: 400 });
    expect(longAxisBearing(tall)).toBeCloseTo(0, 5);
    expect(extentKm(tall)).toBeCloseTo(Math.hypot(2, 10), 6);
    expect(f.base).toBe(0);
    expect(f.target).toBeCloseTo(322, 0);
    expect(f.ceiling).toBeCloseTo(724, 0);
    expect(f.kmScale).toBeLessThan(0.25);
    // a land running east to west is looked along from the east
    const wide = tall.map(([x, y]): [number, number] => [y, x]);
    expect(longAxisBearing(wide)).toBeCloseTo(90, 5);
  });
});
