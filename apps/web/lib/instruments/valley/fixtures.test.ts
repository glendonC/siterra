import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bandLimitsOf } from "../../land/record";
import { seed } from "../seed-listing";
import {
  RAIN_REFERENCE_YEARS,
  SNOW_YEARS,
  WORLDCOVER,
  catchmentSchema,
  figuresSchema,
  layoutSchema,
  rainCellsSchema,
  riversSchema,
  snowSchema,
  terrainMetaSchema,
  trendCellsSchema,
} from "./fixtures";
import { RAIN_RANGE } from "./palette";

// The valley fixtures must be the record's numbers: each is recomputed here from the bundles in data/bundles,
// and every bundle file a fixture names as its source must still have the checksum the fixture recorded.

const WEB = join(import.meta.dirname, "..", "..", "..");
const REPO = join(WEB, "..", "..");
const FIXTURES = join(WEB, "public", "instruments", "valley");

/** True when `stored` is `exact` rounded to `decimals` places (half a unit in the last place, plus float noise). */
const roundsTo = (stored: number | undefined, exact: number, decimals: number) =>
  stored !== undefined && Math.abs(stored - exact) <= 0.5 * 10 ** -decimals + 1e-9;

const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const fixture = (name: string): unknown => read(join(FIXTURES, name));
const bundle = (path: string): unknown => read(join(REPO, "data", "bundles", path));
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

interface SourceRef {
  at: string;
  path: string;
  sha256: string;
}

/** Every { source | path, sha256 } pair in a fixture that points into data/bundles. */
function bundleSources(value: unknown, at = ""): SourceRef[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => bundleSources(v, `${at}[${i}]`));
  if (value === null || typeof value !== "object") return [];
  const o = value as Record<string, unknown>;
  const here: SourceRef[] = [];
  for (const key of ["source", "path"]) {
    const p = o[key];
    if (typeof p === "string" && p.startsWith("data/bundles/") && typeof o["sha256"] === "string")
      here.push({ at: `${at}.${key}`, path: p, sha256: o["sha256"] });
  }
  return [...here, ...Object.entries(o).flatMap(([k, v]) => bundleSources(v, `${at}.${k}`))];
}

const jsonFixtures = readdirSync(FIXTURES).filter((n) => n.endsWith(".json"));

describe("valley fixtures", () => {
  it("publish no absolute local path", () => {
    const leaks = jsonFixtures.filter((n) =>
      /"\/(?:Users|home|private)\//.test(readFileSync(join(FIXTURES, n), "utf8")),
    );
    expect(leaks).toEqual([]);
  });

  it("name bundle sources whose checksums still match", () => {
    const refs = jsonFixtures.flatMap((n) =>
      bundleSources(fixture(n)).map((r) => ({ ...r, at: `${n}${r.at}` })),
    );
    expect(refs.length).toBeGreaterThanOrEqual(6);
    const stale = refs.filter((r) => sha256(join(REPO, r.path)) !== r.sha256).map((r) => r.at);
    expect(stale).toEqual([]);
  });

  it("parse as the instruments expect", () => {
    const meta = terrainMetaSchema.parse(fixture("terrain-meta.json"));
    expect(readFileSync(join(FIXTURES, meta.relief.file)).byteLength).toBe(
      meta.relief.width * meta.relief.height * 4,
    );
    catchmentSchema.parse(fixture("catchment.json"));
    riversSchema.parse(fixture("rivers.json"));
    layoutSchema.parse(fixture("layout-a.json"));
  });
});

