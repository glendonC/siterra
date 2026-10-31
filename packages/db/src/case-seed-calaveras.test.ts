import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCaseSeed } from "./case-seed.ts";
import { statedRainfallWindow } from "./rainfall-window-testing.ts";
import type { Pool } from "./client.ts";
import { startDemoSession } from "./demo-sessions.ts";
import { listSeedCases } from "./seed-cases.ts";
import { loadSeedCase } from "./seed.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";

// The second place, Calaveras Creek, in data/case/calaveras-creek/: its seed reads from the shared
// bundle catalog without a word of the first place, and both seed cases are listed and startable.

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const base = { repoDir, mode: "concept" as const, ownerScopeId: "seed" };
const calaveras = readCaseSeed({
  ...base,
  seedDir: "data/case/calaveras-creek",
  importedAt: "2026-10-30T13:00:00Z",
});
const ait = readCaseSeed({ ...base, importedAt: "2026-10-30T12:00:00Z" });

let db: TestDatabase;
let pool: Pool;

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
});

afterAll(async () => {
  await db.drop();
});

describe("the Calaveras Creek seed", () => {
  it("verifies every pinned file and imports its thirteen bundles and no bundle of another place", () => {
    expect(calaveras.issues).toEqual([]);
    expect(calaveras.seed?.caseRecord.id).toBe("case_calaveras_creek");
    expect(calaveras.seed?.bundles.map((b) => b.dataBundle.id).sort()).toEqual([
      "bundle_chirps_monthly_calaveras_creek",
      "bundle_drainage_network_calaveras_creek",
      "bundle_land_cover_calaveras_creek",
      "bundle_pixel_anatomy_calaveras_creek",
      "bundle_pixel_seasons_calaveras_creek",
      "bundle_pixel_trend_long_record_calaveras_creek",
      "bundle_relief_calaveras_creek",
      "bundle_restrend_long_record_calaveras_creek",
      "bundle_season_trend_long_record_calaveras_creek",
      "bundle_snow_cover_by_band_calaveras_creek",
      "bundle_species_occurrences_calaveras_creek",
      "bundle_terrain_strata_calaveras_creek",
      "bundle_transects_calaveras_creek",
    ]);
    expect(ait.seed?.bundles.map((b) => b.dataBundle.id).join(" ")).not.toContain("calaveras");
  });

  it("holds the place, the geometry of its own catchment and one outlet", () => {
    const seed = calaveras.seed;
    expect(seed?.caseRecord.place).toEqual({
      name: "Calaveras Creek catchment",
      region: "Diablo Range, California",
    });
    expect(seed?.geoSelections.map((g) => [g.id, g.revision])).toEqual([
      ["geo_calaveras_creek_catchment", 2],
    ]);
    expect(seed?.contextFeatures.filter((f) => f.role === "outlet").map((f) => f.id)).toEqual([
      "ctx_catchment_outlet",
    ]);
    expect(seed?.contextFeatures.filter((f) => f.role === "drainage")).toHaveLength(4);
  });

  it("reads every measurement row from its bundle asset, beside the rainfall months the bundle itself lists", () => {
    const measurements = calaveras.seed?.bundles.flatMap((b) => b.measurements) ?? [];
    expect(measurements.every((m) => m.caseId === "case_calaveras_creek")).toBe(true);
    const metrics = measurements.map((m) => m.metric);
    const count = (metric: string) => metrics.filter((m) => m === metric).length;
    expect(count("ndvi_rainfall_adjusted_trend_per_decade")).toBe(3);
    expect(count("ndvi_trend_unadjusted_per_decade")).toBe(4);
    for (const metric of [
      "rainfall_fit_r_squared",
      "ndvi_pixel_trend_median_per_decade",
      "area_share_downward_fdr",
      "area_share_upward_fdr",
      "drainage_segments",
      "drainage_length_total",
      "drainage_max_strahler_order",
      "drainage_outlet_upstream_area",
    ]) {
      expect(count(metric)).toBe(1);
    }
  });

  it("copies the stored value and interval of the catchment trend, none computed", () => {
    const asset = JSON.parse(
      readFileSync(
        `${repoDir}data/bundles/bundle_restrend_long_record_calaveras_creek/restrend-long-record.json`,
        "utf8",
      ),
    ) as {
      headline: {
        catchment: {
          residual_trend_per_decade: number;
          lower_per_decade: number;
          upper_per_decade: number;
        };
      };
    };
    const measurement = calaveras.seed?.bundles
      .flatMap((b) => b.measurements)
      .find(
        (m) =>
          m.metric === "ndvi_rainfall_adjusted_trend_per_decade" &&
          m.dataBundleId === "bundle_restrend_long_record_calaveras_creek" &&
          m.id.includes("residual_trend_catchment"),
      );
    const stored = asset.headline.catchment;
    expect(measurement?.value).toBe(stored.residual_trend_per_decade);
    expect(measurement?.uncertainty).toMatchObject({
      kind: "interval",
      lower: stored.lower_per_decade,
      upper: stored.upper_per_decade,
    });
  });

  it("composes the rainfall scatter from the place's configuration, its R squared read from the bundle", () => {
    expect(calaveras.seed?.evidence).toEqual([]);
    const scatter = calaveras.seed?.instruments.find((i) => i.id === "inst_rainfall_scatter_creek");
    expect(scatter?.caption.ink).toBe(
      "R squared 0.181 between October to April rainfall and February to May greenness.",
    );
    expect(JSON.stringify(calaveras.seed?.instruments)).not.toMatch(/ait_bouguemez/);
  });

  describe("the instruments of the land (layer stack, cross section, pixel anatomy)", () => {
    const read = (bundle: string, file: string): unknown =>
      JSON.parse(
        readFileSync(`${repoDir}data/bundles/bundle_${bundle}_calaveras_creek/${file}`, "utf8"),
      );
    /** The number a path of keys and indexes names in a parsed file; it throws when there is none. */
    const at = (document: unknown, ...path: (string | number)[]): number => {
      let node: unknown = document;
      for (const key of path) {
        node = (node as Record<string | number, unknown> | undefined)?.[key];
      }
      if (typeof node !== "number") throw new Error(`no number at ${path.join("/")}`);
      return node;
    };
    const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(4)}`;
    const instruments = calaveras.seed?.instruments ?? [];
    const spec = (id: string) => instruments.find((i) => i.id === id);

    it("composes all three from the Calaveras bundles, with only the field plan blocked until a merge exists", () => {
      expect(instruments.map((i) => i.id)).toEqual([
        "inst_layer_stack_creek",
        "inst_cross_section_creek",
        "inst_pixel_anatomy_creek",
        "inst_rainfall_scatter_creek",
      ]);
      expect(calaveras.blocked.map((b) => [b.ruleId, b.kind])).toEqual([
        ["field_plan_creek", "field_plan"],
      ]);
      expect(JSON.stringify(instruments)).not.toMatch(/ait_bouguemez/);
    });

    it("words each caption from the stored numbers, with no direction chosen in the words", () => {
      const trend = read("restrend_long_record", "restrend-long-record.json");
      const season = read("season_trend_long_record", "season-trend-long-record.json");
      const transects = read("transects", "terrain-transects.json");
      const anatomy = read("pixel_anatomy", "pixel-anatomy.json");
      expect(spec("inst_layer_stack_creek")?.caption.ink).toBe(
        `${signed(at(trend, "headline", "catchment", "unadjusted_trend_per_decade", 0))} NDVI per decade, February to May, 2000 to 2025`,
      );
      expect(spec("inst_cross_section_creek")?.caption.ink).toBe(
        `${signed(at(season, "results", 4, "ols", "slope_per_decade"))} NDVI per decade below ${String(Math.round(at(transects, "transects", "valley_axis", "band_crossings", 0, "boundary_m")))} m, February to May, 2000 to 2025`,
      );
      expect(spec("inst_pixel_anatomy_creek")?.caption.ink).toBe(
        `The own trend of this 250 m pixel is ${signed(at(anatomy, "trend", "slope_per_decade"))} NDVI per decade, February to May, 2000 to 2025.`,
      );
      expect(spec("inst_pixel_anatomy_creek")?.caption.grey).toContain(
        `${String(Math.round(at(anatomy, "composition", 0, "share") * 100))}% tree cover and ${String(Math.round(at(anatomy, "composition", 2, "share") * 100))}% grassland`,
      );
      const words = instruments
        .filter((i) => i.id !== "inst_rainfall_scatter_creek")
        .map((i) => `${i.caption.ink} ${i.caption.grey}`)
        .join(" ");
      expect(words).not.toMatch(
        /greener|browner|degrad|declin|improv|recover|above zero|below zero|every interval/i,
      );
      // The layer stack names both directions of change it counts, not one.
      const grey = spec("inst_layer_stack_creek")?.caption.grey ?? "";
      expect(grey).toContain("rising");
      expect(grey).toContain("falling");
    });

    it("states the rainfall window the rain layer sums: the one the trend bundle states as its primary", () => {
      const layers = spec("inst_layer_stack_creek")?.parameters;
      if (layers?.kind !== "layer_stack") throw new Error("not a layer stack");
      const restrend = read("restrend_long_record", "restrend-long-record.json") as Parameters<
        typeof statedRainfallWindow
      >[0];
      expect(layers.rainfallWindow).toEqual(statedRainfallWindow(restrend));
      expect(layers.rainfallWindow?.id).toBe("oct_apr");
    });

    it("leaves snow cover out of the layer stack (the recipe does not apply here) and draws the place's own assets", () => {
      const layers = spec("inst_layer_stack_creek")?.parameters;
      if (layers?.kind !== "layer_stack") throw new Error("not a layer stack");
      expect(layers.layers.map((l) => l.layer)).toEqual([
        "vegetation_trend",
        "rainfall",
        "land_cover",
        "elevation_bands",
      ]);
      expect(layers.drainageFeatureIds).toEqual([
        "ctx_drainage_order_1",
        "ctx_drainage_order_2",
        "ctx_drainage_order_3",
        "ctx_drainage_order_4",
      ]);
      const section = spec("inst_cross_section_creek")?.parameters;
      if (section?.kind !== "cross_section") throw new Error("not a cross section");
      expect(section.transectFeatureId).toBe("ctx_transect_valley_axis");
      expect(section.statements).toEqual([]);
      for (const p of [layers, section]) {
        for (const d of p.drawnAssets ?? []) {
          expect(d.asset.bundleId, d.role).toMatch(/_calaveras_creek$/);
        }
      }
      const roles = (id: string) => {
        const p = spec(id)?.parameters;
        return p !== undefined && p.kind !== "field_plan"
          ? (p.drawnAssets ?? []).map((d) => d.role)
          : [];
      };
      expect(roles("inst_layer_stack_creek")).toContain("land_cover_raster");
      expect(roles("inst_layer_stack_creek")).toContain("trend_cells");
      expect(roles("inst_cross_section_creek")).toContain("land_cover_header");
      expect(roles("inst_pixel_anatomy_creek")).toEqual([
        "pixel_cells",
        "pixel_spectra",
        "pixel_series",
        "catchment_outline",
        "trend_cells",
      ]);
    });
  });
});

describe("both places in one database", () => {
  it("lists the two seed cases in the order they were made, each with its place and outlet", async () => {
    if (ait.seed === null || calaveras.seed === null) throw new Error("seed not read");
    await loadSeedCase(pool, ait.seed, "seed");
    await loadSeedCase(pool, calaveras.seed, "seed");
    const listed = await listSeedCases(pool, "seed");
    expect(listed.map((c) => c.caseId)).toEqual(["case_aitbouguemez", "case_calaveras_creek"]);
    expect(listed.map((c) => c.place?.name)).toEqual([
      "Aït Bouguemez valley",
      "Calaveras Creek catchment",
    ]);
    expect(listed.map((c) => c.outlet?.name)).toEqual(["Catchment outlet", "Catchment outlet"]);
    expect(listed[1]?.question).toBe(
      "Is grazing changing the rangeland of the Calaveras Creek catchment?",
    );
  });

  it("starts a demo session on either place", async () => {
    for (const seedCaseId of ["case_aitbouguemez", "case_calaveras_creek"]) {
      const started = await startDemoSession(pool, {
        seedCaseId,
        seedOwnerScopeId: "seed",
        ttlSeconds: 3600,
        maxActiveSessions: 100,
        maxPerMinute: 1000,
      });
      expect(started.status).toBe("created");
    }
  });
});
