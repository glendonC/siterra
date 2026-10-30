import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { type ImportedBundle, sha256Multihash } from "./bundle-import.ts";
import { readCaseSeed } from "./case-seed.ts";
import { readContextLines } from "./context-line-loader.ts";

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const read = (bundleId: string, file: string) =>
  JSON.parse(readFileSync(`${repoDir}data/bundles/${bundleId}/${file}`, "utf8")) as {
    features: {
      properties: Record<string, unknown>;
      geometry: { coordinates: number[][] };
    }[];
  };
const { seed, issues } = readCaseSeed({
  repoDir,
  mode: "concept",
  ownerScopeId: "seed",
  importedAt: "2026-10-27T20:00:00Z",
});
const features = seed?.contextFeatures ?? [];

describe("context lines of the case: drainage per Strahler order", () => {
  const asset = read("bundle_drainage_network_ait_bouguemez", "drainage-lines.geojson");
  const drainage = features.filter((f) => f.role === "drainage");

  it("load without an issue", () => {
    expect(issues).toEqual([]);
  });

  it("make one feature per order the asset holds, in order", () => {
    const orders = [...new Set(asset.features.map((f) => Number(f.properties["strahler_order"])))];
    expect(drainage.map((f) => f.streamOrder)).toEqual(orders.sort((a, b) => a - b));
    expect(drainage.map((f) => f.id)).toEqual(orders.map((o) => `ctx_drainage_order_${o}`));
  });

  it("copy every segment of the order, in the asset's order, vertex for vertex with its height", () => {
    for (const feature of drainage) {
      const expected = asset.features
        .filter((f) => Number(f.properties["strahler_order"]) === feature.streamOrder)
        .map((f) => f.geometry.coordinates);
      expect(feature.geometry.type).toBe("MultiLineString");
      expect(feature.geometry.coordinates).toEqual(expected);
    }
    const vertices = drainage.reduce(
      (n, f) => n + (f.geometry.coordinates as unknown[][]).reduce((m, line) => m + line.length, 0),
      0,
    );
    expect(vertices).toBe(asset.features.reduce((n, f) => n + f.geometry.coordinates.length, 0));
  });

  it("name the asset the lines were read from", () => {
    for (const feature of drainage) {
      expect(feature.dataBundle).toEqual({
        bundleId: "bundle_drainage_network_ait_bouguemez",
        assetKey: "drainage_lines",
      });
    }
  });
});

describe("context lines of the case: transects", () => {
  const asset = read("bundle_transects_ait_bouguemez", "transect-lines.geojson");
  const transects = features.filter((f) => f.role === "transect");

  it("make one feature per line, named by the asset's own transect id, never by the display name", () => {
    expect(transects.map((f) => f.dataBundle?.member)).toEqual(
      asset.features.map((f) => f.properties["transect_id"]),
    );
    expect(transects.map((f) => f.id)).toEqual(
      asset.features.map((f) => `ctx_transect_${String(f.properties["transect_id"])}`),
    );
    for (const [i, feature] of transects.entries()) {
      expect(feature.dataBundle?.member).not.toBe(feature.name);
      expect(feature.name).toBe(asset.features[i]?.properties["label"]);
      expect(feature.dataBundle?.assetKey).toBe("transect_lines");
    }
  });

  it("copy the line with its heights", () => {
    for (const [i, feature] of transects.entries()) {
      expect(feature.geometry).toEqual({
        type: "LineString",
        coordinates: asset.features[i]?.geometry.coordinates,
      });
    }
  });

  it("leave the points of context-features.json as they were", () => {
    expect(
      features
        .filter((f) => f.geometry.type === "Point")
        .map((f) => f.id)
        .sort(),
    ).toEqual(["ctx_ait_ouchi_locator", "ctx_catchment_outlet", "ctx_tabant"]);
  });
});