describe("record values named in code", () => {
  it("the record's band limits are the strata bundle's boundaries", () => {
    const c = bundle("bundle_terrain_strata_ait_bouguemez/collection.json") as {
      "siterra:method": { parameters: { boundaries_m: number[] } };
    };
    expect(c["siterra:method"].parameters.boundaries_m).toEqual(bandLimitsOf(seed));
  });

  it("the rain reference period is the one the CHIRPS cells' monthly means name", () => {
    const geo = bundle("bundle_chirps_monthly_ait_bouguemez/rainfall-cells.geojson") as {
      features: { properties: Record<string, unknown> }[];
    };
    const key = `reference_mm_${String(RAIN_REFERENCE_YEARS[0])}_${String(RAIN_REFERENCE_YEARS[1])}`;
    expect(geo.features.every((f) => typeof f.properties[key] === "object")).toBe(true);
  });

  it("the snow years are the first and last of the snow tables' months", () => {
    const t = bundle("bundle_snow_cover_by_band_ait_bouguemez/snow-cover-by-band-tables.json") as {
      rows: { catchment: { month: string }[] };
    };
    const months = t.rows.catchment.map((r) => r.month).sort();
    expect([months[0]?.slice(0, 4), months.at(-1)?.slice(0, 4)]).toEqual(SNOW_YEARS.map(String));
  });

  it("the trend period is the bundle's first and last season", () => {
    const pt = bundle(
      "bundle_pixel_trend_long_record_ait_bouguemez/pixel-trend-long-record.json",
    ) as { period: { first_season: number; last_season: number } };
    const trend = trendCellsSchema.parse(fixture("trend-cells.json"));
    expect(trend.period).toEqual([pt.period.first_season, pt.period.last_season]);
  });

  it("the land cover map is WorldCover 2021 on the 10 m grid", () => {
    const meta = terrainMetaSchema.parse(fixture("terrain-meta.json"));
    const sources = (fixture("terrain-meta.json") as { sources: { worldcover: { path: string } } })
      .sources;
    expect(meta.analysis.res).toBe(WORLDCOVER.res);
    expect(sources.worldcover.path).toContain(`worldcover-${String(WORLDCOVER.year)}`);
  });
});

describe("figures.json", () => {
  const figures = figuresSchema.parse(fixture("figures.json"));

  it("carries the season trend bundle's March to June OLS slopes and intervals", () => {
    const st = bundle(
      "bundle_season_trend_long_record_ait_bouguemez/season-trend-long-record.json",
    ) as {
      results: {
        stratum: string;
        growing_window: string;
        reliability: string;
        ols: Record<string, number>;
      }[];
    };
    for (const stratum of [
      "catchment",
      "elevation_low",
      "elevation_mid",
      "elevation_high",
    ] as const) {
      const row = st.results.find(
        (r) =>
          r.stratum === stratum &&
          r.growing_window === "mar_jun" &&
          r.reliability === "reliability_0_1",
      );
      expect(row, stratum).toBeDefined();
      expect(figures.season_trend[stratum]).toMatchObject({
        per_decade: row?.ols["slope_per_decade"],
        lower: row?.ols["lower_per_decade"],
        upper: row?.ols["upper_per_decade"],
      });
    }
  });

  it("carries the pixel trend bundle's March to June catchment shares and connected areas", () => {
    const pt = bundle(
      "bundle_pixel_trend_long_record_ait_bouguemez/pixel-trend-long-record.json",
    ) as {
      windows_summary: {
        mar_jun: {
          catchment: Record<string, number>;
          connected_areas_fdr: { upward_fdr_count: number; downward_fdr_count: number };
        };
      };
    };
    const s = pt.windows_summary.mar_jun;
    expect(figures.pixel_trend).toEqual({
      ...figures.pixel_trend,
      modis_pixels_touched: s.catchment["modis_pixels_touched"],
      increasing_fdr_share: s.catchment["increasing_fdr_share"],
      decreasing_fdr_share: s.catchment["decreasing_fdr_share"],
      fdr_q: s.catchment["fdr_q"],
      upward_fdr_clusters: s.connected_areas_fdr.upward_fdr_count,
      downward_fdr_clusters: s.connected_areas_fdr.downward_fdr_count,
    });
  });

  it("carries the rainfall fit and the four driest September to May seasons", () => {
    const head = bundle("bundle_restrend_long_record_ait_bouguemez/restrend-long-record.json") as {
      headline: { catchment: { rainfall_fit_r_squared: number } };
    };
    const tables = bundle(
      "bundle_restrend_long_record_ait_bouguemez/restrend-long-record-tables.json",
    ) as {
      rainfall: { stratum: string; rainfall_window: string; year: number; rainfall_mm: number }[];
    };
    expect(figures.restrend.rainfall_fit_r_squared).toBe(
      head.headline.catchment.rainfall_fit_r_squared,
    );
    const driest = tables.rainfall
      .filter((r) => r.stratum === "catchment" && r.rainfall_window === "sep_may")
      .sort((a, b) => a.rainfall_mm - b.rainfall_mm)
      .slice(0, 4)
      .map((r) => ({ season: r.year, mm: r.rainfall_mm }));
    expect(figures.restrend.driest_sep_may).toEqual(driest);
  });
});

