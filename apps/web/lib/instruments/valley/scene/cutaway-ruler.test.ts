import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cutawayRuler } from "./cutaway";

// The cutaway's ruler follows the section: specimen B's ruler on the valley, a fitting one on another land.

const web = (p: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../../../public/instruments/valley/${p}`, import.meta.url), "utf8"),
  );
const ring = (web("catchment.json") as { ring: [number, number][] }).ring;
const h = (web("transect.json") as { h: number[] }).h;

describe("cutawayRuler", () => {
  it("is specimen B's ruler on the valley: 1,300 to 3,300 m, ticks every 100 m, labels every 500 m", () => {
    const r = cutawayRuler({
      catchment: { ring },
      range: { min: 1463.82, max: 4001.64, median: 2588.64 },
      transect: { h } as never,
    });
    expect(r).toEqual({
      base: 1200,
      from: 1300,
      top: 3300,
      step: 100,
      every: 500,
      labels: [1500, 2000, 2500, 3000],
    });
  });

  it("labels a low section at a rounder small step", () => {
    const r = cutawayRuler({
      catchment: { ring },
      range: { min: 120, max: 640, median: 300 },
      transect: { h: [150, 380, 610] } as never,
    });
    expect(r.base).toBe(0);
    expect(r.every).toBe(200);
    expect(r.top).toBe(640);
    expect(r.labels).toEqual([200, 400, 600]);
  });
});