describe("context lines of the case: proposed routes", () => {
  const asset = read("bundle_proposed_routes_ait_bouguemez", "proposed-routes.geojson");
  const result = JSON.parse(
    readFileSync(
      `${repoDir}data/bundles/bundle_proposed_routes_ait_bouguemez/proposed-routes.json`,
      "utf8",
    ),
  ) as { sites: { id: string; rule: string }[] };
  const routes = features.filter((f) => f.role === "route_proposed");

  it("make one feature per route line, in the asset's order, with its vertices and heights", () => {
    const ids = asset.features.map((f) => String(f.properties["route_id"]));
    expect(routes.map((f) => f.id)).toEqual(ids.map((id) => `ctx_${id}`));
    asset.features.forEach((f, i) => {
      expect(routes[i]?.geometry).toEqual({
        type: "LineString",
        coordinates: f.geometry.coordinates,
      });
      expect(routes[i]?.dataBundle).toEqual({
        bundleId: "bundle_proposed_routes_ait_bouguemez",
        assetKey: "route_lines",
        member: f.properties["route_id"],
      });
    });
  });

  it("say they are proposed with access unconfirmed (CF-04) and name the rule that chose the site", () => {
    for (const [i, feature] of routes.entries()) {
      const site = result.sites.find((s) => s.id === asset.features[i]?.properties["target_id"]);
      expect(site).toBeDefined();
      expect(feature.limitations.some((l) => /proposed route, access unconfirmed/i.test(l))).toBe(
        true,
      );
      expect(feature.limitations.at(-1)).toContain(
        `a candidate site chosen by a stated rule: ${site?.rule ?? ""}`,
      );
      expect(feature.name).toContain("candidate site chosen by a stated rule");
      expect(feature.method).toContain("not a surveyed path");
    }
  });
});