describe("trend-cells.json", () => {
  const trend = trendCellsSchema.parse(fixture("trend-cells.json"));

  it("holds every catchment pixel's March to June slope from the pixel trend tables", () => {
    const tables = bundle(
      "bundle_pixel_trend_long_record_ait_bouguemez/pixel-trend-long-record-tables.json",
    ) as { pixels_by_window: { mar_jun: { slope_per_decade: number }[] } };
    const want = tables.pixels_by_window.mar_jun
      .map((p) => p.slope_per_decade)
      .sort((a, b) => a - b);
    const got = trend.cells.map((c) => c[8]).sort((a, b) => a - b);
    expect(trend.count).toBe(want.length);
    expect(got).toEqual(want);
  });

  it("uses the bundle's fixed display scale", () => {
    const pt = bundle(
      "bundle_pixel_trend_long_record_ait_bouguemez/pixel-trend-long-record.json",
    ) as { display: { domain_per_decade: [number, number]; neutral_per_decade: number } };
    expect(trend.display_scale.domain_per_decade).toEqual(pt.display.domain_per_decade);
    expect(trend.display_scale.neutral_per_decade).toBe(pt.display.neutral_per_decade);
  });
});

describe("rain-cells.json", () => {
  const rain = rainCellsSchema.parse(fixture("rain-cells.json"));
  const geo = bundle("bundle_chirps_monthly_ait_bouguemez/rainfall-cells.geojson") as {
    features: {
      properties: {
        cell_id: string;
        fraction_inside: number;
        weight: number;
        reference_mm_1991_2020: Record<string, number>;
      };
    }[];
  };
  const SEP_MAY = ["09", "10", "11", "12", "01", "02", "03", "04", "05"];

  it("sums the nine September to May monthly means of each CHIRPS cell, 1991 to 2020", () => {
    expect(rain.cells).toHaveLength(geo.features.length);
    for (const f of geo.features) {
      const p = f.properties;
      const cell = rain.cells.find((c) => c.id === p.cell_id);
      const sum = SEP_MAY.reduce((s, m) => s + (p.reference_mm_1991_2020[m] ?? Number.NaN), 0);
      expect(
        roundsTo(cell?.sep_may_mm, sum, 1),
        `${p.cell_id} ${String(cell?.sep_may_mm)} ${sum}`,
      ).toBe(true);
      expect(cell?.fraction_inside, p.cell_id).toBe(p.fraction_inside);
    }
  });

  it("falls inside the sheet's display range", () => {
    for (const c of rain.cells) {
      expect(c.sep_may_mm).toBeGreaterThanOrEqual(RAIN_RANGE.lo);
      expect(c.sep_may_mm).toBeLessThanOrEqual(RAIN_RANGE.hi);
    }
  });
});

describe("snow.json", () => {
  const snow = snowSchema.parse(fixture("snow.json"));
  const tables = bundle(
    "bundle_snow_cover_by_band_ait_bouguemez/snow-cover-by-band-tables.json",
  ) as { rows: Record<string, { month: string; status: string; "ndsi_0.2": number | null }[]> };

  it("holds each band's mean monthly snow-covered share over the available months", () => {
    for (const [band, b] of Object.entries(snow.bands)) {
      const rows = tables.rows[band] ?? [];
      expect(rows.length, band).toBeGreaterThan(0);
      for (let m = 1; m <= 12; m++) {
        const used = rows.filter(
          (r) =>
            Number(r.month.slice(5, 7)) === m && r.status === "available" && r["ndsi_0.2"] !== null,
        );
        const mean = used.reduce((s, r) => s + (r["ndsi_0.2"] ?? 0), 0) / used.length;
        expect(b.years_used[m - 1], `${band} ${m}`).toBe(used.length);
        expect(roundsTo(b.monthly_mean[m - 1], mean, 4), `${band} ${m} ${mean}`).toBe(true);
      }
    }
  });
});
