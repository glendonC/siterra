import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import seed from "../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json";
import { daylight, ndviDeparture } from "../theme/daylight";
import {
  departureBinding,
  departureLegend,
  legendLines,
  parseDepartureManifest,
} from "./departure";

const BUNDLE = "bundle_ndvi_departure_ait_bouguemez";
const parsed = CaseSnapshot.parse(seed);
// Fixture: the seed with no map on any period, whichever bundle revision the seed file was built from
const snapshot: CaseSnapshot = {
  ...parsed,
  records: {
    ...parsed.records,
    temporalObservationRecords: parsed.records.temporalObservationRecords.map((o) => ({
      ...o,
      mapAssetUri: null,
      mapAssetHash: null,
      mapStatus: "missing" as const,
    })),
  },
};
const bundle = snapshot.records.dataBundleRecords.find((b) => b.id === BUNDLE);
const HASH = bundle?.contentHash ?? "";
const uri = (period: string, hash = HASH) =>
  `/api/case-assets/${BUNDLE}/${hash}/period_${period}/overview.webp`;

// Fixture: the seed as the importer reads a bundle whose Items carry an overview (mapStatus available).
// The seed's own bundle revision has none, so its map fields are set here; the numbers stay the seed's.
function withMaps(periods: string[], hash = HASH): CaseSnapshot {
  return {
    ...snapshot,
    records: {
      ...snapshot.records,
      temporalObservationRecords: snapshot.records.temporalObservationRecords.map((o) =>
        o.dataBundleId === BUNDLE && periods.includes(o.periodId.slice(7))
          ? {
              ...o,
              mapAssetUri: uri(o.periodId.slice(7), hash),
              mapAssetHash: `1220${"ab".repeat(32)}`,
              mapStatus: "available" as const,
            }
          : o,
      ),
    },
  };
}

describe("departureBinding", () => {
  it("binds the latest period with a map and an available leave-one-year-out value to its records", () => {
    const b = departureBinding(withMaps(["2022-04", "2025-11", "2019-03"]));
    expect(b).toEqual({
      periodId: "period_2025-11",
      observation: {
        id: "obs_ndvi_departure_ait_bouguemez_2025-11",
        revision: 1,
        qualityFlags: ["reduced_qa_fallback", "snow_suspected"],
      },
      measurement: {
        id: "meas_ndvi_departure_ait_bouguemez_2025-11_ndvi_departure_area_median_leave_one_year_out",
        revision: 1,
        validFraction: 0.9301,
        spatialResolutionM: 10,
      },
      bundle: {
        id: BUNDLE,
        revision: 1,
        contentHash: HASH,
        manifestUri: `/api/case-assets/${BUNDLE}/${HASH}/collection.json`,
        methodId: "monthly_departure",
        methodVersion: "1.0.0",
      },
      imageUri: uri("2025-11"),
      imageHash: `1220${"ab".repeat(32)}`,
    });
  });

  it("draws nothing when no period has a map: a gap stays a gap", () => {
    expect(departureBinding(snapshot)).toBeUndefined();
  });

  it("skips a period whose leave-one-year-out value is not available", () => {
    // 2019-03: the all-years value is available, the leave-one-year-out one excluded
    expect(departureBinding(withMaps(["2019-03"]))).toBeUndefined();
  });

  it("never draws a map from another bundle revision than the record's", () => {
    expect(departureBinding(withMaps(["2025-11"], `1220${"cd".repeat(32)}`))).toBeUndefined();
  });

  it("draws nothing from a bundle that is not validated", () => {
    const s = withMaps(["2025-11"]);
    const failed = {
      ...s,
      records: {
        ...s.records,
        dataBundleRecords: s.records.dataBundleRecords.map((b) =>
          b.id === BUNDLE ? { ...b, status: "failed" as const } : b,
        ),
      },
    };
    expect(departureBinding(failed)).toBeUndefined();
  });
});

const manifest = {
  type: "Collection",
  id: BUNDLE,
  assets: {
    excluded_land: {
      href: "./excluded-land.geojson",
      type: "application/geo+json",
      roles: ["data"],
      "file:checksum": `1220${"ef".repeat(32)}`,
    },
  },
  item_assets: {
    overview: {
      type: "image/webp",
      roles: ["overview"],
      "proj:code": "EPSG:3857",
      "proj:bbox": [-728220.0, 3697080.0, -683700.0, 3731430.0],
      "proj:shape": [1145, 1484],
      "siterra:color_scale": "ndvi-anomaly-diverging",
      "siterra:domain": [-0.1, 0.1],
    },
  },
};
const manifestUri = `/api/case-assets/${BUNDLE}/${HASH}/collection.json`;

