import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rainCellsFrom, seasonTrendFrom, snowFrom } from "./derive";
import { figuresSchema, rainCellsSchema, snowSchema } from "./fixtures";

// The builders the instruments run on the case's assets give the committed fixtures exactly.

const WEB = join(import.meta.dirname, "..", "..", "..");
const read = (...p: string[]): unknown => JSON.parse(readFileSync(join(...p), "utf8"));
const fixture = (name: string) => read(WEB, "public", "instruments", "valley", name);
const bundle = (path: string) => read(WEB, "..", "..", "data", "bundles", path);

describe("seasonTrendFrom", () => {
  it("gives figures.json's season trend from the season trend summary", () => {
    const summary = bundle(
      "bundle_season_trend_long_record_ait_bouguemez/season-trend-long-record.json",
    );
    expect(seasonTrendFrom(summary)).toEqual(
      figuresSchema.parse(fixture("figures.json")).season_trend,
    );
  });
});

describe("snowFrom", () => {
  it("gives snow.json from the snow tables", () => {
    const tables = bundle("bundle_snow_cover_by_band_ait_bouguemez/snow-cover-by-band-tables.json");
    expect(snowFrom(tables)).toEqual(snowSchema.parse(fixture("snow.json")));
  });
});

describe("rainCellsFrom", () => {
  it("gives rain-cells.json from the CHIRPS rainfall cells", () => {
    const geo = bundle("bundle_chirps_monthly_ait_bouguemez/rainfall-cells.geojson");
    expect(rainCellsFrom(geo, 29)).toEqual(rainCellsSchema.parse(fixture("rain-cells.json")));
  });
});
