import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sha256Multihash } from "./bundle-import.ts";
import { findBundlesDir, resolveCaseAsset } from "./case-assets.ts";

const bundlesDir = fileURLToPath(new URL("../../../data/bundles/", import.meta.url));
const bundleId = "bundle_chirps_monthly_ait_bouguemez";
const contentHash = sha256Multihash(readFileSync(`${bundlesDir}${bundleId}/collection.json`));
const at = (assetPath: string, hash = contentHash) =>
  resolveCaseAsset(bundlesDir, { bundleId, contentHash: hash, assetPath });

describe("case assets: only files the bundle manifest lists, each matching its checksum", () => {
  it("serves the rainfall cells, a period Item and its cell values, and the manifest itself", () => {
    expect(at("rainfall-cells.geojson")?.contentType).toBe("application/geo+json");
    expect(at("period_2022-04/period_2022-04.json")?.size).toBeGreaterThan(0);
    expect(at("period_2022-04/cell-values.json")?.contentType).toBe("application/json");
    expect(at("collection.json")?.checksum).toBe(contentHash);
  });

  it("refuses a stale content hash, an unlisted file, a path out of the bundle and another bundle ID shape", () => {
    expect(at("rainfall-cells.geojson", `1220${"0".repeat(64)}`)).toBeNull();
    expect(at("uv-missing.lock")).toBeNull();
    expect(at("../catalog.json")).toBeNull();
    expect(
      at("period_2022-04/../../bundle_s2_ndvi_monthly_ait_bouguemez/collection.json"),
    ).toBeNull();
    expect(
      resolveCaseAsset(bundlesDir, {
        bundleId: "../data",
        contentHash,
        assetPath: "collection.json",
      }),
    ).toBeNull();
  });

  it("finds data/bundles upward from a folder of the repository", () => {
    expect(findBundlesDir(fileURLToPath(new URL(".", import.meta.url)))).toBe(
      bundlesDir.replace(/\/$/, ""),
    );
  });
});