describe("parseDepartureManifest", () => {
  it("places the picture by its Web Mercator box and finds the cropland layer beside the manifest", () => {
    const m = parseDepartureManifest(manifest, manifestUri);
    const [tl, tr, br, bl] = m.corners;
    expect(tl[0]).toBeCloseTo(-6.541712, 6);
    expect(tl[1]).toBeCloseTo(31.756808, 6);
    expect(br[0]).toBeCloseTo(-6.141782, 6);
    expect(br[1]).toBeCloseTo(31.494061, 6);
    expect(tr).toEqual([br[0], tl[1]]);
    expect(bl).toEqual([tl[0], br[1]]);
    expect(m.domain).toEqual([-0.1, 0.1]);
    expect(m.excludedUri).toBe(`/api/case-assets/${BUNDLE}/${HASH}/excluded-land.geojson`);
  });

  it("measures a display cell on the ground: 30 m Web Mercator cells are about 25.5 m at the valley's latitude", () => {
    const m = parseDepartureManifest(manifest, manifestUri);
    // 44,520 m / 1,484 cells = 30 m on the projection; times cos(31.6256 degrees), the box's middle
    expect(m.cellM).toBeCloseTo(25.545, 2);
  });

  it("refuses a picture on another grid or another colour scale", () => {
    const other = (over: Record<string, unknown>) => ({
      ...manifest,
      item_assets: { overview: { ...manifest.item_assets.overview, ...over } },
    });
    expect(() =>
      parseDepartureManifest(other({ "proj:code": "EPSG:32629" }), manifestUri),
    ).toThrow();
    expect(() =>
      parseDepartureManifest(other({ "siterra:color_scale": "ndvi" }), manifestUri),
    ).toThrow();
    expect(() => parseDepartureManifest({ ...manifest, item_assets: {} }, manifestUri)).toThrow();
  });

  it("leaves the hatch out when the manifest lists no checked cropland layer", () => {
    const m = parseDepartureManifest({ ...manifest, assets: {} }, manifestUri);
    expect(m.excludedUri).toBeUndefined();
  });
});

describe("departureLegend", () => {
  const b = departureBinding(withMaps(["2025-11"]));
  if (!b) throw new Error("fixture");

  it("says what the map shows in the legend's words, from the records", () => {
    expect(departureLegend(b, [-0.1, 0.1], true, 25.545)).toEqual({
      title: "NDVI departure, Nov 2025, compared with other Novembers",
      subtitle:
        "Difference from the median of the other Novembers, 2019 to 2025, inside the catchment",
      low: "\u22120.10",
      high: "+0.10",
      coverage: "93% of area observed",
      flags: "Nov 2025 views: snow suspected; cloud screening reduced.",
      flagsNote: "Cloud screening used the scene classification only.",
      excluded:
        "Hatched: cropland and buildings mapped by ESA WorldCover in 2021, left out of the field-sampling strata. Their departure is still drawn.",
      note: "No cropland mask is applied: valley-floor fields and orchards are included.",
      method:
        "Sentinel-2 L2A, monthly median NDVI, cloud and snow masked. Method monthly_departure 1.0.0.",
      cells:
        "Drawn in cells of about 25.5 m, averaged from the 10 m analysis grid. The measurements use the 10 m cells.",
    });
  });

  it("names the period's quality flags from its record, never from a fixed list", () => {
    const flagged = (qualityFlags: string[]) => ({
      ...b,
      observation: { ...b.observation, qualityFlags },
    });
    const few = departureLegend(flagged(["low_scene_count"]), [-0.1, 0.1], true, 25.545);
    expect(few.flags).toBe("Nov 2025 views: few satellite dates.");
    expect(few.flagsNote).toBeUndefined();
    expect(legendLines(few)).toContain(few.flags);
    const clean = departureLegend(flagged([]), [-0.1, 0.1], true, 25.545);
    expect(clean.flags).toBeUndefined();
    expect(legendLines(clean)).not.toContain(undefined);
    // a flag this build has no words for is still shown, by its name, never dropped
    expect(departureLegend(flagged(["new_flag"]), [-0.1, 0.1], true, 25.545).flags).toBe(
      "Nov 2025 views: new_flag.",
    );
  });

  it("states the display cell size, not the analysis grid's, as the size it draws (SC-04)", () => {
    const l = departureLegend(b, [-0.1, 0.1], true, 25.545);
    expect(legendLines(l)).toContain(l.cells);
    const unknown = { ...b, measurement: { ...b.measurement, spatialResolutionM: null } };
    expect(departureLegend(unknown, [-0.1, 0.1], true, 25.545).cells).toBe(
      "Drawn in cells of about 25.5 m.",
    );
  });

  it("says the hatch marks an excluded stratum, not masked values, as the bundle does", () => {
    const collection = JSON.parse(
      readFileSync(
        join(import.meta.dirname, "../../../../data/bundles", BUNDLE, "collection.json"),
        "utf8",
      ),
    ) as { assets: { excluded_land: { description: string } } };
    expect(collection.assets.excluded_land.description).toContain(
      "no departure value is masked by it",
    );
    const l = departureLegend(b, [-0.1, 0.1], true, 25.545);
    expect(l.excluded).not.toMatch(/mask/i);
    expect(l.excluded).toContain("left out of the field-sampling strata");
    expect(l.excluded).toContain("still drawn");
    expect(l.note).toBe(
      "No cropland mask is applied: valley-floor fields and orchards are included.",
    );
  });

  it("names no hatch when none is drawn", () => {
    expect(departureLegend(b, [-0.1, 0.1], false, 25.545).excluded).toBeUndefined();
  });
});

describe("departure colours", () => {
  it("are the generated light-theme tokens", () => {
    const tokens = JSON.parse(
      readFileSync(
        join(import.meta.dirname, "../../../../design/tokens/siterra.tokens.json"),
        "utf8",
      ),
    ) as {
      theme: { light: { data: Record<string, Record<string, { $value: { hex: string } }>> } };
    };
    const data = tokens.theme.light.data;
    const ramp = data["ndvi-departure"] ?? {};
    expect(ndviDeparture).toEqual({
      below3: ramp["below-3"]?.$value.hex,
      below2: ramp["below-2"]?.$value.hex,
      below1: ramp["below-1"]?.$value.hex,
      reference: ramp.reference?.$value.hex,
      above1: ramp["above-1"]?.$value.hex,
      above2: ramp["above-2"]?.$value.hex,
      above3: ramp["above-3"]?.$value.hex,
    });
    expect(daylight.excludedHatch).toBe(
      (data["excluded-hatch"] as unknown as { $value: { hex: string } }).$value.hex,
    );
  });
});
