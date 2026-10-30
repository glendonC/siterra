import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GeoSelection } from "@siterra/contracts";
import { afterAll, describe, expect, it } from "vitest";
import {
  type ImportContext,
  importCatalog,
  periodBounds,
  sha256Multihash,
} from "./bundle-import.ts";

const catalogDir = fileURLToPath(new URL("../../../data/bundles/", import.meta.url));
const at = "2026-10-27T20:00:00Z";

type Json = { [key: string]: unknown };

function readJson(path: string): Json {
  return JSON.parse(readFileSync(path, "utf8")) as Json;
}

// Test scaffolding until the data/case/ seed lands: a GeoSelection whose polygon is read from the
// bundles' own frozen analysis geometry. Its descriptive fields are placeholders, not case data.
const geometryFile = readJson(
  join(catalogDir, "bundle_ndvi_departure_ait_bouguemez/analysis-geometry.geojson"),
);
const polygon = ((geometryFile["features"] as Json[])[0] as Json)[
  "geometry"
] as GeoSelection["geometry"];
const geoSelection: GeoSelection = {
  recordType: "GeoSelection",
  id: "geo_ait_bouguemez_catchment",
  revision: 1,
  createdAt: at,
  updatedAt: at,
  caseId: "case_example_import",
  label: "Test placeholder label",
  geometryStatus: "analysis_ready",
  geometry: polygon,
  crs: "EPSG:4326",
  boundaryRole: "hydrological_unit",
  boundarySourceIds: [],
  selectionMethod: "Test placeholder",
  areaM2: null,
  areaMethod: null,
  limitations: [],
};

const context: ImportContext = {
  catalogDir,
  caseId: "case_example_import",
  geoSelections: [geoSelection],
  sources: [],
  importedAt: at,
};

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function copyCatalog(): string {
  const dir = mkdtempSync(join(tmpdir(), "siterra-import-"));
  scratch.push(dir);
  cpSync(catalogDir, dir, { recursive: true });
  return dir;
}

describe("a catalog shared by several places", () => {
  function withOtherPlaceBundle(geoRevision: number): string {
    const dir = copyCatalog();
    const other = join(dir, "bundle_relief_other_place");
    cpSync(join(dir, "bundle_relief_ait_bouguemez"), other, { recursive: true });
    const collectionPath = join(other, "collection.json");
    const collection = readJson(collectionPath);
    collection["id"] = "bundle_relief_other_place";
    collection["siterra:geo_selection"] = {
      ...(collection["siterra:geo_selection"] as Json),
      id: "geo_other_place_catchment",
      revision: geoRevision,
    };
    writeFileSync(collectionPath, `${JSON.stringify(collection, null, 2)}\n`);
    const catalogPath = join(dir, "catalog.json");
    const catalog = readJson(catalogPath);
    const links = catalog["links"] as Json[];
    const template = links.find(
      (l) => l["rel"] === "child" && String(l["href"]).includes("bundle_relief_ait_bouguemez"),
    ) as Json;
    links.push({
      ...template,
      href: "./bundle_relief_other_place/collection.json",
      "file:checksum": sha256Multihash(readFileSync(collectionPath)),
    });
    writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
    return dir;
  }

  it("leaves out the bundles of another place's GeoSelection without an issue", () => {
    const result = importCatalog({ ...context, catalogDir: withOtherPlaceBundle(1) });
    expect(result.issues).toEqual([]);
    const ids = result.bundles.map((b) => b.dataBundle.id);
    expect(ids).toContain("bundle_relief_ait_bouguemez");
    expect(ids).not.toContain("bundle_relief_other_place");
  });

  it("imports the bundles of the case's own GeoSelection and one of the other place when that is the case's", () => {
    const own = importCatalog({
      ...context,
      catalogDir: withOtherPlaceBundle(1),
      geoSelections: [{ ...geoSelection, id: "geo_other_place_catchment" }],
    });
    expect(own.issues).toEqual([]);
    expect(own.bundles.map((b) => b.dataBundle.id)).toEqual(["bundle_relief_other_place"]);
  });

  it("still refuses a bundle that names this case's GeoSelection at another revision", () => {
    const result = importCatalog({
      ...context,
      catalogDir: copyCatalog(),
      geoSelections: [{ ...geoSelection, revision: 2 }],
    });
    expect(result.issues.map((i) => i.message)).toContain(
      "The case has no GeoSelection geo_ait_bouguemez_catchment revision 1",
    );
  });
});

