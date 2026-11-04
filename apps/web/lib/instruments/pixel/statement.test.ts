import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pixelSchema, type PixelData } from "./data";
import { pixelFixture } from "./fixture";
import { moreRaises, pixelStatement, trendWord } from "./statement";

// Inside One Pixel's statement from each place's own pixel anatomy bundle and season tables, built as the page builds
// them (fixture.ts), and from the first place's checked-in page data.

const REPO = join(import.meta.dirname, "..", "..", "..", "..", "..");
const read = (p: string): unknown => JSON.parse(readFileSync(join(REPO, p), "utf8"));
const pixelOf = (place: string): PixelData => {
  const paths = [
    ...["pixel-anatomy", "pixel-cells", "pixel-series", "pixel-spectra"].map(
      (f) => `data/bundles/bundle_pixel_anatomy_${place}/${f}.json`,
    ),
    `data/bundles/bundle_season_trend_long_record_${place}/season-trend-long-record-tables.json`,
  ];
  const sources = paths.map((path) => ({ path, sha256: "0".repeat(64) }));
  return pixelSchema.parse(
    pixelFixture(Object.fromEntries(paths.map((p) => [p, read(p)])), sources),
  );
};
const first = pixelSchema.parse(read("apps/web/public/instruments/pixel/pixel.json"));

describe("pixelStatement", () => {
  it("says the first place's pixel got greener, its trend as the detail, and what its trees and fields do", () => {
    expect(pixelStatement(first, "March to June")).toEqual({
      lead: "This pixel got greener from 2000 to 2025.",
      detail: "+0.0570 greenness (NDVI) per decade, March to June",
      note: "Trees and fields cover 46% of it. More trees or fields alone would make it look greener, even if its grassland did not change.",
    });
  });

  it("reads the same from the first place's bundle as from its page data", () => {
    expect(pixelStatement(pixelOf("ait_bouguemez"), "March to June")).toEqual(
      pixelStatement(first, "March to June"),
    );
  });

  it("says Calaveras Creek's pixel got browner, and names its trees alone: it holds no cropland", () => {
    expect(pixelStatement(pixelOf("calaveras_creek"), "February to May")).toEqual({
      lead: "This pixel got browner from 2000 to 2025.",
      detail: "−0.0388 greenness (NDVI) per decade, February to May",
      note: "Trees cover 42% of it. More trees alone would make it look greener, even if its grassland did not change.",
    });
  });

  it("names the season as unstated where the trend cells state none", () => {
    expect(pixelStatement(first, null).detail).toBe(
      "+0.0570 greenness (NDVI) per decade, the recorded season",
    );
  });
});

describe("the statement's parts", () => {
  const t = first.series.pixel_theil_sen;

  it("reads the trend by where its 95% interval lies against zero", () => {
    expect(trendWord(t)).toBe("greener");
    expect(trendWord({ ...t, lower_per_decade: -0.01 })).toBe("flat");
    expect(
      trendWord({ slope_per_decade: -0.03, lower_per_decade: -0.05, upper_per_decade: -0.01 }),
    ).toBe("browner");
    expect(
      pixelStatement(
        {
          ...first,
          series: { ...first.series, pixel_theil_sen: { ...t, lower_per_decade: -0.01 } },
        },
        null,
      ).lead,
    ).toBe("This pixel shows no clear change from 2000 to 2025.");
  });

  it("says more trees or fields raise the mix only where the model says so, with grassland to take from", () => {
    expect(moreRaises(first, [10, 40])).toBe(true);
    // trees as dark as bare ground: more of them darkens the mix, and the note keeps only what covers the pixel
    const dark = {
      ...first,
      classes: first.classes.map((c) =>
        c.code === 10 ? { ...c, median: { ...c.median, B04: 0.2, B08: 0.2 } } : c,
      ),
    };
    expect(moreRaises(dark, [10, 40])).toBe(false);
    expect(pixelStatement(dark, null).note).toBe("Trees and fields cover 46% of it.");
    const noGrass = { ...first, measured_shares: { ...first.measured_shares, "30": 0 } };
    expect(moreRaises(noGrass, [10])).toBe(false);
  });

  it("leaves the note out where no trees or fields cover the pixel", () => {
    const bare = {
      ...first,
      classes: first.classes.map((c) => (c.code === 10 || c.code === 40 ? { ...c, share: 0 } : c)),
    };
    expect(pixelStatement(bare, null).note).toBeNull();
  });
});
