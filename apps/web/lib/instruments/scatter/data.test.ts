import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixed } from "../format";
import { NDVI_STEPS, RAIN_STEPS, axisRange, scatterFrom } from "./data";

// The rainfall scatter from the restrend bundle's two files, as the rainfall scatter spec names them.

const B = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "data",
  "bundles",
  "bundle_restrend_long_record_ait_bouguemez",
);
const read = (name: string): unknown => JSON.parse(readFileSync(join(B, name), "utf8"));
const tables = read("restrend-long-record-tables.json");
const summary = read("restrend-long-record.json");
const d = scatterFrom(tables, summary);

describe("scatterFrom", () => {
  it("pairs the 26 seasons' March to June greenness with the September to May total before each", () => {
    expect(d.seasons).toHaveLength(26);
    expect(d.period).toEqual([2000, 2025]);
    expect(d.seasons[0]).toEqual({ year: 2000, ndvi: 0.19614, rain_mm: 570.17 });
  });

  it("takes every total from the bundle's primary window (September to May here), never the November to April one", () => {
    expect(d.windows).toEqual({ growing: "mar_jun", rainfall: "sep_may" });
    const rows = (
      tables as {
        rainfall: { stratum: string; rainfall_window: string; year: number; rainfall_mm: number }[];
      }
    ).rainfall.filter((r) => r.stratum === "catchment");
    for (const s of d.seasons) {
      const at = (w: string) => rows.find((r) => r.year === s.year && r.rainfall_window === w);
      expect(s.rain_mm).toBe(at("sep_may")?.rainfall_mm);
      const other = rows.find((r) => r.year === s.year && r.rainfall_window !== "sep_may");
      if (other) expect(other.rainfall_mm).not.toBe(s.rain_mm);
    }
  });

  it("carries the fit the summary states: R squared 0.037, a slope interval that holds zero", () => {
    expect(fixed(d.fit.r_squared, 3)).toBe("0.037");
    expect(d.fit.lower).toBeLessThan(0);
    expect(d.fit.upper).toBeGreaterThan(0);
    expect(d.fit.interval_above_zero).toBe(false);
    expect(d.status).toBe("precondition_not_met");
  });

  it("marks the four driest seasons, driest first", () => {
    expect(d.driest.map((s) => [s.year, Math.round(s.rain_mm)])).toEqual([
      [2001, 369],
      [2024, 391],
      [2016, 419],
      [2023, 421],
    ]);
  });

  it("refuses a summary that disagrees with the tables", () => {
    const other = { headline: { catchment: { rainfall_fit_r_squared: 0.5, n: 26 } } };
    expect(() => scatterFrom(tables, other)).toThrow();
  });
});

describe("scatterFrom on the second place (U25)", () => {
  const C = join(B, "..", "bundle_restrend_long_record_calaveras_creek");
  const c = scatterFrom(
    JSON.parse(readFileSync(join(C, "restrend-long-record-tables.json"), "utf8")),
    JSON.parse(readFileSync(join(C, "restrend-long-record.json"), "utf8")),
  );
  it("draws Calaveras Creek's own windows, February to May against October to April", () => {
    expect(c.windows).toEqual({ growing: "feb_may", rainfall: "oct_apr" });
    expect(c.seasons.length).toBeGreaterThan(14);
    expect(c.period).toEqual([2000, 2025]);
  });
});

describe("the scatter's axes from each place's own values (U25)", () => {
  it("give the first place the approved axes", () => {
    expect(
      axisRange(
        d.seasons.map((s) => s.rain_mm),
        RAIN_STEPS,
      ),
    ).toEqual({ lo: 300, hi: 1000, step: 100 });
    expect(
      axisRange(
        d.seasons.map((s) => s.ndvi),
        NDVI_STEPS,
      ),
    ).toEqual({ lo: 0.18, hi: 0.23, step: 0.01 });
  });

  it("hold every season of the second place inside them", () => {
    const C = join(B, "..", "bundle_restrend_long_record_calaveras_creek");
    const c = scatterFrom(
      JSON.parse(readFileSync(join(C, "restrend-long-record-tables.json"), "utf8")),
      JSON.parse(readFileSync(join(C, "restrend-long-record.json"), "utf8")),
    );
    const rain = axisRange(
      c.seasons.map((s) => s.rain_mm),
      RAIN_STEPS,
    );
    const ndvi = axisRange(
      c.seasons.map((s) => s.ndvi),
      NDVI_STEPS,
    );
    for (const s of c.seasons) {
      expect(s.rain_mm).toBeGreaterThanOrEqual(rain.lo);
      expect(s.rain_mm).toBeLessThanOrEqual(rain.hi);
      expect(s.ndvi).toBeGreaterThanOrEqual(ndvi.lo);
      expect(s.ndvi).toBeLessThanOrEqual(ndvi.hi);
    }
    expect((rain.hi - rain.lo) / rain.step).toBeLessThanOrEqual(8);
  });
});