describe("readContextLines: what it refuses", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  function bundleWith(methodId: string, assetKey: string, asset: object | null) {
    const dir = mkdtempSync(join(tmpdir(), "siterra-lines-"));
    dirs.push(dir);
    const bundleId = `bundle_example_${methodId}`;
    mkdirSync(join(dir, bundleId));
    const assets: Record<string, unknown> = {};
    if (asset !== null) {
      const bytes = Buffer.from(JSON.stringify(asset));
      writeFileSync(join(dir, bundleId, "lines.json"), bytes);
      assets[assetKey] = { href: "./lines.json", "file:checksum": sha256Multihash(bytes) };
    }
    const collection = Buffer.from(JSON.stringify({ assets, links: [] }));
    writeFileSync(join(dir, bundleId, "collection.json"), collection);
    const bundle = {
      dataBundle: {
        id: bundleId,
        methodId,
        contentHash: sha256Multihash(collection),
        datasetId: null,
        sourceIds: [],
        attribution: "Example",
        license: "Example licence",
        provenance: { limitations: ["Example limitation."] },
      },
    } as unknown as ImportedBundle;
    return { dir, bundle };
  }
  const line = (properties: unknown) => ({
    type: "Feature",
    properties,
    geometry: {
      type: "LineString",
      coordinates: [
        [-6.5, 31.6, 1500],
        [-6.4, 31.7, 1600],
      ],
    },
  });
  const run = (dir: string, bundle: ImportedBundle) =>
    readContextLines({
      bundlesDir: dir,
      bundles: [bundle],
      caseId: "case_example_atlas",
      importedAt: "2026-10-29T12:00:00Z",
    });

  it("reads a well-formed drainage asset into one feature per order", () => {
    const { dir, bundle } = bundleWith("drainage_network", "drainage_lines", {
      type: "FeatureCollection",
      features: [
        line({ segment_id: "seg_001", strahler_order: 2 }),
        line({ segment_id: "seg_002", strahler_order: 1 }),
        line({ segment_id: "seg_003", strahler_order: 1 }),
      ],
    });
    const result = run(dir, bundle);
    expect(result.issues).toEqual([]);
    expect(result.features.map((f) => [f.id, f.streamOrder])).toEqual([
      ["ctx_drainage_order_1", 1],
      ["ctx_drainage_order_2", 2],
    ]);
    expect((result.features[0]?.geometry.coordinates as unknown[]).length).toBe(2);
  });

  it("refuses a missing asset, a segment without a valid order and a transect without an id", () => {
    const missing = bundleWith("drainage_network", "drainage_lines", null);
    expect(run(missing.dir, missing.bundle).issues[0]?.message).toContain("asset_key_unknown");
    const badOrder = bundleWith("drainage_network", "drainage_lines", {
      type: "FeatureCollection",
      features: [line({ segment_id: "seg_001", strahler_order: 0 })],
    });
    const badOrderResult = run(badOrder.dir, badOrder.bundle);
    expect(badOrderResult.features).toEqual([]);
    expect(badOrderResult.issues[0]?.message).toContain("expected GeoJSON lines");
    const noId = bundleWith("terrain_transects", "transect_lines", {
      type: "FeatureCollection",
      features: [line({ label: "A line" })],
    });
    expect(run(noId.dir, noId.bundle).features).toEqual([]);
  });

  it("refuses a height outside the range a view can trust", () => {
    const nodata = bundleWith("terrain_transects", "transect_lines", {
      type: "FeatureCollection",
      features: [
        {
          ...line({ transect_id: "t1", label: "A line" }),
          geometry: {
            type: "LineString",
            coordinates: [
              [-6.5, 31.6, -9999],
              [-6.4, 31.7, 1600],
            ],
          },
        },
      ],
    });
    const result = run(nodata.dir, nodata.bundle);
    expect(result.features).toEqual([]);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  function routesBundle(args: { limitations: string[]; targetId: string }) {
    const dir = mkdtempSync(join(tmpdir(), "siterra-routes-"));
    dirs.push(dir);
    const bundleId = "bundle_example_proposed_routes";
    mkdirSync(join(dir, bundleId));
    const write = (name: string, value: object) => {
      const bytes = Buffer.from(JSON.stringify(value));
      writeFileSync(join(dir, bundleId, name), bytes);
      return { href: `./${name}`, "file:checksum": sha256Multihash(bytes) };
    };
    const assets = {
      route_lines: write("lines.json", {
        type: "FeatureCollection",
        features: [line({ route_id: "route_a", target_id: args.targetId })],
      }),
      proposed_routes: write("result.json", {
        sites: [{ id: "site_a", kind: "band", band: 1, rule: "a stated rule" }],
      }),
    };
    const collection = Buffer.from(JSON.stringify({ assets, links: [] }));
    writeFileSync(join(dir, bundleId, "collection.json"), collection);
    const bundle = {
      dataBundle: {
        id: bundleId,
        methodId: "proposed_routes",
        contentHash: sha256Multihash(collection),
        datasetId: null,
        sourceIds: [],
        attribution: "Example",
        license: "Example licence",
        provenance: { limitations: args.limitations },
      },
    } as unknown as ImportedBundle;
    return { dir, bundle };
  }

  it("refuses a route whose bundle does not say proposed with access unconfirmed (CF-04)", () => {
    const silent = routesBundle({ limitations: ["Example limitation."], targetId: "site_a" });
    const refused = run(silent.dir, silent.bundle);
    expect(refused.features).toEqual([]);
    expect(refused.issues.map((i) => i.path)).toContain("context-lines/route_lines/limitations");
    const honest = routesBundle({
      limitations: ["Proposed route, access unconfirmed: not a surveyed path."],
      targetId: "site_a",
    });
    const accepted = run(honest.dir, honest.bundle);
    expect(accepted.issues).toEqual([]);
    expect(accepted.features.map((f) => f.id)).toEqual(["ctx_route_a"]);
  });

  it("refuses a route that ends at a site the bundle does not list", () => {
    const lost = routesBundle({
      limitations: ["Proposed route, access unconfirmed."],
      targetId: "site_missing",
    });
    const result = run(lost.dir, lost.bundle);
    expect(result.features).toEqual([]);
    expect(result.issues[0]?.message).toContain("lists no site");
  });

  it("refuses a bundle with no content hash", () => {
    const { dir, bundle } = bundleWith("drainage_network", "drainage_lines", null);
    const unhashed = {
      ...bundle,
      dataBundle: { ...bundle.dataBundle, contentHash: null },
    } as ImportedBundle;
    expect(run(dir, unhashed).issues[0]?.message).toContain("no content hash");
  });

  it("ignores a bundle of another method", () => {
    const { dir, bundle } = bundleWith("restrend_long_record", "restrend_long_record", null);
    expect(run(dir, bundle)).toEqual({ features: [], issues: [] });
  });
});
