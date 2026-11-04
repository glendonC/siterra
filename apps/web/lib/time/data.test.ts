import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  changeTimingFrom,
  labelShown,
  domainOf,
  driestFrom,
  pixelCellsFrom,
  regionalScanFrom,
  seasonCubeFrom,
  snowFrom,
  strataFrom,
  valueAt,
} from "./data";

// Both places' own bundles, as data/bundles holds them (the read API serves the same bytes).
const B = join(import.meta.dirname, "..", "..", "..", "..", "data", "bundles");
const json = (p: string) => JSON.parse(readFileSync(join(B, p), "utf8")) as unknown;
const bin = (p: string) => {
  const b = readFileSync(join(B, p));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

for (const place of ["ait_bouguemez", "calaveras_creek"] as const) {
  describe(`Year by Year from ${place}'s own records`, () => {
    const cube = seasonCubeFrom(
      bin(`bundle_pixel_seasons_${place}/pixel-seasons.bin`),
      json(`bundle_pixel_seasons_${place}/pixel-seasons.bin.json`),
    );
    const cells = pixelCellsFrom(
      json(
        `bundle_pixel_trend_long_record_${place}/pixel-trend-mar_jun-cells.json`.replace(
          "mar_jun",
          place === "ait_bouguemez" ? "mar_jun" : "feb_may",
        ),
      ),
    );
    const summary = json(`bundle_pixel_seasons_${place}/pixel-seasons.json`) as {
      per_season: { year: number; pixels_with_value: number }[];
    };

    it("reads 26 seasons on the trend cells' own grid, each season's count as the bundle states it", () => {
      expect(cube.seasons).toHaveLength(26);
      for (const [s, row] of summary.per_season.entries()) {
        const n = cells.filter((c) => !Number.isNaN(valueAt(cube, s, c.row, c.col))).length;
        expect(n, String(row.year)).toBe(row.pixels_with_value);
      }
    });

    it("draws on a scale its own values fill", () => {
      const [lo, hi] = domainOf(summary);
      expect(lo).toBeLessThan(hi);
      expect((lo * 100) % 5).toBeCloseTo(0);
    });

    it("finds the four driest seasons by its own rainfall window", () => {
      const d = driestFrom(
        json(`bundle_restrend_long_record_${place}/restrend-long-record-tables.json`),
      );
      expect(d).toHaveLength(4);
      expect(d.map((x) => x.mm)).toEqual([...d.map((x) => x.mm)].sort((a, b) => a - b));
    });

    it("reads the catchment and its three bands at its own growing window, with their trends", () => {
      const s = strataFrom(
        json(`bundle_season_trend_long_record_${place}/season-trend-long-record.json`),
      );
      expect(s.map((x) => x.id)).toEqual([
        "catchment",
        "elevation_low",
        "elevation_mid",
        "elevation_high",
      ]);
      for (const x of s) {
        expect(x.ndvi.size).toBe(26);
        expect(x.slopePerDecade).not.toBeNull();
      }
    });
  });
}

describe("the first place's figures, as the lead checked them", () => {
  it("names 2001, 2024, 2016 and 2023 as the driest seasons", () => {
    const d = driestFrom(
      json("bundle_restrend_long_record_ait_bouguemez/restrend-long-record-tables.json"),
    );
    expect(d.map((x) => [x.year, Math.round(x.mm)])).toEqual([
      [2001, 369],
      [2024, 391],
      [2016, 419],
      [2023, 421],
    ]);
  });

  it("gives the catchment +0.0091 and the bands +0.0134, +0.0072, +0.0070 NDVI per decade", () => {
    const s = strataFrom(
      json("bundle_season_trend_long_record_ait_bouguemez/season-trend-long-record.json"),
    );
    expect(s.map((x) => (x.slopePerDecade ?? 0).toFixed(4))).toEqual([
      "0.0091",
      "0.0134",
      "0.0072",
      "0.0070",
    ]);
  });
});

describe("snow", () => {
  it("whitens the first place's bands month by month at the bundle's own threshold", () => {
    const s = snowFrom(
      json("bundle_snow_cover_by_band_ait_bouguemez/snow-cover-by-band.json"),
      json("bundle_snow_cover_by_band_ait_bouguemez/snow-cover-by-band-tables.json"),
    );
    expect(s?.bands).toEqual(["elevation_low", "elevation_mid", "elevation_high"]);
    expect(s?.months.size).toBe(300);
  });

  it("draws none where the bundle records the snow recipe as not applicable", () => {
    expect(
      snowFrom(
        json("bundle_snow_cover_by_band_calaveras_creek/snow-cover-by-band.json"),
        json("bundle_snow_cover_by_band_calaveras_creek/snow-cover-by-band-tables.json"),
      ),
    ).toBeNull();
  });
});

describe("labelShown", () => {
  it("groups a height's thousands and leaves the rest of the record's words", () => {
    expect(labelShown("below 2317 m")).toBe("below 2,317 m");
    expect(labelShown("2317 to 2815 m")).toBe("2,317 to 2,815 m");
    expect(labelShown("below 698 m")).toBe("below 698 m");
  });
});

describe("changeTimingFrom (7C) and regionalScanFrom (7B)", () => {
  it("parses Pettitt change-point timing and regional scan for Aït Bouguemez", () => {
    const summary = json("bundle_pixel_seasons_ait_bouguemez/pixel-seasons.json");
    const ct = changeTimingFrom(summary);
    expect(ct.method).toBe("pettitt_1979_nonparametric_single_changepoint");
    expect(ct.testedPixels).toBe(8094);
    expect(ct.upwardFdrPixels).toBe(1165);
    expect(ct.downwardFdrPixels).toBe(1);
    expect(ct.medianYearUpward).toBe(2011);
    expect(ct.medianYearAllUpward).toBe(2010);
    expect(ct.cellsChangeYear).toHaveLength(8094);
    expect(ct.byYear).toHaveLength(26);

    const rs = regionalScanFrom(summary);
    expect(rs.windowTotalPixels).toBe(23056);
    expect(rs.windowTestedPixels).toBe(23056);
    expect(rs.inCatchment).toEqual({
      testedPixels: 8094,
      upwardTrendFdrShare: 0.2401,
      upwardTrendFdrPixels: 1943,
      medianSlopePerDecade: 0.00757,
    });
    expect(rs.outsideCatchment).toEqual({
      testedPixels: 14962,
      upwardTrendFdrShare: 0.0856,
      upwardTrendFdrPixels: 1281,
      medianSlopePerDecade: 0.00392,
    });
    expect(
      rs.zones.map((z) => ({
        group: z.group,
        rank: z.rank,
        upwardChangepointFdrPixels: z.upwardChangepointFdrPixels,
        medianChangeYear: z.medianChangeYear,
      })),
    ).toEqual([
      {
        group: "elevation_low",
        rank: 1,
        upwardChangepointFdrPixels: 924,
        medianChangeYear: 2010,
      },
      {
        group: "elevation_mid",
        rank: 2,
        upwardChangepointFdrPixels: 351,
        medianChangeYear: 2011,
      },
      {
        group: "elevation_high",
        rank: 3,
        upwardChangepointFdrPixels: 63,
        medianChangeYear: 2014,
      },
    ]);
  });

  it("parses Pettitt change-point timing and regional scan for Calaveras Creek with null shift year when 0 upward FDR pixels", () => {
    const summary = json("bundle_pixel_seasons_calaveras_creek/pixel-seasons.json");
    const ct = changeTimingFrom(summary);
    expect(ct.method).toBe("pettitt_1979_nonparametric_single_changepoint");
    expect(ct.testedPixels).toBe(5166);
    expect(ct.upwardFdrPixels).toBe(0);
    expect(ct.downwardFdrPixels).toBe(0);
    expect(ct.medianYearUpward).toBeNull();
    expect(ct.medianYearAllUpward).toBe(2015);
    expect(ct.cellsChangeYear).toHaveLength(5166);
    expect(ct.byYear).toHaveLength(26);

    const rs = regionalScanFrom(summary);
    expect(rs.windowTotalPixels).toBe(37625);
    expect(rs.windowTestedPixels).toBe(33297);
    expect(rs.inCatchment.testedPixels).toBe(5166);
    expect(rs.inCatchment.upwardTrendFdrShare).toBe(0);
    expect(rs.outsideCatchment.testedPixels).toBe(28131);
    expect(rs.outsideCatchment.upwardTrendFdrShare).toBe(0.0051);
    for (const z of rs.zones) {
      expect(z.upwardChangepointFdrPixels).toBe(0);
      expect(z.medianChangeYear).toBeNull();
    }
  });
});
