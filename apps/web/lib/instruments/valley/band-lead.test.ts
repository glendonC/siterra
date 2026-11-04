import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bandLead, type BandTrend } from "./band-lead";
import { figuresSchema } from "./fixtures";

const VALLEY = join(import.meta.dirname, "..", "..", "..", "public", "instruments", "valley");

const t = (per_decade: number, lower: number, upper: number): BandTrend => ({
  per_decade,
  lower,
  upper,
});

describe("the cutaway's headline from the band trends", () => {
  it("names the seed case's lowest band, where greenness rose most, and finds every interval above zero", () => {
    const figures = figuresSchema.parse(
      JSON.parse(readFileSync(join(VALLEY, "figures.json"), "utf8")),
    );
    expect(bandLead(figures.season_trend)).toEqual({
      band: "elevation_low",
      direction: "rose",
      clear: "up",
    });
  });

  it("names the largest rise even where another band fell, and does not call the bands clear", () => {
    expect(
      bandLead({
        elevation_high: t(-0.004, -0.009, 0.001),
        elevation_mid: t(0.006, 0.001, 0.011),
        elevation_low: t(0.002, -0.003, 0.007),
      }),
    ).toEqual({ band: "elevation_mid", direction: "rose", clear: "mixed" });
  });

  it("names the largest fall where no band rose", () => {
    expect(
      bandLead({
        elevation_high: t(-0.002, -0.004, -0.0005),
        elevation_mid: t(-0.008, -0.012, -0.004),
        elevation_low: t(-0.001, -0.003, -0.0002),
      }),
    ).toEqual({ band: "elevation_mid", direction: "fell", clear: "down" });
  });

  it("keeps the face's order on a tie", () => {
    expect(
      bandLead({
        elevation_high: t(0.005, 0.001, 0.009),
        elevation_mid: t(0.005, -0.001, 0.011),
        elevation_low: t(0.001, -0.002, 0.004),
      }).band,
    ).toBe("elevation_high");
  });
});
