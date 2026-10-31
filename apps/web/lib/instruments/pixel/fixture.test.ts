import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { change, fixed } from "../format";
import { pixelSchema } from "./data";
import { pixelFixture, proposeTransect, theilSenIntercept } from "./fixture";
import { mixSpectra, ndviOf } from "./mix";

// The pixel anatomy's fixture against the S3 bundle (bundle_pixel_anatomy) and the season trend tables it takes the
// band's record from: recomputed here, and the model figure computed live from the class medians and shares.

const WEB = join(import.meta.dirname, "..", "..", "..");
const REPO = join(WEB, "..", "..");
const read = (p: string): unknown => JSON.parse(readFileSync(join(REPO, p), "utf8"));
const fixture = pixelSchema.parse(
  JSON.parse(readFileSync(join(WEB, "public", "instruments", "pixel", "pixel.json"), "utf8")),
);
const B = "data/bundles/bundle_pixel_anatomy_ait_bouguemez";
const TABLES =
  "data/bundles/bundle_season_trend_long_record_ait_bouguemez/season-trend-long-record-tables.json";

describe("pixel.json", () => {
  it("is the S3 bundle and the band's season record, recomputed", () => {
    const sources = Object.fromEntries(fixture.sources.map((s) => [s.path, read(s.path)]));
    expect(fixture).toEqual(pixelFixture(sources as never, fixture.sources));
    expect(fixture.sources.map((s) => s.path).sort()).toEqual(
      [
        `${B}/pixel-anatomy.json`,
        `${B}/pixel-cells.json`,
        `${B}/pixel-series.json`,
        `${B}/pixel-spectra.json`,
        TABLES,
      ].sort(),
    );
  });

  it("models the measured shares live, as the control does, near the bundle's rounded figure", () => {
    const anatomy = read(`${B}/pixel-anatomy.json`) as {
      model: { ndvi_at_measured_composition: number; shift_example: { ndvi: number } };
    };
    const shares = Object.fromEntries(
      fixture.classes.map((k) => [k.code, fixture.measured_shares[String(k.code)] ?? 0]),
    );
    const live = ndviOf(mixSpectra(fixture.classes, shares));
    expect(Math.abs(live - anatomy.model.ndvi_at_measured_composition)).toBeLessThanOrEqual(0.0005);
    expect(fixed(live, 2)).toBe("0.44");
    // the stored figure would print one hundredth higher: never format it
    expect(fixed(anatomy.model.ndvi_at_measured_composition, 2)).toBe("0.45");
    const { from, to, points } = fixture.model.shift;
    const shifted = {
      ...shares,
      [to]: (shares[to] ?? 0) + points / 100,
      [from]: (shares[from] ?? 0) - points / 100,
    };
    const moved = ndviOf(mixSpectra(fixture.classes, shifted));
    expect(fixed(moved, 2)).toBe("0.57");
    expect(change(moved - live, 2)).toBe("+0.13");
    expect(Math.abs(moved - anatomy.model.shift_example.ndvi)).toBeLessThanOrEqual(0.0005);
  });
});

describe("the derived parts", () => {
  it("proposes the specimen's transect by its rule: row 19, ten cells from column 9", () => {
    const cells = read(`${B}/pixel-cells.json`) as Parameters<typeof proposeTransect>[0];
    expect(proposeTransect(cells)).toEqual({
      length_m: 100,
      quadrats: 10,
      spacing_m: 10,
      start_utm29n: [744970, 3505065],
      end_utm29n: [745070, 3505065],
    });
  });

  it("puts the Theil-Sen line through the medians, as scipy's theilslopes does", () => {
    expect(
      theilSenIntercept(
        [
          { year: 2000, ndvi: 1 },
          { year: 2001, ndvi: 2 },
          { year: 2002, ndvi: 4 },
        ],
        1,
      ),
    ).toBe(-1999);
  });
});

describe("the pixel anatomy bundle's two versions (U25r)", () => {
  // 1.1.0 renamed the place-specific fields: footprint_corners with footprint_corners_crs beside it (was
  // footprint_corners_utm29n) and month_ndvi (was june_ndvi); the reader takes either, and each file by its name
  const files = Object.fromEntries(fixture.sources.map((s) => [s.path, read(s.path)]));
  // the bundle on disk is 1.1.0 since the first place's rebuild (c28fd71); each test states both forms from it
  type Anatomy = { version: string; pixel: Record<string, unknown>; [k: string]: unknown };
  const anatomyOf = (src: Record<string, Record<string, unknown>>) =>
    src[`${B}/pixel-anatomy.json`] as Anatomy;
  const v11 = (crs: string) => {
    const src = structuredClone(files) as Record<string, Record<string, unknown>>;
    const a = anatomyOf(src);
    a.version = "1.1.0";
    a.pixel.footprint_corners ??= a.pixel.footprint_corners_utm29n;
    delete a.pixel.footprint_corners_utm29n;
    a.pixel.footprint_corners_crs = crs;
    a.month_ndvi ??= a.june_ndvi;
    delete a.june_ndvi;
    return src;
  };
  const v10 = () => {
    const src = structuredClone(files) as Record<string, Record<string, unknown>>;
    const a = anatomyOf(src);
    a.version = "1.0.0";
    a.pixel.footprint_corners_utm29n ??= a.pixel.footprint_corners;
    delete a.pixel.footprint_corners;
    delete a.pixel.footprint_corners_crs;
    a.june_ndvi ??= a.month_ndvi;
    delete a.month_ndvi;
    return src;
  };

  it("reads the 1.1.0 names the same as the 1.0 names", () => {
    expect(pixelFixture(v11("EPSG:32629") as never, fixture.sources)).toEqual(
      pixelFixture(v10() as never, fixture.sources),
    );
  });

  it("refuses a footprint stated in another CRS than the cells' grid", () => {
    expect(() => pixelFixture(v11("EPSG:32610") as never, fixture.sources)).toThrow(/CRS/);
  });

  it("finds each file by its name, wherever the place's bundle lies", () => {
    const moved = Object.fromEntries(
      Object.entries(files).map(([p, v]) => [p.replace("ait_bouguemez", "another_place"), v]),
    );
    const sources = fixture.sources.map((s) => ({
      ...s,
      path: s.path.replace("ait_bouguemez", "another_place"),
    }));
    expect(pixelFixture(moved as never, sources)).toEqual({
      ...pixelFixture(files as never, fixture.sources),
      sources,
    });
  });
});