describe("period bounds", () => {
  it("derive the month, its exclusive end and the inclusive STAC bounds", () => {
    expect(periodBounds("period_2024-02")).toEqual({
      startDate: "2024-02-01",
      endDateExclusive: "2024-03-01",
      stacStart: "2024-02-01T00:00:00Z",
      stacEnd: "2024-02-29T23:59:59Z",
    });
    expect(periodBounds("period_2022-12").endDateExclusive).toBe("2023-01-01");
  });
});

describe("SV-01 (import part): bundles import with verified checksums and values copied, never computed", () => {
  const result = importCatalog(context);

  it("imports every bundle of the catalog, the departure bundle with its stated missing reasons", () => {
    expect(result.issues).toEqual([]);
    const catalog = readJson(join(catalogDir, "catalog.json"));
    const children = (catalog["links"] as Json[]).filter((l) => l["rel"] === "child");
    expect(result.bundles).toHaveLength(children.length);
    // Revision 14 states a reason on the two excluded leave-one-year-out entries of available
    // periods (extension 1.1.0); the importer takes the entry's own reason.
    const departure = result.bundles.find(
      (b) => b.dataBundle.id === "bundle_ndvi_departure_ait_bouguemez",
    );
    for (const periodId of ["period_2019-03", "period_2020-03"]) {
      const item = readJson(
        join(catalogDir, "bundle_ndvi_departure_ait_bouguemez", periodId, `${periodId}.json`),
      );
      const props = item["properties"] as Json;
      expect(props["siterra:period_status"]).toBe("available");
      const entry = (props["siterra:measurements"] as Json[]).find(
        (m) => m["metric"] === "ndvi_departure_area_median_leave_one_year_out",
      );
      expect(entry?.["status"]).toBe("excluded");
      expect(typeof entry?.["missing_reason"]).toBe("string");
      const measurement = departure?.measurements.find(
        (m) =>
          m.periodId === periodId && m.metric === "ndvi_departure_area_median_leave_one_year_out",
      );
      expect([measurement?.value, measurement?.missingReason]).toEqual([
        null,
        entry?.["missing_reason"],
      ]);
    }
  });

  it("16: every measurement and observation cites its own bundle version; the bundle does not cite itself", () => {
    for (const bundle of result.bundles) {
      const own = { entityId: bundle.dataBundle.id, revision: 1 };
      for (const record of [...bundle.measurements, ...bundle.temporalObservations]) {
        expect(record.provenance.inputVersions).toContainEqual(own);
      }
      expect(bundle.dataBundle.provenance.inputVersions).not.toContainEqual(own);
    }
  });

  it("copies every measurement value, unit and count from its bundle entry", () => {
    let compared = 0;
    for (const bundle of result.bundles) {
      for (const m of bundle.measurements) {
        const month = m.periodId.slice("period_".length);
        const dir = join(catalogDir, bundle.dataBundle.id, `period_${month}`);
        const item = readJson(join(dir, `period_${month}.json`));
        const entries = (item["properties"] as Json)["siterra:measurements"] as Json[];
        const entry = entries.find((e) => e["metric"] === m.metric);
        expect(entry).toBeDefined();
        expect([m.value, m.unit, m.validPixelCount, m.totalPixelCount, m.status]).toEqual([
          entry?.["value"],
          entry?.["unit"],
          entry?.["valid_pixel_count"],
          entry?.["total_pixel_count"],
          entry?.["status"],
        ]);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(0);
  });

  it("keeps gaps as gaps: periods without a display raster have mapStatus missing and unavailable values are null", () => {
    for (const bundle of result.bundles) {
      for (const o of bundle.temporalObservations) {
        expect(o.mapStatus === "missing").toBe(o.mapAssetUri === null);
      }
      for (const m of bundle.measurements) {
        if (m.status !== "available") {
          expect(m.value).toBeNull();
          expect(m.missingReason).not.toBeNull();
        }
      }
    }
  });

  it("pins each bundle by the multihash of its collection.json and an origin-relative manifest path", () => {
    for (const bundle of result.bundles) {
      expect(bundle.dataBundle.contentHash).toMatch(/^1220[0-9a-f]{64}$/);
      expect(bundle.dataBundle.manifestUri).toBe(
        `/api/case-assets/${bundle.dataBundle.id}/${bundle.dataBundle.contentHash ?? ""}/collection.json`,
      );
      for (const o of bundle.temporalObservations) {
        if (o.mapAssetUri !== null) {
          expect(o.mapAssetUri.startsWith(`/api/case-assets/${bundle.dataBundle.id}/`)).toBe(true);
        }
      }
    }
  });
});

describe("the importer refuses a bundle it cannot verify", () => {
  it("refuses a period Item whose checksum does not match", () => {
    const dir = copyCatalog();
    const item = join(
      dir,
      "bundle_s2_ndvi_monthly_ait_bouguemez/period_2022-04/period_2022-04.json",
    );
    writeFileSync(item, `${readFileSync(item, "utf8")}\n`);
    const result = importCatalog({ ...context, catalogDir: dir });
    expect(
      result.issues.some(
        (i) =>
          i.bundleId === "bundle_s2_ndvi_monthly_ait_bouguemez" && i.message.includes("checksum"),
      ),
    ).toBe(true);
    expect(result.bundles.map((b) => b.dataBundle.id)).not.toContain(
      "bundle_s2_ndvi_monthly_ait_bouguemez",
    );
  });

  it("refuses every bundle when the case geometry differs from the frozen analysis geometry", () => {
    const moved = structuredClone(geoSelection);
    const ring = moved.geometry?.coordinates[0];
    if (ring?.[0] !== undefined) ring[0] = [ring[0][0] + 0.001, ring[0][1]];
    const result = importCatalog({ ...context, geoSelections: [moved] });
    expect(result.bundles).toEqual([]);
    expect(result.issues.some((i) => i.path.endsWith("analysis_geometry"))).toBe(true);
  });
});

/** Rewrites a JSON file and the checksums that pin it: its collection link and the catalog child link. */
function rewriteItem(
  dir: string,
  bundleId: string,
  periodId: string,
  change: (item: Json) => void,
): void {
  const itemPath = join(dir, bundleId, periodId, `${periodId}.json`);
  const item = readJson(itemPath);
  change(item);
  writeFileSync(itemPath, `${JSON.stringify(item, null, 2)}\n`);
  const collectionPath = join(dir, bundleId, "collection.json");
  const collection = readJson(collectionPath);
  for (const link of collection["links"] as Json[]) {
    if (link["rel"] === "item" && link["href"] === `./${periodId}/${periodId}.json`) {
      link["file:checksum"] = sha256Multihash(readFileSync(itemPath));
    }
  }
  writeFileSync(collectionPath, `${JSON.stringify(collection, null, 2)}\n`);
  const catalogPath = join(dir, "catalog.json");
  const catalog = readJson(catalogPath);
  for (const link of catalog["links"] as Json[]) {
    if (
      link["rel"] === "child" &&
      link["href"] === `./${bundleId}/collection.json` &&
      "file:checksum" in link
    ) {
      link["file:checksum"] = sha256Multihash(readFileSync(collectionPath));
    }
  }
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
}

describe("STAC extension 1.1.0: a measurement entry states its own missing reason", () => {
  it("imports the departure bundle once its excluded entries state a reason, and keeps that reason", () => {
    const dir = copyCatalog();
    const bundleId = "bundle_ndvi_departure_ait_bouguemez";
    for (const periodId of ["period_2019-03", "period_2020-03"]) {
      rewriteItem(dir, bundleId, periodId, (item) => {
        item["stac_extensions"] = (item["stac_extensions"] as string[]).map((u) =>
          u.replace("/1.0.0/", "/1.1.0/"),
        );
        for (const entry of (item["properties"] as Json)["siterra:measurements"] as Json[]) {
          if (entry["status"] !== "available")
            entry["missing_reason"] = "Test reason, not bundle data";
        }
      });
    }
    const result = importCatalog({ ...context, catalogDir: dir });
    // A revised departure bundle also changes what bundle_aligned_antecedent pins in its
    // derived_from link, so that bundle is refused until it is re-pinned with the revision.
    expect(result.issues.map((i) => [i.bundleId, i.message])).toEqual([
      [
        "bundle_aligned_antecedent_ait_bouguemez",
        "file:checksum does not match ../bundle_ndvi_departure_ait_bouguemez/collection.json",
      ],
    ]);
    const departure = result.bundles.find((b) => b.dataBundle.id === bundleId);
    const excluded = departure?.measurements.filter((m) => m.status !== "available") ?? [];
    expect(excluded.map((m) => [m.periodId, m.missingReason])).toEqual(
      expect.arrayContaining([
        ["period_2019-03", "Test reason, not bundle data"],
        ["period_2020-03", "Test reason, not bundle data"],
      ]),
    );
  });

  it("refuses a bundle whose catalog checksum no longer matches its collection", () => {
    const dir = copyCatalog();
    const collectionPath = join(dir, "bundle_terrain_strata_ait_bouguemez/collection.json");
    writeFileSync(collectionPath, `${readFileSync(collectionPath, "utf8")}\n`);
    const result = importCatalog({ ...context, catalogDir: dir });
    expect(result.bundles.map((b) => b.dataBundle.id)).not.toContain(
      "bundle_terrain_strata_ait_bouguemez",
    );
    expect(result.issues).toContainEqual({
      bundleId: "bundle_terrain_strata_ait_bouguemez",
      path: "catalog.json/links",
      message: "file:checksum does not match ./bundle_terrain_strata_ait_bouguemez/collection.json",
    });
  });
});

describe("19b: asset URIs are paths on the application origin", () => {
  it("writes a period's overview asset as /api/case-assets/<bundle>/<content hash>/<period>/<file>", () => {
    const dir = copyCatalog();
    const bundleId = "bundle_chirps_monthly_ait_bouguemez";
    const overviewBytes = Buffer.from("Test overview bytes, not a raster");
    writeFileSync(join(dir, bundleId, "period_2022-04/overview.webp"), overviewBytes);
    rewriteItem(dir, bundleId, "period_2022-04", (item) => {
      (item["assets"] as Json)["overview"] = {
        href: "./overview.webp",
        type: "image/webp",
        title: "Test overview, not bundle data",
        roles: ["overview"],
        "siterra:color_scale": "rain-sequential",
        "siterra:domain": [0, 100],
        "file:checksum": sha256Multihash(overviewBytes),
      };
    });
    const result = importCatalog({ ...context, catalogDir: dir });
    const chirps = result.bundles.find((b) => b.dataBundle.id === bundleId);
    const hash = sha256Multihash(readFileSync(join(dir, bundleId, "collection.json")));
    expect(chirps?.dataBundle.contentHash).toBe(hash);
    const period = chirps?.temporalObservations.find((o) => o.periodId === "period_2022-04");
    expect([period?.mapAssetUri, period?.mapStatus]).toEqual([
      `/api/case-assets/${bundleId}/${hash}/period_2022-04/overview.webp`,
      "available",
    ]);
  });
});
