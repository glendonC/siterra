import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { placesSchema } from "./cutaway-data";

/** The place the seed case's cross section spec names first (its placeFeatureIds). */
const SECTION_PLACE = "ctx_tabant";
import { SEASON_TREND_YEARS, figuresSchema, snowSchema } from "./fixtures";
import { PLACE_ON_LINE_M, cutawayTransectSchema, nearestSample, transectFixture } from "./transect";
import { lonLatToUtm } from "./utm";

// The cutaway's own fixtures against their sources: the place against the case record's context features (the
// statements come from the case record's Evidence; lib/instruments/placed-statements.test.ts).

const WEB = join(import.meta.dirname, "..", "..", "..");
const REPO = join(WEB, "..", "..");
const FIXTURES = join(WEB, "public", "instruments", "valley");
const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const places = placesSchema.parse(read(join(FIXTURES, "places.json")));

describe("places.json", () => {
  const caseFile = join(REPO, places.source);
  const record = read(caseFile) as { features: Record<string, unknown>[] };

  it("is the case record file it names, unchanged", () => {
    expect(createHash("sha256").update(readFileSync(caseFile)).digest("hex")).toBe(places.sha256);
  });

  it("copies the section's place from the case record exactly", () => {
    const place = places.places.find((p) => p.id === SECTION_PLACE);
    const feature = record.features.find((f) => f["id"] === SECTION_PLACE);
    expect(place).toBeDefined();
    expect(feature).toMatchObject(place ?? {});
  });
});

describe("the cutaway's figures", () => {
  const figures = figuresSchema.parse(read(join(FIXTURES, "figures.json")));
  const snow = snowSchema.parse(read(join(FIXTURES, "snow.json")));
  const bands = ["elevation_low", "elevation_mid", "elevation_high"] as const;

  it("support 'every 95% interval lies above zero' for the three bands", () => {
    for (const b of bands) expect(figures.season_trend[b].lower).toBeGreaterThan(0);
  });

  it("cover the season trend bundle's first to last season", () => {
    const raw = read(join(FIXTURES, "figures.json")) as { season_trend: { source: string } };
    const bundle = read(join(REPO, raw.season_trend.source)) as {
      period: { first_season: number; last_season: number };
    };
    expect(SEASON_TREND_YEARS).toEqual([bundle.period.first_season, bundle.period.last_season]);
  });

  it("have twelve monthly snow shares for each band", () => {
    for (const b of bands) expect(snow.bands[b]?.monthly_mean).toHaveLength(12);
  });
});

// The section line: the S2 bundle's samples, projected, recomputed here from the bundle's two files (whose
// checksums fixtures.test.ts checks), and passing the case record's place.
describe("transect.json", () => {
  const t = cutawayTransectSchema.parse(read(join(FIXTURES, "transect.json")));

  it("is the S2 bundle's line, recomputed from its two files", () => {
    const [samples, terrain] = t.sources.map((s) => read(join(REPO, s.path)));
    expect(t).toEqual(
      transectFixture(samples as never, terrain as never, t.transect, t.sources, 29),
    );
  });

  it("passes the section's place, as the case record places it, within PLACE_ON_LINE_M", () => {
    const place = places.places.find((p) => p.id === SECTION_PLACE);
    const [E, N] = lonLatToUtm(place?.lonLat[0] ?? 0, place?.lonLat[1] ?? 0, 29);
    expect(nearestSample(t, E, N).offset_m).toBeLessThanOrEqual(PLACE_ON_LINE_M);
  });
});
